// SimpleChat Version 2
// Setup: copy config.js.example -> config.js, add your Supabase keys,
// then run supabase_v2.sql (after the original supabase.sql).

if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
  alert("Supabase is not configured. Copy config.js.example to config.js and add your project values.");
}

const { createClient } = window.supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentUser = null, myProfile = null;
let chats = [];            // sidebar list, newest first
let activeId = null;       // active conversation id
let messages = [];         // messages of the active conversation
let inbox = null;          // realtime channel for all my messages
let unseenBelow = 0;       // new messages while scrolled up
let callChannel = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let incomingOffer = null;
let queuedIceCandidates = [];

/* ---------- helpers ---------- */
function showToast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (error ? " error" : "");
  setTimeout(() => el.className = "toast", 2600);
}
function setAuthMessage(message, error = true) {
  $("authMessage").textContent = message || "";
  $("authMessage").style.color = error ? "var(--danger)" : "var(--primary)";
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
}
function hue(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function avatarHtml(name, seed, cls = "") {
  return `<div class="avatar ${cls}" style="--h:${hue(seed || name)}">${escapeHtml(initials(name))}</div>`;
}
function setAvatar(el, name, seed) {
  el.textContent = initials(name);
  el.style.setProperty("--h", hue(seed || name));
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
const timeFmt = { hour: "2-digit", minute: "2-digit" };
function formatTime(ts) { return new Date(ts).toLocaleTimeString([], timeFmt); }
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dayLabel(ts) {
  const diff = Math.round((dayStart(new Date()) - dayStart(new Date(ts))) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}
function listTime(ts) {
  if (!ts) return "";
  const diff = Math.round((dayStart(new Date()) - dayStart(new Date(ts))) / 864e5);
  if (diff === 0) return formatTime(ts);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return new Date(ts).toLocaleDateString([], { weekday: "short" });
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}
function updateTitle() {
  const n = chats.reduce((s, c) => s + c.unread, 0);
  document.title = (n ? `(${n}) ` : "") + "SimpleChat";
}

/* ---------- PWA + browser notifications ---------- */
let installPromptEvent = null;
let serviceWorkerRegistration = null;

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js")
      .then(reg => { serviceWorkerRegistration = reg; })
      .catch(err => console.warn("Service worker registration failed", err));
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPromptEvent = event;
    $("installAppBtn").classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    installPromptEvent = null;
    $("installAppBtn").classList.add("hidden");
    showToast("SimpleChat installed.");
  });
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    $("installAppBtn").classList.add("hidden");
  }
  if ("Notification" in window && Notification.permission === "default") {
    // Keep permission opt-in: ask only when the user presses the bell.
  }
  updateNotificationButton();
}

function updateNotificationButton() {
  const btn = $("enableNotificationsBtn");
  if (!btn) return;
  if (!("Notification" in window)) {
    btn.title = "Notifications are not supported by this browser";
    btn.setAttribute("aria-label", btn.title);
    btn.disabled = true;
    return;
  }
  const enabled = Notification.permission === "granted";
  btn.classList.toggle("permission-granted", enabled);
  // Keep SVG icons instead of emoji for a consistent premium UI
  btn.innerHTML = enabled
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  btn.title = enabled ? "Notifications enabled" : "Enable notifications";
  btn.setAttribute("aria-label", btn.title);
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("This browser does not support notifications.", true);
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    updateNotificationButton();
    if (permission === "granted") {
      showToast("Notifications enabled on this device.");
      if (serviceWorkerRegistration) {
        serviceWorkerRegistration.showNotification("SimpleChat notifications enabled", {
          body: "You can receive alerts while SimpleChat is open in the background.",
          icon: "icons/icon-192.svg",
          badge: "icons/icon-192.svg",
          tag: "simplechat-ready"
        }).catch(() => {});
      }
    } else {
      showToast("Notifications are blocked. Allow them in browser settings.", true);
    }
  } catch (err) {
    console.error(err);
    showToast("Could not enable notifications.", true);
  }
}

async function installApp() {
  if (!installPromptEvent) {
    showToast("Use your browser menu and choose Install app or Add to Home Screen.");
    return;
  }
  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  $("installAppBtn").classList.add("hidden");
}

function notifyUser(title, body, conversationId) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden && document.hasFocus()) return;
  const options = {
    body,
    icon: "icons/icon-192.svg",
    badge: "icons/icon-192.svg",
    tag: "simplechat-" + (conversationId || "message"),
    data: { url: window.location.href, conversationId }
  };
  if (serviceWorkerRegistration?.showNotification) {
    serviceWorkerRegistration.showNotification(title, options).catch(() => {
      try { new Notification(title, options); } catch (_) {}
    });
  } else {
    try { new Notification(title, options); } catch (_) {}
  }
}

/* ---------- auth ---------- */
async function withBusy(e, fn) {
  const btn = e.submitter;
  if (btn) { btn.disabled = true; btn.classList.add("loading"); }
  try { await fn(e); }
  finally { if (btn) { btn.disabled = false; btn.classList.remove("loading"); } }
}

function switchAuth(mode) {
  const login = mode === "login";
  $("authTitle").textContent = login ? "Welcome back" : "Create your account";
  $("authSub").textContent = login ? "Log in to continue your conversations." : "It only takes a minute.";
  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);
  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);
  setAuthMessage("");
}

async function boot() {
  $("loginTab").onclick = () => switchAuth("login");
  $("signupTab").onclick = () => switchAuth("signup");
  $("loginForm").addEventListener("submit", (e) => withBusy(e, login));
  $("signupForm").addEventListener("submit", (e) => withBusy(e, signup));
  $("googleLoginBtn").onclick = signInWithGoogle;
  document.querySelectorAll(".pw-toggle").forEach(b => b.onclick = () => {
    const i = $(b.dataset.for), show = i.type === "password";
    i.type = show ? "text" : "password";
    b.textContent = show ? "Hide" : "Show";
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  $("logoutBtn").onclick = () => db.auth.signOut();
  $("enableNotificationsBtn").onclick = enableNotifications;
  $("installAppBtn").onclick = installApp;
  setupPWA();
  updateNotificationButton();
  $("profileBtn").onclick = openProfile;
  $("saveProfileBtn").onclick = saveProfile;
  $("profileAvatarInput").onchange = previewAvatar;
  $("newChatBtn").onclick = openNewChat;
  $("welcomeNewChat").onclick = openNewChat;
  $("mobileBackBtn").onclick = closeConversation;
  $("messageForm").addEventListener("submit", sendMessage);
  $("userSearch").addEventListener("input", searchUsers);
  $("chatFilter").addEventListener("input", renderChatList);
  $("scrollDownBtn").onclick = () => scrollToBottom(true);
  $("messages").addEventListener("scroll", onScroll);
  $("videoCallBtn").onclick = startVideoCall;
  $("acceptCallBtn").onclick = acceptIncomingCall;
  $("declineCallBtn").onclick = declineIncomingCall;
  $("endCallBtn").onclick = () => endVideoCall(true);
  $("callCloseBtn").onclick = () => {
    if (currentCall) endVideoCall(true);
    else $("callDialog").close();
  };
  $("muteCallBtn").onclick = toggleCallMute;
  $("cameraCallBtn").onclick = toggleCallCamera;

  const input = $("messageInput");
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("messageForm").requestSubmit();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) markActiveRead();
  });

  const { data } = await db.auth.getSession();
  if (data.session) await enterApp(data.session.user);

  db.auth.onAuthStateChange(async (event, session) => {
    if (session) await enterApp(session.user);
    else leaveApp();
  });
}

async function signInWithGoogle() {
  setAuthMessage("");
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
  if (error) setAuthMessage(error.message);
}

async function signup(e) {
  e.preventDefault();
  setAuthMessage("");
  const username = $("signupUsername").value.trim().toLowerCase();
  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;
  let displayName = $("signupDisplayName").value.trim();
  if (!displayName || displayName === password) displayName = username; // guards against browser autofill

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    setAuthMessage("Username must be 3–24 characters using letters, numbers or underscore.");
    return;
  }
  const { data: existing, error: checkError } = await db.rpc("username_available", { wanted_username: username });
  if (checkError) {
    setAuthMessage("Could not check username. Make sure supabase.sql has been run.");
    console.error(checkError);
    return;
  }
  if (!existing) { setAuthMessage("That username is already taken."); return; }

  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { username, display_name: displayName } }
  });
  if (error) { setAuthMessage(error.message); return; }

  if (data.session) await enterApp(data.user);
  else {
    setAuthMessage("Account created. Check your email to confirm your account, then log in.", false);
    switchAuth("login");
  }
}

async function login(e) {
  e.preventDefault();
  setAuthMessage("");
  const identifier = $("loginIdentifier").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await db.rpc("email_for_username", { wanted_username: identifier });
    if (error || !data) { setAuthMessage("Username not found."); return; }
    email = data;
  }
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { setAuthMessage("Invalid username/email or password."); return; }
  await enterApp(data.user);
}

async function enterApp(user) {
  if (currentUser?.id === user.id && inbox) return; // already in
  currentUser = user;
  const { data: profile, error } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (error) {
    console.error(error);
    showToast("Could not load your profile.", true);
    return;
  }
  myProfile = profile;
  const name = profile.display_name || profile.username;
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("myDisplay").textContent = name;
  $("myName").textContent = `@${profile.username}`;
  setProfileAvatar($("myAvatar"), profile.avatar_url, name, profile.id);
  renderChatList(true);
  await loadChats();
  subscribeInbox();
  subscribeCallSignals();
}

function leaveApp() {
  if (inbox) db.removeChannel(inbox);
  if (callChannel) db.removeChannel(callChannel);
  callChannel = null;
  if (currentCall) endVideoCall(false);
  inbox = null; currentUser = null; myProfile = null;
  activeId = null; chats = []; messages = [];
  document.title = "SimpleChat";
  $("layout").classList.remove("in-chat");
  $("conversationPanel").classList.add("hidden");
  $("welcomePanel").classList.remove("hidden");
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}

/* ---------- chat list ---------- */
function mapChat(r) {
  return {
    id: r.conversation_id,
    otherId: r.other_user_id,
    username: r.other_username || "",
    name: r.other_display_name || r.other_username || "Unknown user",
    last: r.last_message || "",
    lastAt: r.last_message_at,
    lastMine: r.last_sender_id === currentUser.id,
    unread: Number(r.unread_count) || 0
  };
}

async function loadChats() {
  const { data, error } = await db.rpc("get_my_chats");
  if (error) {
    console.error(error);
    showToast("Could not load chats. Run supabase_v2.sql first.", true);    return;
  }
  chats = (data || []).map(mapChat);
  if (activeId) { const c = getChat(activeId); if (c) c.unread = 0; }
  renderChatList();
}

const getChat = (id) => chats.find(c => c.id === id);

function renderChatList(loading = false) {
  const list = $("chatList");
  if (loading === true) {
    list.innerHTML = '<div class="skeleton"></div>'.repeat(5);
    return;
  }
  updateTitle();
  const q = $("chatFilter").value.trim().toLowerCase();
  const shown = chats.filter(c => !q || c.name.toLowerCase().includes(q) || c.username.includes(q));

  if (!chats.length) {
    list.innerHTML = `<div class="empty"><strong>No chats yet</strong><span>Tap + to find someone by username.</span></div>`;
    return;
  }
  if (!shown.length) {
    list.innerHTML = `<div class="empty"><span>No chats match “${escapeHtml(q)}”.</span></div>`;
    return;
  }

  list.innerHTML = shown.map(c => {
    const preview = c.last ? (c.lastMine ? "You: " : "") + c.last : "No messages yet";
    return `<button type="button" class="chat-item${c.id === activeId ? " active" : ""}${c.unread ? " unread" : ""}" data-id="${c.id}">
      ${avatarHtml(c.name, c.otherId)}
      <div class="chat-info">
        <div class="chat-row"><span class="chat-name">${escapeHtml(c.name)}</span><span class="chat-time">${listTime(c.lastAt)}</span></div>
        <div class="chat-row"><span class="chat-preview">${escapeHtml(preview)}</span>${c.unread ? `<span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}</div>
      </div>
      <span class="chat-delete-wrap"><span class="delete-chat-btn" role="button" tabindex="0" title="Delete chat" aria-label="Delete chat">×</span></span>
    </button>`;
  }).join("");

  list.querySelectorAll(".chat-item").forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest(".delete-chat-btn")) return;
      selectConversation(el.dataset.id);
    };
    const del = el.querySelector(".delete-chat-btn");
    if (del) del.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteChat(el.dataset.id);
    };
  });
}

function sortChats() {
  chats.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

/* ---------- conversation ---------- */
async function selectConversation(id) {
  const c = getChat(id);
  if (!c) return;
  activeId = id;
  messages = [];
  unseenBelow = 0;
  c.unread = 0;
  renderChatList();
  markActiveRead();

  setAvatar($("conversationAvatar"), c.name, c.otherId);
  $("conversationName").textContent = c.name;
  $("conversationStatus").textContent = `@${c.username}`;
  $("welcomePanel").classList.add("hidden");
  $("conversationPanel").classList.remove("hidden");
  $("layout").classList.add("in-chat");
  $("messages").innerHTML = '<div class="empty">Loading…</div>';
  $("messageInput").value = "";
  autoGrow();

  await loadMessages();
  if (window.matchMedia("(hover:hover)").matches) $("messageInput").focus();
}

function closeConversation() {
  activeId = null;
  $("layout").classList.remove("in-chat");
  $("conversationPanel").classList.add("hidden");
  $("welcomePanel").classList.remove("hidden");
  renderChatList();
}

async function loadMessages() {
  const id = activeId;
  const { data, error } = await db.from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (id !== activeId) return; // user switched chats meanwhile
  if (error) {
    console.error(error);
    showToast("Could not load messages.", true);
    return;
  }
  messages = data || [];
  renderMessages();
  scrollToBottom(false);
}

function renderMessages() {
  const box = $("messages");
  if (!messages.length) {
    box.innerHTML = '<div class="empty">No messages yet. Say hello!</div>';
    return;
  }
  const peer = getChat(activeId);
  let html = "";
  messages.forEach((m, i) => {
    const p = messages[i - 1], n = messages[i + 1];
    const stamp = head(m, p);
    if (stamp) html += `<div class="stamp">${dayLabel(m.created_at)}, ${formatTime(m.created_at)}</div>`;
    const joinPrev = !stamp && p.sender_id === m.sender_id;
    const joinNext = !!n && !head(n, m) && n.sender_id === m.sender_id;
    const mine = m.sender_id === currentUser.id;
    const av = mine ? "" : (joinNext ? '<span class="av-gap"></span>' : avatarHtml(peer?.name, peer?.otherId, "xs"));
    html += `<div class="row ${mine ? "mine" : "theirs"}${joinPrev ? " j-prev" : ""}${joinNext ? " j-next" : ""}${m.pending ? " pending" : ""}">${av}<div class="bubble" title="${formatTime(m.created_at)}">${escapeHtml(m.body)}</div></div>`;
  });
  box.innerHTML = html;
}

function head(m, prev) {
  if (!prev) return true;
  return dayStart(new Date(m.created_at)).getTime() !== dayStart(new Date(prev.created_at)).getTime();
}

const box = () => $("messages");
const nearBottom = () => box().scrollHeight - box().scrollTop - box().clientHeight < 120;

function scrollToBottom(smooth) {
  box().scrollTo({ top: box().scrollHeight, behavior: smooth ? "smooth" : "auto" });
  unseenBelow = 0;
  updateScrollBtn();
}
function onScroll() { if (nearBottom()) unseenBelow = 0; updateScrollBtn(); }
function updateScrollBtn() {
  $("scrollDownBtn").classList.toggle("hidden", nearBottom());
  const b = $("scrollBadge");
  b.textContent = unseenBelow;
  b.classList.toggle("hidden", !unseenBelow);
}

function autoGrow() {
  const el = $("messageInput");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

/* ---------- read state ---------- */
async function markActiveRead() {
  if (!activeId || document.hidden) return;
  const c = getChat(activeId);
  if (c && c.unread) { c.unread = 0; renderChatList(); }
  const { error } = await db.rpc("mark_conversation_read", { p_conversation_id: activeId });
  if (error) console.error(error);
}

/* ---------- sending ---------- */
async function sendMessage(e) {
  e.preventDefault();
  if (!activeId) return;
  const input = $("messageInput");
  const body = input.value.trim();
  if (!body) return;

  const convId = activeId;
  const tmp = { id: "tmp-" + Date.now(), conversation_id: convId, sender_id: currentUser.id, body, created_at: new Date().toISOString(), pending: true };
  input.value = ""; autoGrow();
  messages.push(tmp);
  renderMessages();
  scrollToBottom(true);

  const { data, error } = await db.from("messages")
    .insert({ conversation_id: convId, sender_id: currentUser.id, body })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error) {
    console.error(error);
    messages = messages.filter(m => m.id !== tmp.id);
    renderMessages();
    showToast("Message failed to send.", true);
    return;
  }
  const idx = messages.findIndex(m => m.id === tmp.id);
  if (idx >= 0) messages[idx] = data;
  else messages.push(data);
  renderMessages();

  const c = getChat(convId);
  if (c) {
    c.last = body;
    c.lastAt = data.created_at;
    c.lastMine = true;
    sortChats();
    renderChatList();
  }
}

/* ---------- realtime inbox ---------- */
function subscribeInbox() {
  if (inbox) db.removeChannel(inbox);
  inbox = db.channel("inbox-" + currentUser.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
      const m = payload.new;
      if (m.sender_id === currentUser.id) return;
      const c = getChat(m.conversation_id);
      if (c) {
        c.last = m.body;
        c.lastAt = m.created_at;
        c.lastMine = false;
        if (m.conversation_id !== activeId) c.unread = (c.unread || 0) + 1;
        sortChats();
        renderChatList();
      } else {
        loadChats();
      }
      if (m.conversation_id === activeId) {
        messages.push(m);
        const wasNear = nearBottom();
        renderMessages();
        if (wasNear) scrollToBottom(true);
        else { unseenBelow++; updateScrollBtn(); }
        markActiveRead();
      } else {
        const chat = getChat(m.conversation_id);
        notifyUser(chat ? chat.name : "New message", m.body, m.conversation_id);
      }
    })
    .subscribe();
}

/* ---------- new chat / search ---------- */
function openNewChat() {
  $("userSearch").value = "";
  $("userResults").innerHTML = "";
  $("newChatDialog").showModal();
  setTimeout(() => $("userSearch").focus(), 50);
}

let searchTimer = null;
async function searchUsers() {
  clearTimeout(searchTimer);
  const q = $("userSearch").value.trim().toLowerCase();
  if (q.length < 2) { $("userResults").innerHTML = ""; return; }
  searchTimer = setTimeout(async () => {
    const { data, error } = await db.rpc("search_users", { query: q });
    if (error) { console.error(error); return; }
    const results = (data || []).filter(u => u.id !== currentUser.id);
    if (!results.length) {
      $("userResults").innerHTML = `<div class="empty"><span>No users found.</span></div>`;
      return;
    }
    $("userResults").innerHTML = results.map(u => {
      const name = u.display_name || u.username;
      return `<button type="button" class="user-result" data-id="${u.id}">
        ${avatarHtml(name, u.id)}
        <div><strong>${escapeHtml(name)}</strong><div class="muted">@${escapeHtml(u.username)}</div></div>
      </button>`;
    }).join("");
    $("userResults").querySelectorAll(".user-result").forEach(el => {
      el.onclick = () => startChat(el.dataset.id);
    });
  }, 250);
}

async function startChat(otherId) {
  $("newChatDialog").close();
  const { data, error } = await db.rpc("get_or_create_conversation", { other_user_id: otherId });
  if (error) {
    console.error(error);
    showToast("Could not start chat.", true);
    return;
  }
  await loadChats();
  selectConversation(data);
}

async function deleteChat(id) {
  if (!confirm("Delete this conversation? Messages will be removed for you.")) return;
  const { error } = await db.rpc("delete_conversation", { p_conversation_id: id });
  if (error) {
    console.error(error);
    showToast("Could not delete chat.", true);
    return;
  }
  chats = chats.filter(c => c.id !== id);
  if (activeId === id) closeConversation();
  renderChatList();
  showToast("Chat deleted.");
}

/* ---------- profile ---------- */
function setProfileAvatar(el, url, name, seed) {
  if (url) {
    el.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
  } else {
    el.textContent = initials(name);
    el.style.setProperty("--h", hue(seed || name));
  }
}

function openProfile() {
  $("profileDisplayName").value = myProfile.display_name || "";
  $("profileUsername").value = myProfile.username || "";
  setProfileAvatar($("profileAvatarPreview"), myProfile.avatar_url, myProfile.display_name || myProfile.username, myProfile.id);
  $("profileMessage").textContent = "";
  $("profileAvatarInput").value = "";
  $("profileDialog").showModal();
}

function previewAvatar() {
  const file = $("profileAvatarInput").files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    $("profileMessage").textContent = "Profile picture must be 5 MB or smaller.";
    $("profileMessage").style.color = "var(--danger)";
    return;
  }
  const url = URL.createObjectURL(file);
  $("profileAvatarPreview").innerHTML = `<img src="${url}" alt="">`;
}

async function saveProfile() {
  $("profileMessage").textContent = "";
  const displayName = $("profileDisplayName").value.trim();
  const username = $("profileUsername").value.trim().toLowerCase();
  if (!displayName || displayName.length > 60) {
    $("profileMessage").textContent = "Name must be 1–60 characters.";
    $("profileMessage").style.color = "var(--danger)";
    return;
  }
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    $("profileMessage").textContent = "Username must be 3–24 characters using letters, numbers or underscore.";
    $("profileMessage").style.color = "var(--danger)";
    return;
  }
  const file = $("profileAvatarInput").files[0];
  if (file && file.size > 5 * 1024 * 1024) {
    $("profileMessage").textContent = "Profile picture must be 5 MB or smaller.";
    $("profileMessage").style.color = "var(--danger)";
    return;
  }

  let avatarUrl = myProfile.avatar_url;
  if (file) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      $("profileMessage").textContent = uploadError.message || "Could not upload profile picture.";
      $("profileMessage").style.color = "var(--danger)";
      return;
    }
    const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
    avatarUrl = pub.publicUrl;
  }

  if (username !== myProfile.username) {
    const { error } = await db.rpc("change_username", { new_username: username });
    if (error) {
      $("profileMessage").textContent = error.message.includes("already") ? "That username is already taken." : (error.message || "Could not change username.");
      $("profileMessage").style.color = "var(--danger)";
      return;
    }
  }

  const { data: updated, error: profileError } = await db.from("profiles")
    .update({ display_name: displayName, avatar_url: avatarUrl })
    .eq("id", currentUser.id)
    .select("*")
    .single();
  if (profileError) {
    $("profileMessage").textContent = profileError.message || "Could not save profile.";
    $("profileMessage").style.color = "var(--danger)";
    return;
  }
  myProfile = updated;
  $("myDisplay").textContent = updated.display_name || updated.username;
  $("myName").textContent = "@" + updated.username;
  setProfileAvatar($("myAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);
  $("profileDialog").close();
  showToast("Profile saved.");
  await loadChats();
}

/* ---------- WebRTC video calling ---------- */
const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

function subscribeCallSignals() {
  if (callChannel) db.removeChannel(callChannel);
  callChannel = db.channel("calls-" + currentUser.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_signals", filter: `receiver_id=eq.${currentUser.id}` }, async payload => {
      const sig = payload.new;
      if (sig.type === "offer") {
        incomingOffer = sig;
        const chat = getChat(sig.conversation_id);
        $("callTitle").textContent = "Incoming video call";
        $("callStatus").textContent = chat ? chat.name + " is calling you" : "Someone is calling you";
        $("acceptCallBtn").classList.remove("hidden");
        $("declineCallBtn").classList.remove("hidden");
        $("muteCallBtn").classList.add("hidden");
        $("cameraCallBtn").classList.add("hidden");
        $("endCallBtn").classList.add("hidden");
        $("remoteVideoPlaceholder").textContent = "Incoming video call";
        $("remoteVideoPlaceholder").classList.remove("hidden");
        $("callDialog").showModal();
      } else if (sig.type === "answer" && currentCall) {
        try {
          await peerConnection.setRemoteDescription(sig.payload);
          await flushQueuedIce();
          $("callStatus").textContent = "Connected";
        } catch (err) { console.error(err); }
      } else if (sig.type === "ice" && peerConnection) {
        try {
          const candidate = new RTCIceCandidate(sig.payload);
          if (peerConnection.remoteDescription) await peerConnection.addIceCandidate(candidate);
          else queuedIceCandidates.push(candidate);
        } catch (err) { console.error(err); }
      } else if (sig.type === "hangup" || sig.type === "decline") {
        if (currentCall || incomingOffer) {
          await endVideoCall(false);
          showToast(sig.type === "decline" ? "Call declined." : "Call ended.");
        }
      }
    })
    .subscribe();
}

async function sendCallSignal(conversationId, receiverId, type, payload) {
  await db.from("call_signals").insert({
    conversation_id: conversationId,
    sender_id: currentUser.id,
    receiver_id: receiverId,
    type,
    payload
  });
}

async function startVideoCall() {
  if (!activeId || currentCall) return;
  const chat = getChat(activeId);
  if (!chat) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $("localVideo").srcObject = localStream;
    peerConnection = new RTCPeerConnection({ iceServers });
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = (e) => {
      remoteStream = e.streams[0];
      $("remoteVideo").srcObject = remoteStream;
      $("remoteVideoPlaceholder").classList.add("hidden");
    };
    peerConnection.onicecandidate = (e) => {
      if (e.candidate) sendCallSignal(activeId, chat.otherId, "ice", e.candidate.toJSON()).catch(console.error);
    };
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    currentCall = { conversationId: activeId, peerId: chat.otherId };
    await sendCallSignal(activeId, chat.otherId, "offer", offer);
    $("callTitle").textContent = "Calling…";
    $("callStatus").textContent = chat.name;
    $("acceptCallBtn").classList.add("hidden");
    $("declineCallBtn").classList.add("hidden");
    $("muteCallBtn").classList.remove("hidden");
    $("cameraCallBtn").classList.remove("hidden");
    $("endCallBtn").classList.remove("hidden");
    $("remoteVideoPlaceholder").textContent = "Calling…";
    $("remoteVideoPlaceholder").classList.remove("hidden");
    $("callDialog").showModal();
  } catch (err) {
    console.error(err);
    showToast("Could not access camera/microphone.", true);
    await endVideoCall(false);
  }
}

async function acceptIncomingCall() {
  const offer = incomingOffer;
  if (!offer) return;
  incomingOffer = null;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $("localVideo").srcObject = localStream;
    peerConnection = new RTCPeerConnection({ iceServers });
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    peerConnection.ontrack = (e) => {
      remoteStream = e.streams[0];
      $("remoteVideo").srcObject = remoteStream;
      $("remoteVideoPlaceholder").classList.add("hidden");
    };
    peerConnection.onicecandidate = (e) => {
      if (e.candidate) sendCallSignal(offer.conversation_id, offer.sender_id, "ice", e.candidate.toJSON()).catch(console.error);
    };
    await peerConnection.setRemoteDescription(offer.payload);
    await flushQueuedIce();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    currentCall = { conversationId: offer.conversation_id, peerId: offer.sender_id };
    await sendCallSignal(offer.conversation_id, offer.sender_id, "answer", answer);
    $("callTitle").textContent = "Video call";
    $("callStatus").textContent = "Connected";
    $("acceptCallBtn").classList.add("hidden");
    $("declineCallBtn").classList.add("hidden");
    $("muteCallBtn").classList.remove("hidden");
    $("cameraCallBtn").classList.remove("hidden");
    $("endCallBtn").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    showToast("Could not accept the call.", true);
    await endVideoCall(true);
  }
}

async function declineIncomingCall() {
  const offer = incomingOffer;
  incomingOffer = null;
  if (offer) {
    try { await sendCallSignal(offer.conversation_id, offer.sender_id, "decline", {}); }
    catch (err) { console.error(err); }
  }
  if (!currentCall) $("callDialog").close();
  $("acceptCallBtn").classList.add("hidden");
  $("declineCallBtn").classList.remove("hidden");
  $("remoteVideoPlaceholder").textContent = "Call declined";
}

async function flushQueuedIce() {
  if (!peerConnection?.remoteDescription) return;
  const candidates = queuedIceCandidates;
  queuedIceCandidates = [];
  for (const candidate of candidates) {
    try { await peerConnection.addIceCandidate(candidate); }
    catch (err) { console.error("Could not add queued ICE candidate", err); }
  }
}

function toggleCallMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("muteCallBtn").textContent = track.enabled ? "Mute mic" : "Unmute mic";
}

function toggleCallCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $("cameraCallBtn").textContent = track.enabled ? "Turn camera off" : "Turn camera on";
}

async function endVideoCall(notifyPeer = true) {
  const call = currentCall;
  currentCall = null;
  if (notifyPeer && call && currentUser) {
    try { await sendCallSignal(call.conversationId, call.peerId, "hangup", {}); }
    catch (err) { console.error(err); }
  }
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
  }
  peerConnection = null;
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
  remoteStream = null;
  queuedIceCandidates = [];
  $("localVideo").srcObject = null;
  $("remoteVideo").srcObject = null;
  $("acceptCallBtn").classList.add("hidden");
  $("declineCallBtn").classList.remove("hidden");
  $("muteCallBtn").classList.add("hidden");
  $("cameraCallBtn").classList.add("hidden");
  $("endCallBtn").classList.add("hidden");
  $("remoteVideoPlaceholder").classList.remove("hidden");
  $("remoteVideoPlaceholder").textContent = "Call ended";
  if ($("callDialog").open) $("callDialog").close();
  incomingOffer = null;
}


boot();

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

/* ---------- auth ---------- */
function switchAuth(mode) {
  const login = mode === "login";
  $("loginForm").classList.toggle("hidden", !login);
  $("signupForm").classList.toggle("hidden", login);
  $("loginTab").classList.toggle("active", login);
  $("signupTab").classList.toggle("active", !login);
  setAuthMessage("");
}

async function boot() {
  $("loginTab").onclick = () => switchAuth("login");
  $("signupTab").onclick = () => switchAuth("signup");
  $("loginForm").addEventListener("submit", login);
  $("signupForm").addEventListener("submit", signup);
  $("logoutBtn").onclick = () => db.auth.signOut();
  $("newChatBtn").onclick = openNewChat;
  $("welcomeNewChat").onclick = openNewChat;
  $("mobileBackBtn").onclick = closeConversation;
  $("messageForm").addEventListener("submit", sendMessage);
  $("userSearch").addEventListener("input", searchUsers);
  $("chatFilter").addEventListener("input", renderChatList);
  $("scrollDownBtn").onclick = () => scrollToBottom(true);
  $("messages").addEventListener("scroll", onScroll);

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

async function signup(e) {
  e.preventDefault();
  setAuthMessage("");
  const username = $("signupUsername").value.trim().toLowerCase();
  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;
  const displayName = $("signupDisplayName").value.trim() || username;

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
  setAvatar($("myAvatar"), name, profile.id);
  renderChatList(true);
  await loadChats();
  subscribeInbox();
}

function leaveApp() {
  if (inbox) db.removeChannel(inbox);
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
    showToast("Could not load chats. Run supabase_v2.sql first.", true);
    return;
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
    </button>`;
  }).join("");

  list.querySelectorAll(".chat-item").forEach(el => el.onclick = () => selectConversation(el.dataset.id));
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
    box.innerHTML = '<div class="empty"><strong>No messages yet</strong><span>Say hello 👋</span></div>';
    return;
  }
  let html = "", prev = null;
  for (const m of messages) {
    const newDay = !prev || dayStart(new Date(prev.created_at)).getTime() !== dayStart(new Date(m.created_at)).getTime();
    if (newDay) html += `<div class="day"><span>${dayLabel(m.created_at)}</span></div>`;
    const first = newDay || prev.sender_id !== m.sender_id;
    const mine = m.sender_id === currentUser.id;
    html += `<div class="bubble ${mine ? "mine" : "theirs"}${first ? " first" : ""}${m.pending ? " pending" : ""}">
      <span class="text">${escapeHtml(m.body)}</span><time>${m.pending ? "Sending…" : formatTime(m.created_at)}</time>
    </div>`;
    prev = m;
  }
  box.innerHTML = html;
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

  if (convId === activeId) {
    messages = messages.filter(m => m.id !== tmp.id);
    if (error) {
      console.error(error);
      if (!input.value) { input.value = body; autoGrow(); }
      showToast("Message could not be sent.", true);
    } else if (!messages.some(m => m.id === data.id)) {
      messages.push(data);
    }
    renderMessages();
    scrollToBottom(false);
  }
  if (!error) { touchChat(data, false); markActiveRead(); }
}

/* ---------- realtime ---------- */
function touchChat(m, incoming) {
  const c = getChat(m.conversation_id);
  if (!c) return false;
  c.last = m.body;
  c.lastAt = m.created_at;
  c.lastMine = m.sender_id === currentUser.id;
  if (incoming && !(m.conversation_id === activeId && !document.hidden)) c.unread += 1;
  sortChats();
  renderChatList();
  return true;
}

function subscribeInbox() {
  if (inbox) db.removeChannel(inbox);
  // RLS limits these events to conversations I belong to.
  inbox = db.channel("inbox:" + currentUser.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
      const m = payload.new;
      const mine = m.sender_id === currentUser.id;

      if (!getChat(m.conversation_id)) { await loadChats(); } // brand-new conversation
      else touchChat(m, !mine);

      if (m.conversation_id === activeId && !messages.some(x => x.id === m.id)) {
        const stick = nearBottom();
        if (!mine) {
          messages.push(m);
          renderMessages();
          if (stick) scrollToBottom(true);
          else { unseenBelow++; updateScrollBtn(); }
          markActiveRead();
        }
      }
    })
    .subscribe();
}

/* ---------- new chat dialog ---------- */
function openNewChat() {
  $("userSearch").value = "";
  $("userResults").innerHTML = '<div class="muted">Type at least 3 characters.</div>';
  $("newChatDialog").showModal();
  setTimeout(() => $("userSearch").focus(), 50);
}

let searchTimer;
function searchUsers() {
  clearTimeout(searchTimer);
  const q = $("userSearch").value.trim().toLowerCase().replace(/[%_]/g, "");
  if (q.length < 3) {
    $("userResults").innerHTML = '<div class="muted">Type at least 3 characters.</div>';
    return;
  }
  searchTimer = setTimeout(async () => {
    const { data, error } = await db.from("profiles")
      .select("id, username, display_name")
      .ilike("username", `${q}%`)
      .neq("id", currentUser.id)
      .limit(10);
    if (error) {
      console.error(error);
      $("userResults").innerHTML = '<div class="muted">Search failed.</div>';
      return;
    }
    $("userResults").innerHTML = data?.length ? data.map(p => `
      <button type="button" class="user-result" data-user="${p.id}">
        ${avatarHtml(p.display_name || p.username, p.id)}
        <div><strong>${escapeHtml(p.display_name || p.username)}</strong><br><span class="muted">@${escapeHtml(p.username)}</span></div>
      </button>`).join("") : '<div class="muted">No users found.</div>';
    $("userResults").querySelectorAll(".user-result").forEach(el => el.onclick = () => startConversation(el.dataset.user));
  }, 250);
}

async function startConversation(otherUserId) {
  const { data, error } = await db.rpc("create_direct_conversation", { other_user_id: otherUserId });
  if (error) {
    console.error(error);
    showToast("Could not create conversation.", true);
    return;
  }
  $("newChatDialog").close();
  await loadChats();
  await selectConversation(data);
}

boot();

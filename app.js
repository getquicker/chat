// SimpleChat Version 1
// 1) Copy config.js.example -> config.js
// 2) Put your Supabase URL and anon/publishable key in config.js
// 3) Run the SQL in supabase.sql

if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
  alert("Supabase is not configured. Copy config.js.example to config.js and add your project values.");
}

const { createClient } = window.supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentUser = null;
let myProfile = null;
let activeConversation = null;
let realtimeChannel = null;
let conversations = [];

function showToast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show" + (error ? " error" : "");
  setTimeout(() => el.className = "toast", 2600);
}

function setAuthMessage(message, error = true) {
  $("authMessage").textContent = message || "";
  $("authMessage").style.color = error ? "#c43b3b" : "#27814b";
}

function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function formatTime(ts) {
  return new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit" });
}

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
  $("mobileMenuBtn").onclick = openMobileSidebar;
  $("closeSidebarBtn").onclick = closeMobileSidebar;
  $("mobileOverlay").onclick = closeMobileSidebar;
  $("mobileBackBtn").onclick = closeMobileSidebar;
  $("messageForm").addEventListener("submit", sendMessage);
  $("userSearch").addEventListener("input", searchUsers);

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
  if (!existing) {
    setAuthMessage("That username is already taken.");
    return;
  }

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: displayName } }
  });

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  if (data.session) {
    await enterApp(data.user);
  } else {
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
    if (error || !data) {
      setAuthMessage("Username not found.");
      return;
    }
    email = data;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthMessage("Invalid username/email or password.");
    return;
  }
  await enterApp(data.user);
}

async function enterApp(user) {
  currentUser = user;
  const { data: profile, error } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (error) {
    console.error(error);
    showToast("Could not load your profile.", true);
    return;
  }
  myProfile = profile;
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("myName").textContent = `@${profile.username}`;
  await loadConversations();
}

function leaveApp() {
  currentUser = null;
  myProfile = null;
  activeConversation = null;
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}

async function loadConversations() {
  const { data, error } = await db
    .from("conversation_members")
    .select(`
      conversation_id,
      conversations (
        id,
        updated_at,
        conversation_members (
          user_id,
          profiles ( id, username, display_name )
        )
      )
    `)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    showToast("Could not load conversations.", true);
    return;
  }

  conversations = (data || []).map(x => x.conversations).filter(Boolean);
  renderChatList();
}

function renderChatList() {
  const list = $("chatList");
  if (!conversations.length) {
    list.innerHTML = '<div class="empty">No conversations yet.</div>';
    return;
  }

  list.innerHTML = conversations.map(c => {
    const other = (c.conversation_members || []).map(m => m.profiles).find(p => p && p.id !== currentUser.id);
    const name = other?.display_name || other?.username || "Unknown user";
    const active = activeConversation?.id === c.id ? " active" : "";
    return `<div class="chat-item${active}" data-id="${c.id}">
      <div class="avatar">${escapeHtml(initials(name))}</div>
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(name)}</div>
        <div class="chat-preview">@${escapeHtml(other?.username || "")}</div>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".chat-item").forEach(el => {
    el.onclick = () => selectConversation(el.dataset.id);
  });
}

async function selectConversation(id) {
  const c = conversations.find(x => x.id === id);
  if (!c) return;
  activeConversation = c;
  renderChatList();

  const other = (c.conversation_members || []).map(m => m.profiles).find(p => p && p.id !== currentUser.id);
  const otherName = other?.display_name || other?.username || "Conversation";
  $("conversationName").textContent = otherName;
  $("conversationStatus").textContent = `@${other?.username || ""}`;
  $("conversationAvatar").textContent = initials(otherName);
  closeMobileSidebar();
  $("welcomePanel").classList.add("hidden");
  $("conversationPanel").classList.remove("hidden");

  await loadMessages();
  subscribeToMessages();
  $("messageInput").focus();
}

async function loadMessages() {
  const { data, error } = await db.from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", activeConversation.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load messages.", true);
    return;
  }

  renderMessages(data || []);
}

function renderMessages(messages) {
  const box = $("messages");
  box.innerHTML = messages.length ? messages.map(messageHtml).join("") : '<div class="empty">No messages yet. Say hello!</div>';
  box.scrollTop = box.scrollHeight;
}

function messageHtml(m) {
  const mine = m.sender_id === currentUser.id;
  return `<div class="bubble ${mine ? "mine" : ""}">
    ${escapeHtml(m.body)}
    <small>${formatTime(m.created_at)}</small>
  </div>`;
}

async function sendMessage(e) {
  e.preventDefault();
  if (!activeConversation) return;
  const input = $("messageInput");
  const body = input.value.trim();
  if (!body) return;

  input.value = "";
  const { error } = await db.from("messages").insert({
    conversation_id: activeConversation.id,
    sender_id: currentUser.id,
    body
  });

  if (error) {
    console.error(error);
    input.value = body;
    showToast("Message could not be sent.", true);
  }
}

function subscribeToMessages() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db.channel("messages:" + activeConversation.id)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConversation.id}` },
      payload => {
        const box = $("messages");
        if (box.querySelector(".empty")) box.innerHTML = "";
        box.insertAdjacentHTML("beforeend", messageHtml(payload.new));
        box.scrollTop = box.scrollHeight;
      }
    ).subscribe();
}

function openMobileSidebar() {
  $("sidebar").classList.add("open");
  $("mobileOverlay").classList.add("show");
}

function closeMobileSidebar() {
  $("sidebar").classList.remove("open");
  $("mobileOverlay").classList.remove("show");
}

function openNewChat() {
  closeMobileSidebar();
  $("userSearch").value = "";
  $("userResults").innerHTML = '<div class="muted">Type a username to search.</div>';
  $("newChatDialog").showModal();
  setTimeout(() => $("userSearch").focus(), 50);
}

let searchTimer;
function searchUsers() {
  clearTimeout(searchTimer);
  const q = $("userSearch").value.trim().toLowerCase();
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
      <div class="user-result" data-user="${p.id}">
        <div class="avatar">${escapeHtml(initials(p.display_name || p.username))}</div>
        <div><strong>${escapeHtml(p.display_name || p.username)}</strong><br><span class="muted">@${escapeHtml(p.username)}</span></div>
      </div>`).join("") : '<div class="muted">No users found.</div>';

    $("userResults").querySelectorAll(".user-result").forEach(el => {
      el.onclick = () => startConversation(el.dataset.user);
    });
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
  await loadConversations();
  await selectConversation(data);
}

boot();

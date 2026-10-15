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
function avatarHtml(name, seed, cls, url) {
  if (cls === undefined) cls = "";
  if (url === undefined) url = null;
  var h = hue(seed || name);
  if (url) {
    return '<div class="avatar ' + cls + '" style="--h:' + h + '"><img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="this.remove()"></div>';
  }
  return '<div class="avatar ' + cls + '" style="--h:' + h + '">' + escapeHtml(initials(name)) + '</div>';
}
function setAvatar(el, name, seed, url) {
  if (url === undefined) url = null;
  el.style.setProperty("--h", hue(seed || name));
  if (url) {
    el.innerHTML = '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="this.remove()">';
  } else {
    el.textContent = initials(name);
  }
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
const timeFmt = { hour: "2-digit", minute: "2-digit" };
function formatTime(ts) { return new Date(ts).toLocaleTimeString([], timeFmt); }

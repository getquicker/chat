(() => {
  "use strict";
  const byUser = new Set();
  const byName = new Set();
  let lastFetch = 0;
  let applying = false;
  let refreshInFlight = null;
  const BADGE_CLASS = "sc-vtick";
  const BADGE_STYLE_ID = "sc-vtick-css";

  function ensureCss() {
    if (document.getElementById(BADGE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BADGE_STYLE_ID;
    style.textContent = `
      .${BADGE_CLASS} { display:inline-flex; align-items:center; justify-content:center; width:13px; height:13px; margin-inline-start:4px; vertical-align:-1px; flex:0 0 13px; line-height:0; pointer-events:none; border-radius:50%; overflow:visible; }
      .${BADGE_CLASS} svg { display:block; width:13px; height:13px; flex:0 0 13px; }\n      .chat-name, #conversationName, #detailsName, #myDisplay, .peer-name, .contact-name, .profile-name, .display-name, .username { display:inline-flex; align-items:center; min-width:0; }
      @media(max-width:480px) { .${BADGE_CLASS} { width:12px; height:12px; flex-basis:12px; margin-inline-start:3px; } .${BADGE_CLASS} svg { width:12px; height:12px; flex-basis:12px; } }
      @media(prefers-reduced-motion:no-preference) { .${BADGE_CLASS} { animation:sc-vtick-in 180ms ease-out both; } @keyframes sc-vtick-in { from { opacity:.65; transform:scale(.88); } to { opacity:1; transform:scale(1); } } }
    `;
    document.head.appendChild(style);
  }

  function getClient() {
    if (window.__sc && window.__sc.supabase) return window.__sc.supabase;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      try { return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); } catch (_) {}
    }
    return null;
  }

  function normalize(value) { return String(value || "").replace(/^@/, "").trim().toLowerCase(); }

  async function refresh(force) {
    if (!force && Date.now() - lastFetch < 15000 && (byUser.size || byName.size)) return;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      lastFetch = Date.now();
      const sb = getClient();
      if (!sb) return;
      try {
        let rows = [];
        const rpc = await sb.rpc("list_verified_usernames");
        if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) {
          rows = rpc.data.map(row => typeof row === "string" ? { username: row } : (row || {}));
        } else {
          const result = await sb.from("profiles").select("username, display_name, is_verified").eq("is_verified", true);
          if (result.error) { console.warn("[verified badge]", result.error.message); return; }
          rows = result.data || [];
        }
        const usernames = new Set();
        const names = new Set();
        rows.forEach(profile => {
          const username = normalize(profile.username);
          const displayName = normalize(profile.display_name);
          if (username) usernames.add(username);
          if (displayName) names.add(displayName);
        });
        if (usernames.size && !names.size) {
          try {
            const result = await sb.from("profiles").select("username, display_name").in("username", [...usernames]);
            (result.data || []).forEach(profile => { const name = normalize(profile.display_name); if (name) names.add(name); });
          } catch (_) {}
        }
        byUser.clear(); byName.clear();
        usernames.forEach(value => byUser.add(value));
        names.forEach(value => byName.add(value));
        applyAll();
      } catch (error) { console.warn("[verified badge]", error); }
    })().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function cleanText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll(".sc-vtick, .sc-meta-tick-host, .sc-meta-tick, .sc-verified").forEach(node => node.remove());
    return normalize(clone.textContent);
  }

  function isVerified(value) {
    const key = normalize(value);
    return !!key && (byUser.has(key) || byName.has(key));
  }

  function placeTick(element) {
    if (!element || element.querySelector(":scope > .sc-vtick")) return;
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", "Verified account");
    badge.title = "Verified account";
    badge.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7.5" fill="#1688F8"/><path d="M4.25 8.15 6.65 10.45 11.75 5.65" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    element.appendChild(badge);
  }

  function clearTick(element) {
    if (element) element.querySelectorAll(":scope > .sc-vtick").forEach(node => node.remove());
  }

  function mark(element, usernameOrName) {
    if (!element) return;
    if (isVerified(usernameOrName) || isVerified(cleanText(element))) placeTick(element);
    else clearTick(element);
  }

  function applyChatList() {
    const list = document.getElementById("chatList");
    if (!list) return;
    list.querySelectorAll(".chat-item").forEach(item => {
      const nameElement = item.querySelector(".chat-name");
      if (!nameElement) return;
      const username = item.getAttribute("data-username") || item.querySelector("[data-username]")?.getAttribute("data-username") || "";
      mark(nameElement, username);
    });
  }

  function applyUserResults() {
    const box = document.getElementById("userResults");
    if (!box) return;
    box.querySelectorAll("[data-username], .user-row, button, li, .result").forEach(row => {
      const username = row.getAttribute("data-username") || row.querySelector("[data-username]")?.getAttribute("data-username") || "";
      const nameElement = row.querySelector(".name, .display-name, .chat-name, strong");
      if (nameElement) mark(nameElement, username);
      else if (username && isVerified(username)) placeTick(row);
    });
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try {
      if (!byUser.size && !byName.size) return;
      const myUsername = document.getElementById("myName");
      const myDisplay = document.getElementById("myDisplay");
      // The verified badge belongs beside the display name only, never beside the username.
      if (myDisplay) mark(myDisplay, myUsername ? cleanText(myUsername) : cleanText(myDisplay));
      const detailsUsername = document.getElementById("detailsUsername");
      const detailsName = document.getElementById("detailsName");
      const conversationName = document.getElementById("conversationName");
      if (detailsName) {
        const username = detailsUsername ? cleanText(detailsUsername) : (detailsName.dataset.username || cleanText(detailsName));
        mark(detailsName, username);
      }
      if (conversationName) {
        const username = conversationName.dataset.username ||
          (detailsUsername ? cleanText(detailsUsername) : cleanText(conversationName));
        mark(conversationName, username);
      }
      // Only visible display-name elements get a badge. Username labels are intentionally excluded.
      document.querySelectorAll(".chat-name, .peer-name, .contact-name, .profile-name, .display-name").forEach(element => {
        mark(element, element.dataset.username || "");
      });
      applyChatList();
      applyUserResults();
      document.querySelectorAll("#chatTitle").forEach(element => mark(element, element.dataset.username || cleanText(element)));
    } finally { applying = false; }
  }

  window.__scRefreshVerified = () => { lastFetch = 0; return refresh(true); };
  window.__scIsVerified = isVerified;

  function boot() {
    ensureCss();
    refresh(true);
    setInterval(() => refresh(false), 15000);
    const root = document.getElementById("layout") || document.body;
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; applyAll(); });
    });
    observer.observe(root, { childList: true, subtree: true });
    // Keep a dedicated observer on the chat list: it may be rendered or replaced
    // independently of the main layout, especially after realtime updates on mobile.
    let listObserver = null;
    let observedList = null;
    const observeChatList = () => {
      const list = document.getElementById("chatList");
      if (!list || list === observedList) return;
      if (listObserver) listObserver.disconnect();
      observedList = list;
      listObserver = new MutationObserver(() => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { frame = 0; applyChatList(); });
      });
      listObserver.observe(list, { childList: true, subtree: true, characterData: true });
      applyChatList();
    };
    observeChatList();
    const listPoll = setInterval(observeChatList, 1500);
    window.addEventListener("pagehide", () => {
      observer.disconnect();
      if (listObserver) listObserver.disconnect();
      clearInterval(listPoll);
    }, { once: true });
    document.querySelectorAll("dialog").forEach(dialog => observer.observe(dialog, { childList: true, subtree: true }));
    [500, 1500, 3500].forEach(delay => setTimeout(() => { refresh(true); applyAll(); }, delay));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { refresh(true); applyAll(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

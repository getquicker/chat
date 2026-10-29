/**
 * SimpleChat UI v2 — toolbar, reply, reactions, contact panel, calls
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const REACT_KEY = "sc_reactions_v1";
  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 2000);
  }

  function loadReactions() {
    try { return JSON.parse(localStorage.getItem(REACT_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveReactions(map) {
    localStorage.setItem(REACT_KEY, JSON.stringify(map));
  }

  function applyThemeSoft(mode) {
    try {
      const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
      s.theme = mode;
      localStorage.setItem("simplechat_settings_v1", JSON.stringify(s));
      const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme-mode", mode);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#0f1115" : "#0084ff");
      toast(mode === "system" ? "Theme: System" : mode === "dark" ? "Dark theme" : "Light theme");
    } catch {}
  }

  let openMenu = null;
  function closeMenus() {
    document.querySelectorAll(".sc-menu.open").forEach((m) => m.classList.remove("open"));
    openMenu = null;
  }

  function placeMenu(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.visibility = "hidden";
    menu.classList.add("open");
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = r.right - mw;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "";
  }

  function buildMoreMenu() {
    if ($("scMoreMenu")) return $("scMoreMenu");
    const m = document.createElement("div");
    m.id = "scMoreMenu";
    m.className = "sc-menu";
    m.setAttribute("role", "menu");
    m.innerHTML =
      '<div class="sc-menu-label">Appearance</div>' +
      '<button type="button" class="sc-menu-item" data-act="theme-light" role="menuitem">Light theme <span class="check">✓</span></button>' +
      '<button type="button" class="sc-menu-item" data-act="theme-dark" role="menuitem">Dark theme <span class="check">✓</span></button>' +
      '<button type="button" class="sc-menu-item" data-act="theme-system" role="menuitem">System theme <span class="check">✓</span></button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Notifications</div>' +
      '<button type="button" class="sc-menu-item" data-act="toggle-sound" role="menuitem">Message sounds</button>' +
      '<button type="button" class="sc-menu-item" data-act="open-settings" role="menuitem">All settings…</button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Application</div>' +
      '<button type="button" class="sc-menu-item" data-act="install" role="menuitem">Install app</button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Account</div>' +
      '<button type="button" class="sc-menu-item" data-act="profile" role="menuitem">Profile settings</button>' +
      '<button type="button" class="sc-menu-item danger" data-act="logout" role="menuitem">Sign out</button>';
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      closeMenus();
      if (act === "theme-light") return applyThemeSoft("light");
      if (act === "theme-dark") return applyThemeSoft("dark");
      if (act === "theme-system") return applyThemeSoft("system");
      if (act === "toggle-sound") {
        try {
          const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
          s.soundMessages = s.soundMessages === false;
          localStorage.setItem("simplechat_settings_v1", JSON.stringify(s));
          toast(s.soundMessages !== false ? "Message sounds on" : "Message sounds off");
        } catch {}
        return;
      }
      if (act === "open-settings") {
        const d = $("settingsDialog");
        if (d) {
          try { d.showModal(); } catch { d.setAttribute("open", ""); }
        } else {
          $("settingsBtn")?.click();
          window.dispatchEvent(new CustomEvent("sc-open-settings"));
        }
        return;
      }
      if (act === "install") { $("installAppBtn")?.click(); return; }
      if (act === "profile") { $("profileBtn")?.click(); $("mobileProfileBtn")?.click(); return; }
      if (act === "logout") {
        if (confirm("Sign out of SimpleChat?")) $("logoutBtn")?.click();
      }
    });
    return m;
  }

  function injectToolbar() {
    const actions = document.querySelector(".sidebar-actions");
    if (!actions || $("moreMenuBtn")) return;
    const more = document.createElement("button");
    more.id = "moreMenuBtn";
    more.type = "button";
    more.className = "icon-btn more-btn";
    more.title = "More options";
    more.setAttribute("aria-label", "More options");
    more.setAttribute("aria-haspopup", "menu");
    more.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = buildMoreMenu();
      if (menu.classList.contains("open") && openMenu === menu) {
        closeMenus();
        return;
      }
      closeMenus();
      try {
        const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
        const mode = s.theme || "system";
        menu.querySelectorAll("[data-act^=theme-]").forEach((b) => {
          b.classList.toggle("active", b.dataset.act === "theme-" + mode);
        });
      } catch {}
      placeMenu(menu, more);
      openMenu = menu;
    });
    actions.appendChild(more);
  }

  document.addEventListener("click", () => closeMenus());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  let replyTarget = null;
  function ensureReplyBar() {
    if ($("replyBar")) return $("replyBar");
    const form = $("messageForm");
    if (!form) return null;
    const bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML =
      '<div class="reply-bar-body"><strong id="replyBarLabel">Reply</strong><span id="replyBarText"></span></div>' +
      '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel reply">✕</button>';
    form.parentNode.insertBefore(bar, form);
    $("replyBarClose").onclick = clearReply;
    return bar;
  }
  function clearReply() {
    replyTarget = null;
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }
  function setReply(msgId, text) {
    ensureReplyBar();
    replyTarget = { id: msgId, text: (text || "").slice(0, 120) };
    const bar = $("replyBar");
    if (!bar) return;
    $("replyBarLabel").textContent = "Replying";
    $("replyBarText").textContent = replyTarget.text;
    bar.classList.add("active");
    $("messageInput")?.focus();
  }
  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyWired) return;
    form.dataset.replyWired = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const meta = "«reply:" + replyTarget.id + "» " + replyTarget.text.replace(/\n/g, " ").slice(0, 80);
      if (!input.value.startsWith("«reply:")) input.value = meta + "\n" + input.value;
      setTimeout(clearReply, 0);
    }, true);
  }

  function ensureReactPicker() {
    if ($("reactPicker")) return $("reactPicker");
    const p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.innerHTML = EMOJIS.map((e) => '<button type="button" data-emoji="' + e + '">' + e + "</button>").join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      toggleReaction(p.dataset.msgId, b.dataset.emoji);
      p.classList.remove("open");
    });
    return p;
  }

  function toggleReaction(msgId, emoji) {
    const map = loadReactions();
    if (!map[msgId]) map[msgId] = {};
    const entry = map[msgId];
    if (!entry[emoji]) entry[emoji] = [];
    const i = entry[emoji].indexOf("me");
    if (i >= 0) entry[emoji].splice(i, 1);
    else entry[emoji].push("me");
    if (!entry[emoji].length) delete entry[emoji];
    saveReactions(map);
    renderReactionsFor(msgId);
  }

  function renderReactionsFor(msgId) {
    const row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
    if (!row) return;
    let box = row.querySelector(".msg-reactions");
    if (!box) {
      box = document.createElement("div");
      box.className = "msg-reactions";
      row.appendChild(box);
    }
    const map = loadReactions()[msgId] || {};
    box.innerHTML = Object.entries(map)
      .filter(([, users]) => users.length)
      .map(([emoji, users]) => {
        const mine = users.includes("me") ? " mine" : "";
        return '<button type="button" class="reaction-chip' + mine + '" data-emoji="' + emoji + '" data-msg="' + msgId + '">' + emoji + "</button>";
      })
      .join("");
    box.querySelectorAll(".reaction-chip").forEach((c) => {
      c.onclick = () => toggleReaction(c.dataset.msg, c.dataset.emoji);
    });
  }

  function parseBody(raw) {
    if (!raw) return { reply: null, text: "" };
    if (raw.startsWith("«reply:")) {
      const nl = raw.indexOf("\n");
      if (nl > 0) {
        const head = raw.slice(0, nl);
        const hm = head.match(/^«reply:([^»]+)»\s*(.*)$/);
        if (hm) return { reply: { id: hm[1], preview: hm[2] }, text: raw.slice(nl + 1) };
      }
    }
    return { reply: null, text: raw };
  }

  function enhanceRow(row) {
    if (!row || row.dataset.enhanced) return;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;
    row.dataset.enhanced = "1";
    let msgId = row.dataset.msgId || row.getAttribute("data-id") || ("dom-" + Math.random().toString(36).slice(2, 10));
    row.dataset.msgId = msgId;
    const raw = bubble.dataset.raw || bubble.textContent || "";
    const parsed = parseBody(raw);
    if (parsed.reply && !row.querySelector(".reply-preview")) {
      const rp = document.createElement("div");
      rp.className = "reply-preview";
      rp.textContent = parsed.reply.preview || "Original message";
      bubble.parentNode.insertBefore(rp, bubble);
      if (parsed.text && bubble.textContent === raw) bubble.textContent = parsed.text;
    }
    if (!row.querySelector(".msg-actions")) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">↩</button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">☺</button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">⧉</button>';
      row.appendChild(acts);
      acts.addEventListener("click", (e) => {
        const b = e.target.closest("[data-a]");
        if (!b) return;
        e.stopPropagation();
        const text = (parsed.text || bubble.textContent || "").trim();
        if (b.dataset.a === "copy") navigator.clipboard?.writeText(text).then(() => toast("Copied"));
        else if (b.dataset.a === "reply") setReply(msgId, text);
        else if (b.dataset.a === "react") {
          const p = ensureReactPicker();
          p.dataset.msgId = msgId;
          const r = b.getBoundingClientRect();
          p.style.left = Math.min(r.left, window.innerWidth - 220) + "px";
          p.style.top = Math.max(8, r.top - 48) + "px";
          p.classList.add("open");
        }
      });
    }
    let timer;
    row.addEventListener("touchstart", () => { timer = setTimeout(() => row.classList.add("show-actions"), 450); }, { passive: true });
    row.addEventListener("touchend", () => clearTimeout(timer));
    row.addEventListener("touchmove", () => clearTimeout(timer));
    renderReactionsFor(msgId);
  }

  function observeMessages() {
    const box = $("messages");
    if (!box) return;
    new MutationObserver(() => document.querySelectorAll("#messages .row").forEach(enhanceRow)).observe(box, { childList: true, subtree: true });
    document.querySelectorAll("#messages .row").forEach(enhanceRow);
  }

  function enhanceContactDetails() {
    const dialog = $("contactDetailsDialog");
    if (!dialog) return;
    const audioBtn = $("detailsAudioBtn");
    const videoBtn = $("detailsVideoBtn");
    if (audioBtn && !audioBtn.dataset.iconized) {
      audioBtn.dataset.iconized = "1";
      audioBtn.innerHTML = "📞 Audio";
    }
    if (videoBtn && !videoBtn.dataset.iconized) {
      videoBtn.dataset.iconized = "1";
      videoBtn.innerHTML = "📹 Video";
    }
    [audioBtn, videoBtn].forEach((btn) => {
      if (!btn || btn.dataset.debounce) return;
      btn.dataset.debounce = "1";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        setTimeout(() => { btn.disabled = false; }, 1500);
      }, true);
    });
    if (dialog.dataset.enhanced) return;
    dialog.dataset.enhanced = "1";
    const body = dialog.querySelector(".details-body");
    if (!body || body.querySelector(".details-groups")) return;
    const groups = document.createElement("div");
    groups.className = "details-groups";
    groups.innerHTML =
      "<h4>Conversation</h4>" +
      '<button type="button" data-c="msg"><span class="dg-icon">💬</span> Send message</button>' +
      '<button type="button" data-c="mute"><span class="dg-icon">🔔</span> <span class="mute-label">Mute notifications</span></button>' +
      '<button type="button" class="danger" data-c="hide"><span class="dg-icon">🗑️</span> Hide chat for me</button>' +
      "<h4>About</h4>" +
      '<div style="padding:8px 12px;color:var(--muted);font-size:0.9rem;text-align:left"><strong style="color:var(--text)">Username</strong><br><span id="detailsAboutUser"></span></div>';
    body.appendChild(groups);
    const un = $("detailsUsername");
    const about = $("detailsAboutUser");
    if (un && about) about.textContent = un.textContent || "—";
    const muteBtn = groups.querySelector('[data-c="mute"]');
    function syncMuteLabel() {
      try {
        const id = $("conversationName")?.textContent || "chat";
        const muted = localStorage.getItem("sc_muted_" + id) === "1";
        const lab = muteBtn?.querySelector(".mute-label");
        if (lab) lab.textContent = muted ? "Unmute notifications" : "Mute notifications";
      } catch {}
    }
    syncMuteLabel();
    groups.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "msg") {
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
        $("messageInput")?.focus();
      }
      if (c === "mute") {
        try {
          const id = $("conversationName")?.textContent || "chat";
          const key = "sc_muted_" + id;
          localStorage.setItem(key, localStorage.getItem(key) === "1" ? "0" : "1");
          syncMuteLabel();
          toast(localStorage.getItem(key) === "1" ? "Notifications muted" : "Notifications unmuted");
        } catch {}
      }
      if (c === "hide") {
        if (!confirm("Hide this chat for you? The other person keeps the conversation.")) return;
        const del = document.querySelector(".chat-item.active .delete-chat-btn");
        if (del) del.click();
        else toast("Use the trash icon on the chat list to hide");
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
      }
    });
  }

  let callTimer = null;
  let callStartedAt = null;
  function wireCallUI() {
    const dialog = $("callDialog");
    if (!dialog) return;
    if (!$("callDuration") && $("callStatus")) {
      const d = document.createElement("div");
      d.id = "callDuration";
      $("callStatus").parentNode.appendChild(d);
    }
    const flip = $("cameraFlipBtn");
    new MutationObserver(() => {
      if (dialog.open) {
        const status = ($("callStatus")?.textContent || "").toLowerCase();
        if (status.includes("connected") && !callStartedAt) {
          callStartedAt = Date.now();
          if (callTimer) clearInterval(callTimer);
          callTimer = setInterval(() => {
            const el = $("callDuration");
            if (!el || !callStartedAt) return;
            const s = Math.floor((Date.now() - callStartedAt) / 1000);
            el.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
          }, 1000);
        }
        const title = ($("callTitle")?.textContent || "").toLowerCase();
        if (flip) flip.classList.toggle("hidden", !title.includes("video"));
      } else {
        if (callTimer) clearInterval(callTimer);
        callTimer = null;
        callStartedAt = null;
        const el = $("callDuration");
        if (el) el.textContent = "";
      }
    }).observe(dialog, { attributes: true, childList: true, subtree: true });
  }

  function boot() {
    injectToolbar();
    ensureReplyBar();
    wireSendReply();
    observeMessages();
    enhanceContactDetails();
    wireCallUI();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 600));
  else setTimeout(boot, 600);
  setInterval(injectToolbar, 2500);
  setInterval(enhanceContactDetails, 3000);
  console.info("SimpleChat UI v2 active");
})();

(() => {
  const EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25"];
  let replyTarget = null;
  let openRow = null;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia("(max-width: 720px), (hover: none)").matches;

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 1800);
  }

  function ensureCss() {
    ["msg-actions.css?v=6", "mobile-fix.css?v=1", "layout-fix.css?v=2", "reply-mobile.css?v=3", "desktop-popups.css?v=3"].forEach((href) => {
      if (document.querySelector('link[href*="' + href.split("?")[0] + '"]')) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    });
  }

  function ensureReplyBar() {
    let bar = $("replyBar");
    if (bar) return bar;
    const form = $("messageForm");
    if (!form || !form.parentNode) return null;
    bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML =
      '<div class="reply-bar-body"><strong id="replyBarLabel">Replying</strong><span id="replyBarText"></span></div>' +
      '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel reply">\u2715</button>';
    form.parentNode.insertBefore(bar, form);
    return bar;
  }

  function clearReply() {
    replyTarget = null;
    if (typeof window.__scClearReply === "function") window.__scClearReply();
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }

  function setReply(msgId, text) {
    if (typeof window.__scSetReply === "function") {
      window.__scSetReply(msgId, text);
      return;
    }
    ensureReplyBar();
    const clean = String(text || "").replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
    replyTarget = { id: String(msgId), text: clean };
    const bar = $("replyBar");
    const form = $("messageForm");
    if (bar && form && form.parentNode && bar.nextElementSibling !== form) form.parentNode.insertBefore(bar, form);
    if (!bar) return;
    const label = $("replyBarLabel");
    const txt = $("replyBarText");
    if (label) label.textContent = "Replying";
    if (txt) txt.textContent = clean || "Message";
    bar.classList.add("active");
    const input = $("messageInput");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function ensureReactPicker() {
    let p = $("reactPicker");
    if (p) return p;
    p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.setAttribute("role", "listbox");
    p.innerHTML = EMOJIS.map((e) =>
      '<button type="button" data-emoji="' + e + '" aria-label="React ' + e + '">' + e + "</button>"
    ).join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.__scToggleReaction === "function") window.__scToggleReaction(p.dataset.msgId, b.dataset.emoji);
      else document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId: p.dataset.msgId, emoji: b.dataset.emoji } }));
      closeReact();
    });
    document.addEventListener("click", (e) => {
      if (!p.classList.contains("open")) return;
      if (p.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.msg-act[data-a="react"]')) return;
      closeReact();
    }, true);
    return p;
  }

  function closeReact() {
    const p = $("reactPicker");
    if (p) { p.classList.remove("open"); delete p.dataset.msgId; }
  }

  function openReactPicker(btn, msgId) {
    const p = ensureReactPicker();
    p.dataset.msgId = String(msgId);
    p.classList.add("open");
    requestAnimationFrame(() => {
      if (isMobile()) { p.style.left = ""; p.style.top = ""; return; }
      const r = btn.getBoundingClientRect();
      const pw = p.offsetWidth || 260;
      const ph = p.offsetHeight || 48;
      let left = r.left + r.width / 2 - pw / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
      let top = r.top - ph - 12;
      if (top < 12) top = r.bottom + 12;
      if (top + ph > window.innerHeight - 12) top = Math.max(12, window.innerHeight - ph - 12);
      p.style.left = left + "px";
      p.style.top = top + "px";
      p.style.right = "auto";
      p.style.bottom = "auto";
      p.style.transform = "none";
    });
  }

  function closeAllActions() {
    document.querySelectorAll("#messages .row.actions-open, #messages .row.show-actions").forEach((r) => {
      r.classList.remove("actions-open", "show-actions");
    });
    openRow = null;
  }

  function wireActions(row) {
    const acts = row.querySelector(".msg-actions");
    if (!acts || acts.dataset.fixed) return;
    acts.dataset.fixed = "1";
    acts.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const msgId = row.dataset.msgId || row.getAttribute("data-id") || "";
      const bubble = row.querySelector(".bubble");
      let text = ((bubble && bubble.textContent) || "").trim();
      text = text.replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "").trim();
      const action = b.dataset.a;
      if (action === "copy") {
        if (window.__scAllowCopyOnce) window.__scAllowCopyOnce();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
        } else toast("Copy failed");
      } else if (action === "reply") {
        if (typeof window.__scSetReply === "function") window.__scSetReply(msgId, text);
        else setReply(msgId, text);
        closeAllActions();
      } else if (action === "react") {
        openReactPicker(b, msgId);
      }
    }, true);
  }

  function ensureActions(row) {
    if (!row.querySelector(".bubble")) return;
    if (!row.dataset.msgId) {
      row.dataset.msgId = row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 9);
    }
    if (!row.querySelector(".msg-actions")) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">' +
        '<svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">' +
        '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      row.appendChild(acts);
    }
    wireActions(row);
  }

  function fixAlignment(row) {
    if (row.classList.contains("mine")) {
      row.style.justifyContent = "flex-end";
      row.style.flexDirection = "row";
    } else if (row.classList.contains("theirs")) {
      row.style.justifyContent = "flex-start";
      row.style.flexDirection = "row";
    }
  }

  let enhanceTimer = null;
  function enhanceAll() {
    if (enhanceTimer) return;
    enhanceTimer = requestAnimationFrame(() => {
      enhanceTimer = null;
      document.querySelectorAll("#messages .row").forEach((row) => {
        fixAlignment(row);
        ensureActions(row);
      });
    });
  }

  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyFixWired) return;
    form.dataset.replyFixWired = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget && !window.__scReplyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const t = replyTarget || window.__scReplyTarget;
      if (!t) return;
      if (input.value.startsWith("\u00ABreply:")) return;
      const prefix = "\u00ABreply:" + t.id + "\u00BB " + String(t.text || "").replace(/\n/g, " ").slice(0, 80);
      input.value = prefix + "\n" + input.value;
      setTimeout(clearReply, 0);
    }, true);
  }

  function wireMobileNav() {
    const layout = $("layout");
    const conv = $("conversationPanel");
    const welcome = $("welcomePanel");
    if (!layout) return;
    const sync = () => {
      const open = conv && !conv.classList.contains("hidden");
      layout.classList.toggle("in-chat", !!open);
      if (welcome) welcome.classList.toggle("hidden", !!open);
    };
    if (conv) new MutationObserver(sync).observe(conv, { attributes: true, attributeFilter: ["class"] });
    sync();
    const back = $("mobileBackBtn");
    if (back && !back.dataset.wired) {
      back.dataset.wired = "1";
      back.addEventListener("click", (e) => {
        e.preventDefault();
        if (conv) conv.classList.add("hidden");
        layout.classList.remove("in-chat");
        if (welcome) welcome.classList.remove("hidden");
        closeAllActions();
        closeReact();
        clearReply();
      });
    }
  }

  function boot() {
    ensureCss();
    ensureReplyBar();
    ensureReactPicker();
    wireSendReply();
    wireMobileNav();
    enhanceAll();
    const box = $("messages");
    if (box) new MutationObserver(() => enhanceAll()).observe(box, { childList: true });
    setTimeout(enhanceAll, 400);
    setTimeout(enhanceAll, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__scSetReply = window.__scSetReply || setReply;
  window.__scClearReply = window.__scClearReply || clearReply;
})();

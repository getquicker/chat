(() => {
  const EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25"];
  let replyTarget = null;
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 1800);
  }

  function ensureCss() {
    ["msg-actions.css?v=5", "layout-fix.css?v=2"].forEach((href) => {
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
    $("replyBarClose").onclick = () => clearReply();
    return bar;
  }

  function clearReply() {
    replyTarget = null;
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }

  function setReply(msgId, text) {
    ensureReplyBar();
    replyTarget = { id: String(msgId), text: String(text || "").slice(0, 120) };
    const bar = $("replyBar");
    const form = $("messageForm");
    if (bar && form && form.parentNode && bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
    if (!bar) return;
    const label = $("replyBarLabel");
    const txt = $("replyBarText");
    if (label) label.textContent = "Replying";
    if (txt) txt.textContent = replyTarget.text;
    bar.classList.add("active");
    const input = $("messageInput");
    if (input) {
      input.focus();
      try { input.click(); } catch (e) {}
    }
  }

  function ensureReactPicker() {
    let p = $("reactPicker");
    if (p) return p;
    p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.innerHTML = EMOJIS.map((e) =>
      '<button type="button" data-emoji="' + e + '">' + e + "</button>"
    ).join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      e.stopPropagation();
      if (typeof window.__scToggleReaction === "function") {
        window.__scToggleReaction(p.dataset.msgId, b.dataset.emoji);
      } else {
        document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId: p.dataset.msgId, emoji: b.dataset.emoji } }));
      }
      p.classList.remove("open");
    });
    document.addEventListener("click", (e) => {
      if (!p.classList.contains("open")) return;
      if (p.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.msg-act[data-a="react"]')) return;
      p.classList.remove("open");
    });
    return p;
  }

  function openReactPicker(btn, msgId) {
    const p = ensureReactPicker();
    p.dataset.msgId = String(msgId);
    p.classList.add("open");
    requestAnimationFrame(() => {
      const r = btn.getBoundingClientRect();
      const pw = p.offsetWidth || 220;
      const ph = p.offsetHeight || 48;
      let left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8));
      let top = r.top - ph - 10;
      if (top < 8) top = r.bottom + 10;
      p.style.left = left + "px";
      p.style.top = top + "px";
    });
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
      const text = ((bubble && bubble.textContent) || "").trim();
      const action = b.dataset.a;
      if (action === "copy") {
        if (window.__scAllowCopyOnce) window.__scAllowCopyOnce();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
        } else toast("Copy failed");
      } else if (action === "reply") {
        setReply(msgId, text);
      } else if (action === "react") {
        openReactPicker(b, msgId);
      }
    }, true);
  }

  function fixAlignment(row) {
    if (!row) return;
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
        if (!row.dataset.msgId) {
          row.dataset.msgId = row.getAttribute("data-id") || ("dom-" + Math.random().toString(36).slice(2, 9));
        }
        fixAlignment(row);
        if (!row.querySelector(".msg-actions") && row.querySelector(".bubble")) {
          const acts = document.createElement("div");
          acts.className = "msg-actions";
          acts.innerHTML =
            '<button type="button" class="msg-act" data-a="reply" title="Reply">\u21A9</button>' +
            '<button type="button" class="msg-act" data-a="react" title="React">\uD83D\uDE0A</button>' +
            '<button type="button" class="msg-act" data-a="copy" title="Copy">\u29C9</button>';
          row.appendChild(acts);
        }
        wireActions(row);
      });
    });
  }

  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyFixWired) return;
    form.dataset.replyFixWired = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const meta =
        "\u00ABreply:" +
        replyTarget.id +
        "\u00BB " +
        replyTarget.text.replace(/\n/g, " ").slice(0, 80);
      if (!input.value.startsWith("\u00ABreply:")) {
        input.value = meta + "\n" + input.value;
      }
      setTimeout(clearReply, 0);
    }, true);
  }

  function boot() {
    ensureCss();
    ensureReplyBar();
    ensureReactPicker();
    wireSendReply();
    enhanceAll();
    const box = $("messages");
    if (box) {
      new MutationObserver(() => enhanceAll()).observe(box, { childList: true });
    }
    setTimeout(enhanceAll, 400);
    setTimeout(enhanceAll, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__scSetReply = setReply;
  window.__scClearReply = clearReply;
})();

(() => {
  const $ = (id) => document.getElementById(id);
  const REPLY_RE = /(?:\u00AB|<)reply:([^\u00BB>]*)(?:\u00BB|>)\s*([^\n]*)(?:\n|$)/i;

  function ensureBar() {
    let bar = $("replyBar");
    const form = $("messageForm");
    if (!form || !form.parentNode) return bar || null;

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "replyBar";
      bar.className = "reply-bar";
      bar.setAttribute("role", "status");
      bar.innerHTML =
        '<div class="reply-bar-body">' +
        '<strong id="replyBarLabel" class="reply-bar-label">Replying</strong>' +
        '<span id="replyBarText"></span>' +
        "</div>" +
        '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel reply">\u2715</button>';
      form.parentNode.insertBefore(bar, form);
    } else if (bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
    return bar;
  }

  function placeBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (!form || !bar || !form.parentNode) return;
    if (bar.parentNode !== form.parentNode || bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
  }

  function clearReply() {
    window.__scReplyTarget = null;
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }

  function setReply(msgId, text) {
    const bar = ensureBar();
    placeBar();
    const clean = String(text || "")
      .replace(/(?:\u00AB|<)reply:[^\u00BB>]*(?:\u00BB|>)\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    window.__scReplyTarget = { id: String(msgId || ""), text: clean };

    if (!bar) return;
    const label = $("replyBarLabel");
    const txt = $("replyBarText");
    if (label) label.textContent = "Replying";
    if (txt) txt.textContent = clean || "Message";
    bar.classList.add("active");

    const input = $("messageInput");
    if (input) {
      setTimeout(() => {
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
      }, 40);
    }
  }

  function wireClose() {
    ensureBar();
    const btn = $("replyBarClose");
    if (!btn || btn.dataset.replyCloseWired) return;
    btn.dataset.replyCloseWired = "1";
    const close = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearReply();
    };
    btn.addEventListener("click", close);
    btn.addEventListener("touchend", close, { passive: false });
  }

  function wireSubmit() {
    const form = $("messageForm");
    if (!form || form.dataset.replyMobileWired) return;
    form.dataset.replyMobileWired = "1";
    form.addEventListener(
      "submit",
      () => {
        const target = window.__scReplyTarget;
        if (!target) return;
        const input = $("messageInput");
        if (!input || !input.value.trim()) return;
        const preview = String(target.text || "").replace(/\n/g, " ").slice(0, 80);
        const prefix = "\u00ABreply:" + target.id + "\u00BB " + preview;
        if (!/(?:\u00AB|<)reply:/i.test(input.value)) {
          input.value = prefix + "\n" + input.value;
        }
        setTimeout(clearReply, 0);
      },
      true
    );
  }

  function enhanceQuotes() {
    document.querySelectorAll("#messages .bubble").forEach((bubble) => {
      const source = bubble.dataset.replyEnhanced
        ? bubble.dataset.replyRaw || ""
        : bubble.textContent || "";
      if (bubble.dataset.replyEnhanced && bubble.querySelector(".reply-quote")) return;

      const m = source.match(REPLY_RE);
      if (!m) return;

      bubble.dataset.replyRaw = source;
      bubble.dataset.replyEnhanced = "1";

      const quoteText = (m[2] || "").trim() || "Original message";
      const rest = source.replace(REPLY_RE, "").trim();

      bubble.innerHTML = "";

      const q = document.createElement("div");
      q.className = "reply-quote";

      const lab = document.createElement("span");
      lab.className = "reply-quote-label";
      lab.textContent = "Replying to";

      const qt = document.createElement("span");
      qt.className = "reply-quote-text";
      qt.textContent = quoteText;

      q.appendChild(lab);
      q.appendChild(qt);
      bubble.appendChild(q);

      if (rest) {
        const body = document.createElement("div");
        body.className = "bubble-body";
        body.textContent = rest;
        bubble.appendChild(body);
      }

      bubble.style.writingMode = "horizontal-tb";
      bubble.style.display = "block";
      bubble.style.width = "max-content";
      bubble.style.maxWidth = "min(78%, 420px)";
    });
  }

  function ensureCss() {
    if (document.querySelector('link[href*="reply-mobile.css"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "reply-mobile.css?v=7";
    document.head.appendChild(l);
  }

  function boot() {
    ensureCss();
    ensureBar();
    placeBar();
    wireClose();
    wireSubmit();
    enhanceQuotes();
    window.__scSetReply = setReply;
    window.__scClearReply = clearReply;

    const box = $("messages");
    if (box) {
      new MutationObserver(() => enhanceQuotes()).observe(box, { childList: true, subtree: true });
    }

    const conv = $("conversationPanel");
    if (conv) {
      new MutationObserver(() => {
        placeBar();
        wireClose();
      }).observe(conv, { childList: true, subtree: true });
    }

    setTimeout(enhanceQuotes, 300);
    setTimeout(enhanceQuotes, 900);
    setTimeout(enhanceQuotes, 2000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

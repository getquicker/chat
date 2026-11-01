(() => {
  if (!document.querySelector('link[href*="bubble-fix.css"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "bubble-fix.css?v=2";
    document.head.appendChild(l);
  }

  const REPLY_RE = /(?:\u00AB|<)reply:([^\u00BB>]*)(?:\u00BB|>)\s*([^\n]*)(?:\n|$)/i;

  function forceHorizontal(el) {
    if (!el || !el.style) return;
    el.style.setProperty("writing-mode", "horizontal-tb", "important");
    el.style.setProperty("direction", "ltr", "important");
    el.style.setProperty("text-orientation", "mixed", "important");
    el.style.setProperty("word-break", "normal", "important");
  }

  function repairBubble(b) {
    if (!b) return;
    forceHorizontal(b);
    b.style.setProperty("display", "inline-block", "important");
    b.style.setProperty("width", "auto", "important");
    b.style.setProperty("min-width", "7.5rem", "important");
    b.style.setProperty("max-width", "min(78%, 420px)", "important");
    b.style.setProperty("white-space", "pre-wrap", "important");

    if (!b.querySelector(".reply-quote")) {
      const source = b.textContent || "";
      const m = source.match(REPLY_RE);
      if (m) {
        const quoteText = (m[2] || "").trim() || "Message";
        const rest = source.replace(REPLY_RE, "").trim();
        b.textContent = "";
        const q = document.createElement("div");
        q.className = "reply-quote";
        const lab = document.createElement("div");
        lab.className = "reply-quote-label";
        lab.textContent = "Replying to";
        const qt = document.createElement("div");
        qt.className = "reply-quote-text";
        qt.textContent = quoteText;
        q.appendChild(lab);
        q.appendChild(qt);
        b.appendChild(q);
        if (rest) {
          const body = document.createElement("div");
          body.className = "bubble-body";
          body.textContent = rest;
          b.appendChild(body);
        }
      }
    }

    b.querySelectorAll(".reply-quote-label").forEach((lab) => {
      const t = (lab.textContent || "").replace(/\s+/g, "");
      if (/^replyingto$/i.test(t)) lab.textContent = "Replying to";
      forceHorizontal(lab);
      lab.style.setProperty("white-space", "nowrap", "important");
      lab.style.setProperty("display", "block", "important");
    });

    b.querySelectorAll(".reply-quote, .reply-quote-text, .bubble-body").forEach((el) => {
      forceHorizontal(el);
      if (el.classList.contains("reply-quote")) {
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("min-width", "9rem", "important");
        el.style.setProperty("width", "max-content", "important");
        el.style.setProperty("max-width", "min(16rem, 70vw)", "important");
      }
      if (el.classList.contains("reply-quote-text")) {
        el.style.setProperty("white-space", "nowrap", "important");
        el.style.setProperty("overflow", "hidden", "important");
        el.style.setProperty("text-overflow", "ellipsis", "important");
      }
    });
  }

  function repairAll() {
    document.querySelectorAll("#messages .bubble").forEach(repairBubble);
  }

  repairAll();
  const box = document.getElementById("messages");
  if (box) {
    new MutationObserver(() => repairAll()).observe(box, { childList: true, subtree: true });
  }
  [300, 800, 1600, 3200].forEach((ms) => setTimeout(repairAll, ms));
})();

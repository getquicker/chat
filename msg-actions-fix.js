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
    ["msg-actions.css?v=6", "mobile-fix.css?v=1", "layout-fix.css?v=2"].forEach((href) => {
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
    bar.querySelector("#replyBarClose").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearReply();
    };
    return bar;
  }

  function clearReply() {
    replyTarget = null;
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }

  function setReply(msgId, text) {
    ensureReplyBar();
    const clean = String(text || "")
      .replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    replyTarget = { id: String(msgId), text: clean };
    const bar = $("replyBar");
    const form = $("messageForm");
    if (bar && form && form.parentNode && bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
    if (!bar) return;
    const label = $("replyBarLabel");
    const txt = $("replyBarText");
    if (label) label.textContent = "Replying";
    if (txt) txt.textContent = clean || "Message";
    bar.classList.add("active");
    const input = $("messageInput");
    if (input) {
      setTimeout(() => {
        input.focus();
        try { input.click(); } catch (e) {}
      }, 50);
    }
  }

  function ensureReactPicker() {
    let p = $("reactPicker");
    if (p) return p;
    p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.setAttribute("role", "listbox");
    p.innerHTML = EMOJIS.map(
      (e) => '<button type="button" data-emoji="' + e + '" aria-label="React ' + e + '">' + e + "</button>"
    ).join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      e.preventDefault();
      e.stopPropagation();
      const msgId = p.dataset.msgId;
      const emoji = b.dataset.emoji;
      if (typeof window.__scToggleReaction === "function") {
        window.__scToggleReaction(msgId, emoji);
      } else {
        document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId, emoji } }));
      }
      closeReact();
    });
    document.addEventListener(
      "click",
      (e) => {
        if (!p.classList.contains("open")) return;
        if (p.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.msg-act[data-a="react"]')) return;
        closeReact();
      },
      true
    );
    return p;
  }

  function closeReact() {
    const p = $("reactPicker");
    if (p) {
      p.classList.remove("open");
      delete p.dataset.msgId;
    }
  }

  function openReactPicker(btn, msgId) {
    const p = ensureReactPicker();
    p.dataset.msgId = String(msgId);
    p.classList.add("open");
    requestAnimationFrame(() => {
      if (isMobile()) {
        p.style.left = "";
        p.style.top = "";
        return;
      }
      const r = btn.getBoundingClientRect();
      const pw = p.offsetWidth || 240;
      const ph = p.offsetHeight || 52;
      let left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8));
      let top = r.top - ph - 10;
      if (top < 8) top = r.bottom + 10;
      p.style.left = left + "px";
      p.style.top = top + "px";
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
    acts.addEventListener(
      "click",
      (e) => {
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
          setReply(msgId, text);
          closeAllActions();
        } else if (action === "react") {
          openReactPicker(b, msgId);
        }
      },
      true
    );

    let pressTimer = null;
    const bubble = row.querySelector(".bubble");
    if (bubble) {
      bubble.addEventListener(
        "touchstart",
        () => {
          if (!isMobile()) return;
          pressTimer = setTimeout(() => {
            closeAllActions();
            row.classList.add("actions-open", "show-actions");
            openRow = row;
            try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) {}
          }, 420);
        },
        { passive: true }
      );
      const cancel = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };
      bubble.addEventListener("touchend", cancel, { passive: true });
      bubble.addEventListener("touchmove", cancel, { passive: true });
      bubble.addEventListener("touchcancel", cancel, { passive: true });

      let lastTap = 0;
      bubble.addEventListener(
        "click",
        (e) => {
          if (!isMobile()) return;
          const now = Date.now();
          if (now - lastTap < 320) {
            e.preventDefault();
            e.stopPropagation();
            const msgId = row.dataset.msgId || row.getAttribute("data-id") || "";
            if (typeof window.__scToggleReaction === "function") {
              window.__scToggleReaction(msgId, "\u2764\uFE0F");
            }
            lastTap = 0;
          } else {
            lastTap = now;
          }
        },
        true
      );
    }
  }

  function ensureActions(row) {
    if (!row.querySelector(".bubble")) return;
    if (!row.dataset.msgId) {
      row.dataset.msgId =
        row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 9);
    }
    if (!row.querySelector(".msg-actions")) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">\u21A9</button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">\uD83D\uDE0A</button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">\u29C9</button>';
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
    form.addEventListener(
      "submit",
      () => {
        if (!replyTarget) return;
        const input = $("messageInput");
        if (!input || !input.value.trim()) return;
        const prefix =
          "\u00ABreply:" +
          replyTarget.id +
          "\u00BB " +
          replyTarget.text.replace(/\n/g, " ").slice(0, 80);
        if (!input.value.startsWith("\u00ABreply:")) {
          input.value = prefix + "\n" + input.value;
        }
        setTimeout(clearReply, 0);
      },
      true
    );
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

    if (conv) {
      new MutationObserver(sync).observe(conv, { attributes: true, attributeFilter: ["class"] });
    }
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

    document.addEventListener(
      "click",
      (e) => {
        if (!openRow) return;
        if (e.target.closest && e.target.closest("#messages .row.actions-open")) return;
        if (e.target.closest && e.target.closest("#reactPicker")) return;
        closeAllActions();
      },
      true
    );
  }

  function boot() {
    ensureCss();
    ensureReplyBar();
    ensureReactPicker();
    wireSendReply();
    wireMobileNav();
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

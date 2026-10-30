/**
 * WhatsApp-style message actions: fixed bar (never clipped),
 * react / reply / copy in one place.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = "toast"; }, 1800);
  }

  function parseBody(raw) {
    if (!raw) return { reply: null, text: "" };
    if (!raw.startsWith("«reply:")) return { reply: null, text: raw };
    const nl = raw.indexOf("\n");
    if (nl > 0) {
      const hm = raw.slice(0, nl).match(/^«reply:([^»]+)»\s*(.*)$/);
      if (hm) return { reply: { id: hm[1], preview: hm[2] }, text: raw.slice(nl + 1) };
    }
    const m = raw.match(/^«reply:([^»]+)»\s*([\s\S]*)$/);
    if (m) return { reply: { id: m[1], preview: (m[2] || "").slice(0, 80) }, text: m[2] || "" };
    return { reply: null, text: raw };
  }

  let replyTarget = null;
  let activeRow = null;

  function ensureReplyBar() {
    let bar = $("replyBar");
    if (bar) return bar;
    const form = $("messageForm");
    if (!form || !form.parentNode) return null;
    bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML =
      '<div class="reply-bar-accent"></div>' +
      '<div class="reply-bar-body"><strong id="replyBarLabel">Replying</strong><span id="replyBarText"></span></div>' +
      '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel">✕</button>';
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
    replyTarget = { id: msgId, text: (text || "").replace(/\s+/g, " ").trim().slice(0, 120) };
    const bar = $("replyBar");
    if (!bar) return;
    $("replyBarLabel").textContent = "Replying";
    $("replyBarText").textContent = replyTarget.text || "Message";
    bar.classList.add("active");
    const input = $("messageInput");
    if (input) input.focus();
  }

  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyWiredV2 === "1") return;
    form.dataset.replyWiredV2 = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const meta = "«reply:" + replyTarget.id + "» " + replyTarget.text.replace(/\n/g, " ").slice(0, 80);
      if (!input.value.startsWith("«reply:")) input.value = meta + "\n" + input.value;
      setTimeout(clearReply, 0);
    }, true);
  }

  function ensureBar() {
    let bar = $("waMsgBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "waMsgBar";
    bar.className = "wa-msg-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Message actions");
    const emojiBtns = EMOJIS.map(
      (e) => '<button type="button" data-emoji="' + e + '" title="' + e + '">' + e + "</button>"
    ).join("");
    bar.innerHTML =
      emojiBtns +
      '<span class="wa-sep" aria-hidden="true"></span>' +
      '<button type="button" class="wa-act" data-a="reply" title="Reply" aria-label="Reply">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h12a4 4 0 010 8h-1"/></svg>' +
      "</button>" +
      '<button type="button" class="wa-act" data-a="copy" title="Copy" aria-label="Copy">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
      "</button>";
    document.body.appendChild(bar);

    bar.addEventListener("click", (e) => {
      const emojiBtn = e.target.closest("[data-emoji]");
      const actBtn = e.target.closest("[data-a]");
      if (!activeRow) return;
      const msgId = activeRow.dataset.msgId;
      const bubble = activeRow.querySelector(".bubble");
      const text = getRowText(activeRow, bubble);

      if (emojiBtn) {
        e.stopPropagation();
        if (window.SimpleChatReactions && window.SimpleChatReactions.toggle) {
          window.SimpleChatReactions.toggle(msgId, emojiBtn.dataset.emoji, activeRow);
        }
        hideBar();
        return;
      }
      if (actBtn) {
        e.stopPropagation();
        if (actBtn.dataset.a === "reply") {
          setReply(msgId, text);
          hideBar();
        } else if (actBtn.dataset.a === "copy") {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
          } else toast("Copy not available");
          hideBar();
        }
      }
    });
    return bar;
  }

  function getRowText(row, bubble) {
    if (!bubble) bubble = row.querySelector(".bubble");
    const raw = (bubble && bubble.dataset.raw) || (bubble && bubble.textContent) || "";
    const parsed = parseBody(raw);
    const bt = bubble && bubble.querySelector(".bubble-text");
    return (parsed.text || (bt && bt.textContent) || raw || "")
      .replace(/^«reply:[^»]*»\s*/m, "")
      .trim();
  }

  function showBar(row) {
    const bar = ensureBar();
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;
    activeRow = row;

    if (!row.dataset.msgId) {
      row.dataset.msgId = row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 10);
    }

    bar.classList.add("open");
    const br = bubble.getBoundingClientRect();
    const bw = bar.offsetWidth || 320;
    const bh = bar.offsetHeight || 48;

    let top = br.top - bh - 8;
    if (top < 8) top = br.bottom + 8;
    if (top + bh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - bh - 8);

    let left = br.left + br.width / 2 - bw / 2;
    if (row.classList.contains("mine")) {
      left = br.right - bw;
    } else {
      left = br.left;
    }
    if (left < 8) left = 8;
    if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;

    bar.style.left = left + "px";
    bar.style.top = top + "px";
  }

  function hideBar() {
    const bar = $("waMsgBar");
    if (bar) bar.classList.remove("open");
    activeRow = null;
  }

  function enhanceRow(row) {
    if (!row || !row.classList.contains("row")) return;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;

    if (!row.dataset.msgId) {
      row.dataset.msgId = row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 10);
    }

    if (!bubble.dataset.raw) bubble.dataset.raw = bubble.textContent || "";
    const parsed = parseBody(bubble.dataset.raw);

    row.querySelectorAll(":scope > .reply-preview").forEach((el) => el.remove());
    if (parsed.reply) {
      let rp = bubble.querySelector(".reply-preview");
      if (!rp) {
        rp = document.createElement("div");
        rp.className = "reply-preview";
        bubble.insertBefore(rp, bubble.firstChild);
      }
      rp.textContent = parsed.reply.preview || "Original message";
      let bt = bubble.querySelector(".bubble-text");
      if (!bt) {
        bt = document.createElement("span");
        bt.className = "bubble-text";
        bubble.appendChild(bt);
      }
      bt.textContent = parsed.text;
      for (const n of [...bubble.childNodes]) {
        if (n.nodeType === 3) n.textContent = "";
      }
    }

    const oldActs = row.querySelector(":scope > .msg-actions");
    if (oldActs) oldActs.remove();

    if (row.dataset.waBound) return;
    row.dataset.waBound = "1";

    let hoverTimer;
    row.addEventListener("mouseenter", () => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => showBar(row), 280);
      }
    });
    row.addEventListener("mouseleave", (e) => {
      clearTimeout(hoverTimer);
      const bar = $("waMsgBar");
      const to = e.relatedTarget;
      if (bar && to && bar.contains(to)) return;
      setTimeout(() => {
        if (activeRow === row && bar && !bar.matches(":hover")) hideBar();
      }, 200);
    });

    let pressTimer;
    row.addEventListener("touchstart", (e) => {
      if (e.target.closest(".reaction-chip")) return;
      pressTimer = setTimeout(() => {
        showBar(row);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 400);
    }, { passive: true });
    row.addEventListener("touchend", () => clearTimeout(pressTimer));
    row.addEventListener("touchmove", () => clearTimeout(pressTimer));
    row.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".bubble") || e.target.closest(".row")) {
        e.preventDefault();
        showBar(row);
      }
    });
  }

  function scan() {
    document.querySelectorAll("#messages .row").forEach(enhanceRow);
  }

  function init() {
    if (!document.querySelector('link[href*="msg-actions-fix.css"]')) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "msg-actions-fix.css?v=2";
      document.head.appendChild(l);
    }

    wireSendReply();
    ensureReplyBar();
    ensureBar();

    const box = $("messages");
    if (box) {
      let t;
      new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(scan, 40);
      }).observe(box, { childList: true, subtree: true });
    }
    scan();

    document.addEventListener("click", (e) => {
      const bar = $("waMsgBar");
      if (!bar || !bar.classList.contains("open")) return;
      if (e.target.closest("#waMsgBar")) return;
      if (e.target.closest("#messages .row") && activeRow && activeRow.contains(e.target)) return;
      hideBar();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideBar();
        clearReply();
      }
    });
    const msgBox = $("messages");
    if (msgBox) {
      msgBox.addEventListener("scroll", () => hideBar(), { passive: true });
    }
    window.addEventListener("resize", () => hideBar());

    setTimeout(scan, 400);
    setTimeout(scan, 1200);
    console.info("[kurakani] WhatsApp-style message actions ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

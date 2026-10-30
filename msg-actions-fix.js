/**
 * Kurakani — reply / react / copy cleanup (compact)
 * Load after ui-v2.js and reactions.js
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = "toast"; }, 2000);
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

  function ensureReactPicker() {
    let p = $("reactPicker");
    if (p) return p;
    p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.innerHTML = EMOJIS.map((e) => '<button type="button" data-emoji="' + e + '">' + e + "</button>").join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      e.stopPropagation();
      const msgId = p.dataset.msgId;
      const row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
      if (window.SimpleChatReactions && window.SimpleChatReactions.toggle) {
        window.SimpleChatReactions.toggle(msgId, b.dataset.emoji, row);
      }
      p.classList.remove("open");
    });
    return p;
  }

  function openReactPicker(anchor, msgId) {
    const p = ensureReactPicker();
    p.dataset.msgId = msgId;
    p.classList.add("open");
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth || 220;
    let left = r.left + r.width / 2 - pw / 2;
    let top = r.top - 52;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 8) top = r.bottom + 8;
    p.style.left = left + "px";
    p.style.top = top + "px";
  }

  function enhanceRow(row) {
    if (!row || !row.classList.contains("row")) return;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;

    if (!row.dataset.msgId) {
      row.dataset.msgId = row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 10);
    }
    const msgId = row.dataset.msgId;

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

    let acts = row.querySelector(":scope > .msg-actions");
    if (!acts) {
      acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">↩</button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">☺</button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">⧉</button>';
      row.appendChild(acts);
      acts.addEventListener("click", (e) => {
        const b = e.target.closest("[data-a]");
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        const bt = bubble.querySelector(".bubble-text");
        const text = (parsed.text || (bt && bt.textContent) || bubble.textContent || "")
          .replace(/^«reply:[^»]*»\s*/m, "")
          .trim();
        const id = row.dataset.msgId || msgId;
        if (b.dataset.a === "copy") {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { toast("Copied"); }).catch(function () { toast("Copy failed"); });
          } else toast("Copy not available");
        } else if (b.dataset.a === "reply") {
          setReply(id, text);
        } else if (b.dataset.a === "react") {
          openReactPicker(b, id);
        }
      });
    }

    if (!row.dataset.touchAct) {
      row.dataset.touchAct = "1";
      let timer;
      row.addEventListener("touchstart", function () {
        timer = setTimeout(function () {
          document.querySelectorAll("#messages .row.show-actions").forEach(function (r) {
            r.classList.remove("show-actions");
          });
          row.classList.add("show-actions");
        }, 420);
      }, { passive: true });
      row.addEventListener("touchend", function () { clearTimeout(timer); });
      row.addEventListener("touchmove", function () { clearTimeout(timer); });
    }
  }

  function scan() {
    document.querySelectorAll("#messages .row").forEach(enhanceRow);
  }

  function init() {
    wireSendReply();
    ensureReactPicker();
    ensureReplyBar();
    const box = $("messages");
    if (box) {
      let t;
      new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(scan, 40);
      }).observe(box, { childList: true, subtree: true });
    }
    scan();
    document.addEventListener("click", function (e) {
      const t = e.target;
      if (!t.closest || (!t.closest("#reactPicker") && !t.closest('.msg-act[data-a="react"]'))) {
        const p = $("reactPicker");
        if (p) p.classList.remove("open");
      }
      if (!t.closest || !t.closest("#messages .row")) {
        document.querySelectorAll("#messages .row.show-actions").forEach(function (r) {
          r.classList.remove("show-actions");
        });
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        const p = $("reactPicker");
        if (p) p.classList.remove("open");
        clearReply();
      }
    });
    setTimeout(scan, 500);
    setTimeout(scan, 1200);
    console.info("[kurakani] reply/react/copy fixed");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

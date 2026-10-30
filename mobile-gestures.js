(() => {
  const EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25"];
  const LONG_MS = 400;
  const SWIPE_THRESHOLD = 64;
  const $ = (id) => document.getElementById(id);
  const isTouchUI = () =>
    window.matchMedia("(max-width: 720px), (hover: none) and (pointer: coarse)").matches;

  let sheetMsgId = "";
  let sheetText = "";
  let activeRow = null;

  function ensureCss() {
    if (document.querySelector('link[href*="mobile-gestures.css"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "mobile-gestures.css?v=1";
    document.head.appendChild(l);
  }

  function ensureSheet() {
    let backdrop = $("msgSheetBackdrop");
    let sheet = $("msgSheet");
    if (backdrop && sheet) return sheet;

    backdrop = document.createElement("div");
    backdrop.id = "msgSheetBackdrop";
    backdrop.addEventListener("click", closeSheet);

    sheet = document.createElement("div");
    sheet.id = "msgSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Message options");
    sheet.innerHTML =
      '<div class="sheet-handle"></div>' +
      '<div class="sheet-reactions">' +
      EMOJIS.map(
        (e) =>
          '<button type="button" data-emoji="' +
          e +
          '" aria-label="React ' +
          e +
          '">' +
          e +
          "</button>"
      ).join("") +
      "</div>" +
      '<div class="sheet-actions">' +
      '<button type="button" class="sheet-act" data-act="reply"><span class="ico">\u21A9</span> Reply</button>' +
      '<button type="button" class="sheet-act" data-act="copy"><span class="ico">\u29C9</span> Copy</button>' +
      "</div>" +
      '<button type="button" class="sheet-cancel" data-act="cancel">Cancel</button>';

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    sheet.addEventListener("click", (e) => {
      const emojiBtn = e.target.closest("[data-emoji]");
      if (emojiBtn) {
        e.preventDefault();
        react(sheetMsgId, emojiBtn.dataset.emoji);
        closeSheet();
        return;
      }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      e.preventDefault();
      const a = act.dataset.act;
      if (a === "reply") {
        doReply(sheetMsgId, sheetText);
        closeSheet();
      } else if (a === "copy") {
        doCopy(sheetText);
        closeSheet();
      } else if (a === "cancel") {
        closeSheet();
      }
    });

    return sheet;
  }

  function openSheet(msgId, text, row) {
    if (!isTouchUI()) return;
    ensureSheet();
    sheetMsgId = String(msgId || "");
    sheetText = String(text || "")
      .replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    activeRow = row || null;
    const backdrop = $("msgSheetBackdrop");
    const sheet = $("msgSheet");
    backdrop.classList.add("open");
    sheet.style.display = "block";
    requestAnimationFrame(() => {
      sheet.classList.add("open");
    });
    try {
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) {}
  }

  function closeSheet() {
    const backdrop = $("msgSheetBackdrop");
    const sheet = $("msgSheet");
    if (sheet) sheet.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
    setTimeout(() => {
      if (sheet && !sheet.classList.contains("open")) sheet.style.display = "none";
    }, 280);
    activeRow = null;
  }

  function doReply(msgId, text) {
    if (typeof window.__scSetReply === "function") {
      window.__scSetReply(msgId, text);
    } else {
      document.dispatchEvent(new CustomEvent("sc-reply", { detail: { msgId, text } }));
    }
  }

  function doCopy(text) {
    if (window.__scAllowCopyOnce) window.__scAllowCopyOnce();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
    } else toast("Copy failed");
  }

  function react(msgId, emoji) {
    if (typeof window.__scToggleReaction === "function") {
      window.__scToggleReaction(msgId, emoji);
    } else {
      document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId, emoji } }));
    }
  }

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 1600);
  }

  function rowMeta(row) {
    const msgId = row.dataset.msgId || row.getAttribute("data-id") || "";
    const bubble = row.querySelector(".bubble");
    let text = ((bubble && bubble.textContent) || "").trim();
    text = text.replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "").trim();
    return { msgId, text, bubble };
  }

  function bindRow(row) {
    if (!row || row.dataset.gesturesBound) return;
    if (!row.querySelector(".bubble")) return;
    row.dataset.gesturesBound = "1";

    if (!row.querySelector(".swipe-reply-hint")) {
      const hint = document.createElement("div");
      hint.className = "swipe-reply-hint";
      hint.textContent = "\u21A9";
      hint.setAttribute("aria-hidden", "true");
      row.appendChild(hint);
    }

    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let tracking = false;
    let swiping = false;
    let longFired = false;

    const clearPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const resetSwipe = () => {
      row.classList.remove("swiping");
      row.style.transform = "";
      swiping = false;
      tracking = false;
      dx = 0;
      dy = 0;
    };

    row.addEventListener(
      "touchstart",
      (e) => {
        if (!isTouchUI()) return;
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        dx = 0;
        dy = 0;
        tracking = true;
        swiping = false;
        longFired = false;
        clearPress();
        pressTimer = setTimeout(() => {
          if (!tracking || swiping) return;
          longFired = true;
          const { msgId, text } = rowMeta(row);
          openSheet(msgId, text, row);
        }, LONG_MS);
      },
      { passive: true }
    );

    row.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking || !isTouchUI()) return;
        const t = e.touches[0];
        dx = t.clientX - startX;
        dy = t.clientY - startY;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearPress();

        if (!swiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
          resetSwipe();
          return;
        }

        const absX = Math.abs(dx);
        if (absX > 14 && absX > Math.abs(dy)) {
          swiping = true;
          row.classList.add("swiping");
          const max = 88;
          const shift = Math.max(-max, Math.min(max, dx));
          row.style.transform = "translateX(" + shift + "px)";
          if (absX > 20 && e.cancelable) e.preventDefault();
        }
      },
      { passive: false }
    );

    const endTouch = () => {
      clearPress();
      if (!tracking) return;
      if (swiping && Math.abs(dx) >= SWIPE_THRESHOLD && !longFired) {
        const { msgId, text } = rowMeta(row);
        doReply(msgId, text);
      }
      resetSwipe();
      setTimeout(() => { longFired = false; }, 200);
    };

    row.addEventListener("touchend", endTouch, { passive: true });
    row.addEventListener("touchcancel", endTouch, { passive: true });
  }

  function bindAll() {
    if (!isTouchUI()) return;
    document.querySelectorAll("#messages .row").forEach(bindRow);
  }

  function boot() {
    ensureCss();
    ensureSheet();
    bindAll();
    const box = $("messages");
    if (box) {
      new MutationObserver(() => bindAll()).observe(box, { childList: true });
    }
    setTimeout(bindAll, 500);
    setTimeout(bindAll, 1500);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheet();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__scOpenMsgSheet = openSheet;
  window.__scCloseMsgSheet = closeSheet;
})();

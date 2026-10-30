(() => {
  const EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25"];
  const LONG_MS = 380;
  const SWIPE_THRESHOLD = 60;
  const $ = (id) => document.getElementById(id);

  let sheetMsgId = "";
  let sheetText = "";

  function ensureCss() {
    ["mobile-gestures.css?v=2", "desktop-popups.css?v=1"].forEach((href) => {
      if (document.querySelector('link[href*="' + href.split("?")[0] + '"]')) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    });
  }

  function clearSelection() {
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    } catch (e) {}
  }

  function ensureSheet() {
    let backdrop = $("msgSheetBackdrop");
    let sheet = $("msgSheet");
    if (backdrop && sheet) return sheet;

    backdrop = document.createElement("div");
    backdrop.id = "msgSheetBackdrop";
    backdrop.addEventListener("click", (e) => { e.preventDefault(); closeSheet(); }, true);
    backdrop.addEventListener("touchend", (e) => { e.preventDefault(); closeSheet(); }, { passive: false });

    sheet = document.createElement("div");
    sheet.id = "msgSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Message options");
    sheet.innerHTML =
      '<div class="sheet-handle"></div>' +
      '<div class="sheet-reactions">' +
      EMOJIS.map((e) =>
        '<button type="button" data-emoji="' + e + '" aria-label="React ' + e + '">' + e + "</button>"
      ).join("") +
      "</div>" +
      '<div class="sheet-actions">' +
      '<button type="button" class="sheet-act" data-act="reply"><span class="ico">\u21A9</span> Reply</button>' +
      '<button type="button" class="sheet-act" data-act="copy"><span class="ico">\u29C9</span> Copy</button>' +
      "</div>" +
      '<button type="button" class="sheet-cancel" data-act="cancel">Cancel</button>';

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const onAct = (e) => {
      const emojiBtn = e.target.closest("[data-emoji]");
      if (emojiBtn) {
        e.preventDefault();
        e.stopPropagation();
        react(sheetMsgId, emojiBtn.dataset.emoji);
        closeSheet();
        return;
      }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      const a = act.dataset.act;
      if (a === "reply") { doReply(sheetMsgId, sheetText); closeSheet(); }
      else if (a === "copy") { doCopy(sheetText); closeSheet(); }
      else closeSheet();
    };
    sheet.addEventListener("click", onAct);
    sheet.addEventListener("touchend", onAct, { passive: false });
    return sheet;
  }

  function openSheet(msgId, text, row) {
    ensureSheet();
    clearSelection();
    sheetMsgId = String(msgId || "");
    sheetText = String(text || "")
      .replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();

    document.querySelectorAll("#messages .row.sheet-target").forEach((r) => r.classList.remove("sheet-target"));
    if (row) row.classList.add("sheet-target");

    $("msgSheetBackdrop").classList.add("open");
    $("msgSheet").classList.add("open");
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
  }

  function closeSheet() {
    const backdrop = $("msgSheetBackdrop");
    const sheet = $("msgSheet");
    if (sheet) sheet.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
    document.querySelectorAll("#messages .row.sheet-target").forEach((r) => r.classList.remove("sheet-target"));
  }

  function doReply(msgId, text) {
    if (typeof window.__scSetReply === "function") window.__scSetReply(msgId, text);
  }

  function doCopy(text) {
    if (window.__scAllowCopyOnce) window.__scAllowCopyOnce();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
    } else toast("Copy failed");
  }

  function react(msgId, emoji) {
    if (typeof window.__scToggleReaction === "function") window.__scToggleReaction(msgId, emoji);
    else document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId, emoji } }));
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
    return { msgId, text };
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
    let startX = 0, startY = 0, dx = 0, dy = 0;
    let tracking = false, swiping = false, longFired = false;

    const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    const resetSwipe = () => {
      row.classList.remove("swiping");
      row.style.transform = "";
      swiping = false;
      tracking = false;
      dx = 0; dy = 0;
    };

    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { msgId, text } = rowMeta(row);
      openSheet(msgId, text, row);
    }, true);

    row.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      dx = 0; dy = 0;
      tracking = true; swiping = false; longFired = false;
      clearPress();
      pressTimer = setTimeout(() => {
        if (!tracking || swiping) return;
        longFired = true;
        clearSelection();
        const { msgId, text } = rowMeta(row);
        openSheet(msgId, text, row);
      }, LONG_MS);
    }, { passive: true });

    row.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      dx = t.clientX - startX;
      dy = t.clientY - startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearPress();
      if (!swiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        clearPress();
        tracking = false;
        row.classList.remove("swiping");
        row.style.transform = "";
        return;
      }
      const absX = Math.abs(dx);
      if (absX > 12 && absX > Math.abs(dy)) {
        swiping = true;
        clearPress();
        row.classList.add("swiping");
        row.style.transform = "translateX(" + Math.max(-88, Math.min(88, dx)) + "px)";
        if (absX > 18 && e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    const endTouch = (e) => {
      clearPress();
      if (!tracking) return;
      if (longFired) {
        if (e && e.preventDefault) e.preventDefault();
        clearSelection();
      } else if (swiping && Math.abs(dx) >= SWIPE_THRESHOLD) {
        const { msgId, text } = rowMeta(row);
        doReply(msgId, text);
      }
      resetSwipe();
      setTimeout(() => { longFired = false; }, 250);
    };

    row.addEventListener("touchend", endTouch, { passive: false });
    row.addEventListener("touchcancel", endTouch, { passive: true });
  }

  function bindAll() {
    document.querySelectorAll("#messages .row").forEach(bindRow);
  }

  function boot() {
    ensureCss();
    ensureSheet();
    bindAll();
    document.addEventListener("selectstart", (e) => {
      if (e.target && e.target.closest && e.target.closest("#messages .row")) e.preventDefault();
    }, true);
    const box = $("messages");
    if (box) new MutationObserver(() => bindAll()).observe(box, { childList: true });
    setTimeout(bindAll, 400);
    setTimeout(bindAll, 1200);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__scOpenMsgSheet = openSheet;
  window.__scCloseMsgSheet = closeSheet;
})();

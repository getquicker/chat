(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let pinnedToBottom = true;
  let openToken = 0;
  let frame = 0;
  let openTimer = null;
  let lastScrollHeight = 0;
  let lastUserScrollAt = 0;

  const BOTTOM_THRESHOLD = 64;

  function messagesEl() { return $("messages"); }
  function distanceFromBottom(el) {
    return Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop);
  }
  function isNearBottom(el, threshold = BOTTOM_THRESHOLD) {
    return !el || distanceFromBottom(el) <= threshold;
  }
  function scrollToLatest() {
    const el = messagesEl();
    if (!el) return;
    // Instant positioning avoids the repeated smooth-scroll/jump effect on every render.
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    lastScrollHeight = el.scrollHeight;
  }
  function scheduleScroll(reason) {
    if (reason !== "open" && !pinnedToBottom) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const el = messagesEl();
      if (!el || (reason !== "open" && !pinnedToBottom)) return;
      scrollToLatest();
    });
  }
  window.__scScrollToLatest = function() {
    pinnedToBottom = true;
    scheduleScroll("open");
  };

  function placeReplyBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (form && bar && form.parentNode && bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
  }

  function onChatOpened() {
    const token = ++openToken;
    pinnedToBottom = true;
    placeReplyBar();
    if (openTimer) clearTimeout(openTimer);
    let attempts = 0;
    const tryScroll = () => {
      if (token !== openToken) return;
      const el = messagesEl();
      if (!el) return;
      scrollToLatest();
      // Wait briefly for async history rendering, but stop as soon as rows exist.
      if (!el.querySelector(".row") && attempts++ < 8) {
        openTimer = setTimeout(tryScroll, 120);
      } else {
        requestAnimationFrame(() => {
          if (token === openToken && pinnedToBottom) scrollToLatest();
        });
      }
    };
    tryScroll();
  }

  function watchUserScroll() {
    const el = messagesEl();
    if (!el || el.dataset.userScrollWatch) return;
    el.dataset.userScrollWatch = "1";
    el.addEventListener("scroll", () => {
      // Respect a user's decision to read older messages; don't pull them back down.
      pinnedToBottom = isNearBottom(el);
      lastUserScrollAt = Date.now();
    }, { passive: true });
    ["wheel", "touchstart", "pointerdown"].forEach(type => {
      el.addEventListener(type, () => { lastUserScrollAt = Date.now(); }, { passive: true });
    });
  }

  function watchMessages() {
    const el = messagesEl();
    if (!el || el.dataset.scrollWatchV3) return;
    el.dataset.scrollWatchV3 = "1";
    lastScrollHeight = el.scrollHeight;
    new MutationObserver((mutations) => {
      let addedRow = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if ((node.matches && node.matches(".row,.stamp")) ||
              (node.querySelector && node.querySelector(".row,.stamp"))) {
            addedRow = true;
            break;
          }
        }
        if (addedRow) break;
      }
      if (!addedRow) {
        // Content can grow as images load. Keep the view stable unless already pinned.
        if (pinnedToBottom && el.scrollHeight > lastScrollHeight + 8) scheduleScroll("grow");
        lastScrollHeight = el.scrollHeight;
        return;
      }
      // WhatsApp-style: follow new messages only when the reader was already at the bottom.
      // If the user is scrolling up, preserve their reading position.
      if (pinnedToBottom && Date.now() - lastUserScrollAt > 80) scheduleScroll("message");
      lastScrollHeight = el.scrollHeight;
    }).observe(el, { childList: true, subtree: true });
  }

  function watchConversation() {
    const panel = $("conversationPanel");
    if (!panel || panel.dataset.scrollWatchV3) return;
    panel.dataset.scrollWatchV3 = "1";
    let wasHidden = panel.classList.contains("hidden");
    new MutationObserver(() => {
      const hidden = panel.classList.contains("hidden");
      if (wasHidden && !hidden) onChatOpened();
      wasHidden = hidden;
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }

  function watchChatList() {
    const list = $("chatList");
    if (!list || list.dataset.scrollWatchV3) return;
    list.dataset.scrollWatchV3 = "1";
    list.addEventListener("click", (event) => {
      if (!event.target.closest(".chat-item")) return;
      pinnedToBottom = true;
      setTimeout(onChatOpened, 100);
    }, true);
  }

  function watchSend() {
    const form = $("messageForm");
    if (!form || form.dataset.scrollSendWatch) return;
    form.dataset.scrollSendWatch = "1";
    form.addEventListener("submit", () => {
      // Sending your own message should reveal it, but avoid repeated forced scrolling.
      if (isNearBottom(messagesEl(), 120)) {
        pinnedToBottom = true;
        setTimeout(() => scheduleScroll("send"), 40);
      }
    }, true);
  }

  function boot() {
    placeReplyBar();
    watchUserScroll();
    watchMessages();
    watchConversation();
    watchChatList();
    watchSend();
    const panel = $("conversationPanel");
    if (panel && !panel.classList.contains("hidden")) onChatOpened();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
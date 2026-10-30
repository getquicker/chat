(() => {
  const $ = (id) => document.getElementById(id);
  let pinnedToBottom = true;
  let openToken = 0;
  let scrollTimer = null;
  let lastScrollHeight = 0;

  function messagesEl() {
    return $("messages");
  }

  function distanceFromBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function isNearBottom(el, px) {
    if (!el) return true;
    return distanceFromBottom(el) <= (px == null ? 80 : px);
  }

  function scrollToLatest() {
    const el = messagesEl();
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollHeight = el.scrollHeight;
  }

  function scheduleScroll(reason) {
    if (!pinnedToBottom && reason !== "open") return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      const el = messagesEl();
      if (!el) return;
      if (reason === "open" || pinnedToBottom) {
        scrollToLatest();
        requestAnimationFrame(() => {
          if (pinnedToBottom || reason === "open") scrollToLatest();
        });
      }
    }, reason === "open" ? 60 : 16);
  }

  window.__scScrollToLatest = function () {
    pinnedToBottom = true;
    scheduleScroll("open");
  };

  function placeReplyBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (!form || !bar || !form.parentNode) return;
    if (bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
  }

  function onChatOpened() {
    const token = ++openToken;
    pinnedToBottom = true;
    placeReplyBar();
    const tryScroll = (attempt) => {
      if (token !== openToken) return;
      const el = messagesEl();
      if (!el) return;
      const hasRows = el.querySelector(".row");
      scrollToLatest();
      if (!hasRows && attempt < 8) {
        setTimeout(() => tryScroll(attempt + 1), 120);
      } else if (attempt < 3) {
        setTimeout(() => {
          if (token === openToken && pinnedToBottom) scrollToLatest();
        }, 100);
      }
    };
    tryScroll(0);
  }

  function watchUserScroll() {
    const el = messagesEl();
    if (!el || el.dataset.userScrollWatch) return;
    el.dataset.userScrollWatch = "1";
    el.addEventListener(
      "scroll",
      () => {
        pinnedToBottom = isNearBottom(el, 100);
      },
      { passive: true }
    );
  }

  function watchMessages() {
    const el = messagesEl();
    if (!el || el.dataset.scrollWatch) return;
    el.dataset.scrollWatch = "1";
    new MutationObserver((mutations) => {
      let addedRow = false;
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && (n.classList && (n.classList.contains("row") || n.classList.contains("stamp")))) {
            addedRow = true;
            break;
          }
        }
        if (addedRow) break;
      }
      if (!addedRow) {
        if (pinnedToBottom && el.scrollHeight > lastScrollHeight + 4) {
          scheduleScroll("grow");
        }
        return;
      }
      if (pinnedToBottom) scheduleScroll("row");
    }).observe(el, { childList: true });
  }

  function watchConversation() {
    const panel = $("conversationPanel");
    if (!panel || panel.dataset.scrollWatch) return;
    panel.dataset.scrollWatch = "1";
    let wasHidden = panel.classList.contains("hidden");
    new MutationObserver(() => {
      const hidden = panel.classList.contains("hidden");
      if (wasHidden && !hidden) {
        onChatOpened();
      }
      wasHidden = hidden;
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }

  function watchChatList() {
    const list = $("chatList");
    if (!list || list.dataset.scrollWatch) return;
    list.dataset.scrollWatch = "1";
    list.addEventListener(
      "click",
      (e) => {
        if (!e.target.closest(".chat-item")) return;
        pinnedToBottom = true;
        setTimeout(onChatOpened, 100);
      },
      true
    );
  }

  function boot() {
    placeReplyBar();
    watchUserScroll();
    watchMessages();
    watchConversation();
    watchChatList();
    const panel = $("conversationPanel");
    if (panel && !panel.classList.contains("hidden")) {
      onChatOpened();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

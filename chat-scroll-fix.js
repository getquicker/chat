(() => {
  const $ = (id) => document.getElementById(id);

  function messagesEl() {
    return $("messages");
  }

  function isNearBottom(el, threshold) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < (threshold || 120);
  }

  function scrollToLatest(force) {
    const el = messagesEl();
    if (!el) return;
    const go = () => {
      el.scrollTop = el.scrollHeight;
      const last = el.querySelector(".row:last-of-type, .stamp:last-of-type");
      if (last && last.scrollIntoView) {
        try {
          last.scrollIntoView({ block: "end", behavior: force ? "auto" : "smooth" });
        } catch (e) {
          el.scrollTop = el.scrollHeight;
        }
      }
    };
    go();
    requestAnimationFrame(go);
    setTimeout(go, 50);
    setTimeout(go, 200);
    setTimeout(go, 500);
  }

  window.__scScrollToLatest = scrollToLatest;

  function placeReplyBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (!form || !bar) return;
    const parent = form.parentNode;
    if (!parent) return;
    if (bar.nextElementSibling !== form) {
      parent.insertBefore(bar, form);
    }
  }

  function onChatOpened() {
    placeReplyBar();
    scrollToLatest(true);
  }

  let forceNext = true;
  function watchMessages() {
    const el = messagesEl();
    if (!el || el.dataset.scrollWatch) return;
    el.dataset.scrollWatch = "1";
    new MutationObserver(() => {
      if (forceNext || isNearBottom(el, 160)) {
        scrollToLatest(forceNext);
        forceNext = false;
      }
    }).observe(el, { childList: true, subtree: true });
  }

  function watchConversation() {
    const panel = $("conversationPanel");
    if (!panel || panel.dataset.scrollWatch) return;
    panel.dataset.scrollWatch = "1";
    new MutationObserver(() => {
      if (!panel.classList.contains("hidden")) {
        forceNext = true;
        onChatOpened();
      }
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }

  function watchChatList() {
    const list = $("chatList");
    if (!list || list.dataset.scrollWatch) return;
    list.dataset.scrollWatch = "1";
    list.addEventListener(
      "click",
      () => {
        forceNext = true;
        setTimeout(onChatOpened, 80);
        setTimeout(onChatOpened, 300);
        setTimeout(onChatOpened, 700);
      },
      true
    );
  }

  function boot() {
    placeReplyBar();
    watchMessages();
    watchConversation();
    watchChatList();
    const panel = $("conversationPanel");
    if (panel && !panel.classList.contains("hidden")) {
      forceNext = true;
      onChatOpened();
    }
    setTimeout(placeReplyBar, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

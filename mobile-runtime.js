/* Mobile viewport and keyboard compatibility for Kurakani. */
(() => {
  const root = document.documentElement;
  let frame = 0;
  let messagesPinnedToBottom = true;
  let watchedMessages = null;

  function trackMessages() {
    const messages = document.getElementById("messages");
    if (!messages || messages === watchedMessages) return;
    watchedMessages = messages;
    const updatePinnedState = () => {
      messagesPinnedToBottom =
        messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 64;
    };
    messages.addEventListener("scroll", updatePinnedState, { passive: true });
    updatePinnedState();
  }

  function syncViewport() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const vv = window.visualViewport;
      const height = vv && vv.height ? vv.height : window.innerHeight;
      if (height > 0) root.style.setProperty("--app-viewport-height", Math.round(height) + "px");
      root.style.setProperty("--app-viewport-width", Math.round(window.innerWidth) + "px");
      root.classList.toggle("keyboard-open", !!(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && vv && window.innerHeight - vv.height > 120));
      trackMessages();
      const messages = watchedMessages;
      // Keyboard/viewport changes must not pull someone away from older messages.
      // Follow the latest message only when the reader was already at the bottom.
      if (
        messages &&
        messagesPinnedToBottom &&
        document.activeElement &&
        document.activeElement.id === "messageInput"
      ) {
        messages.scrollTo({ top: messages.scrollHeight, behavior: "auto" });
      }
    });
  }
  syncViewport();
  window.addEventListener("resize", syncViewport, {passive:true});
  window.addEventListener("orientationchange", () => setTimeout(syncViewport, 120), {passive:true});
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewport, {passive:true});
    window.visualViewport.addEventListener("scroll", syncViewport, {passive:true});
  }
  document.addEventListener("focusin", event => {
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) setTimeout(syncViewport, 80);
  });
  document.addEventListener("focusout", () => setTimeout(syncViewport, 120));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(syncViewport, 100); });
})();

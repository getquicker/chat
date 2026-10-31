/* Mobile viewport and keyboard compatibility for Kurakani. */
(() => {
  const root = document.documentElement;
  let frame = 0;
  function syncViewport() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const vv = window.visualViewport;
      const height = vv && vv.height ? vv.height : window.innerHeight;
      if (height > 0) root.style.setProperty("--app-viewport-height", Math.round(height) + "px");
      root.style.setProperty("--app-viewport-width", Math.round(window.innerWidth) + "px");
      root.classList.toggle("keyboard-open", !!(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && vv && window.innerHeight - vv.height > 120));
      const messages = document.getElementById("messages");
      if (messages && document.activeElement && document.activeElement.id === "messageInput") {
        messages.scrollTop = messages.scrollHeight;
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

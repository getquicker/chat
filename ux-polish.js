// Kurakani UX polish: preserve intentional composer focus, responsive call controls, and accessible interactions.
(() => {
  const $ = (id) => document.getElementById(id);
  let composerWasFocused = false;

  document.addEventListener("focusin", (event) => {
    if (event.target && event.target.id === "messageInput") composerWasFocused = true;
    else if (event.target && event.target.closest &&
      event.target.closest("dialog[open]")) composerWasFocused = false;
  });

  // Restore focus only after a deliberate message submission. Do not steal focus
  // after ordinary focusout (for example, when opening settings or clicking a menu).
  document.addEventListener("submit", (event) => {
    if (!event.target || event.target.id !== "messageForm") return;
    const input = $("messageInput");
    const submitter = event.submitter || document.activeElement;
    const wasComposing = !!(input && document.activeElement === input);
    const sentWithButton = !!(submitter && submitter.matches && submitter.matches(".send"));
    if (!wasComposing && !sentWithButton && !composerWasFocused) return;

    window.requestAnimationFrame(() => {
      const currentInput = $("messageInput");
      if (!currentInput || !document.contains(currentInput) ||
          document.visibilityState !== "visible" ||
          document.querySelector("dialog[open]") ||
          !document.querySelector(".layout.in-chat")) return;

      const active = document.activeElement;
      // If the user has moved to another control, respect that choice.
      if (active && active !== document.body && active !== document.documentElement &&
          active !== currentInput && active !== submitter) return;

      if (active !== currentInput) {
        try { currentInput.focus({ preventScroll: true }); }
        catch (_) { currentInput.focus(); }
      }
      composerWasFocused = document.activeElement === currentInput;
    });
  }, true);

  document.addEventListener("keydown", (event) => {
    const input = $("messageInput");
    if (event.defaultPrevented || !input || event.target !== input || event.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = $("messageForm");
      if (form && typeof form.requestSubmit === "function") form.requestSubmit();
      else if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  document.addEventListener("input", (event) => {
    if (!event.target || event.target.id !== "messageInput") return;
    const input = event.target;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  document.addEventListener("click", (event) => {
    const target = event.target && event.target.closest
      ? event.target.closest("#callCloseBtn") : event.target;
    if (!target || target.id !== "callCloseBtn") return;
    event.preventDefault();
    const end = $("endCallBtn");
    if (end && !end.classList.contains("hidden")) end.click();
    else {
      const dialog = $("callDialog");
      if (dialog && dialog.open) dialog.close();
    }
  }, true);

  const callDialog = $("callDialog");
  if (callDialog) callDialog.addEventListener("close", () => {
    const mute = $("muteCallBtn"), camera = $("cameraCallBtn"), flip = $("cameraFlipBtn");
    if (mute) mute.textContent = "Mute mic";
    if (camera) camera.textContent = "Turn camera off";
    if (flip) flip.textContent = "Flip camera";
  });

  console.info("Kurakani keyboard and call UX active");
})();

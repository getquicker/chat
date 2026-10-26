// SimpleChat UX polish: stable composer focus, responsive call controls, accessible delete sheet
(() => {
  const $ = (id) => document.getElementById(id);
  let composerWasFocused = false;
  let focusTimer = 0;
  let sendPending = false;

  function keepComposerFocused() {
    const input = $("messageInput");
    if (!composerWasFocused || !input || !document.contains(input) || document.visibilityState !== "visible") return;
    const active = document.activeElement;
    if (!sendPending && active && active !== input && active.matches("button, a, input, select, dialog [tabindex]")) return;
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  }

  document.addEventListener("focusin", (e) => {
    if (e.target && e.target.id === "messageInput") composerWasFocused = true;
  });
  document.addEventListener("focusout", (e) => {
    if (!e.target || e.target.id !== "messageInput") return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      if (composerWasFocused && document.hasFocus() &&
          !document.querySelector("dialog[open]") &&
          document.querySelector(".layout.in-chat")) keepComposerFocused();
    }, 90);
  });

  document.addEventListener("submit", (e) => {
    if (!e.target || e.target.id !== "messageForm") return;
    composerWasFocused = document.activeElement === $("messageInput") || composerWasFocused;
    sendPending = true;
    window.setTimeout(keepComposerFocused, 120);
    window.setTimeout(keepComposerFocused, 320);
    window.setTimeout(() => { sendPending = false; }, 650);
  }, true);

  document.addEventListener("keydown", (e) => {
    const input = $("messageInput");
    if (!input || e.target !== input || e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = $("messageForm");
      if (form && form.requestSubmit) form.requestSubmit();
      else if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  document.addEventListener("input", (e) => {
    if (!e.target || e.target.id !== "messageInput") return;
    const input = e.target;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  document.addEventListener("click", (e) => {
    if (!e.target || e.target.id !== "callCloseBtn") return;
    e.preventDefault();
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

  console.info("SimpleChat keyboard and call UX active");
})();

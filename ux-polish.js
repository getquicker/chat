// SimpleChat UX polish: keyboard stay-open, call UI, delete
(() => {
  const $ = (id) => document.getElementById(id);

  function toast(msg, isError) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = "toast"; }, 2800);
  }

  function refocusComposer() {
    const input = $("messageInput");
    if (!input || !document.body.contains(input)) return;
    const x = window.scrollX, y = window.scrollY;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      }
      window.scrollTo(x, y);
    });
    setTimeout(() => {
      if (document.activeElement !== input) {
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      }
    }, 50);
  }

  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!form || form.id !== "messageForm") return;
      setTimeout(refocusComposer, 0);
      setTimeout(refocusComposer, 100);
      setTimeout(refocusComposer, 300);
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    const input = $("messageInput");
    if (!input || e.target !== input) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = $("messageForm");
      if (form) {
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
      setTimeout(refocusComposer, 0);
      setTimeout(refocusComposer, 120);
    }
  });

  const obs = new MutationObserver(() => {
    const input = $("messageInput");
    if (!input) return;
    if (input.dataset.wantFocus === "1") refocusComposer();
  });
  setTimeout(() => {
    const m = $("messages");
    if (m) obs.observe(m, { childList: true, subtree: true });
  }, 1500);

  const bindInput = () => {
    const input = $("messageInput");
    if (!input || input.dataset.uxBound) return;
    input.dataset.uxBound = "1";
    input.addEventListener("focus", () => { input.dataset.wantFocus = "1"; });
    input.addEventListener("blur", () => {
      if (input.dataset.wantFocus === "1") {
        setTimeout(() => {
          if (
            document.activeElement !== input &&
            $("conversationPanel") &&
            !$("conversationPanel").classList.contains("hidden")
          ) {
            refocusComposer();
          }
        }, 30);
      }
    });
  };
  setInterval(bindInput, 1000);
  bindInput();

  function polishCallButtons() {
    const end = $("endCallBtn");
    if (end && end.textContent.trim() === "End call") end.textContent = "End";
  }
  setInterval(polishCallButtons, 2000);

  console.info("SimpleChat UX polish active");
})();

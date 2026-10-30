(() => {
  const $ = (id) => document.getElementById(id);

  function placeReplyBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (!form || !bar || !form.parentNode) return;
    if (bar.nextElementSibling !== form) {
      form.parentNode.insertBefore(bar, form);
    }
  }

  function autoGrow() {
    const input = $("messageInput");
    if (!input || input.dataset.growBound) return;
    input.dataset.growBound = "1";

    const grow = () => {
      input.style.height = "auto";
      const next = Math.min(Math.max(input.scrollHeight, 44), 140);
      input.style.height = next + "px";
    };

    input.addEventListener("input", grow);
    input.addEventListener("focus", grow);
    const form = $("messageForm");
    if (form && !form.dataset.growReset) {
      form.dataset.growReset = "1";
      form.addEventListener(
        "submit",
        () => {
          setTimeout(() => {
            input.style.height = "44px";
          }, 0);
        },
        true
      );
    }
    grow();
  }

  function boot() {
    placeReplyBar();
    autoGrow();
    setTimeout(placeReplyBar, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

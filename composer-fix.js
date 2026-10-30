(() => {
  const $ = (id) => document.getElementById(id);

  function placeReplyBar() {
    const form = $("messageForm");
    const bar = $("replyBar");
    if (!form || !bar || !form.parentNode) return;
    if (bar.nextElementSibling !== form) form.parentNode.insertBefore(bar, form);
  }

  function bindComposer() {
    const form = $("messageForm");
    const input = $("messageInput");
    const send = form && form.querySelector("button.send, button[type='submit']");
    if (!form || !input) return;
    if (form.dataset.composerBound) return;
    form.dataset.composerBound = "1";

    const BASE = window.matchMedia("(max-width: 720px)").matches ? 42 : 44;

    const grow = () => {
      input.style.height = "auto";
      const h = Math.min(Math.max(input.scrollHeight, BASE), 140);
      input.style.height = h + "px";
    };

    const syncSend = () => {
      if (!send) return;
      const empty = !input.value.trim();
      send.disabled = empty;
      send.setAttribute("aria-disabled", empty ? "true" : "false");
    };

    input.addEventListener("input", () => {
      grow();
      syncSend();
    });
    input.addEventListener("focus", grow);
    input.addEventListener("blur", grow);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        if (window.matchMedia("(min-width: 721px)").matches) {
          e.preventDefault();
          if (input.value.trim()) {
            if (typeof form.requestSubmit === "function") form.requestSubmit();
            else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }
        }
      }
    });

    form.addEventListener(
      "submit",
      () => {
        setTimeout(() => {
          input.style.height = BASE + "px";
          syncSend();
        }, 0);
      },
      true
    );

    if (send) {
      send.type = "submit";
      send.classList.add("send");
      const svg = send.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "18");
        svg.style.display = "block";
      }
    }

    grow();
    syncSend();
  }

  function boot() {
    placeReplyBar();
    bindComposer();
    setTimeout(() => {
      placeReplyBar();
      bindComposer();
    }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

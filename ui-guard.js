(() => {
  document.addEventListener(
    "selectstart",
    (e) => {
      const t = e.target;
      if (!t) return;
      if (t.closest && t.closest("input, textarea, [contenteditable='true']")) return;
      if (t.closest && t.closest("#messages, .sidebar, .conversation-head, .welcome")) {
        e.preventDefault();
      }
    },
    true
  );
  document.addEventListener(
    "copy",
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest("input, textarea, [contenteditable='true']")) return;
      if (!window.__scAllowCopy) {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.toString()) {
          const msgs = document.getElementById("messages");
          if (msgs && sel.anchorNode && msgs.contains(sel.anchorNode)) {
            e.preventDefault();
          }
        }
      }
      window.__scAllowCopy = false;
    },
    true
  );
  window.__scAllowCopyOnce = () => {
    window.__scAllowCopy = true;
  };
})();

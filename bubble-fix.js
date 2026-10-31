(() => {
  if (!document.querySelector('link[href*="bubble-fix.css"]')) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "bubble-fix.css?v=1";
    document.head.appendChild(l);
  }
  function repair() {
    document.querySelectorAll("#messages .bubble").forEach((b) => {
      b.style.writingMode = "horizontal-tb";
      b.style.whiteSpace = "pre-wrap";
      b.style.wordBreak = "normal";
      b.style.overflowWrap = "break-word";
      b.style.width = "max-content";
      b.style.maxWidth = "min(78%, 420px)";
      b.style.display = "block";
      b.style.minWidth = "3.25rem";
      b.style.direction = "ltr";
    });
  }
  repair();
  const box = document.getElementById("messages");
  if (box) new MutationObserver(() => repair()).observe(box, { childList: true, subtree: true });
  setTimeout(repair, 500);
  setTimeout(repair, 1500);
})();

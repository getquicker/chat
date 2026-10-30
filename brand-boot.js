(() => {
  ["motion.css?v=1", "polish.css?v=1"].forEach((href) => {
    if ([...document.styleSheets].some((s) => (s.href || "").includes(href.split("?")[0]))) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  });
  const mark =
    '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><defs><linearGradient id="scg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0084ff"/><stop offset="100%" stop-color="#00b4d8"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#scg2)"/><path d="M18.5 14c-7 0-12.5 4.7-12.5 10.6 0 3.7 2 7 5.2 9v5.5l6-3.4c.5.1 1 .1 1.3.1 7 0 12.5-4.7 12.5-10.6S25.5 14 18.5 14z" fill="#fff"/><path d="M29 16c5.5 0 10 3.7 10 8.4 0 3-1.5 5.6-4 7.1v4.5l-4.5-2.7c-.5.1-1 .1-1.5.1-1.2 0-2.4-.2-3.4-.5 1.8-1.6 2.9-3.8 2.9-6.3 0-5.2-4-9.4-9.5-10.5 2-.7 4.2-1.1 6.5-1.1z" fill="#fff" opacity=".4"/></svg>';
  document.querySelectorAll(".logo, .logo.big").forEach((el) => {
    if (el.innerHTML.includes("scg")) return;
    el.innerHTML = mark;
  });
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = "icons/favicon.svg";
})();

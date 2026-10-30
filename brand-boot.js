(() => {
  ["motion.css?v=1", "polish.css?v=1", "style-shift.css?v=1", "desktop-ui.css?v=1", "kurakani.css?v=4", "msg-actions.css?v=5", "layout-fix.css?v=2"].forEach((href) => {
    if ([...document.styleSheets].some((s) => (s.href || "").includes(href.split("?")[0]))) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  });
  const mark =
    '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><defs><linearGradient id="scg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6d28d9"/><stop offset="55%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#c084fc"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#scg2)"/><path d="M24 9c-9 0-16 5.5-16 12.5 0 4 2.2 7.5 5.8 9.8V37l7.2-4.2c1 .2 2 .3 3 .3 9 0 16-5.5 16-12.5S33 9 24 9z" fill="#fff"/><text x="24" y="26" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="#6d28d9">K</text></svg>';
  document.querySelectorAll(".logo, .logo.big").forEach((el) => { el.innerHTML = mark; });
  if ((document.title || "").includes("SimpleChat")) document.title = "Kurakani";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = "#6d28d9";
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = "icons/favicon.svg?v=3";
})();

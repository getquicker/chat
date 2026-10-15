(async function() {
  const parts = await Promise.all([0,1,2].map(i => fetch("app.part" + i + ".js?v=9").then(r => r.text())));
  (0, eval)(parts.join(""));
})();

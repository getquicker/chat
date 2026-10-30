(() => {
  const box = () => document.getElementById("messages");
  if (!box()) return;
  const seen = new WeakSet();
  const mark = () => {
    const el = box();
    if (!el) return;
    const rows = el.querySelectorAll(".row");
    if (!rows.length) return;
    if (!el.dataset.kPainted) {
      el.dataset.kPainted = "1";
      rows.forEach((r) => seen.add(r));
      return;
    }
    rows.forEach((r) => {
      if (seen.has(r)) return;
      seen.add(r);
      r.classList.add("k-enter");
      setTimeout(() => r.classList.remove("k-enter"), 300);
    });
  };
  const mo = new MutationObserver(mark);
  const start = () => {
    const el = box();
    if (!el) return;
    mo.observe(el, { childList: true });
    mark();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  setInterval(mark, 1500);
})();

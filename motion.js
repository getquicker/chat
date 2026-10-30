/**
 * Message enter animations — animate only newly inserted rows.
 */
(() => {
  const seen = new WeakSet();
  const box = document.getElementById("messages");
  if (!box) return;

  function markNew(nodes) {
    nodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (!node.classList?.contains("row")) {
        node.querySelectorAll?.(".row").forEach((r) => tryMark(r));
        return;
      }
      tryMark(node);
    });
  }

  function tryMark(row) {
    if (seen.has(row)) return;
    seen.add(row);
    const rows = box.querySelectorAll(".row");
    if (rows.length > 12 && !row.classList.contains("pending")) {
      const idx = Array.prototype.indexOf.call(rows, row);
      if (idx < rows.length - 3) return;
    }
    row.classList.add("msg-enter");
    const done = () => row.classList.remove("msg-enter");
    row.addEventListener("animationend", done, { once: true });
    setTimeout(done, 400);
  }

  new MutationObserver((muts) => {
    muts.forEach((m) => markNew(m.addedNodes));
  }).observe(box, { childList: true });

  box.addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    if (e.target.closest(".msg-act") || e.target.closest(".reaction-chip")) return;
    box.querySelectorAll(".row.actions-open").forEach((r) => {
      if (r !== row) r.classList.remove("actions-open");
    });
    row.classList.toggle("actions-open");
  });

  console.info("SimpleChat motion ready");
})();

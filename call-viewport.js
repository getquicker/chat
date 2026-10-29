(() => {
  const dialog = document.getElementById("callDialog");
  if (!dialog) return;
  const sync = () => {
    document.documentElement.classList.toggle("call-open", !!dialog.open);
    document.body.classList.toggle("call-open", !!dialog.open);
  };
  new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  dialog.addEventListener("close", sync);
  sync();
})();

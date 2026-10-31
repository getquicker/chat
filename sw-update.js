(() => {
  if (!("serviceWorker" in navigator)) return;

  async function update() {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          await reg.update();
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } catch (e) {}
      }
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        if (sessionStorage.getItem("sc_sw_reload") === "1") {
          sessionStorage.removeItem("sc_sw_reload");
          location.reload();
        }
      });
    } catch (e) {}
  }

  navigator.serviceWorker
    .register("./sw.js?v=10", { scope: "./" })
    .then((reg) => {
      reg.update().catch(() => {});
      if (reg.waiting) {
        sessionStorage.setItem("sc_sw_reload", "1");
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            sessionStorage.setItem("sc_sw_reload", "1");
            nw.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch(() => {});

  update();
  setInterval(update, 60 * 1000);
})();

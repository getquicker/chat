// Overlay: fix black video + delete-for-me after main fixes load
(() => {
  const $ = (id) => document.getElementById(id);

  const style = document.createElement("style");
  style.textContent = `
    body:not(.audio-call-active) #remoteVideo,
    body:not(.audio-call-active) #localVideo {
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
    }
    #remoteVideo { background: #111; }
  `;
  document.head.appendChild(style);

  setInterval(() => {
    const cam = $("cameraCallBtn");
    if (cam && !cam.classList.contains("hidden")) {
      document.body.classList.remove("audio-call-active");
    }
    const rv = $("remoteVideo");
    if (rv && rv.srcObject) {
      rv.muted = false;
      try {
        const s = rv.srcObject;
        if (s && s.getTracks) s.getTracks().forEach((t) => (t.enabled = true));
        if (rv.paused) rv.play().catch(() => {});
      } catch (_) {}
    }
    const lv = $("localVideo");
    if (lv && lv.srcObject && lv.paused) {
      lv.muted = true;
      lv.play().catch(() => {});
    }
  }, 800);

  function ensureSoundBtn() {
    if ($("enableSoundBtn")) return;
    const stage = document.querySelector(".video-stage");
    if (!stage) return;
    const b = document.createElement("button");
    b.id = "enableSoundBtn";
    b.type = "button";
    b.textContent = "Tap for sound";
    b.style.cssText =
      "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;border:none;border-radius:999px;padding:12px 20px;background:#0084ff;color:#fff;font-weight:700;cursor:pointer;display:none";
    b.onclick = () => {
      const v = $("remoteVideo");
      if (v) {
        v.muted = false;
        v.play().catch(() => {});
      }
      b.style.display = "none";
    };
    stage.appendChild(b);
    setInterval(() => {
      const v = $("remoteVideo");
      if (v && v.srcObject && (v.paused || v.muted)) b.style.display = "block";
      else if (v && v.srcObject && !v.paused && !v.muted) b.style.display = "none";
    }, 1000);
  }
  setTimeout(ensureSoundBtn, 1500);

  console.info("call-overlay active");
})();

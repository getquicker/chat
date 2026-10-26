// SimpleChat call media recovery: separate remote audio playback + visible autoplay recovery
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
    #remoteVideo { background:#111; object-fit:contain; }
    #remoteAudio { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
    #enableSoundBtn.show { display:block !important; }
  `;
  document.head.appendChild(style);

  function getAudio() {
    let a = $("remoteAudio");
    if (!a) {
      a = document.createElement("audio");
      a.id = "remoteAudio";
      a.autoplay = true;
      a.playsInline = true;
      a.setAttribute("playsinline", "");
      a.setAttribute("autoplay", "");
      document.body.appendChild(a);
    }
    a.muted = false;
    a.volume = 1;
    return a;
  }

  async function playMedia() {
    const v = $("remoteVideo");
    const lv = $("localVideo");
    if (v && v.srcObject) {
      v.muted = true; // audio is played separately to avoid video-element autoplay/mute conflicts
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      const stream = v.srcObject;
      if (stream.getTracks) stream.getTracks().forEach(t => { if (t.readyState === "live") t.enabled = true; });
      try { await v.play(); } catch (_) {}
      const a = getAudio();
      if (a.srcObject !== stream) a.srcObject = stream;
      try { await a.play(); } catch (_) {}
    }
    if (lv && lv.srcObject) {
      lv.muted = true;
      lv.playsInline = true;
      try { await lv.play(); } catch (_) {}
    }
  }

  function ensureSoundBtn() {
    if ($("enableSoundBtn")) return;
    const stage = document.querySelector(".video-stage");
    if (!stage) return;
    const b = document.createElement("button");
    b.id = "enableSoundBtn";
    b.type = "button";
    b.textContent = "Enable sound";
    b.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;border:0;border-radius:999px;padding:13px 21px;background:#0084ff;color:#fff;font-weight:700;cursor:pointer;display:none";
    b.onclick = async () => {
      await playMedia();
      b.classList.remove("show");
      b.style.display = "none";
    };
    stage.appendChild(b);
  }

  setInterval(async () => {
    const cam = $("cameraCallBtn");
    if (cam && !cam.classList.contains("hidden")) document.body.classList.remove("audio-call-active");
    const v = $("remoteVideo");
    if (v && v.srcObject) {
      const a = getAudio();
      if (a.srcObject !== v.srcObject) a.srcObject = v.srcObject;
      if (v.paused) { try { await v.play(); } catch (_) {} }
      if (a.paused) {
        try { await a.play(); }
        catch (_) {
          const b = $("enableSoundBtn");
          if (b) { b.style.display = "block"; b.classList.add("show"); }
        }
      }
      const tracks = v.srcObject.getTracks ? v.srcObject.getTracks() : [];
      const videoTracks = tracks.filter(t => t.kind === "video" && t.readyState === "live");
      const placeholder = $("remoteVideoPlaceholder");
      if (videoTracks.length && placeholder && placeholder.textContent === "Connected") placeholder.classList.add("hidden");
    }
    if (!v || !v.srcObject) {
      const b = $("enableSoundBtn");
      if (b) { b.style.display = "none"; b.classList.remove("show"); }
    }
    const lv = $("localVideo");
    if (lv && lv.srcObject && lv.paused) { lv.muted = true; try { await lv.play(); } catch (_) {} }
  }, 1200);

  ensureSoundBtn();
  console.info("SimpleChat remote audio recovery active");
})();

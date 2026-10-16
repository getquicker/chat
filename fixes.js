// Camera controls and small compatibility fixes for SimpleChat.
(() => {
  const byId = (id) => document.getElementById(id);
  const dialog = byId("callDialog");
  const stage = document.querySelector(".video-stage");
  const localVideo = byId("localVideo");
  const flipButton = byId("cameraFlipBtn");
  if (!dialog || !stage || !localVideo || !flipButton) return;

  const controls = document.querySelector(".call-controls");
  let previewSize = "medium";
  let mirrored = true;
  let switching = false;

  function toast(message, isError = false) {
    const el = byId("toast");
    if (!el) return;
    el.textContent = message;
    el.className = "toast show" + (isError ? " error" : "");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => { el.className = "toast"; }, 2600);
  }

  // Add optional controls without requiring changes to the bundled app.
  let sizeButton = byId("cameraSizeBtn");
  if (!sizeButton && controls) {
    sizeButton = document.createElement("button");
    sizeButton.id = "cameraSizeBtn";
    sizeButton.type = "button";
    sizeButton.className = "call-control camera-extra-control";
    sizeButton.title = "Change self-view size";
    controls.insertBefore(sizeButton, flipButton);
  }
  let mirrorButton = byId("cameraMirrorBtn");
  if (!mirrorButton && controls) {
    mirrorButton = document.createElement("button");
    mirrorButton.id = "cameraMirrorBtn";
    mirrorButton.type = "button";
    mirrorButton.className = "call-control camera-extra-control";
    mirrorButton.title = "Mirror your self-view";
    controls.insertBefore(mirrorButton, flipButton);
  }

  function liveVideoTrack() {
    const stream = localVideo.srcObject;
    return stream && stream.getVideoTracks().find(t => t.readyState === "live");
  }

  function applyPreviewSettings() {
    localVideo.dataset.previewSize = previewSize;
    localVideo.classList.toggle("is-mirrored", mirrored);
    if (sizeButton) {
      const labels = { small: "Preview: Small", medium: "Preview: Medium", large: "Preview: Large" };
      sizeButton.textContent = labels[previewSize];
      sizeButton.setAttribute("aria-label", "Self-view size: " + previewSize + ". Click to change size.");
    }
    if (mirrorButton) {
      mirrorButton.textContent = mirrored ? "Mirror: On" : "Mirror: Off";
      mirrorButton.setAttribute("aria-pressed", String(mirrored));
    }
  }

  function updateVisibility() {
    const track = liveVideoTrack();
    const hasVideo = !!track && track.enabled;
    const isOpen = dialog.open && !document.body.classList.contains("audio-call-active");
    flipButton.classList.toggle("hidden", !isOpen || !hasVideo);
    if (sizeButton) sizeButton.classList.toggle("hidden", !isOpen || !hasVideo);
    if (mirrorButton) mirrorButton.classList.toggle("hidden", !isOpen || !hasVideo);
  }

  if (sizeButton) sizeButton.addEventListener("click", () => {
    previewSize = previewSize === "small" ? "medium" : previewSize === "medium" ? "large" : "small";
    applyPreviewSettings();
  });
  if (mirrorButton) mirrorButton.addEventListener("click", () => {
    mirrored = !mirrored;
    applyPreviewSettings();
  });

  function getPeerConnection() {
    try {
      if (typeof peerConnection !== "undefined" && peerConnection) return peerConnection;
    } catch (_) {}
    return window.peerConnection || window.pc || null;
  }

  async function switchCamera() {
    if (switching) return;
    const stream = localVideo.srcObject;
    const oldTrack = liveVideoTrack();
    if (!stream || !oldTrack) {
      toast("Turn your camera on before switching.", true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Camera switching is not supported by this browser.", true);
      return;
    }

    switching = true;
    flipButton.disabled = true;
    flipButton.textContent = "Switching…";
    const oldSettings = oldTrack.getSettings ? oldTrack.getSettings() : {};
    const currentFacing = oldSettings.facingMode || "";
    const nextFacing = currentFacing === "environment" ? "user" : "environment";
    let replacementStream = null;

    try {
      let targetDevice = null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === "videoinput");
      if (cameras.length > 1) {
        const currentId = oldSettings.deviceId || "";
        const otherCameras = cameras.filter(d => d.deviceId && d.deviceId !== currentId);
        const desiredLabel = nextFacing === "environment" ? /back|rear|environment|world/i : /front|user|facetime|self/i;
        targetDevice = otherCameras.find(d => desiredLabel.test(d.label)) || otherCameras[0];
      }

      const videoConstraints = targetDevice
        ? { deviceId: { exact: targetDevice.deviceId } }
        : { facingMode: { ideal: nextFacing } };

      replacementStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      const newTrack = replacementStream.getVideoTracks()[0];
      if (!newTrack) throw new Error("No video track returned");

      const pc = getPeerConnection();
      const sender = pc && pc.getSenders ? pc.getSenders().find(s => s.track && s.track.kind === "video" && (s.track === oldTrack || !s.track)) : null;

      if (sender) {
        await sender.replaceTrack(newTrack);
      } else {
        // Keep the existing outgoing track if the bundled call code doesn't expose its sender.
        try {
          await oldTrack.applyConstraints({ facingMode: { ideal: nextFacing } });
          replacementStream.getTracks().forEach(t => t.stop());
          replacementStream = null;
          toast("Camera switched.");
          return;
        } catch (_) {
          throw new Error("Could not update the outgoing camera track");
        }
      }

      stream.removeTrack(oldTrack);
      stream.addTrack(newTrack);
      localVideo.srcObject = stream;
      oldTrack.stop();
      replacementStream = null; // the new track now belongs to the call stream
      toast("Camera switched.");
    } catch (error) {
      console.error("Camera switch failed:", error);
      toast(error && error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access and try again."
        : "Could not switch camera on this device. Try again or check camera permission.", true);
    } finally {
      if (replacementStream) replacementStream.getTracks().forEach(t => t.stop());
      switching = false;
      flipButton.disabled = false;
      flipButton.textContent = "Switch camera";
      applyPreviewSettings();
      updateVisibility();
    }
  }

  flipButton.addEventListener("click", switchCamera);
  ["videoCallBtn", "acceptCallBtn", "cameraCallBtn"].forEach(id => {
    const button = byId(id);
    if (button) button.addEventListener("click", () => window.setTimeout(updateVisibility, 350));
  });
  dialog.addEventListener("close", updateVisibility);
  dialog.addEventListener("toggle", updateVisibility);
  document.addEventListener("visibilitychange", updateVisibility);
  window.setInterval(updateVisibility, 800);
  applyPreviewSettings();
  updateVisibility();

  // GitHub Pages route convenience; actual data access is protected by Supabase RLS.
  const loginPage = location.pathname.endsWith("/login.html");
  let unauthenticatedTicks = 0;
  window.setInterval(() => {
    const authView = byId("authView");
    const appView = byId("appView");
    if (!authView || !appView) return;
    const signedInUi = !appView.classList.contains("hidden");
    const loginUi = !authView.classList.contains("hidden");
    if (loginPage && signedInUi) {
      location.replace(new URL("index.html", location.href).href);
      return;
    }
    if (!loginPage && loginUi && !signedInUi) {
      unauthenticatedTicks += 1;
      if (unauthenticatedTicks >= 12) location.replace(new URL("login.html", location.href).href);
    } else {
      unauthenticatedTicks = 0;
    }
  }, 300);
})();
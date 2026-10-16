// Small compatibility layer for camera switching on supported devices.
(() => {
  const byId = (id) => document.getElementById(id);
  const flipButton = byId("cameraFlipBtn");
  const dialog = byId("callDialog");
  const localVideo = byId("localVideo");
  if (!flipButton || !dialog || !localVideo) return;

  function toast(message, isError = false) {
    const el = byId("toast");
    if (!el) return;
    el.textContent = message;
    el.className = "toast show" + (isError ? " error" : "");
    window.setTimeout(() => { el.className = "toast"; }, 2800);
  }

  function updateVisibility() {
    const stream = localVideo.srcObject;
    const hasVideo = !!stream && stream.getVideoTracks().some(t => t.readyState === "live");
    flipButton.classList.toggle("hidden", !dialog.open || !hasVideo);
  }

  async function switchCamera() {
    const stream = localVideo.srcObject;
    const oldTrack = stream && stream.getVideoTracks()[0];
    if (!oldTrack || oldTrack.readyState !== "live") {
      toast("Camera is not active yet.", true);
      return;
    }

    flipButton.disabled = true;
    const originalLabel = flipButton.textContent;
    flipButton.textContent = "Switching…";
    const settings = oldTrack.getSettings ? oldTrack.getSettings() : {};
    const nextFacing = settings.facingMode === "environment" ? "user" : "environment";

    try {
      // This is the lightest option and works on many mobile browsers.
      try {
        await oldTrack.applyConstraints({ facingMode: { exact: nextFacing } });
        const now = oldTrack.getSettings ? oldTrack.getSettings() : {};
        if (!settings.facingMode || now.facingMode !== settings.facingMode) {
          toast("Camera switched.");
          return;
        }
      } catch (_) {
        // Fall through to device selection below.
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === "videoinput");
      if (cameras.length < 2) {
        toast("This device has only one camera available to the browser.", true);
        return;
      }

      const currentId = oldTrack.getSettings ? oldTrack.getSettings().deviceId : "";
      let target = cameras.find(d => d.deviceId !== currentId);
      if (settings.facingMode) {
        const wanted = settings.facingMode === "environment" ? /front|user|facetime/i : /back|rear|environment/i;
        target = cameras.find(d => d.deviceId !== currentId && wanted.test(d.label)) || target;
      }
      if (!target) {
        toast("Could not find another camera.", true);
        return;
      }

      const replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: target.deviceId } }
      });
      const newTrack = replacementStream.getVideoTracks()[0];
      const pc = (typeof peerConnection !== "undefined" && peerConnection) || window.peerConnection || null;
      const sender = pc && pc.getSenders().find(item => item.track && item.track.kind === "video");
      if (sender) {
        await sender.replaceTrack(newTrack);
      } else {
        // At least update the local preview if the call implementation does not expose its peer connection.
        toast("Camera preview changed, but this call cannot replace its outgoing camera track.", true);
      }
      stream.removeTrack(oldTrack);
      stream.addTrack(newTrack);
      localVideo.srcObject = stream;
      oldTrack.stop();
      toast(sender ? "Camera switched." : "Camera preview updated.");
    } catch (error) {
      console.error("Camera switch failed:", error);
      toast("Could not switch camera. Check camera permission and try again.", true);
    } finally {
      flipButton.disabled = false;
      flipButton.textContent = originalLabel;
      updateVisibility();
    }
  }

  flipButton.addEventListener("click", switchCamera);
  ["videoCallBtn", "acceptCallBtn", "cameraCallBtn"].forEach(id => {
    const button = byId(id);
    if (button) button.addEventListener("click", () => window.setTimeout(updateVisibility, 250));
  });
  dialog.addEventListener("close", updateVisibility);
  dialog.addEventListener("toggle", updateVisibility);
  window.setInterval(updateVisibility, 700);
  updateVisibility();
})();

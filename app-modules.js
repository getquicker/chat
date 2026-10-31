/* ===== BEGIN fixes.js ===== */
// SimpleChat: video call + professional delete
(() => {
  const $ = (id) => document.getElementById(id);

  function toast(msg, isError) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = "toast"; }, 3200);
  }

  function waitFor(fn, tries) {
    tries = tries || 120;
    return new Promise((resolve) => {
      let n = 0;
      const t = setInterval(() => {
        n++;
        try {
          if (fn() || n >= tries) {
            clearInterval(t);
            resolve(n < tries);
          }
        } catch (_) {
          if (n >= tries) {
            clearInterval(t);
            resolve(false);
          }
        }
      }, 80);
    });
  }

  async function ensurePlay(videoEl, forceUnmute) {
    if (!videoEl) return;
    try {
      if (videoEl.id === "localVideo") {
        videoEl.muted = true;
      } else if (forceUnmute || videoEl.id === "remoteVideo") {
        videoEl.muted = false;
      }
      videoEl.playsInline = true;
      videoEl.setAttribute("playsinline", "");
      videoEl.setAttribute("autoplay", "");
      videoEl.setAttribute("webkit-playsinline", "");
      const p = videoEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      console.warn("video play", e);
    }
  }

  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp"
        ],
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ],
    iceCandidatePoolSize: 10
  };

  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let current = null;
  let incoming = null;
  let queuedIce = [];

  async function patch() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    async function me() {
      const { data } = await client.auth.getSession();
      return data && data.session && data.session.user;
    }

    async function sendSignal(conversationId, recipientId, type, payload) {
      const user = await me();
      const { error } = await client.from("call_signals").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: recipientId,
        type: type === "ice" ? "ice-candidate" : type,
        payload: payload || {}
      });
      if (error) throw error;
    }

    async function getPeerId(conversationId, myId) {
      const { data } = await client
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId);
      return (data || []).map((m) => m.user_id).find((id) => id !== myId) || null;
    }

    function cleanupMedia() {
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.close();
        } catch (_) {}
      }
      pc = null;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
      remoteStream = null;
      queuedIce = [];
      current = null;
      incoming = null;
      if ($("localVideo")) $("localVideo").srcObject = null;
      if ($("remoteVideo")) $("remoteVideo").srcObject = null;
      document.body.classList.remove("audio-call-active");
    }

    async function endCall(notify) {
      const c = current;
      if (notify && c) {
        try {
          await sendSignal(c.conversationId, c.peerId, "hangup", {});
        } catch (e) {
          console.warn(e);
        }
      }
      cleanupMedia();
      if ($("acceptCallBtn")) $("acceptCallBtn").classList.add("hidden");
      if ($("declineCallBtn")) $("declineCallBtn").classList.add("hidden");
      if ($("muteCallBtn")) $("muteCallBtn").classList.add("hidden");
      if ($("cameraCallBtn")) $("cameraCallBtn").classList.add("hidden");
      if ($("endCallBtn")) $("endCallBtn").classList.add("hidden");
      if ($("remoteVideoPlaceholder")) {
        $("remoteVideoPlaceholder").classList.remove("hidden");
        $("remoteVideoPlaceholder").textContent = "Call ended";
      }
      try {
        if ($("callDialog") && $("callDialog").open) $("callDialog").close();
      } catch (_) {}
    }

    async function startCall(withVideo) {
      const user = await me();
      if (!user) {
        toast("Log in first.", true);
        return;
      }
      const item = document.querySelector(".chat-item.active");
      const conversationId = item && item.getAttribute("data-id");
      if (!conversationId) {
        toast("Open a chat first.", true);
        return;
      }
      if (current) {
        toast("Already in a call.", true);
        return;
      }

      const peerId = await getPeerId(conversationId, user.id);
      if (!peerId) {
        toast("Could not find the other person.", true);
        return;
      }

      const peerName = ($("conversationName") && $("conversationName").textContent) || "Contact";

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: withVideo
            ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
            : false
        });
        localStream.getTracks().forEach((t) => { t.enabled = true; });
      } catch (err) {
        console.error(err);
        toast(
          withVideo
            ? "Allow camera & microphone in the browser address bar, then try again."
            : "Allow microphone access, then try again.",
          true
        );
        return;
      }

      document.body.classList.toggle("audio-call-active", !withVideo);
      if ($("localVideo")) {
        $("localVideo").srcObject = localStream;
        await ensurePlay($("localVideo"));
      }

      pc = new RTCPeerConnection(ICE);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

      pc.ontrack = (e) => {
        // Tracks may arrive in separate events. Keep one combined stream instead of
        // replacing audio with video (or video with audio) on the next ontrack event.
        if (!remoteStream) remoteStream = new MediaStream();
        if (e.track && !remoteStream.getTracks().some(t => t.id === e.track.id)) {
          remoteStream.addTrack(e.track);
        }
        if (e.track) {
          e.track.enabled = true;
          e.track.onunmute = () => {
            if ($("callStatus")) $("callStatus").textContent = "Connected";
            const v = $("remoteVideo");
            if (v && v.srcObject !== remoteStream) v.srcObject = remoteStream;
            if (v) ensurePlay(v, true);
          };
        }
        if ($("remoteVideo")) {
          $("remoteVideo").srcObject = remoteStream;
          $("remoteVideo").muted = false;
          $("remoteVideo").volume = 1;
          ensurePlay($("remoteVideo"), true);
        }
        if (withVideo && e.track && e.track.kind === "video" && $("remoteVideoPlaceholder")) $("remoteVideoPlaceholder").classList.add("hidden");
        else if ($("remoteVideoPlaceholder") && !withVideo) {
          $("remoteVideoPlaceholder").textContent = "Connected — audio only";
          $("remoteVideoPlaceholder").classList.remove("hidden");
        }
        if ($("callStatus")) $("callStatus").textContent = "Connected";
      };
      pc.onconnectionstatechange = () => {
        if (!pc || !$("callStatus")) return;
        const labels = { connected: "Connected", connecting: "Connecting media…", failed: "Connection failed — check network/TURN", disconnected: "Connection interrupted — reconnecting…", closed: "Call ended" };
        $("callStatus").textContent = labels[pc.connectionState] || ("Call: " + pc.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        if (!pc) return;
        console.info("[SimpleChat call] ICE state:", pc.iceConnectionState, "connection:", pc.connectionState);
        if (pc.iceConnectionState === "failed" && $("callStatus")) {
          $("callStatus").textContent = "Network connection failed — TURN relay may be needed";
        }
      };
      pc.onicegatheringstatechange = () => {
        if (pc) console.info("[SimpleChat call] ICE gathering:", pc.iceGatheringState);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(conversationId, peerId, "ice-candidate", e.candidate.toJSON()).catch(console.error);
        }
      };

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: !!withVideo
      });
      await pc.setLocalDescription(offer);

      current = { conversationId: conversationId, peerId: peerId, video: withVideo };

      try {
        await sendSignal(conversationId, peerId, "offer", {
          type: offer.type,
          sdp: offer.sdp,
          callMode: withVideo ? "video" : "audio"
        });
      } catch (err) {
        console.error(err);
        toast(
          (err.message || "").indexOf("relation") >= 0
            ? "Call table missing. Run supabase_video.sql in Supabase."
            : "Could not start call: " + (err.message || "signaling failed"),
          true
        );
        await endCall(false);
        return;
      }

      if ($("callTitle")) $("callTitle").textContent = withVideo ? "Video calling…" : "Audio calling…";
      if ($("callStatus")) $("callStatus").textContent = peerName;
      if ($("acceptCallBtn")) $("acceptCallBtn").classList.add("hidden");
      if ($("declineCallBtn")) $("declineCallBtn").classList.add("hidden");
      if ($("muteCallBtn")) $("muteCallBtn").classList.remove("hidden");
      if ($("cameraCallBtn")) {
        if (withVideo) $("cameraCallBtn").classList.remove("hidden");
        else $("cameraCallBtn").classList.add("hidden");
      }
      if ($("cameraFlipBtn")) {
        if (withVideo) $("cameraFlipBtn").classList.remove("hidden");
        else $("cameraFlipBtn").classList.add("hidden");
      }
      if ($("endCallBtn")) $("endCallBtn").classList.remove("hidden");
      if ($("remoteVideoPlaceholder")) {
        $("remoteVideoPlaceholder").textContent = "Calling…";
        $("remoteVideoPlaceholder").classList.remove("hidden");
      }
      try {
        $("callDialog").showModal();
      } catch (_) {}
    }

    async function acceptCall() {
      const offer = incoming;
      if (!offer) return;
      incoming = null;
      const mode = (offer.payload && offer.payload.callMode) || "video";
      const withVideo = mode !== "audio";

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: withVideo ? { facingMode: "user" } : false
        });
        localStream.getTracks().forEach((t) => { t.enabled = true; });
      } catch (err) {
        toast("Allow camera/mic to accept the call.", true);
        return;
      }

      document.body.classList.toggle("audio-call-active", !withVideo);
      if ($("localVideo")) {
        $("localVideo").srcObject = localStream;
        await ensurePlay($("localVideo"));
      }

      pc = new RTCPeerConnection(ICE);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      pc.ontrack = (e) => {
        // Keep remote audio and video tracks together even when the browser delivers
        // each track in a separate event.
        if (!remoteStream) remoteStream = new MediaStream();
        if (e.track && !remoteStream.getTracks().some(t => t.id === e.track.id)) {
          remoteStream.addTrack(e.track);
        }
        if (e.track) {
          e.track.enabled = true;
          e.track.onunmute = () => {
            if ($("callStatus")) $("callStatus").textContent = "Connected";
            const v = $("remoteVideo");
            if (v && v.srcObject !== remoteStream) v.srcObject = remoteStream;
            if (v) ensurePlay(v, true);
          };
        }
        if ($("remoteVideo")) {
          $("remoteVideo").srcObject = remoteStream;
          $("remoteVideo").muted = false;
          $("remoteVideo").volume = 1;
          ensurePlay($("remoteVideo"), true);
        }
        if (withVideo && e.track && e.track.kind === "video" && $("remoteVideoPlaceholder")) $("remoteVideoPlaceholder").classList.add("hidden");
        if ($("callStatus")) $("callStatus").textContent = "Connected";
      };
      pc.onconnectionstatechange = () => {
        if (pc && $("callStatus")) $("callStatus").textContent = "Call: " + pc.connectionState;
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(offer.conversation_id, offer.sender_id, "ice-candidate", e.candidate.toJSON()).catch(console.error);
        }
      };

      const remoteDesc =
        offer.payload && offer.payload.sdp
          ? { type: offer.payload.type, sdp: offer.payload.sdp }
          : offer.payload;
      await pc.setRemoteDescription(remoteDesc);
      for (const c of queuedIce) {
        try {
          await pc.addIceCandidate(c);
        } catch (_) {}
      }
      queuedIce = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      current = { conversationId: offer.conversation_id, peerId: offer.sender_id, video: withVideo };
      await sendSignal(offer.conversation_id, offer.sender_id, "answer", {
        type: answer.type,
        sdp: answer.sdp
      });

      if ($("callTitle")) $("callTitle").textContent = withVideo ? "Video call" : "Audio call";
      if ($("callStatus")) $("callStatus").textContent = "Connected";
      if ($("acceptCallBtn")) $("acceptCallBtn").classList.add("hidden");
      if ($("declineCallBtn")) $("declineCallBtn").classList.add("hidden");
      if ($("muteCallBtn")) $("muteCallBtn").classList.remove("hidden");
      if ($("cameraCallBtn")) {
        if (withVideo) $("cameraCallBtn").classList.remove("hidden");
        else $("cameraCallBtn").classList.add("hidden");
      }
      if ($("endCallBtn")) $("endCallBtn").classList.remove("hidden");
    }

    let channel = null;
    async function subscribe() {
      const user = await me();
      if (!user) return;
      if (channel) client.removeChannel(channel);
      channel = client
        .channel("calls-fix-" + user.id)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "call_signals", filter: "recipient_id=eq." + user.id },
          async (payload) => {
            const sig = payload.new;
            if (!sig) return;
            if (sig.type === "offer") {
              incoming = sig;
              const mode = (sig.payload && sig.payload.callMode) || "video";
              if ($("callTitle"))
                $("callTitle").textContent = mode === "audio" ? "Incoming audio call" : "Incoming video call";
              if ($("callStatus")) $("callStatus").textContent = "Someone is calling you";
              document.body.classList.toggle("audio-call-active", mode === "audio");
              if ($("acceptCallBtn")) $("acceptCallBtn").classList.remove("hidden");
              if ($("declineCallBtn")) $("declineCallBtn").classList.remove("hidden");
              if ($("muteCallBtn")) $("muteCallBtn").classList.add("hidden");
              if ($("cameraCallBtn")) $("cameraCallBtn").classList.add("hidden");
              if ($("endCallBtn")) $("endCallBtn").classList.add("hidden");
              try {
                $("callDialog").showModal();
              } catch (_) {}
            } else if (sig.type === "answer" && pc && current) {
              try {
                const desc =
                  sig.payload && sig.payload.sdp
                    ? { type: sig.payload.type, sdp: sig.payload.sdp }
                    : sig.payload;
                await pc.setRemoteDescription(desc);
                // The caller may receive ICE candidates before the answer. Apply all
                // candidates queued while remoteDescription was still unset.
                for (const candidate of queuedIce.splice(0)) {
                  try { await pc.addIceCandidate(candidate); }
                  catch (iceError) { console.warn("Queued ICE candidate rejected after answer", iceError); }
                }
                if ($("callStatus")) $("callStatus").textContent = "Negotiating media…";
              } catch (e) {
                console.error(e);
              }
            } else if (sig.type === "ice-candidate" || sig.type === "ice") {
              // ICE candidates can arrive before the incoming offer is accepted and before
              // RTCPeerConnection exists. Queue them instead of silently discarding them.
              try {
                const candidate = new RTCIceCandidate(sig.payload);
                if (pc && pc.remoteDescription) {
                  await pc.addIceCandidate(candidate);
                } else {
                  queuedIce.push(candidate);
                }
              } catch (e) {
                console.error("ICE candidate could not be queued/applied", e);
              }
            } else if (sig.type === "hangup" || sig.type === "decline") {
              if (current || incoming) {
                await endCall(false);
                toast(sig.type === "decline" ? "Call declined." : "Call ended.");
              }
            }
          }
        )
        .subscribe();
    }
    subscribe();
    client.auth.onAuthStateChange(() => subscribe());

    function bind(id, fn) {
      const el = $(id);
      if (!el) return;
      el.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          fn();
        },
        true
      );
    }
    bind("audioCallBtn", () => startCall(false));
    bind("videoCallBtn", () => startCall(true));
    bind("detailsAudioBtn", () => {
      try {
        $("contactDetailsDialog").close();
      } catch (_) {}
      startCall(false);
    });
    bind("detailsVideoBtn", () => {
      try {
        $("contactDetailsDialog").close();
      } catch (_) {}
      startCall(true);
    });
    bind("acceptCallBtn", () => acceptCall());
    bind("declineCallBtn", async () => {
      if (incoming) {
        try {
          await sendSignal(incoming.conversation_id, incoming.sender_id, "decline", {});
        } catch (_) {}
        incoming = null;
      }
      try {
        $("callDialog").close();
      } catch (_) {}
    });
    bind("endCallBtn", () => endCall(true));
    bind("muteCallBtn", () => {
      if (!localStream) return;
      const t = localStream.getAudioTracks()[0];
      if (!t) return;
      t.enabled = !t.enabled;
      if ($("muteCallBtn")) $("muteCallBtn").textContent = t.enabled ? "Mute mic" : "Unmute mic";
    });
    bind("cameraCallBtn", () => {
      if (!localStream) return;
      const t = localStream.getVideoTracks()[0];
      if (!t) return;
      t.enabled = !t.enabled;
      if ($("cameraCallBtn")) $("cameraCallBtn").textContent = t.enabled ? "Turn camera off" : "Turn camera on";
    });

    // Switch between front/back cameras while preserving the active call.
    bind("cameraFlipBtn", async () => {
      if (!localStream || !pc) return;
      const oldTrack = localStream.getVideoTracks()[0];
      if (!oldTrack) { toast("Camera is not active.", true); return; }
      const currentFacing = oldTrack.getSettings && oldTrack.getSettings().facingMode;
      const facingMode = currentFacing === "environment" ? "user" : "environment";
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        const nextTrack = nextStream.getVideoTracks()[0];
        if (!nextTrack) throw new Error("No camera was found");
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) await sender.replaceTrack(nextTrack);
        localStream.removeTrack(oldTrack);
        localStream.addTrack(nextTrack);
        oldTrack.stop();
        nextTrack.enabled = true;
        if ($("localVideo")) {
          $("localVideo").srcObject = localStream;
          await ensurePlay($("localVideo"));
        }
        if ($("cameraFlipBtn")) $("cameraFlipBtn").textContent = facingMode === "environment" ? "Front camera" : "Back camera";
      } catch (err) {
        console.warn("camera flip failed", err);
        toast("Could not switch camera on this device.", true);
      }
    });

    function ensureDeleteSheet() {
      if ($("deleteSheet")) return $("deleteSheet");
      const d = document.createElement("dialog");
      d.id = "deleteSheet";
      d.innerHTML =
        '<div class="delete-sheet-inner">' +
        '<div class="delete-sheet-handle"></div>' +
        '<h3 class="delete-sheet-title">Delete chat?</h3>' +
        '<p class="delete-sheet-sub" id="deleteSheetSub">This removes the chat from your list only. The other person will still see the conversation.</p>' +
        '<div class="delete-sheet-actions">' +
        '<button type="button" class="delete-sheet-danger" id="deleteSheetConfirm">Delete for me</button>' +
        '<button type="button" class="delete-sheet-cancel" id="deleteSheetCancel">Cancel</button>' +
        "</div></div>";
      document.body.appendChild(d);
      return d;
    }

    let pendingDeleteId = null;
    const sheet = ensureDeleteSheet();
    $("deleteSheetCancel").onclick = () => {
      pendingDeleteId = null;
      sheet.close();
    };
    $("deleteSheetConfirm").onclick = async () => {
      const id = pendingDeleteId;
      pendingDeleteId = null;
      sheet.close();
      if (!id) return;
      let res = await client.rpc("hide_conversation", { p_conversation_id: id });
      if (res.error) res = await client.rpc("delete_conversation", { p_conversation_id: id });
      if (res.error) {
        toast("Could not delete. Run supabase_chat.sql in Supabase.", true);
        console.error(res.error);
        return;
      }
      const item = document.querySelector('.chat-item[data-id="' + id + '"]');
      const wasActive = item && item.classList.contains("active");
      if (item) item.remove();
      if (wasActive) {
        const panel = $("conversationPanel");
        const welcome = $("welcomeView");
        const layout = document.querySelector(".layout");
        if (panel) panel.classList.add("hidden");
        if (welcome) welcome.classList.remove("hidden");
        if (layout) layout.classList.remove("in-chat");
        const messages = $("messages");
        if (messages) messages.replaceChildren();
        const input = $("messageInput");
        if (input) { input.value = ""; input.blur(); }
      }
      toast("Chat deleted for you");
    };

    document.addEventListener(
      "click",
      (e) => {
        const del = e.target.closest && e.target.closest(".delete-chat-btn");
        if (!del) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const item = del.closest(".chat-item");
        const id = item && item.getAttribute("data-id");
        if (!id) return;
        const name =
          (item.querySelector(".chat-name") && item.querySelector(".chat-name").textContent) || "this contact";
        pendingDeleteId = id;
        const sub = $("deleteSheetSub");
        if (sub)
          sub.textContent =
            "This removes the chat with " + name + " from your list only. They will still see the conversation.";
        try {
          sheet.showModal();
        } catch (_) {
          if (confirm("Delete chat with " + name + " for you only?")) $("deleteSheetConfirm").click();
        }
      },
      true
    );

    document.addEventListener(
      "click",
      async (e) => {
        const el = e.target.closest && e.target.closest(".user-result");
        if (!el) return;
        const otherId = el.getAttribute("data-id");
        if (!otherId) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
          if ($("newChatDialog")) $("newChatDialog").close();
        } catch (_) {}
        const { data, error } = await client.rpc("get_or_create_conversation", { other_user_id: otherId });
        if (error) {
          toast(
            (error.message || "").toLowerCase().indexOf("function") >= 0
              ? "Run supabase_chat.sql in Supabase to enable new chats."
              : "Could not start chat: " + (error.message || "error"),
            true
          );
          return;
        }
        toast("Chat started");
        setTimeout(() => {
          const item = document.querySelector('.chat-item[data-id="' + data + '"]');
          if (item) item.click();
          else location.reload();
        }, 500);
      },
      true
    );

    console.info("SimpleChat video + delete fixes active");
    return true;
  }

  waitFor(() => !!window.supabase && !!window.SUPABASE_URL).then((ok) => {
    if (ok) patch();
  });
})();

/* ===== END fixes.js ===== */

/* ===== BEGIN call-overlay.js ===== */
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

/* ===== END call-overlay.js ===== */

/* ===== BEGIN ux-polish.js ===== */
// SimpleChat UX polish: stable composer focus, responsive call controls, accessible delete sheet
(() => {
  const $ = (id) => document.getElementById(id);
  let composerWasFocused = false;
  let focusTimer = 0;
  let sendPending = false;

  function keepComposerFocused() {
    const input = $("messageInput");
    if (!composerWasFocused || !input || !document.contains(input) || document.visibilityState !== "visible") return;
    const active = document.activeElement;
    if (!sendPending && active && active !== input && active.matches("button, a, input, select, dialog [tabindex]")) return;
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  }

  document.addEventListener("focusin", (e) => {
    if (e.target && e.target.id === "messageInput") composerWasFocused = true;
  });
  document.addEventListener("focusout", (e) => {
    if (!e.target || e.target.id !== "messageInput") return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      if (composerWasFocused && document.hasFocus() &&
          !document.querySelector("dialog[open]") &&
          document.querySelector(".layout.in-chat")) keepComposerFocused();
    }, 90);
  });

  document.addEventListener("submit", (e) => {
    if (!e.target || e.target.id !== "messageForm") return;
    composerWasFocused = document.activeElement === $("messageInput") || composerWasFocused;
    sendPending = true;
    window.setTimeout(keepComposerFocused, 120);
    window.setTimeout(keepComposerFocused, 320);
    window.setTimeout(() => { sendPending = false; }, 650);
  }, true);

  document.addEventListener("keydown", (e) => {
    const input = $("messageInput");
    if (!input || e.target !== input || e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = $("messageForm");
      if (form && form.requestSubmit) form.requestSubmit();
      else if (form) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  document.addEventListener("input", (e) => {
    if (!e.target || e.target.id !== "messageInput") return;
    const input = e.target;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  document.addEventListener("click", (e) => {
    if (!e.target || e.target.id !== "callCloseBtn") return;
    e.preventDefault();
    const end = $("endCallBtn");
    if (end && !end.classList.contains("hidden")) end.click();
    else {
      const dialog = $("callDialog");
      if (dialog && dialog.open) dialog.close();
    }
  }, true);

  const callDialog = $("callDialog");
  if (callDialog) callDialog.addEventListener("close", () => {
    const mute = $("muteCallBtn"), camera = $("cameraCallBtn"), flip = $("cameraFlipBtn");
    if (mute) mute.textContent = "Mute mic";
    if (camera) camera.textContent = "Turn camera off";
    if (flip) flip.textContent = "Flip camera";
  });

  console.info("SimpleChat keyboard and call UX active");
})();

/* ===== END ux-polish.js ===== */

/* ===== BEGIN chat-reopen.js ===== */
// When a hidden chat receives a new message, refresh list so it reappears
(() => {
  if (!window.supabase || !window.SUPABASE_URL) return;

  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  let channel = null;

  async function refreshChatsSoft() {
    // Trigger the app's list refresh by reloading chats via RPC and dispatching a custom event
    try {
      const { data: sess } = await client.auth.getSession();
      if (!sess || !sess.session) return;
      // Nudge: if app exposes nothing, lightly reload list by toggling filter
      const filter = document.getElementById("chatFilter");
      if (filter) filter.dispatchEvent(new Event("input", { bubbles: true }));
      // Full reload of chat list is safest if a new conversation appeared
      // Only reload if we are on the chat list (not mid-typing)
      const input = document.getElementById("messageInput");
      const typing = input && document.activeElement === input && (input.value || "").length > 0;
      if (!typing) {
        // Call get_my_chats to see if count changed — if app has chats in DOM, compare
        const { data } = await client.rpc("get_my_chats");
        const ids = new Set(
          Array.from(document.querySelectorAll(".chat-item")).map((el) => el.getAttribute("data-id"))
        );
        const serverIds = new Set((data || []).map((r) => r.conversation_id));
        let missing = false;
        serverIds.forEach((id) => {
          if (!ids.has(id)) missing = true;
        });
        if (missing) {
          // Soft navigation: reload page section by forcing a full chat reload
          location.reload();
        }
      }
    } catch (e) {
      console.warn("chat-reopen", e);
    }
  }

  async function subscribe() {
    const { data: sess } = await client.auth.getSession();
    const user = sess && sess.session && sess.session.user;
    if (!user) return;
    if (channel) client.removeChannel(channel);

    channel = client
      .channel("reopen-" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new;
          if (!msg || msg.sender_id === user.id) return;
          // Someone else sent a message — chat may need to reappear
          setTimeout(refreshChatsSoft, 400);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members", filter: "user_id=eq." + user.id },
        () => {
          setTimeout(refreshChatsSoft, 300);
        }
      )
      .subscribe();
  }

  function boot() {
    if (!window.SUPABASE_URL || !window.supabase) {
      setTimeout(boot, 400);
      return;
    }
    subscribe();
    client.auth.onAuthStateChange(() => subscribe());
  }
  boot();
})();

/* ===== END chat-reopen.js ===== */

/* ===== BEGIN settings.js ===== */
/**
 * SimpleChat Settings — theme, density, sounds, accessibility, enter-to-send
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "simplechat_settings_v1";
  const defaults = {
    theme: "system",
    density: "comfortable",
    font: "md",
    reducedMotion: "system",
    enterToSend: true,
    soundMessages: true,
    soundIncomingCall: true,
    soundOutgoingCall: true,
    soundVolume: 0.7,
    notifBrowser: false,
    ringtone: "chime"
  };

  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  }
  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  let settings = load();

  function resolveTheme(mode) {
    if (mode === "light") return "light";
    if (mode === "dark") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    const resolved = resolveTheme(settings.theme);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-mode", settings.theme);
    document.documentElement.setAttribute("data-density", settings.density);
    document.documentElement.setAttribute("data-font", settings.font);
    document.documentElement.setAttribute("data-reduced-motion", settings.reducedMotion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f1115" : "#0084ff");
  }

  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }
  function tone(freq, dur, type, vol) {
    const c = ctx();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = (vol != null ? vol : settings.soundVolume) * 0.25;
    o.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }
  function playMessageSound() {
    if (!settings.soundMessages) return;
    tone(880, 0.08, "sine");
    setTimeout(() => tone(1175, 0.1, "sine"), 90);
  }
  let ringTimer = null;
  function startRingtone() {
    stopRingtone();
    if (!settings.soundIncomingCall) return;
    const tick = () => {
      tone(520, 0.18, "triangle");
      setTimeout(() => tone(680, 0.22, "triangle"), 200);
    };
    tick();
    ringTimer = setInterval(tick, 1400);
  }
  function stopRingtone() {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
  }

  function watchCalls() {
    const dialog = $("callDialog");
    if (!dialog) return;
    const obs = new MutationObserver(() => {
      if (!dialog.open) {
        stopRingtone();
        return;
      }
      const accept = $("acceptCallBtn");
      const isIncoming = accept && !accept.classList.contains("hidden");
      if (isIncoming) startRingtone();
      else stopRingtone();
    });
    obs.observe(dialog, { attributes: true, attributeFilter: ["open"], subtree: true, childList: true });
    ["acceptCallBtn", "declineCallBtn", "endCallBtn"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("click", stopRingtone, true);
    });
  }

  function watchMessages() {
    const box = $("messages");
    if (!box) return;
    let lastCount = box.children.length;
    new MutationObserver(() => {
      const n = box.children.length;
      if (n > lastCount) {
        const last = box.lastElementChild;
        if (last && last.classList.contains("theirs")) playMessageSound();
      }
      lastCount = n;
    }).observe(box, { childList: true });
  }

  window.SimpleChatSettings = {
    get: () => ({ ...settings }),
    enterToSend: () => !!settings.enterToSend,
    playMessageSound,
    startRingtone,
    stopRingtone
  };

  function buildSettingsDialog() {
    if ($("settingsDialog")) return;
    const d = document.createElement("dialog");
    d.id = "settingsDialog";
    d.className = "settings-dialog";
    d.innerHTML =
      '<div class="settings-shell">' +
      '<div class="settings-head"><h2>Settings</h2>' +
      '<button type="button" class="icon-btn" id="settingsCloseBtn" aria-label="Close settings">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>' +
      '<div class="settings-layout">' +
      '<nav class="settings-nav" role="tablist" aria-label="Settings sections">' +
      '<button type="button" class="settings-nav-btn active" data-panel="appearance">Appearance</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="notifications">Notifications</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="chat">Chat</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="accessibility">Accessibility</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="account">Account</button></nav>' +
      '<div class="settings-panels">' +
      '<section class="settings-panel active" id="panel-appearance">' +
      '<h3>Theme</h3><p class="settings-help">Choose light, dark, or match your device.</p>' +
      '<div class="segmented" role="group" aria-label="Theme">' +
      '<button type="button" data-set="theme" data-value="light">Light</button>' +
      '<button type="button" data-set="theme" data-value="dark">Dark</button>' +
      '<button type="button" data-set="theme" data-value="system">System</button></div>' +
      '<h3>Density</h3><div class="segmented" role="group" aria-label="Density">' +
      '<button type="button" data-set="density" data-value="compact">Compact</button>' +
      '<button type="button" data-set="density" data-value="comfortable">Comfortable</button>' +
      '<button type="button" data-set="density" data-value="spacious">Spacious</button></div>' +
      '<h3>Text size</h3><div class="segmented" role="group" aria-label="Font size">' +
      '<button type="button" data-set="font" data-value="sm">S</button>' +
      '<button type="button" data-set="font" data-value="md">M</button>' +
      '<button type="button" data-set="font" data-value="lg">L</button>' +
      '<button type="button" data-set="font" data-value="xl">XL</button></div></section>' +
      '<section class="settings-panel" id="panel-notifications">' +
      '<h3>Sounds</h3>' +
      '<label class="toggle-row"><span>Message sounds</span><input type="checkbox" id="setSoundMsg"></label>' +
      '<label class="toggle-row"><span>Incoming call ring</span><input type="checkbox" id="setSoundIn"></label>' +
      '<label class="toggle-row"><span>Outgoing call tone</span><input type="checkbox" id="setSoundOut"></label>' +
      '<label class="settings-label" for="setVolume">Volume</label>' +
      '<input type="range" id="setVolume" min="0" max="1" step="0.05">' +
      '<div class="settings-actions">' +
      '<button type="button" class="call-control" id="previewMsgSound">Preview message</button>' +
      '<button type="button" class="call-control" id="previewRing">Preview ring</button></div>' +
      '<h3>Browser notifications</h3>' +
      '<p class="settings-help" id="notifStatus">Permission: unknown</p>' +
      '<button type="button" class="primary" id="requestNotifBtn">Enable browser notifications</button></section>' +
      '<section class="settings-panel" id="panel-chat">' +
      '<h3>Composer</h3>' +
      '<label class="toggle-row"><span>Enter sends message (Shift+Enter for new line)</span><input type="checkbox" id="setEnterSend"></label>' +
      '<p class="settings-help">When off, Enter inserts a new line; use the Send button to send.</p></section>' +
      '<section class="settings-panel" id="panel-accessibility">' +
      '<h3>Motion</h3><div class="segmented" role="group" aria-label="Reduced motion">' +
      '<button type="button" data-set="reducedMotion" data-value="system">System</button>' +
      '<button type="button" data-set="reducedMotion" data-value="on">Reduce</button>' +
      '<button type="button" data-set="reducedMotion" data-value="off">Full</button></div>' +
      '<p class="settings-help">Focus rings and keyboard navigation remain available.</p></section>' +
      '<section class="settings-panel" id="panel-account">' +
      '<h3>Profile</h3><p class="settings-help">Change name, username, or photo in Profile.</p>' +
      '<button type="button" class="primary" id="settingsOpenProfile">Edit profile</button>' +
      '<button type="button" class="call-control" id="settingsLogout" style="margin-top:12px">Sign out</button></section>' +
      '</div></div></div>';
    document.body.appendChild(d);

    d.querySelectorAll(".settings-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        d.querySelectorAll(".settings-nav-btn").forEach((b) => b.classList.remove("active"));
        d.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = $("panel-" + btn.dataset.panel);
        if (panel) panel.classList.add("active");
      });
    });

    function syncUI() {
      d.querySelectorAll("[data-set]").forEach((btn) => {
        btn.classList.toggle("active", settings[btn.dataset.set] === btn.dataset.value);
      });
      $("setSoundMsg").checked = settings.soundMessages;
      $("setSoundIn").checked = settings.soundIncomingCall;
      $("setSoundOut").checked = settings.soundOutgoingCall;
      $("setVolume").value = settings.soundVolume;
      $("setEnterSend").checked = settings.enterToSend;
      $("notifStatus").textContent = "Permission: " + (Notification?.permission || "unsupported");
    }

    d.querySelectorAll("[data-set]").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings[btn.dataset.set] = btn.dataset.value;
        save(settings);
        applyTheme();
        syncUI();
      });
    });
    $("setSoundMsg").onchange = () => {
      settings.soundMessages = $("setSoundMsg").checked;
      save(settings);
    };
    $("setSoundIn").onchange = () => {
      settings.soundIncomingCall = $("setSoundIn").checked;
      save(settings);
    };
    $("setSoundOut").onchange = () => {
      settings.soundOutgoingCall = $("setSoundOut").checked;
      save(settings);
    };
    $("setVolume").oninput = () => {
      settings.soundVolume = Number($("setVolume").value);
      save(settings);
    };
    $("setEnterSend").onchange = () => {
      settings.enterToSend = $("setEnterSend").checked;
      save(settings);
    };
    $("previewMsgSound").onclick = () => playMessageSound();
    $("previewRing").onclick = () => {
      startRingtone();
      setTimeout(stopRingtone, 2800);
    };
    $("requestNotifBtn").onclick = async () => {
      if (!("Notification" in window)) return;
      const p = await Notification.requestPermission();
      settings.notifBrowser = p === "granted";
      save(settings);
      syncUI();
    };
    $("settingsCloseBtn").onclick = () => d.close();
    $("settingsOpenProfile").onclick = () => {
      d.close();
      $("profileBtn")?.click();
      $("mobileProfileBtn")?.click();
    };
    $("settingsLogout").onclick = () => {
      d.close();
      $("logoutBtn")?.click();
    };
    d.addEventListener("close", stopRingtone);
    syncUI();
  }

  function openSettings() {
    buildSettingsDialog();
    const d = $("settingsDialog");
    try {
      d.showModal();
    } catch {
      d.setAttribute("open", "");
    }
  }

  function injectSettingsButton() {
    const actions = document.querySelector(".sidebar-actions");
    if (!actions || $("settingsBtn")) return;
    const tbtn = document.createElement("button");
    tbtn.id = "themeQuickBtn";
    tbtn.type = "button";
    tbtn.className = "icon-btn";
    tbtn.title = "Toggle theme";
    tbtn.setAttribute("aria-label", "Toggle light and dark theme");
    tbtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    tbtn.addEventListener("click", () => {
      const cur = resolveTheme(settings.theme);
      settings.theme = cur === "dark" ? "light" : "dark";
      save(settings);
      applyTheme();
    });
    const btn = document.createElement("button");
    btn.id = "settingsBtn";
    btn.type = "button";
    btn.className = "icon-btn";
    btn.title = "Settings";
    btn.setAttribute("aria-label", "Settings");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    btn.addEventListener("click", openSettings);
    actions.insertBefore(btn, actions.firstChild);
    actions.insertBefore(tbtn, actions.firstChild);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const input = $("messageInput");
      if (!input || e.target !== input) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      if (!settings.enterToSend) e.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener("contextmenu", (e) => {
    const bubble = e.target.closest && e.target.closest(".bubble");
    if (!bubble) return;
    e.preventDefault();
    const text = bubble.textContent || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const t = $("toast");
        if (t) {
          t.textContent = "Message copied";
          t.className = "toast show";
          setTimeout(() => {
            t.className = "toast";
          }, 1800);
        }
      });
    }
  });

  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settings.theme === "system") applyTheme();
  });

  function boot() {
    injectSettingsButton();
    watchCalls();
    watchMessages();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  else setTimeout(boot, 800);
  setInterval(injectSettingsButton, 2000);
  console.info("SimpleChat settings module active");
})();

/* ===== END settings.js ===== */

/* ===== BEGIN ui-v2.js ===== */
/**
 * SimpleChat UI v2 — toolbar, reply, reactions, contact panel, calls
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const REACT_KEY = "sc_reactions_v1";
  const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 2000);
  }

  function loadReactions() {
    try { return JSON.parse(localStorage.getItem(REACT_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveReactions(map) {
    localStorage.setItem(REACT_KEY, JSON.stringify(map));
  }

  function applyThemeSoft(mode) {
    try {
      const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
      s.theme = mode;
      localStorage.setItem("simplechat_settings_v1", JSON.stringify(s));
      const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme-mode", mode);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#0f1115" : "#0084ff");
      toast(mode === "system" ? "Theme: System" : mode === "dark" ? "Dark theme" : "Light theme");
    } catch {}
  }

  let openMenu = null;
  function closeMenus() {
    document.querySelectorAll(".sc-menu.open").forEach((m) => m.classList.remove("open"));
    openMenu = null;
  }

  function placeMenu(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.visibility = "hidden";
    menu.classList.add("open");
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = r.right - mw;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "";
  }

  function buildMoreMenu() {
    if ($("scMoreMenu")) return $("scMoreMenu");
    const m = document.createElement("div");
    m.id = "scMoreMenu";
    m.className = "sc-menu";
    m.setAttribute("role", "menu");
    m.innerHTML =
      '<div class="sc-menu-label">Appearance</div>' +
      '<button type="button" class="sc-menu-item" data-act="theme-light" role="menuitem">Light theme <span class="check">✓</span></button>' +
      '<button type="button" class="sc-menu-item" data-act="theme-dark" role="menuitem">Dark theme <span class="check">✓</span></button>' +
      '<button type="button" class="sc-menu-item" data-act="theme-system" role="menuitem">System theme <span class="check">✓</span></button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Notifications</div>' +
      '<button type="button" class="sc-menu-item" data-act="toggle-sound" role="menuitem">Message sounds</button>' +
      '<button type="button" class="sc-menu-item" data-act="open-settings" role="menuitem">All settings…</button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Application</div>' +
      '<button type="button" class="sc-menu-item" data-act="install" role="menuitem">Install app</button>' +
      '<div class="sc-menu-sep"></div>' +
      '<div class="sc-menu-label">Account</div>' +
      '<button type="button" class="sc-menu-item" data-act="profile" role="menuitem">Profile settings</button>' +
      '<button type="button" class="sc-menu-item danger" data-act="logout" role="menuitem">Sign out</button>';
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      closeMenus();
      if (act === "theme-light") return applyThemeSoft("light");
      if (act === "theme-dark") return applyThemeSoft("dark");
      if (act === "theme-system") return applyThemeSoft("system");
      if (act === "toggle-sound") {
        try {
          const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
          s.soundMessages = s.soundMessages === false;
          localStorage.setItem("simplechat_settings_v1", JSON.stringify(s));
          toast(s.soundMessages !== false ? "Message sounds on" : "Message sounds off");
        } catch {}
        return;
      }
      if (act === "open-settings") {
        const d = $("settingsDialog");
        if (d) {
          try { d.showModal(); } catch { d.setAttribute("open", ""); }
        } else {
          $("settingsBtn")?.click();
          window.dispatchEvent(new CustomEvent("sc-open-settings"));
        }
        return;
      }
      if (act === "install") { $("installAppBtn")?.click(); return; }
      if (act === "profile") { $("profileBtn")?.click(); $("mobileProfileBtn")?.click(); return; }
      if (act === "logout") {
        if (confirm("Sign out of SimpleChat?")) $("logoutBtn")?.click();
      }
    });
    return m;
  }

  function injectToolbar() {
    const actions = document.querySelector(".sidebar-actions");
    if (!actions || $("moreMenuBtn")) return;
    const more = document.createElement("button");
    more.id = "moreMenuBtn";
    more.type = "button";
    more.className = "icon-btn more-btn";
    more.title = "More options";
    more.setAttribute("aria-label", "More options");
    more.setAttribute("aria-haspopup", "menu");
    more.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = buildMoreMenu();
      if (menu.classList.contains("open") && openMenu === menu) {
        closeMenus();
        return;
      }
      closeMenus();
      try {
        const s = JSON.parse(localStorage.getItem("simplechat_settings_v1") || "{}");
        const mode = s.theme || "system";
        menu.querySelectorAll("[data-act^=theme-]").forEach((b) => {
          b.classList.toggle("active", b.dataset.act === "theme-" + mode);
        });
      } catch {}
      placeMenu(menu, more);
      openMenu = menu;
    });
    actions.appendChild(more);
  }

  document.addEventListener("click", () => closeMenus());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  let replyTarget = null;
  function ensureReplyBar() {
    if ($("replyBar")) return $("replyBar");
    const form = $("messageForm");
    if (!form) return null;
    const bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML =
      '<div class="reply-bar-body"><strong id="replyBarLabel">Reply</strong><span id="replyBarText"></span></div>' +
      '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel reply">✕</button>';
    form.parentNode.insertBefore(bar, form);
    $("replyBarClose").onclick = clearReply;
    return bar;
  }
  function clearReply() {
    replyTarget = null;
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }
  function setReply(msgId, text) {
    ensureReplyBar();
    replyTarget = { id: msgId, text: (text || "").slice(0, 120) };
    const bar = $("replyBar");
    if (!bar) return;
    $("replyBarLabel").textContent = "Replying";
    $("replyBarText").textContent = replyTarget.text;
    bar.classList.add("active");
    $("messageInput")?.focus();
  }
  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyWired) return;
    form.dataset.replyWired = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const meta = "«reply:" + replyTarget.id + "» " + replyTarget.text.replace(/\n/g, " ").slice(0, 80);
      if (!input.value.startsWith("«reply:")) input.value = meta + "\n" + input.value;
      setTimeout(clearReply, 0);
    }, true);
  }

  function ensureReactPicker() {
    if ($("reactPicker")) return $("reactPicker");
    const p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.innerHTML = EMOJIS.map((e) => '<button type="button" data-emoji="' + e + '">' + e + "</button>").join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      toggleReaction(p.dataset.msgId, b.dataset.emoji);
      p.classList.remove("open");
    });
    return p;
  }

  function toggleReaction(msgId, emoji) {
    const map = loadReactions();
    if (!map[msgId]) map[msgId] = {};
    const entry = map[msgId];
    if (!entry[emoji]) entry[emoji] = [];
    const i = entry[emoji].indexOf("me");
    if (i >= 0) entry[emoji].splice(i, 1);
    else entry[emoji].push("me");
    if (!entry[emoji].length) delete entry[emoji];
    saveReactions(map);
    renderReactionsFor(msgId);
  }

  function renderReactionsFor(msgId) {
    const row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
    if (!row) return;
    let box = row.querySelector(".msg-reactions");
    if (!box) {
      box = document.createElement("div");
      box.className = "msg-reactions";
      row.appendChild(box);
    }
    const map = loadReactions()[msgId] || {};
    box.innerHTML = Object.entries(map)
      .filter(([, users]) => users.length)
      .map(([emoji, users]) => {
        const mine = users.includes("me") ? " mine" : "";
        return '<button type="button" class="reaction-chip' + mine + '" data-emoji="' + emoji + '" data-msg="' + msgId + '">' + emoji + "</button>";
      })
      .join("");
    box.querySelectorAll(".reaction-chip").forEach((c) => {
      c.onclick = () => toggleReaction(c.dataset.msg, c.dataset.emoji);
    });
  }

  function parseBody(raw) {
    if (!raw) return { reply: null, text: "" };
    if (raw.startsWith("«reply:")) {
      const nl = raw.indexOf("\n");
      if (nl > 0) {
        const head = raw.slice(0, nl);
        const hm = head.match(/^«reply:([^»]+)»\s*(.*)$/);
        if (hm) return { reply: { id: hm[1], preview: hm[2] }, text: raw.slice(nl + 1) };
      }
    }
    return { reply: null, text: raw };
  }

  function enhanceRow(row) {
    if (!row || row.dataset.enhanced) return;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;
    row.dataset.enhanced = "1";
    let msgId = row.dataset.msgId || row.getAttribute("data-id") || ("dom-" + Math.random().toString(36).slice(2, 10));
    row.dataset.msgId = msgId;
    const raw = bubble.dataset.raw || bubble.textContent || "";
    const parsed = parseBody(raw);
    if (parsed.reply && !row.querySelector(".reply-preview")) {
      const rp = document.createElement("div");
      rp.className = "reply-preview";
      rp.textContent = parsed.reply.preview || "Original message";
      bubble.parentNode.insertBefore(rp, bubble);
      if (parsed.text && bubble.textContent === raw) bubble.textContent = parsed.text;
    }
    if (!row.querySelector(".msg-actions")) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">↩</button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">☺</button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">⧉</button>';
      row.appendChild(acts);
      acts.addEventListener("click", (e) => {
        const b = e.target.closest("[data-a]");
        if (!b) return;
        e.stopPropagation();
        const text = (parsed.text || bubble.textContent || "").trim();
        if (b.dataset.a === "copy") navigator.clipboard?.writeText(text).then(() => toast("Copied"));
        else if (b.dataset.a === "reply") setReply(msgId, text);
        else if (b.dataset.a === "react") {
          const p = ensureReactPicker();
          p.dataset.msgId = msgId;
          const r = b.getBoundingClientRect();
          p.style.left = Math.min(r.left, window.innerWidth - 220) + "px";
          p.style.top = Math.max(8, r.top - 48) + "px";
          p.classList.add("open");
        }
      });
    }
    let timer;
    row.addEventListener("touchstart", () => { timer = setTimeout(() => row.classList.add("show-actions"), 450); }, { passive: true });
    row.addEventListener("touchend", () => clearTimeout(timer));
    row.addEventListener("touchmove", () => clearTimeout(timer));
    renderReactionsFor(msgId);
  }

  function observeMessages() {
    const box = $("messages");
    if (!box) return;
    new MutationObserver(() => document.querySelectorAll("#messages .row").forEach(enhanceRow)).observe(box, { childList: true, subtree: true });
    document.querySelectorAll("#messages .row").forEach(enhanceRow);
  }

  function enhanceContactDetails() {
    const dialog = $("contactDetailsDialog");
    if (!dialog) return;
    const audioBtn = $("detailsAudioBtn");
    const videoBtn = $("detailsVideoBtn");
    if (audioBtn && !audioBtn.dataset.iconized) {
      audioBtn.dataset.iconized = "1";
      audioBtn.innerHTML = "📞 Audio";
    }
    if (videoBtn && !videoBtn.dataset.iconized) {
      videoBtn.dataset.iconized = "1";
      videoBtn.innerHTML = "📹 Video";
    }
    [audioBtn, videoBtn].forEach((btn) => {
      if (!btn || btn.dataset.debounce) return;
      btn.dataset.debounce = "1";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        setTimeout(() => { btn.disabled = false; }, 1500);
      }, true);
    });
    if (dialog.dataset.enhanced) return;
    dialog.dataset.enhanced = "1";
    const body = dialog.querySelector(".details-body");
    if (!body || body.querySelector(".details-groups")) return;
    const groups = document.createElement("div");
    groups.className = "details-groups";
    groups.innerHTML =
      "<h4>Conversation</h4>" +
      '<button type="button" data-c="msg"><span class="dg-icon">💬</span> Send message</button>' +
      '<button type="button" data-c="mute"><span class="dg-icon">🔔</span> <span class="mute-label">Mute notifications</span></button>' +
      '<button type="button" class="danger" data-c="hide"><span class="dg-icon">🗑️</span> Hide chat for me</button>' +
      "<h4>About</h4>" +
      '<div style="padding:8px 12px;color:var(--muted);font-size:0.9rem;text-align:left"><strong style="color:var(--text)">Username</strong><br><span id="detailsAboutUser"></span></div>';
    body.appendChild(groups);
    const un = $("detailsUsername");
    const about = $("detailsAboutUser");
    if (un && about) about.textContent = un.textContent || "—";
    const muteBtn = groups.querySelector('[data-c="mute"]');
    function syncMuteLabel() {
      try {
        const id = $("conversationName")?.textContent || "chat";
        const muted = localStorage.getItem("sc_muted_" + id) === "1";
        const lab = muteBtn?.querySelector(".mute-label");
        if (lab) lab.textContent = muted ? "Unmute notifications" : "Mute notifications";
      } catch {}
    }
    syncMuteLabel();
    groups.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "msg") {
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
        $("messageInput")?.focus();
      }
      if (c === "mute") {
        try {
          const id = $("conversationName")?.textContent || "chat";
          const key = "sc_muted_" + id;
          localStorage.setItem(key, localStorage.getItem(key) === "1" ? "0" : "1");
          syncMuteLabel();
          toast(localStorage.getItem(key) === "1" ? "Notifications muted" : "Notifications unmuted");
        } catch {}
      }
      if (c === "hide") {
        if (!confirm("Hide this chat for you? The other person keeps the conversation.")) return;
        const del = document.querySelector(".chat-item.active .delete-chat-btn");
        if (del) del.click();
        else toast("Use the trash icon on the chat list to hide");
        try { dialog.close(); } catch { dialog.removeAttribute("open"); }
      }
    });
  }

  let callTimer = null;
  let callStartedAt = null;
  function wireCallUI() {
    const dialog = $("callDialog");
    if (!dialog) return;
    if (!$("callDuration") && $("callStatus")) {
      const d = document.createElement("div");
      d.id = "callDuration";
      $("callStatus").parentNode.appendChild(d);
    }
    const flip = $("cameraFlipBtn");
    new MutationObserver(() => {
      if (dialog.open) {
        const status = ($("callStatus")?.textContent || "").toLowerCase();
        if (status.includes("connected") && !callStartedAt) {
          callStartedAt = Date.now();
          if (callTimer) clearInterval(callTimer);
          callTimer = setInterval(() => {
            const el = $("callDuration");
            if (!el || !callStartedAt) return;
            const s = Math.floor((Date.now() - callStartedAt) / 1000);
            el.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
          }, 1000);
        }
        const title = ($("callTitle")?.textContent || "").toLowerCase();
        if (flip) flip.classList.toggle("hidden", !title.includes("video"));
      } else {
        if (callTimer) clearInterval(callTimer);
        callTimer = null;
        callStartedAt = null;
        const el = $("callDuration");
        if (el) el.textContent = "";
      }
    }).observe(dialog, { attributes: true, childList: true, subtree: true });
  }

  function boot() {
    injectToolbar();
    ensureReplyBar();
    wireSendReply();
    observeMessages();
    enhanceContactDetails();
    wireCallUI();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 600));
  else setTimeout(boot, 600);
  setInterval(injectToolbar, 2500);
  setInterval(enhanceContactDetails, 3000);
  console.info("SimpleChat UI v2 active");
})();

/* ===== END ui-v2.js ===== */

/* ===== BEGIN reactions.js ===== */
/**
 * Shared message reactions (Supabase message_reactions).
 * Resolves temporary dom-* ids to real bigint message ids.
 */
(() => {
  let db = null;
  let myId = null;
  let channel = null;
  let serverOk = null;
  let lastMsgs = [];

  function client() {
    if (db) return db;
    try {
      if (window.supabase && window.supabase.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      }
    } catch (e) {}
    return db;
  }

  function mid(msgId) {
    return /^\d+$/.test(String(msgId)) ? Number(msgId) : msgId;
  }

  function isRealId(id) {
    return id != null && id !== "" && !String(id).startsWith("dom-") && /^\d+$/.test(String(id));
  }

  async function ensureUser() {
    const c = client();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    myId = data && data.user ? data.user.id : null;
    return myId;
  }

  function activeConvId() {
    const el = document.querySelector(".chat-item.active");
    return el ? el.getAttribute("data-id") : null;
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 2200);
  }

  async function fetchMessages() {
    const convId = activeConvId();
    const c = client();
    if (!convId || !c) return [];
    const { data, error } = await c
      .from("messages")
      .select("id, body, created_at, sender_id")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (error || !data) return lastMsgs;
    lastMsgs = data;
    return data;
  }

  async function tagRowsWithIds() {
    const data = await fetchMessages();
    if (!data.length) return;
    const rows = Array.prototype.slice.call(document.querySelectorAll("#messages .row"));
    const n = Math.min(rows.length, data.length);
    for (let i = 0; i < n; i++) {
      rows[i].dataset.msgId = String(data[i].id);
      rows[i].dataset.msgServer = "1";
    }
  }

  async function resolveMsgId(msgId, rowEl) {
    if (isRealId(msgId)) return mid(msgId);
    await tagRowsWithIds();
    let row = rowEl;
    if (!row && msgId) {
      row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
    }
    if (row && isRealId(row.dataset.msgId)) return mid(row.dataset.msgId);
    if (row) {
      const rows = Array.prototype.slice.call(document.querySelectorAll("#messages .row"));
      const idx = rows.indexOf(row);
      if (idx >= 0 && lastMsgs[idx]) return mid(lastMsgs[idx].id);
    }
    return null;
  }

  function renderChip(row, emoji, count, mine) {
    let box = row.querySelector(".msg-reactions");
    if (!box) {
      box = document.createElement("div");
      box.className = "msg-reactions";
      row.appendChild(box);
    }
    let chip = box.querySelector('[data-emoji="' + emoji + '"]');
    if (!count) {
      if (chip) chip.remove();
      if (box && !box.children.length) box.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.className = "reaction-chip";
      chip.dataset.emoji = emoji;
      chip.onclick = function () { toggleReaction(row.dataset.msgId, emoji); };
      box.appendChild(chip);
    }
    chip.className = "reaction-chip" + (mine ? " mine" : "");
    chip.dataset.msg = row.dataset.msgId;
    chip.textContent = count > 1 ? emoji + " " + count : emoji;
  }

  async function loadServerReactions() {
    const c = client();
    const uid = await ensureUser();
    const rows = Array.prototype.slice.call(document.querySelectorAll("#messages .row[data-msg-id]"));
    const ids = rows.map(function (r) { return r.dataset.msgId; }).filter(isRealId).map(mid);
    if (!c || !ids.length) return;
    const { data, error } = await c.from("message_reactions").select("message_id, emoji, user_id").in("message_id", ids);
    if (error) {
      serverOk = false;
      return;
    }
    serverOk = true;
    const map = {};
    (data || []).forEach(function (r) {
      const id = String(r.message_id);
      if (!map[id]) map[id] = {};
      if (!map[id][r.emoji]) map[id][r.emoji] = { count: 0, mine: false };
      map[id][r.emoji].count++;
      if (uid && r.user_id === uid) map[id][r.emoji].mine = true;
    });
    rows.forEach(function (row) {
      const id = row.dataset.msgId;
      const entries = map[id] || {};
      const box = row.querySelector(".msg-reactions");
      if (box) box.innerHTML = "";
      Object.keys(entries).forEach(function (emoji) {
        const info = entries[emoji];
        renderChip(row, emoji, info.count, info.mine);
      });
    });
  }

  async function toggleReaction(msgId, emoji) {
    const uid = await ensureUser();
    if (!uid) {
      toast("Sign in to react");
      return;
    }
    const row =
      document.querySelector('.row[data-msg-id="' + msgId + '"]') ||
      document.querySelector('.row[data-msg-id="' + String(msgId) + '"]');
    const realId = await resolveMsgId(msgId, row);
    if (!realId) {
      toast("Wait a moment, then try reacting again");
      await tagRowsWithIds();
      return;
    }
    if (row) row.dataset.msgId = String(realId);
    const c = client();
    if (!c) return;
    const { data: existing } = await c
      .from("message_reactions")
      .select("id")
      .eq("message_id", realId)
      .eq("user_id", uid)
      .eq("emoji", emoji)
      .maybeSingle();
    if (existing && existing.id) {
      await c.from("message_reactions").delete().eq("id", existing.id);
    } else {
      const { error } = await c.from("message_reactions").insert({
        message_id: realId,
        user_id: uid,
        emoji: emoji
      });
      if (error) {
        toast(error.message || "Could not react");
        return;
      }
    }
    await loadServerReactions();
  }

  async function refreshAll() {
    await tagRowsWithIds();
    await loadServerReactions();
  }

  function subscribe() {
    const c = client();
    if (!c || channel) return;
    channel = c
      .channel("msg-reactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, function () {
        loadServerReactions();
      })
      .subscribe();
  }

  const box = document.getElementById("messages");
  if (box) {
    new MutationObserver(function () {
      setTimeout(refreshAll, 200);
    }).observe(box, { childList: true, subtree: true });
  }

  document.addEventListener(
    "click",
    function (e) {
      const btn = e.target.closest('.msg-act[data-a="react"]');
      if (!btn) return;
      const row = btn.closest(".row");
      if (!row) return;
      setTimeout(async function () {
        await tagRowsWithIds();
        const p = document.getElementById("reactPicker");
        if (p && row && isRealId(row.dataset.msgId)) {
          p.dataset.msgId = row.dataset.msgId;
        }
      }, 0);
    },
    true
  );

  setTimeout(refreshAll, 800);
  subscribe();
  console.info("SimpleChat shared reactions ready");

  window.__scToggleReaction = toggleReaction;
  document.addEventListener("sc-react", function (ev) {
    const d = ev.detail || {};
    if (d.msgId && d.emoji) toggleReaction(d.msgId, d.emoji);
  });
})();

/* ===== END reactions.js ===== */

/* ===== BEGIN call-viewport.js ===== */
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

/* ===== END call-viewport.js ===== */

/* ===== BEGIN motion.js ===== */
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

/* ===== END motion.js ===== */

/* ===== BEGIN brand-boot.js ===== */
(() => {
  ["composer-fix.css?v=2", "mobile-gestures.css?v=2", "desktop-popups.css?v=4", "reply-mobile.css?v=3", "mobile-fix.css?v=1", "msg-actions.css?v=6", "motion.css?v=1", "polish.css?v=1", "style-shift.css?v=1", "desktop-ui.css?v=1", "kurakani.css?v=4", "layout-fix.css?v=2"].forEach((href) => {
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

/* ===== END brand-boot.js ===== */

/* ===== BEGIN motion-messages.js ===== */
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

/* ===== END motion-messages.js ===== */

/* ===== BEGIN msg-actions-fix.js ===== */
(() => {
  const EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDD25"];
  let replyTarget = null;
  let openRow = null;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia("(max-width: 720px), (hover: none)").matches;

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 1800);
  }

  function ensureCss() {
    ["msg-actions.css?v=6", "mobile-fix.css?v=1", "layout-fix.css?v=2", "reply-mobile.css?v=3", "desktop-popups.css?v=4"].forEach((href) => {
      if (document.querySelector('link[href*="' + href.split("?")[0] + '"]')) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    });
  }

  function ensureReplyBar() {
    let bar = $("replyBar");
    if (bar) return bar;
    const form = $("messageForm");
    if (!form || !form.parentNode) return null;
    bar = document.createElement("div");
    bar.id = "replyBar";
    bar.className = "reply-bar";
    bar.innerHTML =
      '<div class="reply-bar-body"><strong id="replyBarLabel">Replying</strong><span id="replyBarText"></span></div>' +
      '<button type="button" class="reply-bar-close" id="replyBarClose" aria-label="Cancel reply">\u2715</button>';
    form.parentNode.insertBefore(bar, form);
    return bar;
  }

  function clearReply() {
    replyTarget = null;
    if (typeof window.__scClearReply === "function") window.__scClearReply();
    const bar = $("replyBar");
    if (bar) bar.classList.remove("active");
  }

  function setReply(msgId, text) {
    if (typeof window.__scSetReply === "function") {
      window.__scSetReply(msgId, text);
      return;
    }
    ensureReplyBar();
    const clean = String(text || "").replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
    replyTarget = { id: String(msgId), text: clean };
    const bar = $("replyBar");
    const form = $("messageForm");
    if (bar && form && form.parentNode && bar.nextElementSibling !== form) form.parentNode.insertBefore(bar, form);
    if (!bar) return;
    const label = $("replyBarLabel");
    const txt = $("replyBarText");
    if (label) label.textContent = "Replying";
    if (txt) txt.textContent = clean || "Message";
    bar.classList.add("active");
    const input = $("messageInput");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function ensureReactPicker() {
    let p = $("reactPicker");
    if (p) return p;
    p = document.createElement("div");
    p.id = "reactPicker";
    p.className = "react-picker";
    p.setAttribute("role", "listbox");
    p.innerHTML = EMOJIS.map((e) =>
      '<button type="button" data-emoji="' + e + '" aria-label="React ' + e + '">' + e + "</button>"
    ).join("");
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b || !p.dataset.msgId) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.__scToggleReaction === "function") window.__scToggleReaction(p.dataset.msgId, b.dataset.emoji);
      else document.dispatchEvent(new CustomEvent("sc-react", { detail: { msgId: p.dataset.msgId, emoji: b.dataset.emoji } }));
      closeReact();
    });
    document.addEventListener("click", (e) => {
      if (!p.classList.contains("open")) return;
      if (p.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.msg-act[data-a="react"]')) return;
      closeReact();
    }, true);
    return p;
  }

  function closeReact() {
    const p = $("reactPicker");
    if (p) { p.classList.remove("open"); delete p.dataset.msgId; }
  }

  function openReactPicker(btn, msgId) {
    const p = ensureReactPicker();
    p.dataset.msgId = String(msgId);
    p.classList.add("open");
    requestAnimationFrame(() => {
      if (isMobile()) { p.style.left = ""; p.style.top = ""; return; }
      const r = btn.getBoundingClientRect();
      const pw = p.offsetWidth || 260;
      const ph = p.offsetHeight || 48;
      let left = r.left + r.width / 2 - pw / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
      let top = r.top - ph - 12;
      if (top < 12) top = r.bottom + 12;
      if (top + ph > window.innerHeight - 12) top = Math.max(12, window.innerHeight - ph - 12);
      p.style.left = left + "px";
      p.style.top = top + "px";
      p.style.right = "auto";
      p.style.bottom = "auto";
      p.style.transform = "none";
    });
  }

  function closeAllActions() {
    document.querySelectorAll("#messages .row.actions-open, #messages .row.show-actions").forEach((r) => {
      r.classList.remove("actions-open", "show-actions");
    });
    openRow = null;
  }

  function wireActions(row) {
    const acts = row.querySelector(".msg-actions");
    if (!acts || acts.dataset.fixed) return;
    acts.dataset.fixed = "1";
    acts.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const msgId = row.dataset.msgId || row.getAttribute("data-id") || "";
      const bubble = row.querySelector(".bubble");
      let text = ((bubble && bubble.textContent) || "").trim();
      text = text.replace(/\u00ABreply:[^\u00BB]*\u00BB\s*/g, "").trim();
      const action = b.dataset.a;
      if (action === "copy") {
        if (window.__scAllowCopyOnce) window.__scAllowCopyOnce();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Copy failed"));
        } else toast("Copy failed");
      } else if (action === "reply") {
        if (typeof window.__scSetReply === "function") window.__scSetReply(msgId, text);
        else setReply(msgId, text);
        closeAllActions();
      } else if (action === "react") {
        openReactPicker(b, msgId);
      }
    }, true);
  }

  function ensureActions(row) {
    if (!row.querySelector(".bubble")) return;
    if (!row.dataset.msgId) {
      row.dataset.msgId = row.getAttribute("data-id") || "dom-" + Math.random().toString(36).slice(2, 9);
    }
    if (!row.querySelector(".msg-actions")) {
      const acts = document.createElement("div");
      acts.className = "msg-actions";
      acts.innerHTML =
        '<button type="button" class="msg-act" data-a="reply" title="Reply" aria-label="Reply">' +
        '<svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>' +
        '<button type="button" class="msg-act" data-a="react" title="React" aria-label="React">' +
        '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>' +
        '<button type="button" class="msg-act" data-a="copy" title="Copy" aria-label="Copy">' +
        '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      row.appendChild(acts);
    }
    wireActions(row);
  }

  function fixAlignment(row) {
    if (row.classList.contains("mine")) {
      row.style.justifyContent = "flex-end";
      row.style.flexDirection = "row";
    } else if (row.classList.contains("theirs")) {
      row.style.justifyContent = "flex-start";
      row.style.flexDirection = "row";
    }
  }

  let enhanceTimer = null;
  function enhanceAll() {
    if (enhanceTimer) return;
    enhanceTimer = requestAnimationFrame(() => {
      enhanceTimer = null;
      document.querySelectorAll("#messages .row").forEach((row) => {
        fixAlignment(row);
        ensureActions(row);
      });
    });
  }

  function wireSendReply() {
    const form = $("messageForm");
    if (!form || form.dataset.replyFixWired) return;
    form.dataset.replyFixWired = "1";
    form.addEventListener("submit", () => {
      if (!replyTarget && !window.__scReplyTarget) return;
      const input = $("messageInput");
      if (!input || !input.value.trim()) return;
      const t = replyTarget || window.__scReplyTarget;
      if (!t) return;
      if (input.value.startsWith("\u00ABreply:")) return;
      const prefix = "\u00ABreply:" + t.id + "\u00BB " + String(t.text || "").replace(/\n/g, " ").slice(0, 80);
      input.value = prefix + "\n" + input.value;
      setTimeout(clearReply, 0);
    }, true);
  }

  function wireMobileNav() {
    const layout = $("layout");
    const conv = $("conversationPanel");
    const welcome = $("welcomePanel");
    if (!layout) return;
    const sync = () => {
      const open = conv && !conv.classList.contains("hidden");
      layout.classList.toggle("in-chat", !!open);
      if (welcome) welcome.classList.toggle("hidden", !!open);
    };
    if (conv) new MutationObserver(sync).observe(conv, { attributes: true, attributeFilter: ["class"] });
    sync();
    const back = $("mobileBackBtn");
    if (back && !back.dataset.wired) {
      back.dataset.wired = "1";
      back.addEventListener("click", (e) => {
        e.preventDefault();
        if (conv) conv.classList.add("hidden");
        layout.classList.remove("in-chat");
        if (welcome) welcome.classList.remove("hidden");
        closeAllActions();
        closeReact();
        clearReply();
      });
    }
  }

  function boot() {
    ensureCss();
    ensureReplyBar();
    ensureReactPicker();
    wireSendReply();
    wireMobileNav();
    enhanceAll();
    const box = $("messages");
    if (box) new MutationObserver(() => enhanceAll()).observe(box, { childList: true });
    setTimeout(enhanceAll, 400);
    setTimeout(enhanceAll, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.__scSetReply = window.__scSetReply || setReply;
  window.__scClearReply = window.__scClearReply || clearReply;
})();

/* ===== END msg-actions-fix.js ===== */

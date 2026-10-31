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

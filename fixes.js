// Profile + call reliability patches for SimpleChat
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

  function waitFor(fn, tries = 80) {
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
      }, 100);
    });
  }

  async function patch() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;
    const btn = $("saveProfileBtn");
    if (!btn) return false;

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    async function robustSaveProfile() {
      const msg = $("profileMessage");
      if (msg) { msg.textContent = ""; msg.style.color = ""; }

      const { data: sess } = await client.auth.getSession();
      const user = sess && sess.session && sess.session.user;
      if (!user) {
        if (msg) { msg.textContent = "You are not logged in."; msg.style.color = "var(--danger)"; }
        return;
      }

      const displayName = (($("profileDisplayName") && $("profileDisplayName").value) || "").trim();
      const username = (($("profileUsername") && $("profileUsername").value) || "").trim().toLowerCase();
      if (!displayName || displayName.length > 60) {
        if (msg) { msg.textContent = "Name must be 1–60 characters."; msg.style.color = "var(--danger)"; }
        return;
      }
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        if (msg) { msg.textContent = "Username must be 3–24 characters (letters, numbers, underscore)."; msg.style.color = "var(--danger)"; }
        return;
      }

      const { data: current } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
      let avatarUrl = current && current.avatar_url ? current.avatar_url : null;

      const fileInput = $("profileAvatarInput");
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          if (msg) { msg.textContent = "Profile picture must be 5 MB or smaller."; msg.style.color = "var(--danger)"; }
          return;
        }
        const ext = ((file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")) || "jpg";
        const path = user.id + "/" + Date.now() + "." + ext;
        const { error: upErr } = await client.storage.from("avatars").upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg"
        });
        if (upErr) {
          console.error(upErr);
          if (msg) {
            msg.textContent = "Photo upload failed. Run supabase_storage.sql in Supabase. Saving name only…";
            msg.style.color = "var(--danger)";
          }
        } else {
          const { data: pub } = client.storage.from("avatars").getPublicUrl(path);
          if (pub && pub.publicUrl) avatarUrl = pub.publicUrl;
        }
      }

      if (current && username !== current.username) {
        const { error: unErr } = await client.rpc("change_username", { new_username: username });
        if (unErr) {
          const { error: directErr } = await client.from("profiles").update({ username: username }).eq("id", user.id);
          if (directErr) {
            const m = (unErr.message || directErr.message || "");
            if (msg) {
              msg.textContent = m.toLowerCase().includes("already") || m.toLowerCase().includes("taken")
                ? "That username is already taken."
                : (m || "Could not change username. Run supabase_v3.sql.");
              msg.style.color = "var(--danger)";
            }
            return;
          }
        }
      }

      const patchRow = { display_name: displayName, avatar_url: avatarUrl };
      const { data: updated, error: profileError } = await client
        .from("profiles")
        .update(patchRow)
        .eq("id", user.id)
        .select("*")
        .maybeSingle();

      if (profileError) {
        console.error(profileError);
        if (msg) {
          msg.textContent = profileError.message || "Could not save profile.";
          msg.style.color = "var(--danger)";
        }
        return;
      }

      const profile = updated || (await client.from("profiles").select("*").eq("id", user.id).maybeSingle()).data;
      if (profile) {
        if ($("myDisplay")) $("myDisplay").textContent = profile.display_name || profile.username;
        if ($("myName")) $("myName").textContent = "@" + profile.username;
        const apply = (el) => {
          if (!el) return;
          if (profile.avatar_url) el.innerHTML = '<img src="' + profile.avatar_url + '" alt="">';
        };
        apply($("myAvatar"));
        apply($("mobileMyAvatar"));
        apply($("profileAvatarPreview"));
      }

      if (msg) {
        msg.textContent = "Profile saved.";
        msg.style.color = "var(--primary)";
      }
      toast("Profile saved");
      try { if ($("profileDialog")) $("profileDialog").close(); } catch (_) {}
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      btn.disabled = true;
      Promise.resolve(robustSaveProfile()).finally(() => { btn.disabled = false; });
    }, true);

    async function robustStartCall(withVideo) {
      const { data: sess } = await client.auth.getSession();
      const user = sess && sess.session && sess.session.user;
      if (!user) { toast("Log in first.", true); return; }

      const activeItem = document.querySelector(".chat-item.active");
      const conversationId = activeItem && activeItem.getAttribute("data-id");
      if (!conversationId) { toast("Open a chat first.", true); return; }

      const peerName = ($("conversationName") && $("conversationName").textContent) || "Contact";
      let otherId = null;
      try {
        const { data: members } = await client
          .from("conversation_members")
          .select("user_id")
          .eq("conversation_id", conversationId);
        otherId = (members || []).map(function(m){ return m.user_id; }).find(function(id){ return id !== user.id; }) || null;
      } catch (e) { console.warn(e); }
      if (!otherId) { toast("Could not find the other person in this chat.", true); return; }

      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: withVideo ? { facingMode: "user" } : false
        });
      } catch (err) {
        console.error(err);
        toast(withVideo
          ? "Camera/mic permission denied. Allow access in browser settings."
          : "Microphone permission denied. Allow access in browser settings.", true);
        return;
      }

      const dialog = $("callDialog");
      const localVideo = $("localVideo");
      if (localVideo) localVideo.srcObject = localStream;
      document.body.classList.toggle("audio-call-active", !withVideo);
      if ($("callTitle")) $("callTitle").textContent = withVideo ? "Video calling…" : "Audio calling…";
      if ($("callStatus")) $("callStatus").textContent = peerName;
      if ($("remoteVideoPlaceholder")) {
        $("remoteVideoPlaceholder").textContent = "Calling…";
        $("remoteVideoPlaceholder").classList.remove("hidden");
      }
      if ($("acceptCallBtn")) $("acceptCallBtn").classList.add("hidden");
      if ($("declineCallBtn")) $("declineCallBtn").classList.add("hidden");
      if ($("muteCallBtn")) $("muteCallBtn").classList.remove("hidden");
      if ($("cameraCallBtn")) {
        if (withVideo) $("cameraCallBtn").classList.remove("hidden");
        else $("cameraCallBtn").classList.add("hidden");
      }
      if ($("endCallBtn")) $("endCallBtn").classList.remove("hidden");
      try { if (dialog) dialog.showModal(); } catch (_) {}

      const { error } = await client.from("call_signals").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: otherId,
        type: "offer",
        payload: { callMode: withVideo ? "video" : "audio", note: "caller-ui-open" }
      });
      if (error) {
        console.error("call_signals", error);
        const m = error.message || "";
        toast(
          m.indexOf("relation") >= 0 || error.code === "42P01"
            ? "Call table missing. Run supabase_video.sql in Supabase SQL Editor."
            : ("Call failed: " + (m || "signaling error")),
          true
        );
      } else {
        toast(withVideo ? "Video call started" : "Audio call started");
      }

      const endBtn = $("endCallBtn");
      if (endBtn) {
        const stopper = function() {
          localStream.getTracks().forEach(function(t){ t.stop(); });
          if (localVideo) localVideo.srcObject = null;
          document.body.classList.remove("audio-call-active");
        };
        endBtn.addEventListener("click", stopper, { once: true });
      }
    }

    function bindCall(id, withVideo) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", function() {
        setTimeout(function() {
          if ($("callDialog") && $("callDialog").open) return;
          robustStartCall(withVideo);
        }, 400);
      });
    }
    bindCall("audioCallBtn", false);
    bindCall("videoCallBtn", true);
    bindCall("detailsAudioBtn", false);
    bindCall("detailsVideoBtn", true);

    console.info("SimpleChat profile + call fixes active");
    return true;
  }

  waitFor(function() {
    return !!$("saveProfileBtn") && !!window.supabase && !!window.SUPABASE_URL;
  }).then(function(ok) {
    if (ok) patch();
  });
})();

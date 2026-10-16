// SimpleChat fixes: profile, new chat, delete-for-me
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

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """);
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
      }, 100);
    });
  }

  async function patch() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    async function sessionUser() {
      const { data } = await client.auth.getSession();
      return data && data.session && data.session.user;
    }

    // ---- Delete chat for ME only (capture phase beats app handler) ----
    document.addEventListener(
      "click",
      async (e) => {
        const del = e.target.closest && e.target.closest(".delete-chat-btn");
        if (!del) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const item = del.closest(".chat-item");
        const id = item && item.getAttribute("data-id");
        if (!id) return;

        if (!confirm("Remove this chat from your list? The other person will still see it.")) return;

        let err = null;
        let res = await client.rpc("hide_conversation", { p_conversation_id: id });
        if (res.error) {
          res = await client.rpc("delete_conversation", { p_conversation_id: id });
          err = res.error;
        }
        if (err) {
          console.error(err);
          toast("Could not remove chat. Run supabase_chat.sql in Supabase.", true);
          return;
        }
        if (item) item.remove();
        toast("Chat removed from your list.");
      },
      true
    );

    // ---- New chat search ----
    let searchTimer = null;
    async function robustSearchUsers() {
      const input = $("userSearch");
      const box = $("userResults");
      if (!input || !box) return;
      clearTimeout(searchTimer);
      const q = (input.value || "").trim().toLowerCase();
      if (q.length < 1) {
        box.innerHTML = "";
        return;
      }
      searchTimer = setTimeout(async () => {
        const user = await sessionUser();
        if (!user) {
          box.innerHTML = '<div class="empty"><span>Log in to search.</span></div>';
          return;
        }
        let results = [];
        const rpc = await client.rpc("search_users", { query: q });
        if (!rpc.error && rpc.data) results = rpc.data;
        if (!results.length) {
          const res = await client
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .or("username.ilike.%" + q + "%,display_name.ilike.%" + q + "%")
            .limit(20);
          if (res.error) {
            box.innerHTML =
              '<div class="empty"><span>Search failed. Run supabase_chat.sql.</span></div>';
            return;
          }
          results = res.data || [];
        }
        results = results.filter((u) => u.id !== user.id);
        if (!results.length) {
          box.innerHTML = '<div class="empty"><span>No users found.</span></div>';
          return;
        }
        box.innerHTML = results
          .map((u) => {
            const name = u.display_name || u.username || "User";
            return (
              '<button type="button" class="user-result" data-id="' +
              u.id +
              '"><div><strong>' +
              escapeHtml(name) +
              '</strong><div class="muted">@' +
              escapeHtml(u.username || "") +
              "</div></div></button>"
            );
          })
          .join("");
        box.querySelectorAll(".user-result").forEach((el) => {
          el.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            robustStartChat(el.getAttribute("data-id"));
          };
        });
      }, 200);
    }

    async function robustStartChat(otherId) {
      if (!otherId) return;
      const user = await sessionUser();
      if (!user) {
        toast("Log in first.", true);
        return;
      }
      try {
        if ($("newChatDialog")) $("newChatDialog").close();
      } catch (_) {}

      const { data, error } = await client.rpc("get_or_create_conversation", {
        other_user_id: otherId
      });
      if (error) {
        console.error(error);
        toast(
          (error.message || "").toLowerCase().indexOf("function") >= 0 || error.code === "PGRST202"
            ? "Could not start chat. Run supabase_chat.sql in Supabase SQL Editor."
            : "Could not start chat: " + (error.message || "error"),
          true
        );
        return;
      }
      const conversationId = data;
      toast("Chat started");
      setTimeout(() => {
        const item = document.querySelector('.chat-item[data-id="' + conversationId + '"]');
        if (item) item.click();
        else location.reload();
      }, 500);
    }

    // Capture clicks on user results from main app renderer too
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target.closest && e.target.closest(".user-result");
        if (!el) return;
        const id = el.getAttribute("data-id");
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        robustStartChat(id);
      },
      true
    );

    if ($("userSearch")) {
      $("userSearch").addEventListener("input", robustSearchUsers);
    }

    // ---- Profile save ----
    const saveBtn = $("saveProfileBtn");
    if (saveBtn) {
      saveBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          saveBtn.disabled = true;
          Promise.resolve(
            (async () => {
              const msg = $("profileMessage");
              if (msg) {
                msg.textContent = "";
                msg.style.color = "";
              }
              const user = await sessionUser();
              if (!user) return;
              const displayName = (($("profileDisplayName") && $("profileDisplayName").value) || "").trim();
              const username = (($("profileUsername") && $("profileUsername").value) || "").trim().toLowerCase();
              if (!displayName || !/^[a-z0-9_]{3,24}$/.test(username)) {
                if (msg) {
                  msg.textContent = "Check name and username.";
                  msg.style.color = "var(--danger)";
                }
                return;
              }
              const { data: current } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
              let avatarUrl = current && current.avatar_url;
              const file = $("profileAvatarInput") && $("profileAvatarInput").files && $("profileAvatarInput").files[0];
              if (file && file.size <= 5 * 1024 * 1024) {
                const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                const path = user.id + "/" + Date.now() + "." + ext;
                const up = await client.storage.from("avatars").upload(path, file, { upsert: true });
                if (!up.error) {
                  avatarUrl = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
                }
              }
              if (current && username !== current.username) {
                await client.rpc("change_username", { new_username: username });
              }
              const { error } = await client
                .from("profiles")
                .update({ display_name: displayName, avatar_url: avatarUrl })
                .eq("id", user.id);
              if (error) {
                if (msg) {
                  msg.textContent = error.message;
                  msg.style.color = "var(--danger)";
                }
                return;
              }
              if (msg) {
                msg.textContent = "Profile saved.";
                msg.style.color = "var(--primary)";
              }
              toast("Profile saved");
              if ($("myDisplay")) $("myDisplay").textContent = displayName;
              if ($("myName")) $("myName").textContent = "@" + username;
              try {
                if ($("profileDialog")) $("profileDialog").close();
              } catch (_) {}
            })()
          ).finally(() => {
            saveBtn.disabled = false;
          });
        },
        true
      );
    }

    console.info("SimpleChat fixes active");
    return true;
  }

  waitFor(() => !!window.supabase && !!window.SUPABASE_URL).then((ok) => {
    if (ok) patch();
  });
})();

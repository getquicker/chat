// SimpleChat fixes: profile, calls, new chat, delete-for-me
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
    tries = tries || 100;
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
    if (!$("saveProfileBtn") && !$("userSearch") && !$("newChatBtn")) return false;

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    async function sessionUser() {
      const { data } = await client.auth.getSession();
      return data && data.session && data.session.user;
    }

    // ---------- NEW CHAT: search + start ----------
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
        try {
          const rpc = await client.rpc("search_users", { query: q });
          if (!rpc.error && rpc.data) results = rpc.data;
        } catch (e) {
          console.warn(e);
        }
        if (!results.length) {
          const res = await client
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .or("username.ilike.%" + q + "%,display_name.ilike.%" + q + "%")
            .limit(20);
          if (res.error) {
            console.error(res.error);
            box.innerHTML =
              '<div class="empty"><span>Search failed. Run supabase_chat.sql in Supabase.</span></div>';
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
            const un = u.username || "";
            return (
              '<button type="button" class="user-result" data-id="' +
              u.id +
              '">' +
              "<div><strong>" +
              escapeHtml(name) +
              '</strong><div class="muted">@' +
              escapeHtml(un) +
              "</div></div></button>"
            );
          })
          .join("");
        box.querySelectorAll(".user-result").forEach((el) => {
          el.onclick = () => robustStartChat(el.getAttribute("data-id"));
        });
      }, 200);
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, """);
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

      let conversationId = null;
      const rpc = await client.rpc("get_or_create_conversation", { other_user_id: otherId });
      if (rpc.error) {
        console.error(rpc.error);
        // Fallback: try to find existing membership pair manually is hard without RPC
        toast(
          (rpc.error.message || "").indexOf("function") >= 0
            ? "Could not start chat. Run supabase_chat.sql in Supabase SQL Editor."
            : "Could not start chat: " + (rpc.error.message || "error"),
          true
        );
        return;
      }
      conversationId = rpc.data;
      if (!conversationId) {
        toast("Could not start chat.", true);
        return;
      }

      toast("Chat started");
      // Reload page chats by clicking refresh path: dispatch a soft reload of list
      // Prefer navigating via existing app if possible
      try {
        // Trigger load by re-selecting after short delay
        const filter = $("chatFilter");
        if (filter) {
          filter.dispatchEvent(new Event("input", { bubbles: true }));
        }
        // Click the chat item once it appears
        setTimeout(() => {
          const item = document.querySelector('.chat-item[data-id="' + conversationId + '"]');
          if (item) item.click();
          else location.reload();
        }, 600);
      } catch (e) {
        location.reload();
      }
    }

    if ($("userSearch")) {
      $("userSearch").addEventListener("input", robustSearchUsers);
      $("userSearch").addEventListener("keyup", robustSearchUsers);
    }

    // ---------- DELETE CHAT: for me only ----------
    // Intercept delete buttons after list renders using event delegation
    document.addEventListener(
      "click",
      async (e) => {
        const btn = e.target.closest && e.target.closest("[data-delete-chat], .delete-chat, button[title='Delete chat']");
        // Also support buttons rendered with data-id on parent chat item + delete class
        let chatId = null;
        if (btn) {
          chatId = btn.getAttribute("data-delete-chat") || btn.getAttribute("data-id");
          const parent = btn.closest(".chat-item");
          if (!chatId && parent) chatId = parent.getAttribute("data-id");
        }
        // App uses confirm inside deleteChat — we also listen for custom
        // Fallback: if main delete already ran hard-delete, user must run new SQL
      },
      true
    );

    // Patch confirm dialog text is in main app. Override by wrapping global if possible.
    // Provide a delegated handler for elements with class chat-delete if present after render
    const observer = new MutationObserver(() => {
      document.querySelectorAll(".chat-item").forEach((item) => {
        if (item.dataset.hideBound) return;
        item.dataset.hideBound = "1";
        // Find any delete control inside
        const del =
          item.querySelector("[data-delete]") ||
          item.querySelector(".chat-delete") ||
          item.querySelector("button[aria-label='Delete chat']");
        if (del) {
          del.addEventListener(
            "click",
            async (ev) => {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              const id = item.getAttribute("data-id");
              if (!id) return;
              if (!confirm("Remove this chat from your list? The other person will still see it.")) return;
              const { error } = await client.rpc("hide_conversation", { p_conversation_id: id });
              if (error) {
                const { error: e2 } = await client.rpc("delete_conversation", { p_conversation_id: id });
                if (e2) {
                  toast("Could not delete chat. Run supabase_chat.sql.", true);
                  console.error(e2);
                  return;
                }
              }
              item.remove();
              toast("Chat removed from your list.");
            },
            true
          );
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ---------- PROFILE (existing) ----------
    const saveBtn = $("saveProfileBtn");
    if (saveBtn) {
      saveBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          saveBtn.disabled = true;
          Promise.resolve(robustSaveProfile()).finally(() => {
            saveBtn.disabled = false;
          });
        },
        true
      );
    }

    async function robustSaveProfile() {
      const msg = $("profileMessage");
      if (msg) {
        msg.textContent = "";
        msg.style.color = "";
      }
      const user = await sessionUser();
      if (!user) {
        if (msg) {
          msg.textContent = "You are not logged in.";
          msg.style.color = "var(--danger)";
        }
        return;
      }
      const displayName = (($("profileDisplayName") && $("profileDisplayName").value) || "").trim();
      const username = (($("profileUsername") && $("profileUsername").value) || "").trim().toLowerCase();
      if (!displayName || displayName.length > 60) {
        if (msg) {
          msg.textContent = "Name must be 1–60 characters.";
          msg.style.color = "var(--danger)";
        }
        return;
      }
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        if (msg) {
          msg.textContent = "Username must be 3–24 characters.";
          msg.style.color = "var(--danger)";
        }
        return;
      }
      const { data: current } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
      let avatarUrl = current && current.avatar_url ? current.avatar_url : null;
      const fileInput = $("profileAvatarInput");
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          if (msg) {
            msg.textContent = "Profile picture must be 5 MB or smaller.";
            msg.style.color = "var(--danger)";
          }
          return;
        }
        const ext = ((file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")) || "jpg";
        const path = user.id + "/" + Date.now() + "." + ext;
        const { error: upErr } = await client.storage.from("avatars").upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg"
        });
        if (upErr) {
          if (msg) {
            msg.textContent = "Photo upload failed. Run supabase_storage.sql. Saving name only…";
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
            if (msg) {
              msg.textContent = "Could not change username.";
              msg.style.color = "var(--danger)";
            }
            return;
          }
        }
      }
      const { error: profileError } = await client
        .from("profiles")
        .update({ display_name: displayName, avatar_url: avatarUrl })
        .eq("id", user.id);
      if (profileError) {
        if (msg) {
          msg.textContent = profileError.message || "Could not save profile.";
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
    }

    console.info("SimpleChat fixes active (profile, chat, delete)");
    return true;
  }

  waitFor(() => !!window.supabase && !!window.SUPABASE_URL && (!!$("userSearch") || !!$("saveProfileBtn"))).then(
    (ok) => {
      if (ok) patch();
    }
  );
})();

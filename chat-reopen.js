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

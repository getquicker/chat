/**
 * Shared message reactions via Supabase message_reactions table.
 * message_id is bigint in this project.
 */
(() => {
  let db = null;
  let myId = null;
  let channel = null;
  let serverOk = null;

  function client() {
    if (db) return db;
    try {
      if (window.supabase?.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      }
    } catch {}
    return db;
  }

  function mid(msgId) {
    return /^\d+$/.test(String(msgId)) ? Number(msgId) : msgId;
  }

  async function ensureUser() {
    const c = client();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    myId = data?.user?.id || null;
    return myId;
  }

  function activeConvId() {
    return document.querySelector(".chat-item.active")?.getAttribute("data-id") || null;
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show";
    setTimeout(() => { t.className = "toast"; }, 2200);
  }

  async function tagRowsWithIds() {
    const convId = activeConvId();
    const c = client();
    if (!convId || !c) return;
    const { data, error } = await c
      .from("messages")
      .select("id, body, created_at, sender_id")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (error || !data) return;
    const rows = [...document.querySelectorAll("#messages .row")];
    data.forEach((m, i) => {
      if (rows[i]) {
        rows[i].dataset.msgId = String(m.id);
        rows[i].dataset.msgServer = "1";
      }
    });
  }

  function paint(msgId, emojiMap) {
    const row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
    if (!row) return;
    let box = row.querySelector(".msg-reactions");
    if (!box) {
      box = document.createElement("div");
      box.className = "msg-reactions";
      row.appendChild(box);
    }
    box.innerHTML = Object.entries(emojiMap || {})
      .filter(([, users]) => users.length)
      .map(([emoji, users]) => {
        const mine = myId && users.includes(myId) ? " mine" : "";
        return '<button type="button" class="reaction-chip' + mine + '" data-emoji="' + emoji + '" data-msg="' + msgId + '">' + emoji + (users.length > 1 ? " " + users.length : "") + "</button>";
      })
      .join("");
    box.querySelectorAll(".reaction-chip").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        toggle(btn.dataset.msg, btn.dataset.emoji);
      };
    });
  }

  async function loadReactionsForVisible() {
    const c = client();
    const ids = [...document.querySelectorAll("#messages .row[data-msg-id]")]
      .map((r) => r.dataset.msgId)
      .filter((id) => id && !String(id).startsWith("dom-"))
      .map((id) => mid(id));
    if (!c || !ids.length) return;
    const { data, error } = await c
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    if (error) {
      if (serverOk !== false) console.info("Reactions: run supabase_reactions.sql", error.message);
      serverOk = false;
      return;
    }
    serverOk = true;
    const byMsg = {};
    (data || []).forEach((r) => {
      const key = String(r.message_id);
      if (!byMsg[key]) byMsg[key] = {};
      if (!byMsg[key][r.emoji]) byMsg[key][r.emoji] = [];
      byMsg[key][r.emoji].push(r.user_id);
    });
    Object.keys(byMsg).forEach((k) => paint(k, byMsg[k]));
  }

  async function toggle(msgId, emoji) {
    if (!msgId || String(msgId).startsWith("dom-")) {
      toast("Wait a moment, then try reacting again");
      return;
    }
    await ensureUser();
    const c = client();
    if (!c || !myId) return;

    if (serverOk === false) {
      toast("Run supabase_reactions.sql in Supabase to sync reactions");
      return;
    }

    const id = mid(msgId);

    const { data: existing } = await c
      .from("message_reactions")
      .select("emoji")
      .eq("message_id", id)
      .eq("user_id", myId)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      await c.from("message_reactions").delete().eq("message_id", id).eq("user_id", myId).eq("emoji", emoji);
    } else {
      const { error } = await c.from("message_reactions").insert({ message_id: id, user_id: myId, emoji });
      if (error) {
        serverOk = false;
        console.warn(error);
        toast("Enable shared reactions: run supabase_reactions.sql");
        return;
      }
    }
    await loadReactionsForVisible();
  }

  function subscribe() {
    const c = client();
    const convId = activeConvId();
    if (!c || !convId) return;
    if (channel) {
      try { c.removeChannel(channel); } catch {}
      channel = null;
    }
    channel = c
      .channel("rx-" + convId)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        loadReactionsForVisible();
      })
      .subscribe();
  }

  window.SimpleChatReactions = { toggle, refresh: refreshAll };

  async function refreshAll() {
    await ensureUser();
    await tagRowsWithIds();
    await loadReactionsForVisible();
    subscribe();
  }

  const box = document.getElementById("messages");
  if (box) {
    let t = null;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(refreshAll, 200);
    }).observe(box, { childList: true });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".chat-item")) setTimeout(refreshAll, 400);
  });

  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.("#reactPicker [data-emoji]");
      if (!b) return;
      const p = document.getElementById("reactPicker");
      const msgId = p?.dataset?.msgId;
      if (!msgId) return;
      e.stopPropagation();
      e.preventDefault();
      toggle(msgId, b.dataset.emoji);
      p.classList.remove("open");
    },
    true
  );

  setTimeout(refreshAll, 1200);
  console.info("SimpleChat shared reactions module active");
})();

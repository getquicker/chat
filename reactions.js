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
      if (window.supabase?.createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      }
    } catch {}
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
    const rows = [...document.querySelectorAll("#messages .row")];
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
      const rows = [...document.querySelectorAll("#messages .row")];
      const idx = rows.indexOf(row);
      if (idx >= 0 && lastMsgs[idx]) return mid(lastMsgs[idx].id);
    }
    if (row) {
      const bubble = row.querySelector(".bubble");
      const text = (bubble?.textContent || "").trim();
      const hit = lastMsgs.filter((m) => (m.body || "").trim() === text);
      if (hit.length === 1) return mid(hit[0].id);
      if (hit.length > 1) {
        const rows = [...document.querySelectorAll("#messages .row")];
        const idx = rows.indexOf(row);
        if (lastMsgs[idx] && (lastMsgs[idx].body || "").trim() === text) return mid(lastMsgs[idx].id);
      }
    }
    return null;
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
        toggle(btn.dataset.msg, btn.dataset.emoji, btn.closest(".row"));
      };
    });
  }

  async function loadReactionsForVisible() {
    const c = client();
    await tagRowsWithIds();
    const ids = [...document.querySelectorAll("#messages .row[data-msg-id]")]
      .map((r) => r.dataset.msgId)
      .filter((id) => isRealId(id))
      .map((id) => mid(id));
    if (!c || !ids.length) return;
    const { data, error } = await c
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);
    if (error) {
      if (serverOk !== false) console.info("Reactions SQL needed:", error.message);
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
    document.querySelectorAll("#messages .row[data-msg-id]").forEach((row) => {
      const id = row.dataset.msgId;
      if (isRealId(id) && !byMsg[id]) {
        const box = row.querySelector(".msg-reactions");
        if (box) box.innerHTML = "";
      }
    });
    Object.keys(byMsg).forEach((k) => paint(k, byMsg[k]));
  }

  async function toggle(msgId, emoji, rowEl) {
    await ensureUser();
    const c = client();
    if (!c || !myId) {
      toast("Sign in to react");
      return;
    }
    const id = await resolveMsgId(msgId, rowEl);
    if (id == null) {
      toast("Could not find message — reopen the chat and try again");
      return;
    }
    if (serverOk === null) {
      const probe = await c.from("message_reactions").select("message_id").limit(1);
      serverOk = !probe.error;
      if (probe.error) {
        console.info(probe.error.message);
        toast("Run supabase_reactions.sql in Supabase SQL Editor");
        return;
      }
    }
    if (serverOk === false) {
      toast("Run supabase_reactions.sql in Supabase SQL Editor");
      return;
    }
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
        console.warn(error);
        serverOk = false;
        toast(error.message || "Could not save reaction");
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

  async function refreshAll() {
    await ensureUser();
    await tagRowsWithIds();
    await loadReactionsForVisible();
    subscribe();
  }

  window.SimpleChatReactions = { toggle, refresh: refreshAll, resolveMsgId };

  const box = document.getElementById("messages");
  if (box) {
    let t = null;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(refreshAll, 250);
    }).observe(box, { childList: true });
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".chat-item")) setTimeout(refreshAll, 450);
  });

  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.("#reactPicker [data-emoji]");
      if (!b) return;
      const p = document.getElementById("reactPicker");
      if (!p) return;
      const msgId = p.dataset.msgId;
      e.stopPropagation();
      e.preventDefault();
      const row = document.querySelector('.row[data-msg-id="' + msgId + '"]');
      toggle(msgId, b.dataset.emoji, row);
      p.classList.remove("open");
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest?.('.msg-act[data-a="react"]');
      if (!b) return;
      const row = b.closest(".row");
      setTimeout(async () => {
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
  console.info("SimpleChat shared reactions ready");
})();

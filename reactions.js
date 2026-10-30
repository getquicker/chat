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

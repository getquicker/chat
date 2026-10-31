(() => {
  const byUser = new Set();
  const byName = new Set();
  let lastFetch = 0;
  let applying = false;

  const TICK_FIXED =
    '<span class="sc-vtick" title="Verified" aria-label="Verified" role="img">' +
    '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
    "<defs>" +
    '<linearGradient id="scVg" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#5BB8FF"/>' +
    '<stop offset="50%" stop-color="#1D9BF0"/>' +
    '<stop offset="100%" stop-color="#0A7BC8"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<path fill="url(#scVg)" d="M12 2.05l1.55 1.15 1.9-.3.8 1.7 1.75.65-.1 1.9 1.25 1.45-1.25 1.45.1 1.9-1.75.65-.8 1.7-1.9-.3L12 21.95l-1.55-1.15-1.9.3-.8-1.7-1.75-.65.1-1.9L4.7 12l1.25-1.45-.1-1.9 1.75-.65.8-1.7 1.9.3L12 2.05z"/>' +
    '<path fill="none" stroke="#fff" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" d="M7.7 12.15l2.6 2.6 5.8-5.8"/>' +
    "</svg></span>";

  function ensureCss() {
    if (document.getElementById("sc-vtick-css")) return;
    const st = document.createElement("style");
    st.id = "sc-vtick-css";
    st.textContent =
      ".sc-vtick{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin-left:3px!important;vertical-align:-1px!important;line-height:0!important;flex-shrink:0!important;pointer-events:none!important}" +
      ".sc-vtick svg{display:block!important;width:13px!important;height:13px!important;filter:drop-shadow(0 0 2px rgba(29,155,240,0.35))}" +
      ".chat-name,#conversationName,#detailsName,#myDisplay,.peer-name,.contact-name{display:inline-flex!important;align-items:center!important;max-width:100%}";
    document.head.appendChild(st);
  }

  async function getClient() {
    if (window.__sc && window.__sc.supabase) return window.__sc.supabase;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      try { return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); } catch (e) {}
    }
    return null;
  }

  async function refresh(force) {
    if (!force && Date.now() - lastFetch < 12000 && byUser.size) return;
    lastFetch = Date.now();
    const sb = await getClient();
    if (!sb) {
      setTimeout(() => refresh(true), 2000);
      return;
    }
    try {
      let rows = [];
      const rpc = await sb.rpc("list_verified_usernames");
      if (!rpc.error && rpc.data && rpc.data.length) {
        rows = rpc.data.map((r) => (typeof r === "string" ? { username: r } : r));
      } else {
        const res = await sb.from("profiles").select("username, display_name, is_verified").eq("is_verified", true);
        if (res.error) {
          console.warn("[verified]", res.error.message);
          return;
        }
        rows = res.data || [];
      }
      byUser.clear();
      byName.clear();
      rows.forEach((p) => {
        const u = (p.username || "").toLowerCase().trim();
        const n = (p.display_name || "").toLowerCase().trim();
        if (u) byUser.add(u);
        if (n) byName.add(n);
      });
      if (byUser.size && !byName.size) {
        try {
          const { data } = await sb.from("profiles").select("username, display_name").in("username", [...byUser]);
          (data || []).forEach((p) => {
            const n = (p.display_name || "").toLowerCase().trim();
            if (n) byName.add(n);
          });
        } catch (e) {}
      }
      applyAll();
    } catch (e) {
      console.warn("[verified]", e);
    }
  }

  function cleanText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".sc-vtick, .sc-meta-tick-host, .sc-meta-tick, .sc-verified").forEach((n) => n.remove());
    return (clone.textContent || "").replace(/^@/, "").trim();
  }

  function isVerified(usernameOrName) {
    const k = String(usernameOrName || "").replace(/^@/, "").trim().toLowerCase();
    if (!k) return false;
    return byUser.has(k) || byName.has(k);
  }

  function placeTick(el) {
    if (!el) return;
    el.querySelectorAll(".sc-vtick, .sc-meta-tick-host, .sc-meta-tick, .sc-verified").forEach((n) => n.remove());
    const host = document.createElement("span");
    host.innerHTML = TICK_FIXED;
    el.appendChild(host.firstChild);
  }

  function clearTick(el) {
    if (!el) return;
    el.querySelectorAll(".sc-vtick, .sc-meta-tick-host, .sc-meta-tick, .sc-verified").forEach((n) => n.remove());
  }

  function mark(el, key) {
    if (!el) return;
    if (isVerified(key) || isVerified(cleanText(el))) placeTick(el);
    else clearTick(el);
  }

  function applyChatList() {
    const list = document.getElementById("chatList");
    if (!list) return;
    list.querySelectorAll(".chat-item").forEach((item) => {
      const nameEl = item.querySelector(".chat-name");
      if (!nameEl) return;
      const name = cleanText(nameEl);
      const un = item.getAttribute("data-username") || "";
      if (isVerified(un) || isVerified(name)) placeTick(nameEl);
      else clearTick(nameEl);
    });
  }

  function applyUserResults() {
    const box = document.getElementById("userResults");
    if (!box) return;
    box.querySelectorAll("[data-username], .user-row, button, li, .result").forEach((row) => {
      const un =
        row.getAttribute("data-username") ||
        (row.querySelector("[data-username]") && row.querySelector("[data-username]").getAttribute("data-username")) ||
        "";
      const nameEl = row.querySelector(".name, .display-name, .chat-name, strong") || null;
      if (un && isVerified(un)) {
        if (nameEl) placeTick(nameEl);
        else placeTick(row);
      } else if (nameEl && isVerified(cleanText(nameEl))) {
        placeTick(nameEl);
      }
    });
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try {
      if (!byUser.size && !byName.size) return;

      const myUser = document.getElementById("myName");
      const myDisplay = document.getElementById("myDisplay");
      if (myUser) {
        const u = cleanText(myUser);
        mark(myDisplay, u);
        mark(myUser, u);
      }

      const detailsUser = document.getElementById("detailsUsername");
      const detailsName = document.getElementById("detailsName");
      const conv = document.getElementById("conversationName");
      if (detailsUser) {
        const u = cleanText(detailsUser);
        mark(detailsName, u);
        mark(detailsUser, u);
        mark(conv, u);
      } else if (conv) {
        mark(conv, cleanText(conv));
      }

      document.querySelectorAll("[data-username]").forEach((el) => {
        mark(el, el.getAttribute("data-username"));
      });

      applyChatList();
      applyUserResults();

      document.querySelectorAll("#chatTitle, .peer-name, .contact-name, .profile-name").forEach((el) => {
        mark(el, el.dataset.username || cleanText(el));
      });
    } finally {
      applying = false;
    }
  }

  window.__scRefreshVerified = () => {
    lastFetch = 0;
    return refresh(true);
  };
  window.__scIsVerified = isVerified;

  function boot() {
    ensureCss();
    refresh(true);
    setInterval(() => refresh(false), 15000);

    const root = document.getElementById("layout") || document.body;
    let t = null;
    new MutationObserver(() => {
      if (t) cancelAnimationFrame(t);
      t = requestAnimationFrame(() => applyAll());
    }).observe(root, { childList: true, subtree: true });

    const watchList = () => {
      const list = document.getElementById("chatList");
      if (list && !list.dataset.vtickObs) {
        list.dataset.vtickObs = "1";
        new MutationObserver(() => applyChatList()).observe(list, { childList: true, subtree: true });
      }
    };
    watchList();
    setInterval(watchList, 2000);

    [400, 1000, 2000, 4000, 8000].forEach((ms) =>
      setTimeout(() => {
        refresh(true);
        applyAll();
      }, ms)
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

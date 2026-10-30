(() => {
  const verified = new Set();
  let lastFetch = 0;

  const TICK =
    '<svg class="sc-meta-tick" viewBox="0 0 22 22" width="16" height="16" aria-label="Verified">' +
    '<circle cx="11" cy="11" r="11" fill="#1D9BF0"/>' +
    '<path d="M6.2 11.2l2.8 2.8 6.2-6.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  function ensureCss() {
    if (document.getElementById("sc-meta-tick-css")) return;
    const st = document.createElement("style");
    st.id = "sc-meta-tick-css";
    st.textContent =
      ".sc-meta-tick{display:inline-block!important;width:16px!important;height:16px!important;margin-left:4px!important;vertical-align:-2px!important;flex-shrink:0!important}" +
      ".sc-meta-tick-host{display:inline-flex!important;align-items:center!important;margin-left:4px!important}";
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

  async function refresh() {
    if (Date.now() - lastFetch < 15000 && verified.size) return;
    lastFetch = Date.now();
    const sb = await getClient();
    if (!sb) return;
    try {
      let data = null;
      let error = null;
      const rpc = await sb.rpc("list_verified_usernames");
      if (!rpc.error && rpc.data) {
        data = rpc.data.map((r) => (typeof r === "string" ? { username: r } : r));
      } else {
        const res = await sb.from("profiles").select("username, is_verified").eq("is_verified", true);
        data = res.data;
        error = res.error;
      }
      if (error) {
        console.warn("[verified]", error.message);
        return;
      }
      verified.clear();
      (data || []).forEach((p) => {
        const u = p.username || p;
        if (u) verified.add(String(u).toLowerCase());
      });
      applyAll();
    } catch (e) {
      console.warn("[verified]", e);
    }
  }

  function isVerifiedUsername(u) {
    if (!u) return false;
    return verified.has(String(u).replace(/^@/, "").trim().toLowerCase());
  }

  function addTick(el) {
    if (!el || el.querySelector(".sc-meta-tick")) return;
    const span = document.createElement("span");
    span.className = "sc-meta-tick-host";
    span.innerHTML = TICK;
    el.appendChild(span);
  }

  function removeTick(el) {
    if (!el) return;
    el.querySelectorAll(".sc-meta-tick-host, .sc-meta-tick, .sc-verified").forEach((n) => n.remove());
  }

  function markIfVerified(el, username) {
    if (!el) return;
    if (isVerifiedUsername(username)) addTick(el);
    else removeTick(el);
  }

  function applyAll() {
    if (!verified.size) return;

    const myName = document.getElementById("myDisplay");
    const myUser = document.getElementById("myName");
    if (myUser) {
      const u = (myUser.textContent || "").replace(/^@/, "").trim();
      markIfVerified(myName, u);
      markIfVerified(myUser, u);
    }

    const conv = document.getElementById("conversationName");
    const detailsName = document.getElementById("detailsName");
    const detailsUser = document.getElementById("detailsUsername");
    if (detailsUser) {
      const u = (detailsUser.textContent || "").replace(/^@/, "").trim();
      markIfVerified(detailsName, u);
      markIfVerified(detailsUser, u);
      markIfVerified(conv, u);
    }

    document.querySelectorAll("[data-username]").forEach((el) => {
      markIfVerified(el, el.getAttribute("data-username"));
    });

    document.querySelectorAll(".chat-item, .conversation-item, .user-row, .search-result, #userResults li, #userResults > *").forEach((row) => {
      const un =
        row.getAttribute("data-username") ||
        (row.querySelector("[data-username]") && row.querySelector("[data-username]").getAttribute("data-username")) ||
        "";
      const nameEl =
        row.querySelector(".name, .display-name, .title, .peer-name, strong, .chat-name") || row;
      if (un) markIfVerified(nameEl, un);
      else {
        const text = row.textContent || "";
        const m = text.match(/@([a-z0-9_.]{3,24})/i);
        if (m && isVerifiedUsername(m[1])) addTick(nameEl);
      }
    });

    document.querySelectorAll("#chatTitle, .peer-name, .contact-name").forEach((el) => {
      const u = el.dataset.username || "";
      if (u) markIfVerified(el, u);
    });
  }

  window.__scRefreshVerified = () => {
    lastFetch = 0;
    return refresh();
  };
  window.__scIsVerified = isVerifiedUsername;

  function boot() {
    ensureCss();
    refresh();
    setInterval(refresh, 20000);
    const root = document.getElementById("layout") || document.body;
    new MutationObserver(() => applyAll()).observe(root, { childList: true, subtree: true, characterData: true });
    setTimeout(applyAll, 500);
    setTimeout(applyAll, 1500);
    setTimeout(applyAll, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

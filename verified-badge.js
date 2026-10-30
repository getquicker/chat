(() => {
  const cache = new Map();
  let lastFetch = 0;

  async function getClient() {
    if (window.__sc && window.__sc.supabase) return window.__sc.supabase;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      try { return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); } catch (e) {}
    }
    return null;
  }

  async function refreshVerified() {
    if (Date.now() - lastFetch < 20000) return;
    lastFetch = Date.now();
    const sb = await getClient();
    if (!sb) return;
    try {
      const { data, error } = await sb.from("profiles").select("username, is_verified").eq("is_verified", true);
      if (error) return;
      cache.clear();
      (data || []).forEach((p) => {
        if (p.username) cache.set(String(p.username).toLowerCase(), true);
      });
      applyBadges();
    } catch (e) {}
  }

  function badgeEl() {
    const s = document.createElement("span");
    s.className = "sc-verified";
    s.title = "Verified";
    s.setAttribute("aria-label", "Verified");
    s.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="11" fill="#1d9bf0"/><path d="M7 12.5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return s;
  }

  function applyBadges() {
    document.querySelectorAll("[data-username], .chat-list-item, .conversation-item, .contact-name, .peer-name, #chatTitle, .profile-name, .display-name").forEach((el) => {
      let key = (el.dataset.username || el.getAttribute("data-username") || "").toLowerCase();
      const text = (el.textContent || "").trim();
      if (!key && text.startsWith("@")) key = text.slice(1).toLowerCase();
      if (!key) {
        const parent = el.closest("[data-username]");
        if (parent) key = (parent.dataset.username || "").toLowerCase();
      }
      if (!key) return;
      if (!cache.get(key)) {
        const existing = el.querySelector(".sc-verified");
        if (existing) existing.remove();
        return;
      }
      if (el.querySelector(".sc-verified")) return;
      el.appendChild(badgeEl());
    });
  }

  if (!document.querySelector("#sc-verified-style")) {
    const st = document.createElement("style");
    st.id = "sc-verified-style";
    st.textContent =
      ".sc-verified{display:inline-flex;align-items:center;margin-left:4px;vertical-align:middle;line-height:0}" +
      ".sc-verified svg{display:block}";
    document.head.appendChild(st);
  }

  function boot() {
    refreshVerified();
    setInterval(refreshVerified, 30000);
    const box = document.getElementById("messages") || document.body;
    new MutationObserver(() => applyBadges()).observe(box, { childList: true, subtree: true });
    setTimeout(applyBadges, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.__scRefreshVerified = refreshVerified;
})();

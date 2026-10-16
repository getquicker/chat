// SimpleChat login reliability (v3)
(() => {
  const $ = (id) => document.getElementById(id);

  function setAuthMessage(message, error = true) {
    const el = $("authMessage");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = error ? "var(--danger)" : "var(--primary)";
  }

  function toast(message, isError = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = "toast"; }, 2800);
  }

  // Prevent native POST (breaks on GitHub Pages)
  function hardenForms() {
    ["loginForm", "signupForm"].forEach((id) => {
      const form = $(id);
      if (!form) return;
      form.addEventListener("submit", (e) => e.preventDefault(), true);
    });
  }
  hardenForms();
  document.addEventListener("DOMContentLoaded", hardenForms);

  function client() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  async function ensureProfile(db, user) {
    const { data: existing } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (existing) return existing;
    const meta = user.user_metadata || {};
    let username = (meta.username || ((user.email || "user").split("@")[0] + "_" + String(user.id).replace(/-/g, "").slice(0, 6)))
      .toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24) || "user";
    const row = {
      id: user.id,
      username,
      display_name: meta.display_name || meta.full_name || username,
      avatar_url: meta.avatar_url || null
    };
    const { data, error } = await db.from("profiles").upsert(row).select("*").maybeSingle();
    if (error) {
      const again = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (again.data) return again.data;
      throw error;
    }
    return data;
  }

  async function resolveEmail(db, identifier) {
    if (identifier.includes("@")) return identifier;
    try {
      const a = await db.rpc("email_for_username", { wanted_username: identifier });
      if (!a.error && a.data) return a.data;
      const b = await db.rpc("email_for_username", { p_username: identifier });
      if (!b.error && b.data) return b.data;
    } catch (e) { console.warn(e); }
    return null;
  }

  async function robustLogin(e) {
    e.preventDefault();
    setAuthMessage("");
    const db = client();
    if (!db) {
      setAuthMessage("Supabase is not configured. Check config.js.");
      return;
    }
    const identifier = ($("loginIdentifier")?.value || "").trim().toLowerCase();
    const password = $("loginPassword")?.value || "";
    if (!identifier || !password) {
      setAuthMessage("Enter your username/email and password.");
      return;
    }
    let email = identifier;
    if (!identifier.includes("@")) {
      email = await resolveEmail(db, identifier);
      if (!email) {
        setAuthMessage("Username not found. Try logging in with your email, or run the database SQL (email_for_username).");
        return;
      }
    }
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("confirm")) {
        setAuthMessage("Email not confirmed. Check inbox, or disable email confirmation in Supabase Auth settings for testing.");
      } else if (msg.includes("invalid") || msg.includes("credentials")) {
        setAuthMessage("Invalid username/email or password.");
      } else if (msg.includes("api key") || msg.includes("jwt") || error.status === 401) {
        setAuthMessage("Auth key error. In config.js set the anon/publishable key from Supabase → Project Settings → API.");
      } else {
        setAuthMessage(error.message || "Login failed.");
      }
      console.error("login", error);
      return;
    }
    try {
      await ensureProfile(db, data.user);
      toast("Logged in");
    } catch (err) {
      console.error(err);
      setAuthMessage("Logged in, but profile is missing. Run supabase.sql so profiles + policies exist.");
    }
  }

  async function robustSignup(e) {
    e.preventDefault();
    setAuthMessage("");
    const db = client();
    if (!db) {
      setAuthMessage("Supabase is not configured. Check config.js.");
      return;
    }
    const username = ($("signupUsername")?.value || "").trim().toLowerCase();
    const email = ($("signupEmail")?.value || "").trim().toLowerCase();
    const password = $("signupPassword")?.value || "";
    let displayName = ($("signupDisplayName")?.value || "").trim();
    if (!displayName || displayName === password) displayName = username;
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setAuthMessage("Username must be 3–24 characters using letters, numbers or underscore.");
      return;
    }
    if (!email || !password) {
      setAuthMessage("Email and password are required.");
      return;
    }
    try {
      const { data: available, error: checkError } = await db.rpc("username_available", { wanted_username: username });
      if (!checkError && available === false) {
        setAuthMessage("That username is already taken.");
        return;
      }
    } catch (_) {}
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { username, display_name: displayName } }
    });
    if (error) {
      setAuthMessage(error.message);
      console.error("signup", error);
      return;
    }
    if (data.session && data.user) {
      try { await ensureProfile(db, data.user); } catch (err) { console.error(err); }
      toast("Account created");
    } else {
      setAuthMessage("Account created. Confirm your email, then log in. For testing, disable email confirmation in Supabase Auth → Email.", false);
      $("loginTab")?.click();
    }
  }

  function bind() {
    const loginForm = $("loginForm");
    const signupForm = $("signupForm");
    if (!loginForm || !window.supabase || !window.SUPABASE_URL) return false;
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = e.submitter;
      if (btn) { btn.disabled = true; btn.classList.add("loading"); }
      Promise.resolve(robustLogin(e)).finally(() => {
        if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
      });
    });
    if (signupForm) {
      signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const btn = e.submitter;
        if (btn) { btn.disabled = true; btn.classList.add("loading"); }
        Promise.resolve(robustSignup(e)).finally(() => {
          if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
        });
      });
    }
    console.info("SimpleChat auth fixes active");
    return true;
  }

  let tries = 0;
  const t = setInterval(() => {
    tries += 1;
    if (bind() || tries > 50) clearInterval(t);
  }, 120);
})();

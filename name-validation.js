(() => {
  const NAME_RE = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  const USER_RE = /^[a-zA-Z0-9_.]{3,24}$/;
  const EMOJI_RE =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

  const NAME_IDS = ["signupDisplayName", "profileDisplayName"];
  const USER_IDS = ["signupUsername", "profileUsername"];

  function stripEmoji(s) {
    return String(s || "")
      .replace(EMOJI_RE, "")
      .replace(/[^\x00-\x7F]/g, (ch) => (/[A-Za-z]/.test(ch) ? ch : ""));
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = msg;
      t.className = "toast show";
      setTimeout(() => { t.className = "toast"; }, 2400);
      return;
    }
    const pm = document.getElementById("profileMessage");
    if (pm) {
      pm.textContent = msg;
      pm.style.color = "#ef4444";
      return;
    }
    alert(msg);
  }

  function validateName(v) {
    let s = String(v || "");
    if (EMOJI_RE.test(s) || /[^\x00-\x7F]/.test(s)) s = stripEmoji(s);
    s = s.trim().replace(/\s+/g, " ");
    if (!s) return { ok: false, value: s, msg: "Name is required (letters only, no emoji)" };
    if (!NAME_RE.test(s)) {
      return { ok: false, value: s, msg: "Name: English letters and spaces only — no emoji or symbols" };
    }
    if (s.length > 40) return { ok: false, value: s.slice(0, 40), msg: "Name is too long" };
    return { ok: true, value: s };
  }

  function validateUsername(v) {
    let s = stripEmoji(String(v || "")).trim();
    if (!s) return { ok: false, value: s, msg: "Username is required" };
    if (!USER_RE.test(s)) {
      return { ok: false, value: s, msg: "Username: 3–24 characters — letters, numbers, _ or . only (no emoji)" };
    }
    return { ok: true, value: s.toLowerCase() };
  }

  function bindInput(el, kind) {
    if (!el || el.dataset.strictValBound) return;
    el.dataset.strictValBound = "1";
    el.setAttribute("spellcheck", "false");

    const enforce = () => {
      const before = el.value;
      const cleaned = stripEmoji(before);
      let next = cleaned;
      if (kind === "user") next = cleaned.replace(/[^a-zA-Z0-9_.]/g, "");
      else next = cleaned.replace(/[^A-Za-z ]/g, "").replace(/\s+/g, " ");
      if (next !== before) {
        const pos = el.selectionStart;
        el.value = next;
        try {
          const d = before.length - next.length;
          el.setSelectionRange(Math.max(0, pos - d), Math.max(0, pos - d));
        } catch (e) {}
        if (EMOJI_RE.test(before) || /[^\x00-\x7F]/.test(before)) {
          toast(kind === "user" ? "Emoji not allowed in username" : "Emoji not allowed in name");
        }
      }
    };

    el.addEventListener("input", enforce);
    el.addEventListener("paste", () => setTimeout(enforce, 0));
    el.addEventListener("blur", () => {
      if (kind === "name") {
        const r = validateName(el.value);
        el.value = r.value;
        if (el.value && !r.ok) toast(r.msg);
      } else {
        const r = validateUsername(el.value);
        el.value = r.value;
        if (el.value && !r.ok) toast(r.msg);
      }
    });
  }

  function bindAll() {
    NAME_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) bindInput(el, "name");
    });
    USER_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) bindInput(el, "user");
    });
    document.querySelectorAll("input").forEach((el) => {
      const id = (el.id || "").toLowerCase();
      const name = (el.name || "").toLowerCase();
      const ph = (el.placeholder || "").toLowerCase();
      if (id.includes("displayname") || id.includes("display_name") || name === "name" || ph.includes("your name")) {
        bindInput(el, "name");
      }
      if (id.includes("username") || name === "username" || name === "new-username" || ph.includes("username")) {
        bindInput(el, "user");
      }
    });
  }

  function blockIfInvalid(e) {
    const nameEl = document.getElementById("profileDisplayName") || document.getElementById("signupDisplayName");
    const userEl = document.getElementById("profileUsername") || document.getElementById("signupUsername");
    let bad = false;
    if (nameEl && (nameEl.offsetParent !== null || nameEl.value)) {
      const r = validateName(nameEl.value);
      nameEl.value = r.value;
      if (!r.ok) { toast(r.msg); bad = true; }
    }
    if (userEl && userEl.value) {
      const r = validateUsername(userEl.value);
      userEl.value = r.value;
      if (!r.ok) { toast(r.msg); bad = true; }
    }
    if (bad) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#saveProfileBtn, button, [type='submit']");
    if (!btn) return;
    const id = btn.id || "";
    const text = (btn.textContent || "").toLowerCase();
    if (
      id === "saveProfileBtn" ||
      text.includes("save profile") ||
      text.includes("update profile") ||
      text.includes("sign up") ||
      text.includes("create account")
    ) {
      blockIfInvalid(e);
    }
  }, true);

  document.addEventListener("submit", (e) => blockIfInvalid(e), true);

  window.__scValidateName = validateName;
  window.__scValidateUsername = validateUsername;
  window.__scStripEmoji = stripEmoji;

  function boot() {
    bindAll();
    setInterval(bindAll, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

(() => {
  const NAME_RE = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  const USER_RE = /^[a-zA-Z0-9_.]{3,24}$/;
  const EMOJI_RE = /\p{Extended_Pictographic}|[\uFE0F\u200D]/gu;

  function stripEmoji(s) {
    return String(s || "").replace(EMOJI_RE, "");
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (t) {
      t.textContent = msg;
      t.className = "toast show";
      setTimeout(() => { t.className = "toast"; }, 2200);
      return;
    }
    alert(msg);
  }

  function validateName(v) {
    const s = stripEmoji(String(v || "").trim().replace(/\s+/g, " "));
    if (!s) return { ok: false, value: s, msg: "Name is required" };
    if (EMOJI_RE.test(String(v || ""))) return { ok: false, value: s, msg: "Name cannot contain emoji" };
    if (!NAME_RE.test(s)) return { ok: false, value: s, msg: "Name may only contain letters and spaces" };
    if (s.length > 40) return { ok: false, value: s, msg: "Name is too long" };
    return { ok: true, value: s };
  }

  function validateUsername(v) {
    const s = stripEmoji(String(v || "").trim());
    if (!s) return { ok: false, value: s, msg: "Username is required" };
    if (EMOJI_RE.test(String(v || ""))) return { ok: false, value: s, msg: "Username cannot contain emoji" };
    if (!USER_RE.test(s)) {
      return { ok: false, value: s, msg: "Username: 3–24 chars, letters, numbers, _ or . only" };
    }
    return { ok: true, value: s.toLowerCase() };
  }

  function isNameField(el) {
    if (!el || !el.matches) return false;
    const id = (el.id || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const ph = (el.placeholder || "").toLowerCase();
    return (
      id.includes("displayname") || id.includes("display_name") || id.includes("fullname") ||
      id === "name" || name === "display_name" || name === "name" ||
      ph.includes("display name") || ph.includes("full name")
    );
  }

  function isUserField(el) {
    if (!el || !el.matches) return false;
    const id = (el.id || "").toLowerCase();
    const name = (el.name || "").toLowerCase();
    const ph = (el.placeholder || "").toLowerCase();
    return id.includes("username") || name === "username" || ph.includes("username");
  }

  function bindField(el) {
    if (!el || el.dataset.nameValBound) return;
    el.dataset.nameValBound = "1";
    el.addEventListener("input", () => {
      const cleaned = stripEmoji(el.value);
      if (cleaned !== el.value) {
        el.value = cleaned;
        toast("Emoji are not allowed");
      }
    });
    el.addEventListener("blur", () => {
      if (isNameField(el)) {
        const r = validateName(el.value);
        if (el.value && !r.ok) toast(r.msg);
        else if (r.ok) el.value = r.value;
      }
      if (isUserField(el)) {
        const r = validateUsername(el.value);
        if (el.value && !r.ok) toast(r.msg);
        else if (r.ok) el.value = r.value;
      }
    });
  }

  function scan() {
    document.querySelectorAll("input[type='text'], input:not([type]), input[type='search']").forEach((el) => {
      if (isNameField(el) || isUserField(el)) bindField(el);
    });
  }

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!form || !form.querySelectorAll) return;
    form.querySelectorAll("input").forEach((el) => {
      if (isNameField(el)) {
        const r = validateName(el.value);
        if (!r.ok) { e.preventDefault(); e.stopPropagation(); toast(r.msg); el.focus(); }
        else el.value = r.value;
      }
      if (isUserField(el)) {
        const r = validateUsername(el.value);
        if (!r.ok) { e.preventDefault(); e.stopPropagation(); toast(r.msg); el.focus(); }
        else el.value = r.value;
      }
    });
  }, true);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button, [role='button']");
    if (!btn) return;
    const label = (btn.textContent || "").toLowerCase();
    if (!label.includes("save") && !label.includes("update") && !label.includes("sign up") && !label.includes("create")) return;
    const root = btn.closest("form, .modal, .panel, .dialog, #settingsPanel, body") || document;
    root.querySelectorAll("input").forEach((el) => {
      if (isNameField(el) && el.value) {
        const r = validateName(el.value);
        if (!r.ok) { e.preventDefault(); e.stopPropagation(); toast(r.msg); }
        else el.value = r.value;
      }
      if (isUserField(el) && el.value) {
        const r = validateUsername(el.value);
        if (!r.ok) { e.preventDefault(); e.stopPropagation(); toast(r.msg); }
        else el.value = r.value;
      }
    });
  }, true);

  window.__scValidateName = validateName;
  window.__scValidateUsername = validateUsername;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
  setInterval(scan, 1500);
})();

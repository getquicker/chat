/* SimpleChat credential URL protection + form safety */
(() => {
  const sensitiveKeys = new Set(["password", "passwd", "pwd", "pass", "new-password", "current-password"]);
  function removePasswordQueryParams() {
    try {
      const url = new URL(window.location.href);
      let removed = false;
      for (const key of Array.from(url.searchParams.keys())) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          url.searchParams.delete(key);
          removed = true;
        }
      }
      if (removed) {
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        const warning = document.getElementById("credentialUrlWarning");
        if (warning) warning.hidden = false;
      }
    } catch (_) {}
  }

  removePasswordQueryParams();
  window.addEventListener("pageshow", removePasswordQueryParams);
  window.addEventListener("popstate", removePasswordQueryParams);

  function hardenForms() {
    for (const id of ["loginForm", "signupForm"]) {
      const form = document.getElementById(id);
      if (!form) continue;
      form.method = "post";
      // Never navigate away on submit; app JS handles auth
      form.addEventListener("submit", (e) => e.preventDefault(), true);
      form.setAttribute("autocomplete", "on");
      for (const field of form.querySelectorAll('input[type="password"]')) {
        field.setAttribute("autocomplete", id === "loginForm" ? "current-password" : "new-password");
      }
    }
  }
  hardenForms();
  document.addEventListener("DOMContentLoaded", hardenForms);
})();

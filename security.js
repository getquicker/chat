/* SimpleChat credential URL protection.
   Passwords should only be submitted to Supabase Auth in the HTTPS request body. */
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
        // Remove credentials from the visible address/history entry as quickly as possible.
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        const warning = document.getElementById("credentialUrlWarning");
        if (warning) warning.hidden = false;
      }
    } catch (_) { /* Keep the page usable if history APIs are unavailable. */ }
  }

  removePasswordQueryParams();
  window.addEventListener("pageshow", removePasswordQueryParams);
  window.addEventListener("popstate", removePasswordQueryParams);

  document.addEventListener("DOMContentLoaded", () => {
    for (const id of ["loginForm", "signupForm"]) {
      const form = document.getElementById(id);
      if (!form) continue;
      // A native form fallback must never use GET, which appends fields to the URL.
      form.method = "post";
      form.action = window.location.pathname;
      form.setAttribute("autocomplete", "on");
      for (const field of form.querySelectorAll('input[type="password"]')) {
        field.setAttribute("autocomplete", id === "loginForm" ? "current-password" : "new-password");
      }
    }
  });
})();

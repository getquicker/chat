/**
 * SimpleChat Settings — theme, density, sounds, accessibility, enter-to-send
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "simplechat_settings_v1";
  const defaults = {
    theme: "system",
    density: "comfortable",
    font: "md",
    reducedMotion: "system",
    enterToSend: true,
    soundMessages: true,
    soundIncomingCall: true,
    soundOutgoingCall: true,
    soundVolume: 0.7,
    notifBrowser: false,
    ringtone: "chime"
  };

  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  }
  function save(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  let settings = load();

  function resolveTheme(mode) {
    if (mode === "light") return "light";
    if (mode === "dark") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    const resolved = resolveTheme(settings.theme);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-mode", settings.theme);
    document.documentElement.setAttribute("data-density", settings.density);
    document.documentElement.setAttribute("data-font", settings.font);
    document.documentElement.setAttribute("data-reduced-motion", settings.reducedMotion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f1115" : "#0084ff");
  }

  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }
  function tone(freq, dur, type, vol) {
    const c = ctx();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = (vol != null ? vol : settings.soundVolume) * 0.25;
    o.connect(g);
    g.connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }
  function playMessageSound() {
    if (!settings.soundMessages) return;
    tone(880, 0.08, "sine");
    setTimeout(() => tone(1175, 0.1, "sine"), 90);
  }
  let ringTimer = null;
  function startRingtone() {
    stopRingtone();
    if (!settings.soundIncomingCall) return;
    const tick = () => {
      tone(520, 0.18, "triangle");
      setTimeout(() => tone(680, 0.22, "triangle"), 200);
    };
    tick();
    ringTimer = setInterval(tick, 1400);
  }
  function stopRingtone() {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
  }

  function watchCalls() {
    const dialog = $("callDialog");
    if (!dialog) return;
    const obs = new MutationObserver(() => {
      if (!dialog.open) {
        stopRingtone();
        return;
      }
      const accept = $("acceptCallBtn");
      const isIncoming = accept && !accept.classList.contains("hidden");
      if (isIncoming) startRingtone();
      else stopRingtone();
    });
    obs.observe(dialog, { attributes: true, attributeFilter: ["open"], subtree: true, childList: true });
    ["acceptCallBtn", "declineCallBtn", "endCallBtn"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("click", stopRingtone, true);
    });
  }

  function watchMessages() {
    const box = $("messages");
    if (!box) return;
    let lastCount = box.children.length;
    new MutationObserver(() => {
      const n = box.children.length;
      if (n > lastCount) {
        const last = box.lastElementChild;
        if (last && last.classList.contains("theirs")) playMessageSound();
      }
      lastCount = n;
    }).observe(box, { childList: true });
  }

  window.SimpleChatSettings = {
    get: () => ({ ...settings }),
    enterToSend: () => !!settings.enterToSend,
    playMessageSound,
    startRingtone,
    stopRingtone
  };

  function buildSettingsDialog() {
    if ($("settingsDialog")) return;
    const d = document.createElement("dialog");
    d.id = "settingsDialog";
    d.className = "settings-dialog";
    d.innerHTML =
      '<div class="settings-shell">' +
      '<div class="settings-head"><h2>Settings</h2>' +
      '<button type="button" class="icon-btn" id="settingsCloseBtn" aria-label="Close settings">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>' +
      '<div class="settings-layout">' +
      '<nav class="settings-nav" role="tablist" aria-label="Settings sections">' +
      '<button type="button" class="settings-nav-btn active" data-panel="appearance">Appearance</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="notifications">Notifications</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="chat">Chat</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="accessibility">Accessibility</button>' +
      '<button type="button" class="settings-nav-btn" data-panel="account">Account</button></nav>' +
      '<div class="settings-panels">' +
      '<section class="settings-panel active" id="panel-appearance">' +
      '<h3>Theme</h3><p class="settings-help">Choose light, dark, or match your device.</p>' +
      '<div class="segmented" role="group" aria-label="Theme">' +
      '<button type="button" data-set="theme" data-value="light">Light</button>' +
      '<button type="button" data-set="theme" data-value="dark">Dark</button>' +
      '<button type="button" data-set="theme" data-value="system">System</button></div>' +
      '<h3>Density</h3><div class="segmented" role="group" aria-label="Density">' +
      '<button type="button" data-set="density" data-value="compact">Compact</button>' +
      '<button type="button" data-set="density" data-value="comfortable">Comfortable</button>' +
      '<button type="button" data-set="density" data-value="spacious">Spacious</button></div>' +
      '<h3>Text size</h3><div class="segmented" role="group" aria-label="Font size">' +
      '<button type="button" data-set="font" data-value="sm">S</button>' +
      '<button type="button" data-set="font" data-value="md">M</button>' +
      '<button type="button" data-set="font" data-value="lg">L</button>' +
      '<button type="button" data-set="font" data-value="xl">XL</button></div></section>' +
      '<section class="settings-panel" id="panel-notifications">' +
      '<h3>Sounds</h3>' +
      '<label class="toggle-row"><span>Message sounds</span><input type="checkbox" id="setSoundMsg"></label>' +
      '<label class="toggle-row"><span>Incoming call ring</span><input type="checkbox" id="setSoundIn"></label>' +
      '<label class="toggle-row"><span>Outgoing call tone</span><input type="checkbox" id="setSoundOut"></label>' +
      '<label class="settings-label" for="setVolume">Volume</label>' +
      '<input type="range" id="setVolume" min="0" max="1" step="0.05">' +
      '<div class="settings-actions">' +
      '<button type="button" class="call-control" id="previewMsgSound">Preview message</button>' +
      '<button type="button" class="call-control" id="previewRing">Preview ring</button></div>' +
      '<h3>Browser notifications</h3>' +
      '<p class="settings-help" id="notifStatus">Permission: unknown</p>' +
      '<button type="button" class="primary" id="requestNotifBtn">Enable browser notifications</button></section>' +
      '<section class="settings-panel" id="panel-chat">' +
      '<h3>Composer</h3>' +
      '<label class="toggle-row"><span>Enter sends message (Shift+Enter for new line)</span><input type="checkbox" id="setEnterSend"></label>' +
      '<p class="settings-help">When off, Enter inserts a new line; use the Send button to send.</p></section>' +
      '<section class="settings-panel" id="panel-accessibility">' +
      '<h3>Motion</h3><div class="segmented" role="group" aria-label="Reduced motion">' +
      '<button type="button" data-set="reducedMotion" data-value="system">System</button>' +
      '<button type="button" data-set="reducedMotion" data-value="on">Reduce</button>' +
      '<button type="button" data-set="reducedMotion" data-value="off">Full</button></div>' +
      '<p class="settings-help">Focus rings and keyboard navigation remain available.</p></section>' +
      '<section class="settings-panel" id="panel-account">' +
      '<h3>Profile</h3><p class="settings-help">Change name, username, or photo in Profile.</p>' +
      '<button type="button" class="primary" id="settingsOpenProfile">Edit profile</button>' +
      '<button type="button" class="call-control" id="settingsLogout" style="margin-top:12px">Sign out</button></section>' +
      '</div></div></div>';
    document.body.appendChild(d);

    d.querySelectorAll(".settings-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        d.querySelectorAll(".settings-nav-btn").forEach((b) => b.classList.remove("active"));
        d.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = $("panel-" + btn.dataset.panel);
        if (panel) panel.classList.add("active");
      });
    });

    function syncUI() {
      d.querySelectorAll("[data-set]").forEach((btn) => {
        btn.classList.toggle("active", settings[btn.dataset.set] === btn.dataset.value);
      });
      $("setSoundMsg").checked = settings.soundMessages;
      $("setSoundIn").checked = settings.soundIncomingCall;
      $("setSoundOut").checked = settings.soundOutgoingCall;
      $("setVolume").value = settings.soundVolume;
      $("setEnterSend").checked = settings.enterToSend;
      $("notifStatus").textContent = "Permission: " + (Notification?.permission || "unsupported");
    }

    d.querySelectorAll("[data-set]").forEach((btn) => {
      btn.addEventListener("click", () => {
        settings[btn.dataset.set] = btn.dataset.value;
        save(settings);
        applyTheme();
        syncUI();
      });
    });
    $("setSoundMsg").onchange = () => {
      settings.soundMessages = $("setSoundMsg").checked;
      save(settings);
    };
    $("setSoundIn").onchange = () => {
      settings.soundIncomingCall = $("setSoundIn").checked;
      save(settings);
    };
    $("setSoundOut").onchange = () => {
      settings.soundOutgoingCall = $("setSoundOut").checked;
      save(settings);
    };
    $("setVolume").oninput = () => {
      settings.soundVolume = Number($("setVolume").value);
      save(settings);
    };
    $("setEnterSend").onchange = () => {
      settings.enterToSend = $("setEnterSend").checked;
      save(settings);
    };
    $("previewMsgSound").onclick = () => playMessageSound();
    $("previewRing").onclick = () => {
      startRingtone();
      setTimeout(stopRingtone, 2800);
    };
    $("requestNotifBtn").onclick = async () => {
      if (!("Notification" in window)) return;
      const p = await Notification.requestPermission();
      settings.notifBrowser = p === "granted";
      save(settings);
      syncUI();
    };
    $("settingsCloseBtn").onclick = () => d.close();
    $("settingsOpenProfile").onclick = () => {
      d.close();
      $("profileBtn")?.click();
      $("mobileProfileBtn")?.click();
    };
    $("settingsLogout").onclick = () => {
      d.close();
      $("logoutBtn")?.click();
    };
    d.addEventListener("close", stopRingtone);
    syncUI();
  }

  function openSettings() {
    buildSettingsDialog();
    const d = $("settingsDialog");
    try {
      d.showModal();
    } catch {
      d.setAttribute("open", "");
    }
  }

  function injectSettingsButton() {
    const actions = document.querySelector(".sidebar-actions");
    if (!actions || $("settingsBtn")) return;
    const tbtn = document.createElement("button");
    tbtn.id = "themeQuickBtn";
    tbtn.type = "button";
    tbtn.className = "icon-btn";
    tbtn.title = "Toggle theme";
    tbtn.setAttribute("aria-label", "Toggle light and dark theme");
    tbtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    tbtn.addEventListener("click", () => {
      const cur = resolveTheme(settings.theme);
      settings.theme = cur === "dark" ? "light" : "dark";
      save(settings);
      applyTheme();
    });
    const btn = document.createElement("button");
    btn.id = "settingsBtn";
    btn.type = "button";
    btn.className = "icon-btn";
    btn.title = "Settings";
    btn.setAttribute("aria-label", "Settings");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    btn.addEventListener("click", openSettings);
    actions.insertBefore(btn, actions.firstChild);
    actions.insertBefore(tbtn, actions.firstChild);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const input = $("messageInput");
      if (!input || e.target !== input) return;
      if (e.key !== "Enter" || e.shiftKey) return;
      if (!settings.enterToSend) e.stopImmediatePropagation();
    },
    true
  );

  document.addEventListener("contextmenu", (e) => {
    const bubble = e.target.closest && e.target.closest(".bubble");
    if (!bubble) return;
    e.preventDefault();
    const text = bubble.textContent || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const t = $("toast");
        if (t) {
          t.textContent = "Message copied";
          t.className = "toast show";
          setTimeout(() => {
            t.className = "toast";
          }, 1800);
        }
      });
    }
  });

  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settings.theme === "system") applyTheme();
  });

  function boot() {
    injectSettingsButton();
    watchCalls();
    watchMessages();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  else setTimeout(boot, 800);
  setInterval(injectSettingsButton, 2000);
  console.info("SimpleChat settings module active");
})();

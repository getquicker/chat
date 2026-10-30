const CACHE_NAME = "kurakani-shell-v6";
const APP_SHELL = [
  "/chat/",
  "/chat/index.html",
  "/chat/login.html",
  "/chat/style.css",
  "/chat/extra.css",
  "/chat/security.js",
  "/chat/app.js",
  "/chat/manifest.json",
  "/chat/icons/icon-192.svg",
  "/chat/icons/icon-512.svg"
];

// Prefer network for config and app scripts so deployments are not stuck on stale keys/URL
const NETWORK_FIRST_PREFIXES = [
  "/chat/config.js",
  "/chat/fixes.js",
  "/chat/call-overlay.js",
  "/chat/ux-polish.js",
  "/chat/chat-reopen.js",
  "/chat/app.js",
  "/chat/n0.txt",
  "/chat/n1.txt",
  "/chat/n2.txt",
  "/chat/n3.txt",
  "/chat/n4.txt"
];

function isNetworkFirst(pathname) {
  if (NETWORK_FIRST_PREFIXES.some((p) => pathname === p)) return true;
  if (pathname.startsWith("/chat/") && (pathname.endsWith(".js") || pathname.endsWith(".css") || /\/n\d\.txt$/.test(pathname))) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => console.warn("Kurakani shell cache skipped:", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/chat/index.html")));
    return;
  }

  if (isNetworkFirst(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Kurakani";
  const options = {
    body: payload.body || "You have a new notification.",
    icon: "/chat/icons/icon-192.svg",
    badge: "/chat/icons/icon-192.svg",
    tag: payload.tag || "kurakani-push",
    data: { url: payload.url || "/chat/", conversationId: payload.conversationId || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/chat/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin + "/chat/")) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});

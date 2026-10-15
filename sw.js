const CACHE_NAME = "simplechat-shell-v1";
const APP_SHELL = [
  "/chat/",
  "/chat/index.html",
  "/chat/style.css",
  "/chat/app.js",
  "/chat/manifest.json",
  "/chat/icons/icon-192.svg",
  "/chat/icons/icon-512.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => console.warn("SimpleChat shell cache skipped:", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/chat/index.html")));
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

// The browser can display push payloads here once a push sender is configured.
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : "" }; }
  const title = payload.title || "SimpleChat";
  const options = {
    body: payload.body || "You have a new notification.",
    icon: "/chat/icons/icon-192.svg",
    badge: "/chat/icons/icon-192.svg",
    tag: payload.tag || "simplechat-push",
    data: { url: payload.url || "/chat/", conversationId: payload.conversationId || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/chat/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin + "/chat/")) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

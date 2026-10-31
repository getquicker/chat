const CACHE_NAME = "kurakani-shell-v11";
const APP_SHELL = [
  "/chat/",
  "/chat/index.html",
  "/chat/manifest.json",
  "/chat/icons/icon-192.svg",
  "/chat/icons/icon-512.svg"
];

function isNetworkFirst(pathname) {
  if (!pathname.startsWith("/chat/")) return false;
  if (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".html")) return true;
  if (/\/n\d\.txt$/.test(pathname)) return true;
  if (pathname.includes("config")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return r;
        })
        .catch(() => caches.match("/chat/index.html"))
    );
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

/* Service worker: Web Push + minimalny cache powłoki (network-first). */
const CACHE = "straznik-v1";
const SHELL = ["./", "index.html", "style.css", "app.js",
  "assets/vendor/maplibre-gl.js", "assets/vendor/maplibre-gl.css",
  "assets/wojewodztwa.geojson"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.url.includes("/api/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "Strażnik", body: "", level: "elevated" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: "straznik-" + data.level,
    renotify: data.level === "high",
    requireInteraction: data.level === "high",
    vibrate: data.level === "high" ? [300, 100, 300, 100, 600] : [150],
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow("./");
  }));
});

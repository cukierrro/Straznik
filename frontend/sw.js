/* Service worker: Web Push + minimalny cache powłoki (network-first). */
const CACHE = "straznik-v1";
/* Tylko adresy BEZ wersji. Strona pobiera app.js, style.css, maplibre i geojson
   z parametrem ?v=, więc wpisy bez wersji były innym adresem niż ten, o który kiedykolwiek
   prosi przeglądarka — nigdy nie zostały użyte, a instalacja workera pobierała przez nie
   drugie ~450 KB tych samych plików (27.09.2026). Resztę powłoki i tak zapisuje poniżej
   obsługa fetch, pod adresami, o które strona naprawdę pyta. */
const SHELL = ["./", "index.html"];

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
      // audyt C14: tylko udane odpowiedzi — zapisana strona błędu (404/503) była
      // potem podawana offline zamiast ostatniej działającej wersji
      if (r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
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

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
/* Jedna kopia pliku na ścieżkę. Każde wydanie zmienia `?v=`, czyli ADRES — a cache
   trzyma wpisy po adresach, więc nowa wersja dokładała się OBOK starej zamiast ją
   zastąpić. Nazwa cache jest na sztywno, więc sprzątanie w `activate` (kasujące
   cache o innej nazwie) nigdy nic nie usuwało.

   Pomiar 07.10.2026 na historii repozytorium: 165 różnych kluczy `app.js`
   (437 KB), 117 `i18n.js`, 138 `style.css`, 132 `engine.js`. Ktoś, kto odwiedza
   stronę regularnie, zbierał w ten sposób ~10–25 MB martwych kopii miesięcznie.
   Telefonu to nie zapcha (przeglądarka ma własny limit), ale rosło bez kontroli,
   a przy wyczerpaniu limitu przeglądarka wyrzuca CAŁĄ domenę naraz — razem
   z działaniem offline. */
async function odkurz(c, url) {
  const u = new URL(url);
  if (!u.search) return;                       // powłoka bez wersji zostaje
  for (const k of await c.keys()) {
    const ku = new URL(k.url);
    if (ku.origin === u.origin && ku.pathname === u.pathname && ku.search !== u.search)
      await c.delete(k);
  }
}

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    /* Jednorazowe sprzątanie tego, co już się nazbierało. Nie da się odczytać
       z cache, który wpis jest najnowszy, więc kasujemy wszystkie wersjonowane —
       strona dociągnie bieżące przy najbliższym wczytaniu, a dzieje się to
       zaraz po aktualizacji workera, czyli gdy połączenie i tak jest. Powłoka
       (`./`, `index.html`) zostaje nietknięta, więc offline nie znika. */
    const c = await caches.open(CACHE);
    for (const k of await c.keys()) if (new URL(k.url).search) await c.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.url.includes("/api/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      // audyt C14: tylko udane odpowiedzi — zapisana strona błędu (404/503) była
      // potem podawana offline zamiast ostatniej działającej wersji
      if (r.ok) {
        const copy = r.clone();
        caches.open(CACHE)
          .then(c => c.put(e.request, copy).then(() => odkurz(c, e.request.url)))
          .catch(() => {});
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

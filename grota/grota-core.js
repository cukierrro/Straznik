/* GROTA — rdzeń bez interfejsu (odległości, ranking, linki nawigacji, zasady poradnika).
   Ten plik ma zostać taki sam po wpięciu do Strażnika. */
(function (global) {
  "use strict";

  const DETOUR = 1.3; // droga jest dłuższa niż linia prosta — szacunek, nie trasa

  const MODES = {
    walking:    { label: "Pieszo",            kmh: 5,    gmaps: "walking" },
    bicycling:  { label: "Rower / hulajnoga", kmh: 15,   gmaps: "bicycling" },
    driving:    { label: "Samochód / motocykl", kmh: 30, kmhTrasa: 70, gmaps: "driving", rule: "P-AUTO" },
  };

  /* Znaczenie kategorii według komunikatów PSP i samorządów o aplikacji „Gdzie się ukryć”:
     godziny wynikają z pracy obiektu lub obecności obsługi; „na żądanie” to obiekty zamknięte
     (np. piwnice bloków, garaże wspólnot), które zarządcy i wspólnoty powinni otworzyć w razie zagrożenia
     w ramach wzajemnej pomocy. Publiczne dane NIE podają godzin ani kontaktu do zarządcy. */
  const ACCESS = {
    "24h":        { label: "Całodobowo", note: "Według PSP obiekt jest dostępny całą dobę." },
    "godziny":    { label: "W określonych godzinach", note: "Dostępny tylko w godzinach pracy obiektu lub obecności obsługi. Godzin nie ma w publicznych danych — sprawdź je wcześniej u zarządcy." },
    "na_zadanie": { label: "Na żądanie", note: "Obiekt zamknięty (np. piwnica bloku, garaż). Zarządca lub mieszkańcy powinni go otworzyć w razie zagrożenia — nie zakładaj, że będzie otwarty. Zapytaj zarządcę wcześniej." },
    "nieznany":   { label: "Brak informacji", note: "" },
  };

  // Zasady: dosłowne cytaty z „Poradnika bezpieczeństwa” (poradnik.js).
  const RULES = global.GrotaPoradnik.RULES;

  function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /* Szacunek czasu. Dla pojazdów pierwsze 10 km liczymy prędkością miejską, dalsze trasową —
     przy 165 km stałe 30 km/h dawało 6,5 godziny zamiast ok. 2,5, a przy dalekim celu to właśnie
     ta liczba decyduje, czy człowiek uzna miejsce za osiągalne. */
  const KM_MIEJSKIE = 10;
  function estimateMin(distM, mode) {
    const m = MODES[mode] || MODES.walking;
    if (!m.kmh) return null;
    const km = (distM * DETOUR) / 1000;
    const min = !m.kmhTrasa || km <= KM_MIEJSKIE
      ? (km / m.kmh) * 60
      : (KM_MIEJSKIE / m.kmh + (km - KM_MIEJSKIE) / m.kmhTrasa) * 60;
    return Math.max(1, Math.round(min));
  }

  // Wynik automatycznych kontroli danych (budynek, adres, gmina, województwo) — nie ocena urzędu.
  const HARD_FLAGS = ["daleko_od_budynku", "inne_woj", "inna_gmina", "adres_daleko"];

  function isDoubtful(p) {
    return p.flagi.some((f) => HARD_FLAGS.includes(f));
  }

  function flagMessages(p) {
    const km = (m) => (m / 1000).toFixed(1).replace(".", ",");
    const msg = [];
    for (const f of p.flagi) {
      if (f === "daleko_od_budynku") {
        // „najbliżej blok mieszkalny, 24 m" mówi człowiekowi w terenie więcej niż sama odległość
        const co = p.obok ? p.obok.etykieta.toLowerCase() : "budynek";
        const ile = Math.round(p.obok_m ?? p.budynek_m ?? 0);
        msg.push(p.budynek_m == null ? "nie ma żadnego budynku w promieniu 150 m — współrzędne są prawdopodobnie błędne"
          : ile <= 60 ? `szpilka stoi obok budynku, nie na nim — najbliżej ${co}, ${ile} m stąd`
          : `szpilka nie stoi przy żadnym budynku — najbliższy (${co}) jest ${ile} m stąd`);
      }
      else if (f === "inne_woj") msg.push("punkt leży w innym województwie niż podane w danych");
      else if (f === "inna_gmina") msg.push(`dane podają gminę ${p.gmina}, a punkt leży w: ${p.gmina_z_polozenia || "innej gminie"}`);
      else if (f === "adres_daleko") msg.push(`adres z danych jest ${km(p.adres_m)} km od punktu`);
      else if (f === "adres_rozbiezny") msg.push(`adres z danych jest ${Math.round(p.adres_m)} m od punktu — sprawdź na miejscu`);
      else if (f === "daleko_od_miejscowosci") msg.push(`miejscowość o tej nazwie jest ${km(p.miejscowosc_km * 1000)} km dalej (nazwy bywają powtarzalne)`);
      else if (f === "gmina_nieznana") msg.push("dane PSP nie podają gminy");
    }
    return msg;
  }

  /* Siatka 0,1° × 0,1° (ok. 11 × 7 km). Przy 86 tys. punktów sortowanie całej Polski przy każdym
     dotknięciu trwałoby na słabym telefonie dziesiątki ms; siatka ogląda tylko najbliższe komórki. */
  const CELL = 0.1, CELL_MIN_M = CELL * 111320 * Math.cos(56 * Math.PI / 180);   // najwęższa komórka w Polsce
  const MAX_RING = 60;                                                              // ok. 400 km
  const grids = new WeakMap();
  const cellKey = (i, j) => i * 100000 + j;

  function gridFor(points) {
    let g = grids.get(points);
    if (!g) {
      g = new Map();
      for (const p of points) {
        const k = cellKey(Math.floor(p.lat / CELL), Math.floor(p.lon / CELL));
        const cell = g.get(k); if (cell) cell.push(p); else g.set(k, [p]);
      }
      grids.set(points, g);
    }
    return g;
  }

  function nearest(points, lat, lon, opts = {}) {
    const limit = opts.limit || 5, mode = opts.mode || "walking";
    const g = gridFor(points), ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
    let found = null;
    const acc = [];
    for (let r = 0; r <= MAX_RING && !found; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;   // tylko nowy pierścień
          const cell = g.get(cellKey(i, j)); if (!cell) continue;
          for (const p of cell) acc.push({ p, distM: distanceM(lat, lon, p.lat, p.lon) });
        }
      }
      // wszystko poza przejrzanymi pierścieniami leży dalej niż r × najwęższa komórka
      if (acc.length >= limit) {
        acc.sort((a, b) => a.distM - b.distM);
        if (acc[limit - 1].distM <= r * CELL_MIN_M) found = acc;
      }
    }
    if (!found) found = points.map((p) => ({ p, distM: distanceM(lat, lon, p.lat, p.lon) }));   // daleko poza Polską
    return found.sort((a, b) => a.distM - b.distM).slice(0, limit)
      .map((c) => ({ ...c, estMin: estimateMin(c.distM, mode) }));
  }

  /* Najlepsza opcja na żywo.
     - wątpliwe punkty nie są polecane jako pierwsze (ale zostają na liście z ostrzeżeniem),
     - wśród opcji o podobnym szacunku (do +2 min od najszybszej) wyżej idzie dostęp całodobowy,
     - progu „nie zdążysz” nie ustalamy sami: porównujemy tylko z ostrzeżeniem Strażnika (etaMin), jeśli jest. */
  function liveBest(points, lat, lon, opts = {}) {
    const mode = opts.mode || "walking";
    const cand = nearest(points, lat, lon, { limit: 25, mode });
    const ok = cand.filter((c) => !isDoubtful(c.p));
    const doubtful = cand.filter((c) => isDoubtful(c.p));
    if (!ok.length) return { options: doubtful.slice(0, 3), tooFar: null, doubtfulOnly: true };
    const fastest = ok[0].estMin ?? 0;
    const similar = ok.filter((c) => c.estMin == null || c.estMin <= fastest + 2);
    const rest = ok.filter((c) => !similar.includes(c));
    const rank = { "24h": 0, "godziny": 1, "na_zadanie": 2, "nieznany": 3 };
    similar.sort((a, b) => (rank[a.p.dostep] - rank[b.p.dostep]) || (a.distM - b.distM));
    const options = similar.concat(rest).slice(0, 3);
    const eta = opts.etaMin;
    const tooFar = eta == null || options[0].estMin == null ? null : options[0].estMin > eta;
    // bliżej niż pierwsza propozycja mogą być punkty o wątpliwym położeniu — mówimy o tym wprost
    const closerDoubtful = doubtful.filter((c) => c.distM < options[0].distM);
    return { options, tooFar, doubtfulOnly: false, closerDoubtful };
  }

  /* Wstępna trasa: publiczny serwer OSRM fundacji FOSSGIS (dane OpenStreetMap). Warunki: najwyżej
     1 zapytanie na sekundę, bez intensywnego użycia, z atrybucją. Serwer zapisuje zapytania w logach —
     w wersji produkcyjnej potrzebny własny serwer tras. */
  const ROUTE_PROFILE = { walking: "foot", bicycling: "bike", driving: "car" };
  let lastRouteAt = 0;

  async function fetchRoute(from, to, mode) {
    const profile = ROUTE_PROFILE[mode];
    if (!profile) return null;
    const wait = 1100 - (Date.now() - lastRouteAt);
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    lastRouteAt = Date.now();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}?overview=full&geometries=geojson`;
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const route = d.routes?.[0];
      if (d.code !== "Ok" || !route) return null;
      return { coords: route.geometry.coordinates, distM: route.distance, durMin: Math.max(1, Math.round(route.duration / 60)) };
    } finally {
      clearTimeout(timer);
    }
  }

  function lineLengthM(coords) {
    let d = 0;
    for (let i = 1; i < coords.length; i++) d += distanceM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    return d;
  }

  // Douglas–Peucker z tolerancją w metrach (lokalnie płaski układ) — nagrana trasa ma setki punktów, zapisujemy kształt.
  function simplifyLine(coords, tolM = 3) {
    if (coords.length < 3) return coords;
    const kx = 111320 * Math.cos(coords[0][1] * Math.PI / 180), ky = 110540;
    const P = coords.map(([x, y]) => [x * kx, y * ky]);
    const keep = new Uint8Array(coords.length);
    keep[0] = keep[coords.length - 1] = 1;
    const stack = [[0, coords.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const t = L ? Math.max(0, Math.min(1, ((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / L)) : 0;
        const d = Math.hypot(ax + t * dx - P[i][0], ay + t * dy - P[i][1]);
        if (d > md) { md = d; mi = i; }
      }
      if (md > tolM) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return coords.filter((_, i) => keep[i]);
  }

  function directionsUrl(dest, mode, origin) {
    const q = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lon}`, travelmode: (MODES[mode] || MODES.walking).gmaps });
    if (origin) q.set("origin", `${origin.lat},${origin.lon}`);
    else q.set("dir_action", "navigate");
    return `https://www.google.com/maps/dir/?${q}`;
  }

  /* Ortofotomapa GUGiK (WMS). Warunki usługi: bez opłat i bez ograniczeń, z wyłączeniem automatycznego
     pobierania i kolekcjonowania obrazów — dlatego obraz jest pobierany na żywo, gdy użytkownik go ogląda,
     i nigdy nie jest zapisywany ani pobierany hurtem. */
  /* Dwa adresy tej samej ortofotomapy (22.09.2026, zmierzone curl-em):
     - StandardResolution odpowiada szybko (0,2–1 s), ale za równoważeniem ruchu część serwerów zwraca 404
       — ok. 2/3 zapytań bez ciasteczka. Każda próba trafia losowo, więc kilka szybkich prób zwykle wystarcza;
     - HighResolution daje ten sam obraz za każdym razem, ale po 5–20 s (bywa i ponad 30).
     Stąd kolejność: kilka prób StandardResolution, na końcu jedna HighResolution (grota.js, zdjecieZGory). */
  const ORTO_WMS = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution";
  const ORTO_WMS_WOLNY = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution";

  function mercator(lat, lon) {
    const R = 6378137, x = R * lon * Math.PI / 180;
    const y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    return [x, y];
  }

  // proba: numer próby (dopisywany do adresu, żeby przeglądarka nie podała zapamiętanego 404); wolny: HighResolution
  function orthoUrl(p, { width = 480, height = 300, halfWidthM = 70, proba = 0, wolny = false } = {}) {
    const [x, y] = mercator(p.lat, p.lon);
    const k = 1 / Math.cos(p.lat * Math.PI / 180);          // metry terenowe → metry Merkatora
    const hx = halfWidthM * k, hy = hx * height / width;
    const q = new URLSearchParams({ SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0", LAYERS: "Raster", STYLES: "",
      CRS: "EPSG:3857", BBOX: [x - hx, y - hy, x + hx, y + hy].map((v) => v.toFixed(1)).join(","),
      WIDTH: String(width), HEIGHT: String(height), FORMAT: "image/jpeg" });
    if (proba) q.set("_p", String(proba));
    return `${wolny ? ORTO_WMS_WOLNY : ORTO_WMS}?${q}`;
  }

  /* Warstwy kafelków z tej usługi na mapie NIE używamy: serwer GUGiK odrzuca (404) żądania kafelków
     wysyłane przez bibliotekę mapy z przeglądarki, a hurtowe pobieranie kafelków jest wprost wyłączone
     z warunków usługi. Pojedyncza miniatura <img> działa i odpowiada zwykłemu oglądaniu. */

  function bearing(from, to) {
    const rad = Math.PI / 180;
    const y = Math.sin((to.lon - from.lon) * rad) * Math.cos(to.lat * rad);
    const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lon - from.lon) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  // Punkt na trasie oddalony o zadaną liczbę metrów od jej końca — czyli miejsce na ulicy tuż przed celem.
  function pointBeforeEnd(coords, meters = 20) {
    if (!coords || coords.length < 2) return null;
    let acc = 0;
    for (let i = coords.length - 1; i > 0; i--) {
      const a = { lat: coords[i][1], lon: coords[i][0] }, b = { lat: coords[i - 1][1], lon: coords[i - 1][0] };
      acc += distanceM(a.lat, a.lon, b.lat, b.lon);
      if (acc >= meters) return b;
    }
    return { lat: coords[0][1], lon: coords[0][0] };
  }

  /* Street View. Google podstawia NAJBLIŻSZĄ panoramę, a w budynkach z firmami bywa nią zdjęcie wnętrza
     (np. gabinet w szkole). Gdy znamy trasę, otwieramy panoramę z ulicy kilkanaście metrów przed celem
     i ustawiamy kierunek patrzenia na obiekt — wtedy Google wybiera zdjęcie z ulicy. */
  function streetViewUrl(p, opts = {}) {
    const from = opts.from;
    const q = new URLSearchParams({ api: "1", map_action: "pano" });
    if (from) {
      q.set("viewpoint", `${from.lat.toFixed(6)},${from.lon.toFixed(6)}`);
      q.set("heading", String(Math.round(bearing(from, p))));
      q.set("pitch", "0");
      q.set("fov", "80");
    } else {
      q.set("viewpoint", `${p.lat},${p.lon}`);
    }
    return `https://www.google.com/maps/@?${q}`;
  }

  function trustLabel(p) {
    const msg = flagMessages(p);
    if (isDoubtful(p)) return { level: "watpliwe", text: "Położenie wątpliwe: " + msg.join("; ") + "." };
    if (msg.length) return { level: "uwaga", text: "Do sprawdzenia: " + msg.join("; ") + "." };
    const where = p.budynek_m === 0 ? "stoi na budynku" : `${Math.round(p.budynek_m)} m od budynku`;
    const adr = p.adres_m != null && p.adres_m <= 150 ? ", zgadza się z adresem" : "";
    return { level: "ok", text: `Położenie sprawdzone automatycznie: punkt ${where}${adr}.` };
  }

  /* ---------- „Gdzie jestem”, gdy GPS nie działa ---------- */

  const fold = (t) => String(t || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
  const KIND_ACC = { m: 3000, w: 1000, o: 500, d: 1000 };      // niepewność „środka miejscowości”
  const KIND_RANK = { m: 0, w: 1, d: 2, o: 3 };

  // Spis miejscowości z OpenStreetMap (tools/miejscowosci.py) → obiekty + indeks po nazwie bez polskich znaków.
  function localityIndex(pack) {
    const list = pack.m.map(([name, g, lat, lon, kind]) => ({
      name, gmina: pack.gminy[g], lat: lat / 1e4, lon: lon / 1e4, kind, kindLabel: pack.rodzaje[kind], key: fold(name) }));
    const byKey = new Map();
    for (const m of list) { const a = byKey.get(m.key); if (a) a.push(m); else byKey.set(m.key, [m]); }
    return { list, byKey };
  }

  function findLocalities(idx, q, ref, limit = 8) {
    const f = fold(q);
    if (!idx || f.length < 2) return [];
    const exact = idx.byKey.get(f) || [];
    const prefix = exact.length >= limit ? [] : idx.list.filter((m) => m.key !== f && m.key.startsWith(f));
    const d = (m) => (ref ? distanceM(ref.lat, ref.lon, m.lat, m.lon) : 0);
    const by = (a, b) => (ref ? d(a) - d(b) : KIND_RANK[a.kind] - KIND_RANK[b.kind]);
    return [...exact.sort(by), ...prefix.sort(by)].slice(0, limit).map((m) => ({
      label: m.name, detail: `${m.kindLabel}, gm. ${m.gmina}`, lat: m.lat, lon: m.lon, acc: KIND_ACC[m.kind] || 1000, kind: m.kind, source: "spis" }));
  }

  /* Warianty zapytania dla wyszukiwarki GUGiK. Oczekuje „Miejscowość, ulica numer” i polskich znaków
     w nazwie miejscowości, a ludzie piszą „marszałkowska 100 warszawa” albo „Krasnik, Lubelska 1”.
     Zwraca [{ query, city }] — city przydaje się bez internetu (środek miejscowości ze spisu). */
  function queryVariants(q, idx) {
    const raw = q.trim().replace(/\s+/g, " ");
    const out = [{ query: raw, city: raw.split(",")[0].trim() }];
    const proper = (name) => {
      const hit = idx?.byKey.get(fold(name));
      return hit ? [...hit].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])[0].name : null;
    };
    const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const pa = proper(parts[0]), pb = proper(parts[parts.length - 1]);
      if (pa) out.push({ query: [pa, ...parts.slice(1)].join(", "), city: pa });
      if (pb) out.push({ query: [pb, ...parts.slice(0, -1)].join(", "), city: pb });   // „ulica numer, Miejscowość”
    } else {
      const t = raw.split(" ");
      for (let n = Math.min(3, t.length); n >= 1; n--) {        // najdłuższa nazwa na końcu albo na początku
        const end = proper(t.slice(-n).join(" ")), start = proper(t.slice(0, n).join(" "));
        const city = end || start;
        if (!city) continue;
        const rest = (end ? t.slice(0, -n) : t.slice(n)).join(" ");
        out.push({ query: rest ? `${city}, ${rest}` : city, city });
        break;
      }
    }
    const seen = new Set();
    return out.filter((v) => !seen.has(v.query) && seen.add(v.query));
  }

  // Usługa geokodowania GUGiK (bezpłatna, zezwala na zapytania z przeglądarki). srid=4326 → stopnie WGS84.
  const UUG = "https://services.gugik.gov.pl/uug/";
  const UUG_ACC = { address: 25, street: 300, city: 1500 };

  function uugItems(d, ref) {
    const res = Object.values(d.results || {}).filter((x) => x.x && x.y);
    const items = res.map((x) => {
      const label = d.type === "address" ? `${x.street ? `${x.street} ${x.number}` : `nr ${x.number}`}, ${x.city}`
        : d.type === "street" ? `${x.street}, ${x.city}` : x.city;
      const detail = d.type === "city" ? [x.commune && `gm. ${x.commune}`, x.county && `pow. ${x.county}`, x.voivodeship].filter(Boolean).join(", ")
        : d.type === "street" ? "cała ulica — pozycja przybliżona" : (x.code || "");
      return { label, detail, lat: Number(x.y), lon: Number(x.x), acc: UUG_ACC[d.type] || 1000, source: "gugik" };
    });
    // adresy i ulice GUGiK zwraca od najlepiej dopasowanego; miejscowości o tej samej nazwie — od najbliższej
    if (ref && d.type === "city") items.sort((a, b) => distanceM(ref.lat, ref.lon, a.lat, a.lon) - distanceM(ref.lat, ref.lon, b.lat, b.lon));
    return items.slice(0, 8);
  }

  /* Wynik: { items, offline, notFound }. Bez internetu (albo gdy GUGiK nie znajdzie adresu)
     zwraca środki miejscowości ze spisu — mniej dokładne, ale zawsze coś. */
  /* Gdy dokładnego adresu nie ma w bazie (GUGiK zwraca tylko istniejące numery): najpierw bez numeru
     mieszkania („20/3”, „m. 3”), potem bez litery („10a” → „10”), na końcu sama ulica. */
  function simplerQueries(query) {
    const i = query.indexOf(",");
    if (i < 0) return [];
    const city = query.slice(0, i).trim(), street = query.slice(i + 1).trim();
    const out = [];
    const noFlat = street.replace(/\s*(\/\s*\d+\w*|\b(m|lok|lokal|mieszk)\.?\s*\d+\w*)$/i, "").trim();
    if (noFlat !== street) out.push({ query: `${city}, ${noFlat}`, approx: null });
    const noLetter = noFlat.replace(/(\d+)\s*[a-zA-Z]$/, "$1");
    if (noLetter !== noFlat) out.push({ query: `${city}, ${noLetter}`, approx: "numer" });
    const streetOnly = noLetter.replace(/\s+\d+\w*$/, "").trim();
    if (streetOnly && streetOnly !== noLetter) out.push({ query: `${city}, ${streetOnly}`, approx: "ulica" });
    return out;
  }

  async function geocode(q, idx, ref) {
    // kod pocztowy i numer mieszkania tylko przeszkadzają („20/3”, „38 m. 12” — baza zna budynki, nie lokale)
    const clean = q.replace(/\b\d{2}-\d{3}\b/g, " ").replace(/(\d+\s*[a-zA-Z]?)\s*(\/\s*\d+\w*|\s+(m|lok|lokal|mieszk)\.?\s*\d+\w*)/gi, "$1");
    const variants = queryVariants(clean, idx);
    const tries = variants.slice(0, 3);
    const structured = variants.filter((v) => v.query.includes(",")).pop();
    if (structured) simplerQueries(structured.query).forEach((s) => tries.push({ ...s, city: structured.city }));
    let offline = false;
    for (const v of tries.slice(0, 7)) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
      try {
        const r = await fetch(`${UUG}?${new URLSearchParams({ request: "GetAddress", address: v.query, srid: "4326" })}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        let d;
        try { d = JSON.parse(await r.text()); }
        catch { continue; }            // zapora serwera czasem odrzuca nietypowe zapytanie stroną HTML — próbujemy następny wariant
        let items = uugItems(d, ref);
        if (v.approx === "numer" && d.type === "address")
          items = items.map((it) => ({ ...it, acc: 80, detail: `${it.detail} · tego numeru nie ma w bazie adresów — sprawdź położenie na mapie`.replace(/^ · /, "") }));
        // GUGiK nie zna dzielnic jako miejscowości („Mokotów” to dla niego wieś w gminie Klwów) — dokładamy je ze spisu
        if (d.type === "city") findLocalities(idx, v.city, ref).filter((x) => x.kind === "d").forEach((x) => items.unshift(x));
        if (items.length) return { items: items.slice(0, 8), offline: false, notFound: false, approx: d.type !== "address" || !!v.approx };
      } catch (e) {
        offline = true;                                          // brak sieci — nie ma sensu pytać o kolejne warianty
        break;
      } finally {
        clearTimeout(timer);
      }
    }
    const cities = [...new Set(variants.map((v) => v.city))];
    const items = [];
    for (const c of cities) for (const it of findLocalities(idx, c, ref)) if (!items.some((x) => x.lat === it.lat && x.lon === it.lon)) items.push(it);
    return { items: items.slice(0, 8), offline, notFound: !offline, approx: true };
  }

  global.GrotaCore = { MODES, ACCESS, RULES, distanceM, estimateMin, nearest, liveBest, directionsUrl, streetViewUrl, pointBeforeEnd, bearing, orthoUrl, trustLabel, isDoubtful, flagMessages,
    fold, localityIndex, findLocalities, queryVariants, geocode, fetchRoute, ROUTE_PROFILE, lineLengthM, simplifyLine };
})(window);

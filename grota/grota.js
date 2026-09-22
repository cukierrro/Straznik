/* GROTA — prototyp interfejsu. Dane i ranking: grota-core.js. */
(function () {
  "use strict";
  const C = window.GrotaCore;
  const P = window.GrotaPoradnik;
  /* W Strażniku Grota jest modułem (grota/widok.js): pliki leżą w katalogu grota/, a historię przeglądarki
     i przycisk „wstecz” obsługuje Strażnik. Samodzielnie (podgląd, testowe APK) obie wartości są puste. */
  const BAZA = window.GROTA_BAZA || "";
  const MODUL = !!window.GROTA_MODUL;
  const I = window.GrotaIcons.icon;
  const PLACES_KEY = "grota_miejsca", MODE_KEY = "grota_srodek", PREP_KEY = "grota_przygotuj", THEME_KEY = "grota_mapa", INFO_KEY = "grota_info_schrony", CEL_KEY = "grota_cel", FILTER_KEY = "grota_filtr2", LIVE_FILTER_KEY = "grota_filtr_teraz2", PICK_FILTER_KEY = "grota_filtr_miejsca2";

  // Wygląd rodzajów miejsc (etykiety są w poradnik.js). Kolory rozróżnialne także przy daltonizmie czerwono-zielonym.
  const KIND_LOOK = {
    dom: { icon: "house", color: "#2563eb" },
    praca: { icon: "briefcase-business", color: "#b45309" },
    szkola: { icon: "school", color: "#7c3aed" },
    przedszkole: { icon: "baby", color: "#db2777" },
    bliscy: { icon: "house-heart", color: "#0f766e" },
    dzialka: { icon: "trees", color: "#4d7c0f" },
    inne: { icon: "map-pin", color: "#475569" },
  };
  const kindLook = (k) => KIND_LOOK[k] || KIND_LOOK.inne;
  const kindBadge = (k, cls = "") => `<span class="kind-ic ${cls}" style="background:${kindLook(k).color}">${I(kindLook(k).icon)}</span>`;

  // Podkład OpenFreeMap: jasny czytelniejszy w dzień i na słabszym ekranie, ciemny zostaje do wyboru.
  const MAP_STYLES = { jasna: "https://tiles.openfreemap.org/styles/liberty", ciemna: "https://tiles.openfreemap.org/styles/dark" };

  /* Bez internetu podkład OpenFreeMap się nie wczyta (Poradnik s. 16: sieć i GPS mogą nie działać).
     Wtedy prosty podkład z plików w aplikacji — granice województw i sąsiednich krajów. Punkty, zapisane
     miejsca, nagrane trasy, lista i zasady działają dalej; nie działają: wyszukiwarka adresów GUGiK
     (zostaje spis miejscowości), wstępna trasa i zdjęcia z góry. */
  const OFFLINE_STYLE = {
    version: 8, name: "grota-offline",
    sources: {
      kraje: { type: "geojson", data: BAZA + "data/granice/kraje-v2.geojson", attribution: "Natural Earth" },
      woj: { type: "geojson", data: BAZA + "data/granice/wojewodztwa.geojson", attribution: "© OpenStreetMap" },
    },
    layers: [
      { id: "tlo", type: "background", paint: { "background-color": "#d9e3ea" } },
      { id: "kraje", type: "fill", source: "kraje", paint: { "fill-color": "#ece9e2", "fill-outline-color": "#a3adb8" } },
      { id: "woj-fill", type: "fill", source: "woj", paint: { "fill-color": "#f6f4ee" } },
      { id: "woj-line", type: "line", source: "woj", paint: { "line-color": "#8a95a1", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.6] } },
    ],
  };
  const panel = document.getElementById("g-panel");
  const root = document.getElementById("grota");

  /* Środki transportu, których już nie ma: „Komunikacja” (Grota nie zna rozkładów) i osobny
     „Skuter / motocykl” (ta sama trasa i ten sam czas co samochód). Telefony, które mają je
     zapisane, przechodzą tam, gdzie to ma sens — jednoślad na samochód, reszta na pieszo. */
  const STARE_TRYBY = { twowheeler: "driving", transit: "walking" };
  const trybOK = (m) => (C.MODES[m] ? m : STARE_TRYBY[m] || "walking");

  const S = {
    points: [], byId: new Map(), meta: null,
    tab: "mapa", selectedId: null,
    mode: trybOK(readLS(MODE_KEY, "walking")),
    places: readLS(PLACES_KEY, []).map((pl) => ({ kind: "dom", spot: "", spotChecked: false, ...pl, mode: trybOK(pl.mode) })),
    prep: readLS(PREP_KEY, {}),          // { "dom:0": true, ... } — postęp list kontrolnych
    openList: null,
    pick: null,            // { purpose: "place", name } | { purpose: "live" }
    userPos: null, etaMin: null,
    alarm: null,             // stan ze Strażnika, gdy Grota działa w jego wnętrzu
    live: null, liveError: null, locating: false,
    openPlace: null,
    theme: readLS(THEME_KEY, "jasna"),
    localities: null,                    // spis miejscowości (wyszukiwanie bez GPS)
    addr: { q: "" },                     // { q, loading, items, offline, notFound }
    addrPlace: { q: "" },                // to samo dla „Dodaj miejsce”
    addrEdit: { q: "" },                 // zmiana położenia zapisanego miejsca
    addrCel: { q: "" },                  // adres umówionego miejsca spotkania
    wybraneRecznie: null,                // punkt wskazany ręcznie z „Innych opcji" — stoi wtedy pierwszy
    rysujeTrase: false,                  // ustalamy pozycję pod trasę rysowaną z karty punktu na mapie
    trasaBlad: null,
    cel: readLS(CEL_KEY, null),          // { lat, lon, label } — miejsce umówione z bliskimi, nie z bazy PSP
    celOpen: false, celWarnClosed: false, celKroki: false,
    paczka: { rodzaj: "promien", promienKm: 50, woj: "", zPunktu: "pozycja", zestaw: "trasy" },   // wybierak map offline
    pobieranie: null,        // { etap, zrobione, razem, etykieta } — bajty ze spisu paczek
    locatingPaczka: false, paczkaBlad: null,   // ustalanie pozycji na potrzeby pobrania mapy
    pobranieWynik: null,     // podsumowanie po pobraniu: ile kafelków, ile nieudanych
    zasoby: null,            // co jest w telefonie: styl, ikony, czcionki
    spis: null, spisBlad: null, spisLaduje: false,   // spis paczek map z serwera — z niego dokładne rozmiary
    stanMap: null,           // { kafelkow, paczki, miejsce } — odświeżane po zmianach
    route: null,                         // { key, id, mode, loading, coords, distM, durMin, failed, own, from }
    rec: null,                           // nagrywanie trasy: { placeId, shelterId, coords, distM, ... }
    addrOpen: false,
    posLabel: null,                      // skąd pozycja: null = GPS, inaczej tekst („Marszałkowska 100, Warszawa”)
    posSeq: 0,                           // ręczny wybór pozycji unieważnia spóźniony wynik GPS
    newName: "",
    adding: null,            // rodzaj miejsca, którego formularz dodawania jest otwarty (np. "dom")
    editPlace: null,         // id miejsca w trybie edycji danych (nazwa, położenie, rodzaj, notatka)
    savedFlash: null,        // { field, at } — „Zapisano” przy polu tekstowym
    pickFilter: { dostep: ["24h", "godziny", "na_zadanie"], grupy: null, ...readLS(PICK_FILTER_KEY, {}) },
    pickTypesOpen: false,
    // co widać na mapie (legenda = filtr); ranking „Teraz” zawsze bierze wszystkie punkty
    filter: { dostep: ["24h", "godziny", "na_zadanie"], trust: [0, 1, 2], grupy: null, ...readLS(FILTER_KEY, {}) },   // grupy: null = wszystkie
    counts: null,
    // filtr ekranu „Teraz” — osobny od mapy: tu decyduje, dokąd Grota prowadzi (np. dalej, ale całodobowo)
    liveFilter: { dostep: ["24h", "godziny", "na_zadanie"], grupy: null, ...readLS(LIVE_FILTER_KEY, {}) },
    liveNear: null,          // najbliższy sprawdzony punkt dla każdego rodzaju dostępu (przy obecnym filtrze rodzaju budynku)
    liveTypesOpen: false,
    mapToolsOpen: false,     // na ekranie Mapa filtry i ustawienia są zwinięte, żeby mapa miała 2/3 ekranu
    prevTab: "mapa",
    infoSchrony: !readLS(INFO_KEY, false),   // krótka informacja na starcie: dlaczego nie ma kategorii „schron”
  };

  function readLS(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`);
  const plural = (n, one, few, many) => {
    const t = n % 10, h = n % 100;
    return `${n} ${n === 1 ? one : t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many}`;
  };
  const estText =(min) => (min == null ? "czas: sprawdź w Google Maps" : `ok. ${min} min (szacunek)`);

  /* ---------- mapa ---------- */
  /* Dane map i tras pochodzą z OpenStreetMap (ODbL), więc podpis jest wymagany zawsze:
     online, z pobranej paczki i na podkładzie uproszczonym. Trasy liczone w telefonie to też
     dzieło pochodne z OSM — stąd osobna wzmianka. */
  const PODPIS_OSM = `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`;
  const PODPIS_MAPY = `<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ${PODPIS_OSM}`;
  const PODPIS_TRAS = `trasy i punkty: ${PODPIS_OSM} · schronienia: KG PSP, CC BY 4.0`;

  const O = window.GrotaOffline;
  O.rejestruj(maplibregl);

  /* Kafelki, ikony i czcionki idą przez własny protokół `grota://`, który najpierw zagląda do pamięci
     telefonu, a dopiero potem do sieci. Bez tego pobrane mapy byłyby tylko plikami na dysku. */
  async function stylMapy(motyw) {
    const nazwa = motyw === "ciemna" ? "ciemny" : "jasny";
    const zapamietany = await O.stylZPamieci(nazwa).catch(() => null);
    if (zapamietany) return przerobStyl(zapamietany, nazwa, true);
    if (O.udaje()) return null;
    try { return przerobStyl(await (await fetch(MAP_STYLES[motyw] || MAP_STYLES.jasna)).json(), nazwa, false); } catch { return null; }
  }

  /* Ikony i czcionki podmieniamy na własny protokół TYLKO wtedy, gdy styl pochodzi z pamięci telefonu —
     czyli gdy razem z nim pobraliśmy te pliki. Przy stylu z sieci zostają adresy OpenFreeMap: pusty sprite
     podany przez protokół zatrzymywał wczytywanie całego stylu. */
  function przerobStyl(styl, nazwa, zPamieci) {
    const s = JSON.parse(JSON.stringify(styl));
    const zr = s.sources?.openmaptiles;
    if (zr) {
      if (zr.tiles?.[0]) O.ustawZrodloOFM(zr.tiles[0]);
      else if (zr.url) fetch(zr.url).then((r) => r.json()).then((tj) => tj.tiles?.[0] && O.ustawZrodloOFM(tj.tiles[0])).catch(() => {});
      // klucz z wartością undefined wywraca walidację stylu i MapLibre po cichu przerywa wczytywanie
      s.sources.openmaptiles = { type: "vector", tiles: ["grota://kafelek/{z}/{x}/{y}"], minzoom: 0, maxzoom: zr.maxzoom || 14 };
      /* Atrybucja MUSI zostać: ODbL wymaga jej wszędzie tam, gdzie pokazujemy dane OSM, także
         z paczki offline. Liberty trzyma ją w TileJSON, a my podstawiamy własną listę adresów,
         więc bez tej linijki podpis znikał razem z przejściem na protokół grota://. */
      s.sources.openmaptiles.attribution = zr.attribution || PODPIS_MAPY;
    }
    const sprite = typeof s.sprite === "string" ? s.sprite : s.sprite?.[0]?.url;
    if (sprite) {
      for (const koniec of [".json", ".png", "@2x.json", "@2x.png"]) O.zapiszMeta(`adres:sprite:${nazwa}${koniec}`, sprite + koniec);
      if (zPamieci) s.sprite = `grota://sprite/${nazwa}`;
    }
    if (s.glyphs) {
      const szablon = s.glyphs;
      (s.layers || []).forEach((l) => {
        const f = l.layout?.["text-font"];
        if (Array.isArray(f) && f.length) for (const zakres of ["0-255", "256-511"])
          O.zapiszMeta(`adres:glyph:${f.join(",")}:${zakres}`, szablon.replace("{fontstack}", encodeURIComponent(f.join(","))).replace("{range}", zakres));
      });
      if (zPamieci) s.glyphs = "grota://glyph/{fontstack}/{range}";
    }
    return s;
  }

  /* Mapa powstaje przy wejściu do Groty i jest zdejmowana przy wyjściu (w Strażniku obok działa jego
     własna mapa, a dwa konteksty WebGL naraz to dużo pamięci na starszym telefonie). Wszystko, co trzeba
     podpiąć do mapy, idzie przez przyMapie() — wtedy trafia też do każdej następnej mapy. Po zdjęciu
     `map` wskazuje na mapę-atrapę, żeby wywołania z tła (postęp pobierania, alarm, powrót sieci) nie
     wywracały się na nieistniejącej mapie; po powrocie wszystko rysuje się od nowa. */
  const MAPA_ATRAPA = new Proxy({}, {
    get: (_, k) => ({
      getCanvas: () => ({ style: {} }), project: () => ({ x: -1e6, y: -1e6 }), getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 0, isStyleLoaded: () => false, getStyle: () => ({ layers: [], sources: {} }), loaded: () => false,
      queryRenderedFeatures: () => [], querySourceFeatures: () => [],
    })[k] || (() => undefined),
  });
  let map = MAPA_ATRAPA;
  const mapaJest = () => map !== MAPA_ATRAPA;
  const podpiecia = [];
  const przyMapie = (fn) => { podpiecia.push(fn); if (mapaJest()) fn(map); };
  let widokMapy = { center: [19.4, 52.0], zoom: 5.4 };
  let styleTimeout = null;

  function utworzMape() {
    map = new maplibregl.Map({
      container: "g-map", style: OFFLINE_STYLE,
      center: widokMapy.center, zoom: widokMapy.zoom, attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapOffline = true; styleSwitching = false;
    map.on("style.load", () => { styleSwitching = false; });
    // Dopiero po wczytaniu podkładu awaryjnego sięgamy po właściwy — dwa setStyle naraz przy starcie
    // zostawiały mapę bez stylu (czarny ekran).
    map.once("load", () => tryOnlineMap());
    /* Nie przełączamy się na mapę uproszczoną z powodu błędów zasobów. Bez sieci zawsze czegoś zabraknie
       (ikona, zakres czcionki, kafelek spoza paczki), a wcześniej każdy taki błąd kasował mapę z pamięci
       telefonu i zostawał biały podkład z kropkami. O braku podkładu decyduje tylko to, czy udało się
       zbudować styl. */
    map.on("error", (e) => {
      if (e?.error) console.warn("Grota: mapa —", e.error.message || e.error);
    });
    // podkład bywa nie tyle niedostępny, co bardzo wolny (słaby zasięg) — po 12 s pokazujemy mapę uproszczoną
    clearTimeout(styleTimeout);
    styleTimeout = setTimeout(() => { if (mapaJest() && !map.style?.stylesheet) useOfflineMap(); }, 12000);
    map.once("style.load", () => clearTimeout(styleTimeout));
    // podpis zawsze, niezależnie od tego, czy styl przyszedł z sieci, z pamięci, czy jest uproszczony
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: PODPIS_TRAS }), "bottom-left");
    for (const fn of podpiecia) fn(map);
  }

  let mapOffline = true;      // startujemy od podkładu z plików w aplikacji, żeby mapa była od razu
  const offlineBanner = document.getElementById("map-offline");
  // Pasek „bez internetu”: także gdy podkład wczytał się z pamięci telefonu, a sieci nie ma — nowe fragmenty mapy się nie pojawią.
  function showOfflineBanner() {
    const noNet = navigator.onLine === false;
    offlineBanner.hidden = !mapOffline && !noNet;
    const tip = "Punkty, Twoje miejsca i nagrane trasy działają. Wyszukiwarka adresów, wstępne trasy i zdjęcia z góry wrócą z siecią.";
    const udaje = O.udaje();
    offlineBanner.hidden = !mapOffline && !noNet && !udaje;
    offlineBanner.innerHTML = mapOffline
      ? `<span title="${tip}">Bez internetu · mapa uproszczona</span><button type="button" data-map="retry">Odśwież</button>`
      : (noNet || udaje) ? `<span title="${tip}">${udaje ? "Test bez internetu" : "Bez internetu"} · mapa z pamięci telefonu</span>${udaje ? `<button type="button" data-map="koniec-testu">Zakończ test</button>` : ""}` : "";
  }
  // W trakcie przełączania stylu mapa jest „niewczytana” i sypie błędami — bez tej blokady wpadała w pętlę setStyle.
  let styleSwitching = false;
  function useOfflineMap() {
    if (mapOffline || styleSwitching || !mapaJest()) return;
    mapOffline = true; styleSwitching = true;
    map.setStyle(OFFLINE_STYLE, { diff: false });
    showOfflineBanner();
  }
  async function tryOnlineMap() {
    if (styleSwitching || !mapaJest()) return;
    styleSwitching = true;
    let styl = null;
    try { styl = await stylMapy(S.theme); } catch (e) { console.error("Grota: nie udało się zbudować stylu mapy", e); }
    if (!styl) { styleSwitching = false; mapOffline = true; showOfflineBanner(); return; }
    if (!mapaJest()) { styleSwitching = false; return; }     // Grotę zamknięto, gdy styl się budował
    mapOffline = false;
    showOfflineBanner();
    try { map.setStyle(styl, { diff: false }); }
    catch (e) { console.error("Grota: setStyle odrzucił styl", e); styleSwitching = false; mapOffline = true; showOfflineBanner(); }
  }
  window.addEventListener("online", () => {
    if (mapOffline) tryOnlineMap(); else showOfflineBanner();
    // trasa do umówionego miejsca nie wylicza się bez sieci — po jej powrocie próbujemy sami
    if (S.cel && S.route?.id === "cel" && !S.route.coords && !S.route.loading) showRoute("cel");
  });
  window.addEventListener("offline", showOfflineBanner);
  offlineBanner.addEventListener("click", (e) => {
    if (e.target.closest("[data-map=retry]")) tryOnlineMap();
    if (e.target.closest("[data-map=koniec-testu]")) testBezSieci(false);
  });
  showOfflineBanner();
  /* W Strażniku mapę tworzy dopiero pokaz(): moduł bywa wczytywany w tle, zanim ktokolwiek go otworzy
     (Grota.przygotuj() przy alarmie), a niewidoczna mapa to tylko zajęta pamięć. */
  if (!MODUL) utworzMape();
  let userMarker = null, placeMarkers = [], pickDoneAt = 0;

  // Kolory dostępności czytelne na jasnym i ciemnym podkładzie (legenda w viewMapa korzysta z tych samych).
  const ACCESS_COLORS = { "24h": "#16a34a", godziny: "#ea9a0c", na_zadanie: "#4f6bed" };

  // Rodzaje obiektów z OSM zebrane w grupy — 21 typów na mapie telefonu byłoby nieczytelne.
  const TYPE_GROUPS = [
    ["podziemne", "Parkingi podziemne i garaże", "square-parking", ["parking_podziemny", "garaze"]],
    ["galeria", "Centra handlowe", "store", ["centrum_handlowe"]],
    ["transport", "Dworce, stacje, metro", "train-front", ["transport"]],
    ["blok", "Bloki mieszkalne", "building", ["blok"]],
    ["dom", "Domy i zabudowa wiejska", "house", ["dom", "gospodarczy"]],
    ["edukacja", "Szkoły, przedszkola, uczelnie", "school", ["szkola", "przedszkole", "uczelnia"]],
    ["zdrowie", "Szpitale i przychodnie", "hospital", ["zdrowie"]],
    ["urzad", "Urzędy i służby", "landmark", ["urzad", "sluzby", "publiczny"]],
    ["praca", "Biura, sklepy, hotele, zakłady", "briefcase-business", ["biuro", "handel", "hotel", "przemysl"]],
    ["kultura", "Kultura, sport, świątynie", "library", ["kultura", "sport", "swiatynia"]],
    ["inne", "Rodzaj nieznany", "building-2", ["budynek"]],
  ];
  const GROUP_OF = Object.fromEntries(TYPE_GROUPS.flatMap(([g, , , kody]) => kody.map((k) => [k, g])));
  const groupOf = (p) => GROUP_OF[p.obiekt?.kod] || "inne";
  const ALL_GROUPS = TYPE_GROUPS.map(([g]) => g);
  const activeGroups = (grupy = S.filter.grupy) => grupy || ALL_GROUPS;   // null = wszystkie rodzaje
  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const groupsToggle = (grupy, v) => { const next = toggleIn(activeGroups(grupy), v); return next.length === ALL_GROUPS.length ? null : next; };
  const groupsAll = (grupy) => (activeGroups(grupy).length === ALL_GROUPS.length ? [] : null);

  /* „Pokaż wszystkie” w pasku dostępności: gdy cokolwiek jest wyłączone (także rodzaj budynku) — włącza wszystko,
     żeby jednym dotknięciem wrócić do pełnej mapy. Gdy już wszystko jest włączone — czyści tylko swoją sekcję,
     nie rusza rodzajów budynku (mają własny przycisk). */
  function accessAll(F, items) {
    const full = F.dostep.length === items.length && (!("trust" in F) || F.trust.length === TRUST_ITEMS.length) && !F.grupy;
    F.dostep = full ? [] : items.map(([k]) => k);
    if ("trust" in F) F.trust = full ? [] : TRUST_ITEMS.map(([k]) => k);
    if (!full) F.grupy = null;
  }

  const trustOf = (p) => (C.isDoubtful(p) ? 2 : C.flagMessages(p).length ? 1 : 0);   // 0 sprawdzone, 1 do sprawdzenia, 2 wątpliwe

  /* 86 tys. punktów przerabiamy porcjami, oddając sterowanie przeglądarce — na telefonie robienie tego
     jednym ciągiem blokowało ekran na kilka sekund (Android potrafi wtedy pokazać „aplikacja nie odpowiada”). */
  const CHUNK = 4000;
  const yieldToUI = () => new Promise((ok) => setTimeout(ok, 0));

  function setLoadMsg(text) {
    const el = document.getElementById("map-load");
    if (!el) return;
    el.hidden = !text;
    if (text) el.textContent = text;
  }

  async function geojson() {
    const counts = { dostep: {}, trust: {}, grupa: {} };
    const features = new Array(S.points.length);
    for (let i = 0; i < S.points.length; i++) {
      const p = S.points[i], t = trustOf(p), gr = groupOf(p);
      counts.dostep[p.dostep] = (counts.dostep[p.dostep] || 0) + 1;
      counts.trust[t] = (counts.trust[t] || 0) + 1;
      counts.grupa[gr] = (counts.grupa[gr] || 0) + 1;
      features[i] = { type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { id: p.id, dostep: p.dostep, watpliwy: t, grupa: gr } };
      if (i % CHUNK === CHUNK - 1) {
        setLoadMsg(`Przygotowuję mapę… ${Math.round((100 * i) / S.points.length)}%`);
        await yieldToUI();
      }
    }
    S.counts = counts;
    return { type: "FeatureCollection", features };
  }

  function filterExpr() {
    const dostep = S.filter.dostep.includes("na_zadanie") ? [...S.filter.dostep, "nieznany"] : S.filter.dostep;
    return ["all", ["in", ["get", "dostep"], ["literal", dostep]], ["in", ["get", "watpliwy"], ["literal", S.filter.trust]],
      ["in", ["get", "grupa"], ["literal", activeGroups()]]];
  }

  function applyFilter() {
    writeLS(FILTER_KEY, S.filter);
    for (const id of ["ps", "ps-hit"]) if (map.getLayer(id)) map.setFilter(id, filterExpr());
  }

  function visibleCount() {
    if (!S.counts) return 0;
    // kategorie są niezależne, więc liczymy wprost po punktach tylko przy zawężonym filtrze
    const full = S.filter.dostep.length === 3 && S.filter.trust.length === 3 && !S.filter.grupy;
    if (full) return S.points.length;
    const gr = activeGroups();
    return S.points.reduce((n, p) => n + (S.filter.dostep.includes(p.dostep) && S.filter.trust.includes(trustOf(p)) && gr.includes(groupOf(p)) ? 1 : 0), 0);
  }

  // Dane nie mogą czekać na podkład mapy — bez sieci lista i alarm muszą działać.
  async function loadData(attempt = 1) {
    try {
      const r = await fetch(BAZA + "data/polska.min.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLoadMsg("Wczytuję punkty schronienia z całej Polski…");
      const meta = await r.json();
      S.meta = meta;
      S.points = await unpackPoints(meta);
      delete meta.punkty;
      S.points.forEach((p) => S.byId.set(p.id, p));
      /* Podzbiory liczone, zanim punkty doszły, są puste — bez wyczyszczenia filtr „Prowadź do punktów”
         pokazywał „brak w pobliżu” przy każdym rodzaju dostępu, choć punkt był kilkaset metrów dalej
         (test alarmu na emulatorze: pozycja ustaliła się szybciej niż punkty). */
      subsetCache.clear();
      watpliwychIle = null;
      S.dataError = null;
    } catch (err) {
      if (attempt < 3) { await new Promise((ok) => setTimeout(ok, 1500 * attempt)); return loadData(attempt + 1); }
      S.dataError = "Nie udało się wczytać punktów schronienia. Zasady i listy „Przygotuj się” działają bez nich.";
    }
    /* Ktoś zdążył nacisnąć TERAZ (albo wszedł z alarmu), zanim punkty się wczytały — liczymy wynik od razu
       po wczytaniu, razem z trasą do pierwszej propozycji. Bez fitLive() zostawał sam szacunek z linii prostej
       (znalezione testem alarmu na emulatorze: pozycja ustaliła się szybciej niż punkty i trasy nie było). */
    if (S.points.length && S.userPos && S.tab === "teraz") { computeLive(); fitLive(); }
    render();
  }
  let dataReady = loadData();

  // Wiersze tablic (tools/paczka_aplikacji.py) → obiekty, których oczekuje grota-core.js.
  async function unpackPoints(m) {
    const rows = m.punkty, out = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out[i] = {
        id: r[0], lat: r[1] / 1e6, lon: r[2] / 1e6, adres: r[3], gmina: r[4], gmina_z_polozenia: r[5],
        dostep: m.dostep[r[6]], budynek_m: r[7], adres_m: r[8], miejscowosc_km: r[9],
        flagi: r[10] ? m.flagi.filter((_, i2) => r[10] & (1 << i2)) : [],
        obiekt: m.typy && r[11] != null ? { ...m.typy[r[11]], nazwa: r[12] || "" } : null,   // { kod, etykieta, ikona, nazwa } z OSM
        // co stoi najbliżej, gdy szpilka nie stoi na żadnym budynku (tools/obiekt_typ.py)
        obok: m.typy && r[13] != null ? m.typy[r[13]] : null, obok_m: r[14] ?? null,
      };
      if (i % CHUNK === CHUNK - 1) {
        setLoadMsg(`Wczytuję punkty… ${Math.round((100 * i) / rows.length)}%`);
        await yieldToUI();
      }
    }
    return out;
  }

  // Spis miejscowości nie blokuje startu — potrzebny dopiero, gdy ktoś wpisuje adres.
  (async function loadLocalities(attempt = 1) {
    try {
      const r = await fetch(BAZA + "data/miejscowosci.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      S.localities = C.localityIndex(await r.json());
    } catch {
      if (attempt < 3) setTimeout(() => loadLocalities(attempt + 1), 3000 * attempt);
    }
  })();

  root.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", I(el.dataset.icon)));
  const themeBtn = document.getElementById("btn-theme");
  const setThemeIcon = () => { themeBtn.innerHTML = I(S.theme === "jasna" ? "moon" : "sun"); };
  setThemeIcon();

  /* Podpis mapy musi zostać (licencje OpenStreetMap/OpenFreeMap), ale zwinięty do przycisku „i”.
     MapLibre sam go rozwija — po wczytaniu stylu, zmianie rozmiaru i przełączeniu jasna/ciemna — więc pilnujemy
     klasy na bieżąco; rozwinięcie zostaje tylko wtedy, gdy użytkownik przed chwilą dotknął „i”. */
  let attribTouchedAt = 0;
  const foldAttribution = () => {
    if (Date.now() - attribTouchedAt < 1500) return;
    root.querySelectorAll(".maplibregl-ctrl-attrib.maplibregl-compact-show")
      .forEach((el) => el.classList.remove("maplibregl-compact-show"));
  };
  // pojemnik mapy jest podmieniany przy każdym zdjęciu mapy (niżej, w schowaj), więc nasłuch podpinamy do każdego
  przyMapie((m) => m.getContainer().addEventListener("click", (e) => {
    if (e.target.closest(".maplibregl-ctrl-attrib-button")) attribTouchedAt = Date.now();
  }, true));
  const attribObserver = new MutationObserver(foldAttribution);
  przyMapie((m) => {
    root.querySelectorAll(".maplibregl-ctrl-attrib").forEach((el) => attribObserver.observe(el, { attributes: true, attributeFilter: ["class"] }));
    m.on("load", foldAttribution);
  });

  /* Nazwy na mapie po polsku (jak w Strażniku): kafelki OpenMapTiles niosą name:pl.
     Zmieniamy tylko etykiety oparte na nazwie — numery dróg (ref) zostają. */
  function localiseLabels() {
    const field = ["coalesce", ["get", "name:pl"], ["get", "name:latin"], ["get", "name"]];
    for (const lyr of map.getStyle().layers || []) {
      if (lyr.type !== "symbol") continue;
      const tf = map.getLayoutProperty(lyr.id, "text-field");
      if (tf !== undefined && JSON.stringify(tf).includes("name")) map.setLayoutProperty(lyr.id, "text-field", field);
    }
  }

  let pointsGeojson = null, layersAdding = false;
  /* Warstwy wolno dodać, gdy wczytany jest sam styl — nie trzeba czekać na kafelki. Wcześniej czekaliśmy na
     isStyleLoaded(), a to znaczy „styl i wszystkie widoczne kafelki”: na wolnym połączeniu trwało to dłużej niż
     8 s i punkty w ogóle się nie pojawiały (wyszło w Strażniku na emulatorze, ale dotyczyło też samodzielnej Groty).
     Dlatego też ponawiamy dodanie, dopóki warstwy nie ma — z limitem, żeby nie kręcić się bez końca. */
  const stylGotowy = () => mapaJest() && !!(map.style && map.style._loaded);
  let probyWarstw = 0;
  przyMapie(() => { probyWarstw = 0; });

  async function addLayers() {
    localiseLabels();
    if (layersAdding || map.getSource("ps")) return;   // blokada ustawiona zanim cokolwiek zaczekamy
    layersAdding = true;
    try {
      await addLayersInner();
    } catch (e) {
      console.error("Grota: nie udało się dodać warstw punktów", e);
    } finally {
      layersAdding = false;
    }
    // Styl bywa podmieniany (motyw, przejście na podkład z sieci) dokładnie wtedy, gdy rozpakowujemy punkty.
    // Wywołanie ze zdarzenia stylu trafia wtedy na blokadę, więc po zakończeniu sprawdzamy i dokładamy warstwy.
    if (!map.getSource("ps") && mapaJest() && ++probyWarstw < 30) setTimeout(addLayers, stylGotowy() ? 0 : 1000);
  }

  async function addLayersInner() {
    await dataReady;
    // punkty rozpakowują się kilkanaście sekund; w tym czasie styl mógł zacząć się przeładowywać
    if (!stylGotowy()) await Promise.race([new Promise((r) => map.once("style.load", r)), new Promise((r) => setTimeout(r, 8000))]);
    if (!stylGotowy() || map.getSource("ps")) return;
    pointsGeojson = pointsGeojson || await geojson();
    setLoadMsg("");
    render();                      // liczniki przy filtrach są znane dopiero po przeliczeniu punktów
    if (map.getSource("ps")) return;      // styl mógł się przeładować, gdy liczyliśmy punkty
    const light = S.theme === "jasna";
    map.addSource("ps", { type: "geojson", data: pointsGeojson });
    /* Punkty muszą być nad KAŻDYM wypełnieniem i linią — budynkami, drogami, torami — inaczej przy dużym
       zbliżeniu z kropki widać tylko strzępy wystające poza budynek. Szukanie „pierwszej etykiety za budynkami"
       zawodziło: w ciemnym stylu warstwa `water_name` leży jeszcze przed budynkami, więc punkty lądowały pod nimi.
       Dlatego cofamy się od końca przez blok etykiet i wchodzimy tuż przed nim — nad wszystkim innym. */
    const styleLayers = map.getStyle().layers;
    let ostatnia = styleLayers.length - 1;
    while (ostatnia >= 0 && styleLayers[ostatnia].type === "symbol") ostatnia--;
    const firstLabel = styleLayers[ostatnia + 1]?.id;
    map.addLayer({ id: "ps", type: "circle", source: "ps", filter: filterExpr(), paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.4, 8, 3, 12, 6, 16, 9],
      "circle-color": ["match", ["get", "dostep"], "24h", ACCESS_COLORS["24h"], "godziny", ACCESS_COLORS.godziny, ACCESS_COLORS.na_zadanie],
      "circle-stroke-color": ["match", ["get", "watpliwy"], 2, "#dc2626", 1, "#d97706", light ? "#ffffff" : "#0b0d12"],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, ["match", ["get", "watpliwy"], 2, 1, 0.5],
        12, ["match", ["get", "watpliwy"], 2, 2.5, 1, 2, 1]],
    } }, firstLabel);
    lastDim = "";
    updateLiveDim();
    // niewidoczne, większe pole trafienia — palcem trudno trafić w kropkę o promieniu kilku pikseli
    map.addLayer({ id: "ps-hit", type: "circle", source: "ps", filter: filterExpr(), paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 12, 14, 16, 18], "circle-color": "#000", "circle-opacity": 0,
    } });
    map.addLayer({ id: "ps-sel", type: "circle", source: "ps", filter: ["==", ["get", "id"], S.selectedId || ""], paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 7, 16, 14], "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": "#16a34a", "circle-stroke-width": 4,
    } });
    map.addSource("route", { type: "geojson", data: routeGeojson() });
    map.addLayer({ id: "route-straight", type: "line", source: "route", filter: ["==", ["get", "kind"], "prosta"],
      paint: { "line-color": light ? "#334155" : "#cbd5e1", "line-width": 2, "line-opacity": 0.55, "line-dasharray": [2, 2] } }, "ps");
    map.addLayer({ id: "route-casing", type: "line", source: "route", filter: ["==", ["get", "kind"], "trasa"],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": light ? "#ffffff" : "#0b0d12", "line-width": 9 } }, "ps");
    map.addLayer({ id: "route-line", type: "line", source: "route", filter: ["==", ["get", "kind"], "trasa"],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } }, "ps");
    map.addSource("rec", { type: "geojson", data: recGeojson() });
    map.addLayer({ id: "rec-line", type: "line", source: "rec", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#dc2626", "line-width": 4, "line-dasharray": [1, 1.2] } }, "ps");
    if (S.userPos) setUserPos(S.userPos, false);
    // obsługa kliknięć w punkty jest podpinana do każdej mapy przez przyMapie — niżej
    drawPlaces();
    render();
  }

  // Obsługa kliknięć w punkty — raz na każdą mapę (MapLibre przyjmuje ją, zanim warstwa powstanie).
  function registerPointHandlers() {
    map.on("click", "ps-hit", (e) => {
      // kliknięcie przy wskazywaniu pozycji nie może jednocześnie wybrać punktu
      if (S.pick || Date.now() - pickDoneAt < 400) return;
      select(e.features[0].properties.id, false);
    });
    map.on("mouseenter", "ps-hit", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "ps-hit", () => (map.getCanvas().style.cursor = ""));
  }

  przyMapie((m) => m.on("style.load", addLayers));
  przyMapie(() => registerPointHandlers());

  /* ---------- nagrywanie własnej trasy (ćwiczenie dojścia) ----------
     „Poradnik” (s. 34) zaleca iść do schronienia ustaloną wcześniej drogą. Użytkownik przechodzi ją na próbę,
     a Grota zapisuje ślad GPS — skróty między blokami, przejścia, bramy, których nie ma w żadnym wyznaczaniu tras.
     W przeglądarce nagrywanie działa tylko przy włączonym ekranie (Wake Lock, jeśli dostępny). */
  const recBar = document.getElementById("rec-bar");
  const REC_MAX_ACC = 35;       // gorsze odczyty pomijamy
  const fmtDur = (sec) => (sec < 60 ? `${Math.round(sec)} s` : `${Math.floor(sec / 60)} min ${String(Math.floor(sec % 60)).padStart(2, "0")} s`);
  const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const fmtDate = (iso) => iso.split("-").reverse().join(".");

  function recGeojson() {
    const R = S.rec;
    return { type: "FeatureCollection", features: R && R.coords.length > 1
      ? [{ type: "Feature", geometry: { type: "LineString", coordinates: R.coords }, properties: {} }] : [] };
  }
  const drawRec = () => map.getSource("rec")?.setData(recGeojson());

  function renderRecBar() {
    const R = S.rec;
    recBar.hidden = !R;
    if (!R) { recBar.innerHTML = ""; return; }
    const pl = S.places.find((x) => x.id === R.placeId), p = S.byId.get(R.shelterId);
    const toGoal = R.last && p ? C.distanceM(R.last.lat, R.last.lon, p.lat, p.lon) : null;
    recBar.innerHTML = `<div class="rec-head"><span class="rec-dot"></span><b>Nagrywam trasę</b>
        <span class="small muted rec-where">${esc(pl?.name || "")} → ${esc(p?.adres || "")}</span></div>
      <div class="rec-stats"><span>${I("timer")}${fmtClock((Date.now() - R.startedAt) / 1000)}</span><span>${I("footprints")}${fmtDist(R.distM)}</span>
        <span>${R.lastAcc == null ? "czekam na GPS…" : `GPS ±${Math.round(R.lastAcc)} m`}</span>${toGoal != null ? `<span>do celu ${fmtDist(toGoal)}</span>` : ""}</div>
      ${R.error ? `<p class="small rec-warn">${esc(R.error)}</p>`
        : R.lastAcc > REC_MAX_ACC ? `<p class="small rec-warn">Słaby sygnał GPS — punkty pomijam, dopóki dokładność nie będzie lepsza niż ${REC_MAX_ACC} m.</p>` : ""}
      <div class="row"><button class="btn" data-rec="save">${I("save")}Zakończ i zapisz</button><button class="btn ghost" data-rec="cancel">Anuluj</button></div>`;
  }

  async function recStart(placeId, shelterId) {
    const pl = S.places.find((x) => x.id === placeId), p = S.byId.get(shelterId);
    if (S.rec || !pl || !p) return;
    if (!window.isSecureContext || !navigator.geolocation) { alert("Nagrywanie trasy wymaga lokalizacji (strona https albo localhost)."); return; }
    if (!confirm(`Nagrywanie trasy z „${pl.name}” do: ${p.adres}.\n\nIdź tak, jak szedłbyś w czasie alarmu — najkrótszą bezpieczną drogą, którą znasz. `
      + `W przeglądarce nagrywanie działa tylko przy włączonym ekranie.\n\nZacząć?`)) return;
    const R = S.rec = { placeId, shelterId, mode: pl.mode, startedAt: Date.now(), coords: [], distM: 0, last: null, lastAcc: null, error: null };
    R.watchId = navigator.geolocation.watchPosition(recPoint, recError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    R.timer = setInterval(renderRecBar, 1000);
    try { R.wake = await navigator.wakeLock?.request("screen"); } catch { R.wake = null; }
    try { window.GrotaNative?.keepScreenOn(true); } catch { /* tylko w aplikacji testowej Android */ }
    renderRecBar(); drawRec(); render();
  }

  function recPoint(pos) {
    const R = S.rec; if (!R) return;
    const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
    R.lastAcc = acc; R.error = null;
    if (acc > REC_MAX_ACC) { renderRecBar(); return; }
    if (R.last) {
      const d = C.distanceM(R.last.lat, R.last.lon, lat, lon), dt = Math.max(1, (pos.timestamp - R.last.t) / 1000);
      if (d < Math.max(4, acc / 3)) { renderRecBar(); return; }   // stoisz — to szum GPS, nie ruch
      if (d / dt > 45) { renderRecBar(); return; }                 // skok pozycji, niemożliwy w marszu ani jeździe
      R.distM += d;
    }
    R.last = { lat, lon, t: pos.timestamp };
    R.coords.push([+lon.toFixed(6), +lat.toFixed(6)]);
    // mapa idzie za nagrywającym: na starcie zbliżenie, potem tylko gdy wyjdzie poza widok
    if (R.coords.length === 1) map.flyTo({ center: [lon, lat], zoom: 17 });
    else if (!map.getBounds().contains([lon, lat])) map.easeTo({ center: [lon, lat], duration: 500 });
    drawRec(); renderRecBar();
  }

  function recError(e) {
    if (!S.rec) return;
    S.rec.error = e.code === 1 ? GEO_HELP[1] : "Chwilowo brak pozycji GPS — nagrywanie trwa.";
    renderRecBar();
  }

  function recStop() {
    const R = S.rec; if (!R) return null;
    navigator.geolocation.clearWatch(R.watchId);
    clearInterval(R.timer);
    try { R.wake?.release(); } catch { /* ekran i tak wróci do normalnego wygaszania */ }
    try { window.GrotaNative?.keepScreenOn(false); } catch { /* tylko w aplikacji testowej Android */ }
    S.rec = null; drawRec(); renderRecBar();
    return R;
  }

  function recSave() {
    const R = S.rec; if (!R) return;
    const pl = S.places.find((x) => x.id === R.placeId), p = S.byId.get(R.shelterId);
    if (R.coords.length < 2 || R.distM < 20) {
      if (confirm("Nagrano za mało drogi, żeby zapisać trasę. Przerwać nagrywanie?")) { recStop(); render(); }
      return;
    }
    const start = R.coords[0], end = R.coords[R.coords.length - 1];
    const startGap = C.distanceM(start[1], start[0], pl.lat, pl.lon), endGap = C.distanceM(end[1], end[0], p.lat, p.lon);
    const warn = [startGap > 150 ? `początek jest ${fmtDist(startGap)} od miejsca „${pl.name}”` : "", endGap > 100 ? `koniec jest ${fmtDist(endGap)} od schronienia` : ""].filter(Boolean);
    if (warn.length && !confirm(`Uwaga: ${warn.join(", ")}. Zapisać trasę mimo to?`)) return;
    recStop();
    const coords = C.simplifyLine(R.coords, 3);
    pl.routes = { ...(pl.routes || {}), [R.shelterId]: {
      coords, distM: Math.round(C.lineLengthM(coords)), durSec: Math.round((Date.now() - R.startedAt) / 1000), mode: R.mode, date: localDate() } };
    savePlaces();
    S.tab = "miejsca"; S.openPlace = pl.id;
    showOwnRoute(pl, R.shelterId); render();
  }

  recBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rec]"); if (!b) return;
    if (b.dataset.rec === "save") recSave();
    else if (confirm("Przerwać nagrywanie bez zapisu?")) { recStop(); render(); }
  });

  function recBlock(pl, p) {
    const own = pl.routes?.[p.id];
    if (S.rec && S.rec.placeId === pl.id && S.rec.shelterId === p.id)
      return `<p class="small rec-warn">${I("circle-dot")} Trwa nagrywanie tej trasy — pasek nagrywania jest na mapie.</p>`;
    const ids = `data-place="${esc(pl.id)}" data-id="${esc(p.id)}"`;
    return `<div class="own-route">
      ${own ? `<p class="route-info own">${I("footprints")}<span><b>Twoja trasa: ${fmtDist(own.distM)} · ${fmtDur(own.durSec)}</b>
          <span class="small muted">nagrana ${esc(fmtDate(own.date))} · ${esc((C.MODES[own.mode]?.label || "").toLowerCase())} · w alarmie Grota pokaże ją zamiast wyliczonej</span></span></p>`
        : `<p class="small muted">Przejdź tę drogę na próbę i nagraj ją. W alarmie Grota pokaże Twoją sprawdzoną trasę zamiast wyliczonej — także skróty, których nie ma w mapach.</p>`}
      <div class="row">
        ${own ? `<button class="btn ghost" data-act="rec-show" ${ids}>${I("eye")}Pokaż na mapie</button>` : ""}
        <button class="btn${own ? " ghost" : ""}" data-act="rec-start" ${ids}${S.rec ? " disabled" : ""}>${I("circle-dot")}${own ? "Nagraj ponownie" : "Nagraj swoją trasę"}</button>
        ${own ? `<button class="btn ghost danger-ghost icon-only" data-act="rec-del" ${ids} title="Usuń nagraną trasę" aria-label="Usuń nagraną trasę">${I("trash-2")}</button>` : ""}
      </div></div>`;
  }

  /* ---------- wstępna trasa ---------- */
  /* Zieleń i czerwień trasy są zarezerwowane dla „zdążysz / nie zdążysz” (kolorTrasy). Pieszo było kiedyś
     zielone — przy alarmie ze źródeł pośrednich wyglądało to jak „zdążysz”, choć Grota niczego nie porównywała. */
  const MODE_COLORS = { walking: "#9333ea", bicycling: "#0891b2", driving: "#2563eb" };
  const OWN_COLOR = "#ea580c";   // trasa nagrana przez użytkownika

  /* Celem trasy może być punkt PSP albo miejsce umówione przez użytkownika („cel”) —
     to drugie nie istnieje w bazie, więc podstawiamy je tu, a reszta rysowania działa bez zmian. */
  const celPunkt = () => (S.cel ? { id: "cel", lat: S.cel.lat, lon: S.cel.lon, adres: S.cel.label } : null);
  const punktCelu = (id) => (id === "cel" ? celPunkt() : S.byId.get(id));

  /* Przy znanym czasie do zagrożenia trasa mówi to samo co komunikat na ekranie: czerwona — nie zdążysz,
     zielona — zdążysz. Liczymy z czasu tej samej trasy, który pokazują ostrzeżenie i karta, więc kolor
     i słowa nie mogą się rozjechać. Bez czasu (nie ma alarmu albo Strażnik go nie podaje) trasa ma kolor
     środka transportu albo nagranej trasy, jak dotąd. */
  const KOLOR_NIE_ZDAZYSZ = "#dc2626", KOLOR_ZDAZYSZ = "#16a34a";
  /* Porównujemy czas dojścia z czasem do zagrożenia tylko wtedy, gdy alarm stoi na źródłach twardych
     (RCB/RSO, obiekt w powietrzu) — albo w prototypie bez Strażnika, gdzie czas ustawia się ręcznie. Przy
     sygnałach pośrednich (decyzja usera 21.09): zwykły kolor trasy i żadnego „zdążysz / nie zdążysz”,
     bo czerwień przy niepotwierdzonym alarmie działa jak alarm. */
  const porownujCzas = () => S.etaMin != null && (!alarmTrwa() || S.alarm.hard !== false) && !S.live?.pozaZasiegiem;

  /* Czas do zagrożenia Strażnik liczy z obiektów, które SAM widzi (NEPTUN i inne źródła). Alert RCB może
     dotyczyć zagrożenia, którego Strażnik nie widzi — np. wojsko ma coś na radarze, a NEPTUN nie. Wtedy
     realny czas bywa krótszy niż ten na ekranie. Mówimy to przy każdym porównaniu czasu. */
  const UWAGA_WIDOCZNE = `Czas do zagrożenia to wyliczenie z zagrożeń widocznych w Strażniku. Alert RCB może dotyczyć czegoś,
    czego Strażnik nie widzi — wtedy realnie jest mniej czasu. Gdy przyszedł alert RCB albo słychać syreny, nie licz minut: działaj według komunikatu.`;

  function kolorTrasy(R) {
    if (!porownujCzas()) return R.own ? OWN_COLOR : MODE_COLORS[R.mode];
    const eta = S.etaMin;
    if (eta != null && R.durMin != null && !R.loading && !R.failed) return R.durMin > eta ? KOLOR_NIE_ZDAZYSZ : KOLOR_ZDAZYSZ;
    return R.own ? OWN_COLOR : MODE_COLORS[R.mode];
  }

  function routeGeojson() {
    const R = S.route, from = R?.from || S.userPos, p = R && punktCelu(R.id);
    if (!R || !from || !p) return { type: "FeatureCollection", features: [] };
    const line = (coords, kind) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { kind, color: kolorTrasy(R) } });
    // linia prosta przerywana zawsze pokazuje kierunek do celu; trasa (gdy jest) idzie wzdłuż dróg i ścieżek z mapy
    const straight = line([[from.lon, from.lat], [p.lon, p.lat]], "prosta");
    return { type: "FeatureCollection", features: R.coords ? [straight, line(R.coords, "trasa")] : [straight] };
  }

  let goalMarker = null;
  function drawRoute() {
    const src = map.getSource("route");
    if (src) src.setData(routeGeojson());
    const p = S.route && punktCelu(S.route.id);
    if (!p || !mapaJest()) { goalMarker?.remove(); return; }
    if (!goalMarker) {
      const el = document.createElement("div"); el.className = "goal";
      el.innerHTML = `<span class="map-tag goal-tag">Cel</span>`;
      goalMarker = new maplibregl.Marker({ element: el });
    }
    goalMarker.setLngLat([p.lon, p.lat]).addTo(map);
  }

  const ownRouteState = (pl, id, from) => {
    const own = pl.routes[id];
    return { key: `own|${pl.id}|${id}|${own.date}|${from.lat.toFixed(5)},${from.lon.toFixed(5)}`, id, mode: own.mode, own, from,
      coords: own.coords, distM: own.distM, durMin: Math.max(1, Math.round(own.durSec / 60)) };
  };

  // Nagrana trasa z zapisanego miejsca (np. z Moich miejsc: „Pokaż na mapie”) — rysowana od tego miejsca.
  function showOwnRoute(pl, id) {
    if (!pl.routes?.[id]) return;
    S.route = ownRouteState(pl, id, { lat: pl.lat, lon: pl.lon });
    S.selectedId = id;
    if (map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], id]);
    drawRoute(); fitRoute();
  }

  async function showRoute(id) {
    const from = S.userPos, p = punktCelu(id);
    if (!from || !p) return;
    // jesteś przy zapisanym miejscu, z którego nagrałeś trasę do tego schronienia → pokazujemy Twoją trasę
    const ownPl = S.places.find((pl) => pl.routes?.[id] && C.distanceM(pl.lat, pl.lon, from.lat, from.lon) <= 300);
    if (ownPl) {
      const st = ownRouteState(ownPl, id, from);
      if (S.route?.key === st.key) return;
      S.route = st; drawRoute(); fitRoute(); render();
      return;
    }
    const key = `${from.lat.toFixed(5)},${from.lon.toFixed(5)}|${id}|${S.mode}`;
    if (S.route?.key === key) return;
    S.route = { key, id, mode: S.mode, loading: !!C.ROUTE_PROFILE[S.mode] };
    drawRoute(); render();
    if (!C.ROUTE_PROFILE[S.mode]) return;
    let res = null;
    if (navigator.onLine !== false && !O.udaje()) {
      try { res = await C.fetchRoute(from, p, S.mode); } catch { res = null; }
    }
    if (S.route?.key !== key) return;                 // w międzyczasie zmieniono cel, pozycję albo środek transportu
    if (!res) {
      // bez sieci trasa z serwera nie powstanie, a to jest właśnie moment, w którym linia „którędy iść”
      // jest najbardziej potrzebna — liczymy ją z siatki dróg w pobranych kafelkach
      fitCel(from, p);
      await new Promise((r) => { const t = setTimeout(r, 2500); map.once("idle", () => { clearTimeout(t); r(); }); });
      if (S.route?.key !== key) return;
      res = mapaJest() ? await window.GrotaTrasa.lokalna(map, from, p, S.mode, C.estimateMin, (A, B) => O.grafDlaKorytarza(A, B)) : null;
    }
    S.route = { ...S.route, loading: false, failed: !res, ...(res || {}) };
    drawRoute(); fitRoute(); render();
  }

  function routeInfo(p) {
    const R = S.route;
    if (!R || R.id !== p.id) return "";
    if (R.own) return `<p class="route-info own">${I("footprints")}<span><b>Twoja nagrana trasa ${fmtDist(R.distM)} · ${fmtDur(R.own.durSec)}</b>
      <span class="small muted">przećwiczona ${esc(fmtDate(R.own.date))} (${esc((C.MODES[R.own.mode]?.label || "").toLowerCase())}) · pomarańczowa linia na mapie</span></span></p>`;
    if (R.loading) return `<p class="small muted route-info">${I("route")}Wyznaczam wstępną trasę…</p>`;
    if (R.lokalna) return `<p class="route-info">${I("route")}<span><b>Trasa ${fmtDist(R.distM)} · ok. ${R.durMin} min</b>
      <span class="small muted">policzona z mapy w telefonie — bez internetu, więc przybliżona</span></span></p>`;
    if (R.failed) return `<p class="small muted route-info">${I("route")}${navigator.onLine === false || O.udaje()
      ? "Bez internetu nie da się wyznaczyć trasy po ulicach, a w pobranej mapie nie ma tu połączenia. Na mapie kierunek i odległość w linii prostej."
      : "Nie udało się wyznaczyć trasy (brak sieci?). Na mapie linia prosta — trasę pokaże Google Maps."}</p>`;
    return `<p class="route-info">${I("route")}<span><b>Trasa ${fmtDist(R.distM)} · ok. ${R.durMin} min</b>
      <span class="small muted">po drogach i ścieżkach z mapy, bez korków i utrudnień · linia przerywana: kierunek w linii prostej · © OpenStreetMap, serwer tras FOSSGIS</span></span></p>`;
  }

  przyMapie((m) => m.on("load", addLayers));

  // Kliknięcie w mapę poza punktem zamyka rozwinięte panele i zdejmuje zaznaczenie — jak zamknięcie okna „poza obszarem”.
  function closePopups() {
    const was = S.mapToolsOpen || S.liveTypesOpen || S.pickTypesOpen || S.addrOpen;
    S.mapToolsOpen = false; S.liveTypesOpen = false; S.pickTypesOpen = false; S.addrOpen = false;
    return was;
  }

  przyMapie((m) => m.on("click", (e) => {
    if (!S.pick) {
      if (Date.now() - pickDoneAt < 400) return;
      const onPoint = map.getLayer("ps-hit") && map.queryRenderedFeatures(e.point, { layers: ["ps-hit"] }).length;
      if (onPoint) return;                       // wybór punktu obsługuje osobny listener
      const zmiana = closePopups();
      if (S.selectedId) { select(null, false); return; }
      if (zmiana) render();
      return;
    }
    const pos = { lat: e.lngLat.lat, lon: e.lngLat.lng };
    const pick = S.pick; S.pick = null; pickDoneAt = Date.now(); map.getCanvas().style.cursor = "";
    if (pick.purpose === "place") addPlace(pick.name, pos, pick.kind);
    else if (pick.purpose === "move") { const pl = S.places.find((x) => x.id === pick.id); if (pl) movePlace(pl, pos, { addr: "wskazane na mapie", approx: false }); return; }
    else if (pick.purpose === "live") { useManualPos(pos, "punkt wskazany na mapie"); return; }
    else if (pick.purpose === "cel") { ustawCel({ ...pos, label: "miejsce wskazane na mapie" }); S.tab = "teraz"; return; }
    else if (pick.purpose === "paczka") { setUserPos(pos, false); S.posLabel = "punkt wskazany na mapie"; S.tab = "przygotuj"; render(); return; }
    render();
  }));

  function select(id, fly) {
    S.selectedId = id;
    if (map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], id || ""]);
    const p = S.byId.get(id);
    if (p && fly) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15) });
    if (S.tab !== "mapa" && (S.tab !== "teraz" || !S.live)) S.tab = "mapa";
    render();
    if (id && S.tab === "mapa") panel.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Powyżej tej niepewności pozycja pochodzi zwykle z adresu IP albo sieci — nie prowadzimy według niej bez potwierdzenia.
  const COARSE_M = 1000;

  function accuracyCircle(pos) {
    const r = Math.min(pos.acc || 0, 100000), pts = [];
    const dLat = r / 111320, dLon = r / (111320 * Math.cos(pos.lat * Math.PI / 180));
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * 2 * Math.PI; pts.push([pos.lon + dLon * Math.cos(a), pos.lat + dLat * Math.sin(a)]); }
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [pts] }, properties: {} };
  }

  function setUserPos(pos, fly = true) {
    S.userPos = pos;
    S.coarse = pos.acc != null && pos.acc > COARSE_M;
    if (!userMarker) {
      const el = document.createElement("div"); el.className = "pin";
      el.innerHTML = `<span class="map-tag me">Tu jesteś</span>`;
      userMarker = new maplibregl.Marker({ element: el });
    }
    if (!mapaJest()) return;               // Grota zamknięta — pozycja zapamiętana, narysujemy ją przy powrocie
    userMarker.setLngLat([pos.lon, pos.lat]).addTo(map);
    updatePlaceLabels();
    if (stylGotowy()) {
      const data = pos.acc ? accuracyCircle(pos) : { type: "FeatureCollection", features: [] };
      if (map.getSource("acc")) map.getSource("acc").setData(data);
      else {
        map.addSource("acc", { type: "geojson", data });
        map.addLayer({ id: "acc-fill", type: "fill", source: "acc", paint: { "fill-color": "#c81e30", "fill-opacity": 0.12 } });
        map.addLayer({ id: "acc-line", type: "line", source: "acc", paint: { "line-color": "#c81e30", "line-width": 1.5 } });
      }
    }
    if (fly) {
      if (pos.acc && pos.acc > 300) {
        const c = accuracyCircle(pos).geometry.coordinates[0];
        const b = new maplibregl.LngLatBounds(c[0], c[0]); c.forEach((p) => b.extend(p));
        map.fitBounds(b, { padding: 40, maxZoom: 15 });
      } else map.flyTo({ center: [pos.lon, pos.lat], zoom: 15 });
    }
  }

  const fmtAcc = (m) => (m >= 1000 ? `±${Math.round(m / 1000)} km` : `±${Math.round(m)} m`);
  const COARSE_TEXT = (acc) => `Pozycja jest bardzo przybliżona (${fmtAcc(acc)}). Na komputerze bez GPS i Wi-Fi przeglądarka zgaduje miejsce z adresu internetowego — często wychodzi np. Warszawa. Wskaż swoje miejsce na mapie albo wybierz, gdzie jesteś.`;

  function drawPlaces() {
    placeMarkers.forEach((m) => m.remove());
    if (!mapaJest()) { placeMarkers = []; return; }
    placeMarkers = S.places.map((pl) => {
      const el = document.createElement("div");
      el.className = "place-pin"; el.title = pl.name;
      el.innerHTML = `${kindBadge(pl.kind)}<span class="place-name">${esc(pl.name)}</span>`;
      el.addEventListener("click", (e) => { e.stopPropagation(); S.openPlace = pl.id; S.tab = "miejsca"; render(); });
      return new maplibregl.Marker({ element: el, anchor: "top" }).setLngLat([pl.lon, pl.lat]).addTo(map);
    });
    updatePlaceLabels();
  }

  // Gdy znacznik miejsca leży na ekranie tuż przy „Tu jesteś”, chowamy jego podpis (ikona zostaje) — liczone w pikselach,
  // bo przy oddalonej mapie nachodzą na siebie także punkty odległe o kilkaset metrów.
  let labelsFrame = 0;
  function updatePlaceLabels() {
    labelsFrame = 0;
    const u = S.userPos && map.project([S.userPos.lon, S.userPos.lat]);
    placeMarkers.forEach((m, i) => {
      const pl = S.places[i];
      const p = u && pl && map.project([pl.lon, pl.lat]);
      m.getElement().classList.toggle("near-me", !!p && Math.abs(p.x - u.x) < 80 && Math.abs(p.y - u.y) < 60);
    });
  }
  przyMapie((m) => m.on("move", () => { if (!labelsFrame) labelsFrame = requestAnimationFrame(updatePlaceLabels); }));

  /* Pozycja: najpierw dokładna (GPS), potem przybliżona (Wi-Fi/sieć) z dłuższym czasem.
     Komputer bez GPS zwykle dostaje tylko przybliżoną — i tylko gdy system ma włączoną lokalizację. */
  function geoOnce(opts) {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      (g) => resolve({ lat: g.coords.latitude, lon: g.coords.longitude, acc: g.coords.accuracy }), reject, opts));
  }

  async function locate() {
    if (!window.isSecureContext) throw new Error("Lokalizacja działa tylko na stronie https albo localhost.");
    if (!navigator.geolocation) throw new Error("Ta przeglądarka nie udostępnia lokalizacji.");
    try {
      return await geoOnce({ enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 });
    } catch (e1) {
      if (e1.code === 1) throw new Error(GEO_HELP[1]);
      try { return await geoOnce({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }); }
      catch (e2) { throw new Error(GEO_HELP[e2.code] || GEO_HELP[2]); }
    }
  }

  /* W Strażniku Grota jest w aplikacji na telefonie — wskazówki o kłódce przy adresie strony i o Windows
     (z samodzielnej wersji przeglądarkowej) nic by tam nie mówiły. */
  const GEO_HELP = MODUL ? {
    1: "Brak zgody na lokalizację. Włącz ją w ustawieniach telefonu: Aplikacje → Strażnik → Uprawnienia → Lokalizacja. Możesz też wybrać, gdzie jesteś, poniżej.",
    2: "Telefon nie ustalił pozycji. Sprawdź, czy lokalizacja jest włączona (szybkie ustawienia u góry ekranu), albo wybierz, gdzie jesteś, poniżej.",
    3: "Ustalanie pozycji trwało zbyt długo. Spróbuj jeszcze raz albo wskaż miejsce na mapie.",
  } : {
    1: "Brak zgody na lokalizację. Kliknij ikonę kłódki przy adresie strony i zezwól na lokalizację. Na komputerze z Windows sprawdź też: Ustawienia → Prywatność i zabezpieczenia → Lokalizacja (włączona, także dla przeglądarki).",
    2: "Urządzenie nie ustaliło pozycji. Komputer bez GPS korzysta z sieci Wi-Fi — sprawdź, czy lokalizacja jest włączona w systemie.",
    3: "Ustalanie pozycji trwało zbyt długo. Spróbuj jeszcze raz albo wskaż miejsce na mapie.",
  };

  /* ---------- miejsca ---------- */
  /* Schronienia zapisane do miejsca mają być w zasięgu dojścia. Po przeprowadzce te, które zostały
     w starym mieście, nie są już niczyim schronieniem — trzymanie ich kończy się „155 km" na karcie.
     Próg jest luźny: poprawka adresu w obrębie tej samej okolicy niczego nie kasuje. */
  const DALEKIE_SCHRONIENIE_M = 3000;

  const schronieniaWTyle = (pl, pos) => pl.shelters.filter((id) => {
    const p = S.byId.get(id);
    return p && C.distanceM(pos.lat, pos.lon, p.lat, p.lon) > DALEKIE_SCHRONIENIE_M;
  });

  function movePlace(pl, pos, extra = {}) {
    const wTyle = schronieniaWTyle(pl, pos);
    if (wTyle.length) {
      const ile = wTyle.length;
      const ileTras = pl.routes ? wTyle.filter((id) => pl.routes[id]).length : 0;
      const najblizsze = Math.min(...wTyle.map((id) => {
        const p = S.byId.get(id); return C.distanceM(pos.lat, pos.lon, p.lat, p.lon);
      }));
      const zgoda = confirm(`Nowe położenie miejsca „${pl.name}” jest daleko od zapisanych tu schronień `
        + `(najbliższe ${fmtDist(najblizsze)} stąd).

`
        + `${ile === 1 ? "To schronienie zostanie usunięte" : `Zapisane schronienia (${ile}) zostaną usunięte`} z tego miejsca`
        + `${ileTras ? `, razem z ${ileTras === 1 ? "nagraną trasą" : `nagranymi trasami (${ileTras})`}` : ""}. `
        + `Punkty zostają na mapie — do nowego adresu wybierzesz schronienia na nowo.

Zmienić położenie?`);
      if (!zgoda) { render(); return; }
      pl.shelters = pl.shelters.filter((id) => !wTyle.includes(id));
      if (pl.routes) for (const id of wTyle) delete pl.routes[id];
      if (S.route?.own && wTyle.includes(S.route.id)) { S.route = null; drawRoute(); }
      // Notatkę „moje miejsce w tym budynku" zostawiamy — to tekst użytkownika — ale dotyczy starego
      // budynku, więc przestaje być sprawdzona.
      if (pl.spotChecked) pl.spotChecked = false;
    }
    Object.assign(pl, { lat: pos.lat, lon: pos.lon }, extra);
    savePlaces();
    map.flyTo({ center: [pos.lon, pos.lat], zoom: extra.approx ? 14 : 17 });
    render();
  }

  function savePlaces() { writeLS(PLACES_KEY, S.places); drawPlaces(); }
  function guessKind(name) {
    const n = name || "";
    return /przedszk|żłob|zlob/i.test(n) ? "przedszkole" : /szko|uczel|studia|liceum|technikum/i.test(n) ? "szkola"
      : /prac|biur|firm|zakład|zaklad/i.test(n) ? "praca" : /działk|dzialk|domek|altan/i.test(n) ? "dzialka"
      : /mam|tat|rodzic|babc|dziad|brat|siostr|teści|tesci/i.test(n) ? "bliscy" : /dom|mieszk/i.test(n) ? "dom" : "inne";
  }

  function addPlace(name, pos, kind, extra = {}) {
    const k = kind || guessKind(name);
    const pl = { id: "m" + Date.now(), name: name || P.PLACE_KINDS[k].label, kind: k, spot: "", spotChecked: false, lat: pos.lat, lon: pos.lon, mode: S.mode, shelters: [], ...extra };
    S.places.push(pl); S.openPlace = pl.id; S.editPlace = null; S.adding = null; S.newName = ""; savePlaces(); S.tab = "miejsca";
    map.flyTo({ center: [pos.lon, pos.lat], zoom: 14 });
  }

  /* ---------- widoki ---------- */
  // kolor paska przy cytacie zależy od działu poradnika — łatwiej odróżnić zalecenia o tej samej nazwie
  const RULE_COLORS = { "atak-z-powietrza": "#dc2626", schronienia: "#16a34a", ewakuacja: "#2563eb",
    "sygnaly-alarmowe-i-komunikaty-ostrzegawcze": "#d97706", "przygotuj-swoje-otoczenie": "#7c3aed", "plan-na-kryzys": "#0f766e" };

  const duzaLitera = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function rule(id, alert = false, wSekcji = false) {
    const r = C.RULES[id];
    const naglowek = wSekcji && r.temat
      ? esc(duzaLitera(r.temat))
      : `${esc(r.title)}${r.temat ? ` <span class="rule-temat">— ${esc(r.temat)}</span>` : ""}`;
    return `<div class="rule${alert ? " alert" : ""}" style="--rc:${RULE_COLORS[r.slug] || "var(--accent)"}">
      <b>${naglowek}</b>„${esc(r.text)}”
      <div class="src"><a href="${esc(P.url(r.slug))}" target="_blank" rel="noopener">„Poradnik bezpieczeństwa”, s. ${esc(r.page)}</a></div></div>`;
  }

  // Miejsce w budynku zapisane przez użytkownika — jego własna notatka, nie zalecenie Groty.
  function spotCard(pl, alert = false) {
    if (!pl.spot) return "";
    return `<div class="card${alert ? " sel" : ""}"><b>${esc(pl.name)}: moje miejsce w budynku</b>
      <p>${esc(pl.spot)}</p>
      <p class="small ${pl.spotChecked ? "trust-ok" : "trust-uwaga"}">${pl.spotChecked ? "Sprawdzone przez Ciebie." : "Jeszcze nie sprawdzone na miejscu."}</p></div>`;
  }

  /* Trzy poziomy zamiast samej liczby: czerwony, póki listy praktycznie nie ma, żółty w trakcie,
     zielony dopiero przy komplecie. Stan przygotowania ma być widoczny, a nie do policzenia w głowie. */
  const PROG_ZOLTY = 0.4;
  const poziomListy = (done, ile) => (!ile ? "pusta" : done >= ile ? "pelna" : done / ile < PROG_ZOLTY ? "pusta" : "wpol");

  function checklist(id, compact = false) {
    const L = P.CHECKLISTS.find((x) => x.id === id); if (!L) return "";
    const done = L.items.filter((_, i) => S.prep[`${id}:${i}`]).length;
    const open = compact || S.openList === id;
    return `<div class="card lista-${poziomListy(done, L.items.length)}${open && !compact ? " sel" : ""}">
      <div class="row"><b class="grow">${esc(L.title)}</b><span class="badge lista-licznik">${done}/${L.items.length}</span>
        ${compact ? "" : `<button class="btn ghost" data-act="toggle-list" data-id="${esc(id)}">${open ? "Zwiń" : "Otwórz"}</button>`}</div>
      ${open ? `${L.intro ? `<p class="small muted">„${esc(L.intro)}”</p>` : ""}
        ${L.items.map((t, i) => `<label class="chk chk-lista" style="margin:6px 0"><input type="checkbox" data-act="prep" data-key="${esc(id)}:${i}"${S.prep[`${id}:${i}`] ? " checked" : ""}><span>„${esc(t)}”</span></label>`).join("")}
        <div class="src small muted"><a href="${esc(P.url(L.slug))}" target="_blank" rel="noopener">„Poradnik bezpieczeństwa”, s. ${esc(L.page)}</a></div>` : ""}
    </div>`;
  }


  function addToPlace(p) {
    if (!S.places.length) return "";
    return `<div class="add-to"><span class="small muted">Zapisz jako schronienie dla:</span><div class="chips">${S.places.map((pl) => {
      const has = pl.shelters.includes(p.id), full = !has && pl.shelters.length >= 3;
      return `<button type="button" class="chip${has ? " on" : ""}" data-act="toggle-shelter" data-place="${esc(pl.id)}" data-id="${esc(p.id)}"${full ? " disabled title=\"To miejsce ma już 3 schronienia\"" : ""}>
        ${kindBadge(pl.kind, "sm")}${esc(pl.name)}${has ? I("check", "chip-check") : ""}</button>`;
    }).join("")}</div></div>`;
  }

  function shelterCard(p, o = {}) {
    const acc = C.ACCESS[p.dostep] || C.ACCESS.nieznany;
    const t = C.trustLabel(p);
    const mode = o.mode || S.mode;
    const from = o.origin || S.userPos || o.distFrom;
    const dist = from ? C.distanceM(from.lat, from.lon, p.lat, p.lon) : null;
    return `<div class="card${o.sel ? " sel" : ""}">
      <div class="row"><div class="grow"><b>${esc(p.adres)}</b><div class="muted small">gm. ${esc(p.gmina)} · ${esc(p.id)}</div></div>
        ${o.num ? `<span class="badge">${o.num}</span>` : ""}</div>
      ${objectLine(p)}
      <p><span class="badge b${esc(p.dostep)}">${esc(acc.label)}</span> <span class="muted small">${esc(acc.note)}</span></p>
      ${o.notePlace ? `<label class="small muted" for="note-${esc(o.notePlace.id)}-${esc(p.id)}">${I("key-round")} Jak wejść — godziny, kto otwiera, kontakt do zarządcy (Twoja notatka) ${saveState(`note-${o.notePlace.id}-${p.id}`)}</label>
        <textarea id="note-${esc(o.notePlace.id)}-${esc(p.id)}" data-note-place="${esc(o.notePlace.id)}" data-note-id="${esc(p.id)}" rows="2" style="width:100%"
          placeholder="np. administrator osiedla, tel. …; otwarte 7–15">${esc(o.notePlace.access?.[p.id] || "")}</textarea>
        ${recBlock(o.notePlace, p)}` : ""}
      ${dist != null ? `<p>${fmtDist(dist)} ${o.origin || (!S.userPos && o.distFrom) ? "od miejsca" : "od Ciebie"} · ${esc(C.MODES[mode].label.toLowerCase())}: ${estText(C.estimateMin(dist, mode))}</p>` : ""}
      <p class="small trust-${t.level}">${esc(t.text)}</p>
      ${C.flagMessages(p).length ? notkaOBledach() : ""}
      ${o.photo === false ? "" : `<figure class="ortho"><img loading="lazy" alt="Zdjęcie z góry okolicy punktu" src="${esc(C.orthoUrl(p))}" onerror="this.closest('figure').classList.add('err')"><span class="ortho-dot"></span>
        <figcaption>Zdjęcie z góry, ok. 140 m szerokości · punkt w środku · ortofotomapa GUGiK</figcaption></figure>`}
      <div class="row">
        <a class="btn" target="_blank" rel="noopener" href="${esc(C.directionsUrl(p, mode, o.origin || navOrigin()))}">${o.origin ? "Przećwicz trasę" : "Prowadź"}</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="${esc(svUrl(p))}">Street View</a>
        ${o.extra || ""}
      </div>
      ${o.trasa ? `<button class="btn ghost szeroki" data-act="rysuj-trase" data-id="${esc(p.id)}"${S.rysujeTrase ? " disabled" : ""}>
          ${I("route")}${S.rysujeTrase ? "Ustalam pozycję…" : "Narysuj trasę tutaj, na mapie Groty"}</button>
        <p class="small muted">„Prowadź" otwiera nawigację w telefonie. Bez internetu albo bez tej aplikacji nawigacja nie ruszy —
          wtedy ten guzik rysuje trasę orientacyjną na mapie Groty, z tego, co telefon ma u siebie.</p>
        ${S.trasaBlad ? `<p class="sim">${esc(S.trasaBlad)}</p>` : ""}
        ${routeInfo(p)}` : ""}
      ${o.after || ""}
    </div>`;
  }

  const ACCESS_ITEMS = [["24h", "Całodobowo"], ["godziny", "W godzinach"], ["na_zadanie", "Na żądanie"]];
  const TRUST_ITEMS = [[0, "Sprawdzone", "#94a3b8"], [1, "Do sprawdzenia", "#d97706"], [2, "Wątpliwe", "#dc2626"]];

  /* Część szpilek w zbiorze PSP stoi obok budynku, a pojedyncze poza miejscowością z adresu. To błąd
     źródła, powielany przez każdego, kto ten zbiór przetwarza — mówimy o tym wprost przy punkcie,
     przy filtrze i w „Zasadach", zamiast po cichu przesuwać punkty albo je chować. */
  let watpliwychIle = null;      // liczymy raz na wczytanie danych, nie przy każdym rysowaniu panelu
  function ileWatpliwych() {
    const c = S.counts && S.counts.trust;
    if (c && c[2]) return c[2];
    if (watpliwychIle == null) watpliwychIle = S.points.reduce((n, p) => n + (C.isDoubtful(p) ? 1 : 0), 0);
    return watpliwychIle;
  }

  function notkaOBledach(otwarta = false) {
    const ile = `${ileWatpliwych().toLocaleString("pl-PL")} z ${S.points.length.toLocaleString("pl-PL")}`;
    return `<details class="bledy small"${otwarta ? " open" : ""}>
      <summary>Skąd biorą się przesunięte punkty?</summary>
      <p>Adresy i współrzędne pochodzą z publicznego zbioru Komendy Głównej PSP — tego samego, z którego korzystają
      inne aplikacje i serwisy. ${ile} punktów ma oznaczone wątpliwe położenie: najczęściej szpilka stoi obok budynku —
      na podwórku, parkingu albo trawniku — rzadziej wskazuje miejsce poza miejscowością z adresu albo w innej gminie.
      <b>To błąd w danych źródłowych</b> i w tym, jak są dalej przetwarzane — nie w Grocie.</p>
      <p>Grota takich punktów nie przesuwa po cichu ani nie ukrywa: oznacza je obwódką, nie poleca jako pierwszych
      i pisze, co stoi najbliżej szpilki. Szukaj w terenie tego budynku, nie samej szpilki.</p>
    </details>`;
  }

  // krótkie podsumowanie na przycisku: ile punktów widać i jakim środkiem liczymy czas
  function filterSummary() {
    const F = S.filter, gr = activeGroups(F.grupy);
    const all = F.dostep.length === ACCESS_ITEMS.length && F.trust.length === TRUST_ITEMS.length && gr.length === ALL_GROUPS.length;
    const vis = all ? S.points.length : visibleCount();
    return `<span class="small muted">${vis.toLocaleString("pl-PL")} pkt · ${esc(C.MODES[S.mode].label.split(" /")[0].toLowerCase())}</span>`;
  }

  function legendFilter() {
    const F = S.filter, c = S.counts || { dostep: {}, trust: {}, grupa: {} };
    const all = F.dostep.length === 3 && F.trust.length === 3 && !F.grupy;
    const topAll = F.dostep.length === 3 && F.trust.length === 3;
    const gr = activeGroups();
    const fmt = (x) => (x || 0).toLocaleString("pl-PL");
    const vis = visibleCount();
    return `<div class="filter">
      <div class="filter-head"><span class="small muted">Pokaż na mapie</span>
        <button type="button" class="chip${topAll ? " on" : ""}" data-act="filter-all" aria-pressed="${topAll}">Pokaż wszystkie</button></div>
      <div class="filter-row">${ACCESS_ITEMS.map(([k, label]) => `<button type="button" class="fchip${F.dostep.includes(k) ? " on" : ""}" data-act="filter" data-group="dostep" data-val="${k}" aria-pressed="${F.dostep.includes(k)}">
        <i style="background:${ACCESS_COLORS[k]}"></i><span>${label}</span><small>${fmt(c.dostep[k])}</small></button>`).join("")}</div>
      <div class="filter-row">${TRUST_ITEMS.map(([k, label, color]) => `<button type="button" class="fchip${F.trust.includes(k) ? " on" : ""}" data-act="filter" data-group="trust" data-val="${k}" aria-pressed="${F.trust.includes(k)}">
        <i class="ring" style="border-color:${color}"></i><span>${label}</span><small>${fmt(c.trust[k])}</small></button>`).join("")}</div>
      ${notkaOBledach()}
      <div class="filter-head filter-sub"><span class="small muted">Rodzaj budynku (wg OpenStreetMap)</span>
        <button type="button" class="chip${F.grupy ? "" : " on"}" data-act="filter-groups-all" aria-pressed="${!F.grupy}">Pokaż wszystkie</button></div>
      <div class="type-row">${TYPE_GROUPS.map(([k, label, icon]) => `<button type="button" class="tchip${gr.includes(k) ? " on" : ""}" data-act="filter-group" data-val="${k}" aria-pressed="${gr.includes(k)}" title="${esc(label)}">
        ${I(icon)}<span>${esc(label)}</span><small>${fmt(c.grupa[k])}</small></button>`).join("")}</div>
      <p class="small muted">Każdy przycisk włącza lub wyłącza swoją grupę. „Pokaż wszystkie” zaznacza wszystko, a naciśnięte ponownie — odznacza.</p>
      <p class="small muted">${all ? "Widać wszystkie punkty." : vis ? `Widać ${fmt(vis)} z ${fmt(S.points.length)} punktów.` : "<b>Nic nie jest zaznaczone — mapa nie pokazuje żadnego punktu.</b>"} Filtr dotyczy tylko mapy — „Teraz” zawsze szuka wśród wszystkich sprawdzonych punktów.</p>
    </div>`;
  }

  function viewMapa() {
    const p = S.selectedId && S.byId.get(S.selectedId);
    const n = S.points.length;
    return `${p ? `<div class="sel-point">
        <div class="row"><b class="grow">Wybrany punkt</b>
          <button class="btn ghost place-btn icon-only" data-act="clear-sel" title="Zamknij" aria-label="Zamknij kartę punktu">${I("x")}</button></div>
        ${shelterCard(p, { sel: true, trasa: true, after: addToPlace(p) })}
      </div>` : ""}
      ${S.dataError ? `<p class="sim">${esc(S.dataError)}</p>` : ""}
      ${S.infoSchrony ? `<div class="card info-card">
        <div class="row"><b class="grow">Czemu nie ma tu „schronów”?</b>
          <button class="btn ghost place-btn icon-only" data-act="info-off" title="Zamknij" aria-label="Zamknij informację">${I("x")}</button></div>
        <p class="small">Publiczne dane PSP nie rozróżniają schronu, ukrycia i miejsca doraźnego schronienia — pełna ewidencja (CEOZO)
        z mocy ustawy nie jest informacją publiczną.</p>
        <button class="btn ghost" data-act="info-more">${I("book-open")}Wyjaśnienie i źródła</button>
      </div>` : ""}
      <div class="row map-bar">
        <button type="button" class="btn ghost grow map-tools-btn" data-act="map-tools" aria-expanded="${S.mapToolsOpen}">
          ${I("sliders-horizontal")}<span class="grow">Filtry i widok</span>${filterSummary()}${I(S.mapToolsOpen ? "chevron-up" : "chevron-down")}</button>
      </div>
      ${S.mapToolsOpen ? `${n ? legendFilter() : ""}
        <h3>Środek transportu</h3>${modeButtons()}
        ${S.mode === "driving" ? rule("P-AUTO") : ""}
        <p class="muted small">Źródło: ${esc(S.meta?.zrodlo || "")}; dane z ${esc(S.meta?.data_danych || "")}. Dane nie zawierają liczby miejsc ani rodzaju obiektu (schron / ukrycie / miejsce doraźne).</p>`
        : `<p class="muted small">${n ? "Dotknij punktu na mapie — jego karta pojawi się tutaj." : "Wczytuję dane…"}</p>`}`;
  }

  /* Pola tekstowe zapisują się same: pół sekundy po ostatnim znaku i w chwili opuszczenia pola.
     Był przy nich przycisk „Zapisz”, ale niczego nie dodawał — użytkownicy brali go za zatwierdzenie
     sąsiedniego pola wyboru. Potwierdzeniem jest wskaźnik przy nagłówku. */
  function saveState(field) {
    const f = S.savedFlash;
    return `<span class="save-state" id="st-${esc(field)}">${f && f.field === field && Date.now() - f.at < 4000 ? `${I("check")}Zapisano` : ""}</span>`;
  }

  function placeSummary(pl, saved) {
    return `${esc(P.PLACE_KINDS[pl.kind]?.label || "")} · schronienia: ${saved.length}/3${pl.routes && Object.keys(pl.routes).length ? ` · nagrane trasy: ${Object.keys(pl.routes).length}` : ""} · ${esc(C.MODES[pl.mode].label)}`;
  }

  // Szczegóły miejsca (po dotknięciu kafla): wszystko, co zapisano — bez wchodzenia w edycję.
  function placeDetails(pl, saved) {
    const F = S.pickFilter;
    const near = C.nearest(pointsFor(F.dostep, F.grupy), pl.lat, pl.lon, { limit: 8, mode: pl.mode });
    const byAccess = nearestByAccess(pl.lat, pl.lon, F.grupy, pl.mode);
    const where = pl.addr ? esc(pl.addr) : "wskazane na mapie";
    return `<div class="place-details">
      <dl class="kv">
        <dt>Położenie</dt><dd>${where}${pl.approx ? ` <span class="trust-uwaga small">(przybliżone — popraw w „Edytuj”)</span>` : ""}</dd>
        <dt>Moje miejsce w budynku</dt><dd>${pl.spot ? `${esc(pl.spot)} <span class="small ${pl.spotChecked ? "trust-ok" : "trust-uwaga"}">${pl.spotChecked ? "· sprawdzone" : "· jeszcze nie sprawdzone"}</span>` : `<span class="muted">nie zapisano</span>`}</dd>
        <dt>Środek transportu</dt><dd>${esc(C.MODES[pl.mode].label)}</dd>
      </dl>
      <div class="row">
        <button class="btn ghost" data-act="edit-place" data-id="${esc(pl.id)}">${I("pencil")}Edytuj dane miejsca</button>
        <button class="btn ghost" data-act="place-on-map" data-id="${esc(pl.id)}">${I("map-pin")}Pokaż na mapie</button></div>

      <h3>Moje miejsca schronienia (${saved.length}/3)</h3>
      ${saved.length ? saved.map((p) => shelterCard(p, { origin: pl, mode: pl.mode, notePlace: pl, extra: `<button class="btn ghost" data-act="unsave" data-place="${esc(pl.id)}" data-id="${esc(p.id)}">Usuń z listy</button>` })).join("")
        : `<p class="muted">Wybierz do trzech poniżej i przećwicz drogę — poradnik zaleca iść „ustaloną wcześniej drogą” (s. 34).</p>`}

      <h3>Wybierz miejsca schronienia</h3>
      ${accessFilterBar({ F, near: byAccess, prefix: "pf", typesOpen: S.pickTypesOpen, title: "Pokaż punkty",
        note: "Filtr włączony — lista pokazuje tylko zaznaczone punkty. Odległości przy przyciskach liczone są od tego miejsca." })}
      ${near.length ? near.map((c) => {
        const t = C.trustLabel(c.p), has = pl.shelters.includes(c.p.id);
        return `<label class="chk card pick${has ? " sel" : ""}"><input type="checkbox" data-act="save" data-place="${esc(pl.id)}" data-id="${esc(c.p.id)}"${has ? " checked" : ""}${!has && pl.shelters.length >= 3 ? " disabled" : ""}>
          <span class="grow"><b>${esc(c.p.adres)}</b><br><span class="small">${fmtDist(c.distM)} · ${estText(c.estMin)} · <span class="badge b${esc(c.p.dostep)}">${esc(C.ACCESS[c.p.dostep].label)}</span>${c.p.obiekt && c.p.obiekt.kod !== "budynek" ? ` · ${esc(c.p.obiekt.nazwa || c.p.obiekt.etykieta)}` : ""}</span>
          <br><span class="small trust-${t.level}">${esc(t.text)}</span></span></label>`;
      }).join("") : `<p class="sim">Brak punktów spełniających filtr w pobliżu. Zaznacz więcej rodzajów powyżej.</p>`}
    </div>`;
  }

  // Edycja danych miejsca — tylko pola, bez list schronień.
  function placeEdit(pl) {
    const id = esc(pl.id);
    return `<div class="place-details">
      <h3>Nazwa ${saveState(`place-name-${pl.id}`)}</h3>
      <input type="text" id="place-name-${id}" data-autosave value="${esc(pl.name)}" style="width:100%" enterkeyhint="done">
      <h3>Położenie</h3>
      ${pl.approx ? `<p class="sim">Położenie przybliżone${pl.addr ? ` („${esc(pl.addr)}”)` : ""} — wpisz dokładny adres albo wskaż budynek na mapie.</p>`
        : pl.addr ? `<p class="small muted">${I("map-pin")} ${esc(pl.addr)}</p>` : ""}
      ${addrBox("Nowy adres", "edit")}
      <div class="row" style="margin-top:6px">
        <button class="btn ghost" data-act="place-move-gps" data-id="${id}">${I("locate-fixed")}Moja pozycja</button>
        <button class="btn ghost" data-act="place-move-map" data-id="${id}">${I("map-pin")}Wskaż na mapie</button></div>
      ${S.pick?.purpose === "move" && S.pick.id === pl.id ? `<p class="sim">Kliknij na mapie nowe położenie miejsca „${esc(pl.name)}”.</p>` : ""}
      <h3>Rodzaj miejsca</h3>
      ${kindPicker(pl.kind, `data-act="place-kind" data-id="${id}"`)}
      <h3>Moje miejsce w tym budynku ${saveState(`place-spot-${pl.id}`)}</h3>
      ${P.PLACE_KINDS[pl.kind]?.rule ? rule(P.PLACE_KINDS[pl.kind].rule) : rule("P-POZA-DOMEM")}
      <textarea id="place-spot-${id}" data-autosave rows="2" style="width:100%" placeholder="Twoja notatka, np. „korytarz na parterze, bez okien”">${esc(pl.spot)}</textarea>
      <label class="chk small"><input type="checkbox" id="place-spotok-${id}"${pl.spotChecked ? " checked" : ""}> Sprawdziłem to miejsce na miejscu</label>
      ${P.PLACE_KINDS[pl.kind]?.checklist ? checklist(P.PLACE_KINDS[pl.kind].checklist, true) : ""}
      <h3>Środek transportu z tego miejsca</h3>${modeButtons(pl.mode, pl.id)}
      ${pl.mode === "driving" ? rule("P-AUTO") : ""}
      <div class="row" style="margin-top:12px"><button class="btn" data-act="edit-done" data-id="${id}">${I("check")}Gotowe</button></div>
    </div>`;
  }

  function viewMiejsca() {
    const list = S.places.map((pl) => {
      const open = S.openPlace === pl.id, edit = S.editPlace === pl.id;
      const saved = pl.shelters.map((id) => S.byId.get(id)).filter(Boolean);
      return `<div class="card place-card${open ? " sel" : ""}" data-id="${esc(pl.id)}">
        <div class="row place-head">${S.places.length > 1 ? `<button type="button" class="drag-handle" data-id="${esc(pl.id)}"
            title="Przeciągnij, aby zmienić kolejność" aria-label="Zmień kolejność: ${esc(pl.name)} (strzałki w górę i w dół)">${I("grip-vertical")}</button>` : ""}
          <button type="button" class="place-open grow" data-act="open-place" data-id="${esc(pl.id)}" aria-expanded="${open}">
            ${kindBadge(pl.kind, "lg")}<span class="grow"><b>${esc(pl.name)}</b><span class="small muted">${placeSummary(pl, saved)}</span></span>${I(open ? "chevron-up" : "chevron-down")}</button>
          <button class="btn ${edit ? "" : "ghost "}place-btn icon-only" data-act="edit-place" data-id="${esc(pl.id)}" title="Edytuj" aria-label="Edytuj ${esc(pl.name)}">${I("pencil")}</button>
          <button class="btn ghost place-btn danger-ghost icon-only" data-act="del-place" data-id="${esc(pl.id)}" title="Usuń miejsce" aria-label="Usuń miejsce ${esc(pl.name)}">${I("trash-2")}</button></div>
        ${open ? (edit ? placeEdit(pl) : placeDetails(pl, saved)) : ""}
      </div>`;
    }).join("");
    const used = new Set(S.places.map((pl) => pl.kind));
    const A = S.adding;
    return `<h2>Moje stałe miejsca</h2>
      ${rule("P-DEKALOG")}
      <p class="muted small">Miejsca są zapisywane tylko na tym urządzeniu. Dotknij miejsca, aby zobaczyć szczegóły.${S.places.length > 1 ? " Kolejność zmienisz, przeciągając kafel za uchwyt ⋮⋮." : ""}</p>
      ${list ? `<div class="place-list">${list}</div>` : `<p class="muted">Nie masz jeszcze zapisanych miejsc — dodaj dom, pracę albo szkołę dziecka poniżej.</p>`}
      <div class="card add-place">
        <h3>Dodaj miejsce</h3>
        <p class="small muted">Wybierz rodzaj. Pełny kolor — takie miejsce już masz.</p>
        <div class="kinds add">${Object.entries(P.PLACE_KINDS).map(([k, v]) =>
          `<button type="button" data-act="add-kind" data-kind="${k}" class="${used.has(k) ? "used" : ""}${A === k ? " on" : ""}" style="--kc:${kindLook(k).color}" aria-expanded="${A === k}">${kindBadge(k)}<span>${esc(v.label)}</span></button>`).join("")}</div>
        ${A ? `<div class="add-form">
          <h3>Nowe miejsce: ${esc(P.PLACE_KINDS[A].label)}</h3>
          <label class="small muted" for="new-place-name">Nazwa</label>
          <div class="row"><input type="text" id="new-place-name" placeholder="${esc(P.PLACE_KINDS[A].label)}" value="${esc(S.newName)}" class="grow"></div>
          ${addrBox("Adres miejsca", "place")}
          <p class="small muted" style="margin:8px 0 4px">albo</p>
          <div class="row">
            <button class="btn ghost" data-act="place-gps">${I("locate-fixed")}Moja pozycja</button>
            <button class="btn ghost" data-act="place-map">${I("map-pin")}Wskaż na mapie</button>
            <button class="btn ghost" data-act="add-cancel">Anuluj</button></div>
          ${S.pick?.purpose === "place" ? `<p class="sim">Kliknij na mapie położenie miejsca „${esc(S.pick.name || P.PLACE_KINDS[S.pick.kind || "inne"].label)}”.</p>` : ""}
        </div>` : ""}
      </div>`;
  }

  const MODE_ICONS = { walking: "footprints", bicycling: "bike", driving: "car" };

  function kindPicker(current, attrs) {
    return `<div class="kinds">${Object.entries(P.PLACE_KINDS).map(([k, v]) =>
      `<button type="button" ${attrs} data-kind="${k}" class="${k === current ? "on" : ""}" style="--kc:${kindLook(k).color}">${kindBadge(k)}<span>${esc(v.label)}</span></button>`).join("")}</div>`;
  }

  // placeId: wybór dla zapisanego miejsca; bez niego — ustawienie ogólne (Teraz, Mapa)
  function modeButtons(current = S.mode, placeId = null) {
    const attrs = placeId ? `data-act="place-mode" data-id="${esc(placeId)}"` : `data-act="mode"`;
    return `<div class="seg" role="radiogroup" aria-label="Środek transportu">${Object.entries(C.MODES).map(([k, m]) =>
      `<button type="button" ${attrs} data-mode="${k}" class="${k === current ? "on" : ""}" role="radio" aria-checked="${k === current}" title="${esc(m.label)}">${I(MODE_ICONS[k])}<span>${esc(m.label.split(" /")[0])}</span></button>`).join("")}</div>`;
  }

  /* Start trasy w Google Maps. Gdy pozycja pochodzi z GPS — bez punktu startowego (Google Maps użyje
     bieżącej lokalizacji telefonu i od razu włączy nawigację). Gdy wpisano adres, wybrano zapisane miejsce
     albo wskazano punkt na mapie — przekazujemy go, inaczej Google liczy trasę od złej pozycji. */
  const navOrigin = () => (S.userPos && S.posLabel ? S.userPos : null);

  /* Skąd otworzyć Street View: jeśli mamy wyznaczoną trasę do tego punktu, bierzemy miejsce na niej ~20 m
     przed celem (czyli z ulicy). Bez trasy zostaje sam punkt — wtedy Google czasem pokaże wnętrze lokalu. */
  function svUrl(p) {
    const R = S.route;
    const from = R && R.id === p.id && R.coords?.length > 1 ? C.pointBeforeEnd(R.coords, 20) : null;
    return C.streetViewUrl(p, { from });
  }

  function mainOption(c) {
    const p = c.p, acc = C.ACCESS[p.dostep] || C.ACCESS.nieznany, t = C.trustLabel(p);
    const recznie = S.wybraneRecznie === p.id;
    return `<div class="card main-opt">
      <div class="muted small">${recznie ? "Wybrane przez Ciebie miejsce schronienia" : "Najbliższe sprawdzone miejsce schronienia"}</div>
      <div class="big-addr">${esc(p.adres)}</div>
      ${(() => { const d = dojscie(c); return `<div class="row"><b>${fmtDist(d.distM)}</b><span>· ${d.zTrasy ? `ok. ${d.min} min trasą` : estText(c.estMin)}</span><span class="badge b${esc(p.dostep)}">${esc(acc.label)}</span></div>`; })()}
      ${objectLine(p)}
      ${routeInfo(p)}
      <a class="btn go" target="_blank" rel="noopener" href="${esc(C.directionsUrl(p, S.mode, navOrigin()))}">PROWADŹ ➜</a>
      <figure class="ortho"><img loading="lazy" alt="Zdjęcie z góry okolicy punktu" src="${esc(C.orthoUrl(p))}" onerror="this.closest('figure').classList.add('err')"><span class="ortho-dot"></span>
        <figcaption>Zdjęcie z góry · punkt w środku · ortofotomapa GUGiK</figcaption></figure>
      <p class="small muted">${esc(acc.note)} <span class="trust-${t.level}">${esc(t.text)}</span></p>
      ${C.flagMessages(p).length ? notkaOBledach() : ""}
      <div class="row"><a class="btn ghost" target="_blank" rel="noopener" href="${esc(svUrl(p))}">Street View</a>
        <button class="btn ghost" data-act="show-on-map" data-id="${esc(p.id)}">Pokaż na mapie</button></div>
    </div>`;
  }

  function otherOption(c, i) {
    const p = c.p, acc = C.ACCESS[p.dostep] || C.ACCESS.nieznany;
    const on = S.route?.id === p.id;
    return `<div class="card other-opt${on ? " sel" : ""}"><div class="row">
      <button type="button" class="opt-open grow" data-act="wybierz-opcje" data-id="${esc(p.id)}"
        aria-label="Wybierz to miejsce: ${esc(p.adres)}">
        <span class="badge">${i + 2}</span>
        <span class="grow"><b>${esc(p.adres)}</b><span class="small muted">${fmtDist(c.distM)} · ${estText(c.estMin)} · ${esc(acc.label)}${p.obiekt && p.obiekt.kod !== "budynek" ? ` · ${esc(p.obiekt.etykieta)}` : ""}</span></span></button>
      <a class="btn" target="_blank" rel="noopener" href="${esc(C.directionsUrl(p, S.mode, navOrigin()))}">Prowadź</a></div>
      ${on ? routeInfo(p) : ""}</div>`;
  }

  // Czym jest obiekt — z OpenStreetMap, nie z danych PSP
  function objectLine(p) {
    const o = p.obiekt;
    if (!o || (o.kod === "budynek" && !o.nazwa)) return "";     // „jakiś budynek” nic nie mówi — nie zaśmiecamy karty
    const named = o.nazwa && o.nazwa !== p.adres;
    return `<p class="obj-line">${I(o.ikona || "building")}<span><b>${esc(named ? o.nazwa : o.etykieta)}</b>
      <span class="small muted">${named ? `${esc(o.etykieta)} · ` : ""}wg OpenStreetMap</span></span></p>`;
  }

  function placeChips() {
    if (!S.places.length) return "";
    return `<div class="chips"><span class="small muted">Jestem w:</span>${S.places.map((pl) =>
      `<button class="chip" data-act="at-place" data-id="${esc(pl.id)}">${kindBadge(pl.kind, "sm")}${esc(pl.name)}</button>`).join("")}</div>`;
  }

  /* Skąd Grota liczy. Po naciśnięciu TERAZ pozycja bierze się z GPS, ale zmiana na zapisane miejsce
     musi być pod ręką — wcześniej ten wybór leżał na samym dole, za całą listą schronień. */
  function skadSzukam() {
    return `<div class="skad">
      <div class="row">
        <button class="btn ghost" data-act="retry-locate">${I("locate-fixed")}Pozycja z GPS</button>
        <button class="btn ghost" data-act="addr-toggle">${I("search")}Wpisz adres</button>
      </div>
      ${placeChips()}
      ${S.addrOpen ? addrBox() : ""}
    </div>`;
  }

  const ADDR_SRC = { gugik: "adres z bazy GUGiK", spis: "środek miejscowości (spis OpenStreetMap)" };

  const ADDR_STATE = { live: "addr", place: "addrPlace", edit: "addrEdit", cel: "addrCel" };

  function addrBox(title = "Wpisz, gdzie jesteś", ctx = "live") {
    const A = S[ADDR_STATE[ctx]];
    const results = A.items ? (A.items.length
      ? `<div class="addr-list">${A.items.map((it, i) => `<button class="addr-item" data-act="addr-pick" data-ctx="${ctx}" data-i="${i}">${I(it.source === "gugik" && it.acc <= 25 ? "map-pin" : "map")}
          <span class="grow"><b>${esc(it.label)}</b><span class="small muted">${esc(it.detail || "")}</span></span></button>`).join("")}</div>`
      : `<p class="small muted">Nic nie znalazłem. Spróbuj: „Miejscowość, ulica numer” albo samą miejscowość.</p>`) : "";
    const note = A.offline ? `<p class="sim">Brak połączenia z wyszukiwarką adresów. Pokazuję miejscowości zapisane w aplikacji — pozycja to środek miejscowości.</p>`
      : A.notFound && A.items?.length ? `<p class="sim">Nie znalazłem tego adresu ani ulicy. Miejscowości o tej nazwie — to tylko środek miejscowości${ctx === "live" ? "" : ", po wyborze popraw położenie na mapie"}:</p>`
      : A.approx && A.items?.length ? `<p class="sim">Dokładnego adresu nie ma w bazie adresów (np. numer mieszkania albo litera). Wyniki są przybliżone${ctx === "live" ? "" : " — po wyborze popraw położenie na mapie"}.</p>` : "";
    return `<form class="addr" data-form="addr" data-ctx="${ctx}"><label class="small muted" for="addr-q-${ctx}">${esc(title)}</label>
      <div class="row"><input type="text" id="addr-q-${ctx}" data-ctx="${ctx}" class="grow addr-q" autocomplete="street-address" enterkeyhint="search"
        placeholder="np. Warszawa, Marszałkowska 100 · Zalesie Górne" value="${esc(A.q)}">
        <button class="btn" type="submit"${A.loading ? " disabled" : ""}>${I("search")}${A.loading ? "Szukam…" : "Szukaj"}</button></div>
      ${note}${results}</form>`;
  }

  function posLine() {
    if (!S.userPos) return "";
    const what = S.posLabel ? esc(S.posLabel) : `GPS${S.userPos.acc ? ` ${fmtAcc(S.userPos.acc)}` : ""}`;
    return `<div class="pos-row"><p class="small muted pos-line">${I("navigation")}Szukam od: <b>${what}</b></p>
      <button type="button" class="btn ghost close-live" data-act="live-close">${I("x")}Zakończ</button></div>`;
  }

  // „Zakończ”: czyści pozycję, trasę i cel z mapy — wraca do zwykłej mapy.
  function liveClose() {
    S.posSeq++;
    S.live = null; S.liveError = null; S.locating = false; S.route = null; S.addrOpen = false;
    S.userPos = null; S.posLabel = null; S.coarse = false; S.addr = { q: "" };
    S.selectedId = null;
    drawRoute();
    userMarker?.remove();
    map.getSource("acc")?.setData({ type: "FeatureCollection", features: [] });
    if (map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], ""]);
    updatePlaceLabels();
    S.tab = "mapa";
    render();
  }

  /* Most do Strażnika. Gdy Grota działa w jego wnętrzu, czasu do zagrożenia NIE liczymy sami —
     bierzemy ten, który Strażnik pokazuje na swoim ekranie. On odejmuje wiek sygnału (po 15 minutach
     nie podaje go wcale) i pomija obiekty o domniemanym kursie. Gdyby Grota wzięła surowe minimum
     z sygnałów, sąsiednie ekrany tej samej aplikacji pokazywałyby różne minuty — a to najgorszy
     rodzaj niezgodności w chwili alarmu. Brak wartości znaczy „nie wiadomo” i tak to mówimy. */
  function przyjmijAlarm(a, rysuj = true) {
    const bylAlarm = !!S.alarm;
    S.alarm = a && typeof a === "object" ? a : null;
    if (S.alarm) S.etaMin = Number.isFinite(S.alarm.etaVoivMin) ? S.alarm.etaVoivMin : null;
    else if (bylAlarm) S.etaMin = null;    // alarm odwołany — nie zostawiamy po nim czasu na ekranie
    if (rysuj) { drawRoute(); render(); }  // kolor trasy idzie za czasem do zagrożenia
  }
  /* Alarm, który trwał już przed wejściem do Groty (wejście z przycisku „Gdzie się schronić”), przyjmujemy
     bez rysowania — reszta Groty jeszcze nie jest gotowa, a render() w tym miejscu wywracał cały start
     (znalezione testem alarmu na emulatorze: Grota zostawała na „Wczytuję punkty… 98%”). Rysuje koniec startu. */
  if (window.straznikAlert) przyjmijAlarm(window.straznikAlert, false);
  window.addEventListener("straznik:alert", (e) => przyjmijAlarm(e.detail || window.straznikAlert));

  const zeStraznika = () => !!S.alarm;
  // Strażnik publikuje stan także przy spokoju (`level: "none"`, `hard: false`) — to nie jest alarm.
  const alarmTrwa = () => !!S.alarm && S.alarm.level && S.alarm.level !== "none";

  /* `hard` mówi, czy poziom alarmu utrzymuje się po odjęciu źródeł miękkich — czyli czy stoi
     na oficjalnym alercie RCB/RSO albo na obiekcie w powietrzu. Tylko wtedy Grota wzywa do
     schronienia. Przy źródłach pośrednich pokazuje to samo co zwykle (mapę, odległości, kierunki),
     ale bez ponaglania: decyzję o schronieniu podejmuje się na podstawie komunikatów służb. */
  const wzywacDoSchronienia = () => !alarmTrwa() || S.alarm.hard !== false;

  function notkaOZrodle() {
    if (!alarmTrwa() || S.alarm.hard !== false) return "";
    return `<div class="card"><b>Poziom alarmu opiera się na źródłach pośrednich</b>
      <p class="small">Nie ma teraz oficjalnego alertu RCB ani obiektu w powietrzu nad Polską. Grota pokazuje mapę,
      odległości i kierunki, ale <b>nie wzywa do schronienia</b> — kieruj się komunikatami służb, a jeśli ich nie ma,
      potraktuj to jako sygnał do uważności, nie do biegu.</p></div>`;
  }

  /* Dwa progi ostrzeżenia o odległym celu:
     - twardy: znany czas do zagrożenia (z alarmu albo z symulacji) jest krótszy niż szacowane dojście,
     - miękki: alarmu nie ma, ale dojście przekracza DALEKO_MIN — wtedy tylko „sprawdź, czy zdążysz”.
     Obie oceny są nasze, nie urzędowe — mówimy o tym wprost przy każdym ostrzeżeniu. */
  const DALEKO_MIN = 20;

  let celPozaMapa = false, celSprawdzanyDla = null;   // ustalane asynchronicznie, bo sprawdzenie idzie do bazy w telefonie
  async function sprawdzCelWMapie() {
    if (!S.cel || !S.stanMap?.paczki?.length) { celPozaMapa = false; return; }
    const z = 14, x = O.xT(S.cel.lon, z), y = O.yT(S.cel.lat, z);
    const ma = await O.maKafelek(z, x, y).catch(() => true);
    if (celPozaMapa !== !ma) { celPozaMapa = !ma; render(); }
  }

  function celOcena() {
    if (!S.cel || !S.userPos) return null;
    const distM = C.distanceM(S.userPos.lat, S.userPos.lon, S.cel.lat, S.cel.lon);
    const R = S.route?.id === "cel" && !S.route.loading && !S.route.failed ? S.route : null;
    // Zawsze pokazujemy oba szacunki — sam czas pieszo przy dalekim celu to liczba, która nic nie mówi.
    const pieszo = C.estimateMin(distM, "walking");
    const autem = C.estimateMin(distM, "driving");
    const estMin = R?.durMin ?? C.estimateMin(distM, S.mode);
    const eta = porownujCzas() ? S.etaMin : null;
    let poziom = null;
    if (eta != null) {
      if (autem != null && autem > eta) poziom = "twardy";           // nawet samochodem nie zdążysz
      else if (pieszo != null && pieszo > eta) poziom = "mieszany";  // pieszo nie, samochodem może tak
    } else if (pieszo != null && pieszo > DALEKO_MIN) poziom = "miekki";
    return { distM, estMin, pieszo, autem, eta, poziom, pozaMapa: celPozaMapa };
  }

  const czasy = (o) => `pieszo ok. ${o.pieszo} min · samochodem ok. ${o.autem} min`;

  const ZASTRZEZENIE = `<p class="small muted">To wyliczenie Groty, <b>nieoficjalne</b> — nie zastępuje komunikatów służb.
    Kieruj się w pierwszej kolejności oficjalnymi komunikatami (Alert RCB, RSO, radio, polecenia służb).
    Jeśli ich nie ma, potraktuj to jako podpowiedź.</p>`;

  function celCard() {
    if (S.cel) {
      const klucz = `${S.cel.lat},${S.cel.lon}|${S.stanMap?.kafelkow ?? ""}`;
      if (celSprawdzanyDla !== klucz) { celSprawdzanyDla = klucz; sprawdzCelWMapie(); }
    }
    if (!S.cel) {
      return `<div class="card">
        <div class="row"><b class="grow">Umówione miejsce</b>
          <button class="btn ghost" data-act="cel-open">${I(S.celOpen ? "x" : "map-pin")}${S.celOpen ? "Schowaj" : "Wskaż miejsce"}</button></div>
        <p class="small muted">Jeśli umówiliście się z bliskimi na konkretne miejsce, wpisz je — Grota poprowadzi tam tak samo jak do schronienia i powie, czy zdążysz.</p>
        ${S.celOpen ? addrBox("Adres albo miejscowość miejsca spotkania", "cel") +
          `<button class="btn ghost" data-act="cel-map">${I("map")}Wskaż na mapie</button>` : ""}
      </div>`;
    }
    const o = celOcena(), R = S.route?.id === "cel" ? S.route : null;
    const ostrzezenie = (o?.poziom || (o?.pozaMapa && S.stanMap?.paczki?.length)) && !S.celWarnClosed ? `<div class="warn-box${o.poziom === "twardy" ? "" : " miekki"}">
        <div class="row"><b class="grow">${o.poziom === "twardy"
          ? `To miejsce jest za daleko — ${czasy(o)}, a zagrożenie za ${o.eta} min.`
          : o.poziom === "mieszany" ? `Pieszo nie zdążysz — ok. ${o.pieszo} min przy zagrożeniu za ${o.eta} min. Samochodem ok. ${o.autem} min.`
          : o.poziom === "miekki" ? `To daleko — ${czasy(o)}. Sprawdź, czy zdążysz.`
          : `To miejsce jest poza pobraną mapą.`}</b>
          <button class="btn ghost place-btn icon-only" data-act="cel-warn-close" title="Zamknij" aria-label="Zamknij ostrzeżenie">${I("x")}</button></div>
        ${o.pozaMapa ? `<p class="small">To miejsce jest <b>poza pobraną mapą</b> — bez internetu zobaczysz tam sam kierunek i odległość.</p>` : ""}
        ${alarmTrwa() && o.eta == null ? `<p class="small">Strażnik nie podaje teraz czasu do zagrożenia (sygnały są za stare albo kurs jest niepewny), więc Grota go nie zgaduje — porównaj sam z komunikatami służb.</p>` : ""}
        ${ZASTRZEZENIE}
        ${alarmTrwa() && o.eta != null ? `<p class="small muted">${UWAGA_WIDOCZNE}</p>` : ""}
        <button class="btn ghost" data-act="cel-kroki">${I("book-open")}${S.celKroki ? "Schowaj kroki" : "Co robić teraz"}</button>
        ${S.celKroki ? rule("P-NIE-ZDAZE", true) + rule("P-POZA-DOMEM", true) + (o.poziom === "mieszany" ? rule("P-AUTO") : "") : ""}
      </div>` : "";
    return `<div class="card sel">
      <div class="row"><b class="grow">Umówione miejsce</b>
        <button class="btn ghost place-btn" data-act="cel-clear">${I("trash-2")}Usuń</button></div>
      <p class="cel-adres">${I("map-pin")}<span>${esc(S.cel.label)}</span></p>
      ${o ? `<div class="row"><b>${fmtDist(o.distM)}</b><span class="small">· ${esc(czasy(o))}</span></div>` : `<p class="small muted">Ustal swoją pozycję, żeby poznać odległość.</p>`}
      ${ostrzezenie}
      ${R?.loading ? `<p class="small muted route-info">${I("route")}Wyznaczam wstępną trasę…</p>` : ""}
      ${R && !R.loading && R.failed ? `<p class="small muted route-info">${I("route")}${navigator.onLine === false || O.udaje()
        ? "Bez internetu i bez połączenia w pobranej mapie — na mapie kierunek i odległość w linii prostej."
        : "Nie udało się wyznaczyć trasy (brak sieci?). Na mapie linia prosta."}</p>` : ""}
      ${R && !R.loading && !R.failed && R.coords ? `<p class="route-info">${I("route")}<b>Trasa ${fmtDist(R.distM)} · ok. ${R.durMin} min</b>${R.lokalna ? ` <span class="small muted">— z mapy w telefonie</span>` : ""}</p>` : ""}
      <div class="row">
        <button class="btn ghost" data-act="cel-route"${S.userPos ? "" : " disabled"}>${I("route")}Pokaż trasę</button>
        <a class="btn" href="${esc(C.directionsUrl(S.cel, S.mode, S.userPos))}" target="_blank" rel="noopener">${I("navigation")}Prowadź</a>
      </div>
    </div>`;
  }

  /* ---------- mapy offline ---------- */

  const mb = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1).replace(".", ",")} GB` : x < 10 ? `${x.toFixed(1).replace(".", ",")} MB` : `${Math.round(x)} MB`);

  function punktPaczki() {
    if (S.paczka.zPunktu === "pozycja") return S.userPos;
    return S.places.find((pl) => pl.id === S.paczka.zPunktu) || null;
  }

  /* Spis paczek pobieramy raz na wejście w kartę (żyje dwie minuty, tak jak na serwerze). Bez spisu
     nie wiemy, co jest do pobrania ani ile to waży — wtedy mówimy to wprost, zamiast zgadywać. */
  function wczytajSpis(wymus = false) {
    if (S.spisLaduje) return;
    S.spisLaduje = true; S.spisBlad = null;
    O.spis(wymus)
      .then((s) => { S.spis = s; })
      .catch((e) => { S.spisBlad = String(e.message || e); })
      .finally(() => { S.spisLaduje = false; render(); });
  }

  // Co i skąd pobieramy — z wyboru w karcie. Rozmiar liczy się z samego spisu, przed zgodą człowieka.
  function wyborPaczki() {
    const W = S.paczka, trasy = W.zestaw === "trasy";
    if (W.rodzaj === "promien") {
      const p = punktPaczki();
      if (!p) return null;
      const skad = W.zPunktu === "pozycja" ? "Twojej pozycji" : (S.places.find((x) => x.id === W.zPunktu)?.name || "miejsca");
      return { id: `promien:${p.lat.toFixed(3)},${p.lon.toFixed(3)}:${W.promienKm}`, nazwa: `${W.promienKm} km wokół ${skad}`,
        opcje: { obszary: null, komorki: O.komorkiPromien(p.lat, p.lon, W.promienKm), trasy } };
    }
    if (W.rodzaj === "woj") return W.woj ? { id: `woj:${W.woj}`, nazwa: `województwo ${W.woj}`, opcje: { obszary: [W.woj], komorki: null, trasy } } : null;
    return { id: "polska", nazwa: "cała Polska", opcje: { obszary: null, komorki: null, trasy } };
  }

  const dostepneObszary = () => (S.spis ? Object.keys(S.spis.obszary).sort((a, b) => a.localeCompare(b, "pl")) : []);

  async function odswiezStanMap() {
    S.stanMap = await O.stan().catch(() => null);
    S.zasoby = await O.stanZasobow().catch(() => null);
    render();
  }

  async function pobierzPaczke() {
    const w = wyborPaczki();
    if (!w) { S.pobieranie = { blad: "Najpierw ustal pozycję albo wybierz zapisane miejsce." }; render(); return; }
    S.pobranieWynik = null;
    S.pobieranie = { zrobione: 0, razem: 0, etykieta: w.nazwa, etap: "spis" }; render();
    try {
      const s = await O.spis(true);           // świeży spis tuż przed pobraniem — to on mówi, które paczki są aktualne
      S.spis = s;
      const plan = O.planuj(s, w.opcje);
      if (!plan.czesci.length) throw new Error("Dla tego obszaru nie ma jeszcze mapy do pobrania.");
      // bez stylu, ikon i czcionek pobrane kafelki nie narysują mapy bez sieci
      S.pobieranie = { ...S.pobieranie, etap: "styl" }; render();
      for (const [nazwa, adres] of Object.entries({ jasny: MAP_STYLES.jasna, ciemny: MAP_STYLES.ciemna })) {
        try { await O.pobierzStyl(nazwa, adres); } catch { /* styl dociągniemy przy okazji */ }
      }
      S.pobieranie = { ...S.pobieranie, etap: "mapa", razem: plan.bajty }; render();
      const wynik = await O.pobierzPlan({ id: w.id, nazwa: w.nazwa }, plan, (x) => { S.pobieranie = { ...S.pobieranie, ...x }; render(); });
      S.pobranieWynik = { ...wynik, trasy: plan.trasy };
    } catch (e) {
      S.pobieranie = { blad: String(e.message || e) };
      O.zakoncz();
      await odswiezStanMap();
      return;
    }
    O.zakoncz();
    S.pobieranie = null;
    await odswiezStanMap();
  }

  function testBezSieci(wl) {
    O.ustawUdawanie(wl);
    styleSwitching = false;
    tryOnlineMap();          // przy udawaniu styl powstanie tylko z tego, co pobrane — czyli tak, jak bez zasięgu
    showOfflineBanner();
    render();
  }

  /* Jedna liczba obejmująca wszystko, co poleci przez łącze, i druga — ile to zajmie w telefonie.
     Obie są dokładne: liczone ze spisu paczek, a nie z szacunku na kafelek. */
  function rozmiarPaczki(plan) {
    if (!plan.czesci.length) return "";
    const rozbicie = plan.trasy ? ` (mapa ${mb(plan.mapa / 1e6)} + trasy ${mb(plan.graf / 1e6)})` : "";
    return `<p class="small muted"><b>pobierze ${mb(plan.bajty / 1e6)}</b>${rozbicie} · zajmie w telefonie ok. ${mb(plan.zajmie / 1e6)}.
      To, co już masz w telefonie, nie pobierze się drugi raz.</p>`;
  }

  function paczkiCard() {
    const st = S.stanMap, pob = S.pobieranie, W = S.paczka;
    if (!S.spis && !S.spisBlad && !S.spisLaduje && !O.udaje()) wczytajSpis();
    const maPaczki = st?.paczki?.length;
    const lista = maPaczki ? st.paczki.map((x) => `<li>${esc(x.nazwa)}${x.trasy === false ? " (sama mapa)" : ""} — ${mb((x.bajtow || 0) / 1e6)}, ${esc(x.data)}</li>`).join("") : "";
    const opcja = (rodzaj, etykieta) => `<button type="button" class="chip${W.rodzaj === rodzaj ? " on" : ""}" data-act="paczka-rodzaj" data-val="${rodzaj}">${etykieta}</button>`;
    const obszary = dostepneObszary();
    const w = S.spis ? wyborPaczki() : null;
    const plan = w ? O.planuj(S.spis, w.opcje) : null;
    let wybor = "";
    if (S.spisLaduje && !S.spis) {
      wybor = `<p class="small muted">Sprawdzam, jakie mapy są do pobrania…</p>`;
    } else if (!S.spis) {
      wybor = `<p class="sim">${esc(S.spisBlad || "Bez internetu nie sprawdzę, jakie mapy są do pobrania.")}</p>
        <button class="btn ghost" data-act="paczka-spis">${I("refresh-cw")}Spróbuj ponownie</button>`;
    } else if (W.rodzaj === "promien") {
      wybor = `<div class="chips">${[25, 50, 75].map((r) => `<button type="button" class="chip${W.promienKm === r ? " on" : ""}" data-act="paczka-promien" data-val="${r}">${r} km</button>`).join("")}</div>
        <label class="small muted" for="paczka-punkt">Wokół czego</label>
        <select id="paczka-punkt" data-sel="paczka-punkt">
          <option value="pozycja"${W.zPunktu === "pozycja" ? " selected" : ""}>mojej pozycji${S.userPos ? "" : " (najpierw ustal pozycję)"}</option>
          ${S.places.map((pl) => `<option value="${esc(pl.id)}"${W.zPunktu === pl.id ? " selected" : ""}>${esc(pl.name || P.PLACE_KINDS?.[pl.kind]?.label || "miejsce")}</option>`).join("")}
        </select>
        ${plan ? (plan.czesci.length ? rozmiarPaczki(plan)
          : `<p class="sim">Dla tego miejsca nie ma jeszcze mapy do pobrania. Na razie dostępne: ${esc(obszary.join(", "))}.</p>`) : ""}
        ${W.zPunktu === "pozycja" && !S.userPos ? `<div class="row">
            <button class="btn ghost" data-act="paczka-gps"${S.locatingPaczka ? " disabled" : ""}>${I("locate-fixed")}${S.locatingPaczka ? "Ustalam…" : "Ustal pozycję"}</button>
            <button class="btn ghost" data-act="paczka-mapa">${I("map")}Wskaż na mapie</button></div>
          <p class="small muted">Albo wybierz wyżej jedno z zapisanych miejsc.</p>` : ""}
        ${S.paczkaBlad ? `<p class="sim">${esc(S.paczkaBlad)}</p>` : ""}`;
    } else if (W.rodzaj === "woj") {
      const wszystkie = 16;
      wybor = `<label class="small muted" for="paczka-woj">Województwo</label>
        <select id="paczka-woj" data-sel="paczka-woj"><option value="">— wybierz —</option>
          ${obszary.map((n) => `<option value="${esc(n)}"${W.woj === n ? " selected" : ""}>${esc(n)} — ${mb(S.spis.obszary[n].bajty / 1e6)}</option>`).join("")}</select>
        ${obszary.length < wszystkie ? `<p class="small muted">Na razie do pobrania: ${obszary.length} z ${wszystkie} województw. Pozostałe dochodzą.</p>` : ""}
        ${plan ? rozmiarPaczki(plan) : ""}`;
    } else {
      wybor = `${plan ? rozmiarPaczki(plan) : ""}
        <p class="sim">Pobieraj całą Polskę tylko przez wifi i tylko wtedy, gdy masz tyle wolnego miejsca w telefonie.</p>
        ${obszary.length < 16 ? `<p class="small muted">Na razie w paczkach: ${esc(obszary.join(", "))}.</p>` : ""}`;
    }
    const procent = pob && pob.razem ? Math.round((100 * pob.zrobione) / pob.razem) : 0;
    const wynik = !pob && S.pobranieWynik ? (() => {
      const r = S.pobranieWynik;
      if (r.anulowane) return `<p class="small muted">Przerwane. To, co zdążyło się pobrać, zostaje w telefonie — następna próba dobierze tylko resztę.</p>`;
      return `<p class="small trust-ok">Pobrano ${mb((r.pobrane || 0) / 1e6)}: ${plural(r.kafelkow || 0, "kafelek", "kafelki", "kafelków")} mapy${r.trasy
        ? ` i dane do tras dla ${plural(r.komorekGrafu || 0, "obszaru", "obszarów", "obszarów")}` : ""}.${!r.pobrane ? " Wszystko było już w telefonie." : ""}</p>`;
    })() : "";
    return `<div class="card${maPaczki ? " sel" : ""}">
      <div class="row"><b class="grow">Mapa offline${maPaczki ? " ✓" : ""}</b>
        ${maPaczki ? `<button class="btn ghost place-btn" data-act="mapy-usun">${I("trash-2")}Usuń</button>` : ""}</div>
      ${maPaczki
        ? `<p class="small">Pobrane: <b>${plural(st.kafelkow, "element", "elementy", "elementów")} mapy</b>${S.zasoby
            ? ` · styl mapy: ${S.zasoby.styl.jasny && S.zasoby.styl.ciemny ? "oba motywy" : S.zasoby.styl.jasny || S.zasoby.styl.ciemny ? "jeden motyw" : "brak"} · ${S.zasoby.trasy ? `dane do tras: ${plural(S.zasoby.trasy, "obszar", "obszary", "obszarów")}` : "<b>bez danych do tras</b>"}` : ""}</p><ul class="small muted">${lista}</ul>`
        : `<p class="small muted">Przy alarmie sieć bywa przeciążona. Mapa pobrana wcześniej działa bez internetu — punkty schronienia i odległości działają zawsze, offline dochodzą do nich ulice.</p>
           <p class="small muted"><b>Mapa offline to też miejsce dla innych.</b> W czasie alarmu z Groty korzystają tysiące osób naraz, a serwer jest jeden. Każdy, kto ma mapę w telefonie, zwalnia łącze komuś, kto nie zdążył jej pobrać.</p>
           ${rule("P-AUTO")}`}
      <div class="chips">${opcja("promien", "Wokół miejsca")}${opcja("woj", "Województwo")}${opcja("polska", "Cała Polska")}</div>
      ${wybor}
      <h3>Co pobrać</h3>
      <div class="chips">
        <button type="button" class="chip${W.zestaw === "trasy" ? " on" : ""}" data-act="paczka-zestaw" data-val="trasy">Mapa i trasy</button>
        <button type="button" class="chip${W.zestaw === "mapa" ? " on" : ""}" data-act="paczka-zestaw" data-val="mapa">Sama mapa</button>
      </div>
      ${W.zestaw === "trasy"
        ? `<p class="small muted"><b>Mapa i trasy.</b> Bez internetu Grota poprowadzi Cię ulicami i chodnikami do schronienia
             albo do umówionego miejsca. To jedyny wariant, który działa poza miastem: sama mapa ma jakąś trzecią część ścieżek,
             więc bez danych do tras na wsi zwykle nie ma z czego policzyć drogi.</p>`
        : `<p class="small muted"><b>Sama mapa — mniejsza paczka.</b> Zobaczysz mapę, punkty schronienia i odległości,
             ale bez internetu Grota <b>nie wyznaczy trasy</b> — pokaże kierunek w linii prostej i budynki po drodze.
             W mieście to zwykle wystarcza, na wsi bywa za mało.</p>`}
      ${pob?.blad ? `<p class="sim">${esc(pob.blad)}</p>` : ""}
      ${wynik}
      ${pob && !pob.blad
        ? `<p class="small">${pob.przerywam ? "Przerywam…"
             : pob.etap === "spis" ? "Sprawdzam, co jest do pobrania…"
             : pob.etap === "styl" ? "Pobieram wygląd mapy (kolory, ikony, napisy)…"
             : `Pobieram „${esc(pob.etykieta)}”: ${mb((pob.zrobione || 0) / 1e6)} z ${mb((pob.razem || 0) / 1e6)}`}</p>
           <div class="pasek"><i style="width:${procent}%"></i></div>
           <p class="small muted">Możesz zamknąć tę kartę, ale nie aplikację. Po zerwaniu połączenia pobieranie samo spróbuje jeszcze raz.</p>
           <button class="btn ghost" data-act="paczka-anuluj">Przerwij</button>`
        : `<div class="row"><button class="btn" data-act="paczka-pobierz"${plan && plan.czesci.length ? "" : " disabled"}>${I("map")}Pobierz mapę</button>
             <button class="btn ghost" data-act="test-offline">${I("timer")}Sprawdź bez internetu</button></div>`}
    </div>`;
  }

  /* Dwie liczby, które muszą być identyczne w komunikacie na górze ekranu i w pasku na dole:
     czas dojścia do najbliższego schronienia i czas do zagrożenia z alarmu Strażnika. */
  /* Czas dojścia do punktu: z wyznaczonej trasy, gdy już jest (także z Twojej nagranej), a do tego czasu
     szacunek z odległości. Na jednym ekranie nie może być dwóch różnych minut — test alarmu na emulatorze
     pokazał „ok. 7 min (szacunek)” i „Trasa 767 m · ok. 10 min” na tej samej karcie, a ostrzeżenie liczyło
     z 7. Trasa po ulicach bywa dużo dłuższa niż linia prosta, więc szacunek potrafi powiedzieć „zdążysz”,
     gdy prawdziwa droga mówi „nie zdążysz”. */
  function dojscie(c) {
    const R = S.route;
    if (c && R && R.id === c.p.id && !R.loading && !R.failed && R.durMin != null) return { min: R.durMin, distM: R.distM, zTrasy: true };
    return { min: c ? c.estMin : null, distM: c ? c.distM : null, zTrasy: false };
  }

  // Czy według najlepszej wiedzy (trasa, a bez niej szacunek) nie zdążysz do pierwszej propozycji.
  function nieZdazysz() {
    if (!porownujCzas()) return false;
    const o = S.live?.options?.[0], eta = S.etaMin, d = dojscie(o);
    return !!o && eta != null && d.min != null && d.min > eta;
  }

  function liczbyCzasu() {
    if (!porownujCzas()) return null;
    const o = S.live?.options?.[0], eta = S.etaMin, d = dojscie(o);
    return o && d.min != null && eta != null ? { dojscie: d.min, eta, zTrasy: d.zTrasy } : null;
  }

  const zdanieCzasu = (p) => `dojście ${p.zTrasy ? "trasą " : ""}ok. ${p.dojscie} min, zagrożenie za ${p.eta} min`;

  function simBox() {
    const L = S.live, o = L?.options?.[0], eta = S.etaMin;
    // W Strażniku bez alarmu nie ma czego pokazywać — symulacja czasu to narzędzie prototypu, nie dla ludzi
    if (MODUL && !alarmTrwa()) return "";
    let result = "";
    if (porownujCzas()) {
      if (!L) result = `<p class="small sim">Najpierw ustal pozycję (przycisk TERAZ, adres albo „Jestem w”) — wtedy symulacja porówna czas dojścia z czasem do zagrożenia.</p>`;
      else if (!o) result = "";
      else if (dojscie(o).min == null) result = "";
      else if (nieZdazysz()) result = `<div class="warn-box small"><b>Według szacunku nie zdążysz:</b> ${zdanieCzasu(liczbyCzasu())}. Na górze ekranu są zasady z poradnika na taką sytuację.</div>`;
      else result = `<p class="small trust-ok">Według szacunku zdążysz: ${zdanieCzasu(liczbyCzasu())}. To szacunek, nie gwarancja.</p>`;
      if (result && alarmTrwa()) result += `<p class="small muted">${UWAGA_WIDOCZNE}</p>`;
    }
    if (alarmTrwa()) {
      const a = S.alarm;
      return `<div class="card sim-box">
        <div class="row"><b class="grow">Czas z alarmu Strażnika</b>${a.voiv ? `<span class="badge">${esc(a.voiv)}</span>` : ""}</div>
        <p class="small">${a.etaVoivMin != null
          ? `Zagrożenie za <b>${a.etaVoivMin} min</b> — ta sama wartość, którą pokazuje Strażnik.${a.hard === false
              ? " Alarm opiera się na źródłach pośrednich, więc Grota nie porównuje go z czasem dojścia." : ""}`
          : "Strażnik nie podaje teraz czasu do zagrożenia. Grota go nie zgaduje — pokazuje odległości i kierunek."}</p>
        ${result}
      </div>`;
    }
    return `<div class="card sim-box">
      <div class="row"><b class="grow">Symulacja ostrzeżenia Strażnika</b><span class="badge">prototyp</span></div>
      <p class="small muted">Po połączeniu ze Strażnikiem czas przyjdzie z alarmu. Grota porówna go z czasem dojścia — jeśli nie zdążysz, zamiast prowadzić pokaże zasady z „Poradnika” (s. 29). Wybierz, za ile minut zagrożenie:</p>
      <div class="chips">${[null, 2, 5, 10, 15, 30].map((v) =>
        `<button type="button" class="chip${eta === v ? " on" : ""}" data-act="eta" data-val="${v ?? ""}">${v == null ? "brak" : `${v} min`}</button>`).join("")}</div>
      ${result}
    </div>`;
  }

  function viewTeraz() {
    let body;
    if (S.locating) {
      body = `<div class="card"><b>Ustalam Twoją pozycję…</b><p class="small muted">Nie chcesz czekać? Wybierz, gdzie jesteś:</p>${placeChips()}
        ${addrBox("albo wpisz adres / miejscowość")}
        <button class="btn ghost" data-act="live-map">Wskaż na mapie</button></div>`;
    } else if (S.pick?.purpose === "live") {
      body = `<p class="sim">Dotknij mapy w miejscu, w którym jesteś.</p>`;
    } else if (S.liveError) {
      body = `<div class="card"><p class="sim">${esc(S.liveError)}</p>${placeChips()}
        ${addrBox()}
        <div class="row" style="margin-top:8px"><button class="btn" data-act="live-map">Wskaż na mapie</button><button class="btn ghost" data-act="retry-locate">Spróbuj ponownie</button></div></div>`;
    } else if (S.live && S.live.pozaZasiegiem) {
      body = posLine() + `<div class="card"><p><b>Jesteś poza zasięgiem danych Groty.</b></p>
        <p class="small">${S.posLabel ? "Wybrane miejsce leży" : "Według pozycji z telefonu jesteś"} poza Polską. Grota zna miejsca
        schronienia tylko w Polsce — najbliższe jest ${fmtDist(S.live.pozaZasiegiem)} stąd, więc nie wyznacza trasy.
        Poza Polską stosuj się do komunikatów tamtejszych służb.</p>
        <p class="small muted">Jesteś w Polsce, tuż przy granicy? Telefon mógł podać złą pozycję — wybierz, gdzie jesteś:</p>${placeChips()}
        ${addrBox()}
        <div class="row" style="margin-top:8px"><button class="btn" data-act="live-map">Wskaż na mapie</button><button class="btn ghost" data-act="retry-locate">Spróbuj ponownie</button></div></div>`;
    } else if (S.live && S.coarse && !S.coarseOk) {
      body = `<div class="card"><p class="sim">${esc(COARSE_TEXT(S.userPos.acc))}</p>${placeChips()}
        ${addrBox()}
        <div class="row" style="margin-top:8px"><button class="btn" data-act="live-map">Wskaż na mapie</button>
        <button class="btn ghost" data-act="coarse-ok">Pokaż mimo to</button></div></div>`;
    } else if (S.live) {
      const L = S.live;
      const here = S.userPos && S.places.find((pl) => C.distanceM(pl.lat, pl.lon, S.userPos.lat, S.userPos.lon) <= 300);
      const late = nieZdazysz();
      body = posLine() + (S.coarse && !S.posLabel ? `<p class="sim">${esc(`Pozycja przybliżona (${fmtAcc(S.userPos.acc)}) — wynik może dotyczyć innego miejsca.`)}</p>` : "")
        + skadSzukam()
        + (late ? `<div class="warn-box"><b>Według szacunku nie zdążysz: ${(() => { const p = liczbyCzasu();
            return p ? zdanieCzasu(p) : "zagrożenie może być bliżej niż czas dojścia"; })()}.</b>
            <span class="small">To szacunek Groty, nie gwarancja — te same minuty pokazuje pasek na dole ekranu.</span>
            ${alarmTrwa() ? `<p class="small">${UWAGA_WIDOCZNE}</p>` : ""}</div>${rule("P-NIE-ZDAZE", true)}` : "")
        + (here && here.spot ? spotCard(here, late) : "")
        + (late ? rule("P-POZA-DOMEM", true) : "")
        + modeButtons()
        + liveFilterBar()
        + (S.mode === "driving" ? rule("P-AUTO") : "")
        + (L.options.length ? mainOption(L.options[0])
          // Punkty jeszcze się wczytują (pierwsze wejście albo powrót na słabszym telefonie) — nie wolno wtedy
          // powiedzieć „brak punktów w pobliżu”, bo przy alarmie ktoś uwierzy i nie będzie szukał dalej.
          : !S.points.length ? `<p class="sim">Wczytuję punkty schronienia — za chwilę pokażę najbliższe. Zasady niżej działają już teraz.</p>`
          : S.liveFilter.dostep.length ? `<p class="sim">Brak punktów spełniających filtr w pobliżu. Zaznacz więcej rodzajów powyżej.</p>`
          : `<p class="sim">Nie zaznaczono żadnego rodzaju dostępu — zaznacz co najmniej jeden powyżej.</p>`)
        + (L.closerDoubtful?.length ? `<div class="card"><p class="small muted">Bliżej jest ${plural(L.closerDoubtful.length, "punkt", "punkty", "punktów")} o wątpliwym położeniu (najbliższy ${fmtDist(L.closerDoubtful[0].distM)}) — Grota do nich nie prowadzi, bo szpilka stoi obok budynku albo w innym miejscu niż adres.</p>${notkaOBledach()}</div>` : "")
        + (L.options.length > 1 ? `<h3>Inne opcje</h3>${L.options.slice(1).map(otherOption).join("")}` : "")
        + celCard()
;
    } else {
      body = `<button class="btn huge red" data-act="teraz">GDZIE SIĘ SCHRONIĆ TERAZ</button>
        <p class="small muted">Ustalę Twoją pozycję i wskażę najbliższe sprawdzone miejsce schronienia. Trasę poprowadzi Google Maps.</p>${placeChips()}
        ${addrBox("GPS nie działa? Wpisz adres albo miejscowość")}
        ${celCard()}`;
    }
    return `${wzywacDoSchronienia() ? rule("P-ALARM", true) : notkaOZrodle()}
      ${body}
      <details class="card"><summary>Pamiętaj — zasady z poradnika</summary>${rule("P-POWIETRZE")}${rule("P-OTWARTY-TEREN")}${rule("P-NIE-WYCHODZ")}${rule("P-EWAKUACJA")}</details>
      ${simBox()}`;
  }

  function viewPrzygotuj() {
    const total = P.CHECKLISTS.reduce((n, L) => n + L.items.length, 0);
    const done = Object.values(S.prep).filter(Boolean).length;
    return `<div class="row view-head"><h2 class="grow">Przygotuj się</h2>
        <button class="btn ghost place-btn" data-act="close-view">${I("x")}Zamknij</button></div>
      ${paczkiCard()}
      <p>Listy są cytatem z „Poradnika bezpieczeństwa”. Zaznaczaj, co już masz — postęp zostaje tylko na tym urządzeniu.</p>
      <p class="muted small">Zrobione: ${done} z ${total}.</p>
      ${rule("P-DOM")}
      <p class="small">${S.places.length ? "Miejsce w budynku dla domu, pracy i szkoły zapiszesz w zakładce „Moje miejsca”." : "Dodaj dom, pracę lub szkołę w zakładce „Moje miejsca” — zapiszesz tam też swoje miejsce w budynku."}</p>
      ${P.CHECKLISTS.map((L) => checklist(L.id)).join("")}`;
  }

  const RULE_SECTIONS = [
    ["sygnaly-alarmowe-i-komunikaty-ostrzegawcze", "Sygnały alarmowe"],
    ["atak-z-powietrza", "Atak z powietrza"],
    ["schronienia", "Schronienia"],
    ["ewakuacja", "Ewakuacja"],
    ["przygotuj-swoje-otoczenie", "Przygotuj swoje otoczenie"],
    ["plan-na-kryzys", "Plan na kryzys"],
  ];

  function viewZasady() {
    const ids = Object.keys(C.RULES);
    return `<div class="row view-head"><h2 class="grow">Zasady Groty</h2>
        <button class="btn ghost place-btn" data-act="close-view">${I("x")}Zamknij</button></div>
      <p>Grota nie tworzy własnych procedur. Każde zalecenie pochodzi z „Poradnika bezpieczeństwa” (Rząd RP, nr publikacji 1/2025) i ma numer strony.
      Nazwy rozdziałów są z poradnika, podtytuły dodaliśmy sami, żeby odróżnić zalecenia z tego samego rozdziału.</p>
      ${RULE_SECTIONS.map(([slug, label]) => {
        const grupa = ids.filter((id) => C.RULES[id].slug === slug);
        return grupa.length ? `<h3 class="rule-section" style="--rc:${RULE_COLORS[slug]}">${esc(label)}</h3>${grupa.map((id) => rule(id, false, true)).join("")}` : "";
      }).join("")}
      <h3>Czego poradnik nie określa</h3>
      <p>Poradnik nie podaje progu minut, po którym nie zdążysz dojść do schronienia, ani nie wskazuje środka transportu na czas ataku. Grota tego nie dopowiada: pokazuje szacunki i cytuje zasady.</p>
      <h3>Dlaczego w Grocie nie ma „schronów”</h3>
      <p>Inwentaryzacja Państwowej Straży Pożarnej z lat 2022–2023 wykazała w Polsce 1 903 schrony, 8 719 ukryć
      i 224 113 miejsc doraźnego schronienia. Publiczny zbiór „Punkty schronienia w Polsce”, na którym opiera się Grota,
      <b>nie rozróżnia tych kategorii</b> — wszystkie rekordy mają ten sam rodzaj.</p>
      <p>Pełne dane, w tym rodzaj obiektu, pojemność i stan techniczny, trafiają do Centralnej Ewidencji Obiektów
      Zbiorowej Ochrony (CEOZO), którą prowadzi Komendant Główny PSP. Zgodnie z <a href="https://lexlege.pl/ochr-ludn-i-oc/art-113/" target="_blank" rel="noopener">art. 113 ustawy o ochronie ludności i obronie cywilnej</a>
      dane z tej ewidencji <b>nie są informacją publiczną</b>, a część z nich ma klauzulę „zastrzeżone”.
      <a href="https://lexlege.pl/ochr-ludn-i-oc/art-114/" target="_blank" rel="noopener">Art. 114</a> przewiduje do wiadomości publicznej
      tylko ogólne dane dla województw i powiatów oraz informowanie o położeniu obiektów.</p>
      <p>Dlatego Grota pokazuje punkty schronienia bez etykiety „schron”. Oznaczanie ich na podstawie map społecznościowych
      byłoby zgadywaniem: obiekty opisane w OpenStreetMap jako bunkry to w większości fortyfikacje z wojen i ruiny.
      Jeśli PSP udostępni rodzaj obiektu, dodamy go razem z datą weryfikacji.</p>
      <p class="small">Źródła: <a href="https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20240001907" target="_blank" rel="noopener">ustawa z 5.12.2024 o ochronie ludności i obronie cywilnej</a> ·
      <a href="https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20250000922" target="_blank" rel="noopener">rozporządzenie MSWiA z 7.07.2025 o CEOZO</a> ·
      <a href="https://dane.gov.pl/pl/dataset/28058" target="_blank" rel="noopener">zbiór „Punkty schronienia w Polsce” na dane.gov.pl</a>.</p>

      <h3>Twoje dane</h3>
      <p>Miejsca, notatki, nagrane trasy i ustawienia zapisują się <b>tylko w pamięci tego urządzenia</b>. Autor aplikacji
      ich nie widzi i nigdzie nie wysyła. Kopia zapasowa Androida może przenieść je na Twoje konto Google.</p>
      <p>Co opuszcza telefon i kiedy: wpisany adres trafia do wyszukiwarki GUGiK; przy wyznaczaniu trasy Twoja pozycja i cel
      idą do serwera tras FOSSGIS; współrzędne punktu do usługi zdjęć GUGiK; oglądany fragment mapy do OpenFreeMap;
      po naciśnięciu „Prowadź” albo „Street View” — do Google. Bez tych czynności nic nie wychodzi z telefonu.</p>

      <h3>Ograniczenia danych</h3>
      <p>Publiczny zbiór PSP nie podaje rodzaju obiektu, liczby miejsc ani tego, czy obiekt jest teraz otwarty. „Na żądanie” oznacza, że ktoś musi go otworzyć.</p>
      <p>Położenie sprawdzamy automatycznie: czy punkt stoi na budynku, czy zgadza się z adresem, czy leży we właściwej gminie i województwie. Punkty wątpliwe (czerwona obwódka) nie są polecane jako pierwsze; „do sprawdzenia” (żółta) to drobniejsze rozbieżności. To nie jest kontrola obiektu przez urząd.</p>
      <h3>Przesunięte szpilki — błąd źródła, nie Groty</h3>
      <p>W publicznym zbiorze PSP część punktów ma współrzędne postawione obok budynku, którego dotyczą. Sprawdziliśmy to
      na danych z całej Polski: <b>1075 punktów</b> (1,3%) nie stoi na żadnym budynku. Przy 657 z nich budynek jest w promieniu 30 m
      (najczęściej blok — szpilka wylądowała na podwórku, parkingu albo trawniku), przy 252 w 30–60 m, przy 115 w 60–150 m,
      a <b>51 punktów nie ma żadnego budynku w promieniu 150 m</b> — tam szpilka wskazuje pole, las albo miejsce poza
      miejscowością z adresu.</p>
      <p>To błąd danych źródłowych i ich dalszego przetwarzania, nie Groty. Nie przesuwamy punktów po cichu, bo nie mamy
      czym potwierdzić, gdzie naprawdę jest schronienie. Zamiast tego: oznaczamy je, nie polecamy jako pierwszych i przy
      każdym piszemy, co stoi najbliżej szpilki i jak daleko — żeby w terenie szukać budynku, a nie kropki na mapie.</p>
      <p>Jeśli widzisz punkt postawiony w złym miejscu, zgłoś to gminie albo komendzie PSP, która przekazuje dane do zbioru —
      poprawka u źródła naprawia go we wszystkich aplikacjach naraz.</p>
      <p>Czas dojścia to szacunek: zanim trasa się wyznaczy — z odległości w linii prostej, potem z trasy po drogach
      i ścieżkach (bez korków i utrudnień). Nie jest gwarancją.</p>
      <h3>Źródła</h3>
      <p class="small">Zasady i listy kontrolne: ${esc(P.SOURCE.authors)}, „${esc(P.SOURCE.title)}”, ${esc(P.SOURCE.edition)}, <a href="${esc(P.SOURCE.url)}" target="_blank" rel="noopener">wersja internetowa na gov.pl</a>, licencja <a href="${esc(P.SOURCE.licenseUrl)}" target="_blank" rel="noopener">${esc(P.SOURCE.license)}</a>. ${esc(P.SOURCE.note)}</p>
      <p class="small">${esc(S.meta?.zrodlo || "Komenda Główna PSP, dane.gov.pl, CC BY 4.0")}; dane z ${esc(S.meta?.data_danych || "")}. Kontrola budynków: ${esc(S.meta?.kontrola_budynkow || "OpenStreetMap, ODbL")}. Mapa: OpenFreeMap, © OpenStreetMap. Zdjęcia z góry: ortofotomapa GUGiK (usługa WMS, pobierana na bieżąco, bez zapisywania). Biblioteka mapy: MapLibre (BSD).</p>
      <p class="small">Wyszukiwanie adresów: usługa geokodowania GUGiK (zapytanie wysyłane dopiero po naciśnięciu „Szukaj”). Spis miejscowości do wyszukiwania bez internetu: OpenStreetMap (© współtwórcy OSM, ODbL). Ikony: Lucide (licencja ISC).</p>
      <p class="small">Wstępna trasa na mapie: serwer tras FOSSGIS (OSRM, dane © współtwórcy OpenStreetMap) — pozycja i cel są wysyłane do tego serwera; trasa nie uwzględnia korków ani utrudnień. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Popraw mapę</a>. Rodzaj budynku (szkoła, blok, parking podziemny…): OpenStreetMap, nie dane PSP.</p>
      <h3>„W określonych godzinach” i „na żądanie”</h3>
      <p>Według komunikatów PSP i samorządów o aplikacji „Gdzie się ukryć”: obiekty z godzinami są dostępne w czasie pracy placówki lub obecności obsługi, a obiekty „na żądanie” są zamknięte (np. piwnice bloków, garaże wspólnot) i w razie zagrożenia powinni je otworzyć zarządcy lub mieszkańcy w ramach wzajemnej pomocy. Publiczne dane nie podają godzin ani kontaktu — zapytaj zarządcę budynku zawczasu i zapisz odpowiedź przy swoim miejscu schronienia.</p>`;
  }

  let ostatniaZakladka = null;
  function render() {
    root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    // na ekranie Mapa (ze zwiniętymi ustawieniami) mapa dostaje 2/3 wysokości
    const view = S.tab === "mapa" && !S.mapToolsOpen && !S.selectedId ? "mapa-duza" : S.tab;
    if (root.dataset.view !== view) { root.dataset.view = view; requestAnimationFrame(() => map.resize()); }
    /* Panel przerysowujemy w całości, więc bez tego przewinięcie skakało — najbardziej widać to było
       po ustaleniu pozycji i po pobraniu mapy, gdy karta zmienia wysokość. */
    const przewiniecie = panel.scrollTop, tabPrzed = ostatniaZakladka;
    panel.innerHTML = { teraz: viewTeraz, mapa: viewMapa, miejsca: viewMiejsca, przygotuj: viewPrzygotuj, zasady: viewZasady }[S.tab]();
    if (tabPrzed === S.tab && przewiniecie) panel.scrollTop = przewiniecie;
    ostatniaZakladka = S.tab;
    updateLiveDim();
  }

  // Na ekranie „Teraz” z włączonym filtrem punkty spoza filtra są przygaszone — widać, że istnieją, ale Grota do nich nie prowadzi.
  let lastDim = "";
  function updateLiveDim() {
    if (!map.getLayer("ps")) return;
    const F = S.liveFilter, gr = activeGroups(F.grupy);
    const active = S.tab === "teraz" && (F.dostep.length !== ACCESS_ITEMS.length || gr.length !== ALL_GROUPS.length);
    const dostep = F.dostep.includes("na_zadanie") ? [...F.dostep, "nieznany"] : F.dostep;
    const op = active
      ? ["case", ["all", ["in", ["get", "dostep"], ["literal", dostep]], ["in", ["get", "grupa"], ["literal", gr]]], 1, 0.15]
      : 1;
    const key = JSON.stringify(op);
    if (key === lastDim) return;
    lastDim = key;
    map.setPaintProperty("ps", "circle-opacity", op);
    map.setPaintProperty("ps", "circle-stroke-opacity", op);
  }

  // Podzbiory punktów trzymamy w pamięci — siatka do wyszukiwania budowana jest raz na każdy zestaw filtrów.
  const subsetCache = new Map();
  function pointsFor(dostep, grupy) {
    const gr = activeGroups(grupy);
    if (dostep.length === ACCESS_ITEMS.length && gr.length === ALL_GROUPS.length) return S.points;
    const key = `${[...dostep].sort()}|${[...gr].sort()}`;
    let arr = subsetCache.get(key);
    if (!arr) {
      arr = S.points.filter((p) => dostep.includes(p.dostep === "nieznany" ? "na_zadanie" : p.dostep) && gr.includes(groupOf(p)));
      subsetCache.set(key, arr);
    }
    return arr;
  }

  function computeLive() {
    if (!S.userPos) return;
    const { lat, lon } = S.userPos, F = S.liveFilter;
    S.live = C.liveBest(pointsFor(F.dostep, F.grupy), lat, lon, { mode: S.mode, etaMin: S.etaMin });
    S.live.pozaZasiegiem = pozaZasiegiem(lat, lon, S.live);
    S.wybraneRecznie = null;          // nowa pozycja albo inny filtr — pierwszy jest znów ten najbliższy
    // ile trzeba iść do najbliższego sprawdzonego punktu każdego rodzaju — żeby świadomie wybrać „dalej, ale całodobowo”
    S.liveNear = nearestByAccess(lat, lon, F.grupy, S.mode);
  }

  /* Grota zna tylko punkty w Polsce. Kto jest za granicą (albo telefon podaje fałszywą pozycję — emulator
     stoi domyślnie w Kalifornii), dostawał linię przez ocean: „9029 km · 140855 min”. Rozstrzyga granica
     Polski (decyzja usera 22.09: Frankfurt nad Odrą nie dostaje trasy, choć Słubice są kilometr dalej):
     kontur z 16 województw, ten sam co warstwa na mapie.
     - Tolerancja na błąd odbiornika: tyle, ile podaje sam telefon, najwyżej 1 km. Dobry GPS (kilkanaście
       metrów) nie przerzuci Frankfurtu do Polski, a pozycja przybliżona przy granicy nie odetnie Słubic.
     - Morze i plaże: kontur biegnie uproszczoną linią brzegu (plaża w Sopocie wypada poza nim), więc punkt
       na północ od wybrzeża między granicą z Niemcami na Uznamie a Mierzeją Wiślaną liczymy jako Polskę.
     - Zanim kontur się wczyta: najbliższy punkt z całego wykazu dalej niż 50 km.
     Zwraca odległość do najbliższego punktu schronienia, gdy pozycja jest poza zasięgiem, albo null. */
  const ZASIEG_M = 50000, TOLERANCJA_MAX_M = 1000;
  let granicaPL = null;                                   // [[pierścień zewnętrzny, ...dziury], ...]
  (async function wczytajGranice(proba = 1) {
    try {
      const r = await fetch(BAZA + "data/granice/wojewodztwa.geojson");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const g = await r.json(), wielokaty = [];
      for (const f of g.features) {
        const G = f.geometry;
        for (const w of G.type === "Polygon" ? [G.coordinates] : G.coordinates) wielokaty.push(w);
      }
      granicaPL = wielokaty;
      if (S.live && S.userPos) { computeLive(); fitLive(); render(); }
    } catch {
      if (proba < 3) setTimeout(() => wczytajGranice(proba + 1), 3000 * proba);
    }
  })();

  function wPierscieniu(x, y, r) {
    let w = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) w = !w;
    }
    return w;
  }
  const wPolsce = (lon, lat) => granicaPL.some((w) => wPierscieniu(lon, lat, w[0]) && !w.slice(1).some((d) => wPierscieniu(lon, lat, d)));

  function odGranicyM(lon, lat) {
    const kx = Math.cos((lat * Math.PI) / 180) * 111320, ky = 110540;
    let min = Infinity;
    for (const w of granicaPL) for (const r of w) for (let i = 1; i < r.length; i++) {
      const ax = (r[i - 1][0] - lon) * kx, ay = (r[i - 1][1] - lat) * ky, dx = (r[i][0] - lon) * kx - ax, dy = (r[i][1] - lat) * ky - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return min;
  }

  // Na północ od polskiego wybrzeża: kilka do kilkudziesięciu kilometrów na południe zaczyna się ląd w konturze.
  function naMorzuPrzyPolsce(lon, lat) {
    if (lon < 14.235 || lon > 19.63 || lat < 53.9) return false;
    for (let km = 1; km <= 40; km++) if (wPolsce(lon, lat - km / 111)) return true;
    return false;
  }

  function najblizszyPunktM(lat, lon) {
    let min = Infinity;
    for (const p of S.points) { const d = C.distanceM(lat, lon, p.lat, p.lon); if (d < min) min = d; }
    return min;
  }

  function pozaZasiegiem(lat, lon, L) {
    if (!S.points.length) return null;
    if (!granicaPL) {
      const pierwszy = L.options[0]?.distM;
      if (pierwszy != null && pierwszy <= ZASIEG_M) return null;
      const min = najblizszyPunktM(lat, lon);
      return min > ZASIEG_M ? min : null;
    }
    if (wPolsce(lon, lat) || naMorzuPrzyPolsce(lon, lat)) return null;
    const tolerancja = S.posLabel ? 0 : Math.min(S.userPos?.acc || 0, TOLERANCJA_MAX_M);
    if (tolerancja && odGranicyM(lon, lat) <= tolerancja) return null;
    return najblizszyPunktM(lat, lon);
  }

  /* Pierwsza karta to domyślnie punkt najbliższy, ale wybór należy do człowieka: bywa zamknięty,
     po drugiej stronie ruchliwej drogi albo po prostu nie budzi zaufania. Dotknięcie innej karty
     stawia ją na pierwszym miejscu — z trasą i zieloną ramką — a dotychczasowa pierwsza schodzi
     do „Innych opcji". Nowa pozycja albo zmiana filtra liczy wszystko od nowa i wybór znika. */
  function wybierzOpcje(id) {
    const L = S.live;
    const i = L?.options.findIndex((c) => c.p.id === id) ?? -1;
    if (i < 0) return;
    if (i > 0) {
      const [c] = L.options.splice(i, 1);
      L.options.unshift(c);
      // ostrzeżenie „nie zdążysz" ma dotyczyć tego miejsca, do którego naprawdę idziemy
      L.tooFar = S.etaMin == null || c.estMin == null ? null : c.estMin > S.etaMin;
    }
    S.wybraneRecznie = id;
    S.selectedId = id;
    if (map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], id]);
    showRoute(id);
    render();
    // karta urosła do pełnej i stoi wyżej — pokazujemy ją, zamiast zostawiać człowieka w połowie listy
    panel.querySelector(".main-opt")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function liveFilterChanged() {
    writeLS(LIVE_FILTER_KEY, S.liveFilter);
    S.route = null; drawRoute();
    computeLive(); fitLive(); render();
  }

  // Najbliższy sprawdzony punkt każdego rodzaju dostępu (przy danym filtrze rodzaju budynku) — odległości przy przyciskach filtra.
  function nearestByAccess(lat, lon, grupy, mode) {
    return Object.fromEntries(ACCESS_ITEMS.map(([k]) => {
      const c = C.nearest(pointsFor([k], grupy), lat, lon, { limit: 15, mode }).find((x) => !C.isDoubtful(x.p));
      return [k, c || null];
    }));
  }

  /* Trzy rodzaje widoczne bez rozwijania: najpierw te, które użytkownik sam zaznaczył, a gdy filtr jest
     wyłączony — te, w których najczęściej szuka się schronienia (parkingi podziemne, bloki, szkoły). */
  const RODZAJE_NA_SKROT = ["podziemne", "blok", "edukacja"];

  function skrotRodzajow(gr) {
    const wybrane = gr.length === ALL_GROUPS.length ? [] : gr;
    const kolejnosc = [...wybrane, ...RODZAJE_NA_SKROT.filter((k) => !wybrane.includes(k))].slice(0, 3);
    return kolejnosc.map((k) => TYPE_GROUPS.find((g) => g[0] === k)).filter(Boolean);
  }

  /* Pasek filtra dostępności i rodzaju budynku. Ten sam wygląd na „Teraz” (prefix lf) i przy wyborze schronień
     dla zapisanego miejsca (prefix pf) — o: { F, near, prefix, typesOpen, title, note } */
  function accessFilterBar(o) {
    const { F, near, prefix: px } = o;
    const gr = activeGroups(F.grupy);
    const allAccess = F.dostep.length === ACCESS_ITEMS.length, allTypes = gr.length === ALL_GROUPS.length;
    return `<div class="live-filter">
      <div class="filter-head"><span class="small muted">${esc(o.title)}</span>
        <button type="button" class="chip${allAccess ? " on" : ""}" data-act="${px}-all" aria-pressed="${allAccess}">Pokaż wszystkie</button></div>
      <div class="filter-row">${ACCESS_ITEMS.map(([k, label]) => {
        const c = near[k], on = F.dostep.includes(k);
        return `<button type="button" class="fchip${on ? " on" : ""}" data-act="${px}" data-val="${k}" aria-pressed="${on}">
          <i style="background:${ACCESS_COLORS[k]}"></i><span>${label}</span><small>${c ? `${fmtDist(c.distM)}${c.estMin ? ` · ${c.estMin} min` : ""}` : "brak w pobliżu"}</small></button>`;
      }).join("")}</div>
      ${o.typesOpen ? "" : `<div class="type-row skrot">${skrotRodzajow(gr).map(([k, label, icon]) =>
        `<button type="button" class="tchip${gr.includes(k) ? " on" : ""}" data-act="${px}-group" data-val="${k}" aria-pressed="${gr.includes(k)}">
          ${I(icon)}<span>${esc(label)}</span></button>`).join("")}</div>`}
      <button type="button" class="btn ghost szeroki" data-act="${px}-types" aria-expanded="${o.typesOpen}">
        ${I(o.typesOpen ? "chevron-up" : "chevron-down")}Rodzaj budynku: ${allTypes ? "wszystkie" : `${gr.length} z ${ALL_GROUPS.length}`}</button>
      ${o.typesOpen ? `<div class="filter-head filter-sub"><span class="small muted">Rodzaj budynku (wg OpenStreetMap)</span>
          <button type="button" class="chip${allTypes ? " on" : ""}" data-act="${px}-groups-all" aria-pressed="${allTypes}">Pokaż wszystkie</button></div>
        <div class="type-row">${TYPE_GROUPS.map(([k, label, icon]) => `<button type="button" class="tchip${gr.includes(k) ? " on" : ""}" data-act="${px}-group" data-val="${k}" aria-pressed="${gr.includes(k)}">
          ${I(icon)}<span>${esc(label)}</span></button>`).join("")}</div>` : ""}
      ${o.always ? `<p class="small muted">${esc(o.always)}</p>` : ""}
      ${!allAccess || !allTypes ? `<p class="small sim">${esc(o.note)}</p>` : ""}
    </div>`;
  }

  function liveFilterBar() {
    return accessFilterBar({ F: S.liveFilter, near: S.liveNear || {}, prefix: "lf", typesOpen: S.liveTypesOpen, title: "Prowadź do punktów",
      note: "Filtr włączony — Grota prowadzi tylko do zaznaczonych punktów. Odległości przy przyciskach pokazują, ile dzieli Cię od najbliższego punktu każdego rodzaju.",
      always: "Grota prowadzi tylko do punktów o sprawdzonym położeniu. Punkty wątpliwe pomija i pisze o nich pod propozycją." });
  }

  // Jedno dotknięcie: pozycja → najbliższe miejsce. Świeża pozycja (do 2 min) nie jest pobierana ponownie.
  async function runLive(force = false) {
    S.tab = "teraz"; S.live = null; S.liveError = null;
    if (force || !S.userPos || Date.now() - (S.userPosAt || 0) > 120000) {
      const seq = ++S.posSeq;
      S.locating = true; S.addrOpen = false; render();
      let pos;
      try { pos = await locate(); }
      catch (e) { if (seq !== S.posSeq) return; S.locating = false; S.liveError = e.message; render(); return; }
      if (seq !== S.posSeq) return;                     // w międzyczasie wybrano adres, miejsce albo punkt na mapie
      S.coarseOk = false; S.posLabel = null; setUserPos(pos, false); S.userPosAt = Date.now();
      S.locating = false;
    }
    computeLive(); fitLive(); render();
  }

  // Pozycja wybrana ręcznie (adres, zapisane miejsce, mapa) — od razu wynik, bez czekania na GPS.
  function ustawCel(cel) {
    S.cel = cel; S.celWarnClosed = false; S.celKroki = false; celPozaMapa = false;
    sprawdzCelWMapie();
    writeLS(CEL_KEY, cel);
    if (S.route?.id === "cel") { S.route = null; drawRoute(); }
    if (cel && S.userPos) showRoute("cel"); else render();
    if (cel) map.flyTo({ center: [cel.lon, cel.lat], zoom: 15 });
  }

  function useManualPos(pos, label) {
    S.posSeq++; S.locating = false; S.liveError = null; S.pick = null; S.tab = "teraz";
    S.coarseOk = true; S.posLabel = label; S.addrOpen = false;
    setUserPos(pos, false); S.userPosAt = Date.now();
    computeLive(); fitLive(); render();
  }

  function fitPadding() {
    const el = document.getElementById("g-map");
    const p = Math.round(Math.max(30, Math.min(90, Math.min(el.clientWidth, el.clientHeight) * 0.14)));
    return { top: p, bottom: p + 20, left: p, right: p + 30 };     // prawy dół: przyciski mapy
  }

  function fitLive() {
    if (!S.live || !S.userPos) return;
    if (S.live.pozaZasiegiem) {
      S.selectedId = null; S.route = null; drawRoute();
      map.flyTo({ center: [S.userPos.lon, S.userPos.lat], zoom: 6, duration: 600 });
      return;
    }
    const b = new maplibregl.LngLatBounds([S.userPos.lon, S.userPos.lat], [S.userPos.lon, S.userPos.lat]);
    S.live.options.slice(0, 3).forEach((c) => b.extend([c.p.lon, c.p.lat]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 16, duration: 600 });
    const id = S.live.options[0]?.p.id || "";
    S.selectedId = id;
    if (map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], id]);
    if (id) showRoute(id);
  }

  // Router lokalny widzi tylko kafelki wczytane w bieżącym widoku, więc najpierw pokazujemy oba końce.
  function fitCel(from, p) {
    const b = new maplibregl.LngLatBounds([from.lon, from.lat], [from.lon, from.lat]);
    b.extend([p.lon, p.lat]);
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 15, duration: 0 });
  }

  function fitRoute() {
    const R = S.route, from = R?.from || S.userPos;
    if (!R?.coords || !from) return;
    const b = new maplibregl.LngLatBounds([from.lon, from.lat], [from.lon, from.lat]);
    R.coords.forEach((xy) => b.extend(xy));
    if (S.tab === "teraz" && S.live) S.live.options.slice(0, 3).forEach((c) => b.extend([c.p.lon, c.p.lat]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 16, duration: 600 });
  }

  /* ---------- zdarzenia ---------- */
  root.querySelectorAll(".g-tabs, .g-bottom").forEach((nav) => nav.addEventListener("click", (e) => {
    const t = e.target.closest("button[data-tab]"); if (!t) return;
    if (t.dataset.tab === "teraz") { runLive(); return; }       // czerwony przycisk = od razu szukaj
    if (t.dataset.tab === "mapa") closePopups();                // wracamy do mapy, nie do ustawień
    S.prevTab = S.tab; S.tab = t.dataset.tab; render();
  }));

  document.getElementById("btn-locate").addEventListener("click", async () => {
    const btn = document.getElementById("btn-locate");
    btn.classList.add("busy");
    try {
      const pos = await locate(); S.posSeq++; S.coarseOk = false; S.posLabel = null; setUserPos(pos, true); S.userPosAt = Date.now();
      if (S.coarse) alert(COARSE_TEXT(pos.acc));
      if (S.tab === "teraz") computeLive();
      render();
    } catch (e) { S.tab = "teraz"; S.live = null; S.liveError = e.message; render(); }
    finally { btn.classList.remove("busy"); }
  });

  themeBtn.addEventListener("click", () => {
    S.theme = S.theme === "jasna" ? "ciemna" : "jasna"; writeLS(THEME_KEY, S.theme); setThemeIcon();
    root.dataset.map = S.theme;
    tryOnlineMap();   // pełne przeładowanie → style.load → addLayers przywraca własne warstwy; bez sieci wróci mapa uproszczona
  });
  root.dataset.map = S.theme;

  panel.addEventListener("change", (e) => {
    const sel = e.target.dataset?.sel;
    if (sel === "paczka-punkt") { S.paczka = { ...S.paczka, zPunktu: e.target.value }; render(); }
    if (sel === "paczka-woj") { S.paczka = { ...S.paczka, woj: e.target.value }; render(); }
  });

  // Enter w polu adresu = Szukaj (niektóre klawiatury ekranowe nie wysyłają formularza same)
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.classList.contains("addr-q")) return;
    e.preventDefault();
    e.target.form?.requestSubmit();
  });

  panel.addEventListener("input", (e) => {
    if (e.target.classList.contains("addr-q")) S[ADDR_STATE[e.target.dataset.ctx]].q = e.target.value;
    else if (e.target.id === "new-place-name") S.newName = e.target.value;
  });

  /* ---------- kolejność miejsc: przeciąganie za uchwyt ----------
     Pointer Events działają tak samo dla myszy i dotyku (zwykłe HTML5 drag & drop nie działa na telefonach).
     W trakcie przeciągania nie wywołujemy render() — przesuwamy tylko kafle transformacją. */
  let drag = null;

  function movePlaceOrder(id, to) {
    const from = S.places.findIndex((x) => x.id === id);
    if (from < 0 || to === from || to < 0 || to >= S.places.length) return false;
    const [pl] = S.places.splice(from, 1);
    S.places.splice(to, 0, pl);
    savePlaces();
    return true;
  }

  panel.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".drag-handle");
    if (!h || (e.pointerType === "mouse" && e.button !== 0)) return;
    const card = h.closest(".place-card"), list = card.parentElement;
    const cards = [...list.children].filter((c) => c.classList.contains("place-card"));
    const rects = cards.map((c) => c.getBoundingClientRect());
    const from = cards.indexOf(card);
    const gap = cards.length > 1 ? rects[1].top - rects[0].bottom : 8;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    drag = { id: card.dataset.id, card, cards, rects, from, to: from, gap, startY: e.clientY, lastY: e.clientY, startScroll: panel.scrollTop, pointerId: e.pointerId };
    card.classList.add("dragging");
    list.classList.add("sorting");
    drag.timer = setInterval(autoScroll, 16);
  });

  function autoScroll() {
    if (!drag) return;
    const r = panel.getBoundingClientRect(), edge = 60;
    const v = drag.lastY < r.top + edge ? -(r.top + edge - drag.lastY) / 4 : drag.lastY > r.bottom - edge ? (drag.lastY - (r.bottom - edge)) / 4 : 0;
    if (v) { panel.scrollTop += Math.max(-18, Math.min(18, v)); layoutDrag(); }
  }

  function layoutDrag() {
    const d = drag, dy = d.lastY - d.startY + (panel.scrollTop - d.startScroll);
    d.card.style.transform = `translateY(${dy}px)`;
    const r = d.rects[d.from], mid = r.top + r.height / 2 + dy;
    let to = d.from;
    d.rects.forEach((rr, i) => {
      const m = rr.top + rr.height / 2;
      if (i < d.from && mid < m) to = Math.min(to, i);
      if (i > d.from && mid > m) to = Math.max(to, i);
    });
    d.to = to;
    const shift = r.height + d.gap;
    d.cards.forEach((c, i) => {
      if (c === d.card) return;
      const t = d.from < to && i > d.from && i <= to ? -shift : d.from > to && i >= to && i < d.from ? shift : 0;
      c.style.transform = t ? `translateY(${t}px)` : "";
    });
  }

  panel.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastY = e.clientY;
    layoutDrag();
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    clearInterval(d.timer);
    d.cards.forEach((c) => { c.style.transform = ""; c.classList.remove("dragging"); });
    d.card.parentElement?.classList.remove("sorting");
    if (e.type === "pointerup" && movePlaceOrder(d.id, d.to)) render();
  }
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);

  // klawiatura: uchwyt + strzałki
  panel.addEventListener("keydown", (e) => {
    const h = e.target.closest?.(".drag-handle");
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const from = S.places.findIndex((x) => x.id === h.dataset.id);
    if (movePlaceOrder(h.dataset.id, from + (e.key === "ArrowUp" ? -1 : 1))) {
      render();
      panel.querySelector(`.drag-handle[data-id="${h.dataset.id}"]`)?.focus();
    }
  });

  panel.addEventListener("submit", async (e) => {
    if (e.target.dataset.form !== "addr") return;
    e.preventDefault();
    const ctx = e.target.dataset.ctx, key = ADDR_STATE[ctx];
    const q = (document.getElementById(`addr-q-${ctx}`)?.value || "").trim();
    if (q.length < 2) return;
    document.activeElement?.blur?.();                  // chowa klawiaturę na telefonie
    S[key] = { q, loading: true }; render();
    const ref = S.userPos || (S.places[0] ? { lat: S.places[0].lat, lon: S.places[0].lon } : null);
    const res = await C.geocode(q, S.localities, ref);
    if (S[key].q !== q) return;
    S[key] = { q, ...res }; render();
  });

  // Nazwa, notatka „miejsce w budynku” i notatka „jak wejść” zapisują się w trakcie pisania (bez przerysowania ekranu,
  // żeby nie gubić kursora); obok pola pojawia się „Zapisano”.
  let saveTimer = 0;
  function commitField(el) {
    const id = el.id;
    let pl = null;
    if (id.startsWith("place-spot-") && !id.startsWith("place-spotok-")) {
      pl = S.places.find((x) => x.id === id.slice(11)); if (pl) pl.spot = el.value.trim();
    } else if (id.startsWith("place-name-")) {
      pl = S.places.find((x) => x.id === id.slice(11)); if (pl && el.value.trim()) pl.name = el.value.trim();
    } else if (el.dataset.notePlace) {
      pl = S.places.find((x) => x.id === el.dataset.notePlace);
      if (pl) pl.access = { ...(pl.access || {}), [el.dataset.noteId]: el.value.trim() };
    }
    if (!pl) return false;
    clearTimeout(saveTimer); savePlaces();
    S.savedFlash = { field: id, at: Date.now() };
    const st = document.getElementById(`st-${id}`);
    if (st) st.innerHTML = `${I("check")}Zapisano`;
    return true;
  }

  panel.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el.hasAttribute("data-autosave") || el.dataset.notePlace)) return;
    const st = document.getElementById(`st-${el.id}`);
    if (st) st.textContent = "zapisuję…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => commitField(el), 500);
  });

  panel.addEventListener("keydown", (e) => {
    // Enter w nazwie = gotowe (chowa klawiaturę); w notatkach Enter dalej robi nową linię
    if (e.key === "Enter" && e.target.id?.startsWith("place-name-")) { e.preventDefault(); commitField(e.target); e.target.blur(); }
  });

  panel.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.act === "prep") {
      if (el.checked) S.prep[el.dataset.key] = true; else delete S.prep[el.dataset.key];
      writeLS(PREP_KEY, S.prep); render();
    } else if (el.id.startsWith("place-spotok-")) {
      const pl = S.places.find((x) => x.id === el.id.slice(13)); if (pl) { pl.spotChecked = el.checked; savePlaces(); render(); }
    } else if (el.id.startsWith("place-spot-") || el.id.startsWith("place-name-") || el.dataset.notePlace) {
      commitField(el);   // opuszczenie pola — zapis bez przerysowania
    } else if (el.dataset.act === "save") {
      const pl = S.places.find((x) => x.id === el.dataset.place); if (!pl) return;
      if (el.checked && pl.shelters.length < 3 && !pl.shelters.includes(el.dataset.id)) pl.shelters.push(el.dataset.id);
      if (!el.checked) pl.shelters = pl.shelters.filter((id) => id !== el.dataset.id);
      savePlaces(); render();
    }
  });

  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "addr-pick" && b.dataset.ctx === "place") {
      const it = S.addrPlace.items?.[Number(b.dataset.i)]; if (!it) return;
      S.addrPlace = { q: "" };
      const name = document.getElementById("new-place-name")?.value.trim() || S.newName;
      addPlace(name, { lat: it.lat, lon: it.lon }, S.adding, { addr: it.label, approx: it.acc > 25 });
      map.flyTo({ center: [it.lon, it.lat], zoom: it.acc >= 300 ? 14 : 17 });
      render();
    } else if (act === "addr-pick" && b.dataset.ctx === "edit") {
      const it = S.addrEdit.items?.[Number(b.dataset.i)], pl = S.places.find((x) => x.id === (S.editPlace || S.openPlace));
      if (!it || !pl) return;
      S.addrEdit = { q: "" };
      movePlace(pl, { lat: it.lat, lon: it.lon }, { addr: it.label, approx: it.acc > 25 });
    } else if (act === "place-move-gps") {
      const pl = S.places.find((x) => x.id === b.dataset.id); if (!pl) return;
      try { const pos = await locate(); movePlace(pl, pos, { addr: "", approx: pos.acc > 300 }); }
      catch (err) { alert(err.message + " Wpisz adres albo wskaż miejsce na mapie."); }
    } else if (act === "place-move-map") {
      S.pick = { purpose: "move", id: b.dataset.id }; map.getCanvas().style.cursor = "crosshair"; render();
    } else if (act === "rec-start") {
      await recStart(b.dataset.place, b.dataset.id);
    } else if (act === "rec-show") {
      const pl = S.places.find((x) => x.id === b.dataset.place);
      if (pl) { showOwnRoute(pl, b.dataset.id); render(); document.getElementById("g-map").scrollIntoView({ behavior: "smooth" }); }
    } else if (act === "rec-del") {
      const pl = S.places.find((x) => x.id === b.dataset.place);
      if (!pl?.routes?.[b.dataset.id] || !confirm("Usunąć nagraną trasę?")) return;
      delete pl.routes[b.dataset.id];
      if (S.route?.own && S.route.id === b.dataset.id) { S.route = null; drawRoute(); }
      savePlaces(); render();
    } else if (act === "paczka-rodzaj") {
      S.paczka = { ...S.paczka, rodzaj: b.dataset.val }; S.pobieranie = null; render();
    } else if (act === "paczka-zestaw") {
      S.paczka = { ...S.paczka, zestaw: b.dataset.val }; render();
    } else if (act === "paczka-promien") {
      S.paczka = { ...S.paczka, promienKm: Number(b.dataset.val) }; render();
    } else if (act === "rysuj-trase") {
      S.trasaBlad = null;
      if (!S.userPos) {
        S.rysujeTrase = true; render();
        try { setUserPos(await locate(), false); S.posLabel = null; S.userPosAt = Date.now(); }
        catch (e) { S.trasaBlad = `${e.message} Możesz też ustalić pozycję na ekranie TERAZ albo wskazać ją na mapie.`; }
        S.rysujeTrase = false;
      }
      if (S.userPos) showRoute(b.dataset.id);
      render();
    } else if (act === "paczka-gps") {
      S.locatingPaczka = true; S.paczkaBlad = null; render();
      try { setUserPos(await locate()); S.posLabel = null; }
      catch (e) { S.paczkaBlad = String(e.message || e); }
      S.locatingPaczka = false; render();
    } else if (act === "paczka-mapa") {
      S.paczkaBlad = null; S.pick = { purpose: "paczka" }; map.getCanvas().style.cursor = "crosshair"; S.tab = "mapa"; render();
    } else if (act === "paczka-spis") {
      wczytajSpis(true); render();
    } else if (act === "paczka-pobierz") {
      pobierzPaczke();
    } else if (act === "paczka-anuluj") {
      O.anuluj();
      S.pobieranie = { ...S.pobieranie, przerywam: true }; render();
    } else if (act === "mapy-usun") {
      O.wyczysc().then(() => { O.paczki().forEach((p) => O.usunPaczke(p.id)); odswiezStanMap(); });
    } else if (act === "test-offline") {
      testBezSieci(!O.udaje());
    } else if (act === "cel-open") {
      S.celOpen = !S.celOpen; render();
    } else if (act === "cel-map") {
      S.celOpen = false; S.pick = { purpose: "cel" }; map.getCanvas().style.cursor = "crosshair"; S.tab = "mapa"; render();
    } else if (act === "cel-clear") {
      ustawCel(null);
    } else if (act === "cel-warn-close") {
      S.celWarnClosed = true; render();
    } else if (act === "cel-kroki") {
      S.celKroki = !S.celKroki; render();
    } else if (act === "cel-route") {
      showRoute("cel");
    } else if (act === "addr-pick" && b.dataset.ctx === "cel") {
      const it = S.addrCel.items?.[Number(b.dataset.i)]; if (!it) return;
      S.addrCel = { q: "" }; S.celOpen = false;
      ustawCel({ lat: it.lat, lon: it.lon, label: it.label });
    } else if (act === "info-off") {
      S.infoSchrony = false; writeLS(INFO_KEY, true); render();
    } else if (act === "info-more") {
      S.infoSchrony = false; writeLS(INFO_KEY, true); S.tab = "zasady"; render();
      panel.scrollTo({ top: 0 });
    } else if (act === "close-view") {
      closePopups(); S.tab = S.prevTab && S.prevTab !== S.tab ? S.prevTab : "mapa"; render();
    } else if (act === "map-tools") {
      S.mapToolsOpen = !S.mapToolsOpen; render();
    } else if (act === "clear-sel") {
      select(null, false);
    } else if (act === "wybierz-opcje") {
      wybierzOpcje(b.dataset.id);
    } else if (act === "addr-pick") {
      const it = S.addr.items?.[Number(b.dataset.i)]; if (!it) return;
      S.addr = { q: "" };
      useManualPos({ lat: it.lat, lon: it.lon, acc: it.acc }, `${it.label}${it.detail && it.source === "spis" ? ` (${it.detail})` : ""} — ${ADDR_SRC[it.source]}`);
    } else if (act === "addr-toggle") {
      S.addrOpen = !S.addrOpen; render();
      if (S.addrOpen) document.getElementById("addr-q")?.focus();
    } else if (act === "filter") {
      const group = b.dataset.group, val = group === "trust" ? Number(b.dataset.val) : b.dataset.val;
      S.filter[group] = toggleIn(S.filter[group], val);
      applyFilter(); render();
    } else if (act === "filter-all") {
      accessAll(S.filter, ACCESS_ITEMS); applyFilter(); render();
    } else if (act === "filter-group") {
      S.filter.grupy = groupsToggle(S.filter.grupy, b.dataset.val);
      applyFilter(); render();
    } else if (act === "filter-groups-all") {
      S.filter.grupy = groupsAll(S.filter.grupy); applyFilter(); render();
    } else if (act === "lf") {
      S.liveFilter.dostep = toggleIn(S.liveFilter.dostep, b.dataset.val); liveFilterChanged();
    } else if (act === "lf-all") {
      accessAll(S.liveFilter, ACCESS_ITEMS); liveFilterChanged();
    } else if (act === "lf-group") {
      S.liveFilter.grupy = groupsToggle(S.liveFilter.grupy, b.dataset.val); liveFilterChanged();
    } else if (act === "lf-groups-all") {
      S.liveFilter.grupy = groupsAll(S.liveFilter.grupy); liveFilterChanged();
    } else if (act === "lf-types") {
      S.liveTypesOpen = !S.liveTypesOpen; render();
    } else if (act === "pf") {
      S.pickFilter.dostep = toggleIn(S.pickFilter.dostep, b.dataset.val); writeLS(PICK_FILTER_KEY, S.pickFilter); render();
    } else if (act === "pf-all") {
      accessAll(S.pickFilter, ACCESS_ITEMS); writeLS(PICK_FILTER_KEY, S.pickFilter); render();
    } else if (act === "pf-group") {
      S.pickFilter.grupy = groupsToggle(S.pickFilter.grupy, b.dataset.val); writeLS(PICK_FILTER_KEY, S.pickFilter); render();
    } else if (act === "pf-groups-all") {
      S.pickFilter.grupy = groupsAll(S.pickFilter.grupy); writeLS(PICK_FILTER_KEY, S.pickFilter); render();
    } else if (act === "pf-types") {
      S.pickTypesOpen = !S.pickTypesOpen; render();
    } else if (act === "live-close") {
      liveClose();
    } else if (act === "eta") {
      S.etaMin = b.dataset.val === "" ? null : Number(b.dataset.val);
      if (S.live) computeLive();
      drawRoute();
      render();
      if (nieZdazysz()) panel.scrollTo({ top: 0, behavior: "smooth" });
    } else if (act === "place-mode") {
      const pl = S.places.find((x) => x.id === b.dataset.id); if (pl) { pl.mode = b.dataset.mode; savePlaces(); render(); }
    } else if (act === "toggle-shelter") {
      const pl = S.places.find((x) => x.id === b.dataset.place); if (!pl) return;
      if (pl.shelters.includes(b.dataset.id)) pl.shelters = pl.shelters.filter((id) => id !== b.dataset.id);
      else if (pl.shelters.length < 3) pl.shelters.push(b.dataset.id);
      savePlaces(); render();
    } else if (act === "place-kind") {
      const pl = S.places.find((x) => x.id === b.dataset.id); if (pl) { pl.kind = b.dataset.kind; savePlaces(); render(); }
    } else if (act === "add-kind") {
      S.adding = S.adding === b.dataset.kind ? null : b.dataset.kind; S.newName = ""; S.addrPlace = { q: "" }; render();
      if (S.adding) document.getElementById("new-place-name")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (act === "add-cancel") {
      S.adding = null; S.pick = null; S.newName = ""; S.addrPlace = { q: "" }; render();
    } else if (act === "open-place") {
      const id = b.dataset.id;
      S.openPlace = S.openPlace === id ? null : id; S.editPlace = null;
      render();
    } else if (act === "edit-place") {
      const id = b.dataset.id;
      const leaving = S.editPlace === id;
      S.openPlace = id; S.editPlace = leaving ? null : id; S.addrEdit = { q: "" };
      render();
    } else if (act === "edit-done") {
      S.editPlace = null; S.pick = null; render();
    } else if (act === "place-on-map") {
      const pl = S.places.find((x) => x.id === b.dataset.id);
      if (pl) { map.flyTo({ center: [pl.lon, pl.lat], zoom: 16 }); document.getElementById("g-map").scrollIntoView({ behavior: "smooth" }); }
    } else if (act === "toggle-list") {
      S.openList = S.openList === b.dataset.id ? null : b.dataset.id; render();
    } else if (act === "toggle-place") {
      S.openPlace = S.openPlace === b.dataset.id ? null : b.dataset.id; S.editPlace = null;
      render();
    } else if (act === "unsave") {
      const pl = S.places.find((x) => x.id === b.dataset.place);
      if (pl) { pl.shelters = pl.shelters.filter((id) => id !== b.dataset.id); if (pl.routes) delete pl.routes[b.dataset.id]; savePlaces(); render(); }
    } else if (act === "del-place") {
      const pl = S.places.find((x) => x.id === b.dataset.id);
      if (!pl || !confirm(`Usunąć miejsce „${pl.name}” razem z zapisanymi schronieniami i notatkami?`)) return;
      S.places = S.places.filter((x) => x.id !== pl.id);
      if (S.openPlace === pl.id) S.openPlace = null;
      savePlaces(); render();
    } else if (act === "place-gps") {
      const name = document.getElementById("new-place-name").value.trim();
      try { const pos = await locate(); addPlace(name, pos, S.adding); map.flyTo({ center: [pos.lon, pos.lat], zoom: 14 }); }
      catch (err) { alert(err.message + " Wskaż miejsce na mapie."); }
      render();
    } else if (act === "place-map") {
      S.pick = { purpose: "place", name: document.getElementById("new-place-name").value.trim(), kind: S.adding };
      map.getCanvas().style.cursor = "crosshair"; render();
    } else if (act === "teraz") {
      await runLive();
    } else if (act === "retry-locate") {
      await runLive(true);
    } else if (act === "mode") {
      S.mode = b.dataset.mode; writeLS(MODE_KEY, S.mode);
      const keep = S.route?.id;
      computeLive(); render();
      if (S.userPos && (keep || S.live?.options[0])) showRoute(keep && S.live?.options.some((o) => o.p.id === keep) ? keep : S.live?.options[0]?.p.id || keep);
    } else if (act === "at-place") {
      const pl = S.places.find((x) => x.id === b.dataset.id); if (!pl) return;
      useManualPos({ lat: pl.lat, lon: pl.lon }, `zapisane miejsce „${pl.name}”`);
    } else if (act === "coarse-ok") {
      S.coarseOk = true; render();
    } else if (act === "show-on-map") {
      select(b.dataset.id, true); document.getElementById("g-map").scrollIntoView({ behavior: "smooth" });
    } else if (act === "live-map") {
      S.locating = false; S.liveError = null; S.pick = { purpose: "live" }; map.getCanvas().style.cursor = "crosshair"; render();
    }
  });

  /* Systemowy przycisk „wstecz”: zamyka po kolei to, co otwarte (wskazywanie na mapie, edycja miejsca,
     karta punktu, rozwinięte panele), potem wraca na mapę. Zwraca false, gdy nie ma już czego zamykać —
     wtedy natywna aktywność zamyka aplikację. Capacitor sam tego nie obsługuje, stąd most GrotaWstecz. */
  function wsteczKrok() {
    if (S.pick) { S.pick = null; map.getCanvas().style.cursor = ""; }
    else if (S.rec) { /* nagrywanie kończymy świadomie, nie „wstecz” */ }
    else if (S.editPlace) S.editPlace = null;
    else if (S.openPlace) S.openPlace = null;
    else if (S.selectedId) select(null, false);
    else if (closePopups()) { /* zamknięte panele */ }
    else if (S.tab !== "mapa") S.tab = "mapa";
    else return false;
    render();
    return true;
  }

  /* Samodzielnie: most natywny GrotaWstecz i wartownik w historii przeglądarki. W Strażniku nie ruszamy
     ani historii, ani jego obsługi „wstecz” — Strażnik woła Grota.wstecz() (grota/widok.js). */
  function pushHistory() { if (MODUL) return; try { history.pushState({ grota: true }, ""); } catch { /* bez historii po prostu działa jak dotąd */ } }
  if (!MODUL) {
    window.GrotaWstecz = wsteczKrok;
    window.addEventListener("popstate", () => { if (wsteczKrok()) pushHistory(); });
    pushHistory();
  }

  /* Wyjście z Groty w Strażniku: zapamiętujemy, gdzie była mapa, i zdejmujemy ją razem z kopią punktów
     przygotowaną dla mapy (odbudowuje się w sekundę). Same punkty są drogie — zmierzone na emulatorze:
     Strażnik sam ok. 260 MB w procesie przeglądarki, po zamknięciu Groty z punktami w pamięci ok. 470 MB.
     Na telefonie z mniej niż 4 GB pamięci zwalniamy więc i je: przeglądarka ubita przez system zabrałaby
     ze sobą Strażnika, a on ma działać zawsze. Na mocniejszym zostają — drugie wejście (najczęściej przy
     alarmie) jest wtedy natychmiastowe. Pobieranie map w tle nie jest przerywane. */
  const zwalniacPunkty = () => !(navigator.deviceMemory >= 4);     // brak informacji = ostrożnie, jak słaby telefon
  let punktyZwolnione = false;

  function zwolnijPunkty() {
    S.points = []; S.byId = new Map(); S.counts = null; S.live = null; S.liveNear = null; S.selectedId = null;
    subsetCache.clear();                      // podzbiory trzymają te same punkty — bez tego pamięć by nie zeszła
    watpliwychIle = null;
    dataReady = new Promise(() => {});        // do czasu ponownego wczytania nikt nie dostanie pustych danych
    punktyZwolnione = true;
  }

  function schowaj() {
    widocznyModul = false;
    if (!mapaJest()) return;
    const c = map.getCenter();
    widokMapy = { center: [c.lng, c.lat], zoom: map.getZoom() };
    clearTimeout(styleTimeout);
    /* Obserwator podpisu trzyma elementy kontrolki, a przez ich zdarzenia całą mapę — bez odpięcia każda zdjęta
       mapa zostawała w pamięci (na emulatorze ok. 10 MB na każde wejście i wyjście, 7 martwych map po 7 wejściach). */
    attribObserver.disconnect();
    map.remove();
    /* Nowa mapa dostaje czysty pojemnik. Na tym samym elemencie zdjęte mapy nie znikały z pamięci
       (5 martwych map po 4 wejściach) — pojemnik trzymał po nich nasłuchy, a przez nie całe mapy. */
    const stary = document.getElementById("g-map");
    stary.replaceWith(stary.cloneNode(false));
    map = MAPA_ATRAPA;
    placeMarkers = [];
    layersAdding = false;      // gdyby zdjęcie przyszło w trakcie dodawania warstw
    lastDim = null;            // nowa mapa ma domyślną przezroczystość punktów — trzeba ją nadać od nowa
    pointsGeojson = null;
    if (zwalniacPunkty()) zwolnijPunkty();
  }

  // Ekran TERAZ z od razu ustalaną pozycją — człowiek wchodzący z alarmu pyta tylko o to, dokąd iść.
  function doTeraz() {
    if (S.tab !== "teraz") S.tab = "teraz";
    if (!S.locating && (!S.userPos || Date.now() - (S.userPosAt || 0) > 120000)) runLive();
    else if (S.userPos && !S.live) { computeLive(); fitLive(); }
  }

  /* Grota otwierana z przycisku przy alarmie dostaje { zakladka: "teraz" } — w stresie o jedno dotknięcie mniej.
     Bez zakładki (wejście z „Więcej”) zawsze Mapa, także w trakcie alarmu — decyzja usera 22.09. */
  const ZAKLADKI = ["mapa", "miejsca", "teraz", "przygotuj", "zasady"];
  function wybierzZakladke(opcje) {
    const z = opcje && opcje.zakladka;
    if (z === "teraz") doTeraz();
    else S.tab = ZAKLADKI.includes(z) ? z : "mapa";
  }

  let widocznyModul = false, zwolnienieTimer = null;

  function pokaz(opcje) {
    widocznyModul = true;
    clearTimeout(zwolnienieTimer);
    if (mapaJest()) { map.resize(); wybierzZakladke(opcje); render(); return; }
    if (punktyZwolnione) {
      punktyZwolnione = false;
      setLoadMsg("Wczytuję punkty schronienia…");
      dataReady = loadData();         // po wczytaniu sam przeliczy wynik „Teraz”, jeśli jest otwarty
    }
    utworzMape();
    wybierzZakladke(opcje);
    map.once("load", () => {
      drawPlaces();
      if (S.userPos) setUserPos(S.userPos, false);
      drawRoute();
      if (S.selectedId && map.getLayer("ps-sel")) map.setFilter("ps-sel", ["==", ["get", "id"], S.selectedId]);
    });
    render();
  }

  /* Wczytanie w tle, gdy przychodzi alarm (Grota.przygotuj() w widok.js): punkty mają być gotowe, zanim
     człowiek dotknie „Gdzie się schronić” — zmierzone na emulatorze z 2 GB: pierwsze wejście 14 s, kolejne
     ok. 8 s, bo na słabym telefonie punkty są zwalniane. Bez mapy i bez pokazywania czegokolwiek. Jeśli po
     5 minutach nikt Groty nie otworzył, słaby telefon znów je zwalnia — ta sama zasada co przy schowaj(). */
  const PRZYGOTOWANE_MS = 5 * 60 * 1000;
  function przygotuj() {
    if (punktyZwolnione) {
      punktyZwolnione = false;
      dataReady = loadData();
    }
    if (!widocznyModul && zwalniacPunkty()) {
      clearTimeout(zwolnienieTimer);
      zwolnienieTimer = setTimeout(() => {
        if (!widocznyModul && S.points.length) zwolnijPunkty();
      }, PRZYGOTOWANE_MS);
    }
    return dataReady.then(() => S.points.length > 0, () => false);
  }

  render();
  odswiezStanMap();          // ile map jest już w telefonie — potrzebne w „Przygotuj” i przy ocenie celu
  sprawdzCelWMapie();
  window.GrotaModul = { pokaz, schowaj, przygotuj, wstecz: wsteczKrok };
  // do testów w podglądzie i na emulatorze — w Strażniku publicznym interfejsem jest window.Grota z widok.js
  window.GrotaDebug = { state: S, get map() { return map; }, select, render, runLive, offline: O };
})();

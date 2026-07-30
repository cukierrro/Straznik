/* Strażnik — frontend: MapLibre GL 3D + panel fuzji sygnałów.
   Dane zagrożeń: NEPTUN (neptun.in.ua) — agregator OSINT; zawsze pokazujemy
   confidenceLevel i uncertaintyKm, nigdy nie sugerujemy większej precyzji. */
"use strict";

/* ── konfiguracja / API base ─────────────────────────────────────────────── */
const IS_APP = location.protocol === "capacitor:" || location.protocol === "file:" ||
               (window.Capacitor !== undefined);
function apiBase() {
  if (location.search.includes("standalone=1")) return null;  // test trybu wbudowanego
  const saved = localStorage.getItem("straznik_api");
  if (saved) return saved.replace(/\/+$/, "");
  if (!IS_APP && /^https?:$/.test(location.protocol)) return location.origin;
  return null;
}

const TYPE_META = {
  uav:      { label: "Dron / BpSP",        color: "#ffb020" },
  shahed:   { label: "Shahed",             color: "#ff8c1a" },
  fpv:      { label: "FPV (lokalny)",      color: "#8a93a6" },
  missile:  { label: "Rakieta maner.",     color: "#ff4d5e" },
  cruise:   { label: "Rakieta maner.",     color: "#ff4d5e" },
  ballistic:{ label: "Balistyczna",        color: "#ff2db0" },
  kab:      { label: "KAB",                color: "#ffd23b" },
  mig31k:   { label: "MiG-31K (nosiciel)", color: "#c06bff" },
};
const LEVEL_LABEL = { none: "brak sygnałów", elevated: "PODWYŻSZONA UWAGA", high: "WYSOKI PRIORYTET" };

/* ── ADS-B: role maszyn wojskowych (kod typu ICAO → przeznaczenie) ───────── */
const MIL_ROLES = {
  C30J: "transport taktyczny", C130: "transport taktyczny", C160: "transport taktyczny",
  C295: "transport taktyczny", C27J: "transport taktyczny", M28: "lekki transport / patrol (Bryza)",
  A400: "transport strategiczny (Atlas)", C17: "transport strategiczny (Globemaster)",
  C5M: "transport ciężki (Galaxy)", IL76: "transport ciężki",
  K35R: "latający tankowiec (KC-135)", KC46: "latający tankowiec (Pegasus)",
  A332: "tankowiec / transport (MRTT)", A333: "tankowiec / transport (MRTT)",
  E3TF: "AWACS — wczesne ostrzeganie", E3CF: "AWACS — wczesne ostrzeganie",
  E3: "AWACS — wczesne ostrzeganie", E7: "wczesne ostrzeganie (Wedgetail)",
  F16: "myśliwiec wielozadaniowy", F35: "myśliwiec 5. gen. (Lightning II)",
  F15: "myśliwiec przewagi powietrznej", F18: "myśliwiec wielozadaniowy",
  EUFI: "myśliwiec (Eurofighter Typhoon)", RFAL: "myśliwiec (Rafale)",
  GRIP: "myśliwiec (Gripen)", MG29: "myśliwiec (MiG-29)", SU22: "myśliwsko-bombowy (Su-22)",
  P8: "patrolowy morski (Poseidon)", RQ4D: "dron rozpoznawczy (Phoenix)",
  Q4: "dron rozpoznawczy (Global Hawk)", MQ9: "dron rozpoznawczo-uderzeniowy (Reaper)",
  B350: "rozpoznanie / łącznikowy", BE20: "rozpoznanie / łącznikowy",
  GLEX: "rozpoznanie specjalne", CL60: "rozpoznanie / VIP", GLF5: "VIP / sztabowy",
  TEX2: "szkolno-treningowy (Texan II)", L39: "szkolno-bojowy (Albatros)",
  H60: "śmigłowiec wielozadaniowy (Black Hawk)", S70: "śmigłowiec wielozadaniowy (Black Hawk)",
  H64: "śmigłowiec szturmowy (Apache)", H47: "śmigłowiec transportowy (Chinook)",
  MI8: "śmigłowiec transportowy (Mi-8)", MI17: "śmigłowiec transportowy (Mi-17)",
  MI24: "śmigłowiec szturmowy (Mi-24)", W3: "śmigłowiec wielozadaniowy (Sokół)",
  EC35: "śmigłowiec lekki", H145: "śmigłowiec lekki", H225: "śmigłowiec (Caracal)",
  AS32: "śmigłowiec (Super Puma)", A109: "śmigłowiec lekki", A139: "śmigłowiec (AW139)",
};
// pełne nazwy modeli — adsb.lol często nie zwraca pola desc
const MIL_NAMES = {
  C30J: "C-130J Super Hercules", C130: "C-130 Hercules", C160: "C-160 Transall",
  C295: "CASA C-295M", C27J: "C-27J Spartan", M28: "PZL M28 Bryza",
  A400: "A400M Atlas", C17: "C-17 Globemaster III", C5M: "C-5M Super Galaxy",
  IL76: "Ił-76", K35R: "KC-135R Stratotanker", KC46: "KC-46 Pegasus",
  A332: "A330 MRTT", A333: "A330 MRTT", E3TF: "E-3 Sentry", E3CF: "E-3 Sentry",
  E3: "E-3 Sentry", E7: "E-7 Wedgetail", F16: "F-16 Fighting Falcon",
  F35: "F-35A Lightning II", F15: "F-15 Eagle", F18: "F/A-18 Hornet",
  EUFI: "Eurofighter Typhoon", RFAL: "Dassault Rafale", GRIP: "JAS 39 Gripen",
  MG29: "MiG-29", SU22: "Su-22", P8: "P-8A Poseidon", RQ4D: "RQ-4D Phoenix",
  Q4: "RQ-4 Global Hawk", MQ9: "MQ-9 Reaper", B350: "King Air 350",
  BE20: "King Air 200", GLEX: "Bombardier Global (ARTEMIS)", CL60: "Challenger 600",
  GLF5: "Gulfstream V", TEX2: "T-6 Texan II", L39: "L-39 Albatros",
  B738: "Boeing 737-800", H60: "UH-60 Black Hawk", S70: "S-70i Black Hawk",
  H64: "AH-64 Apache", H47: "CH-47 Chinook", MI8: "Mi-8", MI17: "Mi-17",
  MI24: "Mi-24", W3: "PZL W-3 Sokół", EC35: "H135M", H145: "H145M",
  H225: "H225M Caracal", AS32: "AS332 Super Puma", A109: "AW109", A139: "AW139",
};
const acName = (type, desc) => desc || MIL_NAMES[type] || type || "typ nieznany";
const ROLE_FALLBACK = [
  [/hercules|transall|spartan|casa/i, "transport taktyczny"],
  [/stratotanker|extender|mrtt|pegasus/i, "latający tankowiec"],
  [/sentry|awacs|wedgetail/i, "AWACS — wczesne ostrzeganie"],
  [/falcon|eurofighter|typhoon|rafale|gripen|hornet|eagle|lightning|mig|fulcrum/i, "myśliwiec"],
  [/galaxy|globemaster|atlas/i, "transport strategiczny"],
  [/poseidon|orion/i, "patrolowy morski"],
  [/reaper|global\s*hawk|bayraktar|predator/i, "dron rozpoznawczy"],
  [/black\s*hawk|mi-?8|mi-?17|sok[oó][lł]/i, "śmigłowiec wielozadaniowy"],
  [/apache|mi-?24|cobra|tiger/i, "śmigłowiec szturmowy"],
  [/chinook/i, "śmigłowiec transportowy"],
  [/helicopter/i, "śmigłowiec"],
];
function acRole(type, desc) {
  if (type && MIL_ROLES[type]) return MIL_ROLES[type];
  for (const [re, role] of ROLE_FALLBACK) if (desc && re.test(desc)) return role;
  return null;
}
const HELI_TYPES = new Set(["H60","S70","H64","H47","MI8","MI17","MI24","W3","EC35",
  "EC45","H145","H225","AS32","A109","A139","UH1","AH1","H500","EH10","LYNX","PUMA"]);
function isHeli(cat, type, desc) {
  return cat === "A7" || HELI_TYPES.has(type) ||
    /helicopter|black\s*hawk|apache|chinook|mi-?[128]|sok[oó][lł]|caracal|puma/i.test(desc || "");
}
/* ── polonizacja danych NEPTUN (źródło jest po ukraińsku) ────────────────── */
const CONF_PL = { high: "wysoka", medium: "średnia", low: "niska" };
const OBLAST_PL = {
  "Волинська": "wołyński", "Львівська": "lwowski", "Закарпатська": "zakarpacki",
  "Рівненська": "rówieński", "Тернопільська": "tarnopolski", "Хмельницька": "chmielnicki",
  "Івано-Франківська": "iwanofrankiwski", "Чернівецька": "czerniowiecki",
  "Житомирська": "żytomierski", "Вінницька": "winnicki", "Київська": "kijowski",
  "Черкаська": "czerkaski", "Кіровоградська": "kirowohradzki", "Одеська": "odeski",
  "Миколаївська": "mikołajowski", "Херсонська": "chersoński", "Дніпропетровська": "dniepropetrowski",
  "Запорізька": "zaporoski", "Полтавська": "połtawski", "Сумська": "sumski",
  "Чернігівська": "czernihowski", "Харківська": "charkowski", "Донецька": "doniecki",
  "Луганська": "ługański", "Крим": "Krym", "Київ": "Kijów",
};
const oblastPL = (s) => {
  if (!s) return "";
  for (const [ua, pl] of Object.entries(OBLAST_PL)) if (s.includes(ua)) return "obw. " + pl;
  return translit(s);
};
/* transliteracja ukraińskiej cyrylicy na polską łacinkę (nazwy miejscowości) */
const TR = { "а":"a","б":"b","в":"w","г":"h","ґ":"g","д":"d","е":"e","є":"je","ж":"ż","з":"z",
  "и":"y","і":"i","ї":"ji","й":"j","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
  "с":"s","т":"t","у":"u","ф":"f","х":"ch","ц":"c","ч":"cz","ш":"sz","щ":"szcz","ь":"","ю":"ju",
  "я":"ja","'":"", "’":"" };
function translit(s) {
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const low = ch.toLowerCase();
    const t = TR[low];
    if (t === undefined) { out += ch; continue; }
    out += ch === low ? t : (t.charAt(0).toUpperCase() + t.slice(1));
  }
  return out;
}
/* własny opis po polsku zamiast tłumaczenia ukraińskiego zdania */
function threatDesc(t) {
  const meta = TYPE_META[t.type] || { label: t.type };
  const where = [t.locality ? translit(t.locality) : null, oblastPL(t.region)]
    .filter(Boolean).join(", ");
  const parts = [];
  if (where) parts.push(t.destination ? `kursem na ${where}` : `rejon: ${where}`);
  if (t.sourceCount) parts.push(`potwierdzeń: ${t.sourceCount}`);
  return parts.join(" · ") || meta.label;
}

const COMPASS = ["płn.", "płn.-wsch.", "wsch.", "płd.-wsch.", "płd.", "płd.-zach.", "zach.", "płn.-zach."];
const compass = (deg) => deg == null ? "" : COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const ftToM = (ft) => typeof ft === "number" ? Math.round(ft * 0.3048) : null;
const ktToKmh = (kt) => typeof kt === "number" ? Math.round(kt * 1.852) : null;
// alt_baro bywa stringiem "ground" (maszyna na płycie lotniska)
const altText = (alt) => alt === "ground" ? "na ziemi"
  : typeof alt === "number" ? `${alt} ft (${ftToM(alt)} m)` : "wysokość b.d.";
const PRIORITY = ["lubelskie", "podkarpackie", "podlaskie", "warmińsko-mazurskie"];
const ALL_VOIVS = ["dolnośląskie","kujawsko-pomorskie","lubelskie","lubuskie","łódzkie",
  "małopolskie","mazowieckie","opolskie","podkarpackie","podlaskie","pomorskie","śląskie",
  "świętokrzyskie","warmińsko-mazurskie","wielkopolskie","zachodniopomorskie"];

/* moja lokalizacja — sterowanie kamerą i priorytetem alarmów */
const myVoiv = () => localStorage.getItem("straznik_voiv") || null;
let voivGeo = null;   // GeoJSON województw (do GPS → województwo i do centrowania)

/* widok startowy: cała Polska + zachodnia Ukraina (kierunek nadlotu) */
const FIT_VIEW = { center: [23.2, 50.7], zoom: 5.75 };

let state = null;          // ostatni stan z backendu
let threatsReceivedAt = 0; // do dead-reckoningu
let map, mapReady = false, is3d = true;

/* ── połączenie z backendem ──────────────────────────────────────────────── */
const connBadge = document.getElementById("conn-badge");
let ws = null, wsRetry = 1;

let standalone = false;
function connect() {
  const base = apiBase();
  if (!base) {
    // brak adresu backendu ⇒ WBUDOWANY silnik: telefon/przeglądarka sam
    // pobiera dane i liczy fuzję (engine.js). Zero konfiguracji.
    standalone = true;
    connBadge.classList.add("hidden");
    Engine.start(applyState);
    return;
  }
  const wsUrl = base.replace(/^http/, "ws") + "/ws";
  connBadge.textContent = "łączenie…"; connBadge.classList.remove("hidden");
  try { ws = new WebSocket(wsUrl); } catch { return scheduleReconnect(); }
  ws.onopen = () => { wsRetry = 1; connBadge.classList.add("hidden"); };
  ws.onmessage = (e) => {
    const env = JSON.parse(e.data);
    if (env.type === "state") applyState(env.data);
  };
  ws.onclose = ws.onerror = () => scheduleReconnect();
}
function scheduleReconnect() {
  if (ws) { ws.onclose = ws.onerror = null; try { ws.close(); } catch {} ws = null; }
  connBadge.textContent = "brak połączenia z backendem — ponawiam…";
  connBadge.classList.remove("hidden");
  setTimeout(connect, Math.min(wsRetry * 1000, 15000));
  wsRetry = Math.min(wsRetry * 2, 15);
  pollOnce();
}
async function pollOnce() {
  const base = apiBase(); if (!base || standalone) return;
  try {
    const r = await fetch(base + "/api/state");
    if (r.ok) applyState(await r.json());
  } catch {}
}

function applyState(s) {
  state = s;
  threatsReceivedAt = Date.now();
  recordTrails(s?.neptun?.threats || []);
  renderLeds();
  updateAlarmMood();          // alarmy działają także w trybie przeglądania
  if (histMode) return;       // ale widok mapy/panelu zostaje na wybranym momencie
  renderPanel();
  if (mapReady) { updateVoivStates(); updateAdsb(); }
}

/* ── mapa ────────────────────────────────────────────────────────────────── */
const FALLBACK_STYLE = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: { carto: { type: "raster", tileSize: 256, attribution: "© CARTO © OpenStreetMap",
    tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"] } },
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b0f1a" } },
           { id: "carto", type: "raster", source: "carto" }],
};

function makeDartImage(color) {
  const c = document.createElement("canvas"); c.width = c.height = 48;
  const x = c.getContext("2d");
  x.translate(24, 24);
  x.beginPath();               // strzałka skierowana na północ (rotacja przez icon-rotate)
  x.moveTo(0, -16); x.lineTo(11, 12); x.lineTo(0, 5); x.lineTo(-11, 12); x.closePath();
  x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 10; x.fill();
  x.lineWidth = 2; x.strokeStyle = "rgba(255,255,255,.85)"; x.stroke();
  return x.getImageData(0, 0, 48, 48);
}
function makeHeliImage() {
  const c = document.createElement("canvas"); c.width = c.height = 44;
  const x = c.getContext("2d"); x.translate(22, 22);
  x.strokeStyle = "#39c5ec"; x.fillStyle = "#39c5ec";
  x.shadowColor = "#39c5ec"; x.shadowBlur = 8;
  x.beginPath(); x.ellipse(0, 2, 5, 10, 0, 0, 2 * Math.PI); x.fill();  // kadłub
  x.beginPath(); x.rect(-1.5, 8, 3, 8); x.fill();                       // belka ogonowa
  x.lineWidth = 2.5;                                                    // wirnik (X)
  x.beginPath(); x.moveTo(-13, -11); x.lineTo(13, 15); x.moveTo(13, -11); x.lineTo(-13, 15); x.stroke();
  return x.getImageData(0, 0, 44, 44);
}
function makePlaneImage() {
  const c = document.createElement("canvas"); c.width = c.height = 44;
  const x = c.getContext("2d"); x.translate(22, 22);
  x.beginPath();               // sylwetka samolotu, dziób na północ
  x.moveTo(0, -14); x.lineTo(2.6, -4); x.lineTo(14, 3); x.lineTo(14, 7) ; x.lineTo(2.6, 4);
  x.lineTo(2, 11); x.lineTo(6, 14); x.lineTo(-6, 14); x.lineTo(-2, 11); x.lineTo(-2.6, 4);
  x.lineTo(-14, 7); x.lineTo(-14, 3); x.lineTo(-2.6, -4); x.closePath();
  x.fillStyle = "#39c5ec"; x.shadowColor = "#39c5ec"; x.shadowBlur = 8; x.fill();
  return x.getImageData(0, 0, 44, 44);
}

async function initMap() {
  let style = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  try { const r = await fetch(style, { method: "HEAD" }); if (!r.ok) style = FALLBACK_STYLE; }
  catch { style = FALLBACK_STYLE; }

  map = new maplibregl.Map({
    container: "map", style,
    center: FIT_VIEW.center, zoom: FIT_VIEW.zoom, pitch: 45, bearing: -8,
    antialias: true, attributionControl: false, maxPitch: 70,
  });

  map.on("load", async () => {
    // wzmocnij granice państw w stylu bazowym (domyślnie ledwo widoczne)
    for (const lyr of map.getStyle().layers || []) {
      if (lyr.type === "line" && /boundar|admin/i.test(lyr.id)) {
        try {
          map.setPaintProperty(lyr.id, "line-color", "#93a7cf");
          map.setPaintProperty(lyr.id, "line-width",
            ["interpolate", ["linear"], ["zoom"], 3, 1.2, 7, 2.4]);
          map.setPaintProperty(lyr.id, "line-opacity", 0.9);
        } catch {}
      }
    }
    for (const [t, m] of Object.entries(TYPE_META)) map.addImage("dart-" + t, makeDartImage(m.color));
    map.addImage("plane", makePlaneImage());
    map.addImage("heli", makeHeliImage());

    // każdy kraj sąsiedni własnym odcieniem — Polska (województwa) wyróżnia
    // się na ich tle jaśniejszym wypełnieniem i grubym konturem
    const COUNTRY_COLORS = {
      UKR: "#4a4030", BLR: "#4a2e33", RUS: "#3f2b3e",
      LTU: "#2e4437", LVA: "#2e3f4a", EST: "#3b3350",
      SVK: "#333d2e", CZE: "#3f3229", DEU: "#35393f",
      HUN: "#3d3348", ROU: "#2f3c42", MDA: "#43392c",
    };
    const kraje = await (await fetch("assets/kraje.geojson")).json();
    map.addSource("kraje", { type: "geojson", data: kraje });
    map.addLayer({ id: "kraje-fill", type: "fill", source: "kraje",
      paint: { "fill-color": ["match", ["get", "iso"],
          ...Object.entries(COUNTRY_COLORS).flat(), "#333"],
        "fill-opacity": 0.42 } });
    map.addLayer({ id: "kraje-line", type: "line", source: "kraje",
      paint: { "line-color": "#9db1d9", "line-opacity": 0.85,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.0, 7, 2.0] } });

    const gj = await (await fetch("assets/wojewodztwa.geojson")).json();
    voivGeo = gj;
    map.addSource("voiv", { type: "geojson", data: gj, promoteId: "nazwa" });

    map.addLayer({
      id: "voiv-extrude", type: "fill-extrusion", source: "voiv",
      paint: {
        "fill-extrusion-color": ["match", ["coalesce", ["feature-state", "level"], "none"],
          "high", "#ff4d5e", "elevated", "#ffb020", "#233252"],
        "fill-extrusion-height": ["*", ["coalesce", ["feature-state", "score"], 0], 16000],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.55,
      },
    });
    map.addLayer({
      id: "voiv-line", type: "line", source: "voiv",
      paint: { "line-color": ["case",
          ["in", ["get", "nazwa"], ["literal", PRIORITY]], "rgba(140,175,255,.75)",
          "rgba(120,150,210,.38)"],
        "line-width": ["case", ["in", ["get", "nazwa"], ["literal", PRIORITY]], 2.0, 1.0] },
    });

    map.addSource("trails", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "trails", type: "line", source: "trails",
      paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.5,
               "line-dasharray": [1.5, 1.5] } });

    map.addSource("uncertainty", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "uncertainty", type: "fill", source: "uncertainty",
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.10 } });
    map.addLayer({ id: "uncertainty-line", type: "line", source: "uncertainty",
      paint: { "line-color": ["get", "color"], "line-opacity": 0.35, "line-width": 1 } });

    map.addSource("threats", { type: "geojson", data: emptyFC() });
    // poświata pod ikoną = większy, czytelny obszar kliknięcia
    map.addLayer({ id: "threats-glow", type: "circle", source: "threats",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 18],
        "circle-color": ["get", "color"], "circle-opacity": 0.16,
        "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.45,
        "circle-stroke-width": 1 } });
    map.addLayer({ id: "threats", type: "symbol", source: "threats",
      layout: { "icon-image": ["concat", "dart-", ["get", "type"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 0.85],
        "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map",
        "icon-allow-overlap": true },
    });

    map.addSource("adsb", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "adsb", type: "symbol", source: "adsb",
      layout: { "icon-image": ["case", ["==", ["get", "heli"], true], "heli", "plane"],
        "icon-size": 0.62,
        "icon-rotate": ["get", "track"], "icon-rotation-alignment": "map",
        "icon-allow-overlap": true },
    });

    for (const layer of ["threats", "threats-glow"]) {
      map.on("click", layer, (e) => openThreatPopup(e.lngLat, e.features?.[0]?.properties));
      map.on("mouseenter", layer, () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", layer, () => map.getCanvas().style.cursor = "");
    }
    map.on("click", "adsb", (e) => openPlanePopup(e.lngLat, e.features?.[0]?.properties));
    map.on("mouseenter", "adsb", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "adsb", () => map.getCanvas().style.cursor = "");
    map.on("click", "voiv-extrude", (e) => {
      // nie otwieraj karty województwa, gdy kliknięto obiekt
      const hit = map.queryRenderedFeatures(e.point,
        { layers: ["threats", "threats-glow", "adsb"] });
      if (hit.length) return;
      const name = e.features?.[0]?.properties?.nazwa;
      if (name) { openCard(name); }
    });

    // obrys mojego województwa
    map.addLayer({ id: "my-voiv", type: "line", source: "voiv",
      filter: ["==", ["get", "nazwa"], myVoiv() || "—"],
      paint: { "line-color": "#7fb0ff", "line-width": 3, "line-opacity": 0.95,
        "line-blur": 0.4 } });

    mapReady = true;
    if (state) { updateVoivStates(); updateAdsb(); }
    if (myVoiv()) goHome(true);
    requestAnimationFrame(animate);
  });
}

const emptyFC = () => ({ type: "FeatureCollection", features: [] });

/* dymki — wspólne dla kliknięcia w mapę i w pozycję listy */
function openThreatPopup(lngLat, p) {
  if (!p) return;
  const meta = TYPE_META[p.type] || { label: p.type, color: "#8a93a6" };
  new maplibregl.Popup({ closeButton: true, maxWidth: "290px" })
    .setLngLat(lngLat)
    .setHTML(`<div style="font:12.5px 'Segoe UI';color:#16202f;line-height:1.45">
      <b style="color:${meta.color};filter:brightness(.75)">◆ ${meta.label}</b><br>
      ${p.opis ? esc2(p.opis) + "<br>" : ""}
      wiarygodność: <b>${esc2(CONF_PL[p.confidence] || p.confidence)}</b>
        · niepewność pozycji: <b>±${p.uncertainty} km</b><br>
      ${p.heading != null ? `kurs: ${Math.round(p.heading)}° (${compass(p.heading)}) · ` : ""}
      odległość od granicy PL: <b>${p.dist_km ?? "?"} km</b><br>
      <span style="color:#68758c">Dane: NEPTUN — agregator OSINT, nie radar
      wojskowy</span></div>`)
    .addTo(map);
}

function openPlanePopup(lngLat, p) {
  if (!p) return;
  const role = acRole(p.actype, p.desc);
  const vr = typeof p.vr === "number" ? p.vr : null;
  new maplibregl.Popup({ closeButton: true, maxWidth: "300px" })
    .setLngLat(lngLat)
    .setHTML(`<div style="font:12.5px 'Segoe UI';color:#16202f;line-height:1.5">
      <b>${p.heli ? "🚁" : "✈"} ${esc2(p.callsign || p.hex || "?")}</b>
        ${p.reg ? "· rej. " + esc2(p.reg) : ""}<br>
      <b>${esc2(acName(p.actype, p.desc))}</b>${p.year ? " (" + esc2(p.year) + ")" : ""}<br>
      ${role ? "przeznaczenie: <b>" + esc2(role) + "</b><br>" : ""}
      ${p.op ? "operator: " + esc2(p.op) + "<br>" : ""}
      ${altText(p.alt)}
      ${vr ? (vr > 100 ? " ↑ wznosi się" : vr < -100 ? " ↓ obniża lot" : "") : ""}<br>
      ${p.gs != null ? `prędkość: ${ktToKmh(p.gs)} km/h · ` : ""}
      ${p.track != null ? `kurs ${Math.round(p.track)}° (${compass(p.track)})` : "kurs b.d."}<br>
      <span style="color:#68758c">publiczny transponder ADS-B — bez trasy
      startu/celu (wojsko ich nie publikuje)</span></div>`)
    .addTo(map);
}

function updateVoivStates() {
  const voivs = state?.fusion?.voivodeships || {};
  for (const [name, st] of Object.entries(voivs)) {
    map.setFeatureState({ source: "voiv", id: name },
      { score: Math.min(st.score, 8), level: st.level });
  }
}

/* okrąg geograficzny (przybliżony) do wizualizacji uncertaintyKm */
function circleCoords(lat, lon, km) {
  const out = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    out.push([lon + (km / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(a),
              lat + (km / 110.57) * Math.cos(a)]);
  }
  return [out];
}

/* Własny ślad obserwacyjny: `trail` z Neptuna zawiera zwykle 0–2 punkty, i to
   zduplikowane (sprawdzone na żywych danych), więc historia lotu z samego API
   praktycznie nie istnieje. Zapisujemy więc każdą zaobserwowaną zmianę pozycji
   i z tego rysujemy trajektorię. */
const localTrails = new Map();   // id -> [{lat, lon, t}]
const TRAIL_MIN_KM = 0.7, TRAIL_MAX_PTS = 60;

function recordTrails(threats) {
  const alive = new Set();
  for (const t of threats) {
    if (t.lat == null || !t.id) continue;
    alive.add(t.id);
    const arr = localTrails.get(t.id) || [];
    const last = arr[arr.length - 1];
    const far = !last || Math.hypot((t.lat - last.lat) * 110.57,
      (t.lon - last.lon) * 111.32 * Math.cos(t.lat * Math.PI / 180)) > TRAIL_MIN_KM;
    if (far) {
      arr.push({ lat: t.lat, lon: t.lon, t: Date.now() });
      if (arr.length > TRAIL_MAX_PTS) arr.shift();
      localTrails.set(t.id, arr);
    }
  }
  for (const id of localTrails.keys()) if (!alive.has(id)) localTrails.delete(id);
}

/* Ślad przelotu: Neptun powtarza w `trail` tę samą pozycję przy każdej
   aktualizacji, więc surowa lista daje zdegenerowaną linię (punkt).
   Zostawiamy tylko realnie różne pozycje. */
function cleanTrail(t) {
  const out = [];
  for (const p of t.trail || []) {
    if (p.lat == null || p.lon == null) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last.lat - p.lat) < 1e-4 && Math.abs(last.lon - p.lon) < 1e-4) continue;
    out.push(p);
  }
  return out;
}

/* Prędkość liczona z ostatniego realnego odcinka śladu — pole `velocity`
   w danych Neptuna praktycznie nie występuje (sprawdzone na żywym API),
   więc bez tego dead-reckoning nigdy by nie ruszył znacznika. */
const TYPE_SPEED_KMH = { uav: 180, shahed: 180, fpv: 100, missile: 800, cruise: 800,
  ballistic: 3000, kab: 900, mig31k: 900 };
function trackSpeed(t) {
  const tr = cleanTrail(t);
  if (tr.length >= 2) {
    const a = tr[tr.length - 2], b = tr[tr.length - 1];
    const dt = (new Date(b.t).getTime() - new Date(a.t).getTime()) / 3600000;
    if (dt > 0.0008) {                       // ≥3 s różnicy — inaczej szum
      const dKm = Math.hypot((b.lat - a.lat) * 110.57,
        (b.lon - a.lon) * 111.32 * Math.cos(b.lat * Math.PI / 180));
      const v = dKm / dt;
      if (v > 20 && v < 4000) return v;      // odrzuć artefakty
    }
  }
  return TYPE_SPEED_KMH[t.type] ?? null;     // zapas: prędkość typowa dla klasy
}

/* dead-reckoning między aktualizacjami serwera (jak predict() w SDK Neptuna) */
function predict(t, nowMs) {
  let lat = t.lat, lon = t.lon;
  const hdg = t.velocity?.bearingDeg ?? t.heading;
  const speed = t.velocity?.speedKmh ?? trackSpeed(t);
  if (speed && hdg != null) {
    const dth = Math.min((nowMs - threatsReceivedAt) / 3600000, 10 / 60);  // maks. 10 min
    const d = speed * dth;
    lat += (d / 110.57) * Math.cos(hdg * Math.PI / 180);
    lon += (d / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.sin(hdg * Math.PI / 180);
  }
  return { lat, lon };
}

let lastAnim = 0;
function animate(ts) {
  requestAnimationFrame(animate);
  if (!mapReady || !state || histMode || ts - lastAnim < 200) return;
  lastAnim = ts;
  const now = Date.now();
  const threats = state.neptun?.threats || [];
  const pts = [], trails = [], unc = [];
  for (const t of threats) {
    if (t.lat == null) continue;
    const meta = TYPE_META[t.type] || { color: "#8a93a6" };
    const p = predict(t, now);
    pts.push({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { type: TYPE_META[t.type] ? t.type : "fpv", heading: t.heading ?? 0,
        color: meta.color,
        confidence: t.confidenceLevel || "?", uncertainty: t.uncertaintyKm ?? "?",
        opis: threatDesc(t), dist_km: t.pl_assessment?.dist_km } });
    if (t.uncertaintyKm)
      unc.push({ type: "Feature", properties: { color: meta.color },
        geometry: { type: "Polygon", coordinates: circleCoords(p.lat, p.lon, t.uncertaintyKm) } });
    // ślad = to, co dało API + to, co sami zaobserwowaliśmy + pozycja bieżąca
    const seen = new Set();
    const coords = [];
    for (const q of [...cleanTrail(t), ...(localTrails.get(t.id) || []), { lat: p.lat, lon: p.lon }]) {
      const key = q.lat.toFixed(3) + "," + q.lon.toFixed(3);
      if (seen.has(key)) continue;
      seen.add(key); coords.push([q.lon, q.lat]);
    }
    if (coords.length >= 2)
      trails.push({ type: "Feature", properties: { color: meta.color },
        geometry: { type: "LineString", coordinates: coords } });
  }
  map.getSource("threats")?.setData({ type: "FeatureCollection", features: pts });
  map.getSource("trails")?.setData({ type: "FeatureCollection", features: trails });
  map.getSource("uncertainty")?.setData({ type: "FeatureCollection", features: unc });
}

function updateAdsb() {
  const planes = state?.adsb?.aircraft || [];
  map.getSource("adsb")?.setData({ type: "FeatureCollection",
    features: planes.map(p => ({ type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { track: p.track ?? 0, callsign: p.callsign, hex: p.hex,
        actype: p.type, desc: p.desc, alt: p.alt, gs: p.gs,
        reg: p.reg, op: p.op, vr: p.vr, year: p.year,
        heli: isHeli(p.cat, p.type, p.desc) } })) });
}

/* ── panel boczny ────────────────────────────────────────────────────────── */
function relTime(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (d < 1) return "przed chwilą";
  if (d < 60) return `${Math.round(d)} min temu`;
  return `${Math.floor(d / 60)} h ${Math.round(d % 60)} min temu`;
}
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const esc2 = esc;

function renderPanel() {
  const f = state?.fusion; if (!f) return;
  document.getElementById("window-min").textContent = f.window_min;

  const mine = myVoiv();
  const voivs = Object.entries(f.voivodeships)
    .sort((a, b) => (b[1].score - a[1].score) ||
      (PRIORITY.indexOf(a[0]) + 99) - (PRIORITY.indexOf(b[0]) + 99));
  // zawsze: mój region + priorytetowe + wszystkie z jakimkolwiek sygnałem
  const show = voivs.filter(([n, st]) => st.score > 0 || PRIORITY.includes(n) || n === mine);
  if (mine) show.sort((a, b) => (b[0] === mine) - (a[0] === mine));
  document.getElementById("voiv-cards").innerHTML = show.map(([name, st]) => `
    <div class="voiv-card level-${st.level}${name === mine ? " is-mine" : ""}" data-voiv="${esc(name)}">
      <div class="voiv-head">
        <span class="voiv-name">${esc(name)}</span>
        <span class="voiv-score">${st.score.toFixed(1)} pkt</span>
      </div>
      <div class="voiv-level">${st.level === "none" && st.score > 0
        ? "poniżej progu" : LEVEL_LABEL[st.level]}
        <span class="muted">· progi: ≥${f.thresholds.elevated} uwaga, ≥${f.thresholds.high} priorytet</span></div>
      <div class="voiv-breakdown">${st.signals.length
        ? st.signals.map(sigHTML).join("")
        : '<div class="fineprint">brak sygnałów w oknie</div>'}
        ${camIndex?.has(name)
          ? `<button class="chip btn-cams" data-voiv="${esc(name)}">📷 Kamery w regionie
               (${camData[name].filter(c => c.outdoor !== false).length})</button>`
          : ""}</div>
    </div>`).join("");
  document.querySelectorAll(".voiv-card").forEach(el =>
    el.addEventListener("click", () => el.classList.toggle("open")));
  document.querySelectorAll(".btn-cams").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); showCameras(el.dataset.voiv); }));

  // baner mojego regionu — zawsze widoczny, niezależnie od panelu
  const banner = document.getElementById("my-banner");
  if (mine && f.voivodeships[mine]) {
    const st = f.voivodeships[mine];
    banner.className = "level-" + st.level;
    banner.innerHTML = `<b>${esc(mine)}</b> — <span class="lvl">${LEVEL_LABEL[st.level]}</span>
      <span class="muted">${st.score.toFixed(1)} pkt</span>`;
    banner.onclick = () => { setPanel(true); openCard(mine); };
  } else {
    banner.className = "hidden";
    banner.innerHTML = "";
  }

  const sigs = [];
  for (const [name, st] of voivs) for (const s of st.signals) sigs.push(s);
  sigs.sort((a, b) => b.ts.localeCompare(a.ts));
  document.getElementById("signal-list").innerHTML = sigs.map(sigHTML).join("");

  const near = (state.neptun?.threats || [])
    .filter(t => t.pl_assessment && t.pl_assessment.dist_km <= 250)
    .sort((a, b) => a.pl_assessment.dist_km - b.pl_assessment.dist_km);
  document.getElementById("threat-list").innerHTML = near.map(t => {
    const m = TYPE_META[t.type] || { label: t.type, color: "#8a93a6" };
    const a = t.pl_assessment;
    return `<div class="threat-row clickable" data-lat="${t.lat}" data-lon="${t.lon}"
      data-kind="threat" data-id="${esc(t.id)}">
      <b style="color:${m.color}">${esc(m.label)}</b>
      — ${a.dist_km} km od granicy (${esc(a.border_voiv)})${a.toward_pl ? " · <b style='color:#ff4d5e'>kurs na PL</b>" : ""}
      <div class="meta">wiarygodność: ${esc(CONF_PL[t.confidenceLevel] || t.confidenceLevel)}
        · ±${esc(t.uncertaintyKm)} km · ${esc(threatDesc(t))} · ${relTime(t.updatedAt)}</div>
    </div>`;
  }).join("");

  const planes = state.adsb?.aircraft || [];
  document.getElementById("adsb-list").innerHTML = planes.map(p => {
    const role = acRole(p.type, p.desc);
    const heli = isHeli(p.cat, p.type, p.desc);
    const vr = typeof p.vr === "number" ? p.vr : null;
    return `
    <div class="threat-row clickable" style="background:rgba(57,197,236,.07)"
         data-lat="${p.lat}" data-lon="${p.lon}" data-kind="plane">
      <b style="color:#39c5ec">${heli ? "🚁" : "✈"} ${esc(p.callsign || p.hex)}</b>
      ${esc(acName(p.type, p.desc))}${p.year ? ` <span class="meta">(${esc(p.year)})</span>` : ""}
      ${role ? `<div style="color:#9fd8ec;font-size:11px">${esc(role)}</div>` : ""}
      <div class="meta">
        woj. ${esc(p.voivodeship)}
        · ${altText(p.alt)}
        ${vr ? (vr > 100 ? " ↑" : vr < -100 ? " ↓" : "") : ""}
        ${p.gs != null ? ` · ${ktToKmh(p.gs)} km/h` : ""}
        ${p.track != null ? ` · kurs ${Math.round(p.track)}° (${compass(p.track)})` : ""}
      </div>
      <div class="meta">${p.reg ? "rej. " + esc(p.reg) : ""}${p.op ? " · " + esc(p.op) : ""}</div>
    </div>`;
  }).join("");

  // listenery dopiero teraz — wcześniej listy nie istnieją jeszcze w DOM
  document.querySelectorAll(".threat-row.clickable").forEach(el =>
    el.addEventListener("click", () => focusOnMap(el.dataset)));
}

function sigHTML(s) {
  const link = s.details?.link || s.details?.url;
  const cp = s.counted_points ?? s.points;
  const capped = cp < s.points;
  return `<div class="sig src-${esc(s.source)}">
    <span class="pts" ${capped ? 'style="color:var(--muted)" title="ponad limit tej klasy źródła — nie liczony do sumy"' : ""}>+${cp}${capped ? ` <s>${s.points}</s>` : ""}</span>
    <span class="src">${esc(s.source.toUpperCase())}</span>
    ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}
    <div class="ts">${relTime(s.ts)} · woj. ${esc(s.voivodeship)}</div>
  </div>`;
}

function openCard(name) {
  setPanel(true);   // klasa "open" była pozostałością po starym układzie panelu
  const el = document.querySelector(`.voiv-card[data-voiv="${CSS.escape(name)}"]`);
  if (el) { el.classList.add("open"); el.scrollIntoView({ behavior: "smooth" }); }
}

function renderLeds() {
  const h = state?.health || {};
  const rssOk = h.rss && Object.values(h.rss).some(Boolean);
  const items = [["NEPTUN", h.neptun], ["ADS-B", h.adsb], ["RSS", rssOk],
                 ["RCB", h.rcb], ["PAŻP", h.pansa]];
  document.getElementById("status-leds").innerHTML = items.map(([n, ok]) =>
    `<span class="led ${ok ? "ok" : "err"}" title="${n}: ${ok ? "OK" : "niedostępne"}"><i></i><span>${n}</span></span>`).join("");
}

/* ── alarm dźwiękowy przy poziomie WYSOKI ────────────────────────────────── */
let lastMood = "none";
function updateAlarmMood() {
  const voivs = state?.fusion?.voivodeships || {};
  const mine = myVoiv();
  // liczy się poziom mojego regionu; bez ustawionej lokalizacji — najwyższy w kraju
  const level = mine && voivs[mine] ? voivs[mine].level
    : Object.values(voivs).some(v => v.level === "high") ? "high"
    : Object.values(voivs).some(v => v.level === "elevated") ? "elevated" : "none";
  const order = ["none", "elevated", "high"];
  if (order.indexOf(level) > order.indexOf(lastMood)) {
    if (level === "high") {
      const voiv = mine && voivs[mine]?.level === "high" ? mine
        : Object.entries(voivs).find(([, v]) => v.level === "high")?.[0];
      showAlarm(voiv, voivs[voiv]);   // ciągła syrena + popup do potwierdzenia
      // ostrzeżenie o nieoficjalnym źródle musi wrócić, gdy robi się poważnie
      document.getElementById("disclaimer").classList.remove("hidden");
    } else if (level === "elevated") {
      attentionChime();
    }
  }
  lastMood = level;
}

/* ── pełnoekranowy alarm z ręcznym potwierdzeniem ────────────────────────── */
const alarmOverlay = document.getElementById("alarm-overlay");
function showAlarm(voiv, st) {
  if (!voiv || !st) return;
  document.getElementById("alarm-voiv").textContent = "woj. " + voiv;
  document.getElementById("alarm-score").textContent =
    `${st.score.toFixed(1)} pkt w oknie ${state?.fusion?.window_min ?? 60} min`;
  document.getElementById("alarm-signals").innerHTML =
    (st.signals || []).slice(0, 5).map(sigHTML).join("") || "";
  document.getElementById("alarm-time").textContent =
    "alarm o " + new Date().toLocaleTimeString("pl-PL");
  alarmOverlay.classList.remove("hidden");
  airRaidSiren(true);          // ciągła — milknie dopiero po potwierdzeniu
}
document.getElementById("alarm-ack").onclick = () => {
  stopSiren();
  alarmOverlay.classList.add("hidden");
  setPanel(true);
};

let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/* żółty poziom — wyrazisty dwutonowy sygnał uwagi (jak gong ostrzegawczy):
   dwa naprzemienne tony w trzech powtórzeniach, wyraźnie głośniejsze niż zwykły
   „ping", ale wciąż bez charakteru alarmu. */
function attentionChime() {
  try {
    const c = ctx(), t0 = c.currentTime;
    const SEQ = [740, 988, 740, 988, 740, 988];   // fis2 ↔ h2
    const DUR = 0.34, GAP = 0.06;
    SEQ.forEach((f, i) => {
      const s = t0 + i * (DUR + GAP);
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = "square"; o2.type = "sine";
      o.frequency.value = f; o2.frequency.value = f * 2;   // oktawa dla ostrości
      const g2 = c.createGain(); g2.gain.value = 0.35;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.55, s + 0.015);
      g.gain.setValueAtTime(0.55, s + DUR - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, s + DUR);
      o.start(s); o.stop(s + DUR); o2.start(s); o2.stop(s + DUR);
    });
    if (navigator.vibrate) navigator.vibrate([220, 120, 220]);
  } catch {}
}

/* czerwony poziom — CIĄGŁA syrena alarmu powietrznego (modulacja 380↔860 Hz).
   Gra do momentu ręcznego potwierdzenia przez użytkownika (stopSiren()),
   tak jak prawdziwy sygnał „ogłoszenie alarmu" nie milknie sam z siebie. */
let sirenNodes = null, sirenTimer = null, vibrateTimer = null;
const SIREN_UP = 2.0, SIREN_DOWN = 2.0, SIREN_LO = 380, SIREN_HI = 860;

function scheduleSirenSweeps(o, fromTime, cycles) {
  for (let i = 0; i < cycles; i++) {
    const s = fromTime + i * (SIREN_UP + SIREN_DOWN);
    o.frequency.exponentialRampToValueAtTime(SIREN_HI, s + SIREN_UP);
    o.frequency.exponentialRampToValueAtTime(SIREN_LO, s + SIREN_UP + SIREN_DOWN);
  }
  return fromTime + cycles * (SIREN_UP + SIREN_DOWN);
}

function airRaidSiren(continuous = true) {
  try {
    stopSiren();
    const c = ctx(), t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), filt = c.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 2200;
    o.type = "sawtooth";
    o.connect(filt); filt.connect(g); g.connect(c.destination);
    o.frequency.setValueAtTime(SIREN_LO, t0);
    let until = scheduleSirenSweeps(o, t0, 3);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.3);
    o.start(t0);
    sirenNodes = { o, g, c };

    if (continuous) {
      // dokładaj kolejne cykle, zanim zaplanowane się skończą
      sirenTimer = setInterval(() => {
        if (!sirenNodes) return;
        until = scheduleSirenSweeps(o, Math.max(until, c.currentTime), 3);
      }, (SIREN_UP + SIREN_DOWN) * 2500);
      if (navigator.vibrate) {
        const pulse = () => navigator.vibrate([700, 300, 700, 300, 900]);
        pulse(); vibrateTimer = setInterval(pulse, 4000);
      }
    } else {
      // tryb testowy — wycisz po trzech cyklach
      const total = 3 * (SIREN_UP + SIREN_DOWN);
      g.gain.setValueAtTime(0.4, t0 + total - 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
      o.stop(t0 + total + 0.1);
      setTimeout(() => { sirenNodes = null; }, total * 1000 + 200);
      if (navigator.vibrate) navigator.vibrate([700, 300, 700]);
    }
  } catch {}
}

function stopSiren() {
  if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null; }
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} }
  if (sirenNodes) {
    const { o, g, c } = sirenNodes;
    try {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
      o.stop(c.currentTime + 0.4);
    } catch {}
    sirenNodes = null;
  }
}
// przeglądarki blokują dźwięk do pierwszej interakcji — odblokuj przy kliknięciu
window.addEventListener("pointerdown", () => { try { ctx(); } catch {} }, { once: true });

/* ── web push ────────────────────────────────────────────────────────────── */
/* ── komunikaty (toast) ──────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg, ms = 3800) {
  const el = document.getElementById("toast");
  el.innerHTML = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}

/* ── dzwonek: przełącznik powiadomień z czytelnym stanem ─────────────────── */
const NOTIF_KEY = "straznik_notif_on";
const notifWanted = () => localStorage.getItem(NOTIF_KEY) !== "0";

async function notifPermission() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try { return (await LN.checkPermissions()).display; } catch { return "unknown"; }
  }
  if ("Notification" in window) return Notification.permission === "granted"
    ? "granted" : Notification.permission === "denied" ? "denied" : "prompt";
  return "unsupported";
}

async function refreshBell() {
  const btn = document.getElementById("btn-push");
  const perm = await notifPermission();
  const on = notifWanted() && perm === "granted";
  btn.classList.toggle("active", on);
  btn.title = on ? "Powiadomienia włączone — kliknij, aby wyciszyć"
                 : "Powiadomienia wyciszone — kliknij, aby włączyć";
  return { perm, on };
}

async function toggleBell() {
  const { perm, on } = await refreshBell();
  if (on) {                       // wyłączamy — tylko lokalnie, bez ruszania systemu
    localStorage.setItem(NOTIF_KEY, "0");
    await refreshBell();
    toast("🔕 <b>Powiadomienia wyciszone.</b><br>Alarmy dalej widać w aplikacji "
        + "(kolory, syrena), ale nie dostaniesz powiadomień systemowych.");
    return;
  }
  localStorage.setItem(NOTIF_KEY, "1");
  if (perm === "granted") {
    await refreshBell();
    toast("🔔 <b>Powiadomienia włączone.</b><br>Dostaniesz je przy poziomie żółtym "
        + "i czerwonym dla swojego regionu.");
    return;
  }
  if (perm === "denied") {
    toast("⚠️ System blokuje powiadomienia dla Strażnika.<br>"
        + "Włącz je w ustawieniach Androida (⚙ → Ustawienia powiadomień).", 6000);
    await refreshBell();
    return;
  }
  // brak decyzji — poproś o zgodę
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  try {
    if (LN) await LN.requestPermissions();
    else if ("Notification" in window) await Notification.requestPermission();
  } catch {}
  const after = await refreshBell();
  toast(after.on
    ? "🔔 <b>Powiadomienia włączone.</b><br>Dostaniesz je przy poziomie żółtym i czerwonym."
    : "🔕 Nie przyznano zgody — powiadomienia systemowe pozostają wyłączone.");
}

async function enablePush() {
  if (standalone) return toggleBell();
  const base = apiBase(); if (!base) return openSettings(true);
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return alert("Ta przeglądarka nie wspiera Web Push. Użyj ntfy/Telegrama.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  const reg = await navigator.serviceWorker.register("sw.js");
  const { publicKey } = await (await fetch(base + "/api/push/key")).json();
  if (!publicKey) return alert("Backend nie ma skonfigurowanego Web Push.");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(publicKey.length + (4 - publicKey.length % 4) % 4, "=")), c => c.charCodeAt(0)),
  });
  await fetch(base + "/api/push/subscribe", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  document.getElementById("btn-push").classList.add("active");
}

/* ── geometria: bbox i punkt-w-wielokącie dla GeoJSON województw ─────────── */
function featureFor(name) {
  return voivGeo?.features.find(f => f.properties.nazwa === name) || null;
}
function bboxOf(feature) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    } else c.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  return [[minX, minY], [maxX, maxY]];
}
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function voivAt(lon, lat) {
  for (const f of voivGeo?.features || []) {
    const polys = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      if (ringContains(poly[0], lon, lat) &&
          !poly.slice(1).some(hole => ringContains(hole, lon, lat)))
        return f.properties.nazwa;
    }
  }
  return null;
}

/* ── kamera ──────────────────────────────────────────────────────────────── */
function goHome(instant) {
  const name = myVoiv();
  if (!name) return fitAll(instant);
  const f = featureFor(name);
  if (!f) return fitAll(instant);
  map.fitBounds(bboxOf(f), { padding: 90, pitch: is3d ? 50 : 0,
    duration: instant ? 0 : 900, maxZoom: 8.5 });
}
function fitAll(instant) {
  map.easeTo({ ...FIT_VIEW, pitch: is3d ? 45 : 0, bearing: is3d ? -8 : 0,
    duration: instant ? 0 : 900 });
}

/* ── przelot mapy do obiektu wybranego z listy ───────────────────────────── */
function focusOnMap(d) {
  const lat = parseFloat(d.lat), lon = parseFloat(d.lon);
  if (!mapReady || !isFinite(lat) || !isFinite(lon)) return;
  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 7.6),
    speed: 1.2, essential: true });
  // na wąskim ekranie panel zasłania mapę — schowaj go po wyborze
  if (window.matchMedia("(max-width: 860px)").matches) setPanel(false);
  map.once("moveend", () => {
    const layers = (d.kind === "plane" ? ["adsb"] : ["threats", "threats-glow"])
      .filter(l => map.getLayer(l));
    const pt = map.project([lon, lat]);
    const hits = map.queryRenderedFeatures(
      [[pt.x - 26, pt.y - 26], [pt.x + 26, pt.y + 26]], { layers });
    const props = hits[0]?.properties;
    if (!props) return;
    const at = hits[0].geometry?.coordinates || [lon, lat];
    if (d.kind === "plane") openPlanePopup(at, props); else openThreatPopup(at, props);
  });
}

/* ── kamery drogowe w regionie ───────────────────────────────────────────── */
let camData = null, camTimer = null, camIndex = null;

/* Lista województw z kamerami ładowana z danych, nie zaszyta na sztywno —
   dzięki temu przycisk pojawia się wszędzie tam, gdzie faktycznie coś jest. */
async function loadCams() {
  if (camData) return camData;
  try { camData = await (await fetch("assets/kamery.json")).json(); }
  catch { camData = {}; }
  camIndex = new Set(Object.entries(camData).filter(([, l]) => l.length).map(([v]) => v));
  return camData;
}
loadCams().then(() => { if (state) renderPanel(); });

async function showCameras(voiv) {
  await loadCams();
  const list = camData[voiv] || [];
  const outdoor = list.filter(c => c.outdoor !== false);
  const indoor = list.filter(c => c.outdoor === false);
  const dlg = document.getElementById("cameras");
  document.getElementById("cam-title").textContent =
    `Kamery — woj. ${voiv} (${outdoor.length} plenerowych)`;

  const tile = (c) => `
    <a class="cam-tile" href="${esc(c.url)}" target="_blank" rel="noopener"
       title="${esc(c.name)} — ${esc(c.city)}">
      <img src="${esc(c.thumb)}" alt="${esc(c.name)}"
           onerror="this.parentElement.classList.add('cam-dead')">
      <span>${esc(c.name)}</span>
    </a>`;
  // grupowanie po miejscowości, żeby dało się szybko znaleźć swoją okolicę
  const groupBy = (arr) => {
    const by = {};
    for (const c of arr) (by[c.city] ||= []).push(c);
    return Object.entries(by).map(([city, cams]) =>
      `<div class="cam-city">${esc(city)}</div>
       <div class="cam-grid">${cams.map(tile).join("")}</div>`).join("");
  };

  document.getElementById("cam-list").innerHTML = list.length
    ? groupBy(outdoor) + (indoor.length ? `
        <details class="cam-indoor">
          <summary>Kamery wnętrzowe (${indoor.length}) — transmisje z kościołów,
            mało przydatne do oceny sytuacji na zewnątrz</summary>
          ${groupBy(indoor)}
        </details>` : "")
    : '<div class="fineprint">Brak zweryfikowanych kamer dla tego województwa.</div>';
  dlg.showModal();
  // odświeżanie miniatur, dopóki okno jest otwarte
  clearInterval(camTimer);
  camTimer = setInterval(() => {
    if (!dlg.open) return clearInterval(camTimer);
    document.querySelectorAll("#cam-list img").forEach(img => {
      const base = img.src.split("?")[0];
      img.src = base + "?t=" + Date.now();
    });
  }, 30000);
}
document.getElementById("cam-close").onclick = () => {
  clearInterval(camTimer);
  document.getElementById("cameras").close();
};

/* ── historia 12 h ───────────────────────────────────────────────────────── */
let histTimes = [], histMode = false;

async function fetchHistory(at) {
  if (standalone) return Engine.history(at);
  const base = apiBase(); if (!base) return null;
  const url = base + "/api/history" + (at ? `?at=${encodeURIComponent(at)}` : "");
  const r = await fetch(url);
  return r.ok ? await r.json() : null;
}

/* Kolorowanie osi czasu: tło suwaka odwzorowuje poziom zagrożenia w każdym
   momencie (szary → bursztyn → czerwony), żeby od razu było widać, kiedy coś
   się działo. */
let timelinePoints = [];
function paintTimeline(points) {
  timelinePoints = points || [];
  const slider = document.getElementById("tb-slider");
  if (!points?.length) { slider.style.removeProperty("--tl"); return; }
  const color = (p) => p.level === "high" ? "#ff4d5e"
    : p.level === "elevated" ? "#ffb020"
    : p.score > 0 ? "#4a5c86" : "#2a3550";
  const n = points.length;
  const stops = points.map((p, i) => {
    const a = (i / n * 100).toFixed(2), b = ((i + 1) / n * 100).toFixed(2);
    return `${color(p)} ${a}%, ${color(p)} ${b}%`;
  }).join(", ");
  slider.style.setProperty("--tl", `linear-gradient(90deg, ${stops})`);
}

async function fetchTimeline() {
  if (standalone) return Engine.timeline();
  const base = apiBase(); if (!base) return [];
  try {
    const r = await fetch(base + "/api/history/timeline?hours=12");
    return r.ok ? (await r.json()).points || [] : [];
  } catch { return []; }
}

async function toggleHistory() {
  const bar = document.getElementById("timebar");
  if (histMode) return exitHistory();
  const h = await fetchHistory();
  histTimes = h?.times || [];
  paintTimeline(await fetchTimeline());
  if (!histTimes.length) {
    document.getElementById("tb-info").textContent =
      "Brak zapisanej historii — migawki powstają co 2 minuty od uruchomienia.";
    bar.classList.remove("hidden");
    setTimeout(() => bar.classList.add("hidden"), 3500);
    return;
  }
  histMode = true;
  document.body.classList.add("history-mode");
  bar.classList.remove("hidden");
  const slider = document.getElementById("tb-slider");
  slider.max = String(histTimes.length - 1);
  slider.value = String(histTimes.length - 1);
  document.getElementById("btn-history").classList.add("active");
  await showHistoryAt(histTimes.length - 1);
}

function exitHistory() {
  histMode = false;
  document.body.classList.remove("history-mode");
  document.getElementById("timebar").classList.add("hidden");
  document.getElementById("btn-history").classList.remove("active");
  if (state) { renderPanel(); if (mapReady) { updateVoivStates(); updateAdsb(); } }
}

async function showHistoryAt(idx) {
  const ts = histTimes[idx];
  if (!ts) return;
  const h = await fetchHistory(ts);
  const snap = h?.snapshot;
  const when = new Date(snap?.ts || ts);
  const ageMin = Math.round((Date.now() - when.getTime()) / 60000);
  document.getElementById("tb-label").textContent =
    when.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    + (ageMin > 1 ? ` (−${ageMin} min)` : " (teraz)");
  const sigs = h?.signals || [];
  const threats = snap?.threats || [];
  const planes = snap?.aircraft || [];
  // poziom w wybranym momencie — kolor kciuka suwaka i podsumowanie
  const tp = timelinePoints[idx];
  const slider = document.getElementById("tb-slider");
  slider.dataset.level = tp?.level || "none";
  document.getElementById("tb-info").innerHTML =
    (tp && tp.score > 0
      ? `<b style="color:${tp.level === "high" ? "var(--red)"
          : tp.level === "elevated" ? "var(--amber)" : "var(--muted)"}">`
        + `${tp.score} pkt${tp.voiv ? " · woj. " + esc(tp.voiv) : ""}</b> · `
      : "")
    + `${threats.length} obiektów · ${planes.length} maszyn wojskowych · ${sigs.length} sygnałów w oknie`;

  if (mapReady) {
    // migawka nie zawiera śladów — rysujemy pozycje historyczne bez animacji
    map.getSource("threats")?.setData({ type: "FeatureCollection",
      features: threats.filter(t => t.lat != null).map(t => ({ type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { type: TYPE_META[t.type] ? t.type : "fpv", heading: t.heading ?? 0,
          color: (TYPE_META[t.type] || {}).color || "#8a93a6",
          confidence: t.confidenceLevel || "?", uncertainty: t.uncertaintyKm ?? "?",
          opis: threatDesc(t), dist_km: t.pl_assessment?.dist_km } })) });
    map.getSource("trails")?.setData(emptyFC());
    map.getSource("uncertainty")?.setData(emptyFC());
    map.getSource("adsb")?.setData({ type: "FeatureCollection",
      features: planes.map(p => ({ type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { track: p.track ?? 0, callsign: p.callsign, hex: p.hex,
          actype: p.type, desc: p.desc, alt: p.alt, gs: p.gs, reg: p.reg,
          heli: isHeli(p.cat, p.type, p.desc) } })) });
    // kolorowanie województw wg sygnałów z tamtego momentu
    const per = {};
    for (const s of sigs) per[s.voivodeship] = (per[s.voivodeship] || 0) + (s.points || 0);
    for (const v of ALL_VOIVS) {
      const sc = per[v] || 0;
      map.setFeatureState({ source: "voiv", id: v },
        { score: Math.min(sc, 8), level: sc >= 4 ? "high" : sc >= 2 ? "elevated" : "none" });
    }
  }
  document.getElementById("signal-list").innerHTML =
    sigs.map(sigHTML).join("") || '<div class="fineprint">brak sygnałów w tym oknie</div>';
}

document.getElementById("btn-history").onclick = () => toggleHistory();
document.getElementById("tb-live").onclick = () => exitHistory();
document.getElementById("tb-slider").addEventListener("input", (e) =>
  showHistoryAt(+e.target.value));

/* ── UI: ustawienia (moja lokalizacja), 3D, panel ────────────────────────── */
const dlg = document.getElementById("settings");
function openSettings() {
  refreshBgStatus();
  const sel = document.getElementById("set-voiv");
  sel.innerHTML = '<option value="">— nie wybrano —</option>' +
    ALL_VOIVS.map(v => `<option value="${esc(v)}"${v === myVoiv() ? " selected" : ""}>${esc(v)}</option>`).join("");
  document.getElementById("set-api").value = localStorage.getItem("straznik_api") || "";
  dlg.showModal();
}
document.getElementById("btn-settings").onclick = () => openSettings();
document.getElementById("btn-gps").onclick = () => {
  if (!navigator.geolocation) return alert("Brak dostępu do GPS w tym środowisku.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const v = voivAt(pos.coords.longitude, pos.coords.latitude);
      if (!v) return alert("Twoja pozycja jest poza granicami Polski — wybierz województwo ręcznie.");
      document.getElementById("set-voiv").value = v;
    },
    (err) => alert("Nie udało się ustalić pozycji: " + err.message),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
};
document.getElementById("set-save").onclick = () => {
  const v = document.getElementById("set-voiv").value;
  if (v) localStorage.setItem("straznik_voiv", v); else localStorage.removeItem("straznik_voiv");
  // usługa w tle nie widzi localStorage, a musi wiedzieć, o którym regionie alarmować
  BG()?.setHomeVoivodeship({ voivodeship: v || "" });
  const api = document.getElementById("set-api").value.trim();
  const apiChanged = api !== (localStorage.getItem("straznik_api") || "");
  if (api) localStorage.setItem("straznik_api", api); else localStorage.removeItem("straznik_api");
  if (apiChanged) { setTimeout(() => location.reload(), 100); return; }
  if (mapReady) { map.setFilter("my-voiv", ["==", ["get", "nazwa"], v || "—"]); goHome(); }
  if (state) renderPanel();
};
/* ── nasłuch w tle (natywna usługa Androida) ─────────────────────────────── */
const BG = () => window.Capacitor?.Plugins?.StraznikBackground || null;

async function refreshBgStatus() {
  const plugin = BG();
  const row = document.querySelector(".switch-row");
  const info = document.getElementById("bg-status");
  if (!plugin) {
    if (row) row.style.display = "none";
    document.getElementById("btn-battery").style.display = "none";
    document.getElementById("btn-notif-settings").style.display = "none";
    info.textContent = "Nasłuch w tle działa tylko w aplikacji na Androida "
      + "(w przeglądarce zamknięcie karty kończy monitorowanie).";
    return;
  }
  try {
    const s = await plugin.status();
    document.getElementById("bg-toggle").checked = !!s.enabled;
    const warn = [];
    if (s.enabled && !s.batteryUnrestricted)
      warn.push("⚠ Oszczędzanie baterii może ubić nasłuch — wyłącz je poniżej.");
    if (!s.notificationsAllowed)
      warn.push("⚠ Powiadomienia są zablokowane w ustawieniach systemu.");
    if (s.fullScreenAllowed === false)
      warn.push("⚠ Brak zgody na alarm pełnoekranowy — czerwony alarm nie zapali "
        + "wygaszonego ekranu. Włącz przyciskiem 🚨 poniżej.");
    const fsBtn = document.getElementById("btn-fullscreen");
    if (fsBtn) fsBtn.style.display = s.fullScreenAllowed === false ? "" : "none";
    info.innerHTML = (warn.join("<br>") || (s.enabled
      ? "Nasłuch działa. W powiadomieniach widnieje stała informacja."
      : "Nasłuch wyłączony — alarmy tylko przy otwartej aplikacji."))
      + `<br><span class="muted">Android ${s.sdk}, ${esc(s.manufacturer || "")}</span>`;
  } catch (e) { info.textContent = "Nie udało się odczytać stanu: " + e; }
}

document.getElementById("bg-toggle")?.addEventListener("change", async (e) => {
  const plugin = BG(); if (!plugin) return;
  try {
    if (e.target.checked) {
      if (window.Capacitor?.Plugins?.LocalNotifications)
        await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      await plugin.start();
      await plugin.requestBatteryExemption();
    } else {
      await plugin.stop();
    }
  } catch (err) { alert("Błąd: " + err); }
  refreshBgStatus();
});
document.getElementById("btn-battery")?.addEventListener("click", async () => {
  await BG()?.requestBatteryExemption(); setTimeout(refreshBgStatus, 800);
});
document.getElementById("btn-notif-settings")?.addEventListener("click", () =>
  BG()?.openNotificationSettings());
document.getElementById("btn-fullscreen")?.addEventListener("click", async () => {
  await BG()?.requestFullScreenPermission(); setTimeout(refreshBgStatus, 800);
});

const aboutDlg = document.getElementById("about");
document.getElementById("btn-about").onclick = () => aboutDlg.showModal();
document.getElementById("about-close").onclick = () => aboutDlg.close();
document.getElementById("btn-test-chime").onclick = () => attentionChime();
document.getElementById("btn-test-siren").onclick = () => airRaidSiren(false);
document.getElementById("btn-test-alarm").onclick = () => {
  document.getElementById("settings").close();
  const mine = myVoiv() || "lubelskie";
  showAlarm(mine, state?.fusion?.voivodeships?.[mine]
    || { score: 4.0, signals: [], level: "high" });
};
document.getElementById("btn-home").onclick = () => goHome();
document.getElementById("btn-fit").onclick = () => fitAll();
document.getElementById("panel-x").onclick = () => setPanel(false);
document.getElementById("disclaimer-x").onclick = () =>
  document.getElementById("disclaimer").classList.add("hidden");
document.getElementById("btn-push").onclick = () =>
  enablePush().catch(e => toast("Błąd: " + e));
refreshBell();
document.getElementById("btn-3d").onclick = () => {
  is3d = !is3d;
  map?.easeTo({ pitch: is3d ? 45 : 0, bearing: is3d ? -8 : 0, duration: 700 });
  document.getElementById("btn-3d").textContent = is3d ? "3D" : "2D";
};
function setPanel(open) {
  const p = document.getElementById("panel");
  p.classList.toggle("collapsed", !open);
  document.getElementById("btn-panel").classList.toggle("active", open);
  document.body.classList.toggle("panel-open", open);
}
document.getElementById("btn-panel").onclick = () =>
  setPanel(document.getElementById("panel").classList.contains("collapsed"));
document.getElementById("btn-legend").onclick = () => {
  document.getElementById("legend").classList.toggle("hidden");
  document.getElementById("btn-legend").classList.toggle("active");
};

/* ── start ───────────────────────────────────────────────────────────────── */
initMap();
connect();
// pierwsze uruchomienie: najpierw wyjaśnij czym to jest, potem spytaj o region
if (!localStorage.getItem("straznik_onboarded")) {
  localStorage.setItem("straznik_onboarded", "1");
  setTimeout(() => {
    aboutDlg.showModal();
    aboutDlg.addEventListener("close", () => {
      if (!myVoiv()) setTimeout(() => openSettings(), 250);
    }, { once: true });
  }, 700);
} else if (!myVoiv() && !localStorage.getItem("straznik_voiv_asked")) {
  localStorage.setItem("straznik_voiv_asked", "1");
  setTimeout(() => openSettings(), 1200);
}
setInterval(() => { if (state) renderPanel(); }, 30000);  // odświeżaj "x min temu"
setInterval(pollOnce, 60000);                              // siatka bezpieczeństwa
if ("serviceWorker" in navigator && !IS_APP)
  navigator.serviceWorker.register("sw.js").catch(() => {});

/* Strażnik — frontend: MapLibre GL 3D + panel fuzji sygnałów.
   Dane zagrożeń: NEPTUN (neptun.in.ua) — agregator OSINT; zawsze pokazujemy
   confidenceLevel i uncertaintyKm, nigdy nie sugerujemy większej precyzji. */
"use strict";

/* ── konfiguracja / API base ─────────────────────────────────────────────── */
const IS_APP = location.protocol === "capacitor:" || location.protocol === "file:" ||
               (window.Capacitor !== undefined);
// Przycisk instalacyjny jest przeznaczony dla strony WWW. W zainstalowanej
// aplikacji aktualizacje obsługuje osobny mechanizm w Ustawieniach.
if (IS_APP) document.querySelectorAll(".web-only").forEach(el => { el.hidden = true; });
const DEFAULT_BACKEND = "https://straznik.eu";   // serwer fuzji Strażnika (VPS przez Cloudflare)
function validBackendUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
}
function apiBase() {
  if (location.search.includes("standalone=1")) return null;  // test trybu wbudowanego
  const saved = localStorage.getItem("straznik_api");
  if (saved) return validBackendUrl(saved) ? saved.replace(/\/+$/, "") : null;
  if (!IS_APP && /^https?:$/.test(location.protocol)) return location.origin;
  // Apka domyślnie korzysta z serwera: fuzja liczona RAZ na backendzie, a nie na
  // każdym telefonie osobno (skalowanie + oszczędność limitów darmowych API).
  // Gdy serwer jest niedostępny, connect() schodzi na wbudowany silnik (fallback).
  if (IS_APP) return DEFAULT_BACKEND;
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
  recon:    { label: "Dron rozpoznawczy",  color: "#d7a84b" },
  unknown:  { label: "Obiekt powietrzny",  color: "#8a93a6" },
};
/* Ilustracje AI klas obiektów — nie zdjęcia ani wzorzec identyfikacji. */
const THREAT_PHOTOS = {
  kab: { file: "kab-ai.png" },
  uav: { file: "uav-ai.png" },
  shahed: { file: "shahed-ai.png" },
  fpv: { file: "fpv-ai.png" },
  recon: { file: "recon-ai.png" },
  missile: { file: "missile-ai.png" },
  ballistic: { file: "ballistic-ai.png" },
  mig31k: { file: "mig31k-ai.png" },
  cruise: { file: "missile-ai.png" },
};
const UI = window.I18N || { isEn:false, tr:s=>s, voiv:s=>s, type:(k,s)=>s, confidence:(k,s)=>s };
const threatLabelPL = (type) => {
  const key = String(type || "").toLowerCase();
  return UI.type(key, (TYPE_META[key] || TYPE_META.unknown).label);
};
const LEVEL_LABEL = UI.isEn
  ? { none: "no signals", elevated: "ELEVATED ATTENTION", high: "HIGH PRIORITY" }
  : { none: "brak sygnałów", elevated: "PODWYŻSZONA UWAGA", high: "WYSOKI PRIORYTET" };

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
const ROLE_EN = {
  "transport taktyczny":"tactical transport", "lekki transport / patrol (Bryza)":"light transport / patrol (Bryza)",
  "transport strategiczny (Atlas)":"strategic transport (Atlas)", "transport strategiczny (Globemaster)":"strategic transport (Globemaster)",
  "transport ciężki (Galaxy)":"heavy transport (Galaxy)", "transport ciężki":"heavy transport",
  "latający tankowiec (KC-135)":"aerial refuelling tanker (KC-135)", "latający tankowiec (Pegasus)":"aerial refuelling tanker (Pegasus)",
  "tankowiec / transport (MRTT)":"tanker / transport (MRTT)", "AWACS — wczesne ostrzeganie":"AWACS — airborne early warning",
  "wczesne ostrzeganie (Wedgetail)":"airborne early warning (Wedgetail)", "myśliwiec wielozadaniowy":"multirole fighter",
  "myśliwiec 5. gen. (Lightning II)":"5th-generation fighter (Lightning II)", "myśliwiec przewagi powietrznej":"air-superiority fighter",
  "myśliwiec (Eurofighter Typhoon)":"fighter (Eurofighter Typhoon)", "myśliwiec (Rafale)":"fighter (Rafale)",
  "myśliwiec (Gripen)":"fighter (Gripen)", "myśliwiec (MiG-29)":"fighter (MiG-29)", "myśliwsko-bombowy (Su-22)":"fighter-bomber (Su-22)",
  "patrolowy morski (Poseidon)":"maritime patrol (Poseidon)", "dron rozpoznawczy (Phoenix)":"reconnaissance drone (Phoenix)",
  "dron rozpoznawczy (Global Hawk)":"reconnaissance drone (Global Hawk)", "dron rozpoznawczo-uderzeniowy (Reaper)":"reconnaissance/strike drone (Reaper)",
  "rozpoznanie / łącznikowy":"reconnaissance / liaison", "rozpoznanie specjalne":"special reconnaissance", "rozpoznanie / VIP":"reconnaissance / VIP",
  "VIP / sztabowy":"VIP / command transport", "szkolno-treningowy (Texan II)":"trainer (Texan II)", "szkolno-bojowy (Albatros)":"combat trainer (Albatros)",
  "śmigłowiec wielozadaniowy (Black Hawk)":"multirole helicopter (Black Hawk)", "śmigłowiec szturmowy (Apache)":"attack helicopter (Apache)",
  "śmigłowiec transportowy (Chinook)":"transport helicopter (Chinook)", "śmigłowiec transportowy (Mi-8)":"transport helicopter (Mi-8)",
  "śmigłowiec transportowy (Mi-17)":"transport helicopter (Mi-17)", "śmigłowiec szturmowy (Mi-24)":"attack helicopter (Mi-24)",
  "śmigłowiec wielozadaniowy (Sokół)":"multirole helicopter (Sokół)", "śmigłowiec lekki":"light helicopter",
  "śmigłowiec (Caracal)":"helicopter (Caracal)", "śmigłowiec (Super Puma)":"helicopter (Super Puma)", "śmigłowiec (AW139)":"helicopter (AW139)",
  "latający tankowiec":"aerial refuelling tanker", "myśliwiec":"fighter", "transport strategiczny":"strategic transport",
  "patrolowy morski":"maritime patrol", "dron rozpoznawczy":"reconnaissance drone", "śmigłowiec wielozadaniowy":"multirole helicopter",
  "śmigłowiec szturmowy":"attack helicopter", "śmigłowiec transportowy":"transport helicopter", "śmigłowiec":"helicopter"
};
const roleText = role => UI.isEn ? (ROLE_EN[role] || role) : role;
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
const acName = (type, desc) => desc || MIL_NAMES[type] || type || (UI.isEn ? "unknown type" : "typ nieznany");
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
  if (where) parts.push(UI.isEn ? (t.destination ? `heading towards ${where}` : `area: ${where}`)
    : (t.destination ? `kursem na ${where}` : `rejon: ${where}`));
  if (t.sourceCount) parts.push(UI.isEn ? `confirmations: ${t.sourceCount}` : `potwierdzeń: ${t.sourceCount}`);
  return parts.join(" · ") || UI.type(t.type, meta.label);
}

/* NEPTUN oznacza część punktów jako `approx`: to rejon zgłoszenia (często
   środek miejscowości), a nie kolejne namiary radarowe. Pole jest na żywo na
   tracku, a w archiwum — w zachowanym source_metadata. */
function positionQuality(t) {
  return String(t?.positionQuality
    ?? t?.source_metadata?.source_fields?.positionQuality
    ?? "").toLowerCase();
}
const NEPTUN_LOCALITY_ANCHORS = [{ name:"Łuck", lat:50.7472, lon:25.3254 }];
function geoDistanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}
function positionInfo(t) {
  if (t?.straznik_position?.quality) return t.straznik_position;
  if (positionQuality(t) === "approx" || t?.areaOnly === true)
    return { quality:"approx", reason:"source_approx" };
  if (t?.lat != null && t?.lon != null) for (const a of NEPTUN_LOCALITY_ANCHORS)
    if (geoDistanceKm(t.lat, t.lon, a.lat, a.lon) <= 0.25)
      return { quality:"approx", reason:"locality_center", locality:a.name };
  return { quality:"point", reason:"source_point" };
}
function isApproxPosition(t) { return positionInfo(t).quality === "approx"; }
function approxPositionNote(t) {
  const locality = positionInfo(t).reason === "locality_center";
  const heading = locality
    ? (UI.isEn ? "locality centre used as a reference point, not a measured object position"
               : "środek miejscowości użyty jako punkt odniesienia, nie zmierzona pozycja obiektu")
    : (UI.isEn ? "approximate report area" : "przybliżony rejon zgłoszenia");
  return `<span style="color:#ffb020"><b>${heading}</b> — ${UI.isEn ? "no confirmed route or arrival time" : "brak potwierdzonej trasy i czasu dolotu"}</span>`;
}
function threatDistanceText(t, km) {
  if (km == null) return "?";
  if (!isApproxPosition(t)) return `${km} km`;
  if (km < 10) return UI.isEn ? "less than 10 km (area estimate)" : "mniej niż 10 km (szacunek rejonowy)";
  const rounded = Math.round(km / 10) * 10;
  return UI.isEn ? `about ${rounded} km (area estimate)` : `około ${rounded} km (szacunek rejonowy)`;
}

/* ── czas dolotu ─────────────────────────────────────────────────────────────
   Odległość w km nic nie mówi o zapasie czasu: ta sama „130 km" to ~10 minut dla
   rakiety manewrującej i ~43 minuty dla drona. Liczymy więc czas — osobno do
   granicy PL i do WYBRANEGO województwa (użytkownik pod Warszawą ma inny zapas
   niż ktoś w Hrubieszowie). Prędkość: podana przez źródło → wyliczona z trasy →
   typowa dla klasy (NEPTUN prędkości praktycznie nie podaje), więc to SZACUNEK. */
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[j];
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1))
      inside = !inside;
  }
  return inside;
}
function distToVoivKm(lat, lon, voiv) {
  const f = (voivGeo?.features || []).find(x => x.properties?.nazwa === voiv);
  if (!f) return null;
  const g = f.geometry;
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  for (const r of rings) if (pointInRing(lat, lon, r)) return 0;   // już nad regionem
  let best = Infinity;
  for (const r of rings) for (const [lo, la] of r) {
    const d = Math.hypot((la - lat) * 110.57,
      (lo - lon) * 111.32 * Math.cos(lat * Math.PI / 180));
    if (d < best) best = d;
  }
  return Math.round(best * 10) / 10;
}
const ETA_SOURCE_BUFFER_MIN = 2.5;
const etaMin = (km, kmh) => (km == null || !kmh) ? null
  : Math.max(0, Math.floor(km / kmh * 60 - ETA_SOURCE_BUFFER_MIN));
/* Czas pokazujemy TYLKO przy znanym kursie na PL — inaczej byłaby to liczba
   wzięta znikąd (obiekt może lecieć w przeciwną stronę). */
function etaInfo(t) {
  if (isApproxPosition(t)) return null;
  const a = t.pl_assessment;
  if (!a || !a.toward_pl || a.heading_known === false) return null;
  const v = t.velocity?.speedKmh ?? trackSpeed(t);
  if (!v) return null;
  const mine = myVoiv();
  return {
    speed: Math.round(v),
    border: etaMin(a.dist_km, v),
    voiv: mine ? etaMin(distToVoivKm(t.lat, t.lon, mine), v) : null,
    voivName: mine,
  };
}
const etaTxt = (m) => m == null ? null : (m < 1 ? "<1 min" : `~${m} min`);

function localPlaceHtml(t) {
  if (histMode || t.historicalOnly || isApproxPosition(t) || !Places?.exactPoint) return "";
  const exact = savedPlaces.filter(place => place.precision === "gps" && place.gps);
  if (!exact.length || t.lat == null || t.lon == null) return "";
  const measuredSpeed = measuredTrackSpeed(t);
  const rows = exact.map(place => {
    const info = Places.exactPoint(place, t, measuredSpeed, ETA_SOURCE_BUFFER_MIN);
    if (!info) return "";
    const distance = info.distanceKm < 10 ? info.distanceKm.toFixed(1) : Math.round(info.distanceKm);
    let detail;
    if (info.etaMin != null) detail = ` · ⏱ <b>${etaTxt(info.etaMin)}</b>`;
    else if (info.reason === "course") detail = ` · <span style="color:#ffb020">${UI.isEn ? "not heading towards this point" : "kurs nie prowadzi do tego punktu"}</span>`;
    else detail = ` · <span style="color:#ffb020">${UI.isEn ? "ETA unavailable — insufficient heading or speed data" : "brak ETA — za mało danych o kursie lub prędkości"}</span>`;
    return `<div><b>${esc2(place.name)}</b>: ${distance} km${detail}</div>`;
  }).filter(Boolean).join("");
  if (!rows) return "";
  return `<div class="local-place-eta"><div>${UI.isEn ? "To saved exact locations" : "Do zapisanych dokładnych lokalizacji"}</div>${rows}<small>${UI.isEn ? "calculated only on this device while the app is in the foreground; ETA assumes unchanged heading and deducts 2.5 min for data delay" : "liczone tylko na tym urządzeniu, gdy aplikacja jest na pierwszym planie; ETA zakłada niezmienny kurs i odejmuje 2,5 min na opóźnienie danych"}</small></div>`;
}

/* Wiersz „czas dolotu" do karty obiektu. Świadomie piszemy „przy tej prędkości",
   a NIE „czas na schronienie": to szacunek z prędkości typowej dla klasy, obiekt
   może skręcić albo zostać zestrzelony. Obiecywanie pewności byłoby groźne. */
function etaHtml(t) {
  if (isApproxPosition(t)) return approxPositionNote(t) + "<br>";
  const e = etaInfo(t);
  if (!e || e.border == null) {
    const base = t.pl_assessment && t.pl_assessment.heading_known === false
      ? `<span style="color:#ffb020">${UI.isEn ? "unknown heading — arrival time is not estimated" : "kurs nieznany — czasu dolotu nie szacujemy"}</span><br>`
      : "";
    return base + localPlaceHtml(t);
  }
  const mine = (e.voiv != null && e.voivName)
    ? ` · ${UI.isEn ? "to" : "do woj."} ${esc2(UI.voiv(e.voivName))}: <b>${etaTxt(e.voiv)}</b>` : "";
  return `${UI.isEn ? "conservative time to the Polish border" : "konserwatywny czas dolotu do granicy PL"}: <b>${etaTxt(e.border)}</b>${mine}<br>`
    + `<span style="color:#68758c">${UI.isEn ? `estimate at ${e.speed} km/h with unchanged heading; 2.5 min deducted for data delay — air defence not included` : `szacunek przy prędkości ${e.speed} km/h i utrzymaniu kursu; odjęto 2,5 min na opóźnienie danych — nie uwzględnia obrony powietrznej`}</span><br>`
    + localPlaceHtml(t);
}

const COMPASS = UI.isEn ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  : ["płn.", "płn.-wsch.", "wsch.", "płd.-wsch.", "płd.", "płd.-zach.", "zach.", "płn.-zach."];
const compass = (deg) => deg == null ? "" : COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const ftToM = (ft) => typeof ft === "number" ? Math.round(ft * 0.3048) : null;
const ktToKmh = (kt) => typeof kt === "number" ? Math.round(kt * 1.852) : null;
// alt_baro bywa stringiem "ground" (maszyna na płycie lotniska)
const altText = (alt) => alt === "ground" ? (UI.isEn ? "on the ground" : "na ziemi")
  : typeof alt === "number" ? `${alt} ft (${ftToM(alt)} m)` : (UI.isEn ? "altitude unavailable" : "wysokość b.d.");
const PRIORITY = ["lubelskie", "podkarpackie", "podlaskie", "warmińsko-mazurskie"];
const ALL_VOIVS = ["dolnośląskie","kujawsko-pomorskie","lubelskie","lubuskie","łódzkie",
  "małopolskie","mazowieckie","opolskie","podkarpackie","podlaskie","pomorskie","śląskie",
  "świętokrzyskie","warmińsko-mazurskie","wielkopolskie","zachodniopomorskie"];

/* Lokalne profile miejsc. Nazwy i GPS nie są używane w żądaniach API. */
const Places = window.StraznikPlaces;
let savedPlaces = Places?.migrate(localStorage) || [];
const myVoiv = () => Places?.primaryVoivodeship(savedPlaces) || localStorage.getItem("straznik_voiv") || null;
let voivGeo = null;   // GeoJSON województw (do GPS → województwo i do centrowania)

/* widok startowy: cała Polska + zachodnia Ukraina (kierunek nadlotu) */
const FIT_VIEW = { center: [23.2, 50.7], zoom: 5.75 };
/* Widok startowy = Polska i CAŁA Ukraina. Ramka geograficzna zamiast sztywnego
   przybliżenia: na wąskim telefonie zoom 5.75 pokazywał pół Europy, a na tablecie
   ucinał wschód Ukrainy. `fitBounds` dopasowuje kadr do rozmiaru ekranu, więc
   „cała PL" zawsze wraca dokładnie do tego, co widać po uruchomieniu. */
const FIT_BOUNDS = [[14.0, 44.2], [40.4, 55.1]];
const FIT_PAD = 18;

let state = null;          // ostatni stan z backendu
let threatsReceivedAt = 0; // do dead-reckoningu
let map, mapReady = false, is3d = true;

/* ── połączenie z backendem ──────────────────────────────────────────────── */
const connBadge = document.getElementById("conn-badge");
let ws = null, wsRetry = 1;

let standalone = false;
async function connect() {
  const savedApi = localStorage.getItem("straznik_api");
  if (savedApi && !validBackendUrl(savedApi)) {
    connBadge.textContent = "Serwer zablokowany — wymagany HTTPS. Otwórz ustawienia.";
    connBadge.classList.remove("hidden");
    connBadge.onclick = () => openSettings();
    connBadge.style.cursor = "pointer";
    return; // Preserve settings; never silently replace the user's server.
  }
  const base = apiBase();
  if (!base) return startStandalone();   // brak adresu ⇒ od razu wbudowany silnik
  // Sonda startowa: czy serwer odpowiada? Zamiast wisieć na „łączenie…", gdy
  // backend jest niedostępny w chwili otwarcia, schodzimy na WBUDOWANY silnik —
  // apka działa zawsze. Decyzja zapada RAZ na starcie (silnika nie da się
  // czysto zatrzymać, więc nie przełączamy trybu w locie).
  //
  // KILKA prób, nie jedna: na telefonie tuż po otwarciu radio/DNS/tunel bywają
  // jeszcze niegotowe (wybudzanie, powrót danych mobilnych), a pojedyncza sonda
  // 4 s za często spadała na tryb wbudowany — a wtedy historia to lokalne migawki
  // z dziurami/skokami (zapisywane tylko gdy apka działa). Dajemy 4 próby z
  // narastającą przerwą; przy prawdziwie martwym serwerze i tak schodzimy na
  // wbudowany, tylko po ~kilkunastu sekundach zamiast po czterech.
  connBadge.textContent = "łączenie…"; connBadge.classList.remove("hidden");
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (await probeBackend(base)) return openBackendWs(base);
    if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 1500));
  }
  console.warn("Strażnik: serwer niedostępny po kilku próbach — tryb wbudowany (standalone).");
  startStandalone();
}

function startStandalone() {
  // WBUDOWANY silnik: telefon/przeglądarka sam pobiera dane i liczy fuzję (engine.js).
  standalone = true;
  connBadge.classList.add("hidden");
  Engine.start(applyState);
  // Odzysk: jeśli poszliśmy w standalone mimo ZNANEGO adresu serwera (np. brak
  // sieci w chwili otwarcia, a wróciła chwilę później), w tle sprawdzamy, czy
  // serwer wrócił — i wracamy na niego SAMI, bez pytania użytkownika.
  const base = apiBase();
  if (base) scheduleStandaloneRecovery(base);
}

let _recoverTimer = null;
function scheduleStandaloneRecovery(base) {
  if (_recoverTimer) return;
  _recoverTimer = setInterval(async () => {
    if (!(await pingBackend(base))) return;
    // Podczas trwającego alarmu nie przełączamy trybu — użytkownik ma wtedy na
    // ekranie sygnał, którego nie wolno przerwać; spróbujemy przy następnym obiegu.
    if (!document.getElementById("alarm-overlay")?.classList.contains("hidden")) return;
    clearInterval(_recoverTimer); _recoverTimer = null;
    switchToBackend(base);
  }, 60000);
}

/* Powrót ze SILNIKA WBUDOWANEGO na serwer w locie — bez przeładowania apki.
   Silnik da się teraz czysto zatrzymać (Engine.stop gasi interwały i gniazdo
   Neptuna), więc nie ma ryzyka dwóch źródeł stanu naraz ani podwójnego
   odpytywania źródeł. Historia zaczyta się z serwera przy wejściu w tryb
   przeglądania (seedBundle), więc nic nie tracimy. */
function switchToBackend(base) {
  try { Engine.stop(); } catch (e) { console.warn("Engine.stop:", e); }
  standalone = false;
  srvSnaps = []; srvSigs = []; srvAdsbEvents = []; srvSeeded = false;
  connBadge.style.cursor = "";
  connBadge.onclick = null;
  connBadge.textContent = "łączenie…";
  connBadge.classList.remove("hidden");
  openBackendWs(base);
  pollOnce();          // natychmiast pokaż stan z serwera, nie czekaj na pierwszą ramkę WS
}

/* Lekki ping serwera do odzysku ze standalone: sam sprawdza dostępność
   (bez applyState — silnik wbudowany trzyma stan, dopóki użytkownik nie połączy). */
async function pingBackend(base) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base + "/api/health", { signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

/* jednorazowa sonda serwera z limitem czasu; przy sukcesie od razu pokazuje stan */
async function probeBackend(base) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base + "/api/state", { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) { applyState(await r.json()); return true; }
  } catch {}
  return false;
}

function openBackendWs(base) {
  const wsUrl = base.replace(/^http/, "ws") + "/ws";
  try { ws = new WebSocket(wsUrl); } catch { return scheduleReconnect(); }
  ws.onopen = () => { wsRetry = 1; connBadge.classList.add("hidden"); };
  ws.onmessage = (e) => {
    const env = JSON.parse(e.data);
    if (env.type === "state") applyState(env.data);
  };
  ws.onclose = ws.onerror = () => scheduleReconnect();
}

function scheduleReconnect() {
  if (standalone) return;   // w trybie wbudowanym nie ma czego wznawiać
  if (ws) { ws.onclose = ws.onerror = null; try { ws.close(); } catch {} ws = null; }
  connBadge.textContent = UI.isEn ? "server connection lost — retrying…" : "brak połączenia z serwerem — ponawiam…";
  connBadge.classList.remove("hidden");
  const base = apiBase();
  // W trakcie sesji trzymamy się serwera (przy starcie potwierdził dostępność):
  // ponawiamy tylko WebSocket, bez przełączania na wbudowany silnik.
  setTimeout(() => { if (!standalone && base) openBackendWs(base); },
    Math.min(wsRetry * 1000, 15000));
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

/* Komunikat administracyjny z serwera (np. zapowiedź okna testowego). Apka tylko
   GO WYŚWIETLA — żadnych danych zwrotnych (bez telemetrii). Zamknięcie zapamiętujemy
   po id, żeby nie wracał i nie „utknął". */
function showNotice(n) {
  const el = document.getElementById("notice-banner");
  if (!el) return;
  if (!n || !n.id || localStorage.getItem("notice_seen_" + n.id)) {
    el.classList.add("hidden"); return;
  }
  el.innerHTML = `<span>ℹ️ ${esc(n.text)}</span><button class="chip" id="notice-ok">Rozumiem</button>`;
  el.classList.remove("hidden");
  document.getElementById("notice-ok").onclick = () => {
    localStorage.setItem("notice_seen_" + n.id, "1");
    el.classList.add("hidden");
  };
}

function applyState(s) {
  state = s;
  showNotice(s?.notice);
  threatsReceivedAt = Date.now();
  if (!standalone) srvRecord(s);   // nagrywaj żywy feed do bufora historii (RAM)
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

function makeThreatImage(type, color) {
  const c = document.createElement("canvas"); c.width = c.height = 48;
  const x = c.getContext("2d");
  x.translate(24, 24);
  x.scale(.72, .72);           // współrzędne ikon: -30..30; nos zawsze na północ
  x.fillStyle = color; x.strokeStyle = "rgba(255,255,255,.9)";
  x.lineWidth = 2; x.lineJoin = "round"; x.lineCap = "round";
  x.shadowColor = color; x.shadowBlur = 9;
  const path = (points) => {
    x.beginPath(); x.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) x.lineTo(points[i][0], points[i][1]);
    x.closePath(); x.fill(); x.stroke();
  };
  switch (type) {
    case "shahed":
      path([[0,-28],[28,22],[5,12],[3,27],[-3,27],[-5,12],[-28,22]]);
      x.beginPath(); x.moveTo(0,-26); x.lineTo(0,20); x.stroke();
      break;
    case "fpv":
      x.lineWidth = 4; x.beginPath();
      x.moveTo(-5,-4); x.lineTo(-20,-17); x.moveTo(5,-4); x.lineTo(20,-17);
      x.moveTo(-5,4); x.lineTo(-20,17); x.moveTo(5,4); x.lineTo(20,17); x.stroke();
      x.lineWidth = 2;
      for (const [cx, cy] of [[-23,-20],[23,-20],[-23,20],[23,20]]) {
        x.beginPath(); x.arc(cx, cy, 7, 0, Math.PI * 2); x.fill(); x.stroke();
      }
      path([[-6,-8],[6,-8],[6,8],[-6,8]]);
      break;
    case "recon":
      path([[0,-28],[4,-7],[30,-1],[4,5],[3,22],[10,28],[0,25],[-10,28],[-3,22],[-4,5],[-30,-1],[-4,-7]]);
      break;
    case "missile": case "cruise":
      path([[0,-29],[5,-20],[7,-4],[22,11],[7,7],[6,21],[15,28],[0,23],[-15,28],[-6,21],[-7,7],[-22,11],[-7,-4],[-5,-20]]);
      break;
    case "ballistic":
      path([[0,-29],[7,-18],[8,12],[18,21],[6,18],[0,28],[-6,18],[-18,21],[-8,12],[-7,-18]]);
      x.fillStyle = "#ff8a20"; x.strokeStyle = "#fff";
      path([[-5,24],[0,32],[5,24],[0,27]]);
      break;
    case "kab":
      path([[0,-27],[7,-17],[8,11],[21,22],[7,18],[0,29],[-7,18],[-21,22],[-8,11],[-7,-17]]);
      x.beginPath(); x.moveTo(0,-22); x.lineTo(0,23); x.stroke();
      break;
    case "mig31k":
      path([[0,-30],[7,-8],[25,9],[7,5],[7,19],[16,27],[2,23],[0,30],[-2,23],[-16,27],[-7,19],[-7,5],[-25,9],[-7,-8]]);
      x.beginPath(); x.moveTo(0,-27); x.lineTo(0,23); x.stroke();
      break;
    case "unknown":
      path([[0,-27],[25,0],[0,27],[-25,0]]);
      x.fillStyle = "#fff"; x.font = "bold 30px system-ui"; x.textAlign = "center";
      x.textBaseline = "middle"; x.shadowBlur = 0; x.fillText("?", 0, 1);
      break;
    case "uav": default:
      path([[0,-29],[5,-7],[28,0],[5,6],[3,23],[-3,23],[-5,6],[-28,0],[-5,-7]]);
      break;
  }
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

// Legenda używa dokładnie tych samych pikseli co warstwa mapy. Dzięki temu
// dodanie lub korekta ikony nie zostawi w legendzie starego, umownego trójkąta.
function renderLegendThreatIcons() {
  document.querySelectorAll(".lg-threat[data-type]").forEach(el => {
    const type = el.dataset.type;
    const meta = TYPE_META[type] || TYPE_META.unknown;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 48;
    canvas.getContext("2d").putImageData(makeThreatImage(type, meta.color), 0, 0);
    el.replaceChildren(canvas);
  });
}
renderLegendThreatIcons();

/* Kolejność stylów: OpenFreeMap (wektor, schemat OpenMapTiles — niesie nazwy
   w wielu językach, więc etykiety da się przełączyć na POLSKIE), potem CARTO,
   na końcu raster. Każdy kolejny to zapas, gdyby poprzedni nie odpowiadał. */
const MAP_STYLES = [
  "https://tiles.openfreemap.org/styles/dark",
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
];

/* Etykiety mapy zgodne z językiem interfejsu. Kafelki OpenMapTiles niosą
   name:pl/name:en; gdy tłumaczenia brak, zachowujemy nazwę łacińską lub źródłową. */
function localiseMapLabels() {
  const field = ["coalesce", ["get", UI.isEn ? "name:en" : "name:pl"],
    ["get", "name:latin"], ["get", "name"]];
  for (const lyr of map.getStyle().layers || []) {
    if (lyr.type !== "symbol") continue;
    try {
      if (map.getLayoutProperty(lyr.id, "text-field") !== undefined)
        map.setLayoutProperty(lyr.id, "text-field", field);
    } catch {}
  }
}

async function initMap() {
  let style = FALLBACK_STYLE;
  for (const url of MAP_STYLES) {
    try { const r = await fetch(url, { method: "HEAD" }); if (r.ok) { style = url; break; } }
    catch {}
  }

  map = new maplibregl.Map({
    container: "map", style,
    bounds: FIT_BOUNDS, fitBoundsOptions: { padding: FIT_PAD }, pitch: 45, bearing: -8,
    antialias: true, attributionControl: false, maxPitch: 70,
  });

  map.on("load", async () => {
    localiseMapLabels();
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
    for (const [t, m] of Object.entries(TYPE_META)) map.addImage("dart-" + t, makeThreatImage(t, m.color));
    map.addImage("plane", makePlaneImage());
    map.addImage("heli", makeHeliImage());

    // Każdy kraj sąsiedni ma własny, ale dyskretny odcień. Przy szerokim
    // widoku mocne wypełnienia ogromnych państw dominowały nad informacją
    // alarmową, dlatego krycie rośnie łagodnie dopiero wraz ze zbliżeniem.
    const COUNTRY_COLORS = {
      UKR: "#4a4030", BLR: "#4a2e33", RUS: "#3f2b3e",
      LTU: "#2e4437", LVA: "#2e3f4a", EST: "#3b3350",
      SVK: "#333d2e", CZE: "#3f3229", DEU: "#35393f",
      HUN: "#3d3348", ROU: "#2f3c42", MDA: "#43392c",
    };
    const kraje = await (await fetch("assets/kraje.geojson")).json();
    map.addSource("kraje", { type: "geojson", data: kraje });
    // Android WebView wyświetla ciemną mapę bardziej płasko niż przeglądarka
    // desktopowa. Wspólne, niskie krycie zlewało tam kraje w jeden odcień.
    const countryOpacity = IS_APP
      ? ["interpolate", ["linear"], ["zoom"], 3, 0.30, 6, 0.38, 9, 0.42]
      : ["interpolate", ["linear"], ["zoom"], 3, 0.13, 6, 0.20, 9, 0.24];
    map.addLayer({ id: "kraje-fill", type: "fill", source: "kraje",
      paint: { "fill-color": ["match", ["get", "iso"],
          ...Object.entries(COUNTRY_COLORS).flat(), "#333"],
        "fill-opacity": countryOpacity } });
    /* Kontury krajów rysuje już styl bazowy (warstwy boundary). Własnej linii
       NIE dokładamy: wzdłuż granicy PL biegłaby obok linii województw i dawała
       efekt „podwójnego konturu". Zostaje samo wypełnienie (odcień kraju). */

    /* POLSKA: jeden spójny kształt scalony z 16 województw (assets/polska.geojson),
       więc jej granica idealnie pokrywa się z warstwami wojewódzkimi — koniec
       rozjazdu z zgrubnymi poligonami sąsiadów. Delikatny błękit + jeden czysty
       kontur = kraj czytelnie wyróżniony bez krzykliwości. */
    const pl = await (await fetch("assets/polska.geojson")).json();
    map.addSource("pl", { type: "geojson", data: pl });
    /* Stonowane: szeroka poświata (6–14 px z rozmyciem) robiła „futrzastą",
       poszarpaną krawędź i mapa wyglądała jak podgląd debugowy. Zostaje cienki,
       spokojny kontur i delikatne wypełnienie; wyraźna poświata jest zarezerwowana
       dla WYBRANEGO województwa (warstwa „my-voiv"), gdzie realnie coś znaczy. */
    map.addLayer({ id: "pl-fill", type: "fill", source: "pl",
      paint: { "fill-color": "#2f5a99", "fill-opacity": 0.15 } });
    map.addLayer({ id: "pl-line", type: "line", source: "pl",
      paint: { "line-color": "#8fb4ee", "line-opacity": 0.85,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.9, 7, 1.6] } });

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
      // podziały WEWNĘTRZNE — cieńsze niż granica państwa (pl-line), żeby nie
      // konkurowały z nią wizualnie; ściana wschodnia nadal wyraźniejsza
      paint: { "line-color": ["case",
          ["in", ["get", "nazwa"], ["literal", PRIORITY]], "rgba(150,180,255,.55)",
          "rgba(125,150,205,.26)"],
        "line-width": ["case", ["in", ["get", "nazwa"], ["literal", PRIORITY]], 1.3, 0.7] },
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
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.07, 0.16],
        "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.45,
        "circle-stroke-width": 1 } });
    /* Zaznaczony obiekt: biały pierścień POD ikoną. Bez tego po dotknięciu
       kilku dronów obok siebie nie było wiadomo, którego dotyczy karta. */
    map.addLayer({ id: "threats-sel", type: "circle", source: "threats",
      filter: ["==", ["get", "tid"], "__none__"],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 15, 8, 26],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5,
        "circle-stroke-opacity": 0.95 } });
    map.addLayer({ id: "threats", type: "symbol", source: "threats",
      layout: { "icon-image": ["concat", "dart-", ["get", "type"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 0.85],
        "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map",
        "icon-allow-overlap": true },
      paint: { "icon-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.48, 1] },
    });

    // ślad śledzonej maszyny — pod ikonami samolotów, żeby ich nie zasłaniał
    map.addSource("adsb-trail", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "adsb-trail", type: "line", source: "adsb-trail",
      paint: { "line-color": "#39c5ec", "line-width": 2, "line-opacity": 0.7,
        "line-dasharray": [2, 1.5] } });

    map.addSource("adsb", { type: "geojson", data: emptyFC() });
    // obce (RU/BY) maszyny — czerwona poświata pod ikoną, żeby rzucały się w oczy
    map.addLayer({ id: "adsb-foreign", type: "circle", source: "adsb",
      filter: ["==", ["get", "foreign"], true],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 20],
        "circle-color": "#ff4d5e", "circle-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.08, 0.18],
        "circle-stroke-color": "#ff4d5e", "circle-stroke-width": 1.6, "circle-stroke-opacity": 0.85 } });
    map.addLayer({ id: "adsb-sel", type: "circle", source: "adsb",
      filter: ["==", ["get", "hex"], "__none__"],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 13, 8, 22],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5,
        "circle-stroke-opacity": 0.95 } });
    map.addLayer({ id: "adsb", type: "symbol", source: "adsb",
      layout: { "icon-image": ["case", ["==", ["get", "heli"], true], "heli", "plane"],
        "icon-size": 0.62,
        "icon-rotate": ["get", "track"], "icon-rotation-alignment": "map",
        "icon-allow-overlap": true },
      paint: { "icon-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.5, 1] },
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
    /* Delikatna poświata TYLKO pod wybranym województwem — jedyne miejsce, gdzie
       glow niesie informację („to jest Twój region"), więc nie zaśmieca reszty. */
    map.addLayer({ id: "my-voiv-glow", type: "line", source: "voiv",
      filter: ["==", ["get", "nazwa"], myVoiv() || "—"],
      paint: { "line-color": "#7fb0ff", "line-opacity": 0.22, "line-width": 6,
               "line-blur": 3 } });
    map.addLayer({ id: "my-voiv", type: "line", source: "voiv",
      filter: ["==", ["get", "nazwa"], myVoiv() || "—"],
      paint: { "line-color": "#8ec0ff", "line-width": 2, "line-opacity": 0.9,
        "line-blur": 0.4 } });

    mapReady = true;
    if (state) { updateVoivStates(); updateAdsb(); }
    /* Ekran startowy jest ZAWSZE ten sam: Polska i cała Ukraina. Skok na zapisane
       województwo startował tak blisko, że nie było widać, skąd nadlatują obiekty —
       a to jest właśnie powód, dla którego ktoś otwiera tę mapę. Do swojego regionu
       wraca się przyciskiem „mój region". */
    fitAll(true);
    requestAnimationFrame(animate);
  });
}

const emptyFC = () => ({ type: "FeatureCollection", features: [] });

/* ── karta samolotu: kraj z zakresu hex, lokalne zdjęcie modelu, ślad ────── */
const adsbByHex = new Map();     // hex → pełny obiekt maszyny (właściwe typy)
const historyAdsbByHex = new Map();
let historyAdsbTime = null;
const adsbTrails = new Map();    // hex → [{lat,lon,t}] — własny zapis trasy
let followHex = null;            // śledzona maszyna (kamera + rysowany ślad)
let popupSeq = 0;

/* Zakresy adresów 24-bit ICAO → kraj rejestracji. Tylko pewne, istotne dla
   regionu — błędna flaga jest gorsza niż jej brak, więc nieznane zostają puste. */
const ICAO_RANGES = [
  [0x100000, 0x1FFFFF, "Rosja", "🇷🇺"], [0x508000, 0x50FFFF, "Ukraina", "🇺🇦"],
  [0x510000, 0x5103FF, "Białoruś", "🇧🇾"], [0x488000, 0x48FFFF, "Polska", "🇵🇱"],
  [0x480000, 0x487FFF, "Holandia", "🇳🇱"], [0x3C0000, 0x3FFFFF, "Niemcy", "🇩🇪"],
  [0x380000, 0x3BFFFF, "Francja", "🇫🇷"], [0x400000, 0x43FFFF, "Wielka Brytania", "🇬🇧"],
  [0x300000, 0x33FFFF, "Włochy", "🇮🇹"], [0x340000, 0x37FFFF, "Hiszpania", "🇪🇸"],
  [0x440000, 0x447FFF, "Austria", "🇦🇹"], [0x448000, 0x44FFFF, "Belgia", "🇧🇪"],
  [0x458000, 0x45FFFF, "Dania", "🇩🇰"], [0x460000, 0x467FFF, "Finlandia", "🇫🇮"],
  [0x468000, 0x46FFFF, "Grecja", "🇬🇷"], [0x470000, 0x477FFF, "Węgry", "🇭🇺"],
  [0x478000, 0x47FFFF, "Norwegia", "🇳🇴"], [0x490000, 0x497FFF, "Portugalia", "🇵🇹"],
  [0x498000, 0x49FFFF, "Czechy", "🇨🇿"], [0x4A0000, 0x4A7FFF, "Rumunia", "🇷🇴"],
  [0x4A8000, 0x4AFFFF, "Szwecja", "🇸🇪"], [0x4B0000, 0x4B7FFF, "Szwajcaria", "🇨🇭"],
  [0x4B8000, 0x4BFFFF, "Turcja", "🇹🇷"], [0xA00000, 0xAFFFFF, "USA", "🇺🇸"],
  [0xC00000, 0xC3FFFF, "Kanada", "🇨🇦"], [0x7C0000, 0x7FFFFF, "Australia", "🇦🇺"],
];
function hexCountry(hex) {
  const n = parseInt(hex, 16);
  if (!isFinite(n)) return null;
  for (const [a, b, name, flag] of ICAO_RANGES) if (n >= a && n <= b) return { name, flag };
  return null;
}
const COUNTRY_EN = { "Polska":"Poland", "Rosja":"Russia", "Białoruś":"Belarus", "Niemcy":"Germany",
  "Francja":"France", "Wielka Brytania":"United Kingdom", "Włochy":"Italy", "Hiszpania":"Spain",
  "Czechy":"Czechia", "Słowacja":"Slovakia", "Węgry":"Hungary", "Rumunia":"Romania",
  "Litwa":"Lithuania", "Łotwa":"Latvia", "Estonia":"Estonia", "Ukraina":"Ukraine",
  "Holandia":"Netherlands", "Belgia":"Belgium", "Dania":"Denmark", "Norwegia":"Norway",
  "Szwecja":"Sweden", "Finlandia":"Finland", "Austria":"Austria", "Grecja":"Greece",
  "Portugalia":"Portugal", "Szwajcaria":"Switzerland", "Turcja":"Türkiye",
  "USA":"United States", "Kanada":"Canada", "Australia":"Australia" };
const countryText = name => UI.isEn ? (COUNTRY_EN[name] || name) : name;

/* Biblioteka modelu: lokalna, bez API wyszukującego po powtarzalnych numerach.
   Brak potwierdzonego wariantu oznacza brak fotografii, nie podobną maszynę. */
async function acPhoto(plane) {
  return window.AircraftPhotos?.select(plane, window.AircraftPhotoCatalog) || null;
}

function speedRow(p) {
  const parts = [];
  if (p.gs != null) parts.push(`${ktToKmh(p.gs)} km/h`);
  if (p.mach != null) parts.push(`Ma ${(+p.mach).toFixed(2)}`);
  return parts.join(" · ");
}
function headingRow(p) {
  const t = p.track != null ? `${Math.round(p.track)}° (${compass(p.track)})` : null;
  const mh = p.mag_heading != null ? `mag. ${Math.round(p.mag_heading)}°` : null;
  return [t, mh].filter(Boolean).join(" · ") || (UI.isEn ? "unavailable" : "b.d.");
}

/* ── warstwa obserwacyjna: obce (RU/BY) maszyny nad wschodnią flanką ──────── */
/* Osobno od punktacji alarmów — czysty podgląd OSINT. „Obce" = rejestracja
   rosyjska lub białoruska (po zakresie adresu hex; Rosja 0x100000–0x1FFFFF,
   Białoruś 0x510000–0x5103FF). Wiele rosyjskich maszyn leci z wyłączonym
   transponderem i tu się nie pojawi — to obserwacja emisji, nie namierzanie. */
const WATCH_AREAS = [
  ["obw. królewiecki", 54.1, 19.4, 55.5, 23.1], ["Białoruś", 51.2, 23.1, 56.4, 32.9],
  ["Litwa", 53.8, 20.9, 56.5, 27.0], ["Łotwa", 55.6, 20.9, 58.1, 28.3],
  ["Estonia", 57.5, 21.7, 59.8, 28.3], ["Ukraina", 44.2, 22.0, 52.5, 40.4],
  ["Rumunia", 43.5, 20.2, 48.3, 29.8], ["Bałtyk", 54.0, 13.5, 60.6, 23.5],
];
function watchArea(lat, lon) {
  for (const [n, a, b, c, d] of WATCH_AREAS) if (lat >= a && lat <= c && lon >= b && lon <= d) return n;
  return null;
}
function isForeign(p) {
  const c = hexCountry(p.hex);
  return !!(c && (c.name === "Rosja" || c.name === "Białoruś"));
}
let watchEvents = [];
try { watchEvents = JSON.parse(localStorage.getItem("straznik_watch_events") || "[]"); } catch {}
let watchPrev = new Set();      // hex obcych maszyn z poprzedniego obiegu
const watchLast = new Map();    // hex → {label, flag, area} — do zdarzeń wyjścia
function logWatchEvent(kind, info) {
  watchEvents.unshift({ t: Date.now(), kind, hex: info.hex,
    label: info.label || info.hex, flag: info.flag || "", area: info.area || "",
    callsign: info.callsign, type: info.type, lat: info.lat, lon: info.lon,
    alt: info.alt, gs: info.gs, track: info.track, desc: info.desc, reg: info.reg,
    cat: info.cat, foreign: true });
  if (watchEvents.length > 60) watchEvents.length = 60;
  try { localStorage.setItem("straznik_watch_events", JSON.stringify(watchEvents)); } catch {}
}
function updateWatchBadge(n) {
  const b = document.getElementById("watch-badge");
  if (!b) return;
  b.textContent = n || "";
  b.style.display = n ? "" : "none";
}

/* Stała karta obiektu (bottom-sheet) — zawsze w tym samym miejscu, zamiast dymka
   MapLibre przyczepionego do pozycji na mapie (ten skakał po ekranie, uciekał za
   krawędź i przesuwał się razem z obiektem). */
/* Podświetlenie na mapie: biały pierścień pod ikoną wskazuje obiekt, którego
   dotyczy otwarta karta. Bez tego przy kilku dronach obok siebie nie było
   wiadomo, który został dotknięty. */
function markSelected(kind, id) {
  if (!mapReady) return;
  const none = "__none__";
  try {
    map.setFilter("threats-sel", ["==", ["get", "tid"], kind === "threat" ? String(id ?? none) : none]);
    map.setFilter("adsb-sel", ["==", ["get", "hex"], kind === "plane" ? String(id ?? none) : none]);
  } catch {}
}

function showCard(html) {
  const body = document.getElementById("ac-card-body");
  if (!body) return;
  body.innerHTML = html;
  const card = document.getElementById("ac-card");
  card.classList.remove("hidden");
  card.scrollTop = 0;
  applyCardSize();
}
function hideCard() {
  document.getElementById("ac-card")?.classList.add("hidden");
  markSelected(null, null);
}

/* Karta obiektu ma dwa rozmiary: miniatura w rogu (domyślnie — nie zasłania mapy)
   i rozwinięta karta na niemal cały ekran. Wybór zostaje na urządzeniu. */
function cardBig() { try { return localStorage.getItem("straznik_card_big") === "1"; } catch { return false; } }
function applyCardSize() {
  const card = document.getElementById("ac-card");
  const btn = document.getElementById("ac-card-zoom");
  if (!card) return;
  const big = cardBig();
  card.classList.toggle("big", big);
  if (btn) {
    const t = big ? (UI.isEn ? "Collapse card" : "Zwiń kartę")
                  : (UI.isEn ? "Expand card" : "Rozwiń kartę");
    btn.title = t; btn.setAttribute("aria-label", t);
  }
}

/* dymki — wspólne dla kliknięcia w mapę i w pozycję listy */
function openThreatPopup(lngLat, p) {
  if (!p) return;
  markSelected("threat", p.tid);
  const meta0 = TYPE_META[p.type] || { label: p.type, color: "#8a93a6" };
  const meta = { ...meta0, label: UI.type(p.type, meta0.label) };
  const photo = THREAT_PHOTOS[p.type];
  const fallbackType = p.type === "cruise" ? "missile" : p.type;
  const img = p.type ? (photo
    ? `<div class="thr-photo" style="margin:-2px 0 6px"><img src="assets/threats/${esc2(photo.file)}"
        alt="${UI.isEn ? "AI illustration" : "Ilustracja AI"}: ${esc2(meta.label)} — ${UI.isEn ? "not the tracked object" : "nie śledzony obiekt"}" loading="lazy"
        onerror="this.closest('.thr-photo').hidden=true">
        <div class="thr-photo-note"><strong>${UI.isEn ? "Reference illustration generated by AI." : "Ilustracja poglądowa wygenerowana przez AI."}</strong><br>
          ${UI.isEn ? "It does not depict the tracked object. It may contain simplifications and must not be used to identify a model." : "Nie przedstawia śledzonego obiektu. Może zawierać uproszczenia; nie służy do identyfikacji modelu."}</div></div>`
    : `<div class="thr-photo" style="margin:-2px 0 6px"><img src="assets/threats/${esc2(fallbackType)}.svg"
        alt="Grafika poglądowa typu ${esc2(meta.label)}"
        onerror="this.closest('.thr-photo').style.display='none'">
        <div class="thr-photo-note">${UI.isEn ? "type reference — not this object" : "grafika poglądowa typu — nie tego obiektu"}</div></div>`)
    : "";
  showCard(`${img}
      <b style="color:${meta.color};filter:brightness(.75)">◆ ${meta.label}</b><br>
      ${p.opis ? esc2(p.opis) + "<br>" : ""}
      ${UI.isEn ? "confidence" : "wiarygodność"}: <b>${esc2(UI.confidence(p.confidence, CONF_PL[p.confidence] || p.confidence))}</b>
        · ${UI.isEn ? "position uncertainty" : "niepewność pozycji"}: <b>±${p.uncertainty} km</b><br>
      ${p.heading != null ? `${UI.isEn ? "heading" : "kurs"}: ${Math.round(p.heading)}° (${compass(p.heading)}) · ` : ""}
      ${UI.isEn ? "distance from the Polish border" : "odległość od granicy PL"}: <b>${p.distance_text ?? ((p.dist_km ?? "?") + " km")}</b><br>
      ${p.eta || ""}
      <span style="color:#68758c">${UI.isEn ? "Data: NEPTUN — OSINT aggregator, not military radar" : "Dane: NEPTUN — agregator OSINT, nie radar wojskowy"}</span>`);
}

/* Karta samolotu w stylu airplanes.live: zdjęcie, kraj rejestracji, operator,
   pełna telemetria i przycisk śledzenia trasy. Pełne dane bierzemy z adsbByHex
   (właściwe typy), bo właściwości warstwy GL potrafią zamienić liczby w tekst. */
function planePopupHTML(p, heli, uid) {
  const c = hexCountry(p.hex);
  const role = acRole(p.type, p.desc);
  const vr = typeof p.vr === "number" ? p.vr : (p.vr != null ? +p.vr : null);
  const vrTxt = vr == null ? "" : vr > 100 ? ` · ↑ ${vr} ft/min`
    : vr < -100 ? ` · ↓ ${Math.abs(vr)} ft/min` : (UI.isEn ? " · level flight" : " · lot poziomy");
  const mil = (p.dbflags & 1)
    ? `<span style="background:#7a1d2b;color:#fff;border-radius:4px;padding:1px 5px;font-size:10px">${UI.isEn ? "MILITARY" : "WOJSKOWY"}</span> ` : "";
  const nav = Array.isArray(p.nav_modes) ? p.nav_modes.join(", ") : (p.nav_modes || "");
  const geom = p.alt_geom != null && p.alt_geom !== p.alt
    ? ` <span style="color:#68758c">(geom. ${ftToM(p.alt_geom)} m)</span>` : "";
  const row = (l, v) => (v == null || v === "") ? ""
    : `<tr><td style="color:#68758c;padding-right:8px;vertical-align:top">${l}</td><td><b>${v}</b></td></tr>`;
  return `<div>
    <div id="${uid}-box" style="display:none;margin:-2px 0 6px">
      <img id="${uid}" alt="" style="width:100%;max-height:220px;object-fit:contain;border-radius:6px;display:block">
      <div class="ph-cr" style="font-size:10px;color:#68758c;margin-top:2px"></div>
    </div>
    <div id="${uid}-missing" style="font-size:10px;color:#68758c;margin-bottom:6px">${UI.isEn ? "No verified photo for this model/variant." : "Brak zweryfikowanego zdjęcia tego modelu/wariantu."}</div>
    <b style="font-size:13.5px">${heli ? "🚁" : "✈"} ${esc2(p.callsign || p.hex || "?")}</b>
      ${p.reg ? ` · ${UI.isEn ? "reg." : "rej."} ${esc2(p.reg)}` : ""}<br>
    ${mil}${c ? `${c.flag} ${esc2(countryText(c.name))} · ` : ""}<b>${esc2(acName(p.type, p.desc))}</b>${p.year ? ` (${esc2(p.year)})` : ""}<br>
    ${role ? `${UI.isEn ? "role" : "przeznaczenie"}: <b>${esc2(roleText(role))}</b><br>` : ""}
    ${p.op ? `${UI.isEn ? "operator" : "operator"}: <b>${esc2(p.op)}</b><br>` : ""}
    <table style="margin:5px 0;border-collapse:collapse">
      ${row(UI.isEn ? "altitude" : "wysokość", altText(p.alt) + geom + vrTxt.replace(" · ", "&nbsp; "))}
      ${row(UI.isEn ? "speed" : "prędkość", speedRow(p))}
      ${row(UI.isEn ? "heading" : "kurs", headingRow(p))}
      ${row("squawk", p.squawk ? esc2(p.squawk) : "")}
      ${row(UI.isEn ? "wind" : "wiatr", (p.ws != null && p.wd != null) ? `${ktToKmh(p.ws)} km/h ${UI.isEn ? "from" : "z"} ${Math.round(p.wd)}° (${compass(p.wd)})` : "")}
      ${row("temp.", p.oat != null ? `${Math.round(p.oat)} °C` : "")}
      ${row(UI.isEn ? "nav modes" : "tryby nav", nav ? esc2(nav) : "")}
      ${row(UI.isEn ? "signal" : "sygnał", `${esc2(p.source || "ADS-B")}${p.rssi != null ? ` · ${p.rssi} dBFS` : ""}${p.messages != null ? ` · ${p.messages} msg/s` : ""}`)}
    </table>
    <button class="btn-follow chip" style="font-size:11px;padding:3px 8px;margin-bottom:4px">${followHex === p.hex
      ? (UI.isEn ? "■ stop tracking" : "■ przestań śledzić") : (UI.isEn ? "📍 follow track" : "📍 śledź trasę")}</button>
    <div style="color:#68758c;font-size:11px">${UI.isEn
      ? "public ADS-B/MLAT transponder — emitted position, not active tracking. Telemetry: ADS-B providers. Model photo: local library; source and license above."
      : "publiczny transponder ADS-B/MLAT — pozycja emisji, nie namierzanie. Telemetria: dostawcy ADS-B. Zdjęcie modelu: biblioteka lokalna; źródło i licencja powyżej."}</div>
  </div>`;
}

function openPlanePopup(lngLat, props) {
  const p = (histMode ? historyAdsbByHex : adsbByHex).get(props?.hex) || props;
  if (!p) return;
  markSelected("plane", p.hex);
  const heli = p.heli != null ? p.heli : isHeli(p.cat, p.type, p.desc);
  const uid = "pp" + (++popupSeq);
  const timeNote = histMode ? `<div class="hist-banner">${UI.isEn ? "HISTORY VIEW" : "PODGLĄD HISTORII"} — ${watchClock(historyAdsbTime)}<br>${p.historicalOnly
    ? (UI.isEn ? "Last observation" : "Ostatnia obserwacja") + " " + watchClock(p.observedAt) + (UI.isEn ? " — no position in this snapshot" : " — brak pozycji w tej migawce")
    : (UI.isEn ? "Position recorded in the selected snapshot" : "Pozycja zapisana w wybranej migawce")}</div>` : "";
  showCard(timeNote + planePopupHTML(p, heli, uid));
  if (histMode) document.querySelector("#ac-card .btn-follow")?.remove();
  document.querySelector("#ac-card .btn-follow")
    ?.addEventListener("click", () => { toggleFollow(p.hex); hideCard(); });
  // Unikalne uid chroni przed wstawieniem zdjęcia do następnej otwartej karty.
  acPhoto(p).then(ph => {
    const img = document.getElementById(uid), box = document.getElementById(uid + "-box");
    if (ph && ph.src && img && box) {
      const missing = document.getElementById(uid + "-missing");
      img.onload = () => { box.style.display = ""; if (missing) missing.style.display = "none"; };
      img.onerror = () => { box.style.display = "none"; if (missing) missing.style.display = ""; };
      img.alt = ph.model;
      const cr = box.querySelector(".ph-cr");
      if (cr) {
        cr.textContent = window.AircraftPhotos.caption(ph, UI.isEn ? "en" : "pl");
        cr.append(document.createElement("br"), document.createTextNode("📷 " + ph.author + " · "));
        for (const [label, url] of [[UI.isEn ? "Source" : "Źródło", ph.sourceUrl], [ph.license, ph.licenseUrl]]) {
          const a = document.createElement("a"); a.textContent = label; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
          cr.append(a, document.createTextNode(" · "));
        }
        cr.append(document.createTextNode(ph.sourceCrop
          ? (UI.isEn ? "Source crop; no further retouching." : "Kadrowanie źródłowe; bez dodatkowego retuszu.")
          : (UI.isEn ? "Source thumbnail; no retouching." : "Miniatura źródłowa; bez retuszu.")));
      }
      // Pierwsze żądanie nowego pliku mogło zostać zapamiętane przez CDN jako
      // 404 przed wdrożeniem. Osobny klucz wersji omija ten ujemny cache.
      img.src = ph.src === "assets/aircraft/b738-39116debcbe1.jpg"
        ? ph.src + "?v=1.7.19"
        : ph.src;
    }
  });
}

/* Ślad śledzonej maszyny + kamera podążająca za nią (jak „śledź samolot" u nich). */
function drawFollowTrail() {
  const src = map.getSource("adsb-trail"); if (!src) return;
  const arr = followHex ? adsbTrails.get(followHex) : null;
  if (!arr || arr.length < 2) { src.setData(emptyFC()); return; }
  src.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {},
    geometry: { type: "LineString", coordinates: arr.map(q => [q.lon, q.lat]) } }] });
}
function toggleFollow(hex) {
  followHex = followHex === hex ? null : hex;
  drawFollowTrail();
  if (followHex && adsbByHex.has(followHex)) {
    const p = adsbByHex.get(followHex);
    map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 7), duration: 800 });
  }
  toast(followHex
    ? "📍 <b>Śledzę samolot.</b><br>Mapa podąża, trasa rysowana. Kliknij ponownie, by przestać."
    : "Śledzenie wyłączone.");
}

function updateVoivStates() {
  if (histMode) return;   // mapa pokazuje wtedy chwilę wybraną suwakiem
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
    if (isApproxPosition(t)) {
      localTrails.delete(t.id);
      continue;
    }
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
  if (isApproxPosition(t)) return [];
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
function measuredTrackSpeed(t) {
  if (isApproxPosition(t)) return null;
  if (Number.isFinite(+t.velocity?.speedKmh) && +t.velocity.speedKmh > 0) return +t.velocity.speedKmh;
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
  return null;
}
function trackSpeed(t) {
  return measuredTrackSpeed(t) ?? TYPE_SPEED_KMH[t.type] ?? null; // zapas mapy: prędkość typowa dla klasy
}

/* dead-reckoning między aktualizacjami serwera (jak predict() w SDK Neptuna) */
function predict(t, nowMs) {
  let lat = t.lat, lon = t.lon;
  if (isApproxPosition(t)) return { lat, lon };
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
      properties: { tid: String(t.id ?? ""),
        type: TYPE_META[t.type] ? t.type : "unknown", heading: t.heading ?? 0,
        color: meta.color,
        confidence: t.confidenceLevel || "?", uncertainty: t.uncertaintyKm ?? "?",
        opis: threatDesc(t), dist_km: t.pl_assessment?.dist_km,
        distance_text: threatDistanceText(t, t.pl_assessment?.dist_km),
        eta: etaHtml(t) } });
    if (t.uncertaintyKm)
      unc.push({ type: "Feature", properties: { color: meta.color },
        geometry: { type: "Polygon", coordinates: circleCoords(p.lat, p.lon, t.uncertaintyKm) } });
    // ślad = to, co dało API + to, co sami zaobserwowaliśmy + pozycja bieżąca.
    // Dla przybliżonego rejonu nie łączymy kolejnych raportów w pozorną trasę.
    if (isApproxPosition(t)) continue;
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
  if (histMode) return;   // pozycje maszyn pochodzą wtedy z migawki
  const planes = state?.adsb?.aircraft || [];
  const now = Date.now(), alive = new Set(), nowForeign = new Set();
  adsbByHex.clear();
  for (const p of planes) {
    if (!p.hex) continue;
    p.heli = isHeli(p.cat, p.type, p.desc);
    p.foreign = isForeign(p);
    p.area = (p.lat != null && p.lon != null) ? watchArea(p.lat, p.lon) : null;
    adsbByHex.set(p.hex, p);              // pełny obiekt do dymka (właściwe typy)
    if (p.lat == null || p.lon == null) continue;
    alive.add(p.hex);
    if (p.foreign) {
      nowForeign.add(p.hex);
      const c = hexCountry(p.hex);
      watchLast.set(p.hex, { ...p,
        label: (p.callsign || p.hex) + (p.desc ? " · " + p.desc : ""),
        flag: c ? c.flag : "", area: p.area || "" });
    }
    // własny zapis trasy (jak dla obiektów NEPTUN): dopisujemy realne przesunięcia
    const arr = adsbTrails.get(p.hex) || [];
    const last = arr[arr.length - 1];
    if (!last || Math.hypot((p.lat - last.lat) * 110.57,
        (p.lon - last.lon) * 111.32 * Math.cos(p.lat * Math.PI / 180)) > 0.5) {
      arr.push({ lat: p.lat, lon: p.lon, t: now });
      if (arr.length > 80) arr.shift();
      adsbTrails.set(p.hex, arr);
    }
  }
  for (const h of adsbTrails.keys()) if (!alive.has(h)) adsbTrails.delete(h);
  // zdarzenia wejścia/wyjścia obcych maszyn z zasięgu (obserwacja, nie alarm)
  for (const h of nowForeign) if (!watchPrev.has(h))
    logWatchEvent("enter", { hex: h, ...(watchLast.get(h) || {}) });
  for (const h of watchPrev) if (!nowForeign.has(h)) {
    logWatchEvent("exit", { hex: h, ...(watchLast.get(h) || {}) });
    watchLast.delete(h);
  }
  watchPrev = nowForeign;
  updateWatchBadge(nowForeign.size);
  if (document.getElementById("watch")?.open) { fillWatch(); refreshWatchEvents(); }
  // warstwa GL trzyma tylko to, co potrzebne do rysowania — resztę czyta dymek z lookupu
  map.getSource("adsb")?.setData({ type: "FeatureCollection",
    features: planes.filter(p => p.lat != null).map(p => ({ type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { track: p.track ?? 0, hex: p.hex, heli: p.heli, foreign: !!p.foreign } })) });
  drawFollowTrail();
  if (followHex && adsbByHex.has(followHex)) {
    const p = adsbByHex.get(followHex);
    map.easeTo({ center: [p.lon, p.lat], duration: 800 });   // kamera podąża
  }
}

/* Karta obserwacji: obce maszyny w zasięgu teraz + dziennik wejść/wyjść. */
function fillWatch() {
  const at = histMode ? historyAdsbTime : Date.now();
  const cur = [...(histMode ? historyAdsbByHex : adsbByHex).values()].filter(p => p.foreign && p.lat != null)
    .sort((a, b) => (a.area || "zz").localeCompare(b.area || "zz"));
  const events = mergedWatchEvents(standalone ? [] : srvAdsbEvents, watchEvents, at);
  document.getElementById("watch-time").textContent = histMode
    ? `${UI.isEn ? "HISTORY VIEW" : "PODGLĄD HISTORII"} — ${watchClock(at)}`
    : (UI.isEn ? "LIVE — current observations" : "NA ŻYWO — bieżące obserwacje");
  document.getElementById("watch-scope").textContent = histMode
    ? (UI.isEn ? "Aircraft in the snapshot and earlier last observations" : "Maszyny w migawce i wcześniejsze ostatnie obserwacje")
    : (UI.isEn ? "Currently in range" : "W zasięgu teraz");
  document.getElementById("watch-sync").textContent = standalone
    ? (UI.isEn ? "Fallback: local journal only." : "Tryb awaryjny: wyłącznie dziennik lokalny.")
    : watchSyncState === "error"
      ? (UI.isEn ? "Server journal unavailable — showing available cached/local entries." : "Dziennik serwera niedostępny — pokazano dostępne wpisy z pamięci i lokalne.")
      : watchSyncState === "loading"
        ? (UI.isEn ? "Loading server journal…" : "Pobieranie dziennika serwera…")
        : (UI.isEn ? "Server and local journal · last 12 hours · entries no later than the displayed time" : "Dziennik serwera i lokalny · ostatnie 12 godzin · wpisy nie późniejsze niż wyświetlany czas");
  document.getElementById("watch-current").innerHTML = cur.length ? cur.map(p => {
    const c = hexCountry(p.hex);
    return `<div class="watch-row clickable" data-hex="${esc(p.hex)}" data-lat="${p.lat}" data-lon="${p.lon}" data-kind="plane">
      <b>${c ? c.flag + " " : ""}${esc(p.callsign || p.hex)}</b>${p.reg ? ` · ${UI.isEn ? "reg." : "rej."} ` + esc(p.reg) : ""}
      <div class="meta">${esc(acName(p.type, p.desc))}${p.area ? ` · ${UI.isEn ? "over" : "nad"}: <b>` + esc(p.area) + "</b>" : ""}
        ${p.alt != null ? " · " + esc(altText(p.alt)) : ""}</div>
        ${p.historicalOnly ? `<div class="fineprint">${UI.isEn ? "Last observation" : "Ostatnia obserwacja"} ${watchClock(p.observedAt)} — ${UI.isEn ? "not in snapshot" : "brak w migawce"}</div>` : ""}</div>`;
  }).join("") : `<div class="fineprint">${UI.isEn
    ? "No RU/BY aircraft with a position in this view. No data does not imply an empty airspace."
    : "Brak maszyn RU/BY z pozycją w tym widoku. Brak danych nie oznacza braku maszyn w powietrzu."}</div>`;
  document.getElementById("watch-events").innerHTML = events.length ? events.map(e =>
    `<div class="watch-ev"><span class="${e.kind === "enter" ? "ev-in" : "ev-out"}">${e.kind === "enter"
      ? (UI.isEn ? "▲ in range" : "▲ w zasięgu") : (UI.isEn ? "▼ disappeared" : "▼ zniknął")}</span>
      ${e.flag ? e.flag + " " : ""}${esc(e.callsign || e.label || e.reg || e.hex)}${e.reg && e.reg !== (e.callsign || e.label || e.reg || e.hex) ? " · " + esc(e.reg) : ""}${e.area ? " · " + esc(e.area) : ""}
      <span class="ts">${watchClock(e.t)} · ${Math.max(0, Math.floor((at - e.t) / 60000))} min ${UI.isEn ? "before displayed time" : "przed wyświetlanym czasem"}</span></div>`).join("")
    : `<div class="fineprint">${UI.isEn ? "No recorded events before the displayed time." : "Brak zapisanych zdarzeń przed wyświetlanym czasem."}</div>`;
  document.querySelectorAll("#watch-current .watch-row").forEach(el =>
    el.addEventListener("click", () => {
      const p = cur.find(p => p.hex === el.dataset.hex);
      document.getElementById("watch").close(); focusOnMap(el.dataset);
      if (p) openPlanePopup([p.lon, p.lat], p);
    }));
}
function watchClock(t) {
  return new Date(t).toLocaleTimeString(UI.isEn ? "en-GB" : "pl-PL", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
let watchSyncState = "loading", watchFetchAt = 0, watchFetchPending = false;
async function refreshWatchEvents() {
  if (standalone || watchFetchPending || Date.now() - watchFetchAt < 60000) return;
  const base = apiBase(); if (!base) return;
  watchFetchAt = Date.now(); watchFetchPending = true; watchSyncState = "loading";
  try {
    const r = await fetch(base + "/api/adsb/watch?hours=12", {signal: AbortSignal.timeout(12000)});
    if (!r.ok) throw new Error("watch journal unavailable");
    const j = await r.json();
    if (!Array.isArray(j.events)) throw new Error("invalid journal");
    // Ignore responses from a backend that was replaced while the request ran.
    if (base !== apiBase() || standalone) return;
    srvAdsbEvents = j.events.map(e => ({...e, t: Date.parse(e.ts)}));
    watchSyncState = "ok";
    // The journal may arrive after the snapshot. Refresh the same selection,
    // never a remembered slider index and never a view that has returned live.
    if (histMode) {
      const idx = histTimes.findIndex(ts => Date.parse(ts) === historyAdsbTime);
      if (idx >= 0) showHistoryAt(idx);
    }
  } catch { watchSyncState = "error"; }
  finally {
    watchFetchPending = false;
    if (document.getElementById("watch")?.open) fillWatch();
  }
}
function showWatch() { fillWatch(); document.getElementById("watch").showModal(); refreshWatchEvents(); }

/* ── panel boczny ────────────────────────────────────────────────────────── */
function relTime(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (d < 1) return UI.isEn ? "just now" : "przed chwilą";
  if (d < 60) return `${Math.round(d)} min ${UI.isEn ? "ago" : "temu"}`;
  return `${Math.floor(d / 60)} h ${Math.round(d % 60)} min ${UI.isEn ? "ago" : "temu"}`;
}
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const esc2 = esc;
/* Adres z kanału RSS to treść z zewnątrz, a `esc` zamienia tylko znaki HTML —
   sam schemat przepuszczał. Dopuszczamy wyłącznie http(s), żeby „javascript:"
   z przejętego lub złośliwego kanału nie stało się klikalnym kodem w WebView. */
const safeUrl = (u) => {
  const raw = String(u ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, location.href);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.href : "";
  } catch { return ""; }
};

/* Które karty województw są rozwinięte — stan trzymany poza DOM, bo listę
   przebudowujemy przy każdym odświeżeniu stanu. */
const openVoivs = new Set();

function renderPanel() {
  // w trybie historii panel należy do wybranej chwili — cykliczne odświeżanie
  // (co 30 s) i napływające stany nie mogą go podmienić na dane bieżące
  if (histMode) return;
  const f = state?.fusion; if (!f) return;
  document.getElementById("window-min").textContent = f.window_min;

  const mine = myVoiv();
  const voivs = Object.entries(f.voivodeships)
    .sort((a, b) => (b[1].score - a[1].score) ||
      (PRIORITY.indexOf(a[0]) + 99) - (PRIORITY.indexOf(b[0]) + 99));
  // zawsze: mój region + priorytetowe + wszystkie z jakimkolwiek sygnałem
  const show = voivs.filter(([n, st]) => st.score > 0 || PRIORITY.includes(n) || n === mine);
  if (mine) show.sort((a, b) => (b[0] === mine) - (a[0] === mine));
  // Rozwinięte karty i pozycja przewinięcia MUSZĄ przeżyć przebudowę listy:
  // panel odświeża się przy każdym stanie z serwera i co 30 s, więc rozwinięta
  // karta zwijała się sama, a treść „uciekała" spod palca (zgłoszone 12.09.2026).
  const panelEl = document.getElementById("panel");
  const keepScroll = panelEl?.scrollTop || 0;
  document.getElementById("voiv-cards").innerHTML = show.map(([name, st]) => `
    <div class="voiv-card level-${st.level}${name === mine ? " is-mine" : ""}${
      openVoivs.has(name) ? " open" : ""}" data-voiv="${esc(name)}">
      <div class="voiv-head">
        <span class="voiv-name">${esc(UI.voiv(name))}</span>
        <span class="voiv-score">${st.score.toFixed(1)} ${UI.isEn ? "pts" : "pkt"}</span>
      </div>
      <div class="voiv-level">${st.level === "none" && st.score > 0
        ? (UI.isEn ? "below threshold" : "poniżej progu") : LEVEL_LABEL[st.level]}
        <span class="muted">· ${UI.isEn ? "thresholds" : "progi"}: ≥${f.thresholds.elevated} ${UI.isEn ? "attention" : "uwaga"}, ≥${f.thresholds.high} ${UI.isEn ? "priority" : "priorytet"}</span></div>
      <div class="voiv-breakdown">${st.signals.length
        ? sigList(st.signals)
        : `<div class="fineprint">${UI.isEn ? "no signals in the window" : "brak sygnałów w oknie"}</div>`}
        ${camIndex?.has(name)
          ? `<button class="chip btn-cams" data-voiv="${esc(name)}">📷 ${UI.isEn ? "Cameras in the region" : "Kamery w regionie"}
               (${camData[name].filter(c => c.outdoor !== false).length})</button>`
          : ""}</div>
    </div>`).join("");
  document.querySelectorAll(".voiv-card").forEach(el =>
    el.addEventListener("click", () => {
      const open = el.classList.toggle("open");
      const name = el.dataset.voiv;
      if (open) openVoivs.add(name); else openVoivs.delete(name);
    }));
  if (panelEl && keepScroll) panelEl.scrollTop = keepScroll;
  document.querySelectorAll(".btn-cams").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); showCameras(el.dataset.voiv); }));

  // baner mojego regionu — zawsze widoczny, niezależnie od panelu
  const banner = document.getElementById("my-banner");
  if (mine && f.voivodeships[mine]) {
    const st = f.voivodeships[mine];
    banner.className = "level-" + st.level;
    banner.innerHTML = `<b>${esc(UI.voiv(mine))}</b> — <span class="lvl">${LEVEL_LABEL[st.level]}</span>
      <span class="muted">${st.score.toFixed(1)} ${UI.isEn ? "pts" : "pkt"}</span>`;
    banner.onclick = () => { setPanel(true); openCard(mine); };
  } else {
    banner.className = "hidden";
    banner.innerHTML = "";
  }

  const sigs = [];
  for (const [name, st] of voivs) for (const s of st.signals) sigs.push(s);
  sigs.sort((a, b) => b.ts.localeCompare(a.ts));
  document.getElementById("signal-list").innerHTML = sigList(sigs);
  renderObservationLists(state);
}

function renderObservationLists(viewState) {
  const near = (viewState.neptun?.threats || [])
    .filter(t => t.pl_assessment && t.pl_assessment.dist_km <= 250)
    .sort((a, b) => a.pl_assessment.dist_km - b.pl_assessment.dist_km);
  document.getElementById("threat-list").innerHTML = near.map(t => {
    const m = TYPE_META[t.type] || { label: t.type, color: "#8a93a6" };
    const a = t.pl_assessment;
    return `<div class="threat-row clickable" data-lat="${t.lat}" data-lon="${t.lon}"
      data-kind="threat" data-id="${esc(t.id)}">
      <b style="color:${m.color}">${esc(UI.type(t.type, m.label))}</b>
      — ${threatDistanceText(t, a.dist_km)} ${UI.isEn ? "from the border" : "od granicy"} (${esc(UI.voiv(a.border_voiv))})${
        a.heading_known === false
          ? ` · <b style='color:#ffb020'>${UI.isEn ? "unknown heading" : "kurs nieznany"}</b>`
          : (a.toward_pl ? ` · <b style='color:#ff4d5e'>${UI.isEn ? "heading towards Poland" : "kurs na PL"}</b>` : "")}
      ${(() => { const e = etaInfo(t);
        return e && e.border != null
          ? `<div class="meta eta-row">⏱ ${UI.isEn ? "to border" : "do granicy"} <b>${etaTxt(e.border)}</b>${
              e.voiv != null ? ` · ${UI.isEn ? "to" : "do woj."} ${esc(UI.voiv(e.voivName))} <b>${etaTxt(e.voiv)}</b>` : ""}</div>`
          : ""; })()}
      ${localPlaceHtml(t)}
      ${isApproxPosition(t) ? `<div class="meta">${approxPositionNote(t)}</div>` : ""}
      <div class="meta">${UI.isEn ? "confidence" : "wiarygodność"}: ${esc(UI.confidence(t.confidenceLevel, CONF_PL[t.confidenceLevel] || t.confidenceLevel))}
        · ±${esc(t.uncertaintyKm)} km · ${esc(threatDesc(t))} · ${relTime(t.updatedAt)}</div>
    </div>`;
  }).join("");

  const planes = viewState.adsb?.aircraft || [];
  document.getElementById("adsb-list").innerHTML = planes.map(p => {
    const role = acRole(p.type, p.desc);
    const heli = isHeli(p.cat, p.type, p.desc);
    const vr = typeof p.vr === "number" ? p.vr : null;
    return `
    <div class="threat-row clickable" style="background:rgba(57,197,236,.07)"
         data-lat="${p.lat}" data-lon="${p.lon}" data-kind="plane">
      <b style="color:#39c5ec">${heli ? "🚁" : "✈"} ${esc(p.callsign || p.hex)}</b>
      ${esc(acName(p.type, p.desc))}${p.year ? ` <span class="meta">(${esc(p.year)})</span>` : ""}
      ${role ? `<div style="color:#9fd8ec;font-size:11px">${esc(roleText(role))}</div>` : ""}
      <div class="meta">
        ${UI.isEn ? "province" : "woj."} ${esc(UI.voiv(p.voivodeship))}
        · ${altText(p.alt)}
        ${vr ? (vr > 100 ? " ↑" : vr < -100 ? " ↓" : "") : ""}
        ${p.gs != null ? ` · ${ktToKmh(p.gs)} km/h` : ""}
        ${p.track != null ? ` · ${UI.isEn ? "heading" : "kurs"} ${Math.round(p.track)}° (${compass(p.track)})` : ""}
      </div>
      <div class="meta">${p.reg ? (UI.isEn ? "reg. " : "rej. ") + esc(p.reg) : ""}${p.op ? " · " + esc(p.op) : ""}</div>
      ${p.historicalOnly ? `<div class="fineprint">${UI.isEn ? "Last observation" : "Ostatnia obserwacja"} ${watchClock(p.observedAt)} — ${UI.isEn ? "not in snapshot" : "brak w migawce"}</div>` : ""}
    </div>`;
  }).join("");

  // listenery dopiero teraz — wcześniej listy nie istnieją jeszcze w DOM
  document.querySelectorAll(".threat-row.clickable").forEach(el =>
    el.addEventListener("click", () => focusOnMap(el.dataset)));
}

/* Lista sygnałów w panelu sortowana malejąco po REALNYM wkładzie
   (counted_points) — driver alertu na górze, a dogasające/zerowe (np. stare,
   zlimitowane strefy PAŻP) schodzą niżej. */
const byPts = (a, b) => (b.counted_points ?? b.points ?? 0) - (a.counted_points ?? a.points ?? 0);
function sigList(arr, limit) {
  let a = (arr || []).slice().sort(byPts);
  if (limit) a = a.slice(0, limit);
  return a.map(sigHTML).join("");
}

/* Etykiety źródeł po polsku — „PANSA"/„NEIGHBOURS" nic nie mówiły użytkownikowi. */
const SRC_LABEL = { neptun: "NEPTUN", media: "MEDIA", rcb: "RCB", adsb: "ADS-B",
  pansa: "PAŻP", neighbours: "SĄSIEDZI", spillover: "SĄSIEDZTWO",
  // osobna klasa od 1.7.22: oficjalny alarm powietrzny w przygranicznym obwodzie UA
  ua_alert: "ALARM UA", test: "TEST" };
const SRC_ICON = { neptun: "🎯", media: "📰", rcb: "🚨", adsb: "✈", pansa: "🛑",
  neighbours: "🌍", spillover: "↔", ua_alert: "📢", test: "🧪" };
/* Nazwy obwodów UA do tytułu sygnału — po polsku i po angielsku, żeby interfejs
   nie pokazywał cyrylicy ani polskiego tekstu w wersji angielskiej. */
const UA_OBLAST_PL_UI = { "Волинська": "wołyńskim", "Львівська": "lwowskim",
  "Закарпатська": "zakarpackim", "Рівненська": "rówieńskim", "Житомирська": "żytomierskim" };
const UA_OBLAST_EN = { "Волинська": "Volyn", "Львівська": "Lviv",
  "Закарпатська": "Zakarpattia", "Рівненська": "Rivne", "Житомирська": "Zhytomyr" };

function sigHTML(s) {
  const link = safeUrl(s.details?.link || s.details?.url);
  const cp = s.counted_points ?? s.points;
  const w = s.weight;                       // waga wygaszania z accumulate (1,0 = świeży)
  // Rozróżniamy powody, dla których liczy się mniej niż nominał:
  //  • wygaszanie w czasie (waga < 1) — naturalne starzenie sygnału,
  //  • limit klasy źródła (cap) — nadwyżka ponad wkład tej klasy w oknie.
  // Wcześniej oba pokazywały ten sam przekreślony nominał z podpowiedzią o limicie,
  // co przy zwykłym starzeniu wprowadzało w błąd.
  const expected = s.points * (w ?? 1);
  const capped = cp < expected - 0.005;
  const repeatedOfficial = !!s.duplicate_of_official;
  const retrospective = !!s.retrospective;
  const src = s.source || "";
  // udział względem progu żółtego (2 pkt) — od razu widać, czy to drobiazg,
  // czy sygnał, który sam niemal domyka alarm
  const share = Math.max(0, Math.min(100, (cp / 2) * 100));
  const faded = w != null && w < 0.99;
  const d = s.details || {};
  const signalPosition = { lat:d.lat, lon:d.lon, positionQuality:d.position_quality,
    areaOnly:d.area_only, straznik_position:d.position_approximate
      ? { quality:"approx", reason:d.position_reason, locality:d.position_locality } : null };
  const signalApprox = src === "neptun" && isApproxPosition(signalPosition);
  // NEPTUN: odległość i pewność kursu wprost w wierszu — bez tego nie było
  // widać, że obiekt bez kursu w ogóle jest brany pod uwagę
  const extra = [];
  if (d.dist_km != null) extra.push(`${threatDistanceText(signalPosition, d.dist_km)} ${UI.isEn ? "from the border" : "od granicy"}`);
  if (src === "neptun") {
    if (d.course === "unknown") extra.push(UI.isEn ? "unknown heading" : "kurs nieznany");
    else if (d.course === "estimated") extra.push(UI.isEn ? "heading estimated from movement" : "kurs szacowany z ruchu");
  }
  if (d.source_count) extra.push(`${d.source_count} ${UI.isEn ? "conf." : "potw."}`);
  // czas dolotu policzony przy sygnale — dla regionu użytkownika, a gdy go brak,
  // to do granicy; „ile mam czasu" jest ważniejsze niż „ile to kilometrów"
  const mineV = myVoiv();
  const etaV = mineV && d.eta_voiv_min ? d.eta_voiv_min[mineV] : null;
  if (!signalApprox && etaV != null) extra.push(`⏱ ${etaTxt(etaV)} ${UI.isEn ? "to" : "do woj."} ${UI.voiv(mineV)}`);
  else if (!signalApprox && d.eta_border_min != null) extra.push(`⏱ ${etaTxt(d.eta_border_min)} ${UI.isEn ? "to border" : "do granicy"}`);
  let shownTitle = s.title;
  // Tytuły, które PISZEMY SAMI (alarm obwodu UA, przeniesienie od sąsiada), muszą
  // iść za językiem interfejsu — serwer zapisuje je po polsku, więc w wersji
  // angielskiej zostawały polskie. Cytaty ze źródeł (NEPTUN, RCB, media) zostają
  // w oryginale, bo to przytoczenie cudzej treści.
  if (s.event_type === "ua_alert_border" && d.oblast) {
    const ob = UI.isEn ? (UA_OBLAST_EN[d.oblast] || d.oblast)
                       : (UA_OBLAST_PL_UI[d.oblast] || d.oblast);
    shownTitle = UI.isEn
      ? `Air-raid alert in ${ob} oblast (borders ${UI.voiv(s.voivodeship)})`
      : `Alarm powietrzny w obwodzie ${ob} (graniczy z woj. ${UI.voiv(s.voivodeship)})`;
  } else if (s.event_type === "neighbour_spillover" && d.from) {
    const factor = `${d.from_score} × 0.4^${d.depth}`;
    shownTitle = UI.isEn
      ? `Carried over from ${UI.voiv(d.from)} (${factor})`
      : `Przeniesienie z woj. ${UI.voiv(d.from)} (${factor})`;
  }
  // Polonizujemy także stare wpisy zapisane już w bazie, korzystając ze
  // stabilnego details.type zamiast ukraińskiego/rosyjskiego tytułu źródła.
  if (src === "neptun" && d.type) {
    const marker = " kursem na granicę PL";
    const at = String(shownTitle || "").indexOf(marker);
    const prefix = (Number(d.count) || 1) > 1 ? `${Number(d.count)}× ` : "";
    shownTitle = signalApprox && d.dist_km != null
      ? prefix + threatLabelPL(d.type) + ` kursem na granicę PL, ${threatDistanceText(signalPosition, d.dist_km)}`
      : prefix + threatLabelPL(d.type) + (at >= 0 ? String(shownTitle).slice(at) : "");
    if (UI.isEn) {
      const count = (Number(d.count) || 1) > 1 ? `${Number(d.count)}× ` : "";
      shownTitle = count + threatLabelPL(d.type)
        + (d.dist_km != null ? ` heading towards the Polish border, ${threatDistanceText(signalPosition, d.dist_km)}` : "");
    }
  }
  return `<div class="sig src-${esc(src)}">
    <div class="sig-head">
      <span class="src">${SRC_ICON[src] || "•"} ${esc(SRC_LABEL[src] || src.toUpperCase())}</span>
      <span class="pts${capped ? " capped" : ""}"
        ${capped ? `title="${repeatedOfficial
          ? (UI.isEn ? "repeats an official alert — visible, with no extra points" : "powtarza oficjalny alert — widoczne, bez dodatkowych punktów")
          : retrospective
            ? (UI.isEn ? "historical report or aftermath — visible, with no threat points" : "materiał historyczny lub następstwa — widoczne, bez punktów zagrożenia")
          : (UI.isEn ? "above this source-class cap — excess points are not counted" : "ponad limit tej klasy źródła — nadwyżka nie liczy się do sumy")}"` : ""}>
        +${cp}${capped ? ` <s>${s.points}</s>` : ""}</span>
    </div>
    <div class="sig-title">${repeatedOfficial ? `<b>${UI.isEn ? "Repeated official alert:" : "Powtórzenie oficjalnego alertu:"}</b> ` : ""}${retrospective ? `<b>${UI.isEn ? "Historical report / aftermath:" : "Materiał historyczny / następstwa:"}</b> ` : ""}${link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(shownTitle)}</a>`
      : esc(shownTitle)}</div>
    <div class="sig-bar"><i style="width:${share.toFixed(0)}%"></i></div>
    <div class="ts">${relTime(s.ts)} · ${UI.isEn ? "province" : "woj."} ${esc(UI.voiv(s.voivodeship))}${
      extra.length ? " · " + extra.map(esc).join(" · ") : ""}${
      faded ? ` · <span title="sygnał starzeje się w oknie 60 min i traci wagę">waga ${Math.round(w * 100)}%</span>` : ""}</div>
  </div>`;
}

function openCard(name) {
  setPanel(true);   // klasa "open" była pozostałością po starym układzie panelu
  const el = document.querySelector(`.voiv-card[data-voiv="${CSS.escape(name)}"]`);
  if (el) { el.classList.add("open"); el.scrollIntoView({ behavior: "smooth" }); }
}

/* Co znaczy każda dioda i dlaczego bywa czerwona — czerwona kropka bez
   wyjaśnienia niepokoi bardziej niż powinna, bo najczęstsze przyczyny są
   niegroźne (źródło chwilowo nie odpowiada, warstwa jeszcze się nie rozgrzała). */
const SOURCE_INFO = {
  "NEPTUN": {
    co: "Agregator OSINT z Ukrainy — obiekty powietrzne (drony, rakiety, KAB) "
      + "kursem na granicę PL. Główne źródło wyprzedzenia. Pole „confirmed” może "
      + "potwierdzać meldunek, nie dokładność współrzędnych; rozpoznane punkty "
      + "miejscowości pokazujemy i punktujemy jako rejonowe.",
    czerwona: "Zerwane połączenie z serwerem NEPTUN albo brak internetu. "
      + "Aplikacja próbuje ponownie co minutę.",
  },
  "Alarmy UA": {
    co: "Oficjalne alarmy powietrzne w przygranicznych obwodach Ukrainy "
      + "(wołyński, lwowski, zakarpacki, rówieński) — sygnał wyprzedzający. "
      + "Docierają połączeniem NEPTUN (WebSocket w aplikacji lub przez serwer). "
      + "Przy zamkniętej aplikacji alarm Twojego regionu przychodzi osobno pushem.",
    czerwona: "Połączenie NEPTUN nie potwierdza w tej chwili alarmów obwodowych. "
      + "Alarm w obwodzie UA może wtedy nie być pokazany na żywo — sprawdź "
      + "połączenie z internetem.",
  },
  "ADS-B": {
    co: "Publiczne transpondery lotnicze (airplanes.live, w zapasie adsb.lol) — "
      + "maszyny wojskowe nad Polską i regionem. Punktuje dopiero ruch dwukrotnie "
      + "wyższy niż o tej samej porze doby w ostatnich 7 dniach. Karta samolotu "
      + "pokazuje zdjęcie, kraj rejestracji i pełną telemetrię.",
    czerwona: "Serwisy ADS-B nie odpowiadają. Warstwa nie punktuje też przez "
      + "pierwszy tydzień, zanim uzbiera się średnia do porównania.",
  },
  "RSS": {
    co: "Media lokalne i ogólnopolskie — nagłówki o syrenach, alarmach "
      + "i naruszeniach przestrzeni powietrznej.",
    czerwona: "Żaden kanał nie odpowiedział. Zwykle chwilowe; bywa też, "
      + "że serwis zmienił format i wymaga poprawki.",
  },
  "RCB": {
    co: "Komunikaty Rządowego Centrum Bezpieczeństwa z gov.pl — jedyne "
      + "oficjalne źródło w tym zestawie.",
    czerwona: "Strona gov.pl nie odpowiada albo zmieniła układ. "
      + "Alerty RCB docierają wtedy tylko przez SMS-y systemowe.",
  },
  "PAŻP": {
    co: "Strefy przestrzeni powietrznej (AUP/UUP) z airspace.pansa.pl — "
      + "nowo aktywowana strefa nad regionem to sygnał pomocniczy.",
    czerwona: "Serwis PAŻP nie odpowiada. W trybie wbudowanym ta warstwa "
      + "bywa niedostępna — wtedy pozostałe źródła działają normalnie.",
  },
};

function ledItems() {
  const h = state?.health || {};
  const rssFeeds = h.rss ? Object.values(h.rss) : [];
  const rssOk = rssFeeds.some(Boolean);
  return [
    ["NEPTUN", !!h.neptun, ""],
    // osobna dioda alarmów obwodowych UA: docierają połączeniem NEPTUN
    // (WebSocket w aplikacji albo przez serwer), więc zasługują na własny
    // wskaźnik obok NEPTUN-a
    ["Alarmy UA", !!h.ua_alerts, ""],
    ["ADS-B", !!h.adsb, ""],
    ["RSS", rssOk, rssFeeds.length ? `${rssFeeds.filter(Boolean).length}/${rssFeeds.length} kanałów` : ""],
    ["RCB", !!h.rcb, ""],
    ["PAŻP", !!h.pansa, ""],
  ];
}

function renderLeds() {
  document.getElementById("status-leds").innerHTML = ledItems().map(([n, ok]) =>
    `<span class="led ${ok ? "ok" : "err"}"><i></i><span>${n}</span></span>`).join("");
  // okno źródeł bywa otwarte właśnie wtedy, gdy użytkownik czeka na powrót
  // połączenia — musi pokazywać stan na żywo, nie ten sprzed otwarcia
  if (document.getElementById("sources")?.open) fillSources();
}

function fillSources() {
  const rows = ledItems().map(([name, ok, extra]) => {
    const info = SOURCE_INFO[name] || {};
    return `<div class="src-row ${ok ? "ok" : "err"}">
      <div class="src-head"><i></i><b>${name}</b>
        <span class="src-state">${ok ? "działa" : "nie odpowiada"}${extra ? " · " + esc(extra) : ""}</span></div>
      <p class="src-what">${info.co || ""}</p>
      ${ok ? "" : `<p class="src-why">Dlaczego czerwona: ${info.czerwona || ""}</p>`}
    </div>`;
  }).join("");
  const anyErr = ledItems().some(([, ok]) => !ok);
  document.getElementById("src-list").innerHTML = rows;
  document.getElementById("src-note").innerHTML = anyErr
    ? "Czerwona dioda nie oznacza awarii aplikacji — pozostałe źródła liczą się "
      + "dalej, a fuzja i tak wymaga zgodności kilku z nich. Jeśli czerwone są "
      + "wszystkie, sprawdź połączenie z internetem."
    : "Wszystkie źródła odpowiadają.";
}

function showSources() {
  fillSources();
  document.getElementById("sources").showModal();
}

document.getElementById("status-leds").onclick = () => { if (state) showSources(); };

/* Popup „Strażnik": na desktopie pokazuje go hover (CSS), a na ekranach
   dotykowych sterujemy nim tapnięciem — dotknięcie marki przełącza, dotknięcie
   poza nią albo Escape chowa. Bez tego mobilny :hover zostawał „przyklejony"
   i popup nie znikał, zasłaniając interfejs. */
(() => {
  const brand = document.querySelector(".brand");
  if (!brand) return;
  brand.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;   // link „Kod źródłowy" ma otworzyć GitHub
    brand.classList.toggle("brand-open");
  });
  brand.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); brand.classList.toggle("brand-open"); }
    else if (e.key === "Escape") brand.classList.remove("brand-open");
  });
  document.addEventListener("click", (e) => {
    if (!brand.contains(e.target)) brand.classList.remove("brand-open");
  });
})();
document.getElementById("src-close")?.addEventListener("click", () =>
  document.getElementById("sources").close());
document.getElementById("btn-watch")?.addEventListener("click", () => showWatch());
document.getElementById("watch-close")?.addEventListener("click", () =>
  document.getElementById("watch").close());
document.getElementById("ac-card-x")?.addEventListener("click", () => hideCard());
document.getElementById("ac-card-zoom")?.addEventListener("click", () => {
  try { localStorage.setItem("straznik_card_big", cardBig() ? "0" : "1"); } catch {}
  applyCardSize();
  document.getElementById("ac-card").scrollTop = 0;
});

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
  document.getElementById("alarm-voiv").textContent = (UI.isEn ? "province " : "woj. ") + UI.voiv(voiv);
  document.getElementById("alarm-score").textContent =
    `${st.score.toFixed(1)} ${UI.isEn ? "pts in a" : "pkt w oknie"} ${state?.fusion?.window_min ?? 60} min ${UI.isEn ? "window" : ""}`;
  document.getElementById("alarm-signals").innerHTML =
    sigList(st.signals, 5) || "";
  document.getElementById("alarm-time").textContent =
    (UI.isEn ? "alert at " : "alarm o ") + new Date().toLocaleTimeString(UI.isEn ? "en-GB" : "pl-PL");
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
// Żółty gong osiąga ok. 0,55 z dodatkową harmoniczną. Dawne 0,40 sprawiało,
// że alarm czerwony był wyraźnie cichszy mimo wyższego priorytetu.
const SIREN_GAIN = 0.62;

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
    g.gain.exponentialRampToValueAtTime(SIREN_GAIN, t0 + 0.3);
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
      g.gain.setValueAtTime(SIREN_GAIN, t0 + total - 0.6);
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
  const voivodeships = Places?.observedVoivodeships(savedPlaces) || [];
  if (!voivodeships.length) return openSettings(true);
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
  const saved = await fetch(base + "/api/push/subscribe", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub.toJSON(), voivodeships }) });
  if (!saved.ok) throw new Error("Nie udało się zapisać subskrypcji Web Push");
  document.getElementById("btn-push").classList.add("active");
}

async function syncBrowserPushRegion() {
  if (standalone || !("serviceWorker" in navigator) || !("PushManager" in window)
      || !("Notification" in window) || Notification.permission !== "granted") return;
  const base = apiBase();
  if (!base) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const voivodeships = Places?.observedVoivodeships(savedPlaces) || [];
  if (!voivodeships.length) {
    await fetch(base + "/api/push/unsubscribe", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }) });
    document.getElementById("btn-push").classList.remove("active");
    return;
  }
  const saved = await fetch(base + "/api/push/subscribe", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub.toJSON(), voivodeships }) });
  if (saved.ok) document.getElementById("btn-push").classList.add("active");
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
/* Jednolite przybliżenie dla KAŻDEGO województwa: `fitBounds` dawał inny plan dla
   dużego mazowieckiego i małego opolskiego, więc „mój region" wyglądał za każdym
   razem inaczej. Stały zoom = ten sam kadr niezależnie od regionu. */
/* Kadr „mój region": województwo w kontekście — cała Polska plus przygraniczne obwody
   Ukrainy i Białorusi. Ciaśniejsze ustawienie (6,6 i wcześniej 7,15) wypełniało ekran
   samym obrysem i nie było widać, skąd nadlatują obiekty. Wartość dobrana na Pixelu 7
   pod zrzut zatwierdzony przez użytkownika. */
const VOIV_ZOOM = 5.3;
function goHome(instant) {
  const name = myVoiv();
  if (!name) {
    // Bez zapisanego miejsca przycisk robił to samo co „cała PL" i wyglądał na
    // zepsuty — mówimy wprost, czego brakuje.
    fitAll(instant);
    toast(UI.isEn ? "Set your place first: Settings → My places"
                  : "Najpierw ustaw miejsce: Ustawienia → Moje miejsca");
    return;
  }
  const f = featureFor(name);
  if (!f) return fitAll(instant);
  const [[minX, minY], [maxX, maxY]] = bboxOf(f);
  map.easeTo({ center: [(minX + maxX) / 2, (minY + maxY) / 2], zoom: VOIV_ZOOM,
    pitch: is3d ? 50 : 0, bearing: is3d ? -8 : 0, duration: instant ? 0 : 900 });
}
function fitAll(instant) {
  if (!map) return;
  map.fitBounds(FIT_BOUNDS, { padding: FIT_PAD, pitch: is3d ? 45 : 0,
    bearing: is3d ? -8 : 0, duration: instant ? 0 : 900 });
}

/* ── przelot mapy do obiektu wybranego z listy ───────────────────────────── */
function focusOnMap(d) {
  const lat = parseFloat(d.lat), lon = parseFloat(d.lon);
  if (!mapReady || !isFinite(lat) || !isFinite(lon)) return;
  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 7.6),
    speed: 1.2, essential: true });
  // Panel ZOSTAJE otwarty — samoczynne chowanie się po dotknięciu pozycji było
  // mylące (wyglądało jak „panel sam się zwija po kilku sekundach") i zabierało
  // kontekst listy. Zamykamy tylko przyciskiem ✕ lub ☰.
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

/* ── bufor historii w PAMIĘCI (tryb serwerowy) ───────────────────────────────
   Przewijanie suwaka NIE pyta serwera o każdą pozycję (to przy wielu użytkownikach
   mnożyło zapytania i obciążało VPS). Zamiast tego trzymamy 12 h w RAM aplikacji:
   • seed RAZ z /api/history/bundle (backfill sprzed otwarcia apki),
   • odświeżanie z ŻYWEGO feedu (applyState) — te same dane, które i tak przychodzą
     do mapy na żywo, więc 6 h otwartej apki nie generuje dodatkowych pobrań.
   Bufor żyje tylko w pamięci — NIE zapisujemy go na dysk; zamknięcie apki czyści
   go, a nic się nie kumuluje. Fuzję dla każdej chwili liczy lokalnie ten sam
   `accumulate` co silnik offline (Engine.historyFrom/timelineFrom). */
let srvSnaps = [], srvSigs = [], srvAdsbEvents = [], srvSeeded = false, _srvSnapT = 0;
const HIST_MS = 12 * 3600 * 1000;
const _sigKey = (s) => (s.source || "") + "|" + (s.ts || "") + "|" + (s.voivodeship || "") + "|" + (s.title || "");

function srvMergeSignals(list) {
  if (!list?.length) return;
  const have = new Set(srvSigs.map(_sigKey));
  for (const s of list) {
    if (!s || s.source === "spillover") continue;   // spillover jest wyliczany, nie surowy
    const k = _sigKey(s);
    if (have.has(k)) continue;
    have.add(k);
    srvSigs.push({ t: s.t ?? Date.parse(s.ts), ts: s.ts, source: s.source,
      event_type: s.event_type, voivodeship: s.voivodeship, points: s.points,
      title: s.title, details: s.details, url: s.url });
  }
  const cut = Date.now() - HIST_MS;
  srvSigs = srvSigs.filter(s => s.t >= cut);
}

/* Zapis żywego stanu do bufora: sygnały (od razu) + migawka pozycji co ~2 min. */
function srvRecord(s) {
  const voivs = s?.fusion?.voivodeships || {};
  const flat = [];
  for (const st of Object.values(voivs)) for (const sig of (st.signals || [])) flat.push(sig);
  srvMergeSignals(flat);
  const now = Date.now();
  if (now - _srvSnapT < 110000) return;             // migawki co ~2 min, jak w silniku offline
  _srvSnapT = now;
  const threats = (s?.neptun?.threats || []).filter(t => t.lat != null).map(t => ({
    id: t.id, type: t.type, lat: +(+t.lat).toFixed(3), lon: +(+t.lon).toFixed(3),
    heading: t.heading, confidenceLevel: t.confidenceLevel, uncertaintyKm: t.uncertaintyKm,
    region: t.region, locality: t.locality, sourceCount: t.sourceCount,
    destination: t.destination, positionQuality: positionQuality(t),
    areaOnly: t.areaOnly, straznik_position: positionInfo(t),
    pl_assessment: t.pl_assessment }));
  const aircraft = (s?.adsb?.aircraft || []).map(a => ({ hex: a.hex, callsign: a.callsign,
    type: a.type, lat: +(+a.lat).toFixed(3), lon: +(+a.lon).toFixed(3), alt: a.alt, gs: a.gs,
    track: a.track, voivodeship: a.voivodeship, desc: a.desc, cat: a.cat,
    reg: a.reg, op: a.op, vr: a.vr, year: a.year }));
  srvSnaps.push({ ts: new Date(now).toISOString(), t: now, threats, aircraft });
  const cut = now - HIST_MS;
  srvSnaps = srvSnaps.filter(sn => sn.t >= cut);
}

/* Jednorazowy backfill 12 h z serwera (pozycje sprzed otwarcia apki). Łagodnie
   znosi stary backend bez endpointu — wtedy historia jest krótsza (tylko to, co
   apka nagrała na żywo od otwarcia), ale apka działa. */
async function seedBundle() {
  const base = apiBase(); if (!base) return;
  try {
    const r = await fetch(base + "/api/history/bundle?hours=12");
    if (!r.ok) return;
    const j = await r.json();
    srvMergeSignals((j.signals || []).map(s => ({ ...s, t: Date.parse(s.ts) })));
    const have = new Set(srvSnaps.map(sn => sn.ts));
    for (const sn of (j.snaps || [])) {
      if (have.has(sn.ts)) continue;
      srvSnaps.push({ ...sn, t: Date.parse(sn.ts) });
    }
    srvAdsbEvents = (j.adsb_watch_events || []).map(e => ({ ...e, t: Date.parse(e.ts) }));
    watchSyncState = "ok";
    srvSnaps.sort((a, b) => a.t - b.t);
    srvSeeded = true;
  } catch {}
}
function needSeed() {
  if (!srvSeeded) return true;
  const newest = srvSnaps.length ? srvSnaps[srvSnaps.length - 1].t : 0;
  return (Date.now() - newest) > 5 * 60 * 1000;   // luka (np. milczący WS) → dociągnij świeże
}

/* Historia lokalnie (bez sieci): offline ⇒ silnik, serwer ⇒ bufor w RAM. */
function fetchHistory(at) {
  return standalone ? Engine.history(at) : Engine.historyFrom(srvSnaps, srvSigs, at);
}

function historicalAdsbGhosts(events, planes, whenMs) {
  const planeHexes = new Set(planes.map(p => p.hex).filter(Boolean));
  const nearest = new Map();
  for (const e of events || []) {
    const et = e.t ?? Date.parse(e.ts);
    const age = whenMs - et;
    if (!e.hex || e.lat == null || e.lon == null || !Number.isFinite(age) || age < 0 || age > 150000
        || planeHexes.has(e.hex)) continue;
    const prev = nearest.get(e.hex);
    if (!prev || Math.abs(et - whenMs) < Math.abs((prev.t ?? Date.parse(prev.ts)) - whenMs))
      nearest.set(e.hex, e);
  }
  return [...nearest.values()].map(e => ({ ...e, observedAt: e.t ?? Date.parse(e.ts), historicalOnly: true, foreign: true }));
}

function mergedWatchEvents(server, local, at) {
  const valid = list => (list || []).map(e => ({...e, t: e.t ?? Date.parse(e.ts)}))
    .filter(e => e.hex && Number.isFinite(e.t) && e.t <= at && e.t >= at - 12 * 3600000);
  const result = valid(server);
  for (const e of valid(local)) {
    // Only coalesce copies of the same transition, not successive enter/exit cycles.
    if (!result.some(s => s.hex === e.hex && s.kind === e.kind && Math.abs(s.t - e.t) <= 60000)) result.push(e);
  }
  const keys = new Set();
  return result.sort((a,b) => b.t-a.t).filter(e => {
    const key = `${e.hex}|${e.kind}|${e.t}`;
    if (keys.has(key)) return false;
    keys.add(key); return true;
  });
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

function fetchTimeline() {
  return standalone ? Engine.timeline() : Engine.timelineFrom(srvSnaps, srvSigs);
}

async function toggleHistory() {
  const bar = document.getElementById("timebar");
  if (histMode) return exitHistory();
  if (!standalone && needSeed()) await seedBundle();   // jednorazowy backfill 12 h z serwera
  const h = fetchHistory();
  histTimes = h?.times || [];
  paintTimeline(fetchTimeline());
  if (!histTimes.length) {
    document.getElementById("tb-info").textContent =
      UI.isEn ? "No saved history — snapshots are created every 2 minutes after startup."
        : "Brak zapisanej historii — migawki powstają co 2 minuty od uruchomienia.";
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
  syncTabs();
  showHistoryAt(histTimes.length - 1);
  refreshWatchEvents(); // one small journal request, never one per slider movement
}

function exitHistory() {
  if (_scrubRaf) { cancelAnimationFrame(_scrubRaf); _scrubRaf = 0; }
  histMode = false;
  historyAdsbByHex.clear(); historyAdsbTime = null; hideCard();
  document.body.classList.remove("history-mode");
  document.getElementById("timebar").classList.add("hidden");
  document.getElementById("btn-history").classList.remove("active");
  syncTabs();
  if (state) { renderPanel(); if (mapReady) { updateVoivStates(); updateAdsb(); } }
  if (document.getElementById("watch")?.open) fillWatch();
}

function showHistoryAt(idx) {
  if (!histMode) return;
  const ts = histTimes[idx];
  if (!ts) return;
  const h = fetchHistory(ts);               // lokalnie, bez sieci — natychmiast
  if (!h) return;
  const snap = h?.snapshot;
  const when = new Date(snap?.ts || ts);
  const ageMin = Math.round((Date.now() - when.getTime()) / 60000);
  document.getElementById("tb-label").textContent =
    when.toLocaleTimeString(UI.isEn ? "en-GB" : "pl-PL", { hour: "2-digit", minute: "2-digit" })
    + (ageMin > 1 ? ` (−${ageMin} min)` : (UI.isEn ? " (now)" : " (teraz)"));
  const sigs = h?.signals || [];
  const threats = snap?.threats || [];
  const planes = [...(snap?.aircraft || [])];
  // ADS-B jest odpytywane częściej niż powstają migawki. Zdarzenie wejścia lub
  // wyjścia z ostatnią pozycją wypełnia dwuminutową lukę jako półprzezroczysty
  // ślad. Nie jest sygnałem i nie wnosi punktów.
  const historyAdsbEvents = mergedWatchEvents(standalone ? [] : srvAdsbEvents, watchEvents, when.getTime());
  planes.push(...historicalAdsbGhosts(historyAdsbEvents, planes, when.getTime()));
  historyAdsbTime = when.getTime();
  historyAdsbByHex.clear();
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    planes[i] = {...p, foreign:isForeign(p), heli:isHeli(p.cat,p.type,p.desc),
      area:watchArea(p.lat,p.lon), observedAt:p.observedAt ?? historyAdsbTime};
    if (p.hex) historyAdsbByHex.set(p.hex, planes[i]);
  }
  hideCard();
  updateWatchBadge(planes.filter(p => p.foreign).length);
  if (document.getElementById("watch")?.open) fillWatch();
  // Obiekt może pojawić się i zniknąć między migawkami (co 2 min), mimo że jego
  // sygnał pozostaje w oknie 60 min. Pokazujemy wtedy zapisaną pozycję jako
  // półprzezroczysty ślad historyczny, a nie obiekt obecny w migawce.
  const snapTrackIds = new Set(threats.map(t => t.id).filter(Boolean));
  const ghostByTrack = new Map();
  for (const s of sigs) {
    const d = s.details || {}, id = d.track_id;
    if (s.source !== "neptun" || !id || snapTrackIds.has(id)
        || d.lat == null || d.lon == null) continue;
    const prev = ghostByTrack.get(id);
    if (!prev || Date.parse(s.ts) > Date.parse(prev.ts)) ghostByTrack.set(id, s);
  }
  const historyThreats = threats.concat([...ghostByTrack.values()].map(s => {
    const d = s.details || {};
    return { id: d.track_id, type: d.type || "unknown", lat: d.lat, lon: d.lon,
      heading: d.heading, confidenceLevel: d.confidence,
      uncertaintyKm: d.uncertainty_km, sourceCount: d.source_count,
      region: d.region, positionQuality: d.position_quality
        ?? d.source_metadata?.source_fields?.positionQuality, historicalOnly: true,
      areaOnly: d.area_only, straznik_position: d.position_approximate
        ? { quality:"approx", reason:d.position_reason, locality:d.position_locality } : null,
      pl_assessment: { dist_km: d.dist_km } };
  }));
  // punktacja z tamtej chwili — używa jej i mapa, i panel. Bierzemy gotowy wynik
  // z limitem klasy źródła (h.scores z backendu/silnika); fallback sumuje
  // counted_points, też limitowane — NIGDY surowe points (inaczej np. 4 rutynowe
  // strefy PAŻP dawały fałszywe 4.0 „WYSOKI PRIORYTET”).
  let perVoiv = h?.scores;
  if (!perVoiv) {
    perVoiv = {};
    for (const s of sigs)
      if (s.voivodeship) perVoiv[s.voivodeship] =
        (perVoiv[s.voivodeship] || 0) + (s.counted_points ?? s.points ?? 0);
  }
  // poziom w wybranym momencie — kolor kciuka suwaka i podsumowanie
  const tp = timelinePoints[idx];
  const slider = document.getElementById("tb-slider");
  slider.dataset.level = tp?.level || "none";
  // liczba sygnałów jest klikalna: bez tego widać „12 sygnałów w oknie”, ale nie
  // sposób sprawdzić, jakie to były — a to najciekawsza część historii
  document.getElementById("tb-info").innerHTML =
    (tp && tp.score > 0
      ? `<b style="color:${tp.level === "high" ? "var(--red)"
          : tp.level === "elevated" ? "var(--amber)" : "var(--muted)"}">`
        + `${tp.score} ${UI.isEn ? "pts" : "pkt"}${tp.voiv ? ` · ${UI.isEn ? "province" : "woj."} ` + esc(UI.voiv(tp.voiv)) : ""}</b> · `
      : "")
    + `${threats.length} ${UI.isEn ? "objects" : "obiektów"} · ${planes.filter(p => !p.historicalOnly).length} ${UI.isEn ? "aircraft in snapshot" : "maszyn w migawce"}`
    + (planes.some(p => p.historicalOnly) ? ` + ${planes.filter(p => p.historicalOnly).length} ${UI.isEn ? "last observations" : "ostatnich obserwacji"}` : "") + " · "
    + (sigs.length
      ? `<button id="tb-sigs" class="linklike">${sigs.length} ${UI.isEn ? "signals in the window" : "sygnałów w oknie"} ↗</button>`
      : (UI.isEn ? "no signals in the window" : "brak sygnałów w oknie"));
  document.getElementById("tb-sigs")?.addEventListener("click", () => setPanel(true));

  if (mapReady) {   // dane lokalne (bufor w RAM) → mapę odświeżamy też podczas
                    // przewijania; scrubTo dławi do jednej klatki (rAF), więc płynnie
    // Never leave a live followed-aircraft track over historical positions.
    map.getSource("adsb-trail")?.setData(emptyFC());
    // migawka nie zawiera śladów — rysujemy pozycje historyczne bez animacji
    map.getSource("threats")?.setData({ type: "FeatureCollection",
      features: historyThreats.filter(t => t.lat != null).map(t => ({ type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { tid: String(t.id ?? ""),
          type: TYPE_META[t.type] ? t.type : "unknown", heading: t.heading ?? 0,
          color: (TYPE_META[t.type] || {}).color || "#8a93a6",
          confidence: t.confidenceLevel || "?", uncertainty: t.uncertaintyKm ?? "?",
          opis: t.historicalOnly
            ? `${threatLabelPL(t.type)} — ostatnia pozycja z sygnału; obiekt nie występował już w tej migawce`
            : threatDesc(t),
          historicalOnly: !!t.historicalOnly, dist_km: t.pl_assessment?.dist_km,
          distance_text: threatDistanceText(t, t.pl_assessment?.dist_km),
          eta: etaHtml(t) } })) });
    map.getSource("trails")?.setData(emptyFC());
    map.getSource("uncertainty")?.setData(emptyFC());
    map.getSource("adsb")?.setData({ type: "FeatureCollection",
      features: planes.map(p => ({ type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { track: p.track ?? 0, callsign: p.callsign, hex: p.hex,
          actype: p.type, desc: p.desc, alt: p.alt, gs: p.gs, reg: p.reg,
          heli: isHeli(p.cat, p.type, p.desc), foreign: !!p.foreign,
          historicalOnly: !!p.historicalOnly } })) });
    // kolorowanie województw wg sygnałów z tamtego momentu
    for (const v of ALL_VOIVS) {
      const sc = perVoiv[v] || 0;
      map.setFeatureState({ source: "voiv", id: v },
        { score: Math.min(sc, 8), level: sc >= 4 ? "high" : sc >= 2 ? "elevated" : "none" });
    }
  }

  renderHistoryPanel(sigs, perVoiv, when, ageMin);
  renderObservationLists({neptun:{threats}, adsb:{aircraft:planes}});
}

/* Panel w trybie historii: karty województw i lista sygnałów z WYBRANEGO
   momentu, a nie z teraz. Bez tego karty pokazywałyby bieżącą punktację obok
   historycznej listy sygnałów — dwie różne chwile w jednym widoku. */
function renderHistoryPanel(sigs, perVoiv, when, ageMin) {
  const banner = `<div class="hist-banner">${UI.isEn ? "HISTORY VIEW" : "PODGLĄD HISTORII"} —
    ${when.toLocaleTimeString(UI.isEn ? "en-GB" : "pl-PL", { hour: "2-digit", minute: "2-digit" })}
    ${ageMin > 1 ? `(−${ageMin} min)` : (UI.isEn ? "(now)" : "(teraz)")}
    <span>${UI.isEn ? "data from the time selected on the slider, not live" : "dane sprzed chwili wybranej suwakiem, nie na żywo"}</span></div>`;

  const shown = Object.entries(perVoiv)
    .filter(([, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1]);
  const cards = shown.map(([name, sc]) => {
    const lvl = sc >= 4 ? "high" : sc >= 2 ? "elevated" : "none";
    const own = sigs.filter(s => s.voivodeship === name);
    return `<div class="voiv-card level-${lvl} open">
      <div class="voiv-head"><span class="voiv-name">${esc(UI.voiv(name))}</span>
        <span class="voiv-score">${(Math.round(sc * 10) / 10).toFixed(1)} ${UI.isEn ? "pts" : "pkt"}</span></div>
      <div class="voiv-level">${lvl === "none" ? (UI.isEn ? "below threshold" : "poniżej progu") : LEVEL_LABEL[lvl]}</div>
      <div class="voiv-breakdown">${sigList(own)}</div></div>`;
  }).join("");

  document.getElementById("voiv-cards").innerHTML = banner +
    (cards || `<div class="fineprint">${UI.isEn ? "No province had points at this time." : "W tej chwili żadne województwo nie miało punktów."}</div>`);
  document.getElementById("signal-list").innerHTML =
    sigList(sigs) || `<div class="fineprint">${UI.isEn ? "no signals in this window" : "brak sygnałów w tym oknie"}</div>`;
}

document.getElementById("btn-history").onclick = () => toggleHistory();
document.getElementById("tb-live").onclick = () => exitHistory();
/* Etykieta czasu z PAMIĘCI (histTimes/timelinePoints, bez fetch/mapy) — dzięki
   temu sam suwak przesuwa się płynnie niezależnie od sieci i renderu. */
function quickLabel(idx) {
  const ts = histTimes[idx];
  if (!ts) return;
  const when = new Date(ts);
  const ageMin = Math.round((Date.now() - when.getTime()) / 60000);
  document.getElementById("tb-label").textContent =
    when.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    + (ageMin > 1 ? ` (−${ageMin} min)` : " (teraz)");
  document.getElementById("tb-slider").dataset.level = timelinePoints[idx]?.level || "none";
}

/* Przewijanie suwaka: dane są LOKALNE (bufor w RAM), więc render jest szybki i
   mapa może podążać na żywo. Żeby nie robić więcej niż jednej klatki na odświeżenie
   ekranu, dławimy przez requestAnimationFrame — etykieta rusza od razu (quickLabel),
   a mapa/panel dogania najświeższą pozycję raz na klatkę. Bez sieci per pozycja. */
let _scrubRaf = 0, _scrubIdx = -1;
function scrubTo(idx) {
  quickLabel(idx);
  _scrubIdx = idx;
  if (_scrubRaf) return;
  _scrubRaf = requestAnimationFrame(() => { _scrubRaf = 0; showHistoryAt(_scrubIdx); });
}
document.getElementById("tb-slider").addEventListener("input", (e) => scrubTo(+e.target.value));
document.getElementById("tb-slider").addEventListener("change", (e) => {
  if (_scrubRaf) { cancelAnimationFrame(_scrubRaf); _scrubRaf = 0; }
  showHistoryAt(+e.target.value);
});

/* ── UI: ustawienia (moja lokalizacja), 3D, panel ────────────────────────── */
const dlg = document.getElementById("settings");
function syncObservedRegions() {
  const regions=Places?.observedVoivodeships(savedPlaces)||[];
  if(!IS_APP) syncBrowserPushRegion().catch(()=>{});
  const plugin=BG();
  if(plugin?.setObservedVoivodeships) return plugin.setObservedVoivodeships({voivodeships:regions});
  return plugin?.setHomeVoivodeship?.({voivodeship:myVoiv()||""});
}
function renderPlacesSummary() {
  const el=document.getElementById("places-summary"); if(!el)return;
  if(!savedPlaces.length){el.textContent=UI.isEn?"No saved places yet.":"Nie zapisano jeszcze żadnego miejsca.";return;}
  const watched=Places.observedVoivodeships(savedPlaces).map(v=>UI.voiv(v));
  el.textContent=(UI.isEn?`${savedPlaces.length}/8 places. Watched provinces: `:`${savedPlaces.length}/8 miejsc. Obserwowane województwa: `)+(watched.join(", ")||(UI.isEn?"none":"brak"));
}
function openSettings() {
  UI.previewSettings?.(UI.lang || "pl");
  refreshBgStatus();
  const sel = document.getElementById("set-voiv");
  sel.innerHTML = `<option value="">— ${UI.isEn ? "not selected" : "nie wybrano"} —</option>` +
    ALL_VOIVS.map(v => `<option value="${esc(v)}"${v === myVoiv() ? " selected" : ""}>${esc(UI.voiv(v))}</option>`).join("");
  const langSel = document.getElementById("set-lang"); if (langSel) langSel.value = UI.lang || "pl";
  document.getElementById("set-api").value = localStorage.getItem("straznik_api") || "";
  renderPlacesSummary();
  dlg.showModal();
}
document.getElementById("btn-settings").onclick = () => openSettings();

/* Zakładki w Ustawieniach: jedna długa lista zamieniona na cztery sekcje.
   Zmiana zakładki przewija okno na górę, żeby nowa sekcja zaczynała się od
   początku, a nie w połowie poprzedniej. */
document.querySelectorAll("#settings .set-tab").forEach(tab =>
  tab.addEventListener("click", () => {
    const pane = tab.dataset.pane;
    document.querySelectorAll("#settings .set-tab").forEach(t => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll("#settings .set-pane").forEach(p =>
      p.hidden = p.dataset.pane !== pane);
    document.getElementById("settings").scrollTop = 0;
  }));
document.getElementById("set-lang")?.addEventListener("change", (event) => {
  UI.previewSettings?.(event.target.value);
  refreshBgStatus(event.target.value);
});
document.getElementById("set-save").onclick = (event) => {
  const api = document.getElementById("set-api").value.trim();
  if (api && !validBackendUrl(api)) {
    event.preventDefault();
    alert("Własny serwer wymaga adresu HTTPS bez loginu, hasła, parametrów ani fragmentu. Wpisz bezpieczny adres lub wyczyść pole, aby wybrać serwer Strażnika.");
    return;
  }
  const v = myVoiv() || "";
  const nextLang = document.getElementById("set-lang")?.value || "pl";
  syncObservedRegions();
  const apiChanged = api !== (localStorage.getItem("straznik_api") || "");
  if (api) localStorage.setItem("straznik_api", api); else localStorage.removeItem("straznik_api");
  const langChanged = nextLang !== (UI.lang || "pl");
  if (langChanged) { localStorage.setItem("straznik_lang", nextLang); setTimeout(() => location.reload(), 100); return; }
  if (apiChanged) { setTimeout(() => location.reload(), 100); return; }
  if (mapReady) {
    for (const id of ["my-voiv", "my-voiv-glow"])
      if (map.getLayer(id)) map.setFilter(id, ["==", ["get", "nazwa"], v || "—"]);
    goHome();
  }
  if (state) renderPanel();
};

/* ── Moje miejsca: zapis lokalny, bez geokodowania i ruchu w tle ── */
const placesDlg=document.getElementById("places-dialog");
let placeDraft=null, placeSnapshot="";
const placeEl=id=>document.getElementById(id);
const placeText=(pl,en)=>UI.isEn?en:pl;
function draftFromForm(){return Places.clean({id:placeEl("place-id").value,name:placeEl("place-name").value,precision:placeEl("place-precision").value,region:placeEl("place-region").value,gps:placeDraft?.gps||null,alerts:placeEl("place-alerts").checked});}
function placeDirty(){return placeSnapshot&&JSON.stringify(draftFromForm())!==placeSnapshot;}
function fillPlace(place){
  placeDraft=Places.clean(place); placeSnapshot=JSON.stringify(placeDraft);
  placeEl("place-id").value=placeDraft.id; placeEl("place-name").value=placeDraft.name; placeEl("place-precision").value=placeDraft.precision; placeEl("place-region").value=placeDraft.region; placeEl("place-alerts").checked=placeDraft.alerts; placeEl("place-feedback").textContent="";
  placeEl("place-delete").hidden=!savedPlaces.some(p=>p.id===placeDraft.id);
  renderPlacePrecision(); renderPlaceTabs();
}
function renderPlaceTabs(){
  placeEl("places-tabs").innerHTML=savedPlaces.map(p=>`<button type="button" class="chip${p.id===placeDraft?.id?' active':''}" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join("");
  placeEl("places-tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{if(placeDirty()&&!confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?")))return;fillPlace(savedPlaces.find(p=>p.id===b.dataset.id));});
}
function renderPlacePrecision(){
  const precision=placeEl("place-precision").value;
  placeEl("place-gps-row").hidden=precision!=='gps';
  const gps=placeDraft?.gps; placeEl("place-gps-status").textContent=gps?`${placeText("Zapisano jednorazowo","Saved once")}: ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} · ±${Math.round(gps.accuracy)} m · ${new Date(gps.capturedAt).toLocaleString(UI.isEn?"en-GB":"pl-PL")}`:placeText("Lokalizacja jest wyłączona.","Location is off."); placeEl("place-gps-remove").hidden=!gps;
}
function openPlaces(){
  savedPlaces=Places.migrate(localStorage); placeEl("place-region").innerHTML=ALL_VOIVS.map(v=>`<option value="${esc(v)}">${esc(UI.voiv(v))}</option>`).join("");
  fillPlace(savedPlaces[0]||{id:crypto.randomUUID?.()||String(Date.now()),name:"",precision:"region",region:myVoiv()||"lubelskie",alerts:true}); placesDlg.showModal();
}
placeEl("btn-places").onclick=()=>{dlg.close();openPlaces();};
/* „Moje miejsca" otwierają się Z Ustawień, więc po zamknięciu wracamy dokładnie tam,
   skąd użytkownik przyszedł — inaczej ląduje na mapie i musi klikać ⚙ od nowa. */
function backToPlacesTab(){
  openSettings();
  document.querySelector('#settings .set-tab[data-pane="miejsca"]')?.click();
}
placeEl("places-close").onclick=()=>{if(!placeDirty()||confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?"))){placesDlg.close();backToPlacesTab();}};
placeEl("place-add").onclick=()=>{if(savedPlaces.length>=8)return alert(placeText("Możesz zapisać maksymalnie 8 miejsc.","You can save up to 8 places."));if(placeDirty()&&!confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?")))return;fillPlace({id:crypto.randomUUID?.()||String(Date.now()),name:"",precision:"region",region:myVoiv()||"lubelskie",alerts:false});};
placeEl("place-precision").onchange=()=>{placeDraft={...placeDraft,precision:placeEl("place-precision").value,gps:placeEl("place-precision").value==='gps'?placeDraft?.gps:null};renderPlacePrecision();};
placeEl("place-gps").onclick=()=>{
  if(!navigator.geolocation)return alert(placeText("Brak dostępu do lokalizacji w tym środowisku.","Location is unavailable in this environment."));
  placeEl("place-gps-status").textContent=placeText("Oczekiwanie na zgodę i jednorazowy odczyt…","Waiting for permission and a one-time reading…");
  navigator.geolocation.getCurrentPosition(pos=>{const region=voivAt(pos.coords.longitude,pos.coords.latitude);if(!region)return alert(placeText("Pozycja jest poza granicami Polski.","The position is outside Poland."));placeDraft={...placeDraft,region,gps:{lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,capturedAt:new Date().toISOString()}};placeEl("place-region").value=region;renderPlacePrecision();},err=>{placeEl("place-gps-status").textContent=placeText("Nie udało się pobrać pozycji: ","Could not read the position: ")+err.message;},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
};
placeEl("place-gps-remove").onclick=()=>{placeDraft={...placeDraft,gps:null};renderPlacePrecision();};
placeEl("place-cancel").onclick=()=>{const saved=savedPlaces.find(p=>p.id===placeDraft?.id);if(saved)fillPlace(saved);else placesDlg.close();};
placeEl("place-delete").onclick=()=>{const found=savedPlaces.some(p=>p.id===placeDraft?.id);if(!found)return placesDlg.close();if(!confirm(placeText("Usunąć to miejsce z urządzenia?","Delete this place from the device?")))return;savedPlaces=Places.save(localStorage,savedPlaces.filter(p=>p.id!==placeDraft.id));syncObservedRegions();if(savedPlaces.length)fillPlace(savedPlaces[0]);else placesDlg.close();renderPlacesSummary();};
/* Kliknięcie „Zapisz na urządzeniu" przy pustej nazwie wyglądało jak martwy przycisk:
   komunikat trafiał do #place-feedback pod przewiniętą treścią, więc nikt go nie widział.
   Teraz przewijamy go na ekran i ustawiamy kursor w brakującym polu. */
function placeFail(msg, fieldId) {
  const fb = placeEl("place-feedback");
  fb.textContent = msg;
  const field = document.getElementById(fieldId);
  try { (field || fb).scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
  try { field?.focus({ preventScroll: true }); } catch { field?.focus(); }
}
placeEl("places-form").onsubmit=event=>{event.preventDefault();const clean=draftFromForm();if(!clean.name||!clean.region||(clean.precision==='gps'&&!clean.gps)){placeFail(placeText("Uzupełnij nazwę i wybraną lokalizację.","Enter a name and the selected location."),!clean.name?"place-name":(!clean.region?"place-region":"place-gps"));return;}const idx=savedPlaces.findIndex(p=>p.id===clean.id);if(idx<0&&savedPlaces.length>=8){placeFail(placeText("Masz już 8 miejsc — usuń jedno, żeby dodać nowe.","You already have 8 places — delete one to add another."),"place-add");return;}savedPlaces=Places.save(localStorage,idx<0?[...savedPlaces,clean]:savedPlaces.map(p=>p.id===clean.id?clean:p));syncObservedRegions();fillPlace(clean);placeEl("place-feedback").textContent=placeText("Zapisano tylko na tym urządzeniu.","Saved on this device only.");renderPlacesSummary();/* Zapis kończy pracę w tym oknie — zostawianie go otwartego wyglądało, jakby nic się nie stało. Potwierdzenie idzie toastem nad mapą. */placesDlg.close();toast(placeText("Zapisano tylko na tym urządzeniu.","Saved on this device only."));backToPlacesTab();if(mapReady){for(const id of ["my-voiv","my-voiv-glow"])if(map.getLayer(id))map.setFilter(id,["==",["get","nazwa"],myVoiv()||"—"]);}};

/* ── widoczny stan nasłuchu w tle ────────────────────────────────────────── */
/* Nasłuch jest domyślnie wyłączony, a bez niego alarmy docierają wyłącznie przy
   otwartej aplikacji. Ukrycie tej informacji w ustawieniach sprawiało, że
   użytkownik był przekonany, że aplikacja pilnuje go w tle, choć nie pilnowała.
   Pasek pojawia się tylko wtedy, gdy jest realny problem. */
/* Ile razy z rzędu widzieliśmy problem. Świeża instalacja i powrót do aplikacji
   mają stan przejściowy: usługa dopiero się uruchamia (enabled=true, ale jeszcze
   nie ożyła), a zgoda na powiadomienia jest w trakcie przyznawania. Pokazanie
   ostrzeżenia od razu dawało fałszywy alarm „nasłuch wyłączony — napraw", który
   znikał po chwili, mimo że przełącznik był włączony. */
let bgWarnStrikes = 0;
async function refreshBgWarning() {
  const el = document.getElementById("bg-warning");
  if (!el) return;
  const plugin = BG();
  if (!plugin) { el.classList.add("hidden"); return; }
  /* Nie strasz w oknie pierwszego uruchomienia (onboarding jeszcze nie
     zaproponował nasłuchu) ani gdy użytkownik jest właśnie w ustawieniach —
     wtedy sam nad tym panuje, a usługa może być w trakcie startu. */
  if (!localStorage.getItem("straznik_bg_offered")
      || document.querySelector("dialog[open]")) return;
  try {
    const s = await plugin.status();
    // Alarmy dostarcza push (FCM). Ostrzegamy tylko o rzeczach, które go blokują:
    // brak zgody na powiadomienia, a dla czerwonego — brak zgody na pełny ekran
    // (Android potrafi ją cofnąć po aktualizacji).
    let msg = null, fix = "settings";
    if (!s.notificationsAllowed) {
      msg = UI.isEn ? "Notifications are blocked — alerts cannot arrive. Enable them in settings"
        : "Powiadomienia zablokowane — alarm nie dotrze. Włącz je w ustawieniach";
    } else if (s.fullScreenAllowed === false) {
      msg = UI.isEn ? "Full-screen alert permission expired — a red alert will not wake the locked screen"
        : "Zgoda na alarm pełnoekranowy wygasła — czerwony alarm nie zapali ekranu z blokady";
      fix = "fullscreen";
    }
    if (!msg) { bgWarnStrikes = 0; el.classList.add("hidden"); return; }
    // problem musi utrzymać się przez dwa sprawdzenia z rzędu — mniej fałszywych alarmów
    if (++bgWarnStrikes < 2) { setTimeout(refreshBgWarning, 5000); return; }
    el.innerHTML = `<span>⚠ ${esc(msg)}</span><button class="chip">${UI.isEn ? "Fix" : "Napraw"}</button>`;
    el.querySelector("button").onclick = fix === "fullscreen"
      ? () => { BG()?.requestFullScreenPermission(); setTimeout(refreshBgWarning, 1500); }
      : () => openSettings();
    el.classList.remove("hidden");
  } catch { el.classList.add("hidden"); }
}

/* ── sprawdzanie aktualizacji ────────────────────────────────────────────── */
/* Aplikacja jest rozprowadzana poza sklepem, więc sama musi powiedzieć, że
   wyszła nowsza wersja — inaczej użytkownik zostaje z wersją sprzed miesięcy,
   nieświadomy poprawek w czymś, co ma go ostrzegać.

   UWAGA: gdyby aplikacja kiedyś trafiła do Google Play, to sprawdzanie trzeba
   wyłączyć (UPDATE_CHECK = false) — regulamin sklepu zabrania aktualizowania
   się z pominięciem Play. */
const UPDATE_CHECK = true;
const UPDATE_API = DEFAULT_BACKEND + "/api/app-version";
/* Sprawdzamy przy każdym uruchomieniu aplikacji i przy powrocie z tła, a nie
   raz na dobę: wydania wychodzą nieregularnie, a poprawka w narzędziu
   ostrzegawczym ma dotrzeć tego samego dnia. Odstęp poniżej ogranicza wyłącznie
   powroty z tła, żeby przełączanie okien nie odpytywało serwera bez końca. */
const UPDATE_EVERY_MS = 30 * 60 * 1000;
// „Później” obowiązuje tylko do zamknięcia aplikacji/karty. Nie zapisujemy tego
// w localStorage, więc następna sesja ponownie pokaże nadal aktualną wersję.
const sessionSkippedUpdates = new Set();

/** Porównanie wersji typu „1.3.0” — zwraca true, gdy `remote` jest nowsza. */
function isNewer(remote, local) {
  const norm = (v) => String(v || "").replace(/^v/, "").split(".").map(n => parseInt(n) || 0);
  const r = norm(remote), l = norm(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0, b = l[i] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** `force` — sprawdzenie na żądanie z ustawień: pomija wcześniejsze
 *  „nie przypominaj” i melduje wynik również wtedy, gdy nowszej wersji nie ma.
 *  `throttled` — wywołanie z powrotu z tła: respektuje UPDATE_EVERY_MS.
 *  Start aplikacji sprawdza zawsze, bez odstępu. */
/* Komunikat trafia do okna ustawień, a nie do toasta: modalny <dialog> tworzy
   własną warstwę, nad którą zwykłe elementy się nie renderują — toast byłby
   pod spodem i użytkownik nie zobaczyłby żadnej odpowiedzi na kliknięcie. */
function updStatus(msg) {
  const el = document.getElementById("upd-status");
  if (el) el.textContent = msg;
  else toast(msg);
}

async function checkForUpdate(force = false, throttled = false) {
  if (!UPDATE_CHECK || !IS_APP) return;
  try {
    const last = +(localStorage.getItem("straznik_upd_check") || 0);
    if (throttled && !force && Date.now() - last < UPDATE_EVERY_MS) return;
    if (force) updStatus("Sprawdzam…");
    const s = await BG()?.status();
    const local = s?.appVersion;
    if (!local) { if (force) updStatus("Nie udało się odczytać wersji aplikacji."); return; }
    const r = await fetch(UPDATE_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) { if (force) updStatus("Nie udało się sprawdzić — spróbuj później."); return; }
    const rel = await r.json();
    localStorage.setItem("straznik_upd_check", String(Date.now()));
    if (!isNewer(rel.version, local)) {
      if (force) updStatus(`Masz najnowszą wersję (${local}).`);
      return;
    }
    if (!force && !rel.critical && sessionSkippedUpdates.has(rel.version)) return;
    showUpdateBanner(rel, local);
    if (force) {
      updStatus(`Jest nowsza wersja ${rel.version} — zamknij ustawienia, żeby zaktualizować.`);
    }
  } catch {
    if (force) updStatus("Brak połączenia — spróbuj później.");
  }
}

function showUpdateBanner(rel, local) {
  const ver = String(rel.version || "").replace(/^v/, "");
  const el = document.getElementById("update-banner");
  const size = rel.size ? ` · ${(rel.size / 1048576).toFixed(1)} MB` : "";
  const fallbackChanges = String(rel.notes || "").split(/\r?\n/)
    .map(x => x.replace(/^\s*(?:[-*+]|•|\d+[.)])\s*/, "").replace(/[*_`~]/g, "").trim())
    .filter(x => x && !x.startsWith("#") && !x.startsWith("<!--")).slice(0, 3);
  const changes = (Array.isArray(rel.changes) ? rel.changes : fallbackChanges)
    .map(x => String(x || "").trim()).filter(Boolean).slice(0, 3);
  const changesHtml = changes.length
    ? `<div class="upd-changes"><b>Co się zmienia:</b><ul>${changes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`
    : `<div class="upd-changes"><b>Co się zmienia:</b> poprawki działania i aktualizacja danych aplikacji.</div>`;
  el.classList.toggle("critical", !!rel.critical);
  // Przyciski i status w osobnych rzędach — w jednym wierszu z tekstem ściskały go
  // przy dłuższej liście zmian, a status znikał poza przewijanym obszarem.
  el.innerHTML = `<div class="upd-txt"><b>${rel.critical ? "Wymagana" : "Dostępna"} wersja ${esc(ver)}</b>
      <span>masz ${esc(local)}${esc(size)} · instalację potwierdzi Android</span>
      ${changesHtml}</div>
    <span id="upd-progress"></span>
    <div class="upd-actions">
      <button class="chip primary" id="upd-install">Aktualizuj</button>
      ${rel.critical ? "" : '<button class="chip" id="upd-later">Później</button>'}
    </div>`;
  el.classList.remove("hidden");
  document.getElementById("upd-later")?.addEventListener("click", () => {
    sessionSkippedUpdates.add(ver);
    el.classList.add("hidden");
  });
  document.getElementById("upd-install").onclick = async (event) => {
    const btn = event.currentTarget;
    const progress = document.getElementById("upd-progress");
    const plugin = BG();
    if (!plugin?.installUpdate) {
      progress.textContent = "Aktualizator wymaga nowszej wersji aplikacji.";
      return;
    }
    try {
      const perm = await plugin.canInstallUpdates();
      if (!perm?.allowed) {
        await plugin.requestInstallPermission();
        progress.textContent = "Włącz zgodę „Zezwalaj z tego źródła”, wróć i dotknij Aktualizuj ponownie.";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Pobieram…";
      progress.textContent = "Sprawdzam podpis i sumę SHA-256…";
      await plugin.installUpdate({url: rel.url, sha256: rel.sha256});
      progress.textContent = "Potwierdź instalację w oknie Androida.";
      btn.textContent = "Instalator otwarty";
    } catch (error) {
      btn.disabled = false;
      btn.textContent = "Spróbuj ponownie";
      progress.textContent = "Aktualizacja nie powiodła się: " + String(error?.message || error);
    }
  };
}

/* ── nasłuch w tle (natywna usługa Androida) ─────────────────────────────── */
const BG = () => window.Capacitor?.Plugins?.StraznikBackground || null;

async function refreshBgStatus(previewLang = UI.lang) {
  const isEn = previewLang === "en";
  const plugin = BG();
  const info = document.getElementById("bg-status");
  if (!plugin) {
    document.getElementById("btn-battery").style.display = "none";
    document.getElementById("btn-notif-settings").style.display = "none";
    if (info) info.textContent = isEn
      ? "Push notifications are available in the Android app (in a browser, alerts are visible only while the tab is open)."
      : "Powiadomienia push działają w aplikacji na Androida (w przeglądarce alarm widać tylko przy otwartej karcie).";
    return;
  }
  try {
    const s = await plugin.status();
    const warn = [];
    if (!s.notificationsAllowed)
      warn.push(isEn ? "⚠ Notifications are blocked in system settings — alerts cannot arrive."
        : "⚠ Powiadomienia są zablokowane w ustawieniach systemu — bez nich alarm nie dotrze.");
    if (s.fullScreenAllowed === false)
      warn.push(isEn ? "⚠ Full-screen alert permission is missing — a red alert will not wake the screen. Enable it below."
        : "⚠ Brak zgody na alarm pełnoekranowy — czerwony alarm nie zapali wygaszonego ekranu. Włącz przyciskiem 🚨 poniżej.");
    const verEl = document.getElementById("app-version");
    if (verEl) verEl.textContent = s.appVersion
      ? `${isEn ? "Installed version" : "Zainstalowana wersja"} ${s.appVersion}` : "";
    const updBtn = document.getElementById("btn-update");
    if (updBtn) updBtn.style.display = UPDATE_CHECK ? "" : "none";
    /* canUseFullScreenIntent() bywa optymistyczne (zwraca „dozwolone", choć system
       i tak odrzuca alarm), a po aktualizacji zgoda potrafi się cofnąć — dlatego na
       Androidzie 14+ przycisk pokazujemy ZAWSZE, żeby dało się ją sprawdzić i włączyć. */
    const fsBtn = document.getElementById("btn-fullscreen");
    if (fsBtn) {
      const mayBeBlocked = (s.sdk || 0) >= 34;
      fsBtn.style.display = mayBeBlocked ? "" : "none";
      fsBtn.textContent = s.fullScreenAllowed === false
        ? (isEn ? "🚨 Allow full-screen alerts" : "🚨 Zezwól na alarm pełnoekranowy")
        : (isEn ? "🚨 Check full-screen alert permission" : "🚨 Sprawdź zgodę na alarm pełnoekranowy");
    }
    if (info) info.innerHTML = (warn.join("<br>")
      || (isEn ? "Notifications ready. Alerts for your region will arrive even while the app is closed."
        : "Powiadomienia gotowe. Alarmy dla Twojego regionu dotrą także przy zamkniętej aplikacji."))
      + `<br><span class="muted">Android ${s.sdk}, ${esc(s.manufacturer || "")}`
      + `${s.homeVoivodeship ? " · region: " + esc(UI.voiv(s.homeVoivodeship)) : ""}</span>`;
  } catch (e) { if (info) info.textContent = (isEn ? "Could not read status: " : "Nie udało się odczytać stanu: ") + e; }
}

/* Przygotowanie alarmów push: zgoda na powiadomienia i subskrypcja tematu regionu
   (setHomeVoivodeship natywnie subskrybuje voiv_<region> w FCM). Usługi w tle już
   nie ma — alarmy przy zamkniętej aplikacji dostarcza push z serwera. */
async function ensureAlarmPermissions() {
  const plugin = BG(); if (!plugin) return false;
  if (window.Capacitor?.Plugins?.LocalNotifications)
    await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
  try { await syncObservedRegions(); } catch {}
  return true;
}

/* Rozdzielony onboarding: najpierw „o aplikacji", potem region, na końcu — tylko
   w aplikacji — propozycja nasłuchu w tle. Bez tego kroku świeża instalacja
   miała nasłuch wyłączony i alarmy dochodziły dopiero po otwarciu aplikacji. */
function dialogClosed(dlg) {
  return new Promise(res => {
    if (!dlg || !dlg.open) return res();
    dlg.addEventListener("close", () => res(), { once: true });
  });
}

async function maybeOfferBackground() {
  const plugin = BG();
  if (!plugin || localStorage.getItem("straznik_bg_offered")) return;
  localStorage.setItem("straznik_bg_offered", "1");
  document.getElementById("onboard-bg")?.showModal();
}

async function runOnboarding() {
  aboutDlg.showModal();
  await dialogClosed(aboutDlg);
  if (!myVoiv()) { openSettings(); await dialogClosed(document.getElementById("settings")); }
  await maybeOfferBackground();
}

document.getElementById("onboard-bg-enable")?.addEventListener("click", async () => {
  document.getElementById("onboard-bg").close();
  try { await ensureAlarmPermissions(); toast("🔔 <b>Powiadomienia włączone.</b><br>Alarmy dla Twojego regionu dotrą także przy zamkniętej aplikacji."); }
  catch (e) { toast("Nie udało się włączyć powiadomień: " + e); }
  refreshBgStatus(); refreshBgWarning();
});
document.getElementById("onboard-bg-skip")?.addEventListener("click", () =>
  document.getElementById("onboard-bg").close());
document.getElementById("btn-battery")?.addEventListener("click", async () => {
  await BG()?.requestBatteryExemption(); setTimeout(refreshBgStatus, 800);
});
document.getElementById("btn-notif-settings")?.addEventListener("click", () =>
  BG()?.openNotificationSettings());
document.getElementById("btn-fullscreen")?.addEventListener("click", async () => {
  await BG()?.requestFullScreenPermission(); setTimeout(refreshBgStatus, 800);
});
document.getElementById("btn-update")?.addEventListener("click", async (e) => {
  e.target.disabled = true;
  await checkForUpdate(true);
  e.target.disabled = false;
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
  // ikona w pasku bez podpisu: stan niesie podświetlenie i tytuł
  const b3 = document.getElementById("btn-3d");
  b3.classList.toggle("active", is3d);
  b3.title = is3d ? (UI.isEn ? "Switch to 2D view" : "Przełącz na widok 2D")
                  : (UI.isEn ? "Switch to 3D view" : "Przełącz na widok 3D");
};

/* Dolne zakładki: „Mapa" jest stanem spoczynku — zamyka panel, historię i menu. */
function syncTabs() {
  const panelOpen = !document.getElementById("panel").classList.contains("collapsed");
  const histOn = document.body.classList.contains("history-mode");
  const mapTab = document.getElementById("tab-map");
  if (mapTab) {
    mapTab.classList.toggle("active", !panelOpen && !histOn);
    mapTab.setAttribute("aria-pressed", String(!panelOpen && !histOn));
  }
  document.getElementById("btn-panel")?.setAttribute("aria-pressed", String(panelOpen));
  document.getElementById("btn-history")?.setAttribute("aria-pressed", String(histOn));
}

function setPanel(open) {
  const p = document.getElementById("panel");
  p.classList.toggle("collapsed", !open);
  document.getElementById("btn-panel").classList.toggle("active", open);
  document.body.classList.toggle("panel-open", open);
  syncTabs();
}
document.getElementById("btn-panel").onclick = () =>
  setPanel(document.getElementById("panel").classList.contains("collapsed"));
document.getElementById("btn-legend").onclick = () => {
  document.getElementById("legend").classList.toggle("hidden");
  document.getElementById("btn-legend").classList.toggle("active");
};

/* Panel i przyciski mapy muszą wiedzieć, ile miejsca zajmuje dolny stos —
   inaczej pasek zastrzeżenia zasłaniał nagłówek listy sygnałów. */
const stackEl = document.getElementById("bottom-stack");
if (stackEl && window.ResizeObserver) {
  const setStackH = () => document.documentElement.style
    .setProperty("--stack-h", stackEl.offsetHeight + "px");
  new ResizeObserver(setStackH).observe(stackEl);
  setStackH();
}

/* ✕ przy atrybucji NIE usuwa jej — zwija do jednej plakietki. Widoczna atrybucja
   NEPTUN jest warunkiem korzystania z ich API, więc znika tylko z pola widzenia,
   nie z ekranu. Dotknięcie plakietki rozwija ją z powrotem. */
const attrEl = document.getElementById("attribution");
if (attrEl) {
  const mini = document.createElement("span");
  mini.className = "mini-label";
  mini.textContent = UI.isEn ? "sources ⓘ" : "źródła ⓘ";
  attrEl.appendChild(mini);
  if (localStorage.getItem("straznik_attr_mini") === "1") attrEl.classList.add("mini");
  document.getElementById("attr-x")?.addEventListener("click", (e) => {
    e.stopPropagation();
    attrEl.classList.add("mini");
    try { localStorage.setItem("straznik_attr_mini", "1"); } catch {}
  });
  attrEl.addEventListener("click", (e) => {
    if (!attrEl.classList.contains("mini")) {
      // rozwinięta atrybucja mieści jeden wiersz z wielokropkiem — dotknięcie
      // otwiera „O aplikacji", gdzie jest pełna lista źródeł
      if (e.target.closest("a")) return;
      document.getElementById("about")?.showModal();
      return;
    }
    attrEl.classList.remove("mini");
    try { localStorage.removeItem("straznik_attr_mini"); } catch {}
  });
  attrEl.style.cursor = "pointer";
}

/* ── dolne zakładki i menu „Więcej” ── */
const moreSheet = document.getElementById("more-sheet");
document.getElementById("tab-more")?.addEventListener("click", () => {
  if (moreSheet?.open) moreSheet.close(); else moreSheet?.showModal();
});
document.getElementById("tab-map")?.addEventListener("click", () => {
  setPanel(false);
  if (moreSheet?.open) moreSheet.close();
  if (document.body.classList.contains("history-mode")) toggleHistory();
  document.getElementById("legend")?.classList.add("hidden");
  document.getElementById("btn-legend")?.classList.remove("active");
  syncTabs();
});
// Wybór z menu wykonuje akcję i zamyka arkusz — inaczej zasłaniałby to,
// co użytkownik przed chwilą włączył (legendę, widok 3D, listę maszyn).
moreSheet?.querySelectorAll(".sheet-row").forEach(row =>
  row.addEventListener("click", () => setTimeout(() => moreSheet.close(), 60)));

/* Jedno zachowanie dla myszy i dotyku: panel, legenda i karta obiektu zamykają
   się po wskazaniu dowolnego miejsca poza nimi. pointerdown działa przed
   mapowym clickiem, więc kliknięcie nowego obiektu może od razu otworzyć jego
   kartę zamiast zamknąć ją w tej samej akcji. */
document.addEventListener("pointerdown", (e) => {
  const path = e.composedPath();
  const panel = document.getElementById("panel");
  const panelBtn = document.getElementById("btn-panel");
  if (!panel.classList.contains("collapsed")
      && !path.includes(panel) && !path.includes(panelBtn)) setPanel(false);

  const legend = document.getElementById("legend");
  const legendBtn = document.getElementById("btn-legend");
  if (!legend.classList.contains("hidden")
      && !path.includes(legend) && !path.includes(legendBtn)) {
    legend.classList.add("hidden");
    legendBtn.classList.remove("active");
  }

  const card = document.getElementById("ac-card");
  if (!card.classList.contains("hidden") && !path.includes(card)) hideCard();

  // Dla modalnych okien kliknięcie w przyciemnione tło ma ten sam sens.
  const dialog = e.target instanceof HTMLDialogElement ? e.target : null;
  if (dialog?.open) dialog.close();
}, { passive: true });

/* W trybie backendu (apka na serwerze) alarmy przy zamkniętej aplikacji dostarcza
   FCM, a powiadomienie systemowe wymaga zgody POST_NOTIFICATIONS. Wbudowany silnik
   prosił o nią sam, ale w trybie backendu nie startuje — więc prosimy tutaj.
   Subskrypcję tematu FCM (per województwo) odświeża natywnie MainActivity. */
async function ensureAppNotifications() {
  if (!IS_APP) return;
  try {
    const LN = window.Capacitor?.Plugins?.LocalNotifications;
    if (LN) await LN.requestPermissions();
  } catch (e) { console.warn("prośba o zgodę na powiadomienia:", e); }
}

/* ── start ───────────────────────────────────────────────────────────────── */
initMap();
connect();
ensureAppNotifications();
// pierwsze uruchomienie: o aplikacji → region → nasłuch w tle
if (!localStorage.getItem("straznik_onboarded")) {
  localStorage.setItem("straznik_onboarded", "1");
  setTimeout(() => runOnboarding(), 700);
} else if (!myVoiv() && !localStorage.getItem("straznik_voiv_asked")) {
  localStorage.setItem("straznik_voiv_asked", "1");
  setTimeout(() => openSettings(), 1200);
} else {
  // istniejąca instalacja bez włączonego nasłuchu — zaproponuj raz
  setTimeout(maybeOfferBackground, 2500);
}
setInterval(() => { if (state) renderPanel(); }, 30000);  // odświeżaj "x min temu"
setInterval(pollOnce, 60000);                              // siatka bezpieczeństwa
setTimeout(checkForUpdate, 6000);   // po starcie, gdy mapa i dane są już w drodze
// Powrót aplikacji na wierzch traktujemy jak kolejne otwarcie — z odstępem,
// żeby krótkie przełączenie na inną aplikację nie odpytywało GitHuba za każdym razem.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate(false, true);
});
setTimeout(refreshBgWarning, 3500);
setInterval(refreshBgWarning, 60000);

/* Region trzeba podać warstwie natywnej przy KAŻDYM starcie, nie tylko przy
   zapisie ustawień — od niego zależy subskrypcja tematu FCM. Kto wybrał
   województwo we wcześniejszej wersji i po aktualizacji nie zajrzał do ustawień,
   miał pusty region — a wtedy telefon subskrybował tylko cztery tematy
   przygraniczne i nie dostawał pusha o własnym województwie. */
setTimeout(() => syncObservedRegions(), 2500);
if ("serviceWorker" in navigator && !IS_APP)
  navigator.serviceWorker.register("sw.js").catch(() => {});

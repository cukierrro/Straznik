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
/* iPhone: brak APK i aktualizacji spoza App Store, brak sterowania głośnością,
   brak linków do wsparcia autora (App Store 3.1.1a). Klasę ios-app ustawia
   index.html jeszcze przed pierwszym renderem. */
const IS_IOS = IS_APP && window.Capacitor?.getPlatform?.() === "ios";
/* Wydanie z Google Play nie może aktualizować się samo ani prowadzić do zbiórki
   poza sklepem. Kanał ustawia wariant.js — patrz komentarz w tym pliku. */
const SKLEP = window.STRAZNIK_KANAL === "play";
const DEFAULT_BACKEND = "https://straznik.eu";   // serwer fuzji Strażnika (VPS przez Cloudflare)
/* Starszy WebView (Android bez aktualizacji, 15.09.2026 audyt): AbortSignal.timeout
   jest od Chrome 103 — bez niego nie ładowały się strefy PAŻP ani dziennik ADS-B. */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}
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
  // biało-szary: po nowej sylwetce BpSP żółty rozpoznawczy za bardzo go przypominał
  recon:    { label: "Dron rozpoznawczy",  color: "#c9d1dc" },
  unknown:  { label: "Obiekt powietrzny",  color: "#8a93a6" },
};
/* Ilustracje AI klas obiektów — nie zdjęcia ani wzorzec identyfikacji.
   WebP 900x600 zamiast PNG 1536x1024 (27.09.2026): karta rysuje je na 285 px,
   więc 900 px starcza na ekrany 3x, a plik waży ~12 KB zamiast ~1,6 MB.
   Obrazy były największą pozycją transferu — 127 GB w dobie szczytu. */
const THREAT_PHOTOS = {
  kab: { file: "kab-ai.webp" },
  uav: { file: "uav-ai.webp" },
  shahed: { file: "shahed-ai.webp" },
  fpv: { file: "fpv-ai.webp" },
  recon: { file: "recon-ai.webp" },
  missile: { file: "missile-ai.webp" },
  ballistic: { file: "ballistic-ai.webp" },
  mig31k: { file: "mig31k-ai.webp" },
  cruise: { file: "missile-ai.webp" },
};
const UI = window.I18N || { isEn:false, isUk:false, t:(pl)=>pl, tr:s=>s, voiv:s=>s, type:(k,s)=>s, confidence:(k,s)=>s };

/* <dialog>.showModal() ustawia fokus na pierwszym elemencie, do którego można trafić
   klawiaturą. Gdy leży on niżej (lista źródeł zaczyna się od odnośników), przeglądarka
   przewija okno i użytkownik dostaje je otwarte w połowie, bez nagłówka i bez odstępu
   u góry. Każde okno otwieramy więc od początku — także jego wewnętrzne obszary
   przewijane. */
if (window.HTMLDialogElement) {
  const openModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...args) {
    const r = openModal.apply(this, args);
    this.scrollTop = 0;
    this.querySelectorAll(".about-body, form, #src-list").forEach(el => { el.scrollTop = 0; });
    return r;
  };
}
const threatLabelPL = (type) => {
  const key = String(type || "").toLowerCase();
  return UI.type(key, (TYPE_META[key] || TYPE_META.unknown).label);
};
/* Czerwony wymaga potwierdzenia (23.09.2026): obiektu ≤15 min od granicy albo Alertu
   RCB „znajdź bezpieczne miejsce". Przy 4+ pkt bez potwierdzenia mówimy o tym wprost —
   inaczej liczba na ekranie przeczyłaby progowi z instrukcji. */
function bezPotwierdzenia(st) {
  if (!st || st.red_key || st.score < 4 || st.level === "high") return "";
  return `<span class="muted"> · ${UI.t("brak potwierdzenia obiektem — zostaje żółty", "no confirming object — stays yellow", "немає підтвердження об'єктом — лишається жовтий")}</span>`;
}
/* Poziom trzymany CZASEM, nie punktami (11.10.2026). Na żywo żółty zostaje
   10 min po ostatnim przekroczeniu progu (fusion.hold_level), żeby nie migał —
   ale karta mówiła wtedy „PODWYŻSZONA UWAGA” przy 1,7 pkt bez słowa wyjaśnienia.
   Ten sam opis w historii (Engine.historyFrom → podtrzymanie). */
function podtrzymanieHTML(p) {
  if (!p?.do) return "";
  const godz = new Date(p.do).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
    { hour: "2-digit", minute: "2-digit" });
  return `<div class="fineprint podtrzymanie">${UI.t(
    `podtrzymany do ${godz}: wynik spadł poniżej progu, a poziom trzyma się 10 min po ostatnim przekroczeniu, żeby nie migał`,
    `held until ${godz}: the score fell below the threshold, and the level stays for 10 min after it was last exceeded so it does not flicker`,
    `утримується до ${godz}: бал упав нижче порога, а рівень тримається 10 хв після останнього перевищення, щоб не блимав`)}</div>`;
}
const LEVEL_LABEL = UI.t(
  { none: "brak sygnałów", elevated: "PODWYŻSZONA UWAGA", high: "WYSOKI PRIORYTET" },
  { none: "no signals", elevated: "ELEVATED ATTENTION", high: "HIGH PRIORITY" },
  { none: "немає сигналів", elevated: "ПІДВИЩЕНА УВАГА", high: "ВИСОКИЙ ПРІОРИТЕТ" });

/* Poziom ALARMU (ten, który budzi telefon) i to, czy kolor mapy pochodzi wyłącznie
   od sąsiadów. Serwer liczy `alert_level` od 13.09.2026; starszy serwer go nie ma,
   więc wtedy zostaje dawne zachowanie. Żółte świętokrzyskie z samych przeniesień
   wyglądało jak alarm i włączało dźwięk w otwartej aplikacji, choć telefon nie
   dostał powiadomienia (zgłoszone 13.09.2026). */
const alarmLevel = (st) => st?.alert_level ?? st?.level ?? "none";
const spillRaised = (st) => !!st?.spill_raised;
const SPILL_LABEL = UI.t("PODNIESIONE PRZEZ SĄSIEDZTWO · bez alarmu", "RAISED BY NEIGHBOURS · no alert here", "ПІДНЯТО СУСІДСТВОМ · без тривоги");

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
const ROLE_UK = {
  "transport taktyczny":"тактичний транспорт", "lekki transport / patrol (Bryza)":"легкий транспорт / патруль (Bryza)",
  "transport strategiczny (Atlas)":"стратегічний транспорт (Atlas)", "transport strategiczny (Globemaster)":"стратегічний транспорт (Globemaster)",
  "transport ciężki (Galaxy)":"важкий транспорт (Galaxy)", "transport ciężki":"важкий транспорт",
  "latający tankowiec (KC-135)":"повітряний танкер (KC-135)", "latający tankowiec (Pegasus)":"повітряний танкер (Pegasus)",
  "tankowiec / transport (MRTT)":"танкер / транспорт (MRTT)", "AWACS — wczesne ostrzeganie":"AWACS — раннє попередження",
  "wczesne ostrzeganie (Wedgetail)":"раннє попередження (Wedgetail)", "myśliwiec wielozadaniowy":"багатоцільовий винищувач",
  "myśliwiec 5. gen. (Lightning II)":"винищувач 5-го покоління (Lightning II)", "myśliwiec przewagi powietrznej":"винищувач переваги в повітрі",
  "myśliwiec (Eurofighter Typhoon)":"винищувач (Eurofighter Typhoon)", "myśliwiec (Rafale)":"винищувач (Rafale)",
  "myśliwiec (Gripen)":"винищувач (Gripen)", "myśliwiec (MiG-29)":"винищувач (МіГ-29)",
  "myśliwsko-bombowy (Su-22)":"винищувач-бомбардувальник (Су-22)",
  "patrolowy morski (Poseidon)":"морський патрульний (Poseidon)", "dron rozpoznawczy (Phoenix)":"розвідувальний дрон (Phoenix)",
  "dron rozpoznawczy (Global Hawk)":"розвідувальний дрон (Global Hawk)", "dron rozpoznawczo-uderzeniowy (Reaper)":"розвідувально-ударний дрон (Reaper)",
  "rozpoznanie / łącznikowy":"розвідка / зв\u2019язок", "rozpoznanie specjalne":"спеціальна розвідка", "rozpoznanie / VIP":"розвідка / VIP",
  "VIP / sztabowy":"VIP / штабний", "szkolno-treningowy (Texan II)":"навчально-тренувальний (Texan II)",
  "szkolno-bojowy (Albatros)":"навчально-бойовий (Albatros)",
  "śmigłowiec wielozadaniowy (Black Hawk)":"багатоцільовий гелікоптер (Black Hawk)", "śmigłowiec szturmowy (Apache)":"ударний гелікоптер (Apache)",
  "śmigłowiec transportowy (Chinook)":"транспортний гелікоптер (Chinook)", "śmigłowiec transportowy (Mi-8)":"транспортний гелікоптер (Мі-8)",
  "śmigłowiec transportowy (Mi-17)":"транспортний гелікоптер (Мі-17)", "śmigłowiec szturmowy (Mi-24)":"ударний гелікоптер (Мі-24)",
  "śmigłowiec wielozadaniowy (Sokół)":"багатоцільовий гелікоптер (Sokół)", "śmigłowiec lekki":"легкий гелікоптер",
  "śmigłowiec (Caracal)":"гелікоптер (Caracal)", "śmigłowiec (Super Puma)":"гелікоптер (Super Puma)", "śmigłowiec (AW139)":"гелікоптер (AW139)",
  "latający tankowiec":"повітряний танкер", "myśliwiec":"винищувач", "transport strategiczny":"стратегічний транспорт",
  "patrolowy morski":"морський патрульний", "dron rozpoznawczy":"розвідувальний дрон", "śmigłowiec wielozadaniowy":"багатоцільовий гелікоптер",
  "śmigłowiec szturmowy":"ударний гелікоптер", "śmigłowiec transportowy":"транспортний гелікоптер", "śmigłowiec":"гелікоптер"
};
const roleText = role => UI.t(role, ROLE_EN[role] || role, ROLE_UK[role] || ROLE_EN[role] || role);
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
const acName = (type, desc) => desc || MIL_NAMES[type] || type || (UI.t("typ nieznany", "unknown type", "тип невідомий"));
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
/* Rdzenie nazw obwodów — łapią też formy potoczne („Харківщина", „Прикарпаття"),
   dla których pełna nazwa z OBLAST_PL nie pasowała i zostawała surowa
   transliteracja. [rdzeń, polski przymiotnik, nazwa angielska] */
const OBLAST_STEMS = [
  ["Волин", "wołyński", "Volyn"], ["Львів", "lwowski", "Lviv"], ["Закарпат", "zakarpacki", "Zakarpattia"],
  ["Рівнен", "rówieński", "Rivne"], ["Тернопіл", "tarnopolski", "Ternopil"],
  ["Хмельниц", "chmielnicki", "Khmelnytskyi"], ["Хмельнич", "chmielnicki", "Khmelnytskyi"],
  ["Івано-Франків", "iwanofrankiwski", "Ivano-Frankivsk"], ["Прикарпат", "iwanofrankiwski", "Ivano-Frankivsk"],
  ["Чернівец", "czerniowiecki", "Chernivtsi"], ["Буковин", "czerniowiecki", "Chernivtsi"],
  ["Житомир", "żytomierski", "Zhytomyr"], ["Вінниц", "winnicki", "Vinnytsia"], ["Віннич", "winnicki", "Vinnytsia"],
  ["Київськ", "kijowski", "Kyiv"], ["Київщин", "kijowski", "Kyiv"],
  ["Черкас", "czerkaski", "Cherkasy"], ["Черкащин", "czerkaski", "Cherkasy"],
  ["Кіровоград", "kirowohradzki", "Kirovohrad"], ["Кропивниц", "kirowohradzki", "Kirovohrad"],
  ["Одеськ", "odeski", "Odesa"], ["Одещин", "odeski", "Odesa"], ["Миколаїв", "mikołajowski", "Mykolaiv"],
  ["Херсон", "chersoński", "Kherson"], ["Дніпропетров", "dniepropetrowski", "Dnipropetrovsk"],
  ["Дніпровщин", "dniepropetrowski", "Dnipropetrovsk"], ["Запорізьк", "zaporoski", "Zaporizhzhia"],
  ["Запоріжжя", "zaporoski", "Zaporizhzhia"], ["Полтав", "połtawski", "Poltava"],
  ["Сумськ", "sumski", "Sumy"], ["Сумщин", "sumski", "Sumy"], ["Чернігів", "czernihowski", "Chernihiv"],
  ["Харків", "charkowski", "Kharkiv"], ["Донец", "doniecki", "Donetsk"], ["Донеччин", "doniecki", "Donetsk"],
  ["Луган", "ługański", "Luhansk"], ["Крим", "Krym", "Crimea"],
];
const oblastPL = (s) => {
  if (UI.isUk) return (s || "").trim();   // zrodlo podaje juz po ukrainsku
  if (!s) return "";
  if (!UI.isEn) for (const [ua, pl] of Object.entries(OBLAST_PL))
    if (s.includes(ua) && ua !== "Київ") return "obw. " + pl;
  for (const [stem, pl, en] of OBLAST_STEMS) if (s.includes(stem))
    return UI.isEn ? (en === "Crimea" ? en : `${en} oblast`) : (pl === "Krym" ? pl : "obw. " + pl);
  if (s.includes("Київ")) return UI.t("Kijów", "Kyiv", "Київ");
  return placeName(s);
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
/* Angielska transliteracja ukraińskiej cyrylicy (oficjalny system KMU 2010).
   W wersji angielskiej karta pisała „Szewczenkowe (Charkiwszczyzna)" — polską
   łacinką, nieczytelną dla anglojęzycznego odbiorcy (zgłoszone 13.09.2026). */
const TR_EN = { "а":"a","б":"b","в":"v","г":"h","ґ":"g","д":"d","е":"e","є":"ie","ж":"zh","з":"z",
  "и":"y","і":"i","ї":"i","й":"i","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
  "с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ь":"","ю":"iu",
  "я":"ia","'":"", "’":"", "ʼ":"" };
// na początku słowa: Є→Ye, Ї→Yi, Й→Y, Ю→Yu, Я→Ya
const TR_EN_INITIAL = { "є":"ye","ї":"yi","й":"y","ю":"yu","я":"ya" };
function translitEn(s) {
  if (!s) return "";
  let out = "", prevLetter = false;
  for (const ch of s) {
    const low = ch.toLowerCase();
    let t = (!prevLetter && TR_EN_INITIAL[low]) || TR_EN[low];
    const isLetter = /\p{L}/u.test(ch);
    if (t === undefined) { out += ch; prevLetter = isLetter; continue; }
    out += ch === low ? t : (t.charAt(0).toUpperCase() + t.slice(1));
    prevLetter = isLetter;
  }
  return out;
}
/* Nazwa miejscowości w języku interfejsu; nazwa obwodu podana jako miejscowość
   („Хмельницька область") idzie przez słownik obwodów. */
function placeName(s) {
  if (!s) return "";
  if (UI.isUk) return s.trim();           // nazwa ukrainska zostaje w oryginale
  if (s.trim() === "Київ") return UI.t("Kijów", "Kyiv", "Київ");
  if (/област|щин/.test(s)) {
    for (const [stem, pl, en] of OBLAST_STEMS) if (s.includes(stem))
      return UI.isEn ? `${en} oblast` : "obw. " + pl;
  }
  return UI.isEn ? translitEn(s) : translit(s);
}
/* własny opis po polsku zamiast tłumaczenia ukraińskiego zdania */
function threatDesc(t) {
  const meta = TYPE_META[t.type] || { label: t.type };
  const where = [t.locality ? placeName(t.locality) : null, oblastPL(t.region)]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
  const parts = [];
  if (where) parts.push(t.destination
    ? UI.t(`kursem na ${where}`, `heading towards ${where}`, `курсом на ${where}`)
    : UI.t(`rejon: ${where}`, `area: ${where}`, `район: ${where}`));
  if (t.sourceCount) parts.push(UI.t(`potwierdzeń: ${t.sourceCount}`, `confirmations: ${t.sourceCount}`, `підтверджень: ${t.sourceCount}`));
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
/* Alarm ogólnokrajowy NEPTUN-a („national-mig31k”, region „Загальнодержавна
   загроза”): umowny punkt w środku Ukrainy, nie pozycja samolotu. 14.09.2026
   taki MiG-31K stał 35 min na mapie jak zawieszony obiekt. Pokazujemy go jako
   komunikat (#national-banner), nie ikonę. Zgłoszony obiekt z własnym id i
   obwodem zostaje zwykłym obiektem na mapie. Lustro: config.NEPTUN_NATIONAL_*.
   straznik_national ustawia serwer; id/region obsługują starsze migawki. */
const NATIONAL_ID_PREFIX = "national-", NATIONAL_REGION_MARKERS = ["загальнодержавн"];
function isNationalThreat(t) {
  return !!t?.straznik_national || String(t?.id ?? "").startsWith(NATIONAL_ID_PREFIX)
    || NATIONAL_REGION_MARKERS.some(m => String(t?.region ?? "").toLowerCase().includes(m));
}
/* Tekst komunikatu. Sam „alarm dla całej Ukrainy” nie mówił, co to znaczy
   (uwaga usera 14.09.2026) — dopisane, czym jest MiG-31K i czemu nie ma go na mapie. */
function nationalText(t) {
  const meta = TYPE_META[t.type] || TYPE_META.unknown;
  const since = Date.parse(t.straznik_national?.since || "");
  const time = Number.isFinite(since) ? new Date(since).toLocaleTimeString(
    UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" }) : "";
  const mig = t.type === "mig31k";
  /* 15.09.2026 NEPTUN pokazał start jako „моніторинг, не тривога” (pole advisory),
     a my pisaliśmy „alarm w całej Ukrainie”. Alarm tylko przy advisory === false;
     brak pola (starsze migawki) = tekst bez twierdzenia o alarmie. */
  const adv = t.straznik_national?.advisory ?? t.advisory;
  const kind = adv === true ? "watch" : adv === false ? "alarm" : "unknown";
  // Brzmienie jak w komunikacie NEPTUN-a („Зліт МіГ-31К · моніторинг, не тривога”).
  const tail = {
    watch: UI.t("monitoring, nie alarm", "monitoring, not an alert", "моніторинг, а не тривога"),
    alarm: UI.t("alarm w całej Ukrainie", "alert across Ukraine", "тривога по всій Україні"),
    unknown: "" }[kind];
  const name = mig ? (UI.t("Start MiG-31K", "MiG-31K take-off", "Зліт МіГ-31К")) : UI.type(t.type, meta.label);
  const head = name + (tail ? ` — ${tail}` : "") + (time ? ` · ${UI.t("od", "since", "від")} ${time}` : "");
  const what = mig ? (UI.t("Zarejestrowano start MiG-31K — nosiciela rakiet Kindżał. ", "A MiG-31K take-off has been recorded — the carrier of Kinzhal missiles. ", "Зафіксовано зліт МіГ-31К — носія ракет «Кинджал». ")) : "";
  const status = {
    watch: UI.t("Alarmu nie ogłoszono w całej Ukrainie — obowiązują alarmy w poszczególnych obwodach. To ostrzeżenie o ryzyku, a nie sygnał, by się ukryć. ", "The alert has not been declared across the whole of Ukraine — alerts apply in individual regions. This is a risk warning, not a signal to take shelter. ", "Тривогу не оголошено по всій Україні — діють тривоги в окремих областях. Це попередження про ризик, а не сигнал ховатися. "),
    alarm: UI.t("Alarm ogłoszono w całej Ukrainie. ", "An alert has been declared across the whole of Ukraine. ", "Тривогу оголошено по всій Україні. "),
    unknown: "" }[kind];
  const body = what + status + (UI.t("Pozycja nie jest znana, więc nie ma go na mapie. Dla Polski: nie dolicza punktów.", "The position is unknown, so it is not on the map. For Poland: no points added.", "Позиція невідома, тому його немає на мапі. Для Польщі: балів не додає."));
  const chip = mig ? "MiG-31K" : UI.type(t.type, meta.label);
  return { head, body, chip, color: meta.color };
}
function openNationalInfo(t) {
  const x = nationalText(t);
  document.getElementById("national-info-head").textContent = x.head;
  document.getElementById("national-info-body").textContent = x.body;
  document.getElementById("national-info").showModal();
}
document.getElementById("national-info-close")?.addEventListener("click", () =>
  document.getElementById("national-info").close());
/* Na żywo: pełny komunikat nad paskiem województwa. */
function renderNationalBanner(threats) {
  const el = document.getElementById("national-banner");
  if (!el) return;
  const list = (threats || []).filter(isNationalThreat);
  if (!list.length) { el.className = "hidden"; el.innerHTML = ""; return; }
  el.className = "";
  el.innerHTML = list.map(t => {
    const x = nationalText(t);
    return `<div class="nat-row" style="--nat:${x.color}"><b>${esc(x.head)}</b><br><span class="muted">${
      esc(x.body)}</span></div>`;
  }).join("");
}
/* W historii: tylko plakietka w nagłówku paska (stała wysokość — nic nie skacze
   pod palcem), pełny tekst po dotknięciu. */
function renderNationalChip(threats) {
  const el = document.getElementById("tb-national");
  if (!el) return;
  const list = (threats || []).filter(isNationalThreat);
  const key = list.map(t => t.id).join("|");
  if (el.dataset.key === key) return;          // bez przebudowy DOM przy każdej klatce suwaka
  el.dataset.key = key;
  if (!list.length) { el.innerHTML = ""; return; }
  const x = nationalText(list[0]);
  el.innerHTML = `<button type="button" class="tb-nat" style="--nat:${x.color}" title="${esc(x.head)}">● ${
    esc(x.chip)}${list.length > 1 ? ` +${list.length - 1}` : ""} ⓘ</button>`;
  el.firstChild.onclick = () => openNationalInfo(list[0]);
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
/* Chwila, względem której liczymy wiek meldunku. W podglądzie historii to czas
   migawki, nie „teraz" — inaczej wszystko wyglądałoby na przeterminowane. */
function nowRefMs() {
  return histMode && historyAdsbTime != null ? historyAdsbTime : Date.now();
}
/* „Przybliżony rejon" nie mówił czytelnikowi najważniejszego: przy meldunku
   „kursem na X" punkt leży na linii dolotu do celu i nie jest zmierzonym
   położeniem. 30.09.2026 taki punkt wypadł 14 km za granicą, w innym państwie
   niż zgłoszony region, i czytelnik zrozumiał to jako przelot nad tym krajem. */
/* 10.10.2026 sprawdzone na sześciu takich obiektach z jednej nocy: punkt leży
   na linii kursu ok. 40 km PRZED celem (namiar na cel = kurs z dokładnością
   do 1°), a dwa różne tracki miały identyczną pozycję co do 4. miejsca po
   przecinku. Źródło wyznacza go z celu i kursu — to nie obserwacja. Środek
   miejscowości (locality_center) to inny przypadek: punkt stoi w celu. */
function naKursieDoCelu(t) {
  return t?.destination === true && positionInfo(t).reason !== "locality_center";
}
function approxPositionNote(t) {
  const locality = positionInfo(t).reason === "locality_center";
  const naCel = naKursieDoCelu(t);
  const cel = naCel && t?.locality ? placeName(t.locality) : "";
  const heading = locality
    ? (UI.t("środek miejscowości użyty jako punkt odniesienia, nie zmierzona pozycja obiektu", "locality centre used as a reference point, not a measured object position", "центр населеного пункту використано як орієнтир, а не виміряна позиція об'єкта"))
    : naCel
    ? (cel
      ? UI.t(`pozycja wyznaczona przez źródło z celu i kursu, nie zaobserwowana — obiekt może być w dowolnym miejscu trasy do: ${cel}`,
          `position derived by the source from the target and course, not observed — the object may be anywhere on its route to ${cel}`,
          `позицію визначило джерело за ціллю й курсом, її не спостерігали — об'єкт може бути будь-де на шляху до: ${cel}`)
      : UI.t("pozycja wyznaczona przez źródło z celu i kursu, nie zaobserwowana — obiekt może być w dowolnym miejscu trasy do celu",
          "position derived by the source from the target and course, not observed — the object may be anywhere on its route to the target",
          "позицію визначило джерело за ціллю й курсом, її не спостерігали — об'єкт може бути будь-де на шляху до цілі"))
    : (UI.t("przybliżony rejon zgłoszenia", "approximate report area", "приблизний район повідомлення"));
  return `<span style="color:#ffb020"><b>${heading}</b> — ${UI.t("brak potwierdzonej trasy i czasu dolotu", "no confirmed route or arrival time", "немає підтвердженого маршруту й часу підльоту")}</span>`;
}
/* Separator dziesiętny bierze się z języka, nie z JavaScriptu. Od 1.7.84 ta
   liczba stoi na mapie pod ikoną, więc „0.2 km" rzucało się w oczy: po polsku
   i po ukraińsku pisze się „0,2". */
const odleglosc = (km) => (UI.isEn ? String(km) : String(km).replace(".", ","));

function threatDistanceText(t, km) {
  if (km == null) return "?";
  // A2b: odległość liczona do konturu kraju — 0 znaczy „już nad Polską”
  if (km === 0 || t?.pl_assessment?.inside_pl) return UI.t("nad Polską", "over Poland", "над Польщею");
  if (!isApproxPosition(t)) return `${odleglosc(km)} km`;
  if (km < 10) return UI.t("mniej niż 10 km (szacunek rejonowy)", "less than 10 km (area estimate)", "менш ніж 10 км (оцінка по району)");
  const rounded = Math.round(km / 10) * 10;
  return UI.t(`około ${rounded} km (szacunek rejonowy)`, `about ${rounded} km (area estimate)`, `близько ${rounded} км (оцінка по району)`);
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
/* Audyt G11/C3: pokazane ETA było dłuższe od najgorszego realnego przypadku
   w 95% wystąpień. Teraz: prędkość = większa z zmierzonej i typowej (zaszumiony
   ślad „24 km/h” dawał 247 min zamiast 30) oraz przedział, którego dolna granica
   odejmuje niepewność pozycji i drogę przebytą od potwierdzenia w źródle. */
function etaInfo(t) {
  if (isApproxPosition(t)) return null;
  const a = t.pl_assessment;
  if (!a || !a.toward_pl || a.heading_known === false) return null;
  // G3: kurs „kursem na X” bez potwierdzenia ruchem nie daje czasu dolotu
  if (isPresumedCourse(t) && measuredHeading(t) == null) return null;
  /* Prędkość bierzemy Z SERWERA, jeśli ją podał — to DOKŁADNIE ta liczba,
     na której oparte jest powiadomienie. Własny rachunek zostaje tylko jako
     zapas: tryb awaryjny i starszy backend bez pola `straznik_speed`.
     Tak znika rozjazd „powiadomienie mówi co innego niż karta". */
  const zSerwera = t.straznik_speed;
  const jet = zSerwera ? !!zSerwera.jet : isJetDrone(t);
  const typical = jet ? JET_ALARM_KMH : (typeSpeedKmh(t) || 0);
  const v = zSerwera?.kmh
    ?? (t.velocity?.speedKmh ?? (Math.max(measuredTrackSpeed(t) || 0, typical) || null));
  if (!v) return null;
  // Dron odrzutowy: krótszy koniec liczymy przy prędkości końcowego odcinka.
  // Dłuższy koniec NIGDY nie jest wolniejszy niż prędkość alarmu — inaczej
  // karta pokazywałaby więcej czasu, niż sami zakładamy (G6).
  const vLo = zSerwera?.fast_kmh ?? (jet ? Math.max(v, JET_MAX_KMH) : v);
  const mine = myVoiv();
  const seen = Date.parse(t.confirmedAt || t.updatedAt || "");
  const refMs = nowRefMs();
  const ageH = Number.isFinite(seen) ? Math.max(0, (refMs - seen) / 3600000) : 0;
  const slackKm = (Number(t.uncertaintyKm) || 0) + v * ageH;
  const range = (km) => km == null ? null
    : { lo: etaMin(Math.max(0, km - slackKm), vLo), hi: etaMin(km, v) };
  const border = range(a.dist_km);
  const voiv = mine ? range(distToVoivKm(t.lat, t.lon, mine)) : null;
  return {
    speed: Math.round(v),
    border: border?.hi ?? null, borderLo: border?.lo ?? null,
    voiv: voiv?.hi ?? null, voivLo: voiv?.lo ?? null,
    voivName: mine,
  };
}
/* G3/G6 — lustro neptun.heading_source i is_jet na serwerze */
const isPresumedCourse = (t) => t?.heading != null && t?.presumptiveCourse === true;
/* JET_ALARM_KMH to PODŁOGA, na której opiera się alarm i czas pokazywany
   człowiekowi — ta sama liczba co NEPTUN_JET_SPEED_KMH w backendzie.
   JET_CRUISE_KMH (350) jest wyłącznie OPISOWA: prawdziwa prędkość przelotowa,
   do wyjaśnienia ludziom, skąd biorą się granice. Do 04.10.2026 karta liczyła
   dłuższy czas po 350, czyli pokazywała WIĘCEJ czasu, niż zakładał alarm —
   obiecywała zapas, którego sami sobie nie przyznawaliśmy. */
const JET_ALARM_KMH = 450, JET_CRUISE_KMH = 350, JET_MAX_KMH = 600;
/* Klasy, które źródło podaje ZBIORCZO: NEPTUN melduje „БпЛА" bez rozróżnienia
   maszyny zwiadowczej od Shaheda. Nasza legenda je rozdziela, więc trzeba
   powiedzieć wprost, że rozdzielenie pochodzi od nas, a nie z meldunku. */
const COLLECTIVE_DRONE_TYPES = new Set(["uav", "shahed"]);
const isJetDrone = (t) => !!t?.straznik_jet
  || /реактивн/i.test(`${t?.title || ""} ${t?.explanationShort || ""}`);
const etaTxt = (m) => m == null ? null : (m < 1 ? "<1 min" : `~${m} min`);
const etaRangeTxt = (lo, hi) => (lo == null || hi == null || lo >= hi) ? etaTxt(hi)
  : `${lo}–${hi} min`;
/* ETA zapisane w sygnale starzeje się: sygnał sprzed 40 min pokazywał „~8 min”.
   Odejmujemy wiek sygnału, a po 15 min liczby nie pokazujemy wcale. */
function agedEta(m, ts) {
  if (m == null) return null;
  const ref = nowRefMs();
  const ageMin = (ref - Date.parse(ts || "")) / 60000;
  if (!Number.isFinite(ageMin)) return m;
  if (ageMin > 15) return null;
  return Math.max(0, Math.round(m - Math.max(0, ageMin)));
}

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
    else if (info.reason === "course") detail = ` · <span style="color:#ffb020">${UI.t("kurs nie prowadzi do tego punktu", "not heading towards this point", "курс не веде до цієї точки")}</span>`;
    else detail = ` · <span style="color:#ffb020">${UI.t("brak ETA — za mało danych o kursie lub prędkości", "ETA unavailable — insufficient heading or speed data", "немає ETA — замало даних про курс або швидкість")}</span>`;
    return `<div><b>${esc2(place.name)}</b>: ${distance} km${detail}</div>`;
  }).filter(Boolean).join("");
  if (!rows) return "";
  return `<div class="local-place-eta"><div>${UI.t("Do zapisanych dokładnych lokalizacji", "To saved exact locations", "До збережених точних місць")}</div>${rows}<small>${UI.t("liczone tylko na tym urządzeniu, gdy aplikacja jest na pierwszym planie; ETA zakłada niezmienny kurs i odejmuje 2,5 min na opóźnienie danych", "calculated only on this device while the app is in the foreground; ETA assumes unchanged heading and deducts 2.5 min for data delay", "рахується лише на цьому пристрої, коли застосунок на передньому плані; ETA припускає незмінний курс і віднімає 2,5 хв на затримку даних")}</small></div>`;
}

/* Wiersz „czas dolotu" do karty obiektu. Świadomie piszemy „przy tej prędkości",
   a NIE „czas na schronienie": to szacunek z prędkości typowej dla klasy, obiekt
   może skręcić albo zostać zestrzelony. Obiecywanie pewności byłoby groźne. */
function etaHtml(t) {
  if (isApproxPosition(t)) return approxPositionNote(t) + "<br>";
  const e = etaInfo(t);
  if (!e || e.border == null) {
    const base = t.pl_assessment && t.pl_assessment.heading_known === false
      ? `<span style="color:#ffb020">${UI.t("kurs nieznany — czasu dolotu nie szacujemy", "unknown heading — arrival time is not estimated", "курс невідомий — часу підльоту не оцінюємо")}</span><br>`
      : isPresumedCourse(t) && t.pl_assessment?.toward_pl
      ? `<span style="color:#ffb020">${UI.t("kurs domniemany (na cel), niepotwierdzony ruchem — czasu dolotu nie szacujemy", "presumed heading towards a target, not confirmed by movement — arrival time is not estimated", "курс припущений (на ціль), не підтверджений рухом — часу підльоту не оцінюємо")}</span><br>`
      : "";
    return base + localPlaceHtml(t);
  }
  const mine = (e.voiv != null && e.voivName)
    ? ` · ${UI.t("do woj.", "to", "до воєв.")} ${esc2(UI.voiv(e.voivName))}: <b>${etaRangeTxt(e.voivLo, e.voiv)}</b>` : "";
  return `${UI.t("konserwatywny czas dolotu do granicy PL", "conservative time to the Polish border", "консервативний час підльоту до кордону Польщі")}: <b>${etaRangeTxt(e.borderLo, e.border)}</b>${mine}<br>`
    + (isJetDrone(t) ? `<span style="color:#95a1b7">${UI.t("dron odrzutowy: przelot 350 km/h, na końcowym odcinku do 600 — liczymy po 450", "jet drone: 350 km/h cruise, up to 600 on the final leg — we count at 450", "реактивний дрон: політ 350 км/год, на кінцевому відрізку до 600 — рахуємо за 450")}</span><br>` : "")
    // Źródło podaje drony ZBIORCZO (БпЛА) i nie mówi, czy to maszyna
    // zwiadowcza, czy Shahed. Liczymy jak dla Shaheda i mówimy o tym wprost —
    // człowiek ma wiedzieć, że to założenie, a nie odczyt.
    // Do 1.7.90 stało tu „przyjmujemy wariant groźniejszy" — nieprawda wobec
    // odrzutowego Shaheda (300–600 km/h): serwer uznaje obiekt za odrzutowy
    // TYLKO z oznaczenia w źródle, a dla zwykłego drona prędkość jest sztywna
    // i pomiar z ruchu jej nie podnosi (pytanie użytkownika, 08.10.2026).
    // Prędkość z tabeli, nie wpisana na sztywno — inaczej zdanie skłamie
    // przy pierwszej zmianie TYPE_SPEED_KMH.
    + (COLLECTIVE_DRONE_TYPES.has(t.type) ? `<span style="color:#95a1b7">${UI.t(
        `źródło nie rozróżnia BSP i Shahedów — liczymy jak dla Shaheda (${typeSpeedKmh(t)} km/h). Odrzutowego Shaheda rozpoznajemy tylko, gdy źródło go oznaczy`,
        `the source does not tell UAVs and Shaheds apart — we count it as a Shahed (${typeSpeedKmh(t)} km/h). A jet Shahed is recognised only when the source marks it`,
        `джерело не розрізняє БпЛА і «шахедів» — рахуємо як для «шахеда» (${typeSpeedKmh(t)} км/год). Реактивний «шахед» розпізнаємо, лише коли джерело його позначить`)}</span><br>` : "")
    + `<span style="color:#95a1b7">${UI.t(`szacunek przy prędkości ${e.speed} km/h i utrzymaniu kursu; krótszy czas uwzględnia niepewność pozycji i wiek danych, odjęto 2,5 min na opóźnienie — nie uwzględnia obrony powietrznej`, `estimate at ${e.speed} km/h with unchanged heading; the shorter time allows for position uncertainty and data age, 2.5 min deducted for data delay — air defence not included`, `оцінка за швидкості ${e.speed} км/год і збереження курсу; коротший час враховує невизначеність позиції та вік даних, віднято 2,5 хв на затримку — не враховує протиповітряної оборони`)}</span><br>`
    + localPlaceHtml(t);
}

const COMPASS = UI.t(
  ["płn.", "płn.-wsch.", "wsch.", "płd.-wsch.", "płd.", "płd.-zach.", "zach.", "płn.-zach."],
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  ["пн.", "пн.-сх.", "сх.", "пд.-сх.", "пд.", "пд.-зх.", "зх.", "пн.-зх."]);
const compass = (deg) => deg == null ? "" : COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const ftToM = (ft) => typeof ft === "number" ? Math.round(ft * 0.3048) : null;
const ktToKmh = (kt) => typeof kt === "number" ? Math.round(kt * 1.852) : null;
// alt_baro bywa stringiem "ground" (maszyna na płycie lotniska)
const altText = (alt) => alt === "ground" ? (UI.t("na ziemi", "on the ground", "на землі"))
  : typeof alt === "number" ? `${alt} ft (${ftToM(alt)} m)` : (UI.t("wysokość b.d.", "altitude unavailable", "висота н/д"));
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
let map, mapReady = false;
/* Widok 2D/3D zapamiętany na urządzeniu (22.09.2026): część osób woli 2D i musiała
   przełączać go przy każdym uruchomieniu. Domyślnie 3D, jak dotąd. */
let is3d = (() => { try { return localStorage.getItem("straznik_widok") !== "2d"; } catch { return true; } })();

/* ── połączenie z backendem ──────────────────────────────────────────────── */
const connBadge = document.getElementById("conn-badge");
/* Odpytywanie zamiast gniazda (20.09.2026, po analizie hostingu). Do 1.7.62 każdy
   telefon trzymał WebSocket do naszego serwera — przy 530 telefonach to 530 gniazd
   w jednym procesie, a zużycie rosło liniowo z liczbą ludzi. Teraz pytamy o
   /api/state z nagłówkiem If-None-Match: gdy nic się nie zmieniło, odpowiada
   Cloudflare ze swojego brzegu („304", kilkaset bajtów) i nasz serwer o tym pytaniu
   nawet nie wie. Do origin idzie najwyżej jedna kopia stanu na 2 s na centrum danych,
   niezależnie od tego, czy patrzy 500 osób, czy 50 000.

   Stan zmienia się średnio co 17 s (pomiar 20.09.2026), więc pytanie co 2–5 s nie
   gubi niczego, a właściwy alarm przy zamkniętej aplikacji i tak idzie powiadomieniem
   push. Serwer nadal obsługuje WebSocket dla starszych wersji aplikacji. */
const POLL_ALARM_MS = 2000;     // trwa alarm — patrzymy uważniej
const POLL_ACTIVE_MS = 5000;    // gdziekolwiek w kraju podniesiony poziom
/* Pełna cisza w całym kraju. Pomiar z 27.09.2026: taki stan trwa ~93,5% czasu,
   a ticki serwera przychodzą wtedy co ~16 s — pytanie co 5 s nic nie wnosiło.
   W szczycie ticki idą co 2 s i wtedy rzadsze pytanie wprost dzieli ruch, ale
   wtedy i tak jesteśmy na jednym z dwóch szybszych poziomów. */
const POLL_CALM_MS = 15000;
const POLL_BUSY_MS = 10000;     // serwer prosi o przerwę (503)
const POLL_LOST_MS = 12000;     // tyle bez odpowiedzi = pokazujemy „brak połączenia"
let pollTimer = null, pollVer = null, pollEtag = null, pollBusyFlag = false;
let pollInFlight = false, pollLastOk = 0;
/* Część pomocnicza stanu: samoloty ADS-B i stan źródeł. Zmienia się wolniej niż
   reszta (pomiar 27.09.2026: na 11 ticków `adsb` zmieniło się 4 razy, `health`
   ani razu), więc serwer podaje ją osobno, a część główna niesie jej odcisk
   `aux_v`. Dobieramy ją tylko wtedy, gdy odcisk się zmienił.
   Gdy serwer jest starszy i nie zna podziału, `aux_v` nie przychodzi — wtedy
   pełny stan ma te sekcje w środku i nie pytamy o nic więcej. */
let auxDane = null, auxWersja = null, ostatniaGlowna = null;

function zlozStan(glowna) {
  // Serwer BEZ podziału (starszy writer w trakcie wdrożenia, wycofanie wydania)
  // przysyła pełny stan razem z adsb i health. Nałożenie na niego zapamiętanej
  // części pomocniczej zamroziłoby samoloty na ostatnio pobranej pozycji — i nikt
  // by tego nie zgłosił, bo mapa wyglądałaby normalnie. Wtedy zapamiętaną część
  // wyrzucamy i bierzemy to, co przyszło.
  if (glowna && glowna.adsb) { auxDane = null; auxWersja = null; return glowna; }
  return auxDane ? { ...glowna, ...auxDane } : glowna;
}

async function pobierzAux(wersja) {
  const base = apiBase(); if (!base) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(base + "/api/state?part=aux", { cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return;
    const d = await r.json();
    if (!d || typeof d !== "object" || !d.adsb) return;   // nie nadpisujemy dobrych danych śmieciem
    auxDane = d; auxWersja = wersja;
    if (ostatniaGlowna) applyState(zlozStan(ostatniaGlowna));
  } catch {}
}
/* Krótkie zerwanie (przejazd tunelem, zmiana sieci) trwa sekundy i wracało samo,
   a komunikat zdążył mignąć i straszył. Pokazujemy go dopiero, gdy połączenia nie
   ma dłużej niż CONN_LOST_DELAY_MS. */
const CONN_LOST_DELAY_MS = 6000;
let connLostTimer = null;
function showConnLost() {
  if (connLostTimer || !connBadge.classList.contains("hidden")) return;
  connLostTimer = setTimeout(() => {
    connLostTimer = null;
    /* Przegląd UI 14.10.2026: przy zerwanym połączeniu stare dane wyglądały na
       świeże — baner województwa, zielone diody. Plakietka mówi teraz, od kiedy
       są dane, a klasa dane-stare przygasza baner i diody (style.css). */
    const zKiedy = threatsReceivedAt
      ? new Date(threatsReceivedAt).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" }) : "";
    connBadge.textContent = zKiedy
      ? UI.t(`brak połączenia — dane z ${zKiedy}, mogą być nieaktualne; ponawiam…`, `no connection — data from ${zKiedy}, may be out of date; retrying…`, `немає з'єднання — дані з ${zKiedy}, можуть бути застарілими; повторюю…`)
      : UI.t("brak połączenia z serwerem — ponawiam…", "server connection lost — retrying…", "немає зв'язку із сервером — повторюю…");
    connBadge.classList.remove("hidden");
    document.body.classList.add("dane-stare");
    powiedz(a11yInfo, connBadge.textContent);
  }, CONN_LOST_DELAY_MS);
}
function clearConnLostTimer() { clearTimeout(connLostTimer); connLostTimer = null; }
function showBusyPolling() {
  clearConnLostTimer();
  // Nie „odświeżana co kilka sekund” — przy 503 nowe dane NIE przychodzą (przegląd UI 14.10).
  connBadge.textContent = UI.t("duży ruch na serwerze — dane mogą być opóźnione; ponawiam…", "heavy server traffic — data may be delayed; retrying…", "великий трафік на сервері — дані можуть запізнюватися; повторюю…");
  connBadge.classList.remove("hidden");
}

let standalone = false;
async function connect() {
  const savedApi = localStorage.getItem("straznik_api");
  if (savedApi && !validBackendUrl(savedApi)) {
    connBadge.textContent = UI.t("Serwer zablokowany — wymagany HTTPS. Otwórz ustawienia.", "Server blocked — HTTPS required. Open settings.", "Сервер заблоковано — потрібен HTTPS. Відкрийте налаштування.");
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
  connBadge.textContent = UI.t("łączenie…", "connecting…", "з’єднання…"); connBadge.classList.remove("hidden");
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (await probeBackend(base)) return startPolling();
    if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 1500));
  }
  console.warn("Strażnik: serwer niedostępny po kilku próbach — tryb wbudowany (standalone).");
  startStandalone();
}

function startStandalone() {
  // WBUDOWANY silnik: telefon/przeglądarka sam pobiera dane i liczy fuzję (engine.js).
  standalone = true;
  // Audyt C2: tryb awaryjny musi być widoczny — bez serwera nie ma pushy FCM,
  // a silnik powiadamia tylko przy otwartej aplikacji. Wcześniej znacznik znikał.
  connBadge.textContent = UI.t("tryb awaryjny — serwer niedostępny, bez alarmów przy zamkniętej aplikacji", "emergency mode — server unavailable, no alerts while the app is closed", "аварійний режим — сервер недоступний, без тривог при закритому застосунку");
  setTimeout(() => powiedz(a11yInfo, connBadge.textContent), 0);
  connBadge.style.cursor = "pointer";
  connBadge.onclick = () => showSources();
  connBadge.classList.remove("hidden");
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
  connBadge.textContent = UI.t("łączenie…", "connecting…", "з’єднання…");
  connBadge.classList.remove("hidden");
  startPolling();      // natychmiast pokaż stan z serwera
}

/* Lekki ping serwera do odzysku ze standalone: sam sprawdza dostępność
   (bez applyState — silnik wbudowany trzyma stan, dopóki użytkownik nie połączy). */
async function pingBackend(base) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base + "/api/health", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

/* jednorazowa sonda serwera z limitem czasu; przy sukcesie od razu pokazuje stan */
async function probeBackend(base) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base + "/api/state", { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (r.ok) {
      const d = await r.json();
      // pełny stan ma obie części — bierzemy z niego świeże `adsb`/`health`,
      // żeby późniejsze scalanie nie podłożyło starszych; odcisk zerujemy,
      // więc pierwszy tick części głównej dobierze aktualną wersję
      if (d && d.adsb) { auxDane = { adsb: d.adsb, health: d.health }; auxWersja = null; }
      applyState(d);
      return true;
    }
  } catch {}
  return false;
}

/* Odpytywanie: jedno zapytanie naraz, odstęp zależny od sytuacji. Zwrot 304 znaczy
   „nic nowego" i kosztuje kilkaset bajtów; 503 to prośba serwera o przerwę. */
function pollDelay() {
  if (pollBusyFlag) return POLL_BUSY_MS;
  const voivs = state?.fusion?.voivodeships || {};
  const mine = myVoiv();
  const alarm = (mine && voivs[mine]?.alert_level && voivs[mine].alert_level !== "none")
    || Object.values(voivs).some(v => v.alert_level === "high");
  if (alarm) return POLL_ALARM_MS;
  // cokolwiek podniesionego gdziekolwiek w Polsce = zostajemy przy dotychczasowym
  // tempie; zwalniamy wyłącznie, gdy cały kraj jest spokojny
  const cos = Object.values(voivs).some(v => v.alert_level && v.alert_level !== "none");
  return cos ? POLL_ACTIVE_MS : POLL_CALM_MS;
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  if (standalone) return;
  pollTimer = setTimeout(pollState, delay ?? pollDelay());
}

async function pollState() {
  if (standalone || pollInFlight) return;
  const base = apiBase(); if (!base) return;
  // W tle system i tak zamraża stronę; po powrocie pytamy od razu (visibilitychange).
  if (document.hidden) return schedulePoll(POLL_CALM_MS);
  pollInFlight = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    // Wersję stanu (`fusion.ts`) niesiemy w adresie, a nie w nagłówku warunkowym:
    // w aplikacji zapytania idą przez warstwę natywną Capacitora, która gubi
    // semantykę „304" — 20.09.2026 migał wtedy komunikat o braku połączenia, choć
    // dane płynęły. Serwer odpowiada wtedy dwudziestoma bajtami „nic nowego",
    // a Cloudflare trzyma tę odpowiedź na brzegu pod kluczem z wersją.
    // no-store: Cloudflare nadpisywał max-age=2 na 4 h i przeglądarka podawała stan
    // sprzed kilkunastu minut — obiekty skakały (15.09.2026).
    // Dwie drogi do tej samej odpowiedzi „nic nowego", bo każda działa gdzie indziej:
    // parametr v rozumie nasz serwer (i Cloudflare, gdy klucz cache obejmuje parametry),
    // a nagłówek If-None-Match obsługuje sam brzeg Cloudflare, oddając 304 bez pytania nas.
    // Kolejność parametrów jest stała (`part`, potem `v`), bo Cloudflare traktuje
    // każdy inny zapis adresu jako osobny wpis w pamięci brzegu.
    const adres = base + "/api/state?part=main"
      + (pollVer ? "&v=" + encodeURIComponent(pollVer) : "");
    const r = await fetch(adres, {
      cache: "no-store", signal: ctrl.signal,
      headers: pollEtag ? { "If-None-Match": pollEtag } : undefined,
    });
    clearTimeout(timer);
    if (r.status === 503) {                    // serwer zrzuca ruch (load_guard)
      pollBusyFlag = true;
      showBusyPolling();
    } else if (r.status === 304) {             // brzeg Cloudflare: nic nowego
      pollOk();
    } else if (r.ok) {
      const dane = await r.json();
      pollOk();
      if (!dane?.unchanged) {                  // nowa wersja części głównej
        pollVer = dane?.fusion?.ts || null;
        try { pollEtag = r.headers?.get?.("ETag") || null; } catch { pollEtag = null; }
        ostatniaGlowna = dane;
        applyState(zlozStan(dane));
        if (typeof dane.aux_v === "string" && dane.aux_v && dane.aux_v !== auxWersja)
          pobierzAux(dane.aux_v);
      }
    } else {
      throw new Error("HTTP " + r.status);
    }
  } catch {
    // Próg musi być wielokrotnością bieżącego odstępu, nie stałą: przy pytaniu
    // co 15 s pojedyncza nieudana próba przekroczyłaby 12 s i baner „brak
    // połączenia" wyskakiwałby po jednym zgubionym pakiecie.
    if (Date.now() - pollLastOk > Math.max(POLL_LOST_MS, 2.5 * pollDelay())) showConnLost();
  } finally {
    pollInFlight = false;
    schedulePoll();
  }
}

function pollOk() {
  pollLastOk = Date.now();
  if (pollBusyFlag) { pollBusyFlag = false; }
  clearConnLostTimer();
  connBadge.classList.add("hidden");
  document.body.classList.remove("dane-stare");
}

/* Start odpytywania: pierwsze pytanie natychmiast, żeby mapa była od razu. */
function startPolling() {
  pollLastOk = Date.now();
  pollVer = null; pollEtag = null;
  pollState();
}

/* Wymuszone pobranie pełnego stanu (powrót aplikacji na wierzch, powrót z trybu
   wbudowanego) — bez wersji, więc serwer nie odpowie „nic nowego". */
function pollOnce() { pollVer = null; pollEtag = null; return pollState(); }

/* Komunikat administracyjny z serwera (np. zapowiedź okna testowego). Apka tylko
   GO WYŚWIETLA — żadnych danych zwrotnych (bez telemetrii). Zamknięcie zapamiętujemy
   po id, żeby nie wracał i nie „utknął". */
function showNotice(n) {
  const el = document.getElementById("notice-banner");
  if (!el) return;
  if (!n || !n.id || localStorage.getItem("notice_seen_" + n.id)) {
    el.classList.add("hidden"); return;
  }
  el.innerHTML = `<span><span aria-hidden="true">ℹ️ </span>${esc(n.text)}</span><button class="chip" id="notice-ok">${UI.t("Rozumiem", "Got it", "Зрозуміло")}</button>`;
  el.classList.remove("hidden");
  document.getElementById("notice-ok").onclick = () => {
    localStorage.setItem("notice_seen_" + n.id, "1");
    el.classList.add("hidden");
  };
}

/* ── Stan alarmu dla modułu GROTA (19.09.2026) ────────────────────────────────
   GROTA pokazuje drogę do schronienia i musi wiedzieć dwie rzeczy: ile zostało
   czasu i czy poziom opiera się na czymś twardym. Zamiast dawać jej surowe
   sygnały do własnych obliczeń, podajemy gotowe wartości — policzone dokładnie
   tak, jak liczy je interfejs Strażnika. Dwa ekrany tej samej aplikacji nie mogą
   pokazywać różnych czasów.

   `etaVoivMin` — minimum z sygnałów PO `agedEta` (odjęty wiek, null powyżej 15 min)
   i BEZ kursów domniemanych (audyt G3: czas liczony w stronę przypuszczalnego celu,
   a nie faktycznego ruchu). Gdy nie ma czego podać, jest `null` — GROTA mówi wtedy
   wprost, że nie zna czasu, zamiast zgadywać z odległości.

   `hard` — czy poziom UTRZYMAŁBY SIĘ bez źródeł miękkich, czyli czy suma punktów
   z klas twardych (`rcb` = oficjalny alert RCB/RSO dla Polski, `neptun` = obiekt
   w powietrzu) sama sięga progu tego poziomu. Media mają dziś limit klasy 1,0 pkt
   i nie podniosą poziomu same, a wszystkie sześć czerwonych w dzienniku od 15.09
   miało alert RCB — ale to bezpiecznik na przyszłe zmiany wag, nie opis dzisiaj.
   `ua_alert` celowo jest MIĘKKIE: alarm w obwodzie ukraińskim jest oficjalny, ale
   mówi o zagrożeniu nad Ukrainą. Zanim powiemy komuś „idź do schronu", chcemy
   czegoś mierzalnego nad Polską. Przy `hard: false` GROTA pokazuje mapę i kierunki,
   ale nie wzywa do schronienia. */
const HARD_SOURCES = new Set(["rcb", "neptun"]);
let _alertPayload = "";

function buildAlertContract() {
  const mine = myVoiv();
  const st = mine ? state?.fusion?.voivodeships?.[mine] : null;
  if (!st) return null;
  const level = st.alert_level || st.level || "none";
  const sigs = st.signals || [];
  let etaVoivMin = null, etaBorderMin = null, hardSum = 0;
  for (const s of sigs) {
    const d = s.details || {};
    if (HARD_SOURCES.has(s.source)) hardSum += s.counted_points ?? 0;
    if (d.course === "presumptive") continue;        // kurs domniemany — bez czasu
    const v = agedEta(d.eta_voiv_min ? d.eta_voiv_min[mine] : null, s.ts);
    const b = agedEta(d.eta_border_min, s.ts);
    if (v != null) etaVoivMin = etaVoivMin == null ? v : Math.min(etaVoivMin, v);
    if (b != null) etaBorderMin = etaBorderMin == null ? b : Math.min(etaBorderMin, b);
  }
  const prog = level === "high" ? (state?.fusion?.thresholds?.high ?? 4)
             : level === "elevated" ? (state?.fusion?.thresholds?.elevated ?? 2) : 0;
  return { level, voiv: mine, etaVoivMin, etaBorderMin,
           // Czerwony ma od 23.09.2026 twardy klucz (Alert RCB „znajdź bezpieczne miejsce"
           // albo obiekt ≤15 min od granicy), więc dla „high" pytamy wprost o niego.
           hard: level === "high" ? !!st.red_key
                                  : (level !== "none" && hardSum >= prog - 1e-9),
           ts: state?.fusion?.ts || new Date().toISOString() };
}

/* Publikujemy przy każdej zmianie stanu; zdarzenie leci tylko, gdy coś naprawdę
   się zmieniło, żeby moduł nie przeliczał progów przy każdej ramce. */
function publishAlertContract() {
  const next = buildAlertContract();
  window.straznikAlert = next;
  const odcisk = JSON.stringify(next);
  if (odcisk === _alertPayload) return;
  _alertPayload = odcisk;
  window.dispatchEvent(new CustomEvent("straznik:alert", { detail: next }));
}

/* Wyłącznik GROTY z serwera (data/wylaczniki.json). Tylko stan z serwera go zmienia —
   tryb awaryjny liczy stan sam i nie ma tego pola, więc zostaje ostatnia znana
   wartość z pamięci telefonu. Brak pola = włączona. */
function grotaWylaczona() {
  try { return localStorage.getItem("straznik_grota_off") === "1"; } catch { return false; }
}
function applySwitches(w) {
  if (!w || typeof w !== "object") return;
  const off = w.grota === false;
  try { off ? localStorage.setItem("straznik_grota_off", "1") : localStorage.removeItem("straznik_grota_off"); } catch {}
  document.documentElement.classList.toggle("grota-off", off);
  if (off && window.Grota?.widoczny) ukryjGrote();
}

/* Nazwę klasy obiektu sprowadzamy do małych liter RAZ, przy wejściu danych —
   zanim cokolwiek jej użyje. Backend robi `.lower()` wszędzie; front czytał
   `t.type` wprost w kilkunastu miejscach: TYPE_META (etykieta, kolor, ikona),
   porównania z „mig31k" i „cruise", a przede wszystkim FAST_TYPES, od którego
   zależy PROMIEŃ NIEPEWNOŚCI. Dziś NEPTUN podaje `uav` / `fpv` / `kab` małymi
   literami (sprawdzone na żywym API), więc wszystko działa. Gdyby zmienił zapis
   na „UAV", szybki obiekt dostałby mniejszy okrąg niepewności, a ikona spadłaby
   do „obiekt powietrzny" — i nic by o tym nie powiedziało, bo nic by się nie
   wywaliło. Jedno miejsce zamiast kilkunastu odczytów do pilnowania. */
function normalizujTypy(lista) {
  for (const t of lista || [])
    if (t && typeof t.type === "string") t.type = t.type.toLowerCase();
  return lista;
}

function applyState(s) {
  normalizujTypy(s?.neptun?.threats);
  state = s;
  showNotice(s?.notice);
  applySwitches(s?.wylaczniki);
  threatsReceivedAt = Date.now();
  if (!standalone) srvRecord(s);   // nagrywaj żywy feed do bufora historii (RAM)
  recordTrails(s?.neptun?.threats || []);
  refreshCountedTracks();
  renderLeds();
  updateAlarmMood();          // alarmy działają także w trybie przeglądania
  odswiezOpisSytuacji();      // czytnik ekranu: stan NA ŻYWO, także w historii
  publishAlertContract();     // stan alarmu dla modułu GROTA — także w historii
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

/* Obraz ma 64 px, a sylwetka tę samą skalę co dawniej w 48 px: zapas mieści
   czerwony grot kursu przed dziobem BpSP. */
function makeThreatImage(type, color, headingUnknown = false) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  x.translate(32, 32);
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
      /* BpSP (13.09.2026): proste skrzydła, wcięty ogon i czerwony dziób, a przed
         nim czerwony grot. Dawny symetryczny krzyżyk przy małym przybliżeniu nie
         mówił, gdzie jest przód. Skrzydło nie jest deltą — to znak Shaheda. */
      path(BPSP_BODY);
      if (headingUnknown) break;           // bez kursu: bez czerwonego dzioba i grotu
      x.shadowBlur = 0; x.fillStyle = BPSP_RED; x.strokeStyle = BPSP_RED; x.lineWidth = 1.5;
      path([[0,-30],[4.5,-15],[-4.5,-15]]);
      x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 1.2;
      path([[0,-44],[8,-34],[0,-37],[-8,-34]]);
      break;
  }
  if (headingUnknown) {
    /* Kurs nieznany — jednakowo dla każdego typu: sylwetka bez obrotu, przerywana
       obwódka i znak zapytania. Dawniej obiekt bez kursu był obracany dziobem na
       północ, jakby tam leciał. */
    x.shadowBlur = 0; x.setLineDash([5, 4]); x.lineWidth = 2;
    x.strokeStyle = "rgba(255,255,255,.85)";
    x.beginPath(); x.arc(0, 0, 38, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
    x.font = "bold 22px system-ui"; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,.9)"; x.strokeText("?", 0, 2);
    x.fillStyle = "#0b0f1a"; x.fillText("?", 0, 2);
  }
  return x.getImageData(0, 0, 64, 64);
}
/* Symetryczne znaki (FPV, obiekt nieznany) nie mają przodu — ich się nie obraca
   i nie dostają wersji „kurs nieznany”. */
const NO_HEADING_TYPES = new Set(["fpv", "unknown"]);
const BPSP_RED = "#ff3b4f";
const BPSP_BODY = [[0,-30],[5,-8],[27,2],[27,7],[5,7],[4,20],[9,27],[0,23],[-9,27],[-4,20],[-5,7],[-27,7],[-27,2],[-5,-8]];
/* Śmigłowiec: tarcza wirnika (okrąg), kabina, długa belka ogonowa ze śmigłem
   ogonowym. Dawny symbol — sam krzyżyk wirnika na kadłubie — po obróceniu
   zgodnie z kursem wyglądał jak skrzydła samolotu (H135M rumuńskiej MAI,
   zgłoszone 13.09.2026). */
function makeHeliImage() {
  const c = document.createElement("canvas"); c.width = c.height = 44;
  const x = c.getContext("2d"); x.translate(22, 20);
  x.strokeStyle = "#39c5ec"; x.fillStyle = "#39c5ec";
  x.shadowColor = "#39c5ec"; x.shadowBlur = 6;
  x.beginPath(); x.ellipse(0, -1, 5, 8, 0, 0, 2 * Math.PI); x.fill();   // kabina, dziób na północ
  x.beginPath(); x.rect(-1.3, 6, 2.6, 13); x.fill();                    // belka ogonowa
  x.lineWidth = 2; x.beginPath(); x.moveTo(-5, 18); x.lineTo(5, 18); x.stroke();  // śmigło ogonowe
  x.lineWidth = 1.6; x.globalAlpha = 0.75;
  x.beginPath(); x.arc(0, -1, 15, 0, 2 * Math.PI); x.stroke();          // tarcza wirnika
  x.globalAlpha = 1; x.lineWidth = 1.8;
  x.beginPath(); x.moveTo(-11, -12); x.lineTo(11, 10); x.moveTo(11, -12); x.lineTo(-11, 10); x.stroke();
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
    canvas.width = canvas.height = 64;
    canvas.getContext("2d").putImageData(makeThreatImage(type, meta.color, el.dataset.headingUnknown === "1"), 0, 0);
    el.textContent = ""; el.appendChild(canvas);   // replaceChildren: Chrome 86
  });
}
renderLegendThreatIcons();

/* Samolot i śmigłowiec w legendzie też z tych samych pikseli co warstwa mapy.
   Wcześniej samolot był kwadracikiem CSS, a śmigłowiec emoji 🚁 — ani jedno,
   ani drugie nie wyglądało jak to, co widać nad Polską. */
function renderLegendAirIcons() {
  const zrodla = { plane: makePlaneImage, heli: makeHeliImage };
  document.querySelectorAll(".lg-air[data-air]").forEach(el => {
    const rysuj = zrodla[el.dataset.air];
    if (!rysuj) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 44;
    canvas.getContext("2d").putImageData(rysuj(), 0, 0);
    el.textContent = ""; el.appendChild(canvas);
  });
}
renderLegendAirIcons();

/* Kolejność stylów: OpenFreeMap (wektor, schemat OpenMapTiles — niesie nazwy
   w wielu językach, więc etykiety da się przełączyć na POLSKIE), potem CARTO,
   na końcu raster. Każdy kolejny to zapas, gdyby poprzedni nie odpowiadał. */
const MAP_STYLES = [
  "https://tiles.openfreemap.org/styles/dark",
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
];

/* Podpis z odległością od granicy pod ikoną (1.7.84). */
const PODPIS_GRANICA_KM = 10;     // do ilu km od granicy pokazujemy odległość
const PODPIS_OD_ZOOMU = 9;        // niżej podpisy zderzają się ze sobą

/* Etykiety mapy zgodne z językiem interfejsu. Kafelki OpenMapTiles niosą
   name:pl/name:en; gdy tłumaczenia brak, zachowujemy nazwę łacińską lub źródłową. */
const OWN_LABEL_LAYERS = new Set(["threats", "threats-age", "threats-dist", "adsb", "adsb-label"]);
function localiseMapLabels() {
  const field = ["coalesce", ["get", UI.t("name:pl", "name:en", "name:uk")],
    ["get", "name:latin"], ["get", "name"]];
  for (const lyr of map.getStyle().layers || []) {
    if (lyr.type !== "symbol" || OWN_LABEL_LAYERS.has(lyr.id)) continue;   // nasze podpisy zostają
    try {
      if (map.getLayoutProperty(lyr.id, "text-field") !== undefined)
        map.setLayoutProperty(lyr.id, "text-field", field);
    } catch {}
  }
}


/* Mapa rysuje się przez WebGL. Bez niego MapLibre rzucał wyjątkiem i zostawał pusty,
   granatowy ekran z działającymi diodami i przyciskami — czytelnik z iPhone'em (21.09.2026)
   miał tak w aplikacji i w Safari. Na iPhonie winny bywa Tryb blokady, który wyłącza
   WebGL w przeglądarce i w aplikacjach. Zamiast pustki mówimy wprost, co zrobić. */
function webglDostepny() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

function ukryjLadowanieMapy() { document.getElementById("mapa-laduje")?.remove(); }
function pokazBrakMapy(blad, niewczytana = false) {
  ukryjLadowanieMapy();
  const box = document.getElementById("map");
  if (!box || document.getElementById("map-niedostepna")) return;
  const ios = IS_IOS || document.documentElement.classList.contains("ua-ios");
  if (niewczytana) return pokazNiewczytanaMape(box, blad);
  const rada = ios
    ? UI.t("Na iPhonie to zwykle <b>Tryb blokady</b> — wyłącza rysowanie map (WebGL) w Safari i w aplikacjach. Ustawienia → Prywatność i ochrona → Tryb blokady → Konfiguruj przeglądanie → wyklucz Strażnika (a w Safari także straznik.eu). Jeśli Tryb blokady jest wyłączony, sprawdź Ustawienia → Aplikacje → Safari → Zaawansowane → Flagi funkcji → WebGL.",
           "On iPhone this is usually <b>Lockdown Mode</b>, which switches off map drawing (WebGL) in Safari and in apps. Settings → Privacy &amp; Security → Lockdown Mode → Configure Web Browsing → exclude Strażnik (and straznik.eu in Safari). If Lockdown Mode is off, check Settings → Apps → Safari → Advanced → Feature Flags → WebGL.",
           "На iPhone це зазвичай <b>Режим блокування</b> — він вимикає малювання мап (WebGL) у Safari і в застосунках. Параметри → Приватність і безпека → Режим блокування → Налаштувати перегляд вебсторінок → виключіть Strażnik (а в Safari також straznik.eu). Якщо Режим блокування вимкнено, перевірте Параметри → Програми → Safari → Додатково → Прапорці функцій → WebGL.")
    : (UI.t("Włącz przyspieszenie sprzętowe w ustawieniach przeglądarki, zaktualizuj ją albo spróbuj innej.", "Turn on hardware acceleration in the browser settings, update the browser, or try another one.", "Увімкніть апаратне прискорення в налаштуваннях браузера, оновіть його або спробуйте інший."));
  const d = document.createElement("div");
  d.id = "map-niedostepna";
  d.setAttribute("role", "alert");
  // prawy margines na kafelki „mój region / strefy / cała PL”, dolny na pasek i zakładki
  d.className = "mapa-blad";   // karta, nie goły tekst na mapie (style.css)
  d.innerHTML = `<div class="mapa-blad-karta"><p><b>${UI.t("Na tym urządzeniu nie da się narysować mapy", "The map cannot be drawn on this device", "На цьому пристрої не вдається намалювати мапу")}</b></p><p>${UI.t("Alarmy, panel sygnałów i historia działają — brakuje tylko mapy, bo system blokuje WebGL.", "Alerts, the signals panel and history still work — only the map is missing, because the system blocks WebGL.", "Тривоги, панель сигналів та історія працюють — бракує лише мапи, бо система блокує WebGL.")}</p><p class="muted">${rada}</p></div>`;
  box.appendChild(d);
  if (blad) console.warn("Mapa niedostępna:", blad);
}

/* Mapa, która się nie wczytała (22.09.2026): czytelnik z iPhone'em miał pustą mapę
   w aplikacji i w Safari mimo WebGL i wyłączonego Trybu blokady. Województwa rysujemy
   dopiero po wczytaniu stylu mapy, więc gdy styl albo kafelki są blokowane (bloker
   treści, filtr DNS, VPN) — nie ma nic. Po 20 s bez wczytania mówimy to wprost i
   pokazujemy techniczny powód do zrzutu ekranu. */
function pokazNiewczytanaMape(box, blad) {
  const d = document.createElement("div");
  d.id = "map-niedostepna";
  d.setAttribute("role", "alert");
  d.className = "mapa-blad";   // karta, nie goły tekst na mapie (style.css)
  const tech = String(blad || "brak odpowiedzi").slice(0, 300);
  d.innerHTML = `<div class="mapa-blad-karta"><p><b>${UI.t("Mapa się nie wczytała", "The map did not load", "Мапа не завантажилася")}</b></p><p>${UI.t("Alarmy, panel sygnałów i historia działają. Kafelki mapy pochodzą z zewnętrznego serwera map — coś na tym urządzeniu albo w sieci je blokuje.", "Alerts, the signals panel and history still work. The map tiles come from an outside map server — something on this device or network is blocking them.", "Тривоги, панель сигналів та історія працюють. Плитки мапи надходять із зовнішнього сервера мап — щось на цьому пристрої або в мережі їх блокує.")}</p><p class="muted">${UI.t("Najczęściej: bloker treści lub reklam, filtr DNS (AdGuard, NextDNS), VPN albo Prywatny przekaźnik iCloud. Spróbuj na chwilę go wyłączyć albo przełączyć się między Wi-Fi a danymi komórkowymi.", "Most often: a content or ad blocker, a DNS filter (AdGuard, NextDNS), a VPN or iCloud Private Relay. Try turning it off for a moment, or switch between Wi-Fi and mobile data.", "Найчастіше: блокувальник вмісту чи реклами, DNS-фільтр (AdGuard, NextDNS), VPN або Приватний вузол iCloud. Спробуйте на хвилину його вимкнути або перемкнутися між Wi-Fi і мобільними даними.")}</p><p class="muted" style="font-size:0.8rem">${UI.t("Szczegół techniczny", "Technical detail", "Технічна деталь")}: ${esc(tech)}</p></div>`;
  box.appendChild(d);
}

async function initMap() {
  if (!webglDostepny()) { pokazBrakMapy(); return; }
  let style = FALLBACK_STYLE;
  for (const url of MAP_STYLES) {
    try { const r = await fetch(url, { method: "HEAD" }); if (r.ok) { style = url; break; } }
    catch {}
  }

  try {
    map = new maplibregl.Map({
      container: "map", style,
      bounds: FIT_BOUNDS, fitBoundsOptions: { padding: FIT_PAD }, pitch: is3d ? 45 : 0, bearing: is3d ? -8 : 0,
      antialias: true, attributionControl: false, maxPitch: 70,
    });
  } catch (e) {
    // WebGL bywa zgłaszany jako dostępny, a kontekst i tak się nie tworzy (np. zablokowany GPU)
    pokazBrakMapy(e); return;
  }
  const bledyMapy = [];
  map.on("error", (e) => {
    const m = e?.error?.message || e?.error?.status || e?.error || "błąd";
    if (bledyMapy.length < 4 && !bledyMapy.includes(String(m))) bledyMapy.push(String(m));
  });
  setTimeout(() => {
    if (!mapReady) pokazBrakMapy(`styl: ${typeof style === "string" ? style.replace(/^https?:\/\//, "") : "zapasowy"}`
      + (bledyMapy.length ? " · " + bledyMapy.join(" · ") : " · brak odpowiedzi"), true);
  }, 20000);
  // Zmiana rozmiaru okna w trakcie tworzenia mapy (obrót, podzielony ekran, składany
  // telefon) zostawiała płótno w starym rozmiarze — na tablecie mapa była czarna poza
  // paskiem u góry. MapLibre słucha tylko zdarzenia resize okna, więc pilnujemy kontenera.
  if (window.ResizeObserver) new ResizeObserver(() => map.resize()).observe(map.getContainer());

  map.on("load", async () => {
    ukryjLadowanieMapy();
    localiseMapLabels();
    // Granice państw: natywne linie stylu bazowego plus kontrastowe wypełnienia
    // krajów (kraje-fill). Białe obrysy z 1.7.41–1.7.42 wycofane 13.09.2026, bo
    // przy pochylonej mapie znikały odcinki granic.
    for (const [t, m] of Object.entries(TYPE_META)) map.addImage("dart-" + t, makeThreatImage(t, m.color));
    for (const [t, m] of Object.entries(TYPE_META))
      if (!NO_HEADING_TYPES.has(t)) map.addImage("dart-" + t + "-unk", makeThreatImage(t, m.color, true));
    map.addImage("plane", makePlaneImage());
    map.addImage("heli", makeHeliImage());

    // Sąsiednie kraje mają wyraźnie różne barwy: granicę widać jako styk kolorów,
    // bez osobnej linii. Linie przy pochylonej mapie traciły odcinki pod bryłami
    // 3D (1.7.42), a wypełnienie leży płasko pod nimi i nie ma tego problemu.
    // Barwy stonowane, żeby nie konkurowały z żółtym i czerwonym alarmu.
    const COUNTRY_COLORS = {
      UKR: "#7a6230", BLR: "#7a3340", RUS: "#503a5e",
      LTU: "#2f7048", LVA: "#2d5f80", EST: "#7a6d34",
      SVK: "#3f7040", CZE: "#7a5234", DEU: "#48566a",
      HUN: "#624080", ROU: "#2d6e70", MDA: "#8a4d62", SWE: "#3d5c52",
    };
    // kraje-v2.geojson: Natural Earth admin-1, kraje ze wspólnymi krawędziami
    // (bez nakładek i szczelin), Krym w granicach Ukrainy. Wersja jest w NAZWIE
    // pliku: Cloudflare przy .geojson pomija ?v= (14.09.2026 nowy plik doszedł
    // dopiero po wygaśnięciu wpisu), więc przy zmianie danych → nowa nazwa.
    const kraje = await (await fetch("assets/kraje-v2.geojson?v=1.7.82")).json();
    /* Szwecja doszła 03.10.2026, razem z obserwacją sąsiadów. Nie wydajemy
       z tego powodu całego pliku pod nową nazwą (307 kB, a Cloudflare przy
       .geojson rozstrzyga po nazwie), tylko dokładamy 9 kB z jej konturem.
       Nieudane pobranie = mapa bez Szwecji, nic więcej się nie psuje. */
    try {
      const se = await (await fetch("assets/kraje-se-v1.geojson")).json();
      if (se?.features?.length) kraje.features = kraje.features.concat(se.features);
    } catch (err) { console.warn("kontur Szwecji niedostępny", err); }
    map.addSource("kraje", { type: "geojson", data: kraje, promoteId: "iso" });
    // Android WebView wyświetla ciemną mapę bardziej płasko niż przeglądarka
    // desktopowa, więc w aplikacji krycie jest trochę wyższe.
    const countryOpacity = IS_APP
      ? ["interpolate", ["linear"], ["zoom"], 3, 0.46, 6, 0.52, 9, 0.55]
      : ["interpolate", ["linear"], ["zoom"], 3, 0.42, 6, 0.48, 9, 0.50];
    map.addLayer({ id: "kraje-fill", type: "fill", source: "kraje",
      paint: { "fill-color": ["match", ["get", "iso"],
          ...Object.entries(COUNTRY_COLORS).flat(), "#333"],
        "fill-opacity": countryOpacity } });
    // Zdarzenie powietrzne u sąsiada z mediów: LT/LV/EE punktują ułamkami,
    // MD/RO/SK/CZ/SE/HU od 03.10.2026 na razie bez punktów (tryb cienia).
    map.addLayer({ id: "kraje-alert", type: "fill", source: "kraje",
      paint: { "fill-color": "#ff4d5e",
        "fill-opacity": ["case", ["boolean", ["feature-state", "alert"], false], 0.22, 0] } });
    map.addLayer({ id: "kraje-alert-line", type: "line", source: "kraje",
      paint: { "line-color": "#ff4d5e", "line-width": 1.2, "line-dasharray": [2, 2],
        "line-opacity": ["case", ["boolean", ["feature-state", "alert"], false], 0.7, 0] } });
    map.on("click", "kraje-alert", (e) => {
      const hit = map.queryRenderedFeatures(e.point,
        { layers: ["threats", "threats-glow", "adsb", "strefy-hit"].filter(l => map.getLayer(l)) });
      if (hit.length) return;   // obiekt albo strefa w tym kraju ma pierwszeństwo
      const iso = e.features?.[0]?.properties?.iso;
      if (countryAlerts.has(iso)) openCountryAlert(countryAlerts.get(iso));
    });
    /* Kontury krajów rysuje już styl bazowy (warstwy boundary). Własnej linii
       NIE dokładamy: wzdłuż granicy PL biegłaby obok linii województw i dawała
       efekt „podwójnego konturu". Zostaje samo wypełnienie (odcień kraju). */

    /* POLSKA: jeden spójny kształt scalony z 16 województw (assets/polska.geojson),
       więc jej granica idealnie pokrywa się z warstwami wojewódzkimi — koniec
       rozjazdu z zgrubnymi poligonami sąsiadów. Delikatny błękit + jeden czysty
       kontur = kraj czytelnie wyróżniony bez krzykliwości. */
    const pl = await (await fetch("assets/polska.geojson?v=1.7.82")).json();
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

    const gj = await (await fetch("assets/wojewodztwa.geojson?v=1.7.82")).json();
    voivGeo = gj;
    map.addSource("voiv", { type: "geojson", data: gj, promoteId: "nazwa" });

    map.addLayer({
      id: "voiv-extrude", type: "fill-extrusion", source: "voiv",
      paint: {
        // Kolor z samych przeniesień jest przygaszony i niższy: to kontekst
        // sąsiedztwa, nie alarm w tym województwie.
        "fill-extrusion-color": ["case", ["boolean", ["feature-state", "spill"], false],
          ["match", ["coalesce", ["feature-state", "level"], "none"],
            "high", "#7d4f59", "elevated", "#7c6a45", "#233252"],
          ["match", ["coalesce", ["feature-state", "level"], "none"],
            "high", "#ff4d5e", "elevated", "#ffb020", "#233252"]],
        "fill-extrusion-height": ["*", ["coalesce", ["feature-state", "score"], 0],
          ["case", ["boolean", ["feature-state", "spill"], false], 7000, 16000]],
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

    /* ── strefy PAŻP: WYŁĄCZNIE informacyjnie ────────────────────────────────
       Nie dokładają punktów i nie wywołują alarmu. Pokazujemy je, bo bez tego
       zamknięcie kawałka nieba przez wojsko było w aplikacji niewidoczne — a to
       najbardziej namacalny ślad realnej reakcji na zagrożenie.
       Bryła strefy stoi na SWOIM pułapie (GND–F095 to ok. 0–2,9 km), więc tonie
       w bryle województwa (skala punktów · 16 km). Dlatego kontur i warstwa
       dotyku idą OSOBNO, nad bryłami — inaczej strefy nie dałoby się ani
       zobaczyć, ani kliknąć. */
    map.addSource("strefy", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "strefy-3d", type: "fill-extrusion", source: "strefy",
      filter: ["!", ZONE_QUIET],
      paint: { "fill-extrusion-color": ZONE_COLOR,
        "fill-extrusion-base": ["get", "baseM"], "fill-extrusion-height": ["get", "topM"],
        "fill-extrusion-opacity": 0.34 } });

    /* Obwody UA z alarmem powietrznym, który liczy się do punktów. Płaskie,
       bardzo przezroczyste wypełnienie w odcieniu różu i przerywany kontur —
       województwa są wypukłe (3D) i żółte/czerwone, strefy PAŻP liliowe, więc
       obwód nie zlewa się z Polską. Granice z geoBoundaries (OpenStreetMap), czyli
       z tego samego źródła co podkład i odległości w punktacji. Stan przez
       feature-state: 1 MB geometrii ładujemy raz, a nie przy każdej zmianie. */
    /* Alarmy w całej Ukrainie co do rejonu (NEPTUN) — TYLKO do obserwacji, bez punktów
       (decyzja usera 15.09.2026). Pod warstwą obwodów punktowanych, żeby ich różowy
       obrys był na wierzchu. Kraje bałtyckie podświetlamy przez feature-state „kraje”. */
    try {
      // Źródło powstaje PUSTE, na swoim miejscu w kolejności warstw. Geometrię
      // (156 KB po gzipie) dociąga wczytajGeoUA() dopiero przy pierwszym alarmie
      // — patrz komentarz przy uaGeo. Dzięki temu kolejność warstw jest ustalona
      // raz, przy starcie, i nic nie może wylądować nad Polską.
      map.addSource("rejony", { type: "geojson", data: emptyFC(), promoteId: "k" });
      const lvl = ["coalesce", ["feature-state", "alert"], ""];
      const col = ["match", lvl, "red", "#ff4d5e", "#ffb020"];
      map.addLayer({ id: "rejony-alert-fill", type: "fill", source: "rejony",
        paint: { "fill-color": col,
          "fill-opacity": ["match", lvl, "red", 0.2, "yellow", 0.16, 0] } });
      map.addLayer({ id: "rejony-alert-line", type: "line", source: "rejony",
        paint: { "line-color": col, "line-width": 0.8,
          "line-opacity": ["match", lvl, "red", 0.45, "yellow", 0.4, 0] } });
      map.on("click", "rejony-alert-fill", (e) => {
        const hit = map.queryRenderedFeatures(e.point,
          { layers: ["threats", "threats-glow", "adsb", "obwody-fill"].filter(l => map.getLayer(l)) })
          // obwody-fill ma geometrię zawsze — ustępujemy tylko obwodowi z punktowanym alarmem
          .filter(f => f.layer.id !== "obwody-fill" || oblastInfo.has(f.properties?.oblast));
        if (hit.length) return;
        const k = e.features?.[0]?.properties?.k;
        if (k && raionAlertInfo.has(k)) openRaionAlert(raionAlertInfo.get(k), e.lngLat);
      });
      paintRaionAlerts(histMode ? [] : state?.neptun?.alert_areas);
    } catch (err) { console.warn("rejony UA", err); }
    try {
      map.addSource("obwody", { type: "geojson", data: emptyFC(), promoteId: "oblast" });
      const on = ["boolean", ["feature-state", "active"], false];
      const w = ["coalesce", ["feature-state", "w"], 0];
      map.addLayer({ id: "obwody-fill", type: "fill", source: "obwody",
        paint: { "fill-color": OBLAST_COLOR,
          "fill-opacity": ["case", on, ["+", 0.04, ["*", 0.08, w]], 0] } });
      map.addLayer({ id: "obwody-line", type: "line", source: "obwody",
        paint: { "line-color": OBLAST_COLOR, "line-width": 1.4, "line-dasharray": [3, 2],
          "line-opacity": ["case", on, ["+", 0.35, ["*", 0.4, w]], 0] } });
      map.on("click", "obwody-fill", (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["threats", "threats-glow", "adsb"] });
        if (hit.length) return;
        const p = e.features?.[0]?.properties;
        if (p && oblastInfo.has(p.oblast)) openOblastCard(p);
      });
    } catch (err) { console.warn("obwody UA", err); }

    map.addSource("trails", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "trails", type: "line", source: "trails",
      paint: { "line-color": ["get", "color"], "line-width": 2.2, "line-opacity": 0.8,
               "line-dasharray": [1.5, 1.2] } });

    // kierunek lotu (opcja w ustawieniach): linia i kropki co 5 min
    map.addSource("course", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "course-line", type: "line", source: "course",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.8 } });
    map.addLayer({ id: "course-ticks", type: "circle", source: "course",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 2.6, "circle-color": ["get", "color"],
               "circle-stroke-color": "#0b0f18", "circle-stroke-width": 1 } });

    map.addSource("uncertainty", { type: "geojson", data: emptyFC() });
    // Sam kontur, bez wypełnienia. Przyciemniona plama ±4 km kładła się na
    // polskich wsiach po drugiej stronie granicy (Dorohusk, Turka, Istrów) i
    // ludzie czytali ją jako „zagrożenie jest nad nami". Przerywana linia mówi
    // to samo — „gdzieś w tym kole" — a niczego nie zasłania.
    map.addLayer({ id: "uncertainty-line", type: "line", source: "uncertainty",
      paint: { "line-color": ["get", "color"], "line-opacity": 0.85,
               "line-width": 1.6, "line-dasharray": [3, 3] } });

    map.addSource("threats", { type: "geojson", data: emptyFC() });
    // poświata pod ikoną = większy, czytelny obszar kliknięcia
    map.addLayer({ id: "threats-glow", type: "circle", source: "threats",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 18],
        "circle-color": ["get", "color"],
        // coalesce: migawka bez wieku dawała null → wyrażenie się wywracało,
        // a MapLibre rysowało domyślną pełną krycie (żółty krążek zamiast poświaty)
        "circle-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.07,
          ["interpolate", ["linear"], ["coalesce", ["get", "age_min"], 0], 10, 0.16, 60, 0.06]],
        "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.45,
        "circle-stroke-width": 1 } });
    /* Puls: tylko obiekty, które w tej chwili wnoszą punkty do któregoś
       województwa (counted_points > 0 w fuzji). Pozostałe drony stoją spokojnie,
       więc wyróżnione naprawdę się odróżniają. Animację prowadzi pulseLoop. */
    map.addLayer({ id: "threats-pulse", type: "circle", source: "threats",
      filter: ["==", ["get", "counted"], true],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 22],
        "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ff4d5e",
        "circle-stroke-width": 2.5, "circle-stroke-opacity": 0 } });
    /* Zaznaczony obiekt: biały pierścień POD ikoną. Bez tego po dotknięciu
       kilku dronów obok siebie nie było wiadomo, którego dotyczy karta. */
    map.addLayer({ id: "threats-sel", type: "circle", source: "threats",
      filter: ["==", ["get", "tid"], "__none__"],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 15, 8, 26],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5,
        "circle-stroke-opacity": 0.95 } });
    map.addLayer({ id: "threats", type: "symbol", source: "threats",
      layout: { "icon-image": ["case",
          ["all", ["==", ["get", "hdg_unknown"], true],
                 ["match", ["get", "type"], [...NO_HEADING_TYPES], false, true]],
          ["concat", "dart-", ["get", "type"], "-unk"],
          ["concat", "dart-", ["get", "type"]]],
        // 64 px zamiast 48 — skala zmniejszona tak, żeby sylwetka miała dawny rozmiar
        "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.375, 8, 0.64],
        "icon-rotate": ["case", ["==", ["get", "hdg_unknown"], true], 0, ["get", "heading"]],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true },
      /* Wiek meldunku (17.09.2026): NEPTUN to zgłoszenia ludzi, nie radar — obiekt
         stoi w miejscu, dopóki ktoś go znowu nie zgłosi. Stary meldunek blednie,
         żeby nie wyglądał jak świeża, pewna pozycja. */
      paint: { "icon-opacity": ["case", ["==", ["get", "historicalOnly"], true], 0.48,
        ["interpolate", ["linear"], ["coalesce", ["get", "age_min"], 0], 10, 1, 60, 0.4]] },
    });
    /* Podpis pod ikoną. Dwie rzeczy naraz, bo miejsce jest jedno:
       — wiek meldunku, gdy zrobił się stary (jak dotąd, od 5 minut);
       — ODLEGŁOŚĆ OD GRANICY dla obiektu przygranicznego (nowe w 1.7.84).
       Przy granicy sama ikona nie rozstrzyga, po której stronie jest obiekt:
       ma 30 px, co przy oddaleniu oznacza kilka kilometrów terenu, więc dron
       200 m za Bugiem wygląda jak dron nad Polską. Liczba rozstrzyga to,
       czego rysunek nie potrafi.

       Nachodzenie włączamy tylko dla obiektów bardzo bliskich (≤3 km): tam ta
       informacja jest najważniejsza i nie może przepaść przez kolizję z nazwą
       wsi, a takich obiektów są pojedyncze sztuki. Dalsze ustępują normalnie,
       żeby fala kilkunastu dronów nie zrobiła drabinki z napisów.

       Od zoomu 9 w górę, bo niżej podpisy zderzają się ze sobą i zakrywają
       własne ikony (zmierzone na fali ośmiu obiektów). UWAGA: MapLibre wylicza
       układ symboli na CAŁKOWITYM zoomie kafla, więc próg 9,5 zadziałałby
       dopiero od 10 — dlatego równo 9. */
    const _przyGranicy = ["<=", ["coalesce", ["get", "dist_km"], 9999], PODPIS_GRANICA_KM];
    const _stary = [">=", ["coalesce", ["get", "age_min"], 0], 5];
    const _wiek = ["case", _stary, ["get", "age_label"], ""];
    const _wspolne = {
      "text-size": 11,
      "text-max-width": 30,                  // bez zawijania „od / granicy"
      "text-offset": [0, 1.35], "text-anchor": "top", "text-optional": true,
      "text-font": ["Noto Sans Regular"],
    };
    const _malowanie = { "text-color": "#95a1b7", "text-halo-color": "#0b0f1a",
      "text-halo-width": 1.6,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0, 5, 1] };
    /* Wiek meldunku — jak dotąd. Od zoomu PODPIS_OD_ZOOMU obiekt przygraniczny
       oddaje to miejsce odległości (warstwa niżej), żeby oba podpisy nie
       pisały się jeden na drugim. */
    map.addLayer({ id: "threats-age", type: "symbol", source: "threats",
      filter: _stary,
      layout: { ..._wspolne,
        "text-field": ["step", ["zoom"], _wiek, PODPIS_OD_ZOOMU,
          ["case", _przyGranicy, "", _wiek]] },
      paint: _malowanie });
    /* ODLEGŁOŚĆ OD GRANICY dla obiektu przygranicznego (1.7.84).
       Osobna warstwa, nie gałąź poprzedniej, bo `text-allow-overlap` NIE przyjmuje
       wyrażeń zależnych od danych: MapLibre odrzuca wtedy całą warstwę zdarzeniem
       `error`, bez wyjątku i bez śladu w kodzie (przekonałem się 28.09.2026 —
       podpisy po prostu zniknęły). Tu nachodzenie jest stałą warstwy, więc wolno.

       Nachodzenie włączone, bo przy granicy właśnie ta liczba jest najważniejsza
       i nie może przepaść przez kolizję z nazwą wsi — a tam nazw jest gęsto
       (Berdyszcze, Świerże, Dorohusk). Sama ikona tego nie rozstrzyga: ma 30 px,
       co przy oddaleniu oznacza kilka kilometrów terenu, więc dron 200 m za
       Bugiem wygląda jak dron nad Polską.

       Od zoomu PODPIS_OD_ZOOMU w górę, bo niżej podpisy zderzają się ze sobą
       i zakrywają własne ikony (zmierzone na fali ośmiu obiektów). MapLibre
       wylicza układ symboli na CAŁKOWITYM zoomie kafla, więc próg 9,5
       zadziałałby dopiero od 10 — dlatego równo 9. */
    map.addLayer({ id: "threats-dist", type: "symbol", source: "threats",
      filter: _przyGranicy,
      layout: { ..._wspolne,
        "text-field": ["step", ["zoom"], "", PODPIS_OD_ZOOMU,
          ["concat", ["get", "distance_text"],
            UI.t(" od granicy", " from the border", " від кордону")]],
        "text-allow-overlap": true,
        "text-ignore-placement": true },
      paint: _malowanie });

    // ślad śledzonej maszyny — pod ikonami samolotów, żeby ich nie zasłaniał
    map.addSource("adsb-trail", { type: "geojson", data: emptyFC() });
    map.addSource("adsb-course", { type: "geojson", data: emptyFC() });
    map.addLayer({ id: "adsb-course-line", type: "line", source: "adsb-course",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#39c5ec", "line-width": 1.3, "line-opacity": 0.75 } });
    map.addLayer({ id: "adsb-course-ticks", type: "circle", source: "adsb-course",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 2.3, "circle-color": "#39c5ec",
               "circle-stroke-color": "#0b0f18", "circle-stroke-width": 1 } });
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
        { layers: ["threats", "threats-glow", "adsb", "strefy-hit"] });
      if (hit.length) return;
      const name = e.features?.[0]?.properties?.nazwa;
      if (name) { openCard(name); }
    });

    /* Ciche strefy dostają ledwo widoczną plamę, zeby kształt dało się odczytac
       bez zalewania mapy; świeże aktywacje maja bryłę 3D warstwę wyżej.
       UWAGA: line-dasharray NIE przyjmuje wyrażeń sterowanych danymi (MapLibre
       rzuca błędem i cała warstwa nie powstaje) — różnicujemy samą grubością. */
    map.addLayer({ id: "strefy-tlo", type: "fill", source: "strefy",
      filter: ZONE_QUIET,
      paint: { "fill-color": "#b39ddb", "fill-opacity": 0.07 } });
    map.addLayer({ id: "strefy-line", type: "line", source: "strefy",
      paint: { "line-color": ZONE_COLOR,
        "line-opacity": ["case", ZONE_QUIET, 0.7, 0.95],
        "line-width": ["case", ZONE_QUIET, 1.2, 1.9] } });
    /* Przezroczysta warstwa dotyku: bryła strefy bywa schowana w bryle
       województwa, a w sam kontur (1,5 px) nikt palcem nie trafi. */
    map.addLayer({ id: "strefy-hit", type: "fill", source: "strefy",
      paint: { "fill-color": "#000000", "fill-opacity": 0.001 } });
    /* Strefy nakładają się na siebie, a mała strefa leży często w całości
       wewnątrz dużej (np. nad Warszawą w EPTS550). Pierwsza trafiona była
       zwykle ta duża, więc małej nie dało się otworzyć (zgłoszone 13.09.2026).
       Otwieramy NAJMNIEJSZĄ pod palcem, a pozostałe podajemy w karcie. */
    map.on("click", "strefy-hit", (e) => {
      const hit = map.queryRenderedFeatures(e.point,
        { layers: ["threats", "threats-glow", "adsb"] });
      if (hit.length) return;
      const names = [...new Set((e.features || []).map(f => f.properties?.designator).filter(Boolean))];
      const full = names.map(n => (aktywneStrefy()?.features || []).find(x => x.properties?.designator === n))
        .filter(Boolean).sort((a, b) => zoneArea(a) - zoneArea(b));
      if (!full.length) { openZoneCard(e.features?.[0]?.properties); return; }
      openZoneCard(full[0].properties, full.slice(1).map(f => f.properties.designator));
    });
    map.on("mouseenter", "strefy-hit", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "strefy-hit", () => map.getCanvas().style.cursor = "");

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
    // komunikat „mapa się nie wczytała” mógł wyskoczyć, gdy start trwał dłużej (np. aplikacja w tle)
    document.getElementById("map-niedostepna")?.remove();
    syncZonesButton();
    refreshZones(true);
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

/* ══ strefy PAŻP — warstwa czysto informacyjna ═════════════════════════════
   Świadoma decyzja: strefy NIE wchodzą do punktacji i nie wywołują alarmu.
   Aktywacja strefy jest skutkiem decyzji wojska, a nie niezależnym pomiarem
   zagrożenia — dołożenie jej do sumy podwajałoby to samo zdarzenie. Ale bez
   niej użytkownik nie widział rzeczy najbardziej namacalnej: że właśnie
   zamknięto kawałek nieba nad jego głową. Stąd osobna warstwa i osobna karta. */
/* Strefa „cicha" to taka, której WŁĄCZENIA nie widzieliśmy: albo stoi tu od
   dawna, albo była już aktywna, gdy Strażnik startował. Nad Polską stoi
   codziennie ~30 takich stref (pomiar 12.09.2026) — wypełnione bryłami zalewały
   całą mapę i wyglądały jak alarm w każdym województwie. Dlatego tło dostaje
   sam kontur, a bryłę tylko to, co realnie właśnie włączono. */
const ZONE_QUIET = ["any", ["==", ["get", "standing"], true],
                           ["==", ["get", "atBoot"], true]];
const ZONE_COLOR = ["case", ZONE_QUIET, "#b39ddb", "#ffb020"];
const ZONE_TTL_MS = 4 * 60 * 1000;
let zonesData = null, zonesAt = 0, zonesPending = false;
/* Strefy w historii (10.10.2026). Migawka niesie listę [klucz, since, atBoot],
   a geometria i opis przychodzą raz w paczce (`zone_defs`) albo z żywego
   /api/zones. histZonesData = strefy wybranej chwili; null = z tej chwili nie
   mamy zapisu (migawki sprzed wdrożenia, tryb wbudowany) — wtedy warstwa jest
   ukryta, jak wcześniej, zamiast rysować bieżące strefy nad przeszłością.
   zoneRefMs = „teraz” dla karty strefy („aktywna od 3 godz.”) — w historii
   to chwila z suwaka, nie zegar telefonu. */
let srvZoneDefs = {}, histZonesData = null, zoneRefMs = null;
const aktywneStrefy = () => (histMode ? histZonesData : zonesData);
const ZONE_ZMIENNE = ["since", "atBoot", "standing", "baseM", "topM"];
function zapamietajDefinicjeStref(features) {
  for (const f of features || []) {
    const p = f?.properties;
    if (!p?.key || srvZoneDefs[p.key]) continue;
    const props = {};
    for (const [k, v] of Object.entries(p)) if (!ZONE_ZMIENNE.includes(k)) props[k] = v;
    srvZoneDefs[p.key] = { type: "Feature", geometry: f.geometry, properties: props };
  }
}
/* Migawki nagrane przez stronę ZANIM przyszły strefy (start aplikacji: stan
   z serwera bywa szybszy niż /api/zones) nie miały ich wcale — a to właśnie
   najnowsza chwila, którą w historii ogląda się najczęściej (sprawdzone na
   produkcji 10.10.2026). Uzupełniamy tylko świeże, najwyżej 5 min przed
   odczytem stref: zestaw zmienia się rzadko (raz na dobę o 6:00, a zniknięcie
   strefy serwer i tak trzyma przez karencję). Starszych nie ruszamy — dla nich
   zostaje „brak zapisu”, nie zgadujemy. */
const STREFY_UZUPELNIJ_MS = 5 * 60 * 1000;
function uzupelnijStrefyMigawek(features, odczytMs) {
  const zones = (features || []).filter(f => f.properties?.key)
    .map(f => [f.properties.key, f.properties.since || 0, !!f.properties.atBoot]);
  for (const sn of srvSnaps)
    if (!Array.isArray(sn.zones) && sn.t >= odczytMs - STREFY_UZUPELNIJ_MS && sn.t <= odczytMs)
      sn.zones = zones;
}
/* Warstwa stref dla migawki: null, gdy migawka nie ma pola `zones`. Klucz bez
   definicji pomijamy — lepiej brak jednej strefy niż wymyślony kształt. */
function strefyZMigawki(snap, whenMs) {
  if (!snap || !Array.isArray(snap.zones)) return null;
  const features = [];
  for (const [key, since, atBoot] of snap.zones) {
    const def = srvZoneDefs[key];
    if (!def) continue;
    const p = { ...def.properties, since, atBoot: !!atBoot,
                // jak na serwerze: strefa stojąca dłużej niż dobę to stan, nie zdarzenie
                standing: since > 0 && whenMs / 1000 - since > 24 * 3600 };
    p.baseM = zoneAltM(p.lower);
    p.topM = Math.max(zoneAltM(p.upper), p.baseM + 400);
    features.push({ type: "Feature", geometry: def.geometry, properties: p });
  }
  return { type: "FeatureCollection", features };
}

function zonesOn() {
  try { return localStorage.getItem("straznik_zones") !== "0"; } catch { return true; }
}

/* GND / A020 / F095 → metry. PAŻP podaje pułap tekstem: GND to ziemia,
   A0xx i F0xx to setki stóp (A = nad terenem, F = poziom lotu). */
function zoneAltM(v) {
  const t = String(v == null ? "" : v).trim().toUpperCase();
  if (!t || t === "GND" || t === "SFC") return 0;
  const m = t.match(/^[AF](\d+)$/);
  if (m) return +m[1] * 100 * 0.3048;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n * 0.3048;
}
function zoneAltText(v) {
  const t = String(v == null ? "" : v).trim().toUpperCase();
  if (!t) return "?";
  if (t === "GND" || t === "SFC") return UI.t("ziemia", "ground", "земля");
  const m = zoneAltM(t);
  return m ? `${t} (${(m / 1000).toFixed(1).replace(".", UI.t(",", ".", ","))} km)` : t;
}

async function refreshZones(force) {
  if (zonesPending) return;
  // W historii warstwa pokazuje strefy z migawki (applyZones), więc odpytywanie
  // serwera byłoby ruchem za nic. Po wyjściu exitHistory dociąga świeże.
  if (histMode) { applyZones(); return; }
  if (!force && Date.now() - zonesAt < ZONE_TTL_MS) return;
  syncZonesButton();
  if (!zonesOn()) return;
  const base = apiBase();
  // Tryb wbudowany liczy fuzję na telefonie, ale geometrii stref nie ma skąd
  // wziąć — endpoint jest tylko na serwerze. Warstwa po prostu zostaje pusta.
  if (!base || standalone) return;
  zonesPending = true;
  try {
    const r = await fetch(base + "/api/zones", { signal: timeoutSignal(12000), cache: "no-store" });
    if (!r.ok) throw new Error("zones unavailable");
    const j = await r.json();
    if (base !== apiBase() || standalone) return;   // serwer zmieniony w locie
    const fc = j.zones && Array.isArray(j.zones.features) ? j.zones : emptyFC();
    for (const f of fc.features) {
      const p = f.properties || (f.properties = {});
      p.baseM = zoneAltM(p.lower);
      // minimum 400 m grubości, inaczej płaska strefa znika przy pochyleniu mapy
      p.topM = Math.max(zoneAltM(p.upper), p.baseM + 400);
    }
    zonesData = fc; zonesAt = Date.now();
    zapamietajDefinicjeStref(fc.features);   // dla historii nagrywanej na żywo
    uzupelnijStrefyMigawek(fc.features, zonesAt);
    applyZones();
    /* Panel przerysowuje się dopiero przy następnym stanie z serwera, więc bez
       tego plakietki stref pojawiały się w kartach województw z opóźnieniem —
       po świeżym starcie aplikacji nie było ich wcale. */
    if (state) renderPanel();
  } catch { /* strefy są dodatkiem — ich brak niczego nie blokuje */ }
  finally { zonesPending = false; }
}

function applyZones() {
  if (!mapReady || !map.getSource("strefy")) return;
  /* W historii rysujemy strefy Z TAMTEJ CHWILI (histZonesData), a gdy migawka
     ich nie zapisała — warstwa jest UKRYTA. Nigdy bieżących.

     Do 07.10.2026 suwak rysował BIEŻĄCY zestaw nad przeszłą sytuacją. PAŻP rotuje
     cały zestaw raz na dobę o 06:00 UTC (pomiar 07.10.2026: 33 z 34 stref
     zaczynały dokładnie o tej godzinie), więc przez pół doby okno 12 h sięgało
     przed rotację. Gorzej: strefa zdjęta znika z bieżącego zestawu zupełnie —
     a to właśnie strefy doraźne, otwierane w trakcie zdarzenia, są w historii
     najważniejsze. Odtwarzany atak wyglądał więc na odbyty przy otwartym niebie.
     Od 10.10.2026 migawka zapisuje klucze stref (pansa.zones_snapshot). */
  const dane = aktywneStrefy();
  const on = zonesOn() && !!dane;
  map.getSource("strefy").setData(on ? dane : emptyFC());
  for (const id of ["strefy-3d", "strefy-tlo", "strefy-line", "strefy-hit"])
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

function syncZonesButton() {
  const b = document.getElementById("btn-zones");
  if (!b) return;
  // W trybie wbudowanym nie ma czego pokazywać, więc przycisk znika zamiast
  // udawać, że działa. Tak samo w historii, gdy wybrana chwila nie ma zapisu
  // stref: warstwa jest wtedy ukryta i przełącznik nie miałby czego przełączyć.
  b.style.display = (standalone || !apiBase() || (histMode && !histZonesData)) ? "none" : "";
  const on = zonesOn();
  b.setAttribute("aria-pressed", on ? "true" : "false");
  const t = on ? (UI.t("Ukryj strefy PAŻP", "Hide PAŻP zones", "Сховати зони PAŻP"))
               : (UI.t("Pokaż strefy PAŻP", "Show PAŻP zones", "Показати зони PAŻP"));
  b.title = t; b.setAttribute("aria-label", t);
  const label = b.querySelector("span");
  if (label) label.textContent = UI.t("strefy", "zones", "зони");
}

/* ── karta strefy: po ludzku, bez żargonu lotniczego ─────────────────────── */
const ZONE_KIND = {
  D:     ["strefa niebezpieczna (D)", "danger area (D)", "небезпечна зона (D)"],
  R:     ["strefa ograniczona (R)", "restricted area (R)", "зона обмежень (R)"],
  P:     ["strefa zakazana (P)", "prohibited area (P)", "заборонена зона (P)"],
  NPZ:   ["strefa zakazu lotów (NPZ)", "no-flight zone (NPZ)", "зона заборони польотів (NPZ)"],
  ADHOC: ["strefa doraźna (ADHOC)", "ad-hoc zone (ADHOC)", "тимчасова зона (ADHOC)"],
  TSA:   ["strefa czasowo wydzielona (TSA)", "temporary segregated area (TSA)", "тимчасово виділена зона (TSA)"],
  TRA:   ["strefa czasowo rezerwowana (TRA)", "temporary reserved area (TRA)", "тимчасово зарезервована зона (TRA)"],
  MRT:   ["trasa lotów wojskowych (MRT)", "military training route (MRT)", "маршрут військових польотів (MRT)"],
};
const ZONE_MEANING = {
  D: ["Nad tym obszarem odbywa się działalność niebezpieczna dla lotnictwa — najczęściej strzelania albo ćwiczenia wojskowe.",
      "Activity hazardous to aircraft takes place here — usually live firing or military exercises.",
      "Над цією територією відбувається небезпечна для авіації діяльність — найчастіше стрільби або військові навчання."],
  R: ["Loty w tym obszarze są ograniczone: wejść może tylko ten, kto ma zgodę.",
      "Flights here are restricted: only aircraft with clearance may enter.",
      "Польоти тут обмежені: увійти може лише той, хто має дозвіл."],
  P: ["Loty w tym obszarze są zakazane.", "Flights here are prohibited.", "Польоти в цій зоні заборонені."],
  NPZ: ["Zakaz lotów — obszar zamknięty dla ruchu lotniczego.",
        "No-flight zone — the area is closed to air traffic.",
        "Заборона польотів — простір закритий для авіаційного руху."],
  ADHOC: ["Strefa powołana doraźnie, zwykle na kilka–kilkanaście godzin, decyzją podjętą tego samego dnia.",
          "A zone raised at short notice, usually for a few hours, on a same-day decision.",
          "Зона, створена нашвидкуруч, зазвичай на кілька годин, рішенням того самого дня."],
  TSA: ["Kawałek nieba wydzielony na czas ćwiczeń lub lotów wojskowych — na ten czas zwykły ruch go omija.",
        "A block of airspace segregated for military training or operations — ordinary traffic routes around it.",
        "Ділянка неба, виділена на час навчань або військових польотів — звичайний рух її тоді обходить."],
  TRA: ["Kawałek nieba zarezerwowany czasowo, najczęściej na loty wojskowe.",
        "A block of airspace reserved temporarily, most often for military flights.",
        "Ділянка неба, зарезервована тимчасово, найчастіше для військових польотів."],
};

function zoneClock(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return "?";
  return new Date(t).toLocaleString(UI.t("pl-PL", "en-GB", "uk-UA"),
    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function zoneSinceText(sinceEpochS) {
  const t = Number(sinceEpochS) * 1000;
  if (!t || isNaN(t)) return "";
  // w historii „temu” liczymy od chwili z suwaka, nie od zegara telefonu
  const h = ((histMode && zoneRefMs) || Date.now()) - t;
  if (h < 0) return "";
  return zoneAgoText(h / 3600000);
}
function zoneAgoText(h) {
  if (h < 1) return UI.t(`${Math.max(1, Math.round(h * 60))} min temu`, `${Math.max(1, Math.round(h * 60))} min ago`, `${Math.max(1, Math.round(h * 60))} хв тому`);
  if (h < 48) return UI.t(`${Math.round(h)} godz. temu`, `${Math.round(h)} h ago`, `${Math.round(h)} год тому`);
  return UI.t(`${Math.round(h / 24)} dni temu`, `${Math.round(h / 24)} days ago`, `${Math.round(h / 24)} дн. тому`);
}

/* Przybliżone pole strefy (stopnie² × cos szerokości) — tylko do porównania,
   która z nałożonych stref jest mniejsza. Liczone z pełnej geometrii z
   zonesData, bo geometria z warstwy mapy bywa przycięta do kafelka. */
function zoneArea(f) {
  const g = f?.geometry;
  const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  let area = 0;
  for (const poly of polys) {
    const ring = poly?.[0] || [];
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    area += Math.abs(s) / 2 * Math.cos(((ring[0]?.[1]) || 52) * Math.PI / 180);
  }
  return area || Infinity;
}

function openZoneCard(p, overlapping = []) {
  if (!p) return;
  markSelected(null, null);
  const type = String(p.type || "").toUpperCase();
  const kind = UI.t(...(ZONE_KIND[type] || [type, type, type]));
  const standing = p.standing === true || p.standing === "true";
  const zastana = p.atBoot === true || p.atBoot === "true";
  let meaning = UI.t(...(ZONE_MEANING[type] || ["", "", ""]));
  /* Strefa doraźna, która stoi tygodniami, przestaje być doraźna — opis „zwykle
     na kilka godzin" kłóciłby się z wierszem o tym, że to stan (np. EPR134 nad
     pasem przygranicznym, przedłużana od 10.09.2026). */
  if (standing && type === "ADHOC")
    meaning = UI.t("Strefa powołana decyzją administracyjną. Ta akurat jest przedłużana, więc stoi tygodniami, a nie godzinami.", "A zone raised by an administrative decision. This one keeps being extended, so it stays up for weeks rather than hours.", "Зону створено адміністративним рішенням. Цю конкретну продовжують, тож вона стоїть тижнями, а не годинами.");
  /* Karta jest od v4 (14.10.2026) CIEMNA, jak reszta aplikacji — wcześniej była
     biała i te same barwy trzeba było przyciemniać. Na ciemnym szkle jasne wersje
     trzymają ponad 7:1. Predykat ten sam co na mapie (ZONE_QUIET), żeby kolor
     karty zgadzał się z kolorem konturu. */
  const color = (standing || zastana) ? "#b9a6ee" : "#ffc04d";
  /* „Od kiedy” bierzemy z chwili, w której Strażnik zobaczył strefę po raz
     pierwszy, a nie z pola startDate — plan dobowy PAŻP przepisuje tę samą
     strefę codziennie od 06:00 UTC, więc startDate kłamałby o świeżości. */
  const since = zoneSinceText(p.since);
  const time = standing
    ? (UI.t(`Ta strefa stoi tu od dłuższego czasu — to stan, nie nowe zdarzenie.`, `This zone has been standing here for a long time — it is a state, not a new event.`, `Ця зона стоїть тут уже давно — це стан, а не нова подія.`))
    : (p.atBoot === true || p.atBoot === "true")
      ? (UI.t("Strefa była już aktywna, gdy Strażnik zaczął obserwację — mogła zostać włączona wcześniej.", "The zone was already active when Strażnik started watching — it may have been switched on earlier.", "Зона вже була активна, коли Strażnik почав спостереження — її могли ввімкнути раніше."))
      : (UI.t(`Strażnik zobaczył jej włączenie ${since || "niedawno"}.`, `Strażnik saw it switch on ${since || "recently"}.`, `Strażnik побачив її ввімкнення ${since || "нещодавно"}.`));
  /* PAŻP publikuje plan DOBOWY: pole „koniec" to koniec dzisiejszej rezerwacji,
     a nie koniec strefy. EPR134 nad pasem przygranicznym jest powołana NOTAM-em
     do grudnia 2026, a feed podawał dla niej 13.09 — karta obiecywała zniesienie,
     którego nie będzie (zgłoszone 12.09.2026). Nie nazywamy tego końcem strefy. */
  const untilRaw = zoneClock(p.end);
  const until = untilRaw === "?" ? ""
    : `${UI.t("Rezerwacja do", "Reserved until", "Резервація до")}: <b>${esc2(untilRaw)}</b>
       <span style="color:#9aa6be">${UI.t("(koniec dzisiejszej rezerwacji — PAŻP publikuje plan dobowy, strefa bywa przedłużana)", "(end of today’s slot — PAŻP publishes day by day and a zone can be renewed)", "(кінець сьогоднішньої резервації — PAŻP публікує добовий план, зону часто продовжують)")}</span><br>`;
  showCard(`
    <div class="zone-head"><b style="color:${color}">▦ ${esc2(String(p.designator || "—"))}</b>
      <span style="color:#8fa3c4">· ${esc2(kind)}</span></div>
    ${meaning ? `<span>${esc2(meaning)}</span><br>` : ""}
    <span style="color:#8fa3c4">${esc2(time)}</span><br>
    ${until}
    ${UI.t("Pułap", "Altitude band", "Стеля")}: <b>${esc2(zoneAltText(p.lower))} – ${esc2(zoneAltText(p.upper))}</b><br>
    ${p.voiv ? `<button type="button" class="chip btn-zone-voiv" data-voiv="${esc2(p.voiv)}"
        style="margin:5px 0 6px">${UI.t("Województwo", "Province", "Воєводство")}: ${esc2(UI.voiv(p.voiv))} ›</button><br>` : ""}
    ${p.remarks ? `<span style="color:#9aa6be">${UI.t("Adnotacja PAŻP", "PAŻP note", "Примітка PAŻP")}: ${esc2(String(p.remarks))}</span><br>` : ""}
    ${overlapping.length ? `<span style="color:#9aa6be">${UI.t("W tym miejscu są też", "Other zones at this spot", "У цьому місці є також")}:</span>
      ${overlapping.map(d => `<button type="button" class="chip btn-zone-other" data-zone="${esc2(d)}"
        style="margin:3px 4px 3px 0">${esc2(d)}</button>`).join("")}<br>` : ""}
    <span style="color:#9aa6be">${UI.t("To informacja, nie alarm. Sama warstwa stref nie dodaje punktów — punktuje tylko rzadka strefa D, R, NPZ albo ADHOC od ziemi nad ścianą wschodnią lub północą, niewidziana od 7 dni (0,5–1 pkt), i wtedy pojawia się w sygnałach. Źródło: PAŻP (AUP/UUP).", "This is information, not an alert. The zone layer itself adds no points — only a rare D, R, NPZ or ADHOC zone from the ground up over the eastern border or the north, not seen for 7 days, scores (0.5–1 pt) and then appears among the signals. Source: PAŻP (AUP/UUP).", "Це інформація, а не тривога. Сам шар зон балів не додає — бали дає лише рідкісна зона D, R, NPZ або ADHOC від землі над східною стіною чи північчю, не бачена 7 днів (0,5–1 бала), і тоді вона з'являється в сигналах. Джерело: PAŻP (AUP/UUP).")}</span>`, { big: true });
}

/* Dotknięcie wnętrza dużej strefy trafia w strefę, nie w województwo — bez tego
   przycisku województwo w całości przykryte strefą byłoby na mapie nieklikalne. */
document.addEventListener("click", (e) => {
  const z = e.target.closest?.(".btn-zone-other");
  if (z) { e.stopPropagation(); openZoneByName(z.dataset.zone); }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".btn-zone-voiv");
  if (!b) return;
  hideCard();
  openCard(b.dataset.voiv);
});

document.getElementById("btn-zones")?.addEventListener("click", () => {
  const next = !zonesOn();
  try { localStorage.setItem("straznik_zones", next ? "1" : "0"); } catch {}
  syncZonesButton();
  if (next) refreshZones(true); else applyZones();
});


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
const COUNTRY_UK = { "Polska":"Польща", "Rosja":"Росія", "Białoruś":"Білорусь", "Niemcy":"Німеччина",
  "Francja":"Франція", "Wielka Brytania":"Велика Британія", "Włochy":"Італія", "Hiszpania":"Іспанія",
  "Czechy":"Чехія", "Słowacja":"Словаччина", "Węgry":"Угорщина", "Rumunia":"Румунія",
  "Litwa":"Литва", "Łotwa":"Латвія", "Estonia":"Естонія", "Ukraina":"Україна",
  "Holandia":"Нідерланди", "Belgia":"Бельгія", "Dania":"Данія", "Norwegia":"Норвегія",
  "Szwecja":"Швеція", "Finlandia":"Фінляндія", "Austria":"Австрія", "Grecja":"Греція",
};
const countryText = name => UI.t(name, COUNTRY_EN[name] || name, COUNTRY_UK[name] || COUNTRY_EN[name] || name);

/* Biblioteka modelu: lokalna, bez API wyszukującego po powtarzalnych numerach.
   Brak potwierdzonego wariantu oznacza brak fotografii, nie podobną maszynę. */
async function acPhoto(plane) {
  return window.AircraftPhotos?.select(plane, window.AircraftPhotoCatalog) || null;
}

/* Prędkość nad ziemią podajemy w km/h, bo tak myśli większość czytelników, ale
   w nawiasie zostawiamy węzły ze źródła — czytelnik z 23.09.2026 porównywał nasz
   odczyt z serwisem lotniczym i nie miał jak sprawdzić, czy przeliczyliśmy. */
function speedRow(p) {
  const parts = [];
  if (p.gs != null) parts.push(`${ktToKmh(p.gs)} km/h (${Math.round(p.gs)} kt)`);
  if (p.mach != null) parts.push(`Ma ${(+p.mach).toFixed(2)}`);
  return parts.join(" · ");
}
function headingRow(p) {
  const t = p.track != null ? `${Math.round(p.track)}° (${compass(p.track)})` : null;
  const mh = p.mag_heading != null ? `mag. ${Math.round(p.mag_heading)}°` : null;
  return [t, mh].filter(Boolean).join(" · ") || (UI.t("b.d.", "unavailable", "н/д"));
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
  // Przycisk „Obce maszyny” jest w Menu (v4) — licznik musi być widać także na
  // zakładce, inaczej nikt nie zajrzy do menu, żeby się o maszynach dowiedzieć.
  const m = document.getElementById("menu-badge");
  if (m) { m.textContent = n || ""; m.style.display = n ? "" : "none"; }
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

function showCard(html, opts) {
  const body = document.getElementById("ac-card-body");
  if (!body) return;
  body.innerHTML = html;
  const card = document.getElementById("ac-card");
  card.classList.remove("hidden");
  card.scrollTop = 0;
  applyCardSize(opts && opts.big === true);
}
function hideCard() {
  const card = document.getElementById("ac-card");
  if (card) { card.classList.add("hidden"); card.dataset.forceBig = ""; }
  markSelected(null, null);
}

/* Karta obiektu ma dwa rozmiary: miniatura w rogu (domyślnie — nie zasłania mapy)
   i rozwinięta karta na niemal cały ekran. Wybór zostaje na urządzeniu. */
function cardBig() { try { return localStorage.getItem("straznik_card_big") === "1"; } catch { return false; } }
function applyCardSize(force) {
  const card = document.getElementById("ac-card");
  const btn = document.getElementById("ac-card-zoom");
  if (!card) return;
  /* Karta strefy to sam opis — w miniaturze wychodzi 10-punktowa ściana tekstu.
     Otwieramy ją rozwiniętą JEDNORAZOWO, nie zmieniając ustawienia zapisanego
     przez użytkownika dla kart obiektów; zwinięcie przyciskiem znosi wymuszenie. */
  if (force === true) card.dataset.forceBig = "1";
  const big = card.dataset.forceBig === "1" || cardBig();
  card.classList.toggle("big", big);
  if (btn) {
    const t = big ? (UI.t("Zwiń kartę", "Collapse card", "Згорнути картку"))
                  : (UI.t("Rozwiń kartę", "Expand card", "Розгорнути картку"));
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
        alt="${UI.t("Ilustracja AI", "AI illustration", "Ілюстрація ШІ")}: ${esc2(meta.label)} — ${UI.t("nie śledzony obiekt", "not the tracked object", "не відстежуваний об'єкт")}" loading="lazy"
        onerror="this.closest('.thr-photo').hidden=true">
        <div class="thr-photo-note"><strong>${UI.t("Ilustracja poglądowa wygenerowana przez AI.", "Reference illustration generated by AI.", "Оглядова ілюстрація, згенерована ШІ.")}</strong><br>
          ${UI.t("Nie przedstawia śledzonego obiektu. Może zawierać uproszczenia; nie służy do identyfikacji modelu.", "It does not depict the tracked object. It may contain simplifications and must not be used to identify a model.", "Не зображує відстежуваного об'єкта. Може містити спрощення; не служить для визначення моделі.")}</div></div>`
    : `<div class="thr-photo" style="margin:-2px 0 6px"><img src="assets/threats/${esc2(fallbackType)}.svg"
        alt="Grafika poglądowa typu ${esc2(meta.label)}"
        onerror="this.closest('.thr-photo').style.display='none'">
        <div class="thr-photo-note">${UI.t("grafika poglądowa typu — nie tego obiektu", "type reference — not this object", "оглядове зображення типу — не цього об'єкта")}</div></div>`)
    : "";
  showCard(`${img}
      <b style="color:${meta.color}">◆ ${meta.label}</b><br>
      ${p.opis ? esc2(p.opis) + "<br>" : ""}
      ${UI.t("wiarygodność", "confidence", "достовірність")}: <b>${esc2(UI.confidence(p.confidence, CONF_PL[p.confidence] || p.confidence))}</b>
        · ${UI.t("gdzie może być", "where it may be", "де може бути")}: <b>±${p.uncertainty} km</b>${
          Number(p.unc_lot) > 0 && Number.isFinite(Number(p.uncertainty))
            ? ` <span style="color:#95a1b7">(${Number(p.uncertainty) - Number(p.unc_lot)} km ${
                UI.t("zgłoszenia", "report", "повідомлення")} + ${Number(p.unc_lot)} km ${
                UI.t("lotu od meldunku", "flown since", "польоту відтоді")})</span>` : ""}<br>
      ${p.heading != null && !p.hdg_unknown ? `${p.heading_measured ? UI.t("kurs z ruchu", "heading from movement", "курс із руху") : UI.t("kurs", "heading", "курс")}: ${Math.round(p.heading)}° (${compass(p.heading)})${p.heading_measured && p.heading_source != null && Math.abs(((p.heading - p.heading_source) % 360 + 540) % 360 - 180) > 45 ? ` <span style="color:#95a1b7">(${UI.t("NEPTUN podaje", "NEPTUN reports", "NEPTUN повідомляє")} ${Math.round(p.heading_source)}°)</span>` : ""} · ` : ""}
      ${UI.t("odległość od granicy PL", "distance from the Polish border", "відстань від кордону Польщі")}: <b>${p.distance_text ?? ((p.dist_km ?? "?") + " km")}</b><br>
      ${UI.t("ostatni meldunek", "last report", "останнє повідомлення")}: <b>${ageAgoText(p.age_min)}</b>${Number(p.age_min) >= 15
        ? ` <span style="color:#95a1b7">${UI.t("— rejon przestał już rosnąć, obiekt może być dalej", "— the area has stopped growing; the object may be further away", " — район уже перестав зростати, об'єкт може бути далі")}</span>` : ""}<br>
      ${courseVerdictHTML(p)}
      ${p.eta || ""}
      <span style="color:#9aa6be">${UI.t("Dane: NEPTUN — agregator OSINT, nie radar wojskowy", "Data: NEPTUN — OSINT aggregator, not military radar", "Дані: NEPTUN — агрегатор OSINT, а не військовий радар")}</span>`);
}

/* Werdykt kursu w karcie obiektu. Bez tego karta podawała same stopnie („kurs
   252°"), a lista sygnałów mówiła „0 pkt, kurs 86° od kierunku na Polskę" — te same
   dane, dwa różne wrażenia. Właściwości warstwy GL bywają tekstem, stąd rzutowania. */
function courseVerdictHTML(p) {
  const toward = p.toward_pl === true || p.toward_pl === "true";
  const known = !(p.heading_known === false || p.heading_known === "false");
  const off = p.course_off == null || p.course_off === "" ? null : Math.round(Number(p.course_off));
  if (toward) {
    return `<span style="color:#ff7b88"><b>${UI.t("kurs na Polskę", "heading towards Poland", "курс на Польщу")}</b>${
      off != null ? ` (${off}° ${UI.t("od kierunku na granicę", "off the direction to the border", "від напрямку на кордон")})` : ""}</span><br>`;
  }
  const why = !known
    ? (UI.t("kurs nieznany", "heading unknown", "курс невідомий"))
    : off != null
      ? (UI.t(`kurs ${off}° od kierunku na Polskę`, `heading ${off}° away from the direction to Poland`, `курс ${off}° від напрямку на Польщу`))
      : (UI.t("kurs nie prowadzi na Polskę", "not heading towards Poland", "курс не веде на Польщу"));
  return `<span style="color:#a3aec4"><b>${UI.t("0 pkt", "0 pts", "0 бал.")}</b> — ${why}</span><br>`;
}

/* Karta samolotu w stylu airplanes.live: zdjęcie, kraj rejestracji, operator,
   pełna telemetria i przycisk śledzenia trasy. Pełne dane bierzemy z adsbByHex
   (właściwe typy), bo właściwości warstwy GL potrafią zamienić liczby w tekst. */
function planePopupHTML(p, heli, uid) {
  const c = hexCountry(p.hex);
  const role = acRole(p.type, p.desc);
  const vr = typeof p.vr === "number" ? p.vr : (p.vr != null ? +p.vr : null);
  const vrTxt = vr == null ? "" : vr > 100 ? ` · ↑ ${vr} ft/min`
    : vr < -100 ? ` · ↓ ${Math.abs(vr)} ft/min` : (UI.t(" · lot poziomy", " · level flight", " · горизонтальний політ"));
  const mil = (p.dbflags & 1)
    ? `<span style="background:#7a1d2b;color:#fff;border-radius:4px;padding:1px 5px;font-size:0.6667rem">${UI.t("WOJSKOWY", "MILITARY", "ВІЙСЬКОВИЙ")}</span> ` : "";
  const nav = Array.isArray(p.nav_modes) ? p.nav_modes.join(", ") : (p.nav_modes || "");
  const geom = p.alt_geom != null && p.alt_geom !== p.alt
    ? ` <span style="color:#9aa6be">(geom. ${ftToM(p.alt_geom)} m)</span>` : "";
  const row = (l, v) => (v == null || v === "") ? ""
    : `<tr><td style="color:#9aa6be;padding-right:8px;vertical-align:top">${l}</td><td><b>${v}</b></td></tr>`;
  return `<div>
    <div id="${uid}-box" class="ac-photo" style="display:none;margin:-2px 0 6px">
      <img id="${uid}" alt="" style="width:100%;max-height:220px;object-fit:contain;border-radius:6px;display:block">
      <div class="ph-cr" style="font-size:0.6667rem;color:#9aa6be;margin-top:2px"></div>
    </div>
    <div id="${uid}-missing" style="font-size:0.6667rem;color:#9aa6be;margin-bottom:6px">${UI.t("Brak zweryfikowanego zdjęcia tego modelu/wariantu.", "No verified photo for this model/variant.", "Немає перевіреного фото цієї моделі/варіанта.")}</div>
    <b style="font-size:0.9rem">${heli ? "🚁" : "✈"} ${esc2(p.callsign || p.hex || "?")}</b>
      ${p.reg ? ` · ${UI.t("rej.", "reg.", "реєстр.")} ${esc2(p.reg)}` : ""}<br>
    ${mil}${c ? `${c.flag} ${esc2(countryText(c.name))} · ` : ""}<b>${esc2(acName(p.type, p.desc))}</b>${p.year ? ` (${esc2(p.year)})` : ""}<br>
    ${role ? `${UI.t("przeznaczenie", "role", "призначення")}: <b>${esc2(roleText(role))}</b><br>` : ""}
    ${p.op ? `${UI.t("operator", "operator", "оператор")}: <b>${esc2(p.op)}</b><br>` : ""}
    <table style="margin:5px 0;border-collapse:collapse">
      ${row(UI.t("wysokość", "altitude", "висота"), altText(p.alt) + geom + vrTxt.replace(" · ", "&nbsp; "))}
      ${row(UI.t("prędkość", "speed", "швидкість"), speedRow(p))}
      ${row(UI.t("kurs", "heading", "курс"), headingRow(p))}
      ${row("squawk", p.squawk ? esc2(p.squawk) : "")}
      ${row(UI.t("wiatr", "wind", "вітер"), (p.ws != null && p.wd != null) ? `${ktToKmh(p.ws)} km/h ${UI.t("z", "from", "з")} ${Math.round(p.wd)}° (${compass(p.wd)})` : "")}
      ${row("temp.", p.oat != null ? `${Math.round(p.oat)} °C` : "")}
      ${row(UI.t("tryby nav", "nav modes", "режими навігації"), nav ? esc2(nav) : "")}
      ${row(UI.t("sygnał", "signal", "сигнал"), `${esc2(p.source || "ADS-B/MLAT")}${Number.isFinite(+p.rssi) && p.rssi !== null ? ` · ${+p.rssi} dBFS` : ""}${Number.isFinite(+p.messages) && p.messages !== null ? ` · ${+p.messages} msg/s` : ""}`)}
    </table>
    ${p.held ? `<div style="color:#ffb020;font-size:0.7333rem;margin-bottom:5px">${UI.t("Pozycja wstrzymana: ostatni meldunek odrzucony jako niemożliwy skok (maszyna nie przeleciałaby tego dystansu w tym czasie). Pokazujemy ostatnią wiarygodną pozycję do czasu poprawnego meldunku.", "Position held: the latest report was rejected as an impossible jump (the aircraft could not cover that distance in that time). We show the last credible position until a sound report arrives.", "Позицію утримано: останнє повідомлення відхилено як неможливий стрибок (машина не подолала б цю відстань за такий час). Показуємо останню достовірну позицію до коректного повідомлення.")}</div>` : ""}
    ${p.source === "MLAT" ? `<div style="color:#ffb020;font-size:0.7333rem;margin-bottom:5px">${UI.t("Pozycja z MLAT: policzona przez odbiorniki z różnic czasu dotarcia sygnału, a nie podana przez maszynę. Poza zasięgiem odbiorników — nad Białorusią, Rosją, morzem — potrafi odbiec od prawdziwej o kilkadziesiąt kilometrów. Wysokość, prędkość i kurs schodzą z pokładu i są wiarygodne.", "MLAT position: computed by ground receivers from signal time differences, not reported by the aircraft. Outside receiver coverage — over Belarus, Russia, open sea — it can be tens of kilometres off. Altitude, speed and heading come from the aircraft itself and are reliable.", "Позиція з MLAT: обчислена приймачами з різниці часу надходження сигналу, а не передана самим літаком. Поза зоною приймачів — над Білоруссю, Росією, морем — вона може відхилятися на десятки кілометрів. Висота, швидкість і курс надходять з борту і є достовірними.")}</div>` : ""}
    <button class="btn-follow chip" style="font-size:0.7333rem;padding:3px 8px;margin-bottom:4px">${followHex === p.hex
      ? (UI.t("■ przestań śledzić", "■ stop tracking", "■ припинити стеження")) : (UI.t("📍 śledź trasę", "📍 follow track", "📍 стежити за шляхом"))}</button>
    <div style="color:#9aa6be;font-size:0.7333rem">${UI.t("publiczny transponder ADS-B/MLAT — pozycja emisji, nie namierzanie. Telemetria: dostawcy ADS-B. Zdjęcie modelu: biblioteka lokalna; źródło i licencja powyżej.", "public ADS-B/MLAT transponder — emitted position, not active tracking. Telemetry: ADS-B providers. Model photo: local library; source and license above.", "відкритий транспондер ADS-B/MLAT — позиція випромінювання, а не радарне стеження. Телеметрія: постачальники ADS-B. Фото моделі: локальна бібліотека; джерело й ліцензія вище.")}</div>
  </div>`;
}

function openPlanePopup(lngLat, props) {
  const p = (histMode ? historyAdsbByHex : adsbByHex).get(props?.hex) || props;
  if (!p) return;
  markSelected("plane", p.hex);
  const heli = p.heli != null ? p.heli : isHeli(p.cat, p.type, p.desc);
  const uid = "pp" + (++popupSeq);
  const timeNote = histMode ? `<div class="hist-banner">${UI.t("PODGLĄD HISTORII", "HISTORY VIEW", "ПЕРЕГЛЯД ІСТОРІЇ")} — ${watchClock(historyAdsbTime)}<br>${p.historicalOnly
    ? (UI.t("Ostatnia obserwacja", "Last observation", "Останнє спостереження")) + " " + watchClock(p.observedAt) + (UI.t(" — brak pozycji w tej migawce", " — no position in this snapshot", " — немає позиції в цьому знімку"))
    : (UI.t("Pozycja zapisana w wybranej migawce", "Position recorded in the selected snapshot", "Позиція, збережена в обраному знімку"))}</div>` : "";
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
        cr.textContent = window.AircraftPhotos.caption(ph, UI.t("pl", "en", "uk"));
        cr.append(document.createElement("br"), document.createTextNode("📷 " + ph.author + " · "));
        for (const [label, url] of [[UI.t("Źródło", "Source", "Джерело"), ph.sourceUrl], [ph.license, ph.licenseUrl]]) {
          // adres przychodzi z zewnętrznej bazy zdjęć — ten sam filtr co linki z RSS
          const bezp = safeUrl(url); if (!bezp) continue;
          const a = document.createElement("a"); a.textContent = label; a.href = bezp; a.target = "_blank"; a.rel = "noopener noreferrer";
          cr.append(a, document.createTextNode(" · "));
        }
        cr.append(document.createTextNode(ph.sourceCrop
          ? (UI.t("Kadrowanie źródłowe; bez dodatkowego retuszu.", "Source crop; no further retouching.", "Кадрування з оригіналу; без додаткового ретушування."))
          : (UI.t("Miniatura źródłowa; bez retuszu.", "Source thumbnail; no retouching.", "Мініатюра з оригіналу; без ретушування."))));
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
  const mode = trailMode("adsb");
  const hexes = mode === "off" ? (followHex ? [followHex] : []) : [...adsbTrails.keys()];
  const features = [];
  for (const h of hexes) {
    const arr = adsbTrails.get(h);
    if (arr && arr.length >= 2) features.push({ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: arr.map(q => [q.lon, q.lat]) } });
  }
  src.setData({ type: "FeatureCollection", features });
  // kierunek: kurs i prędkość z transpondera są zmierzone, więc linia na 15 min
  const course = [];
  if (mode === "course" && !histMode) {
    for (const p of adsbByHex.values()) {
      const kmh = ktToKmh(p.gs);
      if (p.lat == null || p.track == null || !kmh || kmh < 60) continue;
      course.push(...courseFeatures(p.lat, p.lon, p.track, kmh, 15, "#39c5ec"));
    }
  }
  map.getSource("adsb-course")?.setData({ type: "FeatureCollection", features: course });
}

/* ── trasy i kierunek lotu (opcja, 3 stany; osobno NEPTUN i ADS-B) ─────────── */
const TRAIL_KEYS = { neptun: "straznik_trail_neptun", adsb: "straznik_trail_adsb" };
const TRAIL_DEFAULT = { neptun: "trail", adsb: "off" };
function trailMode(kind) {
  try {
    const v = localStorage.getItem(TRAIL_KEYS[kind]);
    return ["off", "trail", "course"].includes(v) ? v : TRAIL_DEFAULT[kind];
  } catch { return TRAIL_DEFAULT[kind]; }
}
function movePoint(lat, lon, bearing, km) {
  const r = bearing * Math.PI / 180;
  const nlat = lat + (km / 110.57) * Math.cos(r);
  return [lon + (km / (111.32 * Math.cos(nlat * Math.PI / 180))) * Math.sin(r), nlat];
}
/* Linia kierunku z kropkami co 5 min — zakłada niezmieniony kurs i prędkość. */
function courseFeatures(lat, lon, bearing, kmh, minutes, color) {
  const coords = [[lon, lat]], ticks = [];
  for (let m = 5; m <= minutes; m += 5) {
    const pt = movePoint(lat, lon, bearing, kmh * m / 60);
    coords.push(pt);
    ticks.push({ type: "Feature", properties: { color, min: m },
      geometry: { type: "Point", coordinates: pt } });
  }
  return [{ type: "Feature", properties: { color },
    geometry: { type: "LineString", coordinates: coords } }, ...ticks];
}
/* Kurs NEPTUN tylko ZMIERZONY z ruchu: serwer (heading_estimated) albo własny ślad
   z przesunięciem ≥ 2 km. „Kursem na X” różnił się od faktycznego ruchu o medianę
   90° (audyt C6/G3), więc nie rysujemy dla niego kierunku. */
function measuredHeading(t) {
  if (isApproxPosition(t)) return null;
  if (t.heading_estimated != null) return +t.heading_estimated;
  const pts = trackPoints(t);
  if (pts.length < 2 || !Places?.bearingDeg) return null;
  const b = pts[pts.length - 1];
  if (Date.now() - b.ms > 20 * 60000) return null;       // stary ślad to nie kurs
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    if (kmBetween(a, b) >= 2) return Places.bearingDeg(a.lat, a.lon, b.lat, b.lon);
  }
  return null;
}
const kmBetween = (a, b) => Math.hypot((b.lat - a.lat) * 110.57,
  (b.lon - a.lon) * 111.32 * Math.cos(b.lat * Math.PI / 180));
/* Trasa z trzech źródeł: `trail` NEPTUN-a, krótka historia z serwera (dostępna od
   razu po otwarciu aplikacji) i własny zapis. Posortowana w czasie, bez duplikatów. */
const TRACK_MAX_AGE_MS = 45 * 60000;
function trackPoints(t) {
  if (isApproxPosition(t)) return [];
  const now = Date.now(), all = [];
  for (const q of cleanTrail(t)) all.push({ lat: q.lat, lon: q.lon, ms: Date.parse(q.t) || 0 });
  for (const q of t.straznik_trail || []) all.push({ lat: q.lat, lon: q.lon, ms: (q.t || 0) * 1000 });
  for (const q of localTrails.get(t.id) || []) all.push({ lat: q.lat, lon: q.lon, ms: q.t || 0 });
  all.sort((x, y) => x.ms - y.ms);
  const out = [];
  for (const q of all) {
    if (q.ms && now - q.ms > TRACK_MAX_AGE_MS) continue;
    const last = out[out.length - 1];
    if (last && kmBetween(last, q) < 0.3) continue;
    out.push(q);
  }
  return out;
}
function toggleFollow(hex) {
  followHex = followHex === hex ? null : hex;
  drawFollowTrail();
  if (followHex && adsbByHex.has(followHex)) {
    const p = adsbByHex.get(followHex);
    map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 7), duration: 800 });
  }
  toast(followHex
    ? UI.t("<b>Śledzę samolot.</b><br>Mapa podąża, trasa rysowana. Dotknij ponownie, by przestać.", "<b>Following the aircraft.</b><br>The map follows it and draws the track. Tap again to stop.", "<b>Стежу за літаком.</b><br>Мапа рухається за ним, маршрут малюється. Торкніться ще раз, щоб зупинити.")
    : UI.t("Śledzenie wyłączone.", "Following stopped.", "Стеження вимкнено."));
}

/* ── alarmy obwodów UA na mapie ─────────────────────────────────────────────
   Podświetlamy obwód, dopóki jego alarm daje punkty któremuś województwu —
   te same sygnały co w panelu, więc mapa i lista mówią to samo. Alarm liczy się
   do 60 min od ogłoszenia (serwer nie dostaje dziś jego zakończenia). */
const OBLAST_COLOR = "#ff6f91";
let oblastInfo = new Map();
function oblastsFrom(sigs) {
  const m = new Map();
  for (const s of sigs || []) {
    const k = s.event_type === "ua_alert_border" && s.details?.oblast;
    // zakończony alarm gaśnie od razu; trwający dłużej niż 30 min świeci słabiej
    const weight = s.weight ?? 1;
    if (!k || !((s.points || 0) > 0) || s.alert_ended || weight <= 0) continue;
    const e = m.get(k) || { w: 0, since: null, per: [] };
    e.w = Math.max(e.w, Math.min(1, s.points * weight));
    const since = s.details.episode || s.ts;
    if (!e.since || since < e.since) e.since = since;
    e.per.push({ voiv: s.voivodeship, points: s.points * weight, counted: s.counted_points,
                 km: s.details.distance_km, half: weight < 1 });
    m.set(k, e);
  }
  return m;
}
function paintOblasts(sigs) {
  ostatnieObwodyUA = sigs;
  if (!mapReady || !map.getSource("obwody")) return;
  const next = oblastsFrom(sigs);
  if (next.size) wczytajGeoUA("obwody");        // jest co rysować — dociągnij granice
  for (const k of new Set([...oblastInfo.keys(), ...next.keys()]))
    map.setFeatureState({ source: "obwody", id: k },
      { active: next.has(k), w: next.get(k)?.w || 0 });
  oblastInfo = next;
}

/* ── alarmy u sąsiadów tylko do obserwacji (bez punktów, 15.09.2026) ── */
let raionsByOblast = {};           // obwód (ukr., bez „область”) → klucze rejonów z mapy

/* Geometria Ukrainy: obwody 328 KB + rejony 156 KB po gzipie, razem prawie pół
   megabajta. Do 27.09.2026 pobierała się przy KAŻDYM wejściu na stronę, choć
   warstwa obwodów ma fill-opacity 0, dopóki nie ma alarmu — a 24.09.2026 było
   231 tys. odsłon w dobę. Płacili za to głównie ludzie na danych komórkowych
   w trakcie zdarzenia, czyli dokładnie ci, którym ma być lekko.

   Odkładamy WYŁĄCZNIE pobranie danych: warstwy i ich obsługa kliknięć powstają
   przy starcie, puste, więc kolejność rysowania jest ustalona raz na zawsze.
   Po nieudanym pobraniu wracamy do stanu „nie wczytane" i spróbujemy przy
   następnym alarmie. */
const uaGeo = { rejony: null, obwody: null };      // null | "wczytuje" | "gotowe"
const UA_GEO_PLIKI = {
  rejony: "assets/rejony-ua-v1.geojson?v=1.7.82",
  obwody: "assets/obwody-ua.geojson?v=1.7.82",
};
let ostatnieRejonyUA = null, ostatnieObwodyUA = null;   // do przemalowania po pobraniu

async function wczytajGeoUA(ktore) {
  if (uaGeo[ktore] || !mapReady) return;
  uaGeo[ktore] = "wczytuje";
  try {
    const gj = await (await fetch(UA_GEO_PLIKI[ktore])).json();
    const zrodlo = map.getSource(ktore);
    if (!zrodlo || !gj?.features?.length) { uaGeo[ktore] = null; return; }
    if (ktore === "rejony") {
      raionsByOblast = {};
      for (const f of gj.features)
        (raionsByOblast[f.properties.o] = raionsByOblast[f.properties.o] || []).push(f.properties.k);
    }
    zrodlo.setData(gj);
    uaGeo[ktore] = "gotowe";
    // alarm był wcześniej niż geometria — malujemy jeszcze raz, już po danych
    if (ktore === "rejony") paintRaionAlerts(ostatnieRejonyUA);
    else paintOblasts(ostatnieObwodyUA);
  } catch (err) {
    uaGeo[ktore] = null;
    console.warn("geometria UA", ktore, err);
  }
}
let raionAlertInfo = new Map();    // klucz rejonu → wpis alarmu NEPTUN-a
let countryAlerts = new Map();     // ISO3 kraju z trwającym alarmem -> opis do karty
const UA_LATIN = { а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ie",ж:"zh",з:"z",и:"y",і:"i",ї:"i",й:"i",
  к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",
  щ:"shch",ь:"",ю:"iu",я:"ia" };
const UA_LATIN_INITIAL = { є:"ye", ї:"yi", й:"y", ю:"yu", я:"ya" };
// Rejony przemianowane w 2024 r. (NEPTUN ma nowe nazwy, granice z 2022 — stare) i
// odmienna pisownia w źródle granic.
const RAION_ALIAS = { zviahelskyi:"novohradvolynskyi", volodymyrskyi:"volodymyrvolynskyi",
  sheptytskyi:"chervonohradskyi", berestynskyi:"krasnohradskyi", samarivskyi:"novomoskovskyi",
  kerchenskyi:"kerchynskyi" };
/* Ukraińska nazwa rejonu → klucz jak w rejony-ua-v1.geojson (transliteracja urzędowa). */
function raionKey(name) {
  const words = String(name || "").toLowerCase().replace(/[’ʼ'`]/g, "")
    .replace(/\s*(район|р-н)\s*$/, "").replace(/зг/g, "zgh").split(/[\s-]+/);
  const k = words.map(w => [...w].map((ch, i) =>
    (i === 0 && UA_LATIN_INITIAL[ch]) || (UA_LATIN[ch] ?? ch)).join("")).join("").replace(/[^a-z]/g, "");
  return RAION_ALIAS[k] || k;
}
const oblastShort = s => String(s || "").replace(/^м\.\s*/, "").replace(/\s+область$/i, "").trim();
function paintRaionAlerts(areas) {
  ostatnieRejonyUA = areas;
  if (!mapReady || !map.getSource("rejony")) return;
  if ((areas || []).length) wczytajGeoUA("rejony");
  const next = new Map();
  const rank = { red: 2, yellow: 1 };
  const put = (k, a) => { const prev = next.get(k);
    if (!prev || (rank[a.l] || 0) > (rank[prev.l] || 0)) next.set(k, a); };
  for (const a of areas || []) {
    if (a.w === "oblast") {
      for (const k of raionsByOblast[oblastShort(a.n)] || raionsByOblast[oblastShort(a.o)] || []) put(k, a);
    } else {
      const k = raionKey(a.k || a.n);
      if ((raionsByOblast[oblastShort(a.o)] || []).includes(k)) put(k, a);
      // Dopóki granice się nie wczytały, raionsByOblast jest puste i KAŻDY rejon
      // wyglądałby na nieznany — ostrzegamy dopiero, gdy jest z czym porównywać.
      else if (uaGeo.rejony === "gotowe" && !paintRaionAlerts.warned?.has(k)) {
        (paintRaionAlerts.warned = paintRaionAlerts.warned || new Set()).add(k);
        console.warn("Strażnik: rejon bez granic na mapie", a.n, a.o, k);
      }
    }
  }
  for (const k of new Set([...raionAlertInfo.keys(), ...next.keys()]))
    map.setFeatureState({ source: "rejony", id: k }, { alert: next.get(k)?.l === "red" ? "red"
      : next.has(k) ? "yellow" : "" });
  raionAlertInfo = next;
}
/* Powod alarmu przychodzi z NEPTUN-a po ukrainsku i POWTARZA poziom, ktory
   linijke wyzej mamy juz przetlumaczony („Ракетна загроза (червоний рівень)").
   Tlumaczymy sam rodzaj zagrozenia i ucinamy nawias. Tresci, ktorej nie znamy,
   NIE udajemy, ze rozumiemy — pokazujemy ja w cudzyslowie jako cytat ze zrodla. */
const RAION_REASON = [
  [/ракет/i, ["zagrożenie rakietowe", "missile threat", "ракетна загроза"]],
  [/дрон|бпла|шахед/i, ["zagrożenie dronowe", "drone threat", "дронова загроза"]],
  [/артилер|обстріл/i, ["ostrzał artyleryjski", "shelling", "артилерійський обстріл"]],
  [/авіа|літак/i, ["zagrożenie z powietrza", "air threat", "авіаційна загроза"]],
];
function raionReason(r) {
  const t = String(r || "").trim();
  if (!t) return "";
  const bez = t.replace(/\s*\([^)]*\)\s*$/, "");
  for (const [re, [pl, en, uk]] of RAION_REASON) if (re.test(bez)) return UI.t(pl, en, uk);
  return UI.isUk ? bez : `„${bez}"`;
}
/* „Конотопський район" zostawalo surowe w polskim i angielskim interfejsie.
   Nazwa wlasna nie ma polskiego odpowiednika, wiec transliterujemy rdzen
   i dokladamy przetlumaczone slowo „rejon". Po ukrainsku zostaje oryginal. */
function raionName(s) {
  const t = String(s || "").trim();
  if (!t || UI.isUk) return t;
  const rdzen = t.replace(/\s*район$/i, "");
  return UI.t(`rejon ${placeName(rdzen)}`, `${placeName(rdzen)} raion`, t);
}
function openRaionAlert(a) {
  markSelected(null, null);
  const since = Date.parse(a.s || "");
  const t = Number.isFinite(since) ? new Date(since).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
    { hour: "2-digit", minute: "2-digit" }) : "?";
  const where = a.w === "oblast" ? oblastPL(a.n)
    : `${raionName(a.n)}${a.o ? " · " + oblastPL(a.o) : ""}`;
  const lvl = a.l === "red" ? (UI.t("poziom czerwony", "red level", "червоний рівень")) : (UI.t("poziom żółty", "yellow level", "жовтий рівень"));
  showCard(`
    <div class="zone-head"><b style="color:${a.l === "red" ? "#ff6b78" : "#ffc04d"}">📢 ${esc2(where)}</b>
      <span style="color:#8fa3c4">· ${UI.t("alarm powietrzny w Ukrainie", "air-raid alert in Ukraine", "повітряна тривога в Україні")}</span></div>
    <span style="color:#8fa3c4">${UI.t(`Od ${t} · ${lvl}`, `Since ${t} · ${lvl}`, `Від ${t} · ${lvl}`)}${(() => { const r = raionReason(a.r); return r ? " · " + esc2(r) : ""; })()}</span><br>
    <span style="color:#9aa6be">${UI.t("Tylko do obserwacji — nie dolicza punktów. Punkty dają wyłącznie alarmy w obwodach blisko Polski (różowy obrys). Źródło: NEPTUN.", "Shown for information only — it adds no points. Points come only from alerts in the oblasts near Poland (pink outline). Source: NEPTUN.", "Лише для спостереження — балів не додає. Бали дають тільки тривоги в областях поблизу Польщі (рожевий контур). Джерело: NEPTUN.")}</span>`);
}
/* Kraje, które umiemy podświetlić: trzy bałtyckie (punktują) i sześć
   dołożonych 03.10.2026 w trybie cienia (karta i panel tak, punkty nie). */
const BALTIC_ISO3 = { LT: "LTU", LV: "LVA", EE: "EST",
  MD: "MDA", RO: "ROU", SK: "SVK", CZ: "CZE", SE: "SWE", HU: "HUN" };
function paintCountryAlerts(sigs) {
  if (!mapReady || !map.getSource("kraje")) return;
  const next = new Map();
  for (const s of sigs || []) {
    const iso = s.event_type === "baltic_alert" && BALTIC_ISO3[s.details?.country];
    if (!iso || s.cleared || (s.weight ?? 1) <= 0) continue;
    const e = next.get(iso) || { country: s.details.country, per: [], since: s.ts,
                                 sig: s, shadow: !!s.details.shadow };
    e.per.push({ voiv: s.voivodeship, points: Number(s.points) || 0,
                 wouldBe: Number(s.details.would_be) || 0 });
    if (s.ts < e.since) { e.since = s.ts; e.sig = s; }
    next.set(iso, e);
  }
  for (const iso of new Set([...countryAlerts.keys(), ...next.keys()]))
    map.setFeatureState({ source: "kraje", id: iso }, { alert: next.has(iso) });
  countryAlerts = next;
}
/* Karta podświetlonej Litwy, Łotwy albo Estonii — jak karta obwodu UA (22.09.2026). */
function openCountryAlert(e) {
  markSelected(null, null);
  const name = balticName(e.country);
  const since = new Date(e.since).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
    { hour: "2-digit", minute: "2-digit" });
  const quote = String(e.sig.title || "").replace(/^[^„]*/, "");
  const link = safeUrl(e.sig.details?.link);
  const art = link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc2(quote)}</a>` : esc2(quote);
  // `en` bylo tu uzyte, ale zadeklarowane dopiero w openOblastCard — karta
  // sasiada rzucala „ReferenceError: en is not defined" i NIE OTWIERALA SIE
  // ANI RAZU od 22.09.2026. Potwierdzone na produkcji 03.10 przy alarmie na Litwie.
  const en = UI.isEn;
  const num = (v) => en ? Number(v).toFixed(2).replace(/0$/, "") : Number(v).toFixed(2).replace(/0$/, "").replace(".", ",");
  // W trybie cienia punkty są zerowe z założenia. Pokazywanie „+0 pkt" przy
  // każdym województwie wyglądałoby jak zepsuta punktacja, więc piszemy, czego
  // zdarzenie dotyczy, i osobno — ile BY dawało, gdyby było włączone.
  const rows = e.shadow
    ? `${UI.t("Dotyczy", "Applies to", "Стосується")}: ${
        e.per.map(r => esc2(UI.voiv(r.voiv))).join(", ")}<br><b>${
        UI.t("0 pkt — obserwacja", "0 pt — observation only", "0 балів — лише спостереження")}</b>`
    : e.per.sort((a, b) => b.points - a.points).map(r =>
      `${UI.t("woj. ", "", "воєв. ")}${esc2(UI.voiv(r.voiv))}: <b>+${num(r.points)} ${UI.t("pkt", "pt", "бал.")}</b>`).join("<br>");
  const naj = Math.max(0, ...e.per.map(r => r.wouldBe || 0));
  const stopka = e.shadow
    ? UI.t(`Od 3 października 2026 Strażnik czyta też media w Mołdawii, Rumunii, na Słowacji, w Czechach, Szwecji i na Węgrzech. Na razie tylko obserwuje: takie doniesienie widać na mapie i w panelu sygnałów, ale NIE dodaje punktów i samo nie może niczego podnieść. Czeskie i słowackie redakcje piszą o cudzej przestrzeni powietrznej częściej niż o własnej, więc najpierw przez kilka tygodni sprawdzamy, czy filtr się nie myli. Gdyby wagi były włączone, to doniesienie dałoby najwyżej ${num(naj)} pkt.`,
           `Since 3 October 2026 Strażnik also reads the media in Moldova, Romania, Slovakia, Czechia, Sweden and Hungary. For now it only watches: a report like this shows on the map and in the signal panel, but adds NO points and cannot raise anything by itself. Czech and Slovak newsrooms write about other countries' airspace more often than their own, so the filter is being checked for a few weeks first. With the weights switched on, this report would add at most ${num(naj)} pt.`,
           `З 3 жовтня 2026 року Strażnik читає також медіа Молдови, Румунії, Словаччини, Чехії, Швеції та Угорщини. Поки що лише спостерігає: таке повідомлення видно на карті та в панелі сигналів, але воно НЕ додає балів і саме нічого не підвищує. Чеські та словацькі редакції пишуть про чужий повітряний простір частіше, ніж про власний, тому спершу кілька тижнів перевіряємо фільтр. З увімкненими вагами це повідомлення дало б щонайбільше ${num(naj)} бала.`)
    : UI.t("Kraje bałtyckie nie mają publicznego kanału alarmów, więc Strażnik czyta ich portale informacyjne i liczy tylko świeży tytuł ogłaszający alarm. Waga maleje z odległością: Litwa 0,3 pkt, Łotwa 0,18, Estonia 0,12 (zachodniopomorskie połowę). Artykuł o odwołaniu alarmu gasi podświetlenie.",
           "The Baltic states have no public alert feed, so Strażnik reads their news portals and counts only a fresh headline announcing the alert. The weight falls with distance: Lithuania 0.3 pt, Latvia 0.18, Estonia 0.12 (half of that for West Pomerania). An article about the alert ending clears the highlight.",
           "Країни Балтії не мають відкритого каналу тривог, тому Strażnik читає їхні інформаційні портали й рахує лише свіжий заголовок, що оголошує тривогу. Вага спадає з відстанню: Литва 0,3 бала, Латвія 0,18, Естонія 0,12 (Західнопоморське — половину). Стаття про відбій гасить підсвічення.");
  showCard(`
    <div class="zone-head"><b style="color:${e.shadow ? "#ffc04d" : "#ff6b78"}">📢 ${esc2(name)}</b>
      <span style="color:#8fa3c4">· ${e.shadow
        ? UI.t("zdarzenie w przestrzeni powietrznej (doniesienie mediów)", "airspace event (media report)", "подія в повітряному просторі (за повідомленнями ЗМІ)")
        : UI.t("alarm powietrzny (doniesienie mediów)", "air-raid alert (media report)", "повітряна тривога (за повідомленнями ЗМІ)")}</span></div>
    <span style="color:#8fa3c4">${UI.t(`Doniesienie z ${since}:`, `Reported at ${since}:`, `Повідомлення від ${since}:`)}</span> ${art}<br>
    ${rows}<br>
    <span style="color:#9aa6be">${stopka}</span>`);
}
function openOblastCard(p) {
  const e = oblastInfo.get(p.oblast);
  if (!e) return;
  markSelected(null, null);
  const en = UI.isEn;
  const name = UI.t(`Obwód ${p.pl}`, `${p.en} oblast`, `Область ${p.pl}`);
  const since = e.since ? new Date(e.since).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
    { hour: "2-digit", minute: "2-digit" }) : "?";
  const rows = e.per.sort((a, b) => b.points - a.points).map(r => {
    const km = r.km == null ? "" : r.km <= 0 ? (UI.t(" (przy granicy)", " (at the border)", " (біля кордону)")) : ` — ${r.km} km`;
    const pts = Number(r.points).toFixed(2).replace(/0$/, "");
    const counted = r.counted != null && Math.abs(r.counted - r.points) >= 0.01
      ? ` <span style="color:#9aa6be">(${UI.t("wliczone", "counted", "враховано")} ${en ? Number(r.counted).toFixed(1) : Number(r.counted).toFixed(1).replace(".", ",")} — ${UI.t("limit klasy", "class cap", "ліміт класу")})</span>` : "";
    const half = r.half ? ` <span style="color:#9aa6be">(${UI.t("połowa wagi — alarm trwa ponad 30 min", "half weight — the alert has lasted over 30 min", "половина ваги — тривога триває понад 30 хв")})</span>` : "";
    return `${UI.t("woj. ", "", "воєв. ")}${esc2(UI.voiv(r.voiv))}${km}: <b>+${UI.isEn ? pts : pts.replace(".", ",")} ${UI.t("pkt", "pt", "бал.")}</b>${half}${counted}`;
  }).join("<br>");
  showCard(`
    <div class="zone-head"><b style="color:#ff8aa3">📢 ${esc2(name)}</b>
      <span style="color:#8fa3c4">· ${UI.t("alarm powietrzny", "air-raid alert", "повітряна тривога")}</span></div>
    <span style="color:#8fa3c4">${UI.t(`Alarm trwa od ${since}.`, `Alert in progress since ${since}.`, `Тривога триває від ${since}.`)}</span><br>
    ${rows}<br>
    <span style="color:#9aa6be">${UI.t("Alarm ogłasza ukraińska obrona cywilna dla całego obwodu. Waga maleje z odległością od województwa (tabela w instrukcji), a cała klasa ma limit 1 pkt. Przez pierwsze 30 minut alarm liczy się w pełni, potem w połowie, dopóki trwa; gdy się skończy, punkty i podświetlenie znikają od razu.", "Ukraine's civil defence declares the alert for the whole oblast. Its weight falls with the distance from the province (table in the user guide), and the whole class is capped at 1 pt. For the first 30 minutes the alert counts in full, then at half weight while it lasts; when it ends, the points and the highlight disappear at once.", "Тривогу оголошує українська цивільна оборона для всієї області. Вага спадає з відстанню від воєводства (таблиця в інструкції), а весь клас має ліміт 1 бал. Перші 30 хвилин тривога рахується повністю, потім наполовину, доки триває; коли вона закінчується, бали й підсвічення зникають одразу.")}</span>`, { big: true });
}

function updateVoivStates() {
  if (histMode) return;   // mapa pokazuje wtedy chwilę wybraną suwakiem
  const voivs = state?.fusion?.voivodeships || {};
  const allSigs = Object.values(voivs).flatMap(st => st.signals || []);
  paintOblasts(allSigs);
  paintCountryAlerts(allSigs);
  paintRaionAlerts(state?.neptun?.alert_areas);
  for (const [name, st] of Object.entries(voivs)) {
    map.setFeatureState({ source: "voiv", id: name },
      { score: Math.min(st.score, 8), level: st.level, spill: spillRaised(st) });
  }
}

/* Audyt G10: NEPTUN przypisywał punktom katalogowym (centrum Kijowa, Łucka)
   promień 4 km, a pozycja „przybliżona” to w praktyce rejon miejscowości. Dla
   takich pozycji pokazujemy co najmniej 12 km — nie udajemy precyzji, której
   nie ma. Tylko wyświetlanie; punktacja używa pól źródła bez zmian. */
const APPROX_MIN_UNCERTAINTY_KM = 12;
/* Audyt G8: rakiety, KAB i balistyka mają w danych NEPTUN pozycję przybliżoną
   w 94–100% i nigdy kursu — to meldunek o rejonie, nie namiar. Pokazujemy szerszy
   rejon (25 km), żeby punkt na mapie nie udawał miejsca, w którym leci pocisk. */
const FAST_TYPES_AREA_KM = 25, FAST_TYPES = new Set(["missile", "cruise", "ballistic", "kab"]);
/* Meldunek „kursem na X" z pozycją przybliżoną: źródło stawia punkt ok. 40 km
   przed celem, na linii kursu (patrz naKursieDoCelu). Prawdziwe położenie to
   gdziekolwiek na tym korytarzu, więc 12 km zaniżało niepewność — decyzja
   usera 10.10.2026: 40 km, tyle, o ile źródło cofa punkt. */
const DESTINATION_AREA_KM = 40;
/* Dwie składowe rozbite osobno, bo karta obiektu ma je pokazać: sama suma
   zmienia się w czasie i bez rozbicia wyglądałaby na chwiejną daną ze źródła. */
function uncertaintyParts(t, nowMs) {
  const raw = Number(t?.uncertaintyKm);
  const km = Number.isFinite(raw) && raw > 0 ? raw : null;
  const rejon = Math.max(FAST_TYPES.has(t?.type) ? FAST_TYPES_AREA_KM : APPROX_MIN_UNCERTAINTY_KM,
    naKursieDoCelu(t) ? DESTINATION_AREA_KM : 0);
  const base = isApproxPosition(t) ? Math.max(km ?? 0, rejon) : km;
  if (base == null) return null;
  return { zgloszenie: Math.round(base), lot: Math.round(ageSlackKm(t, nowMs)) };
}
function shownUncertaintyKm(t, nowMs) {
  const p = uncertaintyParts(t, nowMs);
  return p == null ? null : p.zgloszenie + p.lot;
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

/* Audyt G9: identyfikator NEPTUN żyje zwykle ~6 min, a ten sam fizyczny obiekt
   wraca pod nowym id. Trasa urywała się przy każdej zmianie. Nowy obiekt tego
   samego typu, który pojawia się do 10 min po zniknięciu poprzednika w zasięgu
   „prędkość typowa × czas + niepewność + 10 km”, przejmuje jego trasę. Tylko
   rysowanie — punkty i sygnały dalej liczą się po identyfikatorach źródła. */
const endedTrails = new Map();   // id -> {type, pts, endedAt}
const endedType = new Map();     // id -> ostatni znany typ (znikający obiekt nie ma go już w paczce)
const TRAIL_JOIN_MS = 10 * 60000;
function inheritTrail(t, now) {
  let best = null;
  for (const [id, e] of endedTrails) {
    if (now - e.endedAt > TRAIL_JOIN_MS) { endedTrails.delete(id); continue; }
    if (e.type !== t.type || !e.pts.length) continue;
    const last = e.pts[e.pts.length - 1];
    const km = Math.hypot((t.lat - last.lat) * 110.57,
      (t.lon - last.lon) * 111.32 * Math.cos(t.lat * Math.PI / 180));
    const reach = (typeSpeedKmh(t) || 180) * (now - e.endedAt) / 3600000
      + (Number(t.uncertaintyKm) || 0) + 10;
    if (km <= reach && (!best || km < best.km)) best = { id, km, pts: e.pts };
  }
  if (!best) return null;
  endedTrails.delete(best.id);
  return best.pts.slice(-TRAIL_MAX_PTS);
}

function recordTrails(threats) {
  const alive = new Set();
  const now = Date.now();
  for (const t of threats) {
    if (t.lat == null || !t.id) continue;
    if (isApproxPosition(t)) {
      localTrails.delete(t.id);
      continue;
    }
    alive.add(t.id);
    if (!localTrails.has(t.id)) {
      const inherited = inheritTrail(t, now);
      if (inherited) localTrails.set(t.id, inherited);
    }
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
  const types = new Map(threats.map(t => [t.id, t.type]));
  for (const [id, pts] of localTrails) if (!alive.has(id)) {
    if (pts.length) endedTrails.set(id, { type: types.get(id) ?? endedType.get(id), pts, endedAt: now });
    localTrails.delete(id);
  }
  for (const t of threats) if (t.id) endedType.set(t.id, t.type);
  if (endedType.size > 2000) endedType.clear();
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
  ballistic: 3000, kab: 900, mig31k: 900, recon: 180 };
/* JEDYNE wejście do tablicy prędkości. Pięć miejsc czytało `TYPE_SPEED_KMH[t.type]`
   wprost, bez sprowadzania do małych liter, podczas gdy backend i engine.js robią
   `.lower()` wszędzie. Dziś NEPTUN podaje `uav` / `fpv` / `kab` małymi literami,
   więc to działało — ale przy zmianie zapisu w źródle prędkość wyszłaby
   `undefined`, a czas dolotu zniknąłby z kart BEZ ŻADNEGO BŁĘDU, po cichu.
   Nie czytać tej tablicy wprost; pilnuje tego scripts/test_predkosci.cjs. */
const typeSpeedKmh = (t) => TYPE_SPEED_KMH[String(t?.type || "").toLowerCase()] ?? null;
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
  return measuredTrackSpeed(t) ?? typeSpeedKmh(t); // zapas mapy: prędkość typowa dla klasy
}

/* Dead-reckoning USUNIĘTY 28.09.2026. Znacznik jechał zmierzonym kursem nawet
   18 km przed ostatni meldunek i pod Dorohuskiem wjeżdżał nad Polskę, choć sam
   meldunek został 0,2 km za granicą: karta pokazywała „odległość od granicy PL:
   0,2”, a ikona z okręgiem ±4 km stała 3 km w głębi kraju (nagranie czytelnika,
   zdarzenie z 28.09.2026). NEPTUN to zgłoszenia ludzi, nie radar — pozycji,
   której nikt nie zgłosił, nie wolno dorysowywać, a już na pewno nie po polskiej
   stronie granicy. Płynność ruchu daje glide między PRAWDZIWYMI meldunkami. */
/* Ile minut od ostatniego meldunku o obiekcie (NEPTUN potwierdza zgłoszeniami). */
function threatAgeMin(t, nowMs) {
  const seen = Date.parse(t.confirmedAt || t.updatedAt || "");
  if (!seen) return 0;
  return Math.max(0, Math.round((nowMs - seen) / 60000));
}
/* Ile obiekt mógł przelecieć od ostatniego meldunku. Rysujemy ostatnią znaną
   pozycję, więc okrąg niepewności musi rosnąć razem z wiekiem tej wiedzy —
   inaczej obiecuje precyzję, której już nie ma. Zgłoszenie z 30.09.2026: dron
   zgłoszony 4 minuty wcześniej miał okrąg ±12 km, choć przy 180 km/h mógł być
   12 km dalej, po drugiej stronie granicy. Ten sam rachunek (niepewność plus
   droga od potwierdzenia) robi od dawna etaInfo — tutaj tylko go widać.

   Powyżej 15 minut nie doliczamy więcej. Tyle samo przyjmuje reszta kodu za
   granicę, po której z meldunku nie da się już nic wnioskować (wygaszanie
   punktów, ostrzeżenie na karcie), a rosnący bez końca okrąg zalałby mapę.

   Szybkie typy zostają przy swoim stałym rejonie z audytu G8: dla rakiet, KAB
   i balistyki NEPTUN podaje rejon, nie namiar, i nigdy kursu — doliczanie im
   drogi udawałoby wiedzę o locie, której nie mamy. */
const AGE_SLACK_MAX_MIN = 15;
function ageSlackKm(t, nowMs) {
  if (FAST_TYPES.has(t?.type)) return 0;
  const kmh = Math.max(measuredTrackSpeed(t) || 0, typeSpeedKmh(t) || 0);
  if (!kmh) return 0;
  const min = Math.min(threatAgeMin(t, nowMs ?? nowRefMs()), AGE_SLACK_MAX_MIN);
  return kmh * (min / 60);
}
function ageAgoText(min) {
  const m = Number(min);
  if (!Number.isFinite(m) || m < 1) return UI.t("przed chwilą", "just now", "щойно");
  return ageLabel(m) + (UI.t(" temu", " ago", " тому"));
}
function ageLabel(min) {
  // jednostki też są językowe: ukraiński pisze „хв" i „год"
  const jm = UI.t("min", "min", "хв"), jg = UI.t("h", "h", "год");
  if (min < 60) return `${min} ${jm}`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ${jg} ${m} ${jm}` : `${h} ${jg}`;
}

/* Identyfikatory obiektów NEPTUN, które teraz wnoszą punkty (lustro panelu
   sygnałów: counted_points > 0). Zbiór liczony raz na stan, nie na klatkę. */
let countedTracks = new Set();
function refreshCountedTracks() {
  const ids = new Set();
  for (const st of Object.values(state?.fusion?.voivodeships || {}))
    for (const s of st.signals || [])
      if (s.source === "neptun" && (s.counted_points || 0) > 0 && s.details?.track_id != null)
        ids.add(String(s.details.track_id));
  countedTracks = ids;
}
const PULSE_MS = 1600;
let lastPulse = 0, pulseOff = false;
function pulseLoop(ts) {
  requestAnimationFrame(pulseLoop);
  // ~20 kl./s wystarcza; w tle, w historii i bez liczonych obiektów nic nie robimy
  if (!mapReady || ts - lastPulse < 50) return;
  lastPulse = ts;
  if (document.hidden || histMode || !countedTracks.size) {
    // wygaszamy raz, a nie co 50 ms — każde ustawienie to przerysowanie mapy
    if (!pulseOff && map.getLayer("threats-pulse")) map.setPaintProperty("threats-pulse", "circle-stroke-opacity", 0);
    pulseOff = true;
    return;
  }
  // Zgłoszenie 15.10.2026: przy wielu obiektach przesuwanie mapy w przeglądarce
  // przycinało. Puls przerysowuje mapę 20×/s, więc w trakcie przesuwania i przybliżania
  // stoi — wraca, gdy mapa się zatrzyma.
  if (map.isMoving()) return;
  pulseOff = false;
  const k = (ts % PULSE_MS) / PULSE_MS;
  // promień liczony tutaj z poziomu przybliżenia (liniowo 4→8, poza zakresem stały)
  // zamiast nowego wyrażenia „interpolate” 20×/s, które MapLibre musi za każdym
  // razem przetworzyć od nowa — wygląd ten sam
  const z = Math.min(1, Math.max(0, (map.getZoom() - 4) / 4));
  map.setPaintProperty("threats-pulse", "circle-radius", (11 + 12 * k) + ((20 + 20 * k) - (11 + 12 * k)) * z);
  map.setPaintProperty("threats-pulse", "circle-stroke-opacity", 0.9 * (1 - k));
}
requestAnimationFrame(pulseLoop);

/* Płynne przejście między meldunkami (1.7.53). Od 1.7.48 nie przesuwamy obiektu
   „na zapas” typową prędkością i domniemanym kursem (ikona odlatywała tam, gdzie drona
   nie było), więc bez tego stał do następnego meldunku i przeskakiwał — zgłoszenie
   użytkownika 16.09.2026 „drony stoją”. Teraz po nowej pozycji z NEPTUN-a ikona
   przejeżdża do niej przez GLIDE_MS po odcinku między dwoma prawdziwymi meldunkami:
   ruch jest widoczny, ale nigdy nie wyprzedza źródła. */
const GLIDE_MS = 45000, GLIDE_MAX_KM = 80;
const glides = new Map();   // id → { lat, lon (ostatni meldunek), dLat, dLon, start, shownLat, shownLon }
function glidePosition(t, target, now) {
  const id = String(t.id ?? "");
  const g = glides.get(id);
  if (!g) {
    glides.set(id, { lat: t.lat, lon: t.lon, dLat: 0, dLon: 0, start: 0, shownLat: target.lat, shownLon: target.lon, seen: now });
    return { ...target, gliding: false };
  }
  if (g.lat !== t.lat || g.lon !== t.lon) {           // nowy meldunek
    // po powrocie z tła lub z historii ikona od razu stoi w miejscu meldunku,
    // zamiast dojeżdżać ze starej pozycji
    const fresh = now - g.seen < 5000;
    const jump = kmBetween({ lat: g.shownLat, lon: g.shownLon }, target);
    const glide = fresh && jump <= GLIDE_MAX_KM;
    Object.assign(g, { lat: t.lat, lon: t.lon, start: glide ? now : 0,
      dLat: glide ? g.shownLat - target.lat : 0,
      dLon: glide ? g.shownLon - target.lon : 0 });
  }
  g.seen = now;
  const k = g.start ? Math.min(1, (now - g.start) / GLIDE_MS) : 1;
  const left = 1 - (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);   // ease-in-out
  const pos = { lat: target.lat + g.dLat * left, lon: target.lon + g.dLon * left, gliding: left > 0.001 };
  g.shownLat = pos.lat; g.shownLon = pos.lon;
  return pos;
}

let lastAnim = 0;
// Ostatnio narysowany stan warstw obiektów (zgłoszenie 15.10.2026 — przycinanie
// przy wielu obiektach). Cztery setData co 200 ms przebudowują i indeksują całe
// kolekcje GeoJSON, a potem mapa przelicza etykiety. Przebudowujemy tylko wtedy,
// gdy coś się zmieniło: nowy stan, trwające przejście ikony, upływ 15 s (wiek
// meldunku i okrąg niepewności rosną z czasem), inny tryb śladów albo nowe źródło.
let _animState = null, _animBucket = -1, _animMode = "", _animSrc = null;
function animate(ts) {
  requestAnimationFrame(animate);
  if (histMode) { _animState = null; return; }   // po wyjściu z historii rysujemy od nowa
  if (!mapReady || !state || ts - lastAnim < 200) return;
  // w trakcie przesuwania i przybliżania nie przebudowujemy warstw — to wtedy
  // najdroższe; ikony dojadą, gdy mapa się zatrzyma
  if (map.isMoving()) return;
  lastAnim = ts;
  const now = Date.now();
  const bucket = Math.floor(now / 15000), mode = trailMode("neptun"), src = map.getSource("threats");
  let glideActive = false;
  for (const g of glides.values()) if (g.start && now - g.start < GLIDE_MS) { glideActive = true; break; }
  if (!glideActive && _animState === state && _animBucket === bucket && _animMode === mode && _animSrc === src) return;
  _animState = state; _animBucket = bucket; _animMode = mode; _animSrc = src;
  const threats = state.neptun?.threats || [];
  const pts = [], trails = [], unc = [], course = [];
  const nMode = trailMode("neptun");
  const present = new Set();
  for (const t of threats) {
    if (t.lat == null || isNationalThreat(t)) continue;   // alarm ogólnokrajowy → komunikat
    const meta = TYPE_META[t.type] || { color: "#8a93a6" };
    present.add(String(t.id ?? ""));
    const p = glidePosition(t, { lat: t.lat, lon: t.lon }, now);
    // Zgłoszenie 14.09.2026: dziób ikony (kurs NEPTUN-a „kursem na X”) pokazywał
    // w inną stronę niż trasa i linia kierunku liczone z ruchu. Kurs zmierzony
    // z ruchu ma pierwszeństwo — ikona, przesuwanie i karta mówią to samo.
    const mh = measuredHeading(t);
    const shownHdg = mh ?? t.heading;
    const ageMin = threatAgeMin(t, now);
    pts.push({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { tid: String(t.id ?? ""),
        type: TYPE_META[t.type] ? t.type : "unknown", heading: shownHdg ?? 0,
        hdg_unknown: mh == null && (t.heading == null || t.pl_assessment?.heading_known === false),
        heading_measured: mh != null,
        heading_source: t.heading ?? null,
        color: meta.color,
        confidence: t.confidenceLevel || "?", uncertainty: shownUncertaintyKm(t, now) ?? "?",
        unc_lot: uncertaintyParts(t, now)?.lot ?? 0,
        opis: threatDesc(t), dist_km: t.pl_assessment?.dist_km,
        distance_text: threatDistanceText(t, t.pl_assessment?.dist_km),
        // werdykt kursu jedzie razem ze znacznikiem, żeby karta obiektu mówiła
        // to samo co lista sygnałów (zgłoszone 12.09.2026)
        toward_pl: t.pl_assessment?.toward_pl === true,
        heading_known: t.pl_assessment?.heading_known !== false,
        counted: countedTracks.has(String(t.id ?? "")),
        age_min: ageMin, age_label: ageLabel(ageMin),
        course_off: courseOffsetDeg(t),
        eta: etaHtml(t) } });
    const uncKm = shownUncertaintyKm(t, now);
    if (uncKm)
      unc.push({ type: "Feature", properties: { color: meta.color },
        geometry: { type: "Polygon", coordinates: circleCoords(p.lat, p.lon, uncKm) } });
    // ślad = to, co dało API + to, co sami zaobserwowaliśmy + pozycja bieżąca.
    // Dla przybliżonego rejonu nie łączymy kolejnych raportów w pozorną trasę.
    if (isApproxPosition(t) || nMode === "off") continue;
    if (nMode === "course") {
      const hdg = measuredHeading(t);
      const kmh = measuredTrackSpeed(t) || typeSpeedKmh(t);
      if (hdg != null && kmh) course.push(...courseFeatures(p.lat, p.lon, hdg, kmh, 30, meta.color));
    }
    const coords = trackPoints(t).map(q => [q.lon, q.lat]);
    // w trakcie przejścia linia kończy się na ikonie, a nie na nowym meldunku przed nią
    if (p.gliding && coords.length
        && kmBetween({ lat: coords[coords.length - 1][1], lon: coords[coords.length - 1][0] },
                     { lat: t.lat, lon: t.lon }) < 0.3) coords.pop();
    const lastC = coords[coords.length - 1];
    if (!lastC || kmBetween({ lat: lastC[1], lon: lastC[0] }, p) >= 0.3) coords.push([p.lon, p.lat]);
    if (coords.length >= 2)
      trails.push({ type: "Feature", properties: { color: meta.color },
        geometry: { type: "LineString", coordinates: coords } });
  }
  for (const id of glides.keys()) if (!present.has(id)) glides.delete(id);
  map.getSource("threats")?.setData({ type: "FeatureCollection", features: pts });
  map.getSource("trails")?.setData({ type: "FeatureCollection", features: trails });
  map.getSource("course")?.setData({ type: "FeatureCollection", features: course });
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
    // własny zapis trasy (jak dla obiektów NEPTUN): dopisujemy realne przesunięcia;
    // po otwarciu aplikacji zaczynamy od krótkiej historii z serwera
    let arr = adsbTrails.get(p.hex) || [];
    const srv = state?.adsb?.trails?.[p.hex];
    if (srv && srv.length > arr.length)
      arr = srv.map(q => ({ lat: q.lat, lon: q.lon, t: (q.t || 0) * 1000 }));
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
    ? `${UI.t("PODGLĄD HISTORII", "HISTORY VIEW", "ПЕРЕГЛЯД ІСТОРІЇ")} — ${watchClock(at)}`
    : (UI.t("NA ŻYWO — bieżące obserwacje", "LIVE — current observations", "НАЖИВО — поточні спостереження"));
  document.getElementById("watch-scope").textContent = histMode
    ? (UI.t("Maszyny w migawce i wcześniejsze ostatnie obserwacje", "Aircraft in the snapshot and earlier last observations", "Машини у знімку й раніші останні спостереження"))
    : (UI.t("W zasięgu teraz", "Currently in range", "Зараз у зоні"));
  document.getElementById("watch-sync").textContent = standalone
    ? (UI.t("Tryb awaryjny: wyłącznie dziennik lokalny.", "Fallback: local journal only.", "Аварійний режим: лише локальний журнал."))
    : watchSyncState === "error"
      ? (UI.t("Dziennik serwera niedostępny — pokazano dostępne wpisy z pamięci i lokalne.", "Server journal unavailable — showing available cached/local entries.", "Журнал сервера недоступний — показано доступні записи з пам'яті та локальні."))
      : watchSyncState === "loading"
        ? (UI.t("Pobieranie dziennika serwera…", "Loading server journal…", "Завантаження журналу сервера…"))
        : (UI.t("Dziennik serwera i lokalny · ostatnie 12 godzin · wpisy nie późniejsze niż wyświetlany czas", "Server and local journal · last 12 hours · entries no later than the displayed time", "Журнал сервера й локальний · останні 12 годин · записи не пізніші за показаний час"));
  document.getElementById("watch-current").innerHTML = cur.length ? cur.map(p => {
    const c = hexCountry(p.hex);
    return `<div class="watch-row clickable" data-hex="${esc(p.hex)}" data-lat="${p.lat}" data-lon="${p.lon}" data-kind="plane">
      <b>${c ? c.flag + " " : ""}${esc(p.callsign || p.hex)}</b>${p.reg ? ` · ${UI.t("rej.", "reg.", "реєстр.")} ` + esc(p.reg) : ""}
      <div class="meta">${esc(acName(p.type, p.desc))}${p.area ? ` · ${UI.t("nad", "over", "над")}: <b>` + esc(p.area) + "</b>" : ""}
        ${p.alt != null ? " · " + esc(altText(p.alt)) : ""}</div>
        ${p.historicalOnly ? `<div class="fineprint">${UI.t("Ostatnia obserwacja", "Last observation", "Останнє спостереження")} ${watchClock(p.observedAt)} — ${UI.t("brak w migawce", "not in snapshot", "немає у знімку")}</div>` : ""}</div>`;
  }).join("") : `<div class="fineprint">${UI.t("Brak maszyn RU/BY z pozycją w tym widoku. Brak danych nie oznacza braku maszyn w powietrzu.", "No RU/BY aircraft with a position in this view. No data does not imply an empty airspace.", "Немає машин РФ/РБ з позицією в цьому виді. Відсутність даних не означає, що в повітрі їх немає.")}</div>`;
  document.getElementById("watch-events").innerHTML = events.length ? events.map(e =>
    `<div class="watch-ev"><span class="${e.kind === "enter" ? "ev-in" : "ev-out"}">${e.kind === "enter"
      ? (UI.t("▲ w zasięgu", "▲ in range", "▲ у зоні")) : (UI.t("▼ zniknął", "▼ disappeared", "▼ зник"))}</span>
      ${e.flag ? e.flag + " " : ""}${esc(e.callsign || e.label || e.reg || e.hex)}${e.reg && e.reg !== (e.callsign || e.label || e.reg || e.hex) ? " · " + esc(e.reg) : ""}${e.area ? " · " + esc(e.area) : ""}
      <span class="ts">${watchClock(e.t)} · ${Math.max(0, Math.floor((at - e.t) / 60000))} min ${UI.t("przed wyświetlanym czasem", "before displayed time", "перед показаним часом")}</span></div>`).join("")
    : `<div class="fineprint">${UI.t("Brak zapisanych zdarzeń przed wyświetlanym czasem.", "No recorded events before the displayed time.", "Немає записаних подій перед показаним часом.")}</div>`;
  document.querySelectorAll("#watch-current .watch-row").forEach(el =>
    el.addEventListener("click", () => {
      const p = cur.find(p => p.hex === el.dataset.hex);
      document.getElementById("watch").close(); focusOnMap(el.dataset);
      if (p) openPlanePopup([p.lon, p.lat], p);
    }));
}
function watchClock(t) {
  return new Date(t).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
let watchSyncState = "loading", watchFetchAt = 0, watchFetchPending = false;
async function refreshWatchEvents() {
  if (standalone || watchFetchPending || Date.now() - watchFetchAt < 60000) return;
  const base = apiBase(); if (!base) return;
  watchFetchAt = Date.now(); watchFetchPending = true; watchSyncState = "loading";
  try {
    const r = await fetch(base + "/api/adsb/watch?hours=12", {signal: timeoutSignal(12000), cache: "no-store"});
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
/* W trybie historii czas liczymy względem chwili wybranej suwakiem, nie teraz:
   „5 h 18 min temu" przy sygnale z przewijanej migawki myliło (zgłoszone
   13.09.2026). Obiekty z migawki nie mają pola updatedAt — wcześniej wychodziło
   „NaN h NaN min temu". */
function relTime(iso) {
  const t = new Date(iso).getTime();
  const hist = histMode && historyAdsbTime != null;
  if (!Number.isFinite(t)) return hist ? (UI.t("w tej migawce", "in this snapshot", "у цьому знімку")) : "";
  const d = ((hist ? historyAdsbTime : Date.now()) - t) / 60000;
  const ago = hist ? (UI.t("wcześniej", "earlier", "раніше")) : (UI.t("temu", "ago", "тому"));
  if (d < 1) return hist ? (UI.t("w tej chwili", "at this moment", "цієї миті")) : (UI.t("przed chwilą", "just now", "щойно"));
  if (d < 60) return `${Math.round(d)} min ${ago}`;
  return `${Math.floor(d / 60)} h ${Math.round(d % 60)} min ${ago}`;
}
const esc = (s) => String(s ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const esc2 = esc;
/* Adres z kanału RSS to treść z zewnątrz, a `esc` zamienia tylko znaki HTML —
   sam schemat przepuszczał. Dopuszczamy wyłącznie http(s), żeby „javascript:"
   z przejętego lub złośliwego kanału nie stało się klikalnym kodem w WebView.
   Odrzucamy też adresy WŁASNEGO originu: w aplikacji to `http://localhost`,
   a Capacitor do 8.4.2 ładował cudzą stronę w naszym originie po kliknięciu
   w `/_capacitor_http_interceptor_?u=…` (GHSA-rvm3-566m-v7fv, 10.10.2026).
   Link ze źródła zewnętrznego nie ma po co prowadzić do nas samych. */
const safeUrl = (u) => {
  const raw = String(u ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.origin === location.origin) return "";
    return parsed.href;
  } catch { return ""; }
};

/* Które karty województw są rozwinięte — stan trzymany poza DOM, bo listę
   przebudowujemy przy każdym odświeżeniu stanu. */
const openVoivs = new Set();

/* ── Licznik dronów i rakiet na mapie (14.10.2026) ──────────────────────────
   Decyzje usera: drony = uav, shahed, recon; rakiety = manewrujące, balistyczne
   i KAB (bomba szybująca, w opisie osobno); bez FPV, MiG-31K i nieznanych.
   Licznik liczy DOKŁADNIE to, co rysuje mapa. Próba z doliczaniem obiektów
   zgubionych z feedu (≤15 min) dawała na emulatorze ~2× więcej niż ikon
   (np. 86 przy 44) — zgubione prawie nigdy nie wracają pod tym samym numerem.
   User wybrał „tyle, ile ikon”; okno po dotknięciu mówi, dlaczego liczba skacze. */
const LICZNIK_DRONY = new Set(["uav", "shahed", "recon"]);
const LICZNIK_RAKIETY = new Set(["missile", "cruise", "ballistic", "kab"]);
/* Obiekty z pozycją (te rysuje mapa), bez alarmów ogólnokrajowych. Ta sama funkcja
   dla stanu na żywo i dla migawki historii. */
function licznikZObiektow(threats) {
  const l = { drony: 0, rakiety: 0, kab: 0 };
  for (const t of threats || []) {
    if (t.lat == null || isNationalThreat(t)) continue;
    const typ = String(t.type || "").toLowerCase();
    if (LICZNIK_DRONY.has(typ)) l.drony++;
    else if (LICZNIK_RAKIETY.has(typ)) { l.rakiety++; if (typ === "kab") l.kab++; }
  }
  return l;
}
/* Odmiana: PL i UK mają trzy formy (1 / 2–4 / 5+), EN dwie. */
function odmiana(n, pl, en, uk) {
  const d = n % 10, s = n % 100;
  const few = d >= 2 && d <= 4 && !(s >= 12 && s <= 14);
  if (UI.isEn) return `${n} ${n === 1 ? en[0] : en[1]}`;
  if (UI.isUk) return `${n} ${d === 1 && s !== 11 ? uk[0] : few ? uk[1] : uk[2]}`;
  return `${n} ${n === 1 ? pl[0] : few ? pl[1] : pl[2]}`;
}
function licznikDrony(n) { return odmiana(n, ["dron", "drony", "dronów"], ["drone", "drones"], ["дрон", "дрони", "дронів"]); }
function licznikRakiety(n) { return odmiana(n, ["rakieta", "rakiety", "rakiet"], ["missile", "missiles"], ["ракета", "ракети", "ракет"]); }
function licznikZdanie(l) {
  return `${UI.t("Na mapie", "On the map", "На мапі")}: ${licznikDrony(l.drony)} ${UI.t("i", "and", "і")} ${licznikRakiety(l.rakiety)}`
    + (l.kab ? ` (${UI.t("w tym", "incl.", "з них")} ${l.kab} KAB)` : "") + ".";
}
function licznikGodzina(d) {
  return d.toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" });
}
let licznikStan = null, licznikChwila = null;
/* `chwila` = godzina migawki w historii; null = na żywo. */
function odswiezLicznik(l = licznikZObiektow(state?.neptun?.threats), chwila = null) {
  const el = document.getElementById("licznik");
  if (!el) return;
  licznikStan = l; licznikChwila = chwila;
  el.hidden = false;
  for (const [id, n] of [["lk-drony", l.drony], ["lk-rakiety", l.rakiety]]) {
    const poz = document.getElementById(id);
    poz.querySelector(".lk-n").textContent = n;
    poz.classList.toggle("zero", n === 0);
  }
  const zegar = el.querySelector(".lk-zegar");
  zegar.hidden = !chwila; zegar.textContent = chwila ? licznikGodzina(chwila) : "";
  el.classList.toggle("historyczny", !!chwila);
  /* Nazwa przycisku zawiera widoczne liczby (WCAG 2.5.3). Bez aria-live — liczby
     zmieniają się co kilka sekund; czytnik dostaje je w „sytuacji jednym zdaniem”. */
  el.setAttribute("aria-label", (chwila ? `${UI.t("O", "At", "О")} ${licznikGodzina(chwila)}. ` : "")
    + licznikZdanie(l) + " " + UI.t("Co liczymy?", "What is counted?", "Що враховано?"));
  el.title = UI.t("Drony i rakiety na mapie — dotknij, żeby zobaczyć, co liczymy",
    "Drones and missiles on the map — tap to see what is counted",
    "Дрони й ракети на мапі — торкніться, щоб побачити, що враховано");
  if (document.getElementById("licznik-okno")?.open) wypelnijOknoLicznika();
}
/* Okno po dotknięciu: co jest liczone, czego nie liczymy i dlaczego liczba bywa
   większa niż ikon na mapie (uwaga usera: „ma być jasno wyjaśnione ludziom”). */
function wypelnijOknoLicznika() {
  const l = licznikStan;
  if (!l) return;
  const ustaw = (id, tekst) => { const e = document.getElementById(id); if (e) e.textContent = tekst; };
  ustaw("lk-x-t", UI.t("Zamknij", "Close", "Закрити"));
  ustaw("lk-h", UI.t("Drony i rakiety na mapie", "Drones and missiles on the map", "Дрони й ракети на мапі"));
  ustaw("lk-kiedy", licznikChwila
    ? UI.t("Historia — stan o ", "History — as of ", "Історія — стан о ") + licznikGodzina(licznikChwila)
    : UI.t("Na żywo — dane z ", "Live — data from ", "Наживо — дані з ") + licznikGodzina(new Date(threatsReceivedAt || Date.now())));
  ustaw("lk-o-drony", l.drony);
  ustaw("lk-o-drony-t", UI.t("Drony", "Drones", "Дрони"));
  ustaw("lk-o-drony-d", UI.t("Shahed i inne drony bojowe oraz drony rozpoznawcze.",
    "Shahed and other attack drones, plus reconnaissance drones.",
    "Shahed та інші ударні дрони, а також розвідувальні дрони."));
  ustaw("lk-o-rakiety", l.rakiety);
  ustaw("lk-o-rakiety-t", UI.t("Rakiety i bomby KAB", "Missiles and KAB bombs", "Ракети й бомби KAB"));
  ustaw("lk-o-rakiety-d", UI.t("Rakiety manewrujące i balistyczne oraz bomby szybujące KAB",
    "Cruise and ballistic missiles plus KAB glide bombs",
    "Крилаті й балістичні ракети та керовані авіабомби KAB")
    + (l.kab ? ` (${UI.t("teraz KAB", "KAB now", "зараз KAB")}: ${l.kab})` : "") + ".");
  ustaw("lk-uwaga-h", UI.t("Dlaczego liczba skacze?", "Why does the number jump?", "Чому число стрибає?"));
  ustaw("lk-uwaga-p", UI.t(
    "Licznik pokazuje dokładnie to, co mapa. Źródło danych (NEPTUN) usuwa obiekty kilka minut po ostatnim potwierdzeniu, często całymi grupami, a nowe meldunki też przychodzą paczkami. Dlatego liczba potrafi w kilka minut spaść i znów wzrosnąć — spadek nie musi oznaczać końca ataku.",
    "The counter shows exactly what the map shows. The data source (NEPTUN) removes objects a few minutes after their last confirmation, often in whole groups, and new reports also arrive in batches. So the number can drop and rise again within minutes — a drop does not necessarily mean the attack is over.",
    "Лічильник показує саме те, що й мапа. Джерело даних (NEPTUN) прибирає об'єкти через кілька хвилин після останнього підтвердження, часто цілими групами, а нові повідомлення теж надходять пачками. Тому число може за кілька хвилин упасти й знову зрости — спад не обов'язково означає кінець атаки."));
  ustaw("lk-nie", UI.t("Nie liczymy: dronów FPV przy linii frontu, samolotów (np. MiG-31K) ani obiektów bez określonego rodzaju.",
    "Not counted: FPV drones at the front line, aircraft (e.g. MiG-31K) or objects of unknown type.",
    "Не враховуємо: FPV-дрони на лінії фронту, літаки (напр. MiG-31K) та об'єкти невідомого типу."));
  ustaw("lk-zrodlo", UI.t("Licznik pokazuje obiekty nad Ukrainą i przy granicy — to nie jest ostrzeżenie dla Twojego województwa. O zagrożeniu mówi poziom alarmu i kolor województwa.",
    "The counter shows objects over Ukraine and near the border — it is not a warning for your province. The alert level and province colour tell you about the threat.",
    "Лічильник показує об'єкти над Україною та біля кордону — це не попередження для вашого воєводства. Про загрозу говорять рівень тривоги та колір воєводства."));
  ustaw("lk-sygnaly", UI.t("Pokaż sygnały", "Show signals", "Показати сигнали"));
}
const oknoLicznika = document.getElementById("licznik-okno");
document.getElementById("licznik")?.addEventListener("click", () => {
  if (!licznikStan || !oknoLicznika) return;
  wypelnijOknoLicznika();
  oknoLicznika.showModal();
});
document.getElementById("lk-sygnaly")?.addEventListener("click", () => {
  oknoLicznika?.close();
  setPanel(true);
});

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
  const show = voivs.filter(([n, st]) => st.score > 0 || PRIORITY.includes(n)
    || n === mine || forcedVoivs.has(n));
  if (mine) show.sort((a, b) => (b[0] === mine) - (a[0] === mine));
  // Rozwinięte karty i pozycja przewinięcia MUSZĄ przeżyć przebudowę listy:
  // panel odświeża się przy każdym stanie z serwera i co 30 s, więc rozwinięta
  // karta zwijała się sama, a treść „uciekała" spod palca (zgłoszone 12.09.2026).
  const panelEl = document.getElementById("panel");
  const keepScroll = panelEl?.scrollTop || 0;

  /* Nagłówek panelu: tytuł, progi RAZ i krzyżyk ze słowem. Progi stały
     wcześniej w każdej karcie z osobna — przy szesnastu województwach to
     szesnaście razy to samo zdanie na jednym ekranie. */
  document.getElementById("panel-title").textContent =
    UI.t("Województwa", "Provinces", "Воєводства");
  document.getElementById("panel-progi").textContent =
    `${UI.t("progi", "thresholds", "пороги")}: ≥${f.thresholds.elevated} ${
      UI.t("uwaga", "attention", "увага")}, ≥${f.thresholds.high} ${
      UI.t("priorytet", "priority", "пріоритет")}`;
  document.getElementById("panel-x-txt").textContent =
    UI.t("Zamknij", "Close", "Закрити");
  const xBtn = document.getElementById("panel-x");
  xBtn.title = UI.t("Zamknij panel województw", "Close the provinces panel",
                    "Закрити панель воєводств");
  xBtn.setAttribute("aria-label", xBtn.title);

  /* Pełną kartę dostaje mój region, wszystko z jakimkolwiek wynikiem i to, co
     użytkownik sam otworzył z mapy. Reszta — czyli województwa priorytetowe,
     w których akurat nic się nie dzieje — schodzi do jednej linii. Wcześniej
     każde z nich zajmowało pustą kartę z powtórzonymi progami. */
  const pelne = show.filter(([n, st]) => st.score > 0 || n === mine || forcedVoivs.has(n));
  const ciche = show.filter(([n, st]) => !(st.score > 0 || n === mine || forcedVoivs.has(n)));
  const quietEl = document.getElementById("voiv-quiet");
  /* Podpis idzie WŁASNĄ linią, nie w jednym wierszu z kafelkami: przy trzech
     nazwach pierwsza wchodziła na napis „Bez sygnałów:". */
  quietEl.innerHTML = ciche.length
    ? `<h2>${UI.t("Bez sygnałów", "No signals", "Без сигналів")}</h2>`
      + ciche.map(([n]) =>
        `<button type="button" class="vq-name" data-voiv="${esc(n)}">${esc(UI.voiv(n))}</button>`).join("")
    : "";
  document.getElementById("voiv-cards").innerHTML = pelne.map(([name, st]) => `
    <div class="voiv-card level-${spillRaised(st) ? "spill" : st.level}${name === mine ? " is-mine" : ""}${
      openVoivs.has(name) ? " open" : ""}" data-voiv="${esc(name)}">
      <button type="button" class="voiv-head" aria-expanded="${openVoivs.has(name)}">
        <span class="voiv-name">${esc(UI.voiv(name))}</span>
        <span class="voiv-score">${pktTxt(st.score)} ${UI.t("pkt", "pts", "бал.")}</span>
      </button>
      <div class="voiv-level">${spillRaised(st) ? SPILL_LABEL
        : st.level === "none" && st.score > 0
        ? (UI.t("poniżej progu", "below threshold", "нижче порога")) : LEVEL_LABEL[st.level]}</div>
      ${podtrzymanieHTML(st.podtrzymanie)}
      ${scoreBreakdown(st)}
      ${zonesRowHTML(name)}
      <div class="voiv-breakdown">${st.signals.length
        ? sigList(st.signals)
        : `<div class="fineprint">${UI.t("brak sygnałów w oknie", "no signals in the window", "у вікні немає сигналів")}</div>`}
        ${camIndex?.has(name)
          ? `<button class="chip btn-cams" data-voiv="${esc(name)}">📷 ${UI.t("Kamery w regionie", "Cameras in the region", "Камери в регіоні")}
               (${camData[name].filter(c => c.outdoor !== false).length})</button>`
          : ""}</div>
    </div>`).join("");
  /* Klik dalej łapiemy na całej karcie — dotykowo tak jest wygodniej i tak było
     dotąd. Nagłówek jest przyciskiem tylko po to, żeby dało się tu dojść
     klawiszem Tab: naciśnięcie Enter albo spacji wywołuje zwykły klik, który
     bąbelkuje do karty, więc obsługa jest jedna, nie dwie. */
  document.querySelectorAll(".voiv-card").forEach(el =>
    el.addEventListener("click", () => {
      const open = el.classList.toggle("open");
      const name = el.dataset.voiv;
      if (open) openVoivs.add(name); else openVoivs.delete(name);
      el.querySelector(".voiv-head")?.setAttribute("aria-expanded", String(open));
    }));
  document.querySelectorAll("#voiv-quiet .vq-name").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); openCard(el.dataset.voiv); }));
  if (panelEl && keepScroll) panelEl.scrollTop = keepScroll;
  document.querySelectorAll(".btn-cams").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); showCameras(el.dataset.voiv); }));
  document.querySelectorAll(".btn-zone").forEach(el =>
    el.addEventListener("click", (e) => { e.stopPropagation(); openZoneByName(el.dataset.zone); }));
  /* Klik w „Dane techniczne" nie może zwinąć całej karty — klik na karcie
     przełącza jej rozwinięcie, a to bąbelkuje z podsumowania. */
  document.querySelectorAll(".voiv-zones > summary").forEach(el =>
    el.addEventListener("click", (e) => e.stopPropagation()));

  // baner mojego regionu — zawsze widoczny, niezależnie od panelu
  const banner = document.getElementById("my-banner");
  if (mine && f.voivodeships[mine]) {
    const st = f.voivodeships[mine];
    const poziom = spillRaised(st) ? "spill" : st.level;
    banner.className = "level-" + poziom;
    // Znak przed tekstem zmienia KSZTAŁT razem z kolorem (kropka → trójkąt →
    // kwadrat z wykrzyknikiem), żeby stan dało się odczytać bez rozróżniania barw.
    // Sam kształt rysuje CSS; tutaj tylko wykrzyknik przy wysokim poziomie.
    // „brak sygnałów 1.9 pkt" przeczyło samo sobie (zgłoszone 13.09.2026) — przy
    // punktach poniżej progu baner mówi to samo co karta województwa
    banner.innerHTML = `<span class="znak" aria-hidden="true">${poziom === "high" ? "!" : ""}</span>`
      + `<span><b>${esc(UI.voiv(mine))}</b> — <span class="lvl">${
      spillRaised(st) ? SPILL_LABEL
      : st.level === "none" && st.score > 0 ? (UI.t("poniżej progu", "below threshold", "нижче порога"))
      : LEVEL_LABEL[st.level]}</span>
      <span class="muted">${pktTxt(st.score)} ${UI.t("pkt", "pts", "бал.")}${st.podtrzymanie?.do
        ? " · " + UI.t("podtrzymany do", "held until", "утримується до") + " "
          + new Date(st.podtrzymanie.do).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" })
        : ""}</span>${bezPotwierdzenia(st)}</span>`;
    banner.onclick = () => { setPanel(true); openCard(mine); };
  } else {
    banner.className = "hidden";
    banner.innerHTML = "";
  }
  if (!histMode) renderNationalBanner(state?.neptun?.threats);
  if (!histMode) odswiezLicznik();

  const sigs = [];
  for (const [name, st] of voivs) for (const s of st.signals) sigs.push(s);
  sigs.sort((a, b) => b.ts.localeCompare(a.ts));
  document.getElementById("signal-list").innerHTML = sigList(sigs);
  document.getElementById("signal-unscored").innerHTML = unscoredHTML(state);
  renderObservationLists(state);
}

/* Zasięg obu list obiektów w panelu — ta sama liczba w nagłówku sekcji. */
const NEAR_LIST_KM = 250;

/** Kąt między kursem obiektu a azymutem na najbliższy punkt granicy (stopnie). */
function courseOffsetDeg(t) {
  const a = t.pl_assessment;
  if (!a || a.bearing_to_border == null || t.heading == null) return null;
  // `%` w JS zachowuje znak: kurs 1° i azymut 298° dawały „297° od kierunku na
  // granicę” zamiast 63° (karta drona pod Tokmakiem, 13.09.2026)
  const diff = ((t.heading - a.bearing_to_border) % 360 + 540) % 360 - 180;
  return Math.round(Math.abs(diff));
}

/* Obiekty blisko granicy, które NIE wnoszą punktów. Pokazujemy je razem z
   sygnałami — inaczej użytkownik widzi znacznik na mapie, nie znajduje go na
   liście i wygląda to, jakby aplikacja go przeoczyła (zgłoszone 12.09.2026).
   Powód braku punktów podajemy wprost, żeby zero dało się sprawdzić. */
function unscoredHTML(viewState) {
  const rows = (viewState?.neptun?.threats || [])
    .filter(t => t.pl_assessment && t.pl_assessment.dist_km <= NEAR_LIST_KM
                 && t.pl_assessment.toward_pl === false)
    .sort((a, b) => a.pl_assessment.dist_km - b.pl_assessment.dist_km);
  if (!rows.length) return "";
  const head = `<div class="unscored-head">${UI.t(`Na mapie, ale bez punktów (${rows.length})`, `On the map, but scoring 0 pts (${rows.length})`, `На мапі, але без балів (${rows.length})`)}</div>`;
  return head + rows.map(t => {
    const a = t.pl_assessment;
    const m = TYPE_META[t.type] || { label: t.type, color: "#8a93a6" };
    const off = courseOffsetDeg(t);
    const why = a.heading_known === false
      ? (UI.t("kurs nieznany — nie liczymy jako zbliżający się", "heading unknown — not counted as approaching", "курс невідомий — не рахуємо як наближення"))
      : off != null
        ? (UI.t(`kurs ${off}° od kierunku na Polskę`, `heading ${off}° away from the direction to Poland`, `курс ${off}° від напрямку на Польщу`))
        : (UI.t("kurs nie prowadzi na Polskę", "not heading towards Poland", "курс не веде на Польщу"));
    return `<div class="threat-row clickable unscored" data-lat="${t.lat}" data-lon="${t.lon}"
      data-kind="threat" data-id="${esc(t.id)}">
      <b style="color:${m.color}">${esc(UI.type(t.type, m.label))}</b>
      — ${threatDistanceText(t, a.dist_km)} ${UI.t("od granicy", "from the border", "від кордону")}
      <span class="zero">0 ${UI.t("pkt", "pts", "бал.")}</span>
      <div class="meta">${esc(why)} · ${UI.t("wiarygodność", "confidence", "достовірність")}: ${
        esc(UI.confidence(t.confidenceLevel, CONF_PL[t.confidenceLevel] || t.confidenceLevel))
      } · ${relTime(t.updatedAt)}</div>
    </div>`;
  }).join("");
}

function renderObservationLists(viewState) {
  const near = (viewState.neptun?.threats || [])
    .filter(t => t.pl_assessment && t.pl_assessment.dist_km <= NEAR_LIST_KM)
    .sort((a, b) => a.pl_assessment.dist_km - b.pl_assessment.dist_km);
  document.getElementById("threat-list").innerHTML = near.map(t => {
    const m = TYPE_META[t.type] || { label: t.type, color: "#8a93a6" };
    const a = t.pl_assessment;
    return `<div class="threat-row clickable" data-lat="${t.lat}" data-lon="${t.lon}"
      data-kind="threat" data-id="${esc(t.id)}">
      <b style="color:${m.color}">${esc(UI.type(t.type, m.label))}</b>
      — ${threatDistanceText(t, a.dist_km)} ${UI.t("od granicy", "from the border", "від кордону")} (${esc(UI.voiv(a.border_voiv))})${
        a.heading_known === false
          ? ` · <b style='color:#ffb020'>${UI.t("kurs nieznany", "unknown heading", "курс невідомий")}</b>`
          : (a.toward_pl ? ` · <b style='color:#ff4d5e'>${UI.t("kurs na PL", "heading towards Poland", "курс на Польщу")}</b>` : "")}
      ${(() => { const e = etaInfo(t);
        return e && e.border != null
          ? `<div class="meta eta-row">⏱ ${UI.t("do granicy", "to border", "до кордону")} <b>${etaRangeTxt(e.borderLo, e.border)}</b>${
              e.voiv != null ? ` · ${UI.t("do woj.", "to", "до воєв.")} ${esc(UI.voiv(e.voivName))} <b>${etaRangeTxt(e.voivLo, e.voiv)}</b>` : ""}</div>`
          : ""; })()}
      ${localPlaceHtml(t)}
      ${isApproxPosition(t) ? `<div class="meta">${approxPositionNote(t)}</div>` : ""}
      <div class="meta">${UI.t("wiarygodność", "confidence", "достовірність")}: ${esc(UI.confidence(t.confidenceLevel, CONF_PL[t.confidenceLevel] || t.confidenceLevel))}
        · ±${esc(shownUncertaintyKm(t) ?? "?")} km · ${esc(threatDesc(t))} · ${relTime(t.updatedAt)}</div>
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
      ${role ? `<div style="color:#9fd8ec;font-size:0.7333rem">${esc(roleText(role))}</div>` : ""}
      <div class="meta">
        ${UI.t("woj.", "province", "воєв.")} ${esc(UI.voiv(p.voivodeship))}
        · ${altText(p.alt)}
        ${vr ? (vr > 100 ? " ↑" : vr < -100 ? " ↓" : "") : ""}
        ${p.gs != null ? ` · ${ktToKmh(p.gs)} km/h` : ""}
        ${p.track != null ? ` · ${UI.t("kurs", "heading", "курс")} ${Math.round(p.track)}° (${compass(p.track)})` : ""}
      </div>
      <div class="meta">${p.reg ? (UI.t("rej. ", "reg. ", "реєстр. ")) + esc(p.reg) : ""}${p.op ? " · " + esc(p.op) : ""}</div>
      ${p.historicalOnly ? `<div class="fineprint">${UI.t("Ostatnia obserwacja", "Last observation", "Останнє спостереження")} ${watchClock(p.observedAt)} — ${UI.t("brak w migawce", "not in snapshot", "немає у знімку")}</div>` : ""}
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
/* Sygnał z ostatnich pięciu minut jest ŚWIEŻY i idzie na górę listy niezależnie od
   wkładu. Sama kolejność po punktach tłumaczyła wynik, ale nowy obiekt wart 0,1 pkt
   lądował pod wpisami sprzed godziny — na mapie coś się pojawiało, a na górze listy
   nic się nie zmieniało (zgłoszone 12.09.2026). Po pięciu minutach wpis wraca na
   swoje miejsce według wkładu, więc lista dalej wyjaśnia, skąd wziął się wynik. */
const FRESH_SIGNAL_MS = 5 * 60 * 1000;
const isFreshSignal = (s) => {
  const t = Date.parse(s?.ts || "");
  return Number.isFinite(t) && Date.now() - t < FRESH_SIGNAL_MS;
};
function sigList(arr, limit) {
  let a = (arr || []).slice().sort((x, y) =>
    (isFreshSignal(y) - isFreshSignal(x))
    || (isFreshSignal(x) ? Date.parse(y.ts) - Date.parse(x.ts) : 0)
    || byPts(x, y));
  if (limit) a = a.slice(0, limit);
  return a.map(sigHTML).join("");
}

/* Etykiety źródeł po polsku — „PANSA"/„NEIGHBOURS" nic nie mówiły użytkownikowi. */
const SRC_LABEL = { neptun: "NEPTUN", media: "MEDIA", rcb: "RCB", adsb: "ADS-B",
  pansa: "PAŻP",
  // w angielskim interfejsie polskie „SĄSIEDZTWO" zostawało nieprzetłumaczone
  neighbours: UI.t("SĄSIEDZI", "NEIGHBOUR ZONES", "СУСІДИ"),
  spillover: UI.t("SĄSIEDZTWO", "NEIGHBOURS", "СУСІДСТВО"),
  // osobna klasa od 1.7.22: oficjalny alarm powietrzny w przygranicznym obwodzie UA
  ua_alert: "ALARM UA", test: "TEST" };
const SRC_ICON = { neptun: "🎯", media: "📰", rcb: "🚨", adsb: "✈", pansa: "🛑",
  neighbours: "🌍", spillover: "↔", ua_alert: "📢", test: "🧪" };
/* Nazwy obwodów UA do tytułu sygnału — po polsku i po angielsku, żeby interfejs
   nie pokazywał cyrylicy ani polskiego tekstu w wersji angielskiej. */
const UA_OBLAST_PL_UI = { "Волинська": "wołyńskim", "Львівська": "lwowskim",
  "Закарпатська": "zakarpackim", "Рівненська": "rówieńskim", "Житомирська": "żytomierskim",
  "Тернопільська": "tarnopolskim", "Івано-Франківська": "iwanofrankowskim",
  "Хмельницька": "chmielnickim", "Чернівецька": "czerniowieckim", "Вінницька": "winnickim" };
const UA_OBLAST_EN = { "Волинська": "Volyn", "Львівська": "Lviv",
  "Закарпатська": "Zakarpattia", "Рівненська": "Rivne", "Житомирська": "Zhytomyr",
  "Тернопільська": "Ternopil", "Івано-Франківська": "Ivano-Frankivsk",
  "Хмельницька": "Khmelnytskyi", "Чернівецька": "Chernivtsi", "Вінницька": "Vinnytsia" };

function sigHTML(s) {
  // adres u redakcji znaleziony przez czytnik artykułów ma pierwszeństwo przed
  // przekierowaniem Google News, które kończy się na stronie zgody Google
  const link = safeUrl(s.details?.article?.url || s.details?.link || s.details?.url);
  const cp = s.counted_points ?? s.points;
  const w = s.weight;                       // waga wygaszania z accumulate (1,0 = świeży)
  // Rozróżniamy powody, dla których liczy się mniej niż nominał:
  //  • wygaszanie w czasie (waga < 1) — naturalne starzenie sygnału,
  //  • limit klasy źródła (cap) — nadwyżka ponad wkład tej klasy w oknie.
  // Wcześniej oba pokazywały ten sam przekreślony nominał z podpowiedzią o limicie,
  // co przy zwykłym starzeniu wprowadzało w błąd.
  const expected = s.points * (w ?? 1);
  /* Plakietka bursztynowa znaczy w tej aplikacji UWAGĘ. Sygnał, który nie
     wnosi nic — bo alarm się skończył i waga spadła do zera — nosił ją mimo to,
     bo `cp` równało się `expected` (oba zerowe) i warunek limitu nie zaskakiwał.
     Zero jest zerem niezależnie od powodu i ma wyglądać na zero. */
  const capped = cp < expected - 0.005 || cp === 0;
  const repeatedOfficial = !!s.duplicate_of_official;
  const retrospective = !!s.retrospective;
  // odwołanie RCB/RSO: sam odwołany alert albo artykuł, który go potem opisuje
  const officialClear = s.official_clear || "";
  // wynik czytania całego artykułu (serwer): relacja z wcześniejszego zdarzenia
  // albo artykuł, którego nie dało się przeczytać — widoczny, 0 pkt
  const articleStatus = s.article_status || "";
  const articleInfo = s.details?.article || {};
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
  if (s.article_status && s.details?.article?.reason) extra.push(String(s.details.article.reason));
  if (d.dist_km != null) extra.push(`${threatDistanceText(signalPosition, d.dist_km)} ${UI.t("od granicy", "from the border", "від кордону")}`);
  /* Odległość w sygnale to stan Z CHWILI JEGO POWSTANIA — obiekt leci dalej i po
     pół godzinie panel mówił „192,5 km", gdy na mapie ten sam dron był 130 km od
     granicy (zgłoszone 12.09.2026). Dopisujemy bieżącą odległość, dopóki obiekt
     jest jeszcze śledzony. W trybie historii tego nie robimy: tam panel należy do
     wybranej chwili, a nie do teraz. */
  const tracksNow = !histMode && src === "neptun" && d.track_id != null;
  const liveNow = tracksNow
    ? (state?.neptun?.threats || []).find(t => String(t.id) === String(d.track_id))
    : null;
  const nowKm = liveNow?.pl_assessment?.dist_km;
  if (nowKm != null && d.dist_km != null && Math.abs(nowKm - d.dist_km) >= 5) {
    const closer = nowKm < d.dist_km;
    extra.push({ html: `<b style="color:${closer ? "#ff9f43" : "var(--muted)"}">${
      UI.t("teraz", "now", "зараз")} ${esc(threatDistanceText(liveNow, nowKm))}</b>` });
  } else if (tracksNow && !liveNow) {
    /* Obiekt zniknął z bieżącej migawki NEPTUN-a, a sygnał żyje jeszcze w oknie
       60 min. Bez tej adnotacji panel pokazywał odległość obiektu, którego nie ma
       już na mapie — „śledzenie i sygnały muszą być spójne" (zgłoszone 12.09.2026). */
    extra.push({ html: `<b style="color:var(--muted)">${
      UI.t("nieśledzony na mapie", "no longer tracked", "не відстежується на мапі")}</b>` });
  }
  if (src === "neptun") {
    if (d.course === "unknown") extra.push(UI.t("kurs nieznany", "unknown heading", "курс невідомий"));
    else if (d.course === "estimated") extra.push(UI.t("kurs szacowany z ruchu", "heading estimated from movement", "курс оцінено з руху"));
    else if (d.course === "presumptive") extra.push(UI.t("kurs domniemany (na cel)", "presumed heading (towards a target)", "курс припущений (на ціль)"));
    if (d.jet) extra.push(UI.t("dron odrzutowy", "jet drone", "реактивний дрон"));
  }
  if (d.source_count) extra.push(`${d.source_count} ${UI.t("potw.", "conf.", "підтв.")}`);
  // czas dolotu policzony przy sygnale — dla regionu użytkownika, a gdy go brak,
  // to do granicy; „ile mam czasu" jest ważniejsze niż „ile to kilometrów"
  const mineV = myVoiv();
  // kurs domniemany (G3): czas dolotu byłby liczony w stronę celu, a nie ruchu
  const presumed = d.course === "presumptive";
  const etaV = presumed ? null : agedEta(mineV && d.eta_voiv_min ? d.eta_voiv_min[mineV] : null, s.ts);
  const etaB = presumed ? null : agedEta(d.eta_border_min, s.ts);
  if (!signalApprox && etaV != null) extra.push(`⏱ ${etaTxt(etaV)} ${UI.t("do woj.", "to", "до воєв.")} ${UI.voiv(mineV)}`);
  else if (!signalApprox && etaB != null) extra.push(`⏱ ${etaTxt(etaB)} ${UI.t("do granicy", "to border", "до кордону")}`);
  let shownTitle = s.title;
  // Tytuły, które PISZEMY SAMI (alarm obwodu UA, przeniesienie od sąsiada), muszą
  // iść za językiem interfejsu — serwer zapisuje je po polsku, więc w wersji
  // angielskiej zostawały polskie. Cytaty ze źródeł (NEPTUN, RCB, media) zostają
  // w oryginale, bo to przytoczenie cudzej treści.
  /* Alert RCB obowiązuje do odwołania, a odwołanie potrafi przyjść po godzinach
     (24/25.09.2026: alert o 22:01, odwołanie ok. 05:00). Nasze sygnały dawno
     wygasają i mapa wygląda spokojnie — ten wpis mówi wprost, że oficjalnie
     alert nadal stoi. Zero punktów: Strażnik punktuje to, co widzi. */
  if (s.event_type === "rcb_bez_odwolania") {
    const od = new Date(d.od).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
      { hour: "2-digit", minute: "2-digit" });
    shownTitle = UI.t(
      `Alert RCB z godz. ${od} nie został jeszcze odwołany`,
      `The RCB alert issued at ${od} has not been cancelled yet`,
      `Тривогу RCB, оголошену о ${od}, ще не скасовано`);
  }
  if (s.event_type === "ua_alert_border" && d.oblast) {
    const ob = UI.t(UA_OBLAST_PL_UI[d.oblast] || d.oblast, UA_OBLAST_EN[d.oblast] || d.oblast,
                    `${d.oblast} область`);
    // Odległość obwodu od województwa mówi, dlaczego ten alarm waży tyle, ile waży.
    // Wcześniej każdy obwód — także oddalony o 200 km — ogłaszał się jako graniczący.
    const km = d.distance_km;
    const where = km == null ? null
      : km <= 0 ? (UI.t("przy granicy", "at the border", "біля кордону")) : `${km} km`;
    const voivName = UI.voiv(s.voivodeship);
    shownTitle = UI.t(`Alarm powietrzny w obwodzie ${ob}${where ? ` (woj. ${voivName} — ${where})` : ""}`, `Air-raid alert in ${ob} oblast${where ? ` (${voivName} — ${where})` : ""}`, `Повітряна тривога: ${ob}${where ? ` (воєв. ${voivName} — ${where})` : ""}`);
    // Czas trwania (wariant B2): koniec gasi punkty, po 30 min trwający alarm waży połowę.
    const clock = (iso) => new Date(iso).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"),
      { hour: "2-digit", minute: "2-digit" });
    if (s.alert_ended)
      shownTitle += UI.t(` — zakończony o ${clock(s.alert_ended)}`, ` — ended at ${clock(s.alert_ended)}`, ` — завершено о ${clock(s.alert_ended)}`);
    else if (d.episode && (s.weight ?? 1) > 0 && (s.weight ?? 1) < 1)
      shownTitle += UI.t(` — trwa od ${clock(d.episode)}, połowa wagi`, ` — in progress since ${clock(d.episode)}, half weight`, ` — триває від ${clock(d.episode)}, половина ваги`);
  } else if (s.event_type === "ua_alert_end" && d.oblast) {
    const ob = UI.t(UA_OBLAST_PL_UI[d.oblast] || d.oblast, UA_OBLAST_EN[d.oblast] || d.oblast,
                    `${d.oblast} область`);
    shownTitle = UI.t(`Koniec alarmu powietrznego w obwodzie ${ob} (woj. ${UI.voiv(s.voivodeship)})`, `Air-raid alert in ${ob} oblast has ended (${UI.voiv(s.voivodeship)})`, `Відбій повітряної тривоги: ${ob} (воєв. ${UI.voiv(s.voivodeship)})`);
  } else if (s.event_type === "baltic_alert" && d.country) {
    // Prefiks piszemy sami, cytat tytułu zostaje w oryginale. Kraj w trybie
    // cienia NIE jest „alarmem powietrznym" — to zero punktów do obejrzenia,
    // a napis „Alarm powietrzny — Czechy" w panelu kłamałby.
    const quote = String(shownTitle || "").replace(/^[^„]*/, "");
    shownTitle = `${d.shadow
      ? UI.t("Obserwacja", "Observation", "Спостереження")
      : UI.t("Alarm powietrzny", "Air-raid alert", "Повітряна тривога")} — ${
      balticName(d.country)}: ${quote}`;
  } else if (s.event_type === "neighbour_spillover" && d.from) {
    const factor = `${d.from_score} × 0.4^${d.depth}`;
    shownTitle = UI.t(`Przeniesienie z woj. ${UI.voiv(d.from)} (${factor})`, `Carried over from ${UI.voiv(d.from)} (${factor})`, `Перенесення з воєв. ${UI.voiv(d.from)} (${factor})`);
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
    if (!UI.isEn && !UI.isUk) { /* polski tytul zostaje taki, jak zbudowany wyzej */ }
    else {
      const count = (Number(d.count) || 1) > 1 ? `${Number(d.count)}× ` : "";
      shownTitle = count + threatLabelPL(d.type)
        + (d.dist_km != null
          ? UI.t("", ` heading towards the Polish border, ${threatDistanceText(signalPosition, d.dist_km)}`,
                 ` курсом на кордон Польщі, ${threatDistanceText(signalPosition, d.dist_km)}`)
          : "");
    }
  }
  return `<div class="sig src-${esc(src)}">
    <div class="sig-head">
      <span class="src">${SRC_ICON[src] || "•"} ${esc(SRC_LABEL[src] || src.toUpperCase())}${
        src === "media" && d.country ? " " + esc(d.country) : ""}</span>
      <span class="pts${capped ? " capped" : ""}"
        ${capped ? `title="${repeatedOfficial
          ? (UI.t("powtarza oficjalny alert — widoczne, bez dodatkowych punktów", "repeats an official alert — visible, with no extra points", "повторює офіційну тривогу — видно, без додаткових балів"))
          : retrospective
            ? (UI.t("materiał historyczny lub następstwa — widoczne, bez punktów zagrożenia", "historical report or aftermath — visible, with no threat points", "історичний матеріал або наслідки — видно, без балів загрози"))
          : officialClear
            ? (UI.t("RCB odwołało ten alert — widoczne, bez punktów zagrożenia", "RCB cancelled this alert — visible, with no threat points", "RCB скасувало цю тривогу — видно, без балів загрози"))
          : articleStatus
            ? (UI.t("sprawdzono cały artykuł — bez punktów", "article checked in full — no points", "перевірено всю статтю — без балів"))
          : (UI.t("ponad limit tej klasy źródła — nadwyżka nie liczy się do sumy", "above this source-class cap — excess points are not counted", "понад ліміт цього класу джерела — надлишок не рахується до суми"))}"` : ""}>
        +${cp}${capped ? ` <s>${s.points}</s>` : ""}</span>
    </div>
    ${isFreshSignal(s) ? `<div class="sig-fresh">${UI.t("NOWY", "NEW", "НОВЕ")}</div>` : ""}
    <div class="sig-title">${repeatedOfficial ? `<b>${UI.t("Powtórzenie oficjalnego alertu:", "Repeated official alert:", "Повторення офіційної тривоги:")}</b> ` : ""}${retrospective ? `<b>${UI.t("Materiał historyczny / następstwa:", "Historical report / aftermath:", "Історичний матеріал / наслідки:")}</b> ` : ""}${
      officialClear === "alert" ? `<b>${UI.t("Odwołany przez RCB:", "Cancelled by RCB:", "Скасовано RCB:")}</b> `
      : officialClear ? `<b>${UI.t("Po odwołaniu alertu RCB:", "After RCB cancellation:", "Після скасування тривоги RCB:")}</b> ` : ""}${
      articleStatus === "past" ? `<b>${UI.t("Relacja z wcześniejszego zdarzenia:", "Report on an earlier event:", "Репортаж про попередню подію:")}</b> `
      : articleStatus === "unreadable" ? `<b>${UI.t("Nie udało się przeczytać artykułu — bez punktów:", "Article could not be read — no points:", "Не вдалося прочитати статтю — без балів:")}</b> ` : ""}${link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(shownTitle)}</a>`
      : esc(shownTitle)}</div>
    <div class="sig-bar"><i style="width:${share.toFixed(0)}%"></i></div>
    <div class="ts">${relTime(s.ts)} · ${UI.t("woj.", "province", "воєв.")} ${esc(UI.voiv(s.voivodeship))}${
      extra.length ? " · " + extra.map(x => typeof x === "object" ? x.html : esc(x)).join(" · ") : ""}${
      faded ? ` · <span title="${UI.t("sygnał starzeje się w oknie 60 min i traci wagę", "the signal ages within the 60-minute window and loses weight", "сигнал старіє у вікні 60 хв і втрачає вагу")}">${UI.t("waga", "weight", "вага")} ${Math.round(w * 100)}%</span>` : ""}</div>
  </div>`;
}

/* Rozpisanie wyniku województwa. Suma na karcie zgadza się co do dziesiątej z
   sygnałami, ale żeby to sprawdzić, trzeba było dodać w pamięci plakietki
   rozrzucone po przewijanej liście — a część wpisów ma wkład 0 (wygaszone wiekiem
   albo ucięte limitem klasy) i tylko myli rachunek (zgłoszone 12.09.2026). */
/* Punkty z jednym miejscem po przecinku: po polsku i ukraińsku przecinek, po angielsku
   kropka. Dotąd „1.9 pkt” stało obok „179,6 km” (przegląd UI 14.10.2026). */
function pktTxt(x) {
  const t = (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
  return UI.lang === "en" ? t : t.replace(".", ",");
}
function scoreBreakdown(st) {
  const byClass = new Map();
  let zeros = 0;
  for (const s of st.signals || []) {
    const cp = s.counted_points ?? s.points ?? 0;
    if (cp <= 0) { zeros++; continue; }
    const key = s.source || "?";
    byClass.set(key, (byClass.get(key) || 0) + cp);
  }
  const parts = [...byClass.entries()].sort((a, b) => b[1] - a[1])
    .map(([src, v]) => `${pktTxt(v)} ${SRC_LABEL[src] || src.toUpperCase()}`);
  if (!parts.length) return "";
  const zeroNote = zeros
    ? ` · ${zeros} ${zeros === 1
        ? UI.t("sygnał bez wkładu", "signal adds nothing", "сигнал без внеску")
        : UI.t("sygnałów bez wkładu", "signals add nothing", "сигналів без внеску")}`
      + ` (${UI.t("wygaszone albo ponad limit klasy", "faded or over the source-class cap", "згашене або понад ліміт класу")})`
    : "";
  return `<div class="voiv-sum">${UI.t("składa się z", "adds up to", "складається з")}: ${
    parts.join(" + ")}${zeroNote}</div>`;
}

/* Strefy nad danym województwem — druga droga do karty strefy, niezależna od
   celowania palcem w mapę. Bez tego trzeba by trafić w konkretny wielokąt. */
function zonesForVoiv(name) {
  const dane = aktywneStrefy();
  if (!zonesOn() || !dane) return [];
  return dane.features
    .filter(f => f.properties?.voiv === name)
    .map(f => f.properties);
}
function zonesRowHTML(name) {
  const z = zonesForVoiv(name);
  if (!z.length) return "";
  const chips = z.map(p => `<button class="chip btn-zone" data-zone="${esc(String(p.designator))}"
      >${esc(String(p.designator))}</button>`).join(" ");
  /* Zwinięte pod „Dane techniczne": oznaczenia w rodzaju EPR134 są dla tego,
     kto wie, czym jest strefa PAŻP. Reszcie zajmowały wiersz w karcie
     własnego województwa. Liczba stref zostaje widoczna w podpisie. */
  return `<details class="voiv-zones fineprint"><summary>${
    UI.t("Dane techniczne", "Technical details", "Технічні дані")} · ${
    UI.t("strefy PAŻP", "PAŻP zones", "зони PAŻP")} ${z.length} <span class="muted">(${
    UI.t("bez punktów", "no points", "без балів")})</span></summary>${chips}</details>`;
}
function openZoneByName(designator) {
  const f = (aktywneStrefy()?.features || []).find(x => x.properties?.designator === designator);
  if (f) openZoneCard(f.properties);
}

/* Województwa dotknięte na mapie, które nie zmieściłyby się w panelu z własnych
   powodów (zero punktów, poza ścianą wschodnią, nie moje). Bez tego dotknięcie
   spokojnego województwa otwierało pusty panel — karty po prostu nie było. */
const forcedVoivs = new Set();

function openCard(name) {
  setPanel(true);   // klasa "open" była pozostałością po starym układzie panelu
  if (name && !document.querySelector(`.voiv-card[data-voiv="${CSS.escape(name)}"]`)) {
    forcedVoivs.add(name);
    openVoivs.add(name);
    renderPanel();
  }
  const el = document.querySelector(`.voiv-card[data-voiv="${CSS.escape(name)}"]`);
  if (el) { el.classList.add("open"); openVoivs.add(name); el.scrollIntoView({ behavior: "smooth" }); }
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
    coEn: "An OSINT aggregator from Ukraine — air objects (drones, missiles, glide "
      + "bombs) heading towards the Polish border. The main source of early warning. "
      + "A “confirmed” field may confirm the report rather than the accuracy of the "
      + "coordinates; recognised locality points are shown and scored as areas.",
    czerwona: "Zerwane połączenie z serwerem NEPTUN albo brak internetu. "
      + "Aplikacja próbuje ponownie co minutę.",
    coUk: "Агрегатор OSINT з України — повітряні об\u2019єкти (дрони, ракети, КАБ) "
      + "курсом на кордон Польщі. Головне джерело випередження. Поле «confirmed» може "
      + "підтверджувати повідомлення, а не точність координат; розпізнані точки населених "
      + "пунктів показуємо й оцінюємо як районні.",
    czerwonaUk: "Обірвано з\u2019єднання із сервером NEPTUN або немає інтернету. "
      + "Застосунок повторює спробу щохвилини.",
  },
  "Alarmy UA": {
    co: "Oficjalne alarmy powietrzne w zachodnich obwodach Ukrainy — sygnał "
      + "wyprzedzający. Waga zależy od odległości obwodu od województwa: "
      + "przy granicy (wołyński, lwowski, zakarpacki) liczy się w pełni, dalsze "
      + "(rówieński, tarnopolski, iwanofrankowski, chmielnicki, czerniowiecki, "
      + "żytomierski, winnicki) — proporcjonalnie mniej. "
      + "Docierają połączeniem NEPTUN (WebSocket w aplikacji lub przez serwer). "
      + "Przy zamkniętej aplikacji alarm Twojego regionu przychodzi osobno pushem.",
    coEn: "Official air-raid alerts in the western oblasts of Ukraine — an early "
      + "indicator. The weight depends on how far the oblast lies from the province: "
      + "those on the border (Volyn, Lviv, Zakarpattia) count in full, more distant "
      + "ones (Rivne, Ternopil, Ivano-Frankivsk, Khmelnytskyi, Chernivtsi, Zhytomyr, "
      + "Vinnytsia) proportionally less. They arrive over the NEPTUN connection "
      + "(a WebSocket in the app, or through the server). When the app is closed, an "
      + "alert for your region arrives separately as a push notification.",
    czerwona: "Połączenie NEPTUN nie potwierdza w tej chwili alarmów obwodowych. "
      + "Alarm w obwodzie UA może wtedy nie być pokazany na żywo — sprawdź "
      + "połączenie z internetem.",
    coUk: "Офіційні повітряні тривоги в західних областях України — сигнал випередження. "
      + "Вага залежить від відстані області до воєводства: при кордоні (Волинська, Львівська, "
      + "Закарпатська) рахується повністю, дальші (Рівненська, Тернопільська, Івано-Франківська, "
      + "Хмельницька, Чернівецька, Житомирська, Вінницька) — пропорційно менше. Вони надходять "
      + "з\u2019єднанням NEPTUN (WebSocket у застосунку або через сервер). При закритому застосунку "
      + "тривога вашого регіону приходить окремо push-сповіщенням.",
    czerwonaUk: "З\u2019єднання NEPTUN зараз не підтверджує обласних тривог. Тривогу в області "
      + "України може бути не показано наживо — перевірте з\u2019єднання з інтернетом.",
    czerwonaEn: "The NEPTUN connection is not confirming oblast alerts right now. "
      + "An alert in a Ukrainian oblast may then not be shown live — check your "
      + "internet connection.",
  },
  "ADS-B": {
    co: "Publiczne transpondery lotnicze — maszyny wojskowe nad Polską i regionem. "
      + "Serwer pyta adsb.lol, a gdy nie odpowiada — opendata.adsb.fi. W trybie awaryjnym, "
      + "gdy telefon liczy sam, dochodzi jeszcze airplanes.live. Warstwa jest informacyjna i nie daje "
      + "punktów: w danych z 41 dni wzmożony ruch okazywał się rutynowymi lotami. "
      + "Ruch ponad dwukrotnie wyższy niż zwykle o tej porze jest zaznaczany w panelu. "
      + "Karta samolotu pokazuje zdjęcie, kraj rejestracji i pełną telemetrię.",
    coEn: "Public aircraft transponders — military aircraft over Poland and the region. "
      + "The server queries adsb.lol and falls back to opendata.adsb.fi. In emergency mode, "
      + "when the phone scores on its own, airplanes.live is queried as well. The layer is informational and "
      + "gives no points: over 41 days of data, increased traffic turned out to be "
      + "routine flights. Traffic more than twice the usual level for that time is "
      + "marked in the panel. The aircraft card shows a photograph, the country of "
      + "registration and full telemetry.",
    czerwona: "Serwisy ADS-B nie odpowiadają. Mapa nie pokaże wtedy lotnictwa "
      + "wojskowego; na punktację to nie wpływa.",
    coUk: "Відкриті авіаційні транспондери — військові машини над Польщею й регіоном. "
      + "Сервер опитує adsb.lol, а коли той не відповідає — opendata.adsb.fi. В аварійному "
      + "режимі, коли телефон рахує сам, додається ще airplanes.live. Шар інформативний і балів не дає: у даних за 41 день "
      + "посилений рух виявлявся рутинними польотами. Рух, удвічі вищий за звичайний о цій порі, "
      + "позначаємо в панелі. Картка літака показує фото, країну реєстрації й повну телеметрію.",
    czerwonaUk: "Сервіси ADS-B не відповідають. Мапа тоді не покаже військової авіації; "
      + "на бали це не впливає.",
    czerwonaEn: "The ADS-B services are not responding. The map will not show military "
      + "aviation then; scoring is not affected.",
  },
  "RSS": {
    co: "Media lokalne i ogólnopolskie — nagłówki o syrenach, alarmach "
      + "i naruszeniach przestrzeni powietrznej.",
    coEn: "Local and national media — headlines about sirens, alerts and airspace "
      + "violations.",
    czerwona: "Żaden kanał nie odpowiedział. Zwykle chwilowe; bywa też, "
      + "że serwis zmienił format i wymaga poprawki.",
    coUk: "Місцеві та загальнонаціональні ЗМІ — заголовки про сирени, тривоги й порушення "
      + "повітряного простору.",
    czerwonaUk: "Жоден канал не відповів. Зазвичай тимчасово; буває й так, що сайт змінив "
      + "формат і потрібна правка.",
    czerwonaEn: "No feed responded. Usually temporary; sometimes a site has changed "
      + "its format and needs a fix.",
  },
  "RCB": {
    co: "Oficjalne Alerty RCB z Regionalnego Systemu Ostrzegania (RSO) — te same "
      + "komunikaty, które przychodzą SMS-em, z listą województw. Najważniejsze "
      + "oficjalne źródło w tym zestawie i jedyne, które samo podnosi poziom alarmu. Dioda "
      + "pokazuje, czy RSO odpowiedziało w ostatnich minutach. Czytamy też treść "
      + "komunikatu dnia na stronie gov.pl/rcb: RSO niesie czasem tylko część "
      + "odbiorców alertu, więc brakujące województwa dobieramy stamtąd.",
    coEn: "Official RCB alerts from the Regional Warning System (RSO) — the same "
      + "messages that arrive by text, with the list of provinces. The most important "
      + "official source in this set and the only one that raises the alert level on its own. "
      + "The light shows whether RSO has responded in the last few minutes. We also read "
      + "the text of the day's message on gov.pl/rcb: RSO sometimes carries only part of "
      + "the alert's recipients, so the missing provinces are taken from there.",
    czerwona: "RSO nie odpowiada od kilku minut albo zwróciło dane, których nie da "
      + "się odczytać. Strażnik nie zobaczy wtedy nowego Alertu RCB — alerty "
      + "docierają nadal SMS-em z systemu RCB.",
    coUk: "Офіційні Alert RCB із Регіональної системи оповіщення (RSO) — ті самі повідомлення, "
      + "що приходять SMS-ом, зі списком воєводств. Найважливіше офіційне джерело в цьому наборі "
      + "і єдине, яке само піднімає рівень тривоги. Діода показує, чи RSO відповіло за останні "
      + "хвилини. Читаємо також текст повідомлення дня на сторінці gov.pl/rcb: RSO іноді "
      + "передає лише частину отримувачів алерту, тож воєводства, яких бракує, беремо звідти.",
    czerwonaUk: "RSO не відповідає кілька хвилин або повернуло дані, яких не вдається прочитати. "
      + "Strażnik тоді не побачить нового Alert RCB — самі алерти й далі приходять SMS-ом із системи RCB.",
    czerwonaEn: "RSO has not responded for a few minutes, or returned data that "
      + "cannot be read. Strażnik will not see a new RCB alert then — alerts still "
      + "arrive by text from the RCB system.",
  },
  "PAŻP": {
    co: "Strefy przestrzeni powietrznej (AUP/UUP) z airspace.pansa.pl — "
      + "nowo aktywowana strefa nad regionem to sygnał pomocniczy.",
    coEn: "Airspace zones (AUP/UUP) from airspace.pansa.pl — a newly activated zone "
      + "over the region is a supporting signal.",
    czerwona: "Serwis PAŻP nie odpowiada. W trybie wbudowanym ta warstwa "
      + "bywa niedostępna — wtedy pozostałe źródła działają normalnie.",
    coUk: "Зони повітряного простору (AUP/UUP) з airspace.pansa.pl — щойно активована зона "
      + "над регіоном є допоміжним сигналом.",
    czerwonaUk: "Сервіс PAŻP не відповідає. У вбудованому режимі цей шар буває недоступним — "
      + "решта джерел тоді працює нормально.",
    czerwonaEn: "The PAŻP service is not responding. In built-in mode this layer is "
      + "sometimes unavailable — the remaining sources keep working normally.",
  },
};
/* Podpis diody. Klucz zostaje polski (jest też kluczem SOURCE_INFO i stanu
   zdrowia), więc nazwę do wyświetlenia trzymamy osobno. */
const SRC_TITLE_EN = { "Alarmy UA": "UA alerts", "RCB": "RCB/RSO" };
const SRC_TITLE_PL = { "RCB": "RCB/RSO" };
const SRC_TITLE_UK = { "Alarmy UA": "Тривоги UA", "RCB": "RCB/RSO", "Bałtyk": "Балтика",
  "Sąsiedzi": "Сусіди", "Media": "ЗМІ" };
const srcTitle = (name) => UI.t(SRC_TITLE_PL[name], SRC_TITLE_EN[name], SRC_TITLE_UK[name]) || name;

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
    ["RSS", rssOk, rssFeeds.length
      ? `${rssFeeds.filter(Boolean).length}/${rssFeeds.length} ${UI.t("kanałów", "feeds", "каналів")}` : ""],
    ["RCB", !!h.rcb, ""],
    ["PAŻP", !!h.pansa, ""],
  ];
}

/* Litwa, Łotwa, Estonia: nie mają osobnej diody (alarm tam jest daleko i daje
   dziesiąte części punktu), ale okno „Źródła” pokazuje, że kanały działają,
   kiedy przyszedł ostatni artykuł i ostatni alarm. */
const BALTIC_NAME_PL = { LT: "Litwa", LV: "Łotwa", EE: "Estonia",
  MD: "Mołdawia", RO: "Rumunia", SK: "Słowacja", CZ: "Czechy", SE: "Szwecja", HU: "Węgry" };
const BALTIC_NAME_EN = { LT: "Lithuania", LV: "Latvia", EE: "Estonia",
  MD: "Moldova", RO: "Romania", SK: "Slovakia", CZ: "Czechia", SE: "Sweden", HU: "Hungary" };
const BALTIC_NAME_UK = { LT: "Литва", LV: "Латвія", EE: "Естонія",
  MD: "Молдова", RO: "Румунія", SK: "Словаччина", CZ: "Чехія", SE: "Швеція", HU: "Угорщина" };
/* Kraje w trybie cienia — kolejność jak w oknie „Źródła”. */
const SHADOW_COUNTRIES = ["RO", "MD", "SK", "HU", "CZ", "SE"];
const SHADOW_FEEDS_TXT = {
  RO: "Digi24, HotNews", MD: "Moldova 1 (TRM), Ziarul de Gardă",
  SK: "TASR (teraz.sk), Aktuality", HU: "Telex, HVG",
  CZ: "ČT24, Český rozhlas", SE: "SVT, Sveriges Radio (Ekot)",
};
const balticName = (c) => UI.t(BALTIC_NAME_PL[c], BALTIC_NAME_EN[c], BALTIC_NAME_UK[c]) || c;
const BALTIC_FEEDS_TXT = { LT: "LRT (temat „oro pavojus”), 15min", LV: "LSM (LV, EN)", EE: "ERR (ET, EN)" };
const BALTIC_ALERT_PTS = { LT: "0,3", LV: "0,18", EE: "0,12" };
function agoSec(sec) {
  const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60));
  if (m < 1) return UI.t("przed chwilą", "just now", "щойно");
  if (m < 60) return `${m} min ${UI.t("temu", "ago", "тому")}`;
  return `${Math.floor(m / 60)} h ${m % 60} min ${UI.t("temu", "ago", "тому")}`;
}
function balticRows() {
  const b = state?.health?.baltic;
  if (!b) return "";
  const rows = ["LT", "LV", "EE"].filter(c => b[c]).map(c => {
    const x = b[c], ok = x.feeds_ok > 0;
    const name = balticName(c);
    const stateTxt = ok ? (UI.t("działa", "working", "працює")) : (UI.t("nie odpowiada", "not responding", "не відповідає"));
    const newest = x.newest_item ? ` · ${UI.t("ostatni artykuł", "latest article", "остання стаття")} ${agoSec(x.newest_item)}` : "";
    const zb = state?.health?.neighbour_zones;
    const zNew = (zb?.recent_new || []).filter(z => z.country === c);
    const zonesTxt = zb && zb.by_country?.[c] != null
      ? `<br>${UI.t("Czasowe strefy przestrzeni", "Temporary airspace zones", "Тимчасові зони простору")}: ${zb.by_country[c]}${
          c === "LV" ? (UI.t(" (rutynowe strefy dronowe, bez punktów)", " (routine drone zones, not scored)", " (рутинні дронові зони, без балів)")) : ""}${
          zNew.length ? ` · ${UI.t("nowe", "new", "нові")}: ${zNew.slice(0, 3).map(z =>
            `${esc(z.ident)} ${esc(z.kind)} ${agoSec(z.seen)}`).join(", ")}` : ""}`
      : "";
    const la = x.last_alert;
    const alertTxt = la
      ? `<br>${UI.t("Ostatni alarm", "Last alert", "Остання тривога")} ${agoSec(la.at)}: „${esc(la.title)}”${la.cleared
          ? ` — <b>${UI.t("odwołany", "cancelled", "скасовано")}</b> ${agoSec(la.cleared_at)}` : ""}`
      : `<br>${UI.t("Brak alarmu od uruchomienia serwera.", "No alert since the server started.", "Тривог не було від запуску сервера.")}`;
    return `<div class="src-row ${ok ? "ok" : "err"}">
      <div class="src-head"><i></i><b>${esc(name)}</b>
        <span class="src-state">${stateTxt} · ${x.feeds_ok}/${x.feeds} ${UI.t("kanałów", "feeds", "каналів")}${newest}</span></div>
      <p class="src-what">${esc(BALTIC_FEEDS_TXT[c])}. ${UI.t(`Ogłoszony alarm powietrzny daje +${BALTIC_ALERT_PTS[c]} pkt dla podlaskiego i warmińsko-mazurskiego — ślad, sam nigdy nie alarmuje w Polsce.`, `An announced air-raid alert adds +${BALTIC_ALERT_PTS[c].replace(",", ".")} to podlaskie and warmińsko-mazurskie — a trace, never an alert in Poland on its own.`, `Оголошена повітряна тривога дає +${BALTIC_ALERT_PTS[c]} бала для Підляського і Вармінсько-Мазурського — це лише слід, сам він у Польщі тривоги не вмикає.`)}${alertTxt}${zonesTxt}</p>
    </div>`;
  }).join("");
  // Pozostałych sześciu sąsiadów nie rozpisujemy na osobne karty: nic nie
  // punktują, więc wystarczy, że widać, czy kanały żyją.
  const cien = SHADOW_COUNTRIES.filter(c => b[c]).map(c => {
    const x = b[c], ok = x.feeds_ok > 0;
    const newest = x.newest_item ? ` · ${agoSec(x.newest_item)}` : "";
    return `<span class="led ${ok ? "ok" : "err"}"><i></i><span>${esc(balticName(c))} ${
      x.feeds_ok}/${x.feeds}${newest}</span></span>`;
  }).join(" ");
  const cienBlok = cien ? `<div class="src-row ok"><div class="src-head"><i></i><b>${
    UI.t("Pozostali sąsiedzi — obserwacja", "Other neighbours — observation", "Інші сусіди — спостереження")
    }</b></div><p class="src-what">${
    SHADOW_COUNTRIES.filter(c => b[c]).map(c => `${esc(balticName(c))}: ${esc(SHADOW_FEEDS_TXT[c])}`).join(" · ")
    }.<br>${UI.t("Te kanały nie dodają punktów. Zdarzenie w przestrzeni powietrznej u tych sąsiadów podświetla kraj na mapie i trafia do panelu sygnałów z zerem, dopóki nie sprawdzimy, czy filtr nie bierze cudzej przestrzeni za ich własną.", "These feeds add no points. An airspace event in these countries highlights the country on the map and enters the signal panel with zero, until the filter is proven not to mistake another country's airspace for theirs.", "Ці канали не додають балів. Подія в повітряному просторі цих сусідів підсвічує країну на карті й потрапляє в панель сигналів з нулем, поки ми не переконаємося, що фільтр не бере чужий простір за їхній власний.")
    }</p><div class="src-leds">${cien}</div></div>` : "";
  return `<p class="fineprint" style="margin:12px 0 6px">${UI.t("Sąsiedzi — brak publicznego API alarmów, więc śledzimy kanały mediów", "Neighbours — no public alert API exists, so media feeds are watched", "Сусіди — немає відкритого API тривог, тому стежимо за каналами медіа")}</p>${rows}${cienBlok}`;
}

function renderLeds() {
  document.getElementById("status-leds").innerHTML = ledItems().map(([n, ok]) =>
    `<span class="led ${ok ? "ok" : "err"}"><i></i><span>${esc(srcTitle(n))}<span class="sr-only">: ${ok ? UI.t("działa", "working", "працює") : UI.t("brak odpowiedzi", "not responding", "немає відповіді")}</span></span></span>`).join("");
  // okno źródeł bywa otwarte właśnie wtedy, gdy użytkownik czeka na powrót
  // połączenia — musi pokazywać stan na żywo, nie ten sprzed otwarcia
  if (document.getElementById("sources")?.open) fillSources();
}

function fillSources() {
  const rows = ledItems().map(([name, ok, extra]) => {
    const info = SOURCE_INFO[name] || {};
    const what = UI.t(info.co, info.coEn, info.coUk) || info.co || "";
    const why = UI.t(info.czerwona, info.czerwonaEn, info.czerwonaUk) || info.czerwona || "";
    return `<div class="src-row ${ok ? "ok" : "err"}">
      <div class="src-head"><i></i><b>${esc(srcTitle(name))}</b>
        <span class="src-state">${ok ? (UI.t("działa", "working", "працює"))
          : (UI.t("nie odpowiada", "not responding", "не відповідає"))}${extra ? " · " + esc(extra) : ""}</span></div>
      <p class="src-what">${what}</p>
      ${ok ? "" : `<p class="src-why">${UI.t("Dlaczego czerwona", "Why it is red", "Чому червона")}: ${why}</p>`}
    </div>`;
  }).join("");
  const anyErr = ledItems().some(([, ok]) => !ok);
  document.getElementById("src-list").innerHTML = rows + balticRows();
  document.getElementById("src-note").innerHTML = anyErr
    ? UI.t("Czerwona dioda nie oznacza awarii aplikacji — pozostałe źródła liczą się dalej, a ocena i tak wymaga zgodności kilku z nich. Jeśli czerwone są wszystkie, sprawdź połączenie z internetem.",
           "A red indicator does not mean the app has failed — the remaining sources keep counting, and the assessment needs several of them to agree anyway. If every indicator is red, check your internet connection.",
           "Червона діода не означає збою застосунку — решта джерел рахується далі, а для оцінки й так потрібна згода кількох із них. Якщо червоні всі, перевірте з’єднання з інтернетом.")
    : (UI.t("Wszystkie źródła odpowiadają.", "Every source is responding.", "Усі джерела відповідають."));
}

function showSources() {
  fillSources();
  document.getElementById("sources").showModal();
}

/* Jeden nasłuch na wszystkie krzyżyki okien — dokładanie osobnego do każdego
   okna kończy się tym, że przy następnym oknie ktoś zapomni. Zamknięcie jest
   równoważne „Anuluj": formularze zapisują się własnym przyciskiem. */
document.addEventListener("click", (e) => {
  const x = e.target.closest(".dlg-x");
  if (x) x.closest("dialog")?.close();
});

document.getElementById("status-leds").onclick = () => { if (state) showSources(); };
/* role="button" bez Enter i Spacji był przyciskiem tylko dla myszy (przegląd UI 14.10.2026). */
document.getElementById("status-leds").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && state) { e.preventDefault(); showSources(); }
});

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
  const card = document.getElementById("ac-card");
  const big = card?.dataset.forceBig === "1" || cardBig();
  if (card) card.dataset.forceBig = "";
  try { localStorage.setItem("straznik_card_big", big ? "0" : "1"); } catch {}
  applyCardSize();
  document.getElementById("ac-card-body").scrollTop = 0;
});

/* ── alarm dźwiękowy przy poziomie WYSOKI ────────────────────────────────── */
let lastMood = "none";
function updateAlarmMood() {
  const voivs = state?.fusion?.voivodeships || {};
  const mine = myVoiv();
  // Liczą się WSZYSTKIE obserwowane województwa (audyt B1: alarm dla rodziców
  // w innym województwie nie grał, gdy aplikacja była otwarta). Bez zapisanych
  // miejsc — najwyższy poziom w kraju, jak dotąd.
  const watched = (Places?.observedVoivodeships(savedPlaces) || []).filter(v => voivs[v]);
  const pool = watched.length ? watched : (mine && voivs[mine] ? [mine] : Object.keys(voivs));
  const order = ["none", "elevated", "high"];
  const level = pool.reduce((best, v) =>
    order.indexOf(alarmLevel(voivs[v])) > order.indexOf(best) ? alarmLevel(voivs[v]) : best, "none");
  if (order.indexOf(level) > order.indexOf(lastMood) && !alertsOff()) {
    if (level === "high") {
      const voiv = mine && pool.includes(mine) && alarmLevel(voivs[mine]) === "high" ? mine
        : pool.find(v => alarmLevel(voivs[v]) === "high");
      if (czerwonyTryb() === "zwykle") czerwonyZwykly(voiv, voivs[voiv]?.score?.toFixed(1));
      else showAlarm(voiv, voivs[voiv]);   // ciągła syrena + popup do potwierdzenia
      // ostrzeżenie o nieoficjalnym źródle musi wrócić, gdy robi się poważnie
      document.getElementById("disclaimer").classList.remove("hidden");
    } else if (level === "elevated") {
      chimeOnce();
      /* Żółty poziom nie otwiera ekranu alarmu. Widać go na karcie i banerze,
         ale czytnik ekranu nie ogłaszał zmiany — osoba niewidoma słyszała tylko
         krótki sygnał, bez informacji, co i gdzie. Teraz czytnik przerywa
         i mówi, co i gdzie. (To pomoc dla niewidomych; osoba głucha widziała
         te sygnały od zawsze, a mowa czytnika i tak jej nie dotyczy.) */
      const voiv = pool.find(v => alarmLevel(voivs[v]) === "elevated");
      powiedz(a11yAlert, UI.t(
        `Uwaga: podniesiony poziom zagrożenia, ${voiv ? UI.voiv(voiv) : ""}.`,
        `Attention: raised threat level, ${voiv ? UI.voiv(voiv) : ""}.`,
        `Увага: підвищений рівень загрози, ${voiv ? UI.voiv(voiv) : ""}.`));
    }
  } else if (level === "none" && lastMood !== "none" && !alertsOff()) {
    /* Spadek poziomu to NIE to samo co oficjalne odwołanie alarmu przez RCB —
       tu po prostu wygasły nasze sygnały. Mówimy dokładnie to i nic więcej,
       żeby nikt nie wyszedł ze schronienia na podstawie naszego wyliczenia. */
    powiedz(a11yAlert, UI.t(
      "Poziom zagrożenia wrócił do zwykłego. To nie jest oficjalne odwołanie alarmu.",
      "The threat level is back to normal. This is not an official all-clear.",
      "Рівень загрози повернувся до звичайного. Це не офіційне скасування тривоги."));
  }
  lastMood = level;
}

let lastChimeAt = 0;
function chimeOnce() {
  if (Date.now() - lastChimeAt < 20000) return;   // push i stan mogą przyjść razem
  lastChimeAt = Date.now();
  attentionChime();
}

/* Push przekazany przez warstwę natywną, gdy aplikacja jest na wierzchu (audyt B1).
   Deduplikacja po event_id: ten sam alarm może przyjść pushem i stanem z serwera. */
const fcmSeen = new Set();
function onForegroundPush(d) {
  if (!d || !d.voiv || !d.level || alertsOff()) return;
  const id = d.event_id || `${d.voiv}|${d.level}|${d.sent_at || ""}`;
  if (fcmSeen.has(id)) return;
  fcmSeen.add(id);
  const score = parseFloat(d.score) || 0;
  const st = state?.fusion?.voivodeships?.[d.voiv];
  if (d.level === "high" && czerwonyTryb() === "zwykle") {
    czerwonyZwykly(d.voiv, score);
    document.getElementById("disclaimer").classList.remove("hidden");
  } else if (d.level === "high") {
    showAlarm(d.voiv, st && alarmLevel(st) === "high" ? st
      : { score, signals: [], reasonsText: [d.headline, d.reasons].filter(Boolean).join("\n") });
    document.getElementById("disclaimer").classList.remove("hidden");
  } else {
    chimeOnce();
    toast(`⚠️ <b>${UI.t("Podwyższona uwaga", "Heightened attention", "Підвищена увага")}</b>: `
      + `${UI.t("woj.", "province", "воєв.")} ${esc(UI.voiv(d.voiv))} (${pktTxt(score)} ${UI.t("pkt", "pts", "бал.")})`, 9000);
  }
}

/* Najbliższy obiekt i czas dolotu do województwa alarmu (audyt C11). */
function najblizszyObiekt(voiv) {
  let best = null;
  for (const t of state?.neptun?.threats || []) {
    if (t.lat == null || isApproxPosition(t) || !t.pl_assessment?.toward_pl) continue;
    const km = distToVoivKm(t.lat, t.lon, voiv);
    if (km == null || (best && km >= best.km)) continue;
    best = { t, km };
  }
  if (!best) return null;
  const v = best.t.pl_assessment?.heading_known === false ? null
    : (best.t.velocity?.speedKmh ?? trackSpeed(best.t));
  return {
    what: UI.type(best.t.type, (TYPE_META[best.t.type] || TYPE_META.unknown).label),
    km: Math.round(best.km),
    eta: v ? etaMin(best.km, v) : null,
  };
}
function nearestThreatLine(voiv) {
  const n = najblizszyObiekt(voiv);
  if (!n) return "";
  return `${UI.t("Najbliżej", "Nearest", "Найближче")}: <b>${esc(n.what)}</b> · ${n.km} km`
    + (n.eta != null ? ` · ${UI.t("ok.", "about", "бл.")} ${etaTxt(n.eta)}` : "");
}

/* ── Sytuacja jednym zdaniem — dla czytnika ekranu zamiast mapy ─────────────
   Obiecane publicznie w opisie 1.7.81. Mapa dla osoby niewidomej jest pustym
   obrazkiem: czytnik słyszał zmianę poziomu (pole `assertive`), ale nie miał
   jak sprawdzić, jak jest TERAZ. Niewidoczny nagłówek przed mapą mówi to jednym
   zdaniem: obserwowane województwa (jak alarm w updateAlarmMood), a bez nich
   województwa z sygnałami w kraju; poziom ALARMU, nie kolor mapy; najbliższy
   obiekt i godzina danych. Nie jest polem `aria-live` — nie przerywa co kilka
   sekund, czytnik czyta go, gdy człowiek do niego dojdzie (nagłówek: skok
   „następny nagłówek"). Osobna funkcja bez DOM, żeby test mógł ją uruchomić. */
function opisSytuacji(voivs, obserwowane, najblizszy, godzina, licznik = "") {
  const order = ["none", "elevated", "high"];
  const nazwa = { none: UI.t("brak sygnałów", "no signals", "немає сигналів"),
                  elevated: UI.t("podwyższona uwaga", "heightened attention", "підвищена увага"),
                  high: UI.t("wysoki priorytet", "high priority", "високий пріоритет") };
  const liczba = (x) => UI.t(x.toFixed(1).replace(".", ","), x.toFixed(1), x.toFixed(1).replace(".", ","));
  const poziom = (v) => alarmLevel(voivs[v]);
  const wazniejsze = (a, b) => order.indexOf(poziom(b)) - order.indexOf(poziom(a))
    || (voivs[b]?.score || 0) - (voivs[a]?.score || 0);
  const start = `${UI.t("Sytuacja o", "Situation at", "Ситуація о")} ${godzina}: `;
  const koniec = (licznik ? " " + licznik : "") + " " + UI.t("Strażnik to źródło nieoficjalne — kieruj się syrenami i komunikatami RCB.",
    "Strażnik is an unofficial source — follow sirens and RCB alerts.",
    "Strażnik — неофіційне джерело, орієнтуйтеся на сирени та повідомлення RCB.");
  let lista = (obserwowane || []).filter(v => voivs[v]);
  if (!lista.length) {
    lista = Object.keys(voivs).filter(v => poziom(v) !== "none").sort(wazniejsze).slice(0, 3);
    if (!lista.length)
      return start + UI.t("w całym kraju brak sygnałów.", "no signals anywhere in Poland.",
        "по всій Польщі сигналів немає.") + koniec;
  }
  const czesci = lista.map(v => {
    const lv = poziom(v);
    return `${UI.t("woj.", "", "воєв.")} ${UI.voiv(v)} — ${nazwa[lv]}`
      + (lv !== "none" ? `, ${liczba(voivs[v]?.score || 0)} ${UI.t("pkt", "pts", "бал.")}` : "");
  });
  let zdanie = start + czesci.join("; ") + ".";
  const glowne = [...lista].sort(wazniejsze)[0];
  const n = poziom(glowne) !== "none" ? najblizszy(glowne) : null;
  if (n) zdanie += ` ${UI.t("Najbliżej", "Nearest", "Найближче")}: ${n.what}, ${n.km} km`
    + (n.eta != null ? `, ${UI.t("około", "about", "близько")} ${n.eta < 1 ? 1 : n.eta} min` : "") + ".";
  return zdanie.replace(/ {2,}/g, " ") + koniec;
}
function odswiezOpisSytuacji() {
  const sytuacjaEl = document.getElementById("sytuacja");
  if (!sytuacjaEl) return;
  const voivs = state?.fusion?.voivodeships || {};
  const mine = myVoiv();
  const watched = Places?.observedVoivodeships(savedPlaces) || [];
  const godzina = new Date(threatsReceivedAt || Date.now())
    .toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" });
  sytuacjaEl.textContent = opisSytuacji(voivs, watched.length ? watched : (mine ? [mine] : []),
    najblizszyObiekt, godzina, licznikZdanie(licznikZObiektow(state?.neptun?.threats)));
}

/* ── pełnoekranowy alarm z ręcznym potwierdzeniem ────────────────────────── */
const alarmOverlay = document.getElementById("alarm-overlay");

/* ── Czytnik ekranu ────────────────────────────────────────────────────────
   Dwa niewidoczne pola z `aria-live` w index.html. Wpisanie do nich tekstu
   każe czytnikowi go przeczytać. Ten sam tekst dwa razy pod rząd zostałby
   pominięty (czytnik widzi niezmienioną treść), dlatego najpierw czyścimy. */
const a11yAlert = document.getElementById("a11y-alert");
const a11yInfo = document.getElementById("a11y-info");
function powiedz(el, tekst) {
  if (!el || !tekst) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = tekst; }, 60);
}

/* Fokus przy ekranie alarmu. Bez tego czytnik zostaje tam, gdzie był przed
   alarmem — czyli na mapie pod spodem, której i tak nie widać. */
let fokusPrzedAlarmem = null;
function alarmFokus() {
  fokusPrzedAlarmem = document.activeElement;
  alarmOverlay.querySelector(".alarm-box")?.focus();
}
function alarmFokusPowrot() {
  if (fokusPrzedAlarmem && document.contains(fokusPrzedAlarmem)) {
    try { fokusPrzedAlarmem.focus(); } catch {}
  }
  fokusPrzedAlarmem = null;
}
/* Dopóki alarm jest na wierzchu, Tab krąży po jego przyciskach i nie schodzi
   na zasłoniętą mapę. Inaczej człowiek obsługujący telefon klawiaturą albo
   przełącznikiem „wypada" z alarmu w nic. */
document.addEventListener("keydown", e => {
  if (e.key !== "Tab" || alarmOverlay.classList.contains("hidden")) return;
  const pola = [...alarmOverlay.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])")]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!pola.length) return;
  const pierwszy = pola[0], ostatni = pola[pola.length - 1];
  if (e.shiftKey && document.activeElement === pierwszy) { e.preventDefault(); ostatni.focus(); }
  else if (!e.shiftKey && document.activeElement === ostatni) { e.preventDefault(); pierwszy.focus(); }
});

/* Ekran alarmu musi leżeć NA WIERZCHU. Okno otwarte przez showModal() trafia do
   warstwy nad całą stroną, więc alarm przy otwartych Ustawieniach leżał POD
   oknem: syrena grała, a „POTWIERDZAM” było nie do dotknięcia (przegląd UI
   14.10.2026). Otwarta karta obiektu ma z-index 1200 i też go zasłaniała. */
function zdejmijZasloneAlarmu() {
  document.querySelectorAll("dialog[open]").forEach(d => { try { d.close(); } catch {} });
  hideCard();
}
/* To samo w drugą stronę: dopóki alarm jest na ekranie, żadne okno nie wchodzi
   nad niego. Okno otwierane po zamknięciu poprzedniego (ciąg okien powitania,
   prośby o zgody) przepada — wróci przy następnym uruchomieniu. */
const pokazOknoModalnie = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  if (!alarmOverlay.classList.contains("hidden")) return;
  return pokazOknoModalnie.call(this);
};

function showAlarm(voiv, st) {
  if (!voiv || !st) return;
  zdejmijZasloneAlarmu();
  document.getElementById("alarm-voiv").textContent = (UI.t("woj. ", "province ", "воєв. ")) + UI.voiv(voiv);
  document.getElementById("alarm-score").textContent =
    `${pktTxt(st.score)} ${UI.t("pkt w oknie", "pts in a", "балів у вікні")} ${state?.fusion?.window_min ?? 60} min ${UI.t("", "window", "")}`;
  document.getElementById("alarm-signals").innerHTML =
    sigList(st.signals, 5)
    || (st.reasonsText ? st.reasonsText.split("\n").filter(Boolean).slice(0, 5)
          .map(r => `<div>${esc(r)}</div>`).join("") : "");
  const near = document.getElementById("alarm-nearest");
  if (near) { const html = nearestThreatLine(voiv); near.innerHTML = html; near.hidden = !html; }
  const todo = document.getElementById("alarm-todo");
  if (todo) todo.textContent = UI.t("Co zrobić: przejdź do miejsca schronienia albo pomieszczenia bez okien, z dala od szyb. Śledź komunikaty RCB i służb.", "What to do: go to a place of shelter or a room without windows, away from glass. Follow RCB and emergency service messages.", "Що робити: перейдіть в укриття або в кімнату без вікон, подалі від скла. Стежте за повідомленнями RCB і служб.");
  document.getElementById("alarm-time").textContent =
    (UI.t("alarm o ", "alert at ", "тривога о ")) + new Date().toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"));
  alarmWyborReset();
  alarmOverlay.classList.remove("hidden");
  alarmFokus();                // czytnik przechodzi na treść alarmu, nie na mapę pod spodem
  airRaidSiren(true);          // ciągła — milknie dopiero po potwierdzeniu
  przygotujGrote();            // tylko wczytanie w tle; ekranu nie przejmuje
}

/* Po potwierdzeniu alarmu: wybór zamiast natychmiastowego zamknięcia ekranu.
   Decyzja usera 20.09.2026 — aplikacja NIGDY sama nie przejmuje ekranu Grotą:
   człowiek patrzy właśnie na zagrożenie i sam wybiera, dokąd dalej. Przycisk
   schronienia jest tylko w aplikacji (klasa app-only), na stronie go nie ma. */
const alarmAck = document.getElementById("alarm-ack");
const alarmWybor = document.getElementById("alarm-choices");
function alarmWyborReset() {
  alarmAck.hidden = false;
  if (alarmWybor) alarmWybor.hidden = true;
  const t = (id, pl, en, uk) => { const el = document.getElementById(id); if (el) el.lastChild.textContent = UI.t(pl, en, uk); };
  t("alarm-grota", "Gdzie się schronić", "Where to shelter", "Де сховатися");
  t("alarm-map", "Obserwuj mapę", "Watch the map", "Спостерігати за мапою");
  // Trzeci język był pominięty i po ukraińsku ten przycisk był po angielsku.
  t("alarm-safe", "Jestem w bezpiecznym miejscu", "I'm in a safe place", "Я в безпечному місці");
}
function zamknijAlarm() {
  alarmOverlay.classList.add("hidden");
  alarmWyborReset();
  alarmFokusPowrot();          // fokus wraca tam, gdzie był przed alarmem
}
alarmAck.onclick = () => {
  stopSiren();
  if (!alarmWybor) { zamknijAlarm(); setPanel(true); return; }
  alarmAck.hidden = true;
  alarmWybor.hidden = false;
  // Schowany przycisk miał fokus — bez tego fokus spadał na <body>, a Tab
  // wychodził z alarmu na zasłoniętą mapę.
  [...alarmWybor.querySelectorAll("button")].find(b => b.offsetParent !== null)?.focus();
};
document.getElementById("alarm-map")?.addEventListener("click", () => {
  zamknijAlarm();
  setPanel(false);             // sama mapa, bez panelu na wierzchu
});
document.getElementById("alarm-safe")?.addEventListener("click", zamknijAlarm);
document.getElementById("alarm-grota")?.addEventListener("click", () => {
  zamknijAlarm();
  otworzGrote({ zakladka: "teraz" });   // z alarmu od razu TERAZ (decyzja usera 22.09.2026)
});

let audioCtx = null;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/* żółty poziom — wyrazisty dwutonowy sygnał uwagi (jak gong ostrzegawczy):
   dwa naprzemienne tony w trzech powtórzeniach, słyszalne, ale bez charakteru alarmu.

   Wzmocnienie 0,20 zamiast dawnego 0,55. Pomiar z 24.09.2026: przy 0,55 sygnał
   uwagi miał −5,8 dBFS RMS, a syrena alarmu −10,1 — czyli ŻÓŁTY BYŁ O 4 dB
   GŁOŚNIEJSZY OD CZERWONEGO, choć w otwartej aplikacji oba grają na tym samym
   strumieniu multimediów. Fala prostokątna 740/988 Hz trafia przy tym harmonicznymi
   w najczulszy zakres słuchu, więc różnica była słyszalnie jeszcze większa.
   0,20 stawia żółty ok. 4,5 dB POD syreną. Pilnuje tego scripts/test_glosnosc_alarmow.cjs.
   Poziomy plików dla powiadomień są inne i celowo — patrz scripts/build_sounds.py. */
const CHIME_GAIN = 0.20, CHIME_OCTAVE_MIX = 0.35;
/* Trzy stopnie z ustawień: „ciszej" to −10 dB (tyle samo, co cichszy kanał
   powiadomień), „bez dźwięku" zostawia sam baner i wibrację. */
const CHIME_LEVELS = { normal: 1, quiet: 0.32, silent: 0 };
/* Wibracja alfabetem Morse'a (decyzja usera 10.10.2026): żółty „U U” (· · —),
   czerwony „A A A” (· —), kropka 150/200 ms, kreska ×3. Te same wzory mają
   kanały Androida (Alarms.WZOR_U / WZOR_A) i sw.js — pilnuje tego
   scripts/test_wibracje_morse.cjs. navigator.vibrate zaczyna od wibracji,
   więc bez wiodącego zera z tablic Androida. */
const WIBRACJA_U = [150, 150, 150, 150, 450, 450, 150, 150, 150, 150, 450];
const WIBRACJA_A = [200, 200, 600, 600, 200, 200, 600, 600, 200, 200, 600];
/* Pełny alarm powtarza „A A A” z przerwą słowa (1400 ms), jak ekran natywny. */
const WIBRACJA_A_CO_MS = WIBRACJA_A.reduce((a, b) => a + b, 0) + 1400;
function zawibruj(wzor) { try { if (navigator.vibrate) navigator.vibrate(wzor); } catch {} }
function chimeLevel() {
  try {
    const v = localStorage.getItem("straznik_zolty_poziom");
    if (v && Object.prototype.hasOwnProperty.call(CHIME_LEVELS, v)) return v;
  } catch {}
  return "normal";
}
function attentionChime() {
  try {
    // w godzinach ciszy bez dźwięku, jak kanał żółtego (Alarms.yellowLevelNow)
    const mnoznik = CHIME_LEVELS[godzinyCiszyTeraz() ? "silent" : chimeLevel()];
    zawibruj(WIBRACJA_U);   // także z dźwiękiem: osoba głucha przy otwartej aplikacji
    if (!mnoznik) return;
    const szczyt = CHIME_GAIN * mnoznik;
    const c = ctx(), t0 = c.currentTime;
    const SEQ = [740, 988, 740, 988, 740, 988];   // fis2 ↔ h2
    const DUR = 0.34, GAP = 0.06;
    SEQ.forEach((f, i) => {
      const s = t0 + i * (DUR + GAP);
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = "square"; o2.type = "sine";
      o.frequency.value = f; o2.frequency.value = f * 2;   // oktawa dla ostrości
      const g2 = c.createGain(); g2.gain.value = CHIME_OCTAVE_MIX;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(szczyt, s + 0.015);
      g.gain.setValueAtTime(szczyt, s + DUR - 0.08);
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
// 0,62 daje −10,1 dBFS RMS. Sygnał uwagi stoi wyraźnie niżej (CHIME_GAIN) —
// odwrotna kolejność była błędem wykrytym pomiarem 24.09.2026. Czerwonego nie
// ściszamy; hierarchię pilnuje scripts/test_glosnosc_alarmow.cjs.
const SIREN_GAIN = 0.62;

function scheduleSirenSweeps(o, fromTime, cycles) {
  for (let i = 0; i < cycles; i++) {
    const s = fromTime + i * (SIREN_UP + SIREN_DOWN);
    o.frequency.exponentialRampToValueAtTime(SIREN_HI, s + SIREN_UP);
    o.frequency.exponentialRampToValueAtTime(SIREN_LO, s + SIREN_UP + SIREN_DOWN);
  }
  return fromTime + cycles * (SIREN_UP + SIREN_DOWN);
}

/* iPhone wycisza dźwięk WebView przełącznikiem dzwonka, bo domyślna kategoria sesji
   audio to soloAmbient — przy wyciszonym telefonie milczały także testy syreny
   i alarm przy otwartej aplikacji (zgłoszenie czytelnika, iOS 26.7, 23.09.2026).
   Na czas syreny prosimy natywną część o kategorię playback i zwalniamy ją po
   wyciszeniu; żółty sygnał uwagi celowo zostaje przy domyślnej, żeby nie przebijał
   wyciszenia i nie przerywał muzyki bez powodu. Android i przeglądarka: bez efektu.
   Dźwięku samego powiadomienia push to nie zmienia — na to trzeba Critical Alerts. */
function sesjaAudioAlarmu(wlacz) {
  if (!IS_IOS) return;
  try { BG()?.dzwiekAlarmu?.({ wlacz }); } catch {}
}

/* NIE DA SIĘ sprawdzić z góry, czy część natywna ma `dzwiekAlarmu`, a więc nie
   da się tu postawić zabezpieczenia „jak nie ma natywnej, zagraj z Web Audio".
   Capacitor 8 podstawia pod `Plugins.StraznikBackground` proxy, którego handler
   `get` zwraca `createPluginMethodWrapper(prop)` dla DOWOLNEJ nazwy
   (@capacitor/core 8.4.2, dist/index.cjs.js ~l. 161), więc
   `typeof BG().dzwiekAlarmu === "function"` jest prawdą także wtedy, gdy metody
   natywnie nie ma — wywołanie kończy się dopiero odrzuconą obietnicą.
   Próbowaliśmy takiego strażnika 24.09.2026 i był martwy; nie dokładaj go
   ponownie. Jedyny wiarygodny sygnał to WYNIK wywołania (odrzucenie albo
   `gra: false` przy `wlacz: true`) — zrobienie z tego awaryjnego powrotu do
   Web Audio wymaga przebudowy `airRaidSiren` na tor asynchroniczny i testu na
   urządzeniu, więc nie robimy tego przy okazji wydania.
   Ryzyko realne tylko wtedy, gdy ktoś zbuduje iOS z tym frontendem, a bez
   metody natywnej — wtedy alarm w aplikacji byłby BEZ DŹWIĘKU. Warunek do
   sprawdzenia po stronie sesji iOS przed każdym zgłoszeniem do Apple. */

/* Czerwony alarm „tylko wibracja” (Android, prośba czytelnika 29.09.2026).
   Stan trzymamy lokalnie, bo syrenę w OTWARTEJ aplikacji gra strona, a nie
   warstwa natywna — samo przestawienie kanału powiadomień by jej nie wyciszyło.
   Wartość przychodzi z natywnego status() i jest tam zapisywana na stałe. */
function czerwonyBezSyreny() {
  // Przełącznik istnieje WYŁĄCZNIE na Androidzie: iOS nie pozwala wyciszyć
  // pojedynczego rodzaju powiadomienia, więc cisza w otwartej aplikacji przy
  // wyjącym pushu byłaby myląca. Dzięki temu zachowanie na iPhonie jest tu
  // nietknięte, co sprawdzają scripts/test_ios_wspolne.cjs i test_syrena_ios.cjs.
  // Godziny ciszy liczą się tak samo jak w Alarms.redModeNow.
  return czerwonyTrybTeraz() !== "syrena";
}
/* Godziny ciszy (13.10.2026, Android). Prawdę trzyma Alarms.java (redModeNow,
   yellowLevelNow); tu kopia dla otwartej aplikacji — syrenę i sygnał uwagi gra
   wtedy strona. Minuty od północy; od == do znaczy „nigdy”. */
const CISZA_KLUCZ = "straznik_godziny_ciszy";
const CISZA_DOMYSLNIE = { on: false, od: 22 * 60, do: 7 * 60, czerwony: "wibracja" };
function ciszaUstawienia() {
  try {
    const v = JSON.parse(localStorage.getItem(CISZA_KLUCZ) || "null");
    if (v && typeof v === "object") return {
      on: v.on === true,
      od: Number.isInteger(v.od) && v.od >= 0 && v.od < 1440 ? v.od : CISZA_DOMYSLNIE.od,
      do: Number.isInteger(v.do) && v.do >= 0 && v.do < 1440 ? v.do : CISZA_DOMYSLNIE.do,
      czerwony: v.czerwony === "syrena" ? "syrena" : "wibracja" };
  } catch {}
  return { ...CISZA_DOMYSLNIE };
}
function wOknieCiszy(od, doo, teraz) {
  if (od === doo) return false;
  return od < doo ? (teraz >= od && teraz < doo) : (teraz >= od || teraz < doo);
}
function godzinyCiszyTeraz(d = new Date()) {
  if (!IS_APP || IS_IOS) return false;
  const c = ciszaUstawienia();
  return c.on && wOknieCiszy(c.od, c.do, d.getHours() * 60 + d.getMinutes());
}
/* Tryb czerwonego obowiązujący TERAZ. Cisza nigdy nie robi alarmu głośniejszym:
   „zwykłe” i „wibracja” wybrane na stałe zostają (lustro Alarms.redModeNow). */
function czerwonyTrybTeraz() {
  const t = czerwonyTryb();
  return t === "syrena" && godzinyCiszyTeraz() && ciszaUstawienia().czerwony === "wibracja" ? "wibracja" : t;
}
/* Tryb czerwonego z ustawień (10.10.2026): „syrena”, „wibracja” albo „zwykle”.
   Prawdę trzyma strona natywna; tu kopia dla otwartej aplikacji. Zapis sprzed
   tej zmiany (sam przełącznik ciszy) czytamy jako „wibracja”. Na iPhonie
   zawsze „syrena” — patrz wyżej. */
const TRYBY_CZERWONEGO = ["syrena", "wibracja", "zwykle"];
function czerwonyTryb() {
  if (IS_IOS) return "syrena";
  try {
    const v = localStorage.getItem("straznik_czerwony_tryb");
    if (TRYBY_CZERWONEGO.includes(v)) return v;
    return localStorage.getItem("straznik_czerwony_cisza") === "1" ? "wibracja" : "syrena";
  } catch { return "syrena"; }
}
/* Czerwony w trybie „zwykłe powiadomienie” przy otwartej aplikacji: tak samo
   jak powiadomienie przy zamkniętej — bez pełnego ekranu i syreny, ale z
   sygnałem, wibracją „A”, paskiem i komunikatem dla czytnika ekranu. */
function czerwonyZwykly(voiv, score) {
  chimeOnce();
  zawibruj(WIBRACJA_A);
  const gdzie = voiv ? `${UI.t("woj.", "province", "воєв.")} ${UI.voiv(voiv)}` : "";
  toast(`🔴 <b>${UI.t("Wysoki priorytet", "High priority", "Високий пріоритет")}</b>: ${esc(gdzie)}`
    + (score ? ` (${pktTxt(score)} ${UI.t("pkt", "pts", "бал.")})` : ""), 15000);
  powiedz(a11yAlert, UI.t(`Wysoki priorytet zagrożenia, ${gdzie}.`,
    `High threat priority, ${gdzie}.`, `Високий пріоритет загрози, ${gdzie}.`));
}

/* Parametr mimoCiszy — przycisk „Test: syrena” to prośba „daj mi to usłyszeć”, a nie
   alarm. Bez tego wyjątku test przy włączonej ciszy nie grał nic i wyglądał na
   zepsuty. Pełny alarm i test natywny celowo ciszę SZANUJĄ: one pokazują, co
   naprawdę się stanie. */
function airRaidSiren(continuous = true, mimoCiszy = false) {
  try {
    stopSiren();
    sesjaAudioAlarmu(true);
    // Cisza zdejmuje SAM tor audio — wibracja, pełny ekran i miganie zostają,
    // dlatego nie wychodzimy z funkcji, tylko pomijamy oscylatory.
    const bezSyreny = czerwonyBezSyreny() && !mimoCiszy;
    const total = 3 * (SIREN_UP + SIREN_DOWN);
    /* Na iPhonie syrenę odtwarza CZĘŚĆ NATYWNA (24.09.2026): `dzwiekAlarmu({wlacz:true})`
       puszcza w pętli alarm_syrena.wav przez AVAudioPlayer w kategorii `playback`, co
       — inaczej niż Web Audio — przebija przełącznik wyciszenia. Strona nie tworzy tu
       wtedy własnych oscylatorów, bo przy NIEwyciszonym telefonie grałyby dwie syreny
       naraz. Prośba i pomiar od sesji iOS; wcześniejsza próba sterowania sesją audio
       z wtyczki nie działała, bo dla Web Audio w WKWebView robi to WebKit.
       Żółtego sygnału uwagi to nie dotyczy — zostaje w stronie i ma podlegać wyciszeniu. */
    let o = null, g = null, c = null, t0 = 0, until = 0;
    const webAudio = !IS_IOS && !bezSyreny;   // cisza zdejmuje tor audio, nie wibrację
    if (webAudio) {
      c = ctx(); t0 = c.currentTime;
      o = c.createOscillator(); g = c.createGain();
      const filt = c.createBiquadFilter();
      filt.type = "lowpass"; filt.frequency.value = 2200;
      o.type = "sawtooth";
      o.connect(filt); filt.connect(g); g.connect(c.destination);
      o.frequency.setValueAtTime(SIREN_LO, t0);
      until = scheduleSirenSweeps(o, t0, 3);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(SIREN_GAIN, t0 + 0.3);
      o.start(t0);
      sirenNodes = { o, g, c };
    }

    if (continuous) {
      // dokładaj kolejne cykle, zanim zaplanowane się skończą (na iOS pętlą zajmuje
      // się strona natywna, więc nie ma czego dokładać)
      if (webAudio) {
        sirenTimer = setInterval(() => {
          if (!sirenNodes) return;
          until = scheduleSirenSweeps(o, Math.max(until, c.currentTime), 3);
        }, (SIREN_UP + SIREN_DOWN) * 2500);
      }
      if (navigator.vibrate) {
        const pulse = () => zawibruj(WIBRACJA_A);
        pulse(); vibrateTimer = setInterval(pulse, WIBRACJA_A_CO_MS);
      }
    } else {
      // tryb testowy — wycisz po trzech cyklach
      if (webAudio) {
        g.gain.setValueAtTime(SIREN_GAIN, t0 + total - 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
        o.stop(t0 + total + 0.1);
      }
      // Na iOS ten timeout jest JEDYNYM, co kończy test: natywna syrena gra w pętli
      // do polecenia „wyłącz", więc bez niego test nie skończyłby się sam.
      setTimeout(() => { sirenNodes = null; sesjaAudioAlarmu(false); }, total * 1000 + 200);
      zawibruj(WIBRACJA_A);
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
  // POZA warunkiem: na iPhonie `sirenNodes` nigdy nie powstaje (syrenę gra część
  // natywna), a to wywołanie jest jedynym, co ją zatrzymuje i oddaje sesję audio.
  sesjaAudioAlarmu(false);
}
// przeglądarki blokują dźwięk do pierwszej interakcji — odblokuj przy kliknięciu
window.addEventListener("pointerdown", () => { try { ctx(); } catch {} }, { once: true });

/* ── web push ────────────────────────────────────────────────────────────── */
/* ── komunikaty (toast) ──────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg, ms = 3800) {
  const el = document.getElementById("toast");
  /* Okno otwarte przez showModal() leży w warstwie nad całą stroną — pasek
     w <body> był pod nim niewidoczny, choć „działał” (komunikat o trybie cichym
     z przycisku „Poczuj”, emulator 11.10.2026). Przenosimy go do otwartego okna. */
  const okno = [...document.querySelectorAll("dialog[open]")].pop();
  const cel = okno || document.body;
  if (el.parentElement !== cel) cel.appendChild(el);
  el.innerHTML = msg;
  el.classList.remove("hidden");
  /* Pasek znika sam po kilku sekundach, więc czytnik ekranu nie zdąży na niego
     trafić — dotąd te komunikaty po prostu do kogoś niewidomego nie docierały.
     Idą teraz do pola `polite`: czytnik przeczyta je, gdy skończy bieżące
     zdanie. Bierzemy sam tekst, bo `msg` bywa HTML-em. */
  powiedz(a11yInfo, el.textContent);
  // długie komunikaty (ścieżki w ustawieniach) wiszą kilkanaście sekund —
  // dotknięcie zamyka je wcześniej
  el.onclick = () => { clearTimeout(toastTimer); el.classList.add("hidden"); };
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
  btn.title = on ? UI.t("Powiadomienia włączone — dotknij, aby wyciszyć", "Notifications on — tap to mute", "Сповіщення ввімкнено — торкніться, щоб вимкнути")
                 : UI.t("Powiadomienia wyciszone — dotknij, aby włączyć", "Notifications muted — tap to turn on", "Сповіщення вимкнено — торкніться, щоб увімкнути");
  return { perm, on };
}

async function toggleBell() {
  const { perm, on } = await refreshBell();
  if (on) {                       // wyłączamy — tylko lokalnie, bez ruszania systemu
    localStorage.setItem(NOTIF_KEY, "0");
    await refreshBell();
    toast(UI.t("<b>Powiadomienia wyciszone.</b><br>Alarmy dalej widać w aplikacji (kolory, syrena), ale nie dostaniesz powiadomień systemowych.",
               "<b>Notifications muted.</b><br>Alerts still show in the app (colours, siren), but you will not get system notifications.",
               "<b>Сповіщення вимкнено.</b><br>Тривоги й далі видно в застосунку (кольори, сирена), але системних сповіщень не буде."));
    return;
  }
  localStorage.setItem(NOTIF_KEY, "1");
  if (perm === "granted") {
    await refreshBell();
    toast(UI.t("<b>Powiadomienia włączone.</b><br>Dostaniesz je przy poziomie żółtym i czerwonym dla swojego województwa.",
               "<b>Notifications on.</b><br>You will get them at the yellow and red level for your province.",
               "<b>Сповіщення ввімкнено.</b><br>Ви отримаєте їх на жовтому й червоному рівні для свого воєводства."));
    return;
  }
  if (perm === "denied") {
    toast(UI.t("System blokuje powiadomienia dla Strażnika.<br>", "The system blocks notifications for Strażnik.<br>", "Система блокує сповіщення для Strażnika.<br>")
        + (IS_IOS ? UI.t("Włącz je w Ustawieniach iPhone'a (Menu → Ustawienia → Alarmy i zgody).", "Turn them on in iPhone Settings (Menu → Settings → Alerts and permissions).", "Увімкніть їх у Параметрах iPhone (Меню → Налаштування → Тривоги й дозволи).")
                  : UI.t("Włącz je w ustawieniach Androida (Menu → Ustawienia → Alarmy i zgody).", "Turn them on in Android settings (Menu → Settings → Alerts and permissions).", "Увімкніть їх у налаштуваннях Android (Меню → Налаштування → Тривоги й дозволи).")), 6000);
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
    ? UI.t("<b>Powiadomienia włączone.</b><br>Dostaniesz je przy poziomie żółtym i czerwonym.", "<b>Notifications on.</b><br>You will get them at the yellow and red level.", "<b>Сповіщення ввімкнено.</b><br>Ви отримаєте їх на жовтому й червоному рівні.")
    : UI.t("Bez zgody na powiadomienia — powiadomienia systemowe zostają wyłączone.", "No notification permission — system notifications stay off.", "Без дозволу на сповіщення — системні сповіщення лишаються вимкненими."));
}

async function enablePush() {
  if (standalone) return toggleBell();
  const base = apiBase(); if (!base) return openSettings(true);
  const voivodeships = Places?.observedVoivodeships(savedPlaces) || [];
  if (!voivodeships.length) {
    toast(UI.t("Najpierw wybierz województwo w ⚙ → Moje miejsca — powiadomienia idą według województwa.", "First choose a province in ⚙ → My places — notifications are sent per province.", "Спершу виберіть воєводство в ⚙ → Мої місця — сповіщення йдуть за воєводством."), 6000);
    openSettings();
    document.querySelector('#settings .set-tab[data-pane="miejsca"]')?.click();
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return toast(UI.t("Ta przeglądarka nie obsługuje powiadomień push.", "This browser does not support push notifications.", "Цей браузер не підтримує push-сповіщень."), 6000);
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    // bez komunikatu dzwonek wyglądał, jakby nie reagował (zgłoszone 13.09.2026)
    toast((UI.t("🔕 Przeglądarka blokuje powiadomienia dla straznik.eu. Aby je dopuścić: ", "🔕 The browser blocks notifications for straznik.eu. To allow them: ", "🔕 Браузер блокує сповіщення для straznik.eu. Щоб їх дозволити: "))
      + esc(browserNotifPath(UI.lang, true))
      + `<br><span class="muted">${UI.t("Dotknij, aby zamknąć", "Tap to close", "Торкніться, щоб закрити")}</span>`, 20000);
    return;
  }
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
  const names = voivodeships.map(v => UI.voiv(v)).join(", ");
  toast(UI.t(`🔔 <b>Powiadomienia włączone</b> dla: ${esc(names)}.<br>Przyjdą też przy zamkniętej karcie. Aby je wyłączyć, dotknij dzwonka ponownie.`, `🔔 <b>Notifications on</b> for: ${esc(names)}.<br>They arrive even with the tab closed. To turn them off, tap the bell again.`, `🔔 <b>Сповіщення увімкнено</b> для: ${esc(names)}.<br>Вони приходитимуть і при закритій вкладці. Щоб вимкнути, торкніться дзвіночка ще раз.`), 6000);
}

/* Strona WWW: stan powiadomień push w TEJ przeglądarce i przyciski do ich
   włączenia i wyłączenia. Wcześniej wyłączyć dało się je tylko w ustawieniach
   przeglądarki, a okno pisało nieprawdę, że w przeglądarce alarm widać wyłącznie
   przy otwartej karcie (13.09.2026: użytkowniczka nie wiedziała, jak to zatrzymać). */
/* Konkretna ścieżka do uprawnień witryny w przeglądarce, którą ktoś właśnie
   używa — ogólne „ikona obok adresu" nie wystarczało (prośba z 13.09.2026). */
function browserNotifPath(jezyk = UI.lang, allow = false) {
  const isEn = jezyk === "en", isUk = jezyk === "uk";
  const T = (pl, en, uk) => jezyk === "pl" ? pl : jezyk === "uk" ? (uk !== undefined ? uk : en) : en;
  const ua = navigator.userAgent || "";
  const site = location.host || "straznik.eu";
  const android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua);
  const firefox = /Firefox|FxiOS/i.test(ua), edge = /Edg\//i.test(ua);
  const samsung = /SamsungBrowser/i.test(ua);
  const safari = /Safari/i.test(ua) && !/Chrome|CriOS|Edg|Firefox|FxiOS|SamsungBrowser/i.test(ua);
  // [ścieżka, słowo przy blokowaniu, słowo przy dopuszczaniu]
  const [path, block, permit] = isUk
    ? samsung ? [`Samsung Internet: ☰ → Налаштування → Сайти й завантаження → Сповіщення → ${site}`, "вимкнути", "увімкнути"]
      : android && firefox ? [`Firefox на Android: ⋮ → Налаштування → Дозволи сайтів → Сповіщення → ${site}`, "Заблоковано", "Дозволено"]
      : android ? [`Chrome на Android: ⋮ → Налаштування → Налаштування сайтів → Сповіщення → ${site}`, "Блокувати", "Дозволити"]
      : ios ? ["iPhone: Налаштування → Сповіщення → Strażnik (сайт, доданий на екран «Початок») → «Дозволити сповіщення»", "вимкнути", "увімкнути"]
      : firefox ? ["Firefox: замочок біля адреси → З\u2019єднання захищене → Докладніше → Дозволи → Показ сповіщень", "Блокувати", "Дозволити"]
      : safari ? [`Safari на Mac: Safari → Налаштування → Веб-сайти → Сповіщення → ${site}`, "Відхиляти", "Дозволяти"]
      : edge ? ["Edge: замочок біля адреси → Дозволи для цього сайту → Сповіщення", "Блокувати", "Дозволити"]
      : ["Chrome: іконка налаштувань сайту біля адреси → Налаштування сайту → Сповіщення", "Блокувати", "Дозволити"]
    : isEn
    ? samsung ? [`Samsung Internet: ☰ → Settings → Sites and downloads → Notifications → ${site}`, "off", "on"]
      : android && firefox ? [`Firefox on Android: ⋮ → Settings → Site permissions → Notifications → ${site}`, "Blocked", "Allowed"]
      : android ? [`Chrome on Android: ⋮ → Settings → Site settings → Notifications → ${site}`, "Block", "Allow"]
      : ios ? ["iPhone: Settings → Notifications → Strażnik (the site added to the Home Screen) → Allow Notifications", "off", "on"]
      : firefox ? ["Firefox: the padlock next to the address → Connection secure → More information → Permissions → Send notifications", "Block", "Allow"]
      : safari ? [`Safari on Mac: Safari → Settings → Websites → Notifications → ${site}`, "Deny", "Allow"]
      : edge ? ["Edge: the padlock next to the address → Permissions for this site → Notifications", "Block", "Allow"]
      : ["Chrome: the site settings icon next to the address → Site settings → Notifications", "Block", "Allow"]
    : samsung ? [`Samsung Internet: ☰ → Ustawienia → Witryny i pobieranie → Powiadomienia → ${site}`, "wyłącz", "włącz"]
      : android && firefox ? [`Firefox na Androidzie: ⋮ → Ustawienia → Uprawnienia witryn → Powiadomienia → ${site}`, "Zablokowane", "Dozwolone"]
      : android ? [`Chrome na Androidzie: ⋮ → Ustawienia → Ustawienia witryn → Powiadomienia → ${site}`, "Blokuj", "Zezwalaj"]
      : ios ? ["iPhone: Ustawienia → Powiadomienia → Strażnik (strona dodana do ekranu początkowego) → „Zezwalaj na powiadomienia”", "wyłącz", "włącz"]
      : firefox ? ["Firefox: kłódka obok adresu → Połączenie zabezpieczone → Więcej informacji → Uprawnienia → Wyświetlanie powiadomień", "Blokuj", "Zezwalaj"]
      : safari ? [`Safari na Macu: Safari → Ustawienia → Witryny → Powiadomienia → ${site}`, "Odmawiaj", "Zezwalaj"]
      : edge ? ["Edge: kłódka obok adresu → Uprawnienia dla tej witryny → Powiadomienia", "Blokuj", "Zezwalaj"]
      : ["Chrome: ikona ustawień witryny obok adresu → Ustawienia witryny → Powiadomienia", "Blokuj", "Zezwalaj"];
  // Ścieżka uniwersalna (podpowiedź użytkownika z 13.09.2026): w każdej przeglądarce
  // da się wyszukać „ustawienia witryn" w jej ustawieniach, nawet gdy nie rozpoznamy nazwy.
  const any = T(`W każdej przeglądarce: otwórz jej Ustawienia, w polu wyszukiwania wpisz „ustawienia witryn” (albo samo „witryn”) → Uprawnienia → odnajdź ${site} → Powiadomienia → ${allow ? "Zezwalaj" : "Blokuj"}.`, `In any browser: open its Settings, type “site settings” (or “site”) in the search field → Permissions → find ${site} → Notifications → ${allow ? "Allow" : "Block"}.`, `У будь-якому браузері: відкрийте його Налаштування, у полі пошуку введіть «налаштування сайтів» (або просто «сайт») → Дозволи → знайдіть ${site} → Сповіщення → ${allow ? "Дозволити" : "Блокувати"}.`);
  return `${path} → ${allow ? permit : block}. ${any}`;
}

async function browserPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function refreshWebPushStatus(jezyk = UI.lang) {
  const T = (pl, en, uk) => jezyk === "pl" ? pl : jezyk === "uk" ? (uk !== undefined ? uk : en) : en;
  const info = document.getElementById("bg-status");
  const on = document.getElementById("btn-web-push-on");
  const off = document.getElementById("btn-web-push-off");
  if (!on || !off) return;
  on.hidden = off.hidden = true;
  on.textContent = T("Włącz powiadomienia w tej przeglądarce", "Turn on notifications in this browser", "🔔 Увімкнути сповіщення в цьому браузері");
  off.textContent = T("Wyłącz powiadomienia w tej przeglądarce", "Turn off notifications in this browser", "🔕 Вимкнути сповіщення в цьому браузері");
  let text;
  const iosBrowser = /iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    && !(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone);
  if (iosBrowser) {
    // Audyt B9: iPhone dopuszcza push tylko dla strony dodanej do ekranu początkowego
    text = T("Na iPhonie powiadomienia działają dopiero po dodaniu Strażnika do ekranu początkowego: Udostępnij → Do ekranu początk., potem otwórz go z ikony i włącz powiadomienia tutaj.", "On iPhone, notifications work only after adding Strażnik to the Home Screen: Share → Add to Home Screen, then open it from the icon and turn notifications on here.", "На iPhone сповіщення працюють лише після додавання Strażnika на екран «Початок»: Поділитися → На екран «Початок», потім відкрийте його з іконки й увімкніть сповіщення тут.");
  } else if (standalone || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    text = T("Ta przeglądarka nie obsługuje powiadomień push — alarm widać tylko przy otwartej karcie.", "This browser does not support push notifications — alerts are visible only while the tab is open.", "Цей браузер не підтримує push-сповіщень — тривогу видно лише при відкритій вкладці.");
  } else if (Notification.permission === "denied") {
    text = (T("Powiadomienia dla straznik.eu są zablokowane w tej przeglądarce. Aby je dopuścić: ", "Notifications for straznik.eu are blocked in this browser. To allow them: ", "Сповіщення для straznik.eu заблоковані в цьому браузері. Щоб їх дозволити: "))
      + browserNotifPath(jezyk, true);
  } else {
    let sub = null;
    try { sub = Notification.permission === "granted" ? await browserPushSubscription() : null; } catch {}
    const regions = (Places?.observedVoivodeships(savedPlaces) || []).map(v => UI.voiv(v)).join(", ");
    if (sub) {
      off.hidden = false;
      text = (T(`Powiadomienia push są włączone${regions ? " dla: " + regions : ""}. Przychodzą także przy zamkniętej karcie — jedno powiadomienie na alarm.`, `Push notifications are on${regions ? " for: " + regions : ""}. They arrive even with the tab closed — one notification per alert.`, `Push-сповіщення увімкнено${regions ? " для: " + regions : ""}. Вони приходять і при закритій вкладці — одне сповіщення на тривогу.`));
    } else {
      on.hidden = false;
      text = T("Powiadomienia push są wyłączone. Alarm widać tylko przy otwartej karcie.", "Push notifications are off. Alerts are visible only while the tab is open.", "Push-сповіщення вимкнено. Тривогу видно лише при відкритій вкладці.");
      if (Notification.permission === "granted")
        text += (T(" Pozwolenie przeglądarki wciąż jest nadane — aby usunąć i je: ", " The browser permission is still granted — to remove it too: ", " Дозвіл браузера досі наданий — щоб зняти і його: ")) + browserNotifPath(jezyk);
    }
  }
  if (info) info.textContent = text;
}

async function disableBrowserPush() {
  const base = apiBase();
  let sub = null;
  try { sub = await browserPushSubscription(); } catch {}
  if (sub) {
    // najpierw serwer, żeby nie wysyłał już na ten adres; potem sama przeglądarka
    if (base) {
      try {
        await fetch(base + "/api/push/unsubscribe", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }) });
      } catch {}
    }
    try { await sub.unsubscribe(); } catch {}
  }
  localStorage.setItem(NOTIF_KEY, "0");
  document.getElementById("btn-push").classList.remove("active");
  await refreshWebPushStatus();
  toast((UI.t("🔕 <b>Powiadomienia w tej przeglądarce wyłączone.</b><br>Strażnik nie wyśle już tu push.<br>", "🔕 <b>Notifications turned off in this browser.</b><br>Strażnik will not send push here any more.<br>"
      + "To also remove the browser permission: ", "🔕 <b>Сповіщення в цьому браузері вимкнено.</b><br>Strażnik більше не надішле сюди push.<br>")
      + "Aby usunąć też samo pozwolenie przeglądarki: ") + esc(browserNotifPath())
    + `<br><span class="muted">${UI.t("Dotknij, aby zamknąć", "Tap to close", "Торкніться, щоб закрити")}</span>`, 20000);
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
    toast(UI.t("Najpierw ustaw miejsce: Ustawienia → Moje miejsca", "Set your place first: Settings → My places", "Спершу вкажіть місце: Налаштування → Мої місця"));
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

/* Adres miniatury składamy DOPIERO przy wyświetleniu, a w pliku danych trzymamy
   wyłącznie identyfikator kamery. Powodem jest awaria zgłoszona 03.10.2026: lista
   zbudowana 30.07.2026 miała w sobie gotowe adresy
   `…/webcams/400x225/2026-07-30/<id>.jpg` i tego dnia wszystkie zwracały 404.
   Zepsuły się w nich DWIE rzeczy, obie wpisane na sztywno:
     • rozmiar — worldcam wymienił `400x225` na `400x226`; stary rozmiar nie działa
       dziś dla żadnej daty, także dla tej, pod którą został zapisany,
     • data — serwis trzyma archiwum po dniach, więc zamrożona data z czasów budowy
       listy pokazywałaby zdjęcie z tamtego dnia jako bieżące (dopiero po wygaśnięciu
       archiwum ścieżka wraca do obrazu aktualnego — na tym nie wolno się opierać).
   Dlatego dzień bierzemy z zegara urządzenia przy każdym odrysowaniu (przejście
   północy przy otwartym okienku też), a rozmiarów próbujemy po kolei. */
const CAM_HOST = "https://www.img.worldcam.pl/webcams";
const CAM_SIZES = ["400x226", "400x225", "200x113"];
let camSizeIdx = 0;                 // rozmiar, który ostatnio realnie się pobrał
/* Czy wczytujemy miniatury wprost z worldcam.pl. WYŁĄCZONE decyzją użytkownika
   z 03.10.2026, po sprawdzeniu regulaminu serwisu (https://www.worldcam.pl/terms,
   ostatnia zmiana 22.12.2025): rozdział VI opisuje WYŁĄCZNIE własne użycie miniatur
   przez worldcam („przy wpisach i na mapie wyświetlamy…"), a zgody na pokazywanie
   ich w cudzym serwisie czy aplikacji nie ma tam wcale; stopka serwisu to „All
   Rights Reserved". Linkowanie do wpisów jest natomiast wprost w celu regulaminu,
   więc lista kamer z odnośnikami zostaje — znika sam obraz.

   Warunkiem powrotu na `true` jest PISEMNA ZGODA worldcam.pl, nie upływ czasu ani
   to, że technicznie nic nie blokuje (robots.txt wpuszcza wszystko, nagłówka
   Referer nie sprawdzają — brak blokady to nie zgoda).

   Przy powrocie na `true` w TYM SAMYM wydaniu musi pójść polityka prywatności:
   `docs/prywatnosc.html` i `docs/prywatnosc-en.html` wymieniają FOSSGIS,
   OpenFreeMap, Firebase i Cloudflare, ale nie worldcam.pl — a telefon łączy się
   z img.worldcam.pl bezpośrednio i pokazuje mu swój adres IP. Pilnuje tego
   scripts/test_kamery_miniatury.cjs. */
const CAM_THUMBS = false;

/* Dzień w formacie serwisu, z LOKALNEGO zegara — nie z `toISOString`, bo ten podaje
   UTC i wieczór w Polsce wypadałby jeszcze pod poprzednią datą. */
function camDay() {
  const d = new Date(), dwie = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + dwie(d.getMonth() + 1) + "-" + dwie(d.getDate());
}
function camThumb(id, size) {
  return CAM_HOST + "/" + (size || CAM_SIZES[camSizeIdx]) + "/" + camDay()
    + "/" + encodeURIComponent(id) + ".jpg";
}
/* Co zrobić po błędzie pobrania: wziąć kolejny rozmiar z listy, a gdy lista się
   skończy — pokazać zastępnik. Kafelka NIE ukrywamy: do 03.10.2026 martwa miniatura
   znikała (`display:none`), więc gdy padły wszystkie naraz, użytkownik dostawał okno
   z samymi nagłówkami miast i pustką pod nimi. */
function camNextStep(sizeIdx) {
  const next = sizeIdx + 1;
  return next < CAM_SIZES.length ? { idx: next, size: CAM_SIZES[next] } : { dead: true };
}

/* Lista województw z kamerami ładowana z danych, nie zaszyta na sztywno —
   dzięki temu przycisk pojawia się wszędzie tam, gdzie faktycznie coś jest. */
async function loadCams() {
  if (camData) return camData;
  try { camData = await (await fetch("assets/kamery.json?v=1.7.87c")).json(); }
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
    UI.t(`Kamery — woj. ${UI.voiv(voiv)} (${outdoor.length} plenerowych)`, `Cameras — ${UI.voiv(voiv)} (${outdoor.length} outdoor)`, `Камери — ${UI.voiv(voiv)} (${outdoor.length} зовнішніх)`);

  /* Adres miniatury wstawia camShowThumbs() po wsadzeniu HTML — obsługa błędu
     wymaga nasłuchu w JS (walka o kolejny rozmiar), a atrybut `onerror` i tak
     odpadłby przy CSP. Zastępnik jest w kafelku od początku i odsłania go CSS,
     gdy kafelek dostanie klasę `cam-dead`. */
  const tile = (c) => `
    <a class="cam-tile${CAM_THUMBS ? "" : " cam-dead"}" href="${esc(c.url)}"
       target="_blank" rel="noopener" title="${esc(c.name)} — ${esc(c.city)}">
      ${CAM_THUMBS ? `<img alt="${esc(c.name)}" data-cam="${esc(c.id)}">` : ""}
      <span class="cam-fallback">${CAM_THUMBS
        ? UI.t("podgląd niedostępny — dotknij, aby otworzyć kamerę",
               "preview unavailable — tap to open the camera",
               "попередній перегляд недоступний — торкніться, щоб відкрити камеру")
        : UI.t("podgląd tylko u źródła — dotknij, aby otworzyć kamerę",
               "preview only at the source — tap to open the camera",
               "перегляд лише на джерелі — торкніться, щоб відкрити камеру")}</span>
      <span>${esc(c.name)}</span>
    </a>`;
  // grupowanie po miejscowości, żeby dało się szybko znaleźć swoją okolicę
  const groupBy = (arr) => {
    const by = {};
    for (const c of arr) (by[c.city] = by[c.city] || []).push(c);   // bez ||= (Chrome 85)
    return Object.entries(by).map(([city, cams]) =>
      `<div class="cam-city">${esc(city)}</div>
       <div class="cam-grid">${cams.map(tile).join("")}</div>`).join("");
  };

  document.getElementById("cam-list").innerHTML = list.length
    ? groupBy(outdoor) + (indoor.length ? `
        <details class="cam-indoor">
          <summary>${UI.t(`Kamery wnętrzowe (${indoor.length}) — transmisje z kościołów, mało przydatne do oceny sytuacji na zewnątrz`, `Indoor cameras (${indoor.length}) — church streams, of little use for judging the situation outside`, `Камери в приміщеннях (${indoor.length}) — трансляції з костелів, мало корисні для оцінки ситуації надворі`)}</summary>
          ${groupBy(indoor)}
        </details>` : "")
    : `<div class="fineprint">${UI.t("Brak zweryfikowanych kamer dla tego województwa.", "No verified cameras for this province.", "Немає перевірених камер для цього воєводства.")}</div>`;
  camShowThumbs();
  dlg.showModal();
  // odświeżanie miniatur, dopóki okno jest otwarte; przy CAM_THUMBS = false nie ma
  // czego odświeżać, więc timer w ogóle nie rusza
  clearInterval(camTimer);
  if (CAM_THUMBS) camTimer = setInterval(() => {
    if (!dlg.open) return clearInterval(camTimer);
    camShowThumbs(true);
  }, 30000);
}

/* Podpina (albo odświeża) miniatury w otwartym okienku. Adres liczymy od zera —
   dzięki temu po północy wchodzi nowa data, a nie stary adres z doklejonym `?t=`.
   Kafelek, który raz padł, zostaje przy swoim ostatnim rozmiarze: dalej próbuje,
   ale już jednym zapytaniem, a nie całą listą przy każdym odświeżeniu. */
function camShowThumbs(odswiez) {
  if (!CAM_THUMBS) return;
  document.querySelectorAll("#cam-list img[data-cam]").forEach(img => {
    if (!odswiez) {
      img.dataset.size = String(camSizeIdx);
      img.addEventListener("error", () => {
        const krok = camNextStep(+img.dataset.size);
        if (krok.dead) { img.closest(".cam-tile").classList.add("cam-dead"); return; }
        img.dataset.size = String(krok.idx);
        img.src = camThumb(img.dataset.cam, krok.size);
      });
      img.addEventListener("load", () => {
        camSizeIdx = +img.dataset.size;          // ten rozmiar działa — zacznij od niego
        img.closest(".cam-tile").classList.remove("cam-dead");
      });
    }
    // bez `||`: indeks 0 jest fałszywy i kafelek na pierwszym rozmiarze dostawałby
    // przy odświeżeniu cudzy, późniejszy rozmiar
    img.src = camThumb(img.dataset.cam, CAM_SIZES[+img.dataset.size])
      + (odswiez ? "?t=" + Date.now() : "");
  });
}
const camClose = document.getElementById("cam-close");
if (camClose) camClose.onclick = () => {
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
/* Dziura w buforze: aplikacja w tle nic nie nagrywa (system zamraża WebView), a po
   powrocie dopisuje migawkę z bieżącą godziną. Sam wiek najnowszej migawki niczego
   wtedy nie zdradza — historia wygląda na świeżą, a w środku brakuje całego okresu
   (zgłoszone 19.09.2026: przeskok ok. 19:25 i brak danych do 20:25). Zapamiętujemy
   przerwę i przy wejściu w historię dociągamy paczkę z serwera. */
let _srvHole = false;
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

/* Zapis żywego stanu do bufora: sygnały (od razu) + migawka pozycji co ~1 min. */
function srvRecord(s) {
  const voivs = s?.fusion?.voivodeships || {};
  const flat = [];
  for (const st of Object.values(voivs)) for (const sig of (st.signals || [])) flat.push(sig);
  srvMergeSignals(flat);
  const now = Date.now();
  if (now - _srvSnapT < 55000) return;              // migawki co ~1 min, jak na serwerze
  if (_srvSnapT && now - _srvSnapT > 3 * 60000) _srvHole = true;   // wypadły co najmniej dwie
  _srvSnapT = now;
  const threats = (s?.neptun?.threats || []).filter(t => t.lat != null).map(t => ({
    id: t.id, type: t.type, lat: +(+t.lat).toFixed(3), lon: +(+t.lon).toFixed(3),
    heading: t.heading, confidenceLevel: t.confidenceLevel, uncertaintyKm: t.uncertaintyKm,
    region: t.region, locality: t.locality, sourceCount: t.sourceCount,
    destination: t.destination, positionQuality: positionQuality(t),
    areaOnly: t.areaOnly, straznik_position: positionInfo(t),
    straznik_national: t.straznik_national, pl_assessment: t.pl_assessment }));
  const aircraft = (s?.adsb?.aircraft || []).map(a => ({ hex: a.hex, callsign: a.callsign,
    type: a.type, lat: +(+a.lat).toFixed(3), lon: +(+a.lon).toFixed(3), alt: a.alt, gs: a.gs,
    track: a.track, voivodeship: a.voivodeship, desc: a.desc, cat: a.cat,
    reg: a.reg, op: a.op, vr: a.vr, year: a.year }));
  const snap = { ts: new Date(now).toISOString(), t: now, threats, aircraft,
    // obiekty bez współrzędnych — historia nie może uznać ich za zgubione z feedu
    bezPozycji: (s?.neptun?.threats || []).filter(t => t.lat == null).map(t => t.id) };
  // strefy z tej chwili, jak w migawce serwera — tylko gdy znamy bieżące
  if (zonesData) snap.zones = zonesData.features
    .filter(f => f.properties?.key)
    .map(f => [f.properties.key, f.properties.since || 0, !!f.properties.atBoot]);
  srvSnaps.push(snap);
  const cut = now - HIST_MS;
  srvSnaps = srvSnaps.filter(sn => sn.t >= cut);
}

/* Jednorazowy backfill 12 h z serwera (pozycje sprzed otwarcia apki). Łagodnie
   znosi stary backend bez endpointu — wtedy historia jest krótsza (tylko to, co
   apka nagrała na żywo od otwarcia), ale apka działa. */
async function seedBundle() {
  const base = apiBase(); if (!base) return false;
  try {
    const r = await fetch(base + "/api/history/bundle?hours=12", { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    srvMergeSignals((j.signals || []).map(s => ({ ...s, t: Date.parse(s.ts) })));
    const have = new Set(srvSnaps.map(sn => sn.ts));
    for (const sn of (j.snaps || [])) {
      if (have.has(sn.ts)) continue;
      // migawki z archiwum idą osobnym pobraniem i omijają applyState
      normalizujTypy(sn.threats);
      srvSnaps.push({ ...sn, t: Date.parse(sn.ts) });
    }
    srvAdsbEvents = (j.adsb_watch_events || []).map(e => ({ ...e, t: Date.parse(e.ts) }));
    if (j.zone_defs && typeof j.zone_defs === "object") Object.assign(srvZoneDefs, j.zone_defs);
    watchSyncState = "ok";
    srvSnaps.sort((a, b) => a.t - b.t);
    srvSeeded = true;
    _srvHole = false;
    return true;
  } catch { return false; }
}
function needSeed() {
  if (!srvSeeded || _srvHole) return true;
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
/* ── Wykres 12 h w historii (14.10.2026) ───────────────────────────────────
   Te same reguły co licznik w pasku (licznikZObiektow), policzone dla każdej
   migawki. Surowa liczba skacze, bo źródło gasi obiekty paczkami — krzywa dronów
   to więc średnia z 30 min (decyzja usera), a surowe wartości stoją pod nią jako
   blade słupki. Rakiety i KAB to kropki u dołu (przy kilkudziesięciu dronach
   kilka rakiet byłoby płaską linią). Dziura w migawkach >10 min przerywa krzywą. */
const W12_W = 364, W12_H = 84, W12_SREDNIA_MS = 30 * 60000, W12_DZIURA_MS = 10 * 60000;
let _snapyLokalne = null, _snapyLokalneT = 0;
function snapyHistorii() {
  if (!standalone) return srvSnaps;
  if (!_snapyLokalne || Date.now() - _snapyLokalneT > 60000) {
    try { _snapyLokalne = JSON.parse(localStorage.getItem("eng_snaps") || "[]"); } catch { _snapyLokalne = []; }
    _snapyLokalneT = Date.now();
  }
  return _snapyLokalne;
}
/* [{t, drony, rakiety}] — po jednej migawce na minutę (bufor ma migawki serwera
   i własne aplikacji, czasem dwie w tej samej minucie). */
function seriaDronow(snaps) {
  const s = [...(snaps || [])].filter(x => Number.isFinite(x?.t)).sort((a, b) => a.t - b.t);
  const out = [];
  for (const x of s) {
    if (out.length && x.t - out[out.length - 1].t < 50000) continue;
    const l = licznikZObiektow(x.threats);
    out.push({ t: x.t, drony: l.drony, rakiety: l.rakiety });
  }
  /* Średnia z OSTATNICH 30 min do danej chwili, po czasie (migawki mają dziury).
     Do 15.10.2026 było okno ±15 min wokół chwili — w historii sięgało w przyszłość
     i o 15:36 dawało 3 przy 5 z poprzednich 30 min (zgłoszenie usera). */
  let a = 0, b = 0, suma = 0;
  for (let i = 0; i < out.length; i++) {
    while (b <= i) suma += out[b++].drony;
    while (out[a].t < out[i].t - W12_SREDNIA_MS) suma -= out[a++].drony;
    out[i].srednia = suma / (b - a);
  }
  return out;
}
function sciezkaGladka(pkt) {        // Catmull-Rom → krzywe Béziera
  if (!pkt.length) return "";
  let d = `M${pkt[0][0].toFixed(1)},${pkt[0][1].toFixed(1)}`;
  for (let i = 0; i < pkt.length - 1; i++) {
    const p0 = pkt[i - 1] || pkt[i], p1 = pkt[i], p2 = pkt[i + 1], p3 = pkt[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}`
      + ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}`
      + ` ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
let w12 = null;   // { seria, t0, t1, max } dla bieżącego wejścia w historię
function wykres12Rysuj(svg, W, H, mini) {
  if (!w12 || !svg) return;
  const { seria, t0, t1, max } = w12;
  const x = t => (t - t0) / Math.max(1, t1 - t0) * W;
  const y = mini ? (v => H - 2 - v / max * (H - 4)) : (v => wykres12Y(v, H));
  let out = "";
  if (!mini) {
    for (let v = w12.krok; v <= max; v += w12.krok)
      out += `<line class="w12-siatka" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
    for (let i = 0; i < seria.length; i += 2)
      out += `<line class="w12-slupek" x1="${x(seria[i].t).toFixed(1)}" x2="${x(seria[i].t).toFixed(1)}" y1="${H - 10}" y2="${y(seria[i].drony).toFixed(1)}"/>`;
  }
  // krzywa w kawałkach — dziura w migawkach przerywa linię zamiast ją zmyślać
  const kawalki = [[]];
  const krok = mini ? 10 : 4;
  for (let i = 0; i < seria.length; i++) {
    if (i && seria[i].t - seria[i - 1].t > W12_DZIURA_MS) kawalki.push([]);
    const k = kawalki[kawalki.length - 1];
    if (i % krok === 0 || i === seria.length - 1 || (i + 1 < seria.length && seria[i + 1].t - seria[i].t > W12_DZIURA_MS))
      k.push([x(seria[i].t), y(seria[i].srednia)]);
  }
  for (const k of kawalki) {
    if (k.length < 2) continue;
    const d = sciezkaGladka(k);
    if (!mini) out += `<path class="w12-pole" d="${d} L${k[k.length - 1][0].toFixed(1)},${H - 10} L${k[0][0].toFixed(1)},${H - 10} Z"/>`;
    out += `<path class="w12-linia" d="${d}"/>`;
  }
  // rakiety: kropka na każde 10 min z rakietą, większa przy większej liczbie
  if (!mini) {
    const kosze = new Map();
    for (const p of seria) if (p.rakiety > 0) {
      const k = Math.floor(p.t / 600000);
      kosze.set(k, Math.max(kosze.get(k) || 0, p.rakiety));
    }
    for (const [k, n] of kosze)
      out += `<circle class="w12-rakieta" cx="${x(k * 600000 + 300000).toFixed(1)}" cy="${H - 4}" r="${(2.4 + Math.min(n, 10) * 0.35).toFixed(1)}"/>`;
    out += `<line id="w12-kreska" class="w12-kreska" x1="${W}" x2="${W}" y1="0" y2="${H}"/>`;
    out += `<circle id="w12-punkt" class="w12-punkt" cx="${W}" cy="${H}" r="3.5"/>`;
  }
  svg.innerHTML = out;
}
/* Oś pionowa wspólna dla krzywej, siatki i etykiet: 10 px na dole zostaje na kropki rakiet. */
function wykres12Y(v, H = W12_H) { return H - 10 - v / w12.max * (H - 16); }
function wykres12Godz(t) {
  return new Date(t).toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" });
}
function wykres12Odswiez() {
  const box = document.getElementById("wykres12");
  if (!box) return;
  const seria = seriaDronow(snapyHistorii());
  const t0 = Date.parse(histTimes[0]), t1 = Date.parse(histTimes[histTimes.length - 1]);
  if (!seria.length || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) { box.hidden = true; w12 = null; return; }
  box.hidden = false;
  const szczyt = seria.reduce((a, p) => p.drony > a.drony ? p : a, seria[0]);
  const szczytR = seria.reduce((a, p) => p.rakiety > a.rakiety ? p : a, seria[0]);
  // Podziałka (uwaga usera: „brakuje liczb na skali”): krok 1/2/5 × 10^n, najwyżej
  // cztery linie, a góra wykresu to pełna wielokrotność kroku.
  const surowy = Math.max(4, szczyt.drony, ...seria.map(p => p.srednia));
  const krok = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find(k => surowy / k <= 4) || 1000;
  w12 = { seria, t0, t1, krok, max: Math.ceil(surowy / krok) * krok };
  document.getElementById("w12-t").textContent = UI.t("Drony i rakiety · 12 h", "Drones and missiles · 12 h", "Дрони й ракети · 12 год");
  document.getElementById("w12-max").textContent = szczyt.drony
    ? `${UI.t("najwięcej naraz", "peak", "найбільше одночасно")}: ${szczyt.drony} ${UI.t("o", "at", "о")} ${wykres12Godz(szczyt.t)}` : "";
  document.getElementById("w12-l-d").textContent = UI.t("drony (średnia z ostatnich 30 min)", "drones (average of the last 30 min)", "дрони (середнє за останні 30 хв)");
  document.getElementById("w12-l-r").textContent = UI.t("rakiety i KAB", "missiles and KAB", "ракети й KAB");
  document.getElementById("w12-l-s").textContent = UI.t("liczba w danej minucie", "count at that minute", "кількість у ту хвилину");
  const osie = document.getElementById("w12-osie");
  osie.innerHTML = [0, 0.25, 0.5, 0.75, 1].map(f => `<span>${wykres12Godz(t0 + (t1 - t0) * f)}</span>`).join("");
  /* Dla czytnika: wykres to obrazek, więc mówimy wprost, co na nim jest. */
  const opis = (szczyt.drony
    ? UI.t(`W ostatnich 12 godzinach najwięcej dronów na mapie: ${szczyt.drony} o ${wykres12Godz(szczyt.t)}.`,
        `In the last 12 hours the most drones on the map: ${szczyt.drony} at ${wykres12Godz(szczyt.t)}.`,
        `За останні 12 годин найбільше дронів на мапі: ${szczyt.drony} о ${wykres12Godz(szczyt.t)}.`)
    : UI.t("W ostatnich 12 godzinach nie było dronów na mapie.", "No drones on the map in the last 12 hours.",
        "За останні 12 годин дронів на мапі не було."))
    + " " + (szczytR.rakiety
      ? UI.t(`Rakiet i bomb KAB najwięcej: ${szczytR.rakiety} o ${wykres12Godz(szczytR.t)}.`,
          `Most missiles and KAB bombs: ${szczytR.rakiety} at ${wykres12Godz(szczytR.t)}.`,
          `Найбільше ракет і бомб KAB: ${szczytR.rakiety} о ${wykres12Godz(szczytR.t)}.`)
      : UI.t("Rakiet i bomb KAB nie było.", "No missiles or KAB bombs.", "Ракет і бомб KAB не було."));
  const svg = document.getElementById("w12-svg");
  svg.setAttribute("aria-label", opis);
  const skala = document.getElementById("w12-skala");
  let etykiety = "";
  for (let v = 0; v <= w12.max; v += w12.krok)
    etykiety += `<span style="top:${(wykres12Y(v) / W12_H * 100).toFixed(1)}%">${v}</span>`;
  skala.innerHTML = etykiety;
  wykres12Rysuj(document.getElementById("w12-mini"), 110, 22, true);
  wykres12RysujDuzy();
  let rozwiniety = false;
  try { rozwiniety = localStorage.getItem("straznik_wykres12") === "1"; } catch {}
  wykres12Ustaw(rozwiniety);
}
/* Rysunek w szerokości, jaką wykres ma NA EKRANIE. Stały viewBox 364 rozciągany na
   stronie do ~1800 px robił z kropek rakiet owale (zgłoszenie usera 15.10.2026).
   Zwinięty wykres ma szerokość 0 — wtedy rysujemy przy rozwinięciu. */
function wykres12RysujDuzy() {
  const svg = document.getElementById("w12-svg");
  if (!w12 || !svg) return;
  const W = Math.round(svg.getBoundingClientRect().width);
  if (!W) return;
  w12.W = W;
  svg.setAttribute("viewBox", `0 0 ${W} ${W12_H}`);
  wykres12Rysuj(svg, W, W12_H, false);
  wykres12Kreska(Date.parse(histTimes[+document.getElementById("tb-slider").value || 0]) || w12.t1);
}
let _w12Resize = 0;
window.addEventListener("resize", () => {
  clearTimeout(_w12Resize);
  _w12Resize = setTimeout(() => { if (histMode && !document.getElementById("w12-cialo")?.hidden) wykres12RysujDuzy(); }, 200);
});
function wykres12Ustaw(rozwiniety) {
  document.getElementById("w12-cialo").hidden = !rozwiniety;
  if (rozwiniety) wykres12RysujDuzy();
  document.getElementById("w12-mini").style.display = rozwiniety ? "none" : "";
  const b = document.getElementById("w12-przelacz");
  b.setAttribute("aria-expanded", String(rozwiniety));
  b.classList.toggle("otwarty", rozwiniety);
}
function wykres12Kreska(t) {
  const k = document.getElementById("w12-kreska");
  if (!k || !w12) return;
  const W = w12.W || W12_W;
  const x = ((t - w12.t0) / Math.max(1, w12.t1 - w12.t0) * W).toFixed(1);
  k.setAttribute("x1", x); k.setAttribute("x2", x);
  /* Przy kresce: kropka na krzywej i jej wartość — średnia z 30 min w tej chwili
     (uwaga usera: „nie widać na wykresie tej średniej, ile to jest”). */
  let p = w12.seria[0];
  for (const q of w12.seria) if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q;
  const sr = Math.round(p.srednia);
  const pkt = document.getElementById("w12-punkt");
  pkt?.setAttribute("cx", x); pkt?.setAttribute("cy", wykres12Y(p.srednia).toFixed(1));
  const w = document.getElementById("w12-wartosc");
  if (!w) return;
  /* Dwie miary obok siebie (zgłoszenie usera 15.10.2026: „max 30 o 12:58”, a przy
     12:58 dymek „17”): liczba w tej minucie — ta sama co w pasku i podpisie — oraz
     średnia z 30 min, którą rysuje krzywa. */
  w.textContent = `${p.drony} · ${UI.t("śr.", "avg", "сер.")} ${sr}`;
  w.title = UI.t(`${p.drony} dronów w tej minucie, średnio ${sr} w ostatnich 30 minutach`,
    `${p.drony} drones at this minute, ${sr} on average over the last 30 minutes`,
    `${p.drony} дронів у цю хвилину, у середньому ${sr} за останні 30 хвилин`);
  const fx = +x / W;
  w.style.left = (fx * 100).toFixed(2) + "%";
  w.style.top = (wykres12Y(p.srednia) / W12_H * 100).toFixed(1) + "%";
  // dymek po lewej stronie kreski, a przy lewym brzegu po prawej — nie wychodzi poza kartę
  w.classList.toggle("w-prawo", fx < 0.25);
}
document.getElementById("w12-przelacz")?.addEventListener("click", () => {
  const teraz = document.getElementById("w12-cialo").hidden;   // był zwinięty → rozwijamy
  wykres12Ustaw(teraz);
  try { localStorage.setItem("straznik_wykres12", teraz ? "1" : "0"); } catch {}
});
/* Dotknięcie wykresu przewija suwak do tej chwili — oś jest ta sama co suwaka. */
document.getElementById("w12-svg")?.addEventListener("click", (e) => {
  if (!w12 || !histTimes.length) return;
  const r = e.currentTarget.getBoundingClientRect();
  const t = w12.t0 + (e.clientX - r.left) / r.width * (w12.t1 - w12.t0);
  let najl = 0, roz = Infinity;
  histTimes.forEach((ts, i) => { const d = Math.abs(Date.parse(ts) - t); if (d < roz) { roz = d; najl = i; } });
  stopHistPlay();
  document.getElementById("tb-slider").value = String(najl);
  scrubTo(najl);
});

let timelinePoints = [];
function paintTimeline(points) {
  timelinePoints = points || [];
  wykres12Odswiez();
  const slider = document.getElementById("tb-slider");
  if (!points?.length) { slider.style.removeProperty("--tl"); return; }
  const color = (p) => p.level === "high" ? "#ff4d5e"
    : p.level === "elevated" ? "#ffb020"
    : p.score > 0 ? "#4a5c86" : "#2a3550";
  const n = points.length;
  /* Zgłoszenie #8 (30.09.2026): Firefox 156 na Windows 11 zawieszał się albo
     wywalał przy wejściu w Historię. Pasek rysowaliśmy jako gradient z DWOMA
     przystankami na każdy punkt osi — przy 12 h migawek co minutę daje to
     1440 przystanków i 22 kB CSS-a w jednej właściwości, przeliczanej przy
     każdym odmalowaniu suwaka. Kolorów jest tymczasem tylko cztery, więc
     sklejamy sąsiednie punkty o tym samym kolorze w jeden pas: na danych
     z 30.09 schodzi to z 1440 przystanków do 28, czyli 52 razy krócej.
     Wygląd bez zmian — te same pasy, tylko opisane raz zamiast 51 razy. */
  const pasy = [];
  for (let i = 0; i < n; i++) {
    const c = color(points[i]);
    const ostatni = pasy[pasy.length - 1];
    if (ostatni && ostatni.c === c) ostatni.do = i + 1;
    else pasy.push({ c, od: i, do: i + 1 });
  }
  const stops = pasy.map(s => {
    const a = (s.od / n * 100).toFixed(2), b = (s.do / n * 100).toFixed(2);
    return `${s.c} ${a}%, ${s.c} ${b}%`;
  }).join(", ");
  slider.style.setProperty("--tl", `linear-gradient(90deg, ${stops})`);
}

function fetchTimeline() {
  return standalone ? Engine.timeline() : Engine.timelineFrom(srvSnaps, srvSigs);
}

async function toggleHistory() {
  const bar = document.getElementById("timebar");
  if (histMode) return exitHistory();
  /* Pobranie 12 h z serwera trwa kilka sekund (na emulatorze ~10) — przez ten czas
     nic się nie działo i nie było wiadomo, czy dotknięcie zadziałało (przegląd UI
     14.10.2026). Przy błędzie mówimy prawdę zamiast „brak zapisanej historii”. */
  let pobrana = true;
  if (!standalone && needSeed()) {
    const btnH = document.getElementById("btn-history");
    btnH?.classList.add("laduje"); btnH?.setAttribute("aria-busy", "true");
    toast(UI.t("Wczytuję historię 12 godzin…", "Loading 12 hours of history…", "Завантажую історію за 12 годин…"), 8000);
    pobrana = await seedBundle();   // jednorazowy backfill 12 h z serwera
    btnH?.classList.remove("laduje"); btnH?.removeAttribute("aria-busy");
    document.getElementById("toast")?.classList.add("hidden");   // komunikat o wczytywaniu już nieaktualny
  }
  const h = fetchHistory();
  histTimes = h?.times || [];
  paintTimeline(fetchTimeline());
  if (!histTimes.length) {
    document.getElementById("tb-info").textContent = !pobrana
      ? UI.t("Nie udało się pobrać historii z serwera — sprawdź internet i spróbuj ponownie.", "Could not download the history from the server — check your internet and try again.", "Не вдалося завантажити історію із сервера — перевірте інтернет і спробуйте ще раз.")
      : UI.t("Brak zapisanej historii — migawki powstają co minutę od uruchomienia.", "No saved history — snapshots are created every minute after startup.", "Немає збереженої історії — знімки створюються щохвилини від запуску.");
    bar.classList.remove("hidden");
    setTimeout(() => bar.classList.add("hidden"), 3500);
    return;
  }
  histMode = true;
  document.body.classList.add("history-mode");
  // strefy PAŻP: schować raz przy wejściu, nie przy każdym ruchu suwaka
  applyZones(); syncZonesButton();
  bar.classList.remove("hidden");
  const slider = document.getElementById("tb-slider");
  slider.max = String(histTimes.length - 1);
  slider.value = String(histTimes.length - 1);
  document.getElementById("btn-history").classList.add("active");
  syncTabs();
  labelTbControls();
  syncTbControls(histTimes.length - 1);
  showHistoryAt(histTimes.length - 1);
  refreshWatchEvents(); // one small journal request, never one per slider movement
}

function exitHistory() {
  stopHistPlay();
  if (_scrubRaf) { cancelAnimationFrame(_scrubRaf); _scrubRaf = 0; }
  histMode = false;
  historyAdsbByHex.clear(); historyAdsbTime = null; hideCard();
  document.body.classList.remove("history-mode");
  document.getElementById("timebar").classList.add("hidden");
  document.getElementById("btn-history").classList.remove("active");
  syncTabs();
  histZonesData = null; zoneRefMs = null;
  /* Strefy wracają. applyZones MUSI pójść osobno: refreshZones bez `force`
     wraca na TTL, zanim dojdzie do rysowania, więc samo wywołanie zostawiłoby
     warstwę ukrytą do wygaśnięcia TTL-a. */
  syncZonesButton(); applyZones(); refreshZones();
  if (state) { renderPanel(); if (mapReady) { updateVoivStates(); updateAdsb(); } }
  if (document.getElementById("watch")?.open) fillWatch();
}

/* Wiek meldunku z migawki: backend zapisuje `age_min` od 18.09.2026, a duchy
   z sygnałów liczą go z własnego znacznika czasu. Brak danych = 0 (obiekt jak
   świeży), bo w historii nie zgadujemy, jak stary był meldunek. */
function snapAgeMin(t) {
  const m = Number(t?.age_min);
  return Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
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
    when.toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" })
    + (ageMin > 1 ? ` (${histAgo(ageMin)})` : (UI.t(" (teraz)", " (now)", " (зараз)")));
  const sigs = h?.signals || [];
  paintOblasts(sigs);
  paintCountryAlerts(sigs);
  // alarmów rejonów nie ma w migawkach — w historii nie udajemy, że trwały wtedy
  paintRaionAlerts([]);
  // strefy PAŻP z tamtej chwili (albo żadne, gdy migawka ich nie zapisała)
  histZonesData = strefyZMigawki(snap, when.getTime());
  zoneRefMs = when.getTime();
  syncZonesButton(); applyZones();
  // alarmy ogólnokrajowe z tamtej chwili jako komunikat, nie obiekt na mapie
  const snapThreats = snap?.threats || [];
  renderNationalChip(snapThreats);
  const licznikHist = licznikZObiektow(snapThreats);
  odswiezLicznik(licznikHist, when);
  wykres12Kreska(when.getTime());
  const threats = snapThreats.filter(t => !isNationalThreat(t));
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
  // Obiekt może pojawić się i zniknąć między migawkami (co 1 min), mimo że jego
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
      age_min: Math.max(0, Math.round((when.getTime() - Date.parse(s.ts)) / 60000)),
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
  /* Poziom województwa bierzemy Z OCENY SILNIKA (h.levels), a nie z progu
     punktowego. Od 1.7.74 czerwony wymaga klucza, więc 4+ pkt bez klucza to
     ŻÓŁTY — licząc z samych punktów historia malowała województwo na czerwono
     i pisała „WYSOKI PRIORYTET" tam, gdzie aplikacja pokazywała wtedy żółty
     (zgłoszenie czytelnika 24.09.2026). Zapas na starsze dane bez `levels`. */
  const poziomHist = (v, sc) => h?.levels?.[v]
    || (sc >= 4 ? "high" : sc >= 2 ? "elevated" : "none");
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
        + `${pktTxt(tp.score)} ${UI.t("pkt", "pts", "бал.")}${tp.voiv ? ` · ${UI.t("woj.", "province", "воєв.")} ` + esc(UI.voiv(tp.voiv)) : ""}</b> · `
      : "")
    + `${licznikDrony(licznikHist.drony)} · ${licznikRakiety(licznikHist.rakiety)} · ${planes.filter(p => !p.historicalOnly).length} ${UI.t("maszyn w migawce", "aircraft in snapshot", "машин у знімку")}`
    + (planes.some(p => p.historicalOnly) ? ` + ${planes.filter(p => p.historicalOnly).length} ${UI.t("ostatnich obserwacji", "last observations", "останніх спостережень")}` : "") + " · "
    + (sigs.length
      ? `<button id="tb-sigs" class="linklike">${sigs.length} ${UI.t("sygnałów w oknie", "signals in the window", "сигналів у вікні")} ↗</button>`
      : (UI.t("brak sygnałów w oknie", "no signals in the window", "у вікні немає сигналів")));
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
          hdg_unknown: t.heading == null || t.pl_assessment?.heading_known === false,
          color: (TYPE_META[t.type] || {}).color || "#8a93a6",
          confidence: t.confidenceLevel || "?", uncertainty: shownUncertaintyKm(t) ?? "?",
          unc_lot: uncertaintyParts(t)?.lot ?? 0,
          opis: t.historicalOnly
            ? `${threatLabelPL(t.type)} — ostatnia pozycja z sygnału; obiekt nie występował już w tej migawce`
            : threatDesc(t),
          historicalOnly: !!t.historicalOnly, dist_km: t.pl_assessment?.dist_km,
          // wiek meldunku zapisany w migawce (starsze migawki go nie mają — wtedy 0,
          // czyli obiekt rysuje się jak świeży, bez podpisu z wiekiem)
          age_min: snapAgeMin(t), age_label: ageLabel(snapAgeMin(t)),
          distance_text: threatDistanceText(t, t.pl_assessment?.dist_km),
          toward_pl: t.pl_assessment?.toward_pl === true,
          heading_known: t.pl_assessment?.heading_known !== false,
          course_off: courseOffsetDeg(t),
          eta: etaHtml(t) } })) });
    map.getSource("trails")?.setData(emptyFC());
    map.getSource("course")?.setData(emptyFC());
    map.getSource("adsb-course")?.setData(emptyFC());
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
        { score: Math.min(sc, 8), level: poziomHist(v, sc), spill: !!h?.spill?.[v] });
    }
  }

  renderHistoryPanel(sigs, perVoiv, when, ageMin, poziomHist, h?.podtrzymanie || {});
  renderObservationLists({neptun:{threats}, adsb:{aircraft:planes}});
}

/* Panel w trybie historii: karty województw i lista sygnałów z WYBRANEGO
   momentu, a nie z teraz. Bez tego karty pokazywałyby bieżącą punktację obok
   historycznej listy sygnałów — dwie różne chwile w jednym widoku. */
/* „−357 min” czytało się źle na suwaku historii — od godziny wzwyż „−5 h 57 min”. */
function histAgo(ageMin) {
  const h = Math.floor(ageMin / 60), m = ageMin % 60;
  return h ? `−${h} h${m ? ` ${m} min` : ""}` : `−${ageMin} min`;
}
function renderHistoryPanel(sigs, perVoiv, when, ageMin,
                            poziom = (v, sc) => sc >= 4 ? "high" : sc >= 2 ? "elevated" : "none",
                            podtrzymanie = {}) {
  const banner = `<div class="hist-banner">${UI.t("PODGLĄD HISTORII", "HISTORY VIEW", "ПЕРЕГЛЯД ІСТОРІЇ")} —
    ${when.toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" })}
    ${ageMin > 1 ? `(${histAgo(ageMin)})` : (UI.t("(teraz)", "(now)", "(зараз)"))}
    <span>${UI.t("dane sprzed chwili wybranej suwakiem, nie na żywo", "data from the time selected on the slider, not live", "дані з моменту, обраного повзунком, а не наживо")}${
    histZonesData
      ? UI.t(" · strefy PAŻP z tamtej chwili", " · PAŻP zones as they were then", " · зони PAŻP на той момент")
      : UI.t(" · z tej chwili nie mamy zapisu stref PAŻP, więc są ukryte", " · no PAŻP zone record for this moment, so they are hidden", " · для цього моменту немає запису зон PAŻP, тому вони приховані")}</span></div>`;

  const shown = Object.entries(perVoiv)
    .filter(([, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1]);
  const cards = shown.map(([name, sc]) => {
    const lvl = poziom(name, sc);
    const own = sigs.filter(s => s.voivodeship === name);
    return `<div class="voiv-card level-${lvl} open">
      <div class="voiv-head"><span class="voiv-name">${esc(UI.voiv(name))}</span>
        <span class="voiv-score">${pktTxt(sc)} ${UI.t("pkt", "pts", "бал.")}</span></div>
      <div class="voiv-level">${lvl === "none" ? (UI.t("poniżej progu", "below threshold", "нижче порога")) : LEVEL_LABEL[lvl]}</div>
      ${podtrzymanieHTML(podtrzymanie[name])}
      <div class="voiv-breakdown">${sigList(own)}</div></div>`;
  }).join("");

  document.getElementById("voiv-cards").innerHTML = banner +
    (cards || `<div class="fineprint">${UI.t("W tej chwili żadne województwo nie miało punktów.", "No province had points at this time.", "Цієї миті жодне воєводство не мало балів.")}</div>`);
  document.getElementById("signal-list").innerHTML =
    sigList(sigs) || `<div class="fineprint">${UI.t("brak sygnałów w tym oknie", "no signals in this window", "у цьому вікні немає сигналів")}</div>`;
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
    when.toLocaleTimeString(UI.t("pl-PL", "en-GB", "uk-UA"), { hour: "2-digit", minute: "2-digit" })
    + (ageMin > 1 ? ` (${histAgo(ageMin)})` : (UI.t(" (teraz)", " (now)", " (зараз)")));
  document.getElementById("tb-slider").setAttribute("aria-valuetext", document.getElementById("tb-label").textContent);
  document.getElementById("tb-slider").dataset.level = timelinePoints[idx]?.level || "none";
  syncTbControls(idx);
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
document.getElementById("tb-slider").addEventListener("input", (e) => { stopHistPlay(); scrubTo(+e.target.value); });

/* ── przyciski przewijania historii (17.09.2026) ─────────────────────────────
   Krok liczymy po czasie migawek, nie po indeksie: migawki bywają co minutę,
   ale po przerwie w działaniu aplikacji między nimi jest dziura. Skok do alarmu
   = początek najbliższego okresu z poziomem podwyższonym albo wysokim. */
const TB_LABELS = {
  pl: { start: ["−12 h", "Początek historii (12 godzin wstecz)"],
        "prev-alarm": ["alarm", "Poprzedni alarm"], back10: ["−10", "10 minut wstecz"],
        back1: ["−1", "1 minuta wstecz (przytrzymaj, aby przewijać)"],
        play: ["", "Odtwarzaj / pauza"], fwd1: ["+1", "1 minuta do przodu (przytrzymaj, aby przewijać)"],
        fwd10: ["+10", "10 minut do przodu"], "next-alarm": ["alarm", "Następny alarm"],
        end: ["koniec", "Najnowsza migawka"], group: "Sterowanie historią", speed: "Prędkość odtwarzania" },
  uk: { start: ["−12 год", "Початок історії (12 годин тому)"],
        "prev-alarm": ["тривога", "Попередня тривога"], back10: ["−10", "10 хвилин назад"],
        back1: ["−1", "1 хвилина назад (утримуйте, щоб прокручувати)"],
        play: ["", "Відтворення / пауза"], fwd1: ["+1", "1 хвилина вперед (утримуйте, щоб прокручувати)"],
        fwd10: ["+10", "10 хвилин вперед"], "next-alarm": ["тривога", "Наступна тривога"],
        end: ["кінець", "Найновіший знімок"], group: "Керування історією", speed: "Швидкість відтворення" },
  en: { start: ["−12 h", "Start of history (12 hours back)"],
        "prev-alarm": ["alert", "Previous alert"], back10: ["−10", "10 minutes back"],
        back1: ["−1", "1 minute back (hold to keep scrolling)"],
        play: ["", "Play / pause"], fwd1: ["+1", "1 minute forward (hold to keep scrolling)"],
        fwd10: ["+10", "10 minutes forward"], "next-alarm": ["alert", "Next alert"],
        end: ["end", "Latest snapshot"], group: "History controls", speed: "Playback speed" },
};
function labelTbControls() {
  const L = TB_LABELS[UI.t("pl", "en", "uk")];
  document.getElementById("tb-controls").setAttribute("aria-label", L.group);
  for (const b of document.querySelectorAll("#tb-controls .tb-btn")) {
    const [caption, title] = L[b.dataset.act];
    b.querySelector("small").textContent = caption;
    b.title = title; b.setAttribute("aria-label", title);
  }
  const sp = document.getElementById("tb-speed");
  sp.title = L.speed; sp.setAttribute("aria-label", `${L.speed}: ×${histSpeed}`);
}
function histIdx() { return +document.getElementById("tb-slider").value || 0; }
function histGo(idx) {
  const last = histTimes.length - 1;
  if (last < 0) return;
  idx = Math.max(0, Math.min(last, idx));
  document.getElementById("tb-slider").value = String(idx);
  scrubTo(idx);
}
/* indeks migawki o `minutes` od bieżącej (co najmniej jedna migawka dalej).
   Liczymy w MINUTACH ETYKIETY, nie w sekundach (zgłoszenie usera 11.10.2026):
   najnowsza migawka bywa nagrana przez aplikację (np. 10:00:05), a serwer
   zapisuje je o pełnej minucie + kilkanaście sekund (09:59:16). Przy porównaniu
   co do sekundy 09:59:16 była „za późno” na cel 09:59:05 i pierwsze „−1 min”
   skakało z 10:00 na 09:58. */
function histStepIdx(idx, minutes) {
  const minuta = (i) => Math.floor(Date.parse(histTimes[i]) / 60000);
  const cel = minuta(idx) + minutes;
  if (minutes > 0) {
    for (let i = idx + 1; i < histTimes.length; i++) if (minuta(i) >= cel) return i;
    return histTimes.length - 1;
  }
  for (let i = idx - 1; i >= 0; i--) if (minuta(i) <= cel) return i;
  return 0;
}
function alarmStarts() {
  const lv = (i) => timelinePoints[i]?.level && timelinePoints[i].level !== "none";
  const out = [];
  for (let i = 0; i < timelinePoints.length; i++) if (lv(i) && !lv(i - 1)) out.push(i);
  return out;
}
function prevAlarmIdx(idx) { const s = alarmStarts().filter(i => i < idx); return s.length ? s[s.length - 1] : -1; }
function nextAlarmIdx(idx) { return alarmStarts().find(i => i > idx) ?? -1; }
function syncTbControls(idx) {
  const last = histTimes.length - 1;
  for (const b of document.querySelectorAll("#tb-controls .tb-btn")) {
    const a = b.dataset.act;
    b.disabled = (["start", "back10", "back1"].includes(a) && idx <= 0)
      || (["end", "fwd10", "fwd1"].includes(a) && idx >= last)
      || (a === "prev-alarm" && prevAlarmIdx(idx) < 0)
      || (a === "next-alarm" && nextAlarmIdx(idx) < 0);
  }
}
let histPlayTimer = null, histSpeed = 1;
const HIST_PLAY_MS = 500;       // ×1: minuta historii na pół sekundy
function stopHistPlay() {
  if (histPlayTimer) { clearInterval(histPlayTimer); histPlayTimer = null; }
  document.querySelector('#tb-controls [data-act="play"]')?.classList.remove("playing");
}
function startHistPlay() {
  stopHistPlay();
  if (histIdx() >= histTimes.length - 1) histGo(0);      // z końca odtwarzamy od początku
  document.querySelector('#tb-controls [data-act="play"]').classList.add("playing");
  histPlayTimer = setInterval(() => {
    const idx = histIdx();
    if (!histMode || idx >= histTimes.length - 1) return stopHistPlay();
    histGo(histStepIdx(idx, 1));
  }, HIST_PLAY_MS / histSpeed);
}
function tbAction(act) {
  const idx = histIdx();
  if (act === "play") return histPlayTimer ? stopHistPlay() : startHistPlay();
  stopHistPlay();
  const target = act === "start" ? 0
    : act === "end" ? histTimes.length - 1
    : act === "back1" ? histStepIdx(idx, -1) : act === "fwd1" ? histStepIdx(idx, 1)
    : act === "back10" ? histStepIdx(idx, -10) : act === "fwd10" ? histStepIdx(idx, 10)
    : act === "prev-alarm" ? prevAlarmIdx(idx) : act === "next-alarm" ? nextAlarmIdx(idx) : -1;
  if (target >= 0) histGo(target);
}
/* Przytrzymanie ±1 i ±10 przewija dalej. Pierwszy krok od razu na pointerdown,
   powtarzanie po 400 ms co 120 ms; klik z klawiatury (detail 0) idzie przez click. */
(() => {
  let holdTimer = null, repeatTimer = null, pressedAct = null;
  const REPEAT = ["back1", "fwd1", "back10", "fwd10"];
  const release = () => { clearTimeout(holdTimer); clearInterval(repeatTimer); holdTimer = repeatTimer = null; };
  const ctl = document.getElementById("tb-controls");
  ctl.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".tb-btn");
    if (!b || b.disabled || !REPEAT.includes(b.dataset.act)) return;
    pressedAct = b.dataset.act;
    tbAction(pressedAct);
    release();
    holdTimer = setTimeout(() => { repeatTimer = setInterval(() => tbAction(pressedAct), 120); }, 400);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) ctl.addEventListener(ev, release);
  ctl.addEventListener("click", (e) => {
    const b = e.target.closest(".tb-btn");
    if (!b || b.disabled) return;
    if (REPEAT.includes(b.dataset.act) && e.detail !== 0) return;   // obsłużone w pointerdown
    tbAction(b.dataset.act);
  });
  document.getElementById("tb-speed").addEventListener("click", () => {
    histSpeed = histSpeed === 1 ? 2 : histSpeed === 2 ? 4 : 1;
    const sp = document.getElementById("tb-speed");
    sp.textContent = `×${histSpeed}`;
    sp.setAttribute("aria-label", `${TB_LABELS[UI.t("pl", "en", "uk")].speed}: ×${histSpeed}`);
    if (histPlayTimer) startHistPlay();
  });
})();
document.getElementById("tb-slider").addEventListener("change", (e) => {
  if (_scrubRaf) { cancelAnimationFrame(_scrubRaf); _scrubRaf = 0; }
  showHistoryAt(+e.target.value);
});

/* ── UI: ustawienia (moja lokalizacja), 3D, panel ────────────────────────── */
const dlg = document.getElementById("settings");
/* Rezygnacja z alarmów na tym telefonie (zgłoszenie 14.09.2026): mapa działa,
   ale telefon wypisuje się ze wszystkich województw i nie pokazuje ostrzeżeń o zgodach. */
const ALERTS_OFF_KEY = "straznik_alerts_off", BGWARN_HIDDEN_KEY = "straznik_bgwarn_hidden";
function alertsOff() { try { return localStorage.getItem(ALERTS_OFF_KEY) === "1"; } catch { return false; } }
function syncObservedRegions() {
  const regions=alertsOff()?[]:(Places?.observedVoivodeships(savedPlaces)||[]);
  if(!IS_APP) syncBrowserPushRegion().catch(()=>{});
  const plugin=BG();
  // alertsOff trafia też do usługi FCM (odrzuca alarmy, zanim wypisanie dotrze do Firebase)
  if(plugin?.setObservedVoivodeships) return plugin.setObservedVoivodeships({voivodeships:regions, alertsOff:alertsOff()});
  return plugin?.setHomeVoivodeship?.({voivodeship:myVoiv()||""});
}
function renderPlacesSummary() {
  const el=document.getElementById("places-summary"); if(!el)return;
  if(!savedPlaces.length){el.textContent=UI.t("Nie zapisano jeszcze żadnego miejsca.", "No saved places yet.", "Ще не збережено жодного місця.");return;}
  const watched=Places.observedVoivodeships(savedPlaces).map(v=>UI.voiv(v));
  el.textContent=(UI.t(`${savedPlaces.length}/8 miejsc. Obserwowane województwa: `, `${savedPlaces.length}/8 places. Watched provinces: `, `${savedPlaces.length}/8 місць. Відстежувані воєводства: `))+(watched.join(", ")||(UI.t("brak", "none", "немає")));
}
let wojPrzedUstawieniami = null;   // region sprzed otwarcia ustawień — mapa skacze tylko po zmianie
function openSettings() {
  wojPrzedUstawieniami = myVoiv() || "";
  UI.previewSettings?.(UI.lang || "pl");
  const alertsBox = document.getElementById("set-alerts-on");
  if (alertsBox) alertsBox.checked = !alertsOff();
  refreshBgStatus();
  const sel = document.getElementById("set-voiv");
  sel.innerHTML = `<option value="">— ${UI.t("nie wybrano", "not selected", "не вибрано")} —</option>` +
    ALL_VOIVS.map(v => `<option value="${esc(v)}"${v === myVoiv() ? " selected" : ""}>${esc(UI.voiv(v))}</option>`).join("");
  const langSel = document.getElementById("set-lang"); if (langSel) langSel.value = UI.lang || "pl";
  document.getElementById("set-api").value = localStorage.getItem("straznik_api") || "";
  renderPlacesSummary();
  pokazStartUstawien();
  dlg.showModal();
}
document.getElementById("btn-settings").onclick = () => openSettings();

/* Ustawienia v4 (przegląd UI 14.10.2026): ekran startowy z gotowością alarmu
   i wierszami sekcji; sekcja otwiera się w tym samym arkuszu o stałej wysokości.
   Wiersze to dawne zakładki .set-tab — każde miejsce, które otwiera sekcję
   kliknięciem `.set-tab[data-pane=…]`, działa bez zmian. */
function pokazStartUstawien(jezyk = UI.lang) {
  dlg.classList.add("na-starcie"); dlg.classList.remove("w-sekcji");
  document.querySelectorAll("#settings .set-pane").forEach(p => p.hidden = true);
  dlg.scrollTop = 0;
  odswiezWartosciUstawien(jezyk);
  renderGotowosc(jezyk);
}
function pokazSekcjeUstawien(pane) {
  dlg.classList.remove("na-starcie"); dlg.classList.add("w-sekcji");
  document.querySelectorAll("#settings .set-pane").forEach(p => p.hidden = p.dataset.pane !== pane);
  dlg.scrollTop = 0;
  if (dlg.open) document.getElementById("set-wstecz")?.focus();
}
document.querySelectorAll("#settings .set-tab").forEach(tab =>
  tab.addEventListener("click", () => pokazSekcjeUstawien(tab.dataset.pane)));
document.getElementById("set-wstecz")?.addEventListener("click", () => {
  const byla = dlg.querySelector(".set-pane:not([hidden])")?.dataset.pane;
  pokazStartUstawien(document.getElementById("set-lang")?.value || UI.lang);
  dlg.querySelector(`.set-tab[data-pane="${byla}"]`)?.focus();   // fokus wraca do wiersza
});
/* Systemowe „wstecz” i Esc wysyłają „cancel”: z sekcji wracamy do ekranu
   startowego, dopiero z niego zamykamy okno. */
dlg.addEventListener("cancel", (e) => {
  if (!dlg.classList.contains("w-sekcji")) return;
  e.preventDefault();
  document.getElementById("set-wstecz")?.click();
});

/* Wartości przy wierszach ekranu startowego — co jest teraz ustawione. */
function odswiezWartosciUstawien(jezyk = UI.lang) {
  const T = (pl, en, uk) => jezyk === "pl" ? pl : jezyk === "uk" ? (uk !== undefined ? uk : en) : en;
  const wpisz = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  wpisz("sv-alarmy", IS_APP && alertsOff() ? T("wyłączone", "off", "вимкнено") : T("włączone", "on", "увімкнено"));
  wpisz("sv-miejsca", `${savedPlaces.length} ${T("z", "of", "з")} 8`);
  const tryb = czerwonyTryb();
  wpisz("sv-dzwiek", !IS_APP || IS_IOS ? ""
    : tryb === "wibracja" ? T("wibracja", "vibration", "вібрація")
    : tryb === "zwykle" ? T("zwykłe", "normal", "звичайне") : T("syrena", "siren", "сирена"));
  // sekcja „Mapa”: jak rysujemy drony i rakiety (najczęściej zmieniane ustawienie trasy)
  const tr = trailMode("neptun");
  wpisz("sv-mapa", tr === "off" ? T("bez tras", "no tracks", "без шляхів")
    : tr === "course" ? T("trasa i kierunek", "track and heading", "шлях і напрямок")
    : T("przebyta trasa", "flown track", "пройдений шлях"));
  wpisz("sv-aplikacja", { pl: "Polski", en: "English", uk: "Українська" }[jezyk] || "");
}

/* Gotowość alarmu: lista warunków, od których zależy, czy alarm w ogóle może
   dotrzeć. Uczciwie: to są ZGODY i ustawienia, a nie obietnica, że alarm
   przyjdzie — dlatego „wszystko na miejscu”, a nie „alarm dotrze”. */
let gotowoscNr = 0;
async function renderGotowosc(jezyk = UI.lang) {
  const box = document.getElementById("gotowosc");
  if (!box) return;
  const nr = ++gotowoscNr;
  const T = (pl, en, uk) => jezyk === "pl" ? pl : jezyk === "uk" ? (uk !== undefined ? uk : en) : en;
  // Moduł natywny przy zimnym starcie odpowiada nawet kilka sekund — bez tego
  // karta wskakiwała znikąd, gdy człowiek już czytał wiersze pod nią.
  if (!box.innerHTML) box.innerHTML = `<p class="got-sprawdzam">${esc(T("Sprawdzam zgody i ustawienia…", "Checking permissions and settings…", "Перевіряю дозволи й налаштування…"))}</p>`;
  const punkty = [];
  const woj = Places.observedVoivodeships(savedPlaces).length > 0 || !!myVoiv();
  punkty.push({ ok: woj, tekst: T("Województwo do alarmów", "Province for alerts", "Воєводство для тривог"),
    napraw: () => pokazSekcjeUstawien("miejsca") });
  const plugin = BG();
  let s = null;
  if (plugin) { try { s = await plugin.status(); } catch {} }
  if (IS_APP) {
    punkty.push({ ok: !alertsOff(), tekst: T("Alarmy włączone na tym telefonie", "Alerts on for this phone", "Тривоги ввімкнено на цьому телефоні"),
      napraw: () => pokazSekcjeUstawien("alarmy") });
    punkty.push({ ok: s ? s.notificationsAllowed !== false : true, tekst: T("Zgoda na powiadomienia", "Notification permission", "Дозвіл на сповіщення"),
      napraw: () => document.getElementById("btn-notif-settings")?.click() });
    if (s && !IS_IOS && (s.sdk || 0) >= 34)
      punkty.push({ ok: s.fullScreenAllowed !== false, tekst: T("Alarm pełnoekranowy", "Full-screen alert", "Повноекранна тривога"),
        napraw: () => document.getElementById("btn-fullscreen")?.click() });
    if (s && !IS_IOS)
      punkty.push({ ok: !usypiaAplikacje(s), tekst: T("Bateria nie usypia Strażnika", "Battery does not put Strażnik to sleep", "Батарея не присипляє Strażnika"),
        napraw: () => document.getElementById("btn-battery")?.click() });
  } else {
    const perm = await notifPermission();
    punkty.push({ ok: perm === "granted" && notifWanted(), tekst: T("Powiadomienia w przeglądarce", "Browser notifications", "Сповіщення в браузері"),
      napraw: () => pokazSekcjeUstawien("alarmy") });
  }
  if (nr !== gotowoscNr) return;              // w międzyczasie przyszło nowsze wywołanie
  const ok = punkty.filter(p => p.ok).length;
  const wszystko = ok === punkty.length;
  const procent = Math.round(ok / punkty.length * 100);
  box.classList.toggle("komplet", wszystko);
  box.innerHTML = `<div class="got-glowa">
      <div class="got-pierscien" style="--got:${procent}%" aria-hidden="true"><span>${ok}/${punkty.length}</span></div>
      <div><b>${esc(wszystko ? T("Wszystko na miejscu", "All set", "Усе на місці") : T("Alarm może nie dotrzeć", "Alerts may not reach you", "Тривога може не дійти"))}</b>
      <p>${esc(wszystko ? T("Zgody i ustawienia potrzebne do alarmów są włączone.", "The permissions and settings alerts need are on.", "Дозволи й налаштування, потрібні для тривог, увімкнено.")
                        : T("Popraw zaznaczone niżej — bez tego alarm może nie przyjść.", "Fix the items below — without them an alert may not arrive.", "Виправте позначене нижче — без цього тривога може не надійти."))}</p></div>
    </div>
    <ul class="got-lista">${punkty.map((p, i) => `<li class="${p.ok ? "ok" : "brak"}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${p.ok ? '<path d="M5 12.5l4.5 4.5L19 7.5"/>' : '<path d="M12 7v6M12 17h.01"/>'}</svg>
      <span>${esc(p.tekst)}<span class="sr-only">: ${esc(p.ok ? T("w porządku", "OK", "гаразд") : T("wymaga poprawy", "needs fixing", "потребує виправлення"))}</span></span>
      ${p.ok ? "" : `<button type="button" class="chip" data-got="${i}">${esc(T("Popraw", "Fix", "Виправити"))}</button>`}</li>`).join("")}</ul>`;
  box.querySelectorAll("[data-got]").forEach(b =>
    b.addEventListener("click", () => punkty[Number(b.dataset.got)].napraw()));
}

/* Język: podgląd w oknie od razu, zmiana całej aplikacji dopiero przyciskiem —
   wymaga ponownego uruchomienia (wcześniej robił to wspólny „Zapisz”). */
document.getElementById("set-lang")?.addEventListener("change", (event) => {
  UI.previewSettings?.(event.target.value);
  refreshBgStatus(event.target.value);
  odswiezWartosciUstawien(event.target.value);
  const btn = document.getElementById("set-lang-zastosuj");
  if (btn) btn.hidden = event.target.value === (UI.lang || "pl");
});
document.getElementById("set-lang-zastosuj")?.addEventListener("click", () => {
  const next = document.getElementById("set-lang")?.value || "pl";
  localStorage.setItem("straznik_lang", next);
  setTimeout(() => location.reload(), 100);
});
document.getElementById("set-api-zapisz")?.addEventListener("click", () => {
  const api = document.getElementById("set-api").value.trim();
  if (api && !validBackendUrl(api)) {
    alert("Własny serwer wymaga adresu HTTPS bez loginu, hasła, parametrów ani fragmentu. Wpisz bezpieczny adres lub wyczyść pole, aby wybrać serwer Strażnika.");
    return;
  }
  if (api === (localStorage.getItem("straznik_api") || "")) return;
  if (api) localStorage.setItem("straznik_api", api); else localStorage.removeItem("straznik_api");
  setTimeout(() => location.reload(), 100);
});
/* Zamknięcie okna robi to, co dawniej „Zapisz” poza językiem i serwerem:
   ustawienia działają od razu, więc mapa i panel muszą to zobaczyć. Podgląd
   języka, którego nie zatwierdzono przyciskiem, wraca do zapisanego. */
dlg.addEventListener("close", () => {
  UI.previewSettings?.(UI.lang || "pl");
  const v = myVoiv() || "";
  syncObservedRegions();
  if (mapReady) {
    for (const id of ["my-voiv", "my-voiv-glow"])
      if (map.getLayer(id)) map.setFilter(id, ["==", ["get", "nazwa"], v || "—"]);
    if (v !== wojPrzedUstawieniami) goHome();   // mapa skacze tylko, gdy region się zmienił
  }
  if (state) renderPanel();
});

/* ── Moje miejsca: zapis lokalny, bez geokodowania i ruchu w tle ── */
const placesDlg=document.getElementById("places-dialog");
let placeDraft=null, placeSnapshot="";
const placeEl=id=>document.getElementById(id);
const placeText=(pl,en,uk)=>UI.t(pl,en,uk);
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
  placeEl("places-tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{if(placeDirty()&&!confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?","Скасувати незбережені зміни?")))return;fillPlace(savedPlaces.find(p=>p.id===b.dataset.id));});
}
function renderPlacePrecision(){
  const precision=placeEl("place-precision").value;
  placeEl("place-gps-row").hidden=precision!=='gps';
  const gps=placeDraft?.gps; placeEl("place-gps-status").textContent=gps?`${placeText("Zapisano jednorazowo","Saved once","Збережено одноразово")}: ${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} · ±${Math.round(gps.accuracy)} m · ${new Date(gps.capturedAt).toLocaleString(UI.t("pl-PL", "en-GB", "uk-UA"))}`:placeText("Lokalizacja jest wyłączona.","Location is off.","Місцеперебування вимкнено."); placeEl("place-gps-remove").hidden=!gps;
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
placeEl("places-close").onclick=()=>{if(!placeDirty()||confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?","Скасувати незбережені зміни?"))){placesDlg.close();backToPlacesTab();}};
placeEl("place-add").onclick=()=>{if(savedPlaces.length>=8)return alert(placeText("Możesz zapisać maksymalnie 8 miejsc.","You can save up to 8 places.","Можна зберегти щонайбільше 8 місць."));if(placeDirty()&&!confirm(placeText("Odrzucić niezapisane zmiany?","Discard unsaved changes?","Скасувати незбережені зміни?")))return;fillPlace({id:crypto.randomUUID?.()||String(Date.now()),name:"",precision:"region",region:myVoiv()||"lubelskie",alerts:false});};
placeEl("place-precision").onchange=()=>{placeDraft={...placeDraft,precision:placeEl("place-precision").value,gps:placeEl("place-precision").value==='gps'?placeDraft?.gps:null};renderPlacePrecision();};
placeEl("place-gps").onclick=()=>{
  if(!navigator.geolocation)return alert(placeText("Brak dostępu do lokalizacji w tym środowisku.","Location is unavailable in this environment.","Доступу до місцеперебування в цьому середовищі немає."));
  placeEl("place-gps-status").textContent=placeText("Oczekiwanie na zgodę i jednorazowy odczyt…","Waiting for permission and a one-time reading…","Очікую на дозвіл і одноразове зчитування…");
  navigator.geolocation.getCurrentPosition(pos=>{const region=voivAt(pos.coords.longitude,pos.coords.latitude);if(!region)return alert(placeText("Pozycja jest poza granicami Polski.","The position is outside Poland.","Позиція поза межами Польщі."));placeDraft={...placeDraft,region,gps:{lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,capturedAt:new Date().toISOString()}};placeEl("place-region").value=region;renderPlacePrecision();},err=>{placeEl("place-gps-status").textContent=placeText("Nie udało się pobrać pozycji: ","Could not read the position: ","Не вдалося зчитати позицію: ")+err.message;},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
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
/* Nakładki producentów, które usypiają aplikację tak głęboko, że push FCM nie
   dociera do niej wcale — do pierwszego ręcznego otwarcia. Na czystym Androidzie
   wiadomość o wysokim priorytecie przechodzi przez Doze i ostrzeżenie byłoby
   szumem, bo oszczędzanie baterii jest tam domyślnie włączone dla wszystkich.

   Samsung trafił na listę 06.10.2026 po dwóch zgłoszeniach naraz (Galaxy S24
   Ultra i S25+): „wszystkie uprawnienia włączone, alarm rusza dopiero po wejściu
   do aplikacji". Warstwa natywna zgłaszała batteryUnrestricted od zawsze —
   to aplikacja nigdy tego pola nie czytała i milczała. */
const NAKLADKI_USYPIAJACE =
  /samsung|xiaomi|redmi|poco|huawei|honor|oppo|realme|vivo|oneplus|meizu|tecno|infinix/i;
const usypiaAplikacje = (s) =>
  s?.batteryUnrestricted === false && NAKLADKI_USYPIAJACE.test(String(s?.manufacturer || ""));

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
    // Zgłoszenie 14.09.2026: kto nie chce alarmów, nie mógł zamknąć tego banera.
    if (alertsOff()) { el.classList.add("hidden"); return; }
    let msg = null, fix = "settings";
    if (!s.notificationsAllowed) {
      msg = UI.t("Powiadomienia zablokowane — alarm nie dotrze. Włącz je w ustawieniach", "Notifications are blocked — alerts cannot arrive. Enable them in settings", "Сповіщення заблоковано — тривога не дійде. Увімкніть їх у налаштуваннях");
    } else if (s.fullScreenAllowed === false) {
      msg = UI.t("Zgoda na alarm pełnoekranowy wygasła — czerwony alarm nie zapali ekranu z blokady", "Full-screen alert permission expired — a red alert will not wake the locked screen", "Дозвіл на повноекранну тривогу минув — червона тривога не ввімкне екран із блокування");
      fix = "fullscreen";
    } else if (usypiaAplikacje(s)) {
      msg = UI.t("Oszczędzanie baterii może uśpić Strażnika — alarm ruszyłby dopiero po otwarciu aplikacji", "Battery saving may put Strażnik to sleep — an alert would start only after you open the app", "Економія батареї може приспати Strażnika — тривога запуститься аж після відкриття застосунку");
      fix = "battery";
    }
    if (!msg) { bgWarnStrikes = 0; el.classList.add("hidden"); return; }
    // Klucz ukrycia zostaje przy dotychczasowych nazwach: zmiana „notifications"
    // na „settings" odsłoniłaby baner wszystkim, którzy raz go zamknęli.
    const kind = fix === "fullscreen" ? "fullscreen" : fix === "battery" ? "battery" : "notifications";
    try { if (localStorage.getItem(BGWARN_HIDDEN_KEY) === kind) { el.classList.add("hidden"); return; } } catch {}
    // problem musi utrzymać się przez dwa sprawdzenia z rzędu — mniej fałszywych alarmów
    if (++bgWarnStrikes < 2) { setTimeout(refreshBgWarning, 5000); return; }
    el.innerHTML = `<span>⚠ ${esc(msg)}</span><button class="chip">${UI.t("Napraw", "Fix", "Виправити")}</button>`
      + `<button class="chip bgw-x" aria-label="${UI.t("Zamknij", "Close", "Закрити")}" title="${UI.t("Zamknij", "Close", "Закрити")}">✕</button>`;
    el.querySelector(".bgw-x").onclick = () => {
      try { localStorage.setItem(BGWARN_HIDDEN_KEY, kind); } catch {}
      el.classList.add("hidden");
      toast(UI.t("Ostrzeżenie ukryte. Alarmy wyłączysz albo przywrócisz w ⚙ → Alarmy.", "Warning hidden. You can turn alerts off or back on in ⚙ → Alerts.", "Попередження приховано. Тривоги вимкнете або повернете в ⚙ → Тривоги."), 6000);
    };
    el.querySelector("button").onclick = fix === "fullscreen"
      ? () => { BG()?.requestFullScreenPermission(); setTimeout(refreshBgWarning, 1500); }
      : fix === "battery"
      ? () => { BG()?.requestBatteryExemption(); setTimeout(refreshBgWarning, 1500); }
      : () => openSettings();
    el.classList.remove("hidden");
  } catch { el.classList.add("hidden"); }
}

/* ── sprawdzanie aktualizacji ────────────────────────────────────────────── */
/* Aplikacja jest rozprowadzana poza sklepem, więc sama musi powiedzieć, że
   wyszła nowsza wersja — inaczej użytkownik zostaje z wersją sprzed miesięcy,
   nieświadomy poprawek w czymś, co ma go ostrzegać.

   W wydaniu dla Google Play jest wyłączone: regulamin sklepu zabrania
   aktualizowania się z pominięciem Play. Decyduje `wariant.js`, nie ręczna
   edycja tej linii — patrz `scripts/test_wariant_sklepowy.cjs`. */
const UPDATE_CHECK = !SKLEP;
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
    if (force) updStatus(UI.t("Sprawdzam…", "Checking…", "Перевіряю…"));
    const s = await BG()?.status();
    const local = s?.appVersion;
    if (!local) {
      if (force) updStatus(UI.t("Nie udało się odczytać wersji aplikacji.", "Could not read the app version.", "Не вдалося прочитати версію застосунку."));
      return;
    }
    const r = await fetch(UPDATE_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) {
      if (force) updStatus(UI.t("Nie udało się sprawdzić — spróbuj później.", "Could not check — try again later.", "Не вдалося перевірити — спробуйте пізніше."));
      return;
    }
    const rel = await r.json();
    localStorage.setItem("straznik_upd_check", String(Date.now()));
    if (!isNewer(rel.version, local)) {
      if (force) updStatus(UI.t(`Masz najnowszą wersję (${local}).`, `You have the latest version (${local}).`, `У вас найновіша версія (${local}).`));
      return;
    }
    if (!force && !rel.critical && sessionSkippedUpdates.has(rel.version)) return;
    showUpdateBanner(rel, local);
    if (force) {
      updStatus(UI.t(`Jest nowsza wersja ${rel.version} — zamknij ustawienia, żeby zaktualizować.`, `Version ${rel.version} is available — close settings to update.`, `Є новіша версія ${rel.version} — закрийте налаштування, щоб оновити.`));
    }
  } catch {
    if (force) updStatus(UI.t("Brak połączenia — spróbuj później.", "No connection — try again later.", "Немає з'єднання — спробуйте пізніше."));
  }
}

function showUpdateBanner(rel, local) {
  const ver = String(rel.version || "").replace(/^v/, "");
  const el = document.getElementById("update-banner");
  const size = rel.size ? ` · ${(rel.size / 1048576).toFixed(1)} MB` : "";
  const fallbackChanges = String(rel.notes || "").split(/\r?\n/)
    .map(x => x.replace(/^\s*(?:[-*+]|•|\d+[.)])\s*/, "").replace(/[*_`~]/g, "").trim())
    .filter(x => x && !x.startsWith("#") && !x.startsWith("<!--")).slice(0, 40);
  // Cała lista zmian, nie pierwsze osiem: pole tekstowe banera przewija się
  // samo (patrz #update-banner w style.css), a 1.7.37 miało 10 punktów.
  const changes = (Array.isArray(rel.changes) ? rel.changes : fallbackChanges)
    .map(x => String(x || "").trim()).filter(Boolean).slice(0, 40);
  const changesLabel = UI.t("Co się zmienia:", "What changes:", "Що змінюється:");
  const changesHtml = changes.length
    ? `<div class="upd-changes"><b>${changesLabel}</b><ul>${changes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`
    : `<div class="upd-changes"><b>${changesLabel}</b> ${UI.t("poprawki działania i aktualizacja danych aplikacji.", "operational fixes and updated app data.", "виправлення роботи й оновлення даних застосунку.")}</div>`;
  el.classList.toggle("critical", !!rel.critical);
  // Przyciski i status w osobnych rzędach — w jednym wierszu z tekstem ściskały go
  // przy dłuższej liście zmian, a status znikał poza przewijanym obszarem.
  const title = UI.t(`${rel.critical ? "Wymagana" : "Dostępna"} wersja ${esc(ver)}`, `${rel.critical ? "Required" : "Available"} version ${esc(ver)}`, `${rel.critical ? "Потрібна" : "Доступна"} версія ${esc(ver)}`);
  const have = UI.t(`masz ${esc(local)}${esc(size)} · instalację potwierdzi Android`, `you have ${esc(local)}${esc(size)} · Android will confirm the install`, `у вас ${esc(local)}${esc(size)} · установлення підтвердить Android`);
  el.innerHTML = `<div class="upd-txt"><b>${title}</b>
      <span>${have}</span>
      ${changesHtml}</div>
    <span id="upd-progress"></span>
    <div class="upd-actions">
      <button class="chip primary" id="upd-install">${UI.t("Aktualizuj", "Update", "Оновити")}</button>
      ${rel.critical ? "" : `<button class="chip" id="upd-later">${UI.t("Później", "Later", "Пізніше")}</button>`}
    </div>`;
  el.classList.remove("hidden");
  dopasujOknoAktualizacji();       // od razu, nie dopiero po reakcji obserwatora stosu
  document.getElementById("upd-later")?.addEventListener("click", () => {
    sessionSkippedUpdates.add(ver);
    el.classList.add("hidden");
  });
  document.getElementById("upd-install").onclick = async (event) => {
    const btn = event.currentTarget;
    const progress = document.getElementById("upd-progress");
    const plugin = BG();
    if (!plugin?.installUpdate) {
      progress.textContent = UI.t("Aktualizator wymaga nowszej wersji aplikacji.", "The updater needs a newer version of the app.", "Оновлювач потребує новішої версії застосунку.");
      return;
    }
    try {
      const perm = await plugin.canInstallUpdates();
      if (!perm?.allowed) {
        await plugin.requestInstallPermission();
        progress.textContent = UI.t("Włącz zgodę „Zezwalaj z tego źródła”, wróć i dotknij Aktualizuj ponownie.", "Allow “Install from this source”, come back and tap Update again.", "Увімкніть дозвіл «Дозволити з цього джерела», поверніться й торкніться «Оновити» ще раз.");
        return;
      }
      btn.disabled = true;
      btn.textContent = UI.t("Pobieram…", "Downloading…", "Завантажую…");
      // aplikacja sprawdza sumę SHA-256 z wydania, pakiet i certyfikat podpisu (audyt 16.09.2026)
      progress.textContent = UI.t("Sprawdzam sumę kontrolną SHA-256 i podpis…", "Checking the SHA-256 checksum and signature…", "Перевіряю контрольну суму SHA-256 і підпис…");
      await plugin.installUpdate({url: rel.url, sha256: rel.sha256});
      progress.textContent = UI.t("Potwierdź instalację w oknie Androida.", "Confirm the install in the Android dialog.", "Підтвердіть установлення у вікні Android.");
      btn.textContent = UI.t("Instalator otwarty", "Installer opened", "Інсталятор відкрито");
    } catch (error) {
      btn.disabled = false;
      btn.textContent = UI.t("Spróbuj ponownie", "Try again", "Спробувати ще раз");
      /* Bez surowego wyjątku na pierwszym planie: co się stało i co zrobić,
         szczegół techniczny w nawiasie (do zrzutu ekranu). */
      progress.textContent = UI.t("Nie udało się zaktualizować. Spróbuj ponownie albo pobierz nową wersję ze strony wydania.", "The update failed. Try again or download the new version from the release page.", "Оновлення не вдалося. Спробуйте ще раз або завантажте нову версію зі сторінки випуску.")
        + ` (${String(error?.message || error).slice(0, 120)})`;
    }
  };
}

/* Skrót do strony na ekranie telefonu (WebAPK) niczym się nie różni od aplikacji:
   ta sama ikona, ta sama nazwa, brak paska adresu. Czytelnik z 23.09.2026 przez to
   szukał w nim GROTY i przycisku aktualizacji. W skrócie mówimy wprost, co to jest. */
(function paskSkrotu() {
  if (IS_APP) return;
  const stoi = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
  const android = /Android/i.test(navigator.userAgent || "");
  if (!stoi || !android) return;
  try { if (localStorage.getItem("straznik_skrot_ukryty") === "1") return; } catch {}
  const pasek = document.getElementById("skrot-www");
  if (!pasek) return;
  pasek.hidden = false;
  document.getElementById("skrot-www-x")?.addEventListener("click", () => {
    pasek.hidden = true;
    try { localStorage.setItem("straznik_skrot_ukryty", "1"); } catch {}
  });
})();

/* ── nasłuch w tle (natywna usługa Androida) ─────────────────────────────── */
const BG = () => window.Capacitor?.Plugins?.StraznikBackground || null;

async function refreshBgStatus(previewLang = UI.lang) {
  if (dlg.open && dlg.classList.contains("na-starcie")) renderGotowosc(previewLang);
  // Podglad w ustawieniach pokazuje wybrany jezyk jeszcze przed zapisem, dlatego
  // teksty w tym oknie skladamy przez lokalne T, a nie przez UI.t (jezyk zapisany).
  const T = (pl, en, uk) => previewLang === "pl" ? pl : previewLang === "uk" ? (uk !== undefined ? uk : en) : en;
  const plugin = BG();
  const info = document.getElementById("bg-status");
  if (!plugin) {
    document.getElementById("btn-battery").style.display = "none";
    document.getElementById("btn-notif-settings").style.display = "none";
    await refreshWebPushStatus(previewLang);
    return;
  }
  try {
    const s = await plugin.status();
    const warn = [];
    if (!s.notificationsAllowed)
      warn.push(T("⚠ Powiadomienia są zablokowane w ustawieniach systemu — bez nich alarm nie dotrze.", "⚠ Notifications are blocked in system settings — alerts cannot arrive.", "⚠ Сповіщення заблоковані в налаштуваннях системи — без них тривога не дійде."));
    if (s.fullScreenAllowed === false)
      warn.push(T("⚠ Brak zgody na alarm pełnoekranowy — czerwony alarm nie zapali wygaszonego ekranu. Włącz przyciskiem „Sprawdź zgodę na alarm pełnoekranowy” poniżej.", "⚠ Full-screen alert permission is missing — a red alert will not wake the screen. Enable it below.", "⚠ Немає дозволу на повноекранну тривогу — червона тривога не ввімкне згаслого екрана. Увімкніть кнопкою 🚨 нижче."));
    /* Potwierdzone na iPhonie 18.09.2026: w trybie Sen czerwony alarm nie dotarł
       do odblokowania telefonu, dopóki Strażnik nie został dopuszczony w
       Ustawienia → Skupienie → Sen → Aplikacje. iOS wymaga zgody na powiadomienia
       czasowo zależne osobno dla aplikacji i osobno dla trybu Skupienia. */
    if (s.platform === "ios" && s.notificationsAllowed && s.timeSensitiveAllowed === false)
      warn.push(T("⚠ „Powiadomienia czasowo zależne” są wyłączone dla Strażnika — czerwony alarm może nie przebić trybu Skupienia. Ustawienia → Strażnik → Powiadomienia.", "⚠ “Time Sensitive Notifications” are off for Strażnik — a red alert may stay silent in Focus mode. Settings → Strażnik → Notifications.", "⚠ «Сповіщення з урахуванням часу» вимкнені для Strażnika — червона тривога може не пробити режим Фокусування. Налаштування → Strażnik → Сповіщення."));
    if (usypiaAplikacje(s))
      warn.push(T(`⚠ Na telefonach ${esc(s.manufacturer)} oszczędzanie baterii potrafi uśpić Strażnika tak, że alarm nie dotrze wcale — ruszy dopiero po otwarciu aplikacji. Zdejmij ograniczenie przyciskiem „Wyłącz oszczędzanie baterii” poniżej, a w ustawieniach baterii telefonu wyjmij Strażnika z aplikacji usypianych.`, `⚠ On ${esc(s.manufacturer)} phones battery saving can put Strażnik to sleep so that an alert never arrives — it starts only after you open the app. Lift the restriction with the “Turn off battery saving” button below, and in the phone's battery settings take Strażnik out of the sleeping apps.`, `⚠ На телефонах ${esc(s.manufacturer)} економія батареї може приспати Strażnika так, що тривога не дійде взагалі — запуститься аж після відкриття застосунку. Зніміть обмеження кнопкою «Вимкнути економію батареї» нижче, а в налаштуваннях батареї приберіть Strażnika зі сплячих застосунків.`));
    if (s.topicsError)
      warn.push(T("⚠ Część subskrypcji alarmów nie została jeszcze potwierdzona — zostaw aplikację chwilę otwartą z internetem.", "⚠ Some alert subscriptions were not confirmed yet — keep the app open with internet for a moment.", "⚠ Частину підписок на тривоги ще не підтверджено — залиште застосунок ненадовго відкритим з інтернетом."));
    // Audyt B6: na tych nakładkach „wyczyść wszystko” działa jak wymuszone zatrzymanie
    if (/xiaomi|redmi|poco|huawei|honor|oppo|realme|vivo|oneplus|meizu|tecno|infinix/i.test(s.manufacturer || ""))
      warn.push(T(`⚠ Na telefonach ${esc(s.manufacturer)} usunięcie aplikacji z listy ostatnich potrafi zablokować alarmy do ponownego otwarcia Strażnika. Zablokuj ją na liście ostatnich (kłódka) i zezwól na autostart.`, `⚠ On ${esc(s.manufacturer)} phones, clearing the app from recent apps can block alerts until you open Strażnik again. Lock it in recent apps (padlock) and allow autostart.`, `⚠ На телефонах ${esc(s.manufacturer)} видалення застосунку зі списку останніх може заблокувати тривоги до повторного відкриття Strażnika. Закріпіть його у списку останніх (замочок) і дозвольте автозапуск.`));
    const verEl = document.getElementById("app-version");
    // iOS celowo zwraca pusty appVersion, żeby aplikacja nie proponowała APK
    // (Apple odrzuca aktualizacje spoza App Store) — wersję podaje iosAppVersion.
    const wersja = s.appVersion || s.iosAppVersion;
    if (verEl) verEl.textContent = wersja
      ? `${T("Zainstalowana wersja", "Installed version", "Встановлена версія")} ${wersja}` : "";
    const updBtn = document.getElementById("btn-update");
    if (updBtn) updBtn.style.display = UPDATE_CHECK && !IS_IOS ? "" : "none";
    /* canUseFullScreenIntent() bywa optymistyczne (zwraca „dozwolone", choć system
       i tak odrzuca alarm), a po aktualizacji zgoda potrafi się cofnąć — dlatego na
       Androidzie 14+ przycisk pokazujemy ZAWSZE, żeby dało się ją sprawdzić i włączyć. */
    const fsBtn = document.getElementById("btn-fullscreen");
    if (fsBtn) {
      const mayBeBlocked = (s.sdk || 0) >= 34;
      fsBtn.style.display = mayBeBlocked ? "" : "none";
      fsBtn.textContent = s.fullScreenAllowed === false
        ? (T("Zezwól na alarm pełnoekranowy", "Allow full-screen alerts", "Дозволити повноекранну тривогу"))
        : (T("Sprawdź zgodę na alarm pełnoekranowy", "Check full-screen alert permission", "Перевірити дозвіл на повноекранну тривогу"));
    }
    /* Przycisk baterii mówi, w jakim stanie jesteśmy. Bez tego po zdjęciu
       ograniczenia nic się na ekranie nie zmienia i nie wiadomo, czy zadziałało —
       a to jedyna rzecz, którą da się stąd sprawdzić bez czekania na alarm. */
    const batBtn = document.getElementById("btn-battery");
    if (batBtn) {
      batBtn.textContent = s.batteryUnrestricted
        ? T("Oszczędzanie baterii: wyłączone", "Battery saving: off", "Економія батареї: вимкнено")
        : T("Wyłącz oszczędzanie baterii", "Turn off battery saving", "Вимкнути економію батареї");
    }
    /* Dostęp do zasad Nie przeszkadzać. Przycisk pokazujemy tylko wtedy, gdy zgody
       NIE MA — po jej przyznaniu nie ma czego klikać, a dodatkowy przycisk w tym
       miejscu tylko odwracałby uwagę od zgody na pełny ekran, która jest ważniejsza. */
    const dndBtn = document.getElementById("btn-dnd-access");
    if (dndBtn) {
      const brak = IS_APP && !IS_IOS && s.dndAccess === false;
      dndBtn.style.display = brak ? "" : "none";
      dndBtn.textContent = T("Alarm mimo Nie przeszkadzać",
        "Alert despite Do Not Disturb", "Тривога попри «Не турбувати»");
    }
    /* Alarm krytyczny (iOS, entitlement Apple z 28.09.2026). Osobna zgoda,
       bez której uprawnienie jest martwe: iPhone pyta o nią raz i tylko wprost.
       Przycisk wymaga tylko tego, żeby warstwa natywna miała metodę pytania —
       starsze wydania ze sklepu jej nie mają. O resztę pyta warunek niżej. */
    /* Bez klasy ios-only: ta reguła ma !important, więc przykryłaby styl
       widoczności, a !important po naszej stronie z kolei zablokowałby ukrywanie.
       O tym guziku decyduje wyłącznie kod niżej. */
    const critBtn = document.getElementById("btn-critical");
    if (critBtn) {
      /* ZAPĘTLENIE, na które nadział się Adrian (29.09.2026): iOS zgłasza
         `criticalAlertSetting == .notSupported` dopóty, dopóki aplikacja ANI RAZU
         nie poprosi o tę zgodę. Warunek `criticalSupported !== false` chował więc
         przycisk, bez przycisku nikt nie pytał, a bez pytania system dalej mówił
         „nie obsługuję". Na ekranie wyglądało to identycznie jak brak uprawnienia.
         W wersji ze sklepu, która nigdy nie pyta sama, zgoda byłaby nieosiągalna
         dla wszystkich.

         Dlatego pytamy o `criticalAsked`, nie o samo wsparcie: przycisk jest
         widoczny, dopóki nikt nie pytał, a chowamy go dopiero wtedy, gdy system
         ODPOWIEDZIAŁ, że nie potrafi. Starsza warstwa natywna bez tego pola
         (undefined) też pokaże przycisk — lepiej dać spróbować raz, niż zamknąć
         kogoś w tym samym kole. */
      const juzPytano = s.criticalAsked === true;
      const umie = IS_APP && IS_IOS && typeof BG()?.zgodaKrytyczna === "function"
        && !(juzPytano && s.criticalSupported === false);
      critBtn.style.display = umie ? "" : "none";
      /* Bez przycisku akapit opisywałby funkcję, której nie da się włączyć —
         Adrian tak właśnie trafił (29.09.2026): przeczytał opis alarmu
         krytycznego i nie znalazł żadnego przełącznika. Reguła .ios-only ma
         !important, więc chowamy klasą o wyższej szczegółowości. */
      document.getElementById("krytyczny-ios-note")?.classList.toggle("schowane", !umie);
      critBtn.textContent = s.criticalAllowed
        ? T("Alarm mimo wyciszenia: włączony",
            "Alert despite silent mode: on", "Тривога попри вимкнений звук: увімкнено")
        : T("Włącz alarm mimo wyciszenia",
            "Turn on alert despite silent mode", "Увімкнути тривогу попри вимкнений звук");
    }
    renderNativeSound(s, previewLang);
    // Stan subskrypcji potwierdzony przez Firebase — dowód, że wyłączenie działa
    // (15.09.2026: sam przełącznik nic nie pokazywał, a test lokalny dalej grał).
    const slug = v => "voiv_" + v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
    /* iPhone ze zgodą na alarm krytyczny jest zapisany na `voiv_X_krytyczne`
       (notify.py, CRITICAL_TOPIC_SUFFIX). Dokładne porównanie dawało mu
       „nie jest zapisany… (potwierdzone przez Firebase)", choć alarmy szły. */
    const subscribed = ALL_VOIVS.filter(v => {
      const baza = slug(v);
      return (s.topicsConfirmed || []).some(t => t === baza || t === baza + "_krytyczne");
    });
    // Świeża instalacja bez żadnego obserwowanego województwa też wypisuje z tematów —
    // „Wypisywanie…” wyglądało wtedy jak błąd, a użytkownik nie wiedział, co zrobić.
    const noRegion = !alertsOff() && !(s.observedVoivodeships || []).length && !s.homeVoivodeship;
    const subLine = noRegion && !subscribed.length
      ? (T("Nie wybrano jeszcze województwa do alarmów — dodaj miejsce z włączonym „Obserwuj alerty” w zakładce Moje miejsca.", "No province is selected for alerts yet — add a place with “Watch alerts” on in the My places tab.", "Ще не вибрано воєводства для тривог — додайте місце з увімкненим «Стежити за тривогами» у вкладці Мої місця."))
      : s.topicsUnsubscribing
      ? (T("⏳ Wypisywanie telefonu z województw…", "⏳ Unsubscribing this phone from provinces…", "⏳ Відписування телефону від воєводств…"))
      : subscribed.length
      ? (T(`Zapisany do alarmów dla: ${subscribed.map(v => esc(UI.voiv(v))).join(", ")} (potwierdzone przez Firebase).`, `Subscribed to alerts for: ${subscribed.map(v => esc(UI.voiv(v))).join(", ")} (confirmed by Firebase).`, `Записано на тривоги для: ${subscribed.map(v => esc(UI.voiv(v))).join(", ")} (підтверджено Firebase).`))
      : (T("Telefon nie jest zapisany do żadnego województwa (potwierdzone przez Firebase).", "This phone is not subscribed to any province (confirmed by Firebase).", "Телефон не записаний на жодне воєводство (підтверджено Firebase)."));
    if (alertsOff()) warn.splice(0, warn.length, T("🔕 Alarmy są wyłączone na tym telefonie — powiadomienia o alarmach nie przyjdą, nawet gdyby serwer je wysłał. Włącz suwak niżej, żeby je przywrócić.", "🔕 Alerts are turned off on this phone — no alert notifications will arrive, even if the server sends one. Turn the switch below back on to restore them.", "🔕 Тривоги вимкнено на цьому телефоні — сповіщення про тривоги не прийдуть, навіть якби сервер їх надіслав. Увімкніть перемикач нижче, щоб їх повернути."));
    /* Godzina ostatniego pusha. Bez niej przy zgłoszeniu „nic nie przychodzi"
       zostaje zgadywanie: uśpiona aplikacja i ciche powiadomienie wyglądają z
       zewnątrz tak samo, a naprawia się je zupełnie inaczej. Pusto na iPhonie
       i na stronie — tam tego nie zapisujemy. */
    const loc = previewLang === "pl" ? "pl-PL" : previewLang === "uk" ? "uk-UA" : "en-GB";
    /* 11.10.2026: obok godziny — ile trwała droga od serwera i czy Google obniżył
       priorytet (wtedy uśpiony telefon dostaje alarm dopiero przy przebudzeniu;
       u usera 80 s). Opóźnienie do 15 s to zwykła droga przez sieć — nie straszymy. */
    const sek = s.lastPushDelayMs >= 0 ? Math.round(s.lastPushDelayMs / 1000) : null;
    const droga = sek == null ? ""
      : s.lastPushDeprioritized
      ? T(` Szedł ${sek} s — ⚠ Google obniżył mu priorytet, więc uśpiony telefon dostał go z opóźnieniem.`,
          ` It took ${sek} s — ⚠ Google lowered its priority, so a sleeping phone got it late.`,
          ` Він ішов ${sek} с — ⚠ Google знизив йому пріоритет, тож приспаний телефон отримав його із запізненням.`)
      : sek > 15
      ? T(` Szedł ${sek} s (priorytet bez zmian — opóźnienie po stronie sieci albo telefonu).`,
          ` It took ${sek} s (priority unchanged — the delay was in the network or the phone).`,
          ` Він ішов ${sek} с (пріоритет без змін — затримка в мережі або в телефоні).`)
      : T(` Szedł ${sek} s.`, ` It took ${sek} s.`, ` Він ішов ${sek} с.`);
    const pushLine = s.lastPushAt
      ? T(`Ostatni sygnał z serwera odebrany ${new Date(s.lastPushAt).toLocaleString(loc)}.`,
          `Last signal from the server received ${new Date(s.lastPushAt).toLocaleString(loc)}.`,
          `Останній сигнал із сервера отримано ${new Date(s.lastPushAt).toLocaleString(loc)}.`) + droga
      : s.lastPushAt === 0
      ? T("Ten telefon nie odebrał jeszcze żadnego sygnału z serwera — to normalne, dopóki nie było alarmu dla Twojego regionu.",
          "This phone has not received any signal from the server yet — that is normal until there has been an alert for your region.",
          "Цей телефон ще не отримав жодного сигналу з сервера — це нормально, доки не було тривоги для вашого регіону.")
      : "";
    if (info) info.innerHTML = (warn.join("<br>")
      || (noRegion && !subscribed.length ? (T("Powiadomienia są dozwolone.", "Notifications are allowed.", "Сповіщення дозволені.")) : "")
      || (T("Powiadomienia gotowe. Alarmy dla Twojego regionu dotrą także przy zamkniętej aplikacji.", "Notifications ready. Alerts for your region will arrive even while the app is closed.", "Сповіщення готові. Тривоги для вашого регіону дійдуть також при закритому застосунку.")))
      + `<br>${subLine}`
      + (pushLine ? `<br>${pushLine}` : "")
      + `<br><span class="muted">${s.platform === "ios" ? `iOS ${esc(s.osVersion || "")}`
        : `Android ${s.sdk}, ${esc(s.manufacturer || "")}`}`
      + `${s.homeVoivodeship ? " · region: " + esc(UI.voiv(s.homeVoivodeship)) : ""}</span>`;
  } catch (e) { if (info) info.textContent = (T("Nie udało się odczytać stanu: ", "Could not read status: ", "Не вдалося прочитати стан: ")) + e; }
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

/* 17.09.2026: po aktualizacji do 1.7.54 zgoda na alarm pełnoekranowy była wyłączona,
   a aplikacja nic nie pokazała — canUseFullScreenIntent() bywa optymistyczne, baner
   pojawiał się dopiero po dwóch sprawdzeniach i raz zamknięty nie wracał. Po każdej
   aktualizacji na Androidzie 14+ prosimy więc raz o sprawdzenie zgody, niezależnie od
   odczytu, i przywracamy baner ostrzeżeń. Świeża instalacja przechodzi onboarding. */
const FS_CHECK_KEY = "straznik_fs_checked_version";
async function maybeCheckFullScreenAfterUpdate() {
  const plugin = BG();
  if (!plugin || alertsOff()) return;
  let s;
  try { s = await plugin.status(); } catch { return; }
  if ((s.sdk || 0) < 34 || !s.appVersion) return;
  let seen = null;
  try { seen = localStorage.getItem(FS_CHECK_KEY); } catch { return; }
  if (seen === s.appVersion || !localStorage.getItem("straznik_bg_offered")) return;
  if (document.querySelector("dialog[open]")) return;   // spróbujemy przy następnym sprawdzeniu
  localStorage.setItem(FS_CHECK_KEY, s.appVersion);
  try { localStorage.removeItem(BGWARN_HIDDEN_KEY); } catch {}
  document.getElementById("fs-check")?.showModal();
}
document.getElementById("fs-check-open")?.addEventListener("click", async () => {
  document.getElementById("fs-check").close();
  await BG()?.requestFullScreenPermission();
  setTimeout(() => { refreshBgStatus(); refreshBgWarning(); }, 1500);
});
document.getElementById("fs-check-skip")?.addEventListener("click", () =>
  document.getElementById("fs-check").close());

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
/* Zgoda na alarm krytyczny. iOS pokazuje swoje okno TYLKO RAZ — po odmowie
   jedyną drogą są Ustawienia telefonu, więc po nieudanej prośbie otwieramy je
   zamiast pytać drugi raz w próżnię. Warstwa natywna sama przepisuje telefon
   na właściwy temat FCM po udzieleniu zgody. */
document.getElementById("btn-critical")?.addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    const r = await BG()?.zgodaKrytyczna?.();
    /* Kto odrzucił powiadomienia W OGÓLE, temu iOS nie pokaże żadnego okna
       i zgłosi WSZYSTKIE ustawienia jako nieobsługiwane — także krytyczne.
       Bez tego rozróżnienia otwieralibyśmy Ustawienia w ciszy, jakby to była
       odmowa zgody krytycznej; człowiek szukałby tam „Alertów krytycznych",
       których jeszcze nie ma, i wracał z niczym. Warstwa natywna sygnalizuje
       ten przypadek osobno i celowo NIE zapisuje go jako „pytaliśmy", więc
       przycisk zostaje widoczny. */
    if (r?.reason === "powiadomienia-odrzucone") {
      alert(UI.t(
        "Najpierw włącz powiadomienia Strażnika.\n\nBez nich iPhone nie pozwala na alarm krytyczny i nie pokaże nawet pytania o zgodę. Otworzę teraz Ustawienia — włącz tam „Włącz powiadomienia”, wróć i naciśnij ten przycisk jeszcze raz.",
        "Turn on notifications for Strażnik first.\n\nWithout them iPhone does not allow critical alerts and will not even show the permission prompt. I will open Settings now — turn on “Allow Notifications” there, come back and press this button again.",
        "Спершу увімкніть сповіщення Strażnika.\n\nБез них iPhone не дозволяє критичну тривогу і навіть не покаже запит на дозвіл. Зараз відкрию Налаштування — увімкніть там «Дозволити сповіщення», поверніться і натисніть цю кнопку ще раз."));
      await BG()?.openNotificationSettings?.();
    } else if (r && r.allowed === false) {
      await BG()?.openNotificationSettings?.();
    }
  } catch (err) {
    console.warn("zgoda na alarm krytyczny", err);
  } finally {
    e.target.disabled = false;
    setTimeout(refreshBgStatus, 800);
  }
});
/* Tryb czerwonego alarmu (10.10.2026): syrena / tylko wibracja / zwykłe
   powiadomienie. Zastąpił przełącznik „tylko wibracja” — czytelnik prosił
   o coś pośredniego między syreną a wyłączeniem alarmów w ogóle. */
const TRYB_OSTRZEZENIE = {
  wibracja: ["Wyłączyć syrenę czerwonego alarmu?\n\nZostanie sama wibracja, pełny ekran i miganie. Przy wygaszonym ekranie i telefonie w drugim pokoju możesz takiego alarmu nie zauważyć. Wrócisz do syreny w tym samym miejscu.",
    "Turn off the siren for red alerts?\n\nOnly vibration, the full screen and flashing will remain. With the screen off and the phone in another room you may not notice an alert like that. You can switch the siren back on in the same place.",
    "Вимкнути сирену червоної тривоги?\n\nЗалишиться лише вібрація, повний екран і миготіння. З вимкненим екраном і телефоном в іншій кімнаті ви можете такої тривоги не помітити. Повернути сирену можна в цьому ж місці."],
  zwykle: ["Czerwony alarm jako zwykłe powiadomienie?\n\nBez syreny i bez pełnego ekranu: baner, krótki dźwięk i wibracja, jak przy żółtym. Taki alarm SZANUJE tryb cichy i Nie przeszkadzać — w nocy możesz go nie dostać. Wrócisz do syreny w tym samym miejscu.",
    "Red alert as a regular notification?\n\nNo siren and no full screen: a banner, a short sound and vibration, like yellow. Such an alert RESPECTS silent mode and Do Not Disturb — at night it may not reach you. You can switch the siren back on in the same place.",
    "Червона тривога як звичайне сповіщення?\n\nБез сирени й повного екрана: банер, короткий звук і вібрація, як у жовтого. Така тривога ВРАХОВУЄ беззвучний режим і «Не турбувати» — уночі вона може до вас не дійти. Повернути сирену можна в цьому ж місці."],
};
function renderTrybCzerwonego() {
  const wybrany = czerwonyTryb();
  for (const b of document.querySelectorAll("#red-mode .chip")) {
    const on = b.dataset.tryb === wybrany;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");   // czytnik ekranu
  }
}
function minutyNaCzas(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
function czasNaMinuty(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || "");
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
function renderGodzinyCiszy() {
  const c = ciszaUstawienia();
  const box = document.getElementById("set-quiet-on");
  if (!box) return;
  box.checked = c.on;
  document.getElementById("quiet-hours")?.classList.toggle("wylaczone", !c.on);
  const od = document.getElementById("qh-od"), doo = document.getElementById("qh-do");
  if (od && document.activeElement !== od) od.value = minutyNaCzas(c.od);
  if (doo && document.activeElement !== doo) doo.value = minutyNaCzas(c.do);
  for (const b of document.querySelectorAll("#quiet-hours .seg .chip")) {
    const on = b.dataset.czerwony === c.czerwony;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
  const stan = document.getElementById("qh-stan");
  if (stan) {
    const teraz = godzinyCiszyTeraz();
    stan.hidden = !c.on;
    stan.textContent = !c.on ? "" : c.od === c.do
      ? UI.t("Początek i koniec są takie same — godziny ciszy nie obowiązują.", "Start and end are the same — quiet hours never apply.", "Початок і кінець однакові — години тиші не діють.")
      : teraz ? UI.t(`Teraz trwają godziny ciszy (do ${minutyNaCzas(c.do)}).`, `Quiet hours are on now (until ${minutyNaCzas(c.do)}).`, `Зараз тривають години тиші (до ${minutyNaCzas(c.do)}).`)
      : UI.t(`Godziny ciszy zaczną się o ${minutyNaCzas(c.od)}.`, `Quiet hours start at ${minutyNaCzas(c.od)}.`, `Години тиші почнуться о ${minutyNaCzas(c.od)}.`);
  }
}
/* Zapis DOPIERO po potwierdzeniu z warstwy natywnej (jak tryb czerwonego): inaczej
   otwarta aplikacja milczałaby w nocy, a powiadomienie przy zgaszonym ekranie wyło. */
async function zapiszGodzinyCiszy(zmiana) {
  const c = { ...ciszaUstawienia(), ...zmiana };
  let ok = false;
  try {
    const r = await BG()?.setQuietHours?.({ enabled: c.on, from: c.od, to: c.do, red: c.czerwony });
    ok = !!r && r.quietOn === c.on && r.quietFrom === c.od && r.quietTo === c.do && r.quietRed === c.czerwony;
  } catch (err) { console.warn("godziny ciszy", err); }
  if (!ok) {
    toast(UI.t("Nie udało się zapisać godzin ciszy — spróbuj jeszcze raz.", "Could not save quiet hours — please try again.", "Не вдалося зберегти години тиші — спробуйте ще раз."), 6000);
    renderGodzinyCiszy();
    return;
  }
  try { localStorage.setItem(CISZA_KLUCZ, JSON.stringify(c)); } catch {}
  renderGodzinyCiszy();
  const zakres = `${minutyNaCzas(c.od)}–${minutyNaCzas(c.do)}`;
  /* Komunikat mówi, co NAPRAWDĘ się stanie — z dziennego trybu czerwonego. Dawniej
     „Syrena jak w dzień” obiecywała syrenę także wtedy, gdy w dzień ustawiona była
     wibracja albo zwykłe powiadomienie (cisza nigdy nie robi alarmu głośniejszym). */
  const dzien = czerwonyTryb();
  const czerwonyOpis = c.czerwony === "wibracja" && dzien === "syrena"
    ? UI.t("czerwony tylko wibracją", "red vibration only", "червоний лише вібрацією")
    : dzien === "zwykle" ? UI.t("czerwony jako zwykłe powiadomienie, jak w dzień", "red as a normal notification, as in the daytime", "червоний як звичайне сповіщення, як удень")
    : dzien === "wibracja" ? UI.t("czerwony tylko wibracją, jak w dzień", "red vibration only, as in the daytime", "червоний лише вібрацією, як удень")
    : UI.t("czerwony z syreną, jak w dzień", "red with the siren, as in the daytime", "червоний із сиреною, як удень");
  toast(!c.on ? UI.t("Godziny ciszy wyłączone.", "Quiet hours off.", "Години тиші вимкнено.")
    : UI.t(`Godziny ciszy ${zakres}: żółty bez dźwięku, ${czerwonyOpis}.`, `Quiet hours ${zakres}: yellow without sound, ${czerwonyOpis}.`, `Години тиші ${zakres}: жовтий без звуку, ${czerwonyOpis}.`), 6000);
}
document.getElementById("set-quiet-on")?.addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (on && ciszaUstawienia().czerwony === "wibracja" && !confirm(UI.t(
    "Włączyć godziny ciszy?\n\nW tych godzinach czerwony alarm przyjdzie bez syreny — pełny ekran i mocna wibracja zostają. Przy wygaszonym ekranie i telefonie w drugim pokoju możesz go nie zauważyć. Jeśli w nocy ma być tak samo jak w dzień, wybierz „Bez zmian”.",
    "Turn on quiet hours?\n\nDuring these hours a red alert arrives without the siren — the full screen and strong vibration stay. With the screen off and the phone in another room you may not notice it. To keep it the same as in the daytime, choose “Unchanged”.",
    "Увімкнути години тиші?\n\nУ ці години червона тривога прийде без сирени — повний екран і сильна вібрація лишаються. З вимкненим екраном і телефоном в іншій кімнаті ви можете її не помітити. Щоб уночі було так само, як удень, виберіть «Без змін»."))) {
    e.target.checked = false;
    return;
  }
  zapiszGodzinyCiszy({ on });
});
for (const [id, pole] of [["qh-od", "od"], ["qh-do", "do"]]) {
  document.getElementById(id)?.addEventListener("change", (e) => {
    const m = czasNaMinuty(e.target.value);
    if (m === null) { renderGodzinyCiszy(); return; }
    zapiszGodzinyCiszy({ [pole]: m });
  });
}
for (const b of document.querySelectorAll("#quiet-hours .seg .chip")) {
  b.addEventListener("click", () => {
    const czerwony = b.dataset.czerwony === "syrena" ? "syrena" : "wibracja";
    if (czerwony !== ciszaUstawienia().czerwony) zapiszGodzinyCiszy({ czerwony });
  });
}
renderGodzinyCiszy();
for (const b of document.querySelectorAll("#red-mode .chip")) {
  b.addEventListener("click", async () => {
    const tryb = b.dataset.tryb;
    if (!TRYBY_CZERWONEGO.includes(tryb) || tryb === czerwonyTryb()) return;
    // Sekcja „Zanim zmienisz” jest domyślnie zwinięta — przy odejściu od syreny
    // ostrzeżenie o nocy ma być na ekranie, a nie za podpisem.
    if (tryb !== "syrena") document.getElementById("det-natywny")?.setAttribute("open", "");
    if (tryb !== "syrena" && !confirm(UI.t(...TRYB_OSTRZEZENIE[tryb]))) return;
    /* Zapisujemy DOPIERO po potwierdzeniu z warstwy natywnej. Odwrotna kolejność
       przy nieudanym wywołaniu dawała rozjazd nie do zauważenia: otwarta
       aplikacja milczy, a powiadomienie przy zgaszonym ekranie dalej wyje. */
    let ok = false;
    try {
      const r = await BG()?.setRedMode?.({ mode: tryb });
      ok = !!r && r.redMode === tryb;
    } catch (err) { console.warn("tryb czerwonego", err); }
    if (!ok) {
      alert(UI.t("Nie udało się zmienić tego ustawienia. Spróbuj ponownie.",
                 "Could not change this setting. Please try again.",
                 "Не вдалося змінити це налаштування. Спробуйте ще раз."));
      return;
    }
    try {
      localStorage.setItem("straznik_czerwony_tryb", tryb);
      localStorage.setItem("straznik_czerwony_cisza", tryb === "syrena" ? "0" : "1");
    } catch {}
    renderTrybCzerwonego();
    setTimeout(refreshBgStatus, 400);
  });
}
renderTrybCzerwonego();
/* „Poczuj wibrację” — tylko tam, gdzie telefon umie wibrować ze strony
   (na iPhonie navigator.vibrate nie istnieje). */
/* W aplikacji na Androidzie wzór idzie natywnie, tą samą drogą co prawdziwy sygnał
   (Alarms.poczuj): wibracja ze strony to dla Androida „dotyk” i milczy w trybie
   cichym, choć alarm wtedy wibruje (zgłoszenie usera 11.10.2026). Na stronie
   i w starszym APK bez tej metody — navigator.vibrate. */
async function poczuj(poziom) {
  const bg = BG();
  if (IS_APP && !IS_IOS && bg) {
    try {
      const r = await bg.poczuj({ level: poziom });
      if (r?.wynik === "tryb_cichy")
        toast(UI.t("Telefon jest w trybie cichym, więc ten sygnał też nie zawibruje. Czerwony alarm w trybie Syrena albo Tylko wibracja wibruje mimo to.",
          "The phone is in silent mode, so this signal will not vibrate either. A red alert in Siren or Vibration only mode vibrates anyway.",
          "Телефон у беззвучному режимі, тож цей сигнал теж не завібрує. Червона тривога в режимі «Сирена» або «Лише вібрація» вібрує попри це."), 6000);
      if (r?.wynik === "kanal_bez_wibracji")
        toast(UI.t("Wibracja tego poziomu jest wyłączona w ustawieniach powiadomień Androida — prawdziwy sygnał też nie zawibruje.",
          "Vibration for this level is turned off in Android notification settings — the real alert will not vibrate either.",
          "Вібрацію цього рівня вимкнено в налаштуваннях сповіщень Android — справжній сигнал теж не завібрує."), 6000);
      if (r?.wynik) return;
    } catch {}
  }
  zawibruj(poziom === "high" ? WIBRACJA_A : WIBRACJA_U);
}
if (navigator.vibrate || (IS_APP && !IS_IOS)) {
  const rzad = document.getElementById("vib-row");
  if (rzad) rzad.hidden = false;
  const nota = document.getElementById("vib-note");
  if (nota) nota.hidden = false;
  document.getElementById("btn-vib-u")?.addEventListener("click", () => poczuj("elevated"));
  document.getElementById("btn-vib-a")?.addEventListener("click", () => poczuj("high"));
}
document.getElementById("btn-dnd-access")?.addEventListener("click", async () => {
  await BG()?.requestDndAccess?.(); setTimeout(refreshBgStatus, 800);
});
document.getElementById("btn-update")?.addEventListener("click", async (e) => {
  e.target.disabled = true;
  await checkForUpdate(true);
  e.target.disabled = false;
});

/* ── dźwięk natywny: podgląd głośności, opcja pełnej głośności, test ───────── */
function renderNativeSound(s, jezyk = UI.lang) {
  const T = (pl, en, uk) => jezyk === "pl" ? pl : jezyk === "uk" ? (uk !== undefined ? uk : en) : en;
  const vol = document.getElementById("ns-volume");
  const box = document.getElementById("set-force-volume");
  if (box) {
    box.checked = !!s.forceMaxVolume;
    // Przy ciszy „zawsze na pełnej głośności” nie ma czego podgłośnić. Zamiast
    // kasować wybór użytkownika, blokujemy przełącznik i piszemy dlaczego —
    // po wyłączeniu ciszy jego ustawienie wraca nietknięte.
    box.disabled = !!s.redSilent;
    box.closest("label")?.classList.toggle("wylaczone", !!s.redSilent);
  }
  if (!vol) return;
  const pct = s.alarmVolumeMax ? Math.round(100 * (s.alarmVolume || 0) / s.alarmVolumeMax) : null;
  const lines = [];
  if (pct != null) lines.push(T(`Głośność „Alarmy” w Androidzie: <b>${pct}%</b>.`, `Android “Alarms” volume now: <b>${pct}%</b>.`, `Гучність «Будильники» в Android: <b>${pct}%</b>.`));
  // Gdy ciszę wybrał SAM użytkownik, to nie jest usterka do zgłoszenia — tylko
  // przypomnienie, żeby nie zdziwił się w nocy.
  if (s.redMode === "zwykle") lines.push(T("🔕 Czerwony alarm masz ustawiony jako zwykłe powiadomienie — bez syreny i pełnego ekranu, a w trybie Nie przeszkadzać może nie dotrzeć. Dlatego „zawsze na pełnej głośności” jest nieczynne.", "🔕 The red alert is set to a regular notification — no siren and no full screen, and in Do Not Disturb it may not reach you. That is why “always at full volume” is inactive.", "🔕 Червону тривогу налаштовано як звичайне сповіщення — без сирени й повного екрана, а в режимі «Не турбувати» вона може не дійти. Тому «завжди на повній гучності» неактивне."));
  else if (s.redSilent) lines.push(T("🔕 Czerwony alarm masz ustawiony na samą wibrację — syrena nie zagra. Dlatego „zawsze na pełnej głośności” jest nieczynne, a przycisk „Test: pełny alarm” też będzie bez dźwięku. Samą syrenę usłyszysz przyciskiem „Test: syrena”.", "🔕 The red alert is set to vibration only — the siren will not sound. That is why “always at full volume” is inactive and “Test: full alert” will also be silent. To hear the siren itself, use “Test: siren”.", "🔕 Червона тривога налаштована лише на вібрацію — сирена не пролунає. Тому «завжди на повній гучності» неактивне, а «Тест: повна тривога» також буде без звуку. Щоб почути саму сирену, скористайтеся кнопкою «Тест: сирена»."));
  else if (s.redChannelSound === false) lines.push(T("⚠ Dźwięk kanału czerwonego alarmu jest wyłączony w ustawieniach powiadomień.", "⚠ Sound for the red alert channel is off in notification settings.", "⚠ Звук каналу червоної тривоги вимкнено в налаштуваннях сповіщень."));
  vol.innerHTML = lines.join(" ");
}
async function refreshNativeSound() {
  const plugin = BG(); if (!plugin) return;
  try {
    const s = await plugin.status();
    renderNativeSound(s);
    // Prawdę o ustawieniu trzyma strona natywna (powiadomienia z serwera składa
    // Alarms.java). localStorage to tylko kopia dla otwartej aplikacji i trybu
    // wbudowanego — przy starcie wyrównujemy ją do natywnej.
    if (s.yellowLevel) { try { localStorage.setItem("straznik_zolty_poziom", s.yellowLevel); } catch {} }
    if (s.redSilent !== undefined) {
      try { localStorage.setItem("straznik_czerwony_cisza", s.redSilent ? "1" : "0"); } catch {}
    }
    if (TRYBY_CZERWONEGO.includes(s.redMode)) {
      try { localStorage.setItem("straznik_czerwony_tryb", s.redMode); } catch {}
    }
    renderTrybCzerwonego();
    if (typeof s.quietOn === "boolean") {
      try { localStorage.setItem(CISZA_KLUCZ, JSON.stringify({ on: s.quietOn, od: s.quietFrom,
        do: s.quietTo, czerwony: s.quietRed })); } catch {}
    }
    renderGodzinyCiszy();
    renderYellowLevel();
  } catch {}
}

/* ── wysokość paska tytułu ───────────────────────────────────────────────
   Atrybucja, legenda i plakietka połączenia wisiały na `top: 60px + safe-t`.
   Po przebudowie paska w 1.7.89 pasek urósł do 90 px i atrybucja wjechała
   POD ikony: przez pierwsze pięć sekund, zanim zwinie się do (i), jej tekst
   prześwitywał między przyciskami (zgłoszenie użytkownika 04.10.2026).
   To nie była nakładka na „stary pasek" — to JEDEN element, który sam się
   zwija, tyle że stał w złym miejscu.
   Mierzymy pasek zamiast wpisywać liczbę, bo jego wysokość zależy od treści,
   od paska systemowego i — od teraz — od wybranej wielkości tekstu. */
/* Powiększenie tekstu z ustawień SYSTEMU (Android: „Rozmiar czcionki” → WebView textZoom).
   Mnoży każdy rozmiar czcionki niezależnie od CSS, więc przy 200% podpisy dolnego paska
   (5 zakładek po ~76 px) nachodziły na siebie. Mierzymy mnożnik, żeby CSS mógł przyciąć
   wzrost tam, gdzie miejsca nie przybywa — jak systemowe paski zakładek na iOS i Androidzie.
   (przegląd UI 14.10.2026) */
function zmierzPowiekszenieSystemu() {
  const t = document.createElement("div");
  t.style.cssText = "position:absolute;visibility:hidden;font-size:100px";
  document.documentElement.appendChild(t);
  const z = parseFloat(getComputedStyle(t).fontSize) / 100;
  t.remove();
  if (!(z > 0 && isFinite(z))) return;
  const html = document.documentElement;
  html.style.setProperty("--zoom-sys", String(z));
  /* Łącznie z wielkością tekstu wybraną w Strażniku: od ~160% wiersze ustawień
     układają wartość pod nazwą, zamiast ucinać ją do „S…”. */
  const skala = parseFloat(getComputedStyle(html).getPropertyValue("--skala-tekstu")) || 1;
  html.classList.toggle("tekst-duzy", z * skala >= 1.6);
}
zmierzPowiekszenieSystemu();

function zmierzPasekTytulu() {
  const tb = document.getElementById("topbar");
  if (tb) {
    const h = Math.round(tb.getBoundingClientRect().bottom);
    if (h > 0) document.documentElement.style.setProperty("--topbar-h", h + "px");
  }
  /* Atrybucja schodzi jeszcze niżej, gdy nad nią wisi plakietka połączenia
     („łączenie…", „tryb awaryjny…"). Obie stały dotąd na tej samej wysokości
     i plakietka, z wyższym z-index, zasłaniała początek listy źródeł. */
  const cb = document.getElementById("conn-badge");
  const widoczna = cb && !cb.classList.contains("hidden") && cb.getBoundingClientRect().height > 0;
  document.documentElement.style.setProperty("--pod-plakietka",
    widoczna ? (Math.round(cb.getBoundingClientRect().height) + 6) + "px" : "0px");
}
zmierzPasekTytulu();
addEventListener("resize", zmierzPasekTytulu);
{
  const tb = document.getElementById("topbar");
  // ResizeObserver i MutationObserver są od Chrome 64 i 18 — obie poniżej
  // naszej podłogi zgodności (80), więc można na nich polegać.
  if (tb && window.ResizeObserver) new ResizeObserver(zmierzPasekTytulu).observe(tb);
  const cb = document.getElementById("conn-badge");
  if (cb && window.MutationObserver)
    new MutationObserver(zmierzPasekTytulu).observe(cb, { attributes: true, attributeFilter: ["class"] });
}

/* ── wielkość tekstu ──────────────────────────────────────────────────────
   Zgłoszenie #4 (filo4444, 22.09.2026) i obietnica z notatek wydania 1.7.81.
   Cała typografia siedzi w `rem`, więc wystarczy jeden mnożnik na :root.
   Odstępy, wysokości i pole dotykowe zostają w px CELOWO — przy skalowaniu
   wszystkiego razem rosłaby też wysokość paska zakładek i okna przestałyby
   się mieścić (ten sam problem, który łataliśmy przez `--dlg-max`).
   Wartość ustawia też skrypt w nagłówku strony, przed pierwszym odmalowaniem;
   tutaj jest druga połowa: sterowanie i zapis. */
const SKALE_TEKSTU = ["1", "1.15", "1.3"];
function skalaTekstu() {
  try {
    const v = localStorage.getItem("straznik_skala_tekstu");
    return SKALE_TEKSTU.includes(v) ? v : "1";
  } catch { return "1"; }
}
function renderSkalaTekstu() {
  const wybrana = skalaTekstu();
  document.documentElement.style.setProperty("--skala-tekstu", wybrana);
  zmierzPasekTytulu();   // większy tekst = wyższy pasek = niżej atrybucja
  zmierzPowiekszenieSystemu();
  for (const b of document.querySelectorAll("#text-size .chip")) {
    const on = b.dataset.skala === wybrana;
    b.classList.toggle("active", on);
    // sama klasa jest wyłącznie wizualna — czytnik ekranu czyta aria-pressed
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
}
for (const b of document.querySelectorAll("#text-size .chip")) {
  b.addEventListener("click", () => {
    const skala = b.dataset.skala;
    if (!SKALE_TEKSTU.includes(skala)) return;
    try { localStorage.setItem("straznik_skala_tekstu", skala); } catch {}
    renderSkalaTekstu();
  });
}
renderSkalaTekstu();

/* ── głośność żółtego sygnału uwagi ───────────────────────────────────────── */
function renderYellowLevel() {
  const wybrany = chimeLevel();
  for (const b of document.querySelectorAll("#yellow-volume .chip"))
    b.classList.toggle("active", b.dataset.poziom === wybrany);
}
for (const b of document.querySelectorAll("#yellow-volume .chip")) {
  b.addEventListener("click", async () => {
    const poziom = b.dataset.poziom;
    try { localStorage.setItem("straznik_zolty_poziom", poziom); } catch {}
    renderYellowLevel();
    // zapis natywny decyduje o kanale powiadomienia przy zgaszonym ekranie (Android).
    // iOS tej metody nie ma (proxy Capacitora odrzuca obietnicę), a dźwięk żółtego
    // pusha jest tam w ładunku APNs z serwera — patrz #yv-ios-note (B11, 13.10.2026).
    if (!IS_IOS) try { await BG()?.setYellowLevel?.({ level: poziom }); } catch {}
    if (poziom !== "silent" && !(IS_APP && blockedByAlertsOff())) attentionChime();
  });
}
renderYellowLevel();
/* Suwak „Alarmy na tym telefonie” (15.09.2026 zamiast pola „Nie chcę alarmów”):
   włączony = alarmy przychodzą. Stan wypisania pokazuje status nad suwakiem —
   z potwierdzeniem z Firebase, a nie z samego zapisu w aplikacji. */
const alertsOnBox = document.getElementById("set-alerts-on");
if (alertsOnBox) {
  alertsOnBox.checked = !alertsOff();
  alertsOnBox.addEventListener("change", async (e) => {
    const off = !e.target.checked;
    if (off && !confirm(UI.t(`Wyłączyć alarmy na tym telefonie?\n\nTelefon zostanie wypisany ze wszystkich województw, więc powiadomienia o alarmach nie przyjdą, a Strażnik nie będzie przypominał o zgodach. Mapa działa dalej.\n\nZgody na powiadomienia w ustawieniach ${IS_IOS ? "iPhone'a" : "Androida"} zostają bez zmian — aplikacja nie może ich zmienić; wyłączysz je w ustawieniach systemu.`, `Turn off alerts on this phone?\n\nThis phone will be unsubscribed from every province, so no alert notifications will arrive and Strażnik will not remind you about permissions. The map keeps working.\n\n${IS_IOS ? "iPhone" : "Android"} notification permissions stay as they are — the app cannot change them; you can switch them off in system settings.`, `Вимкнути тривоги на цьому телефоні?\n\nТелефон буде відписано від усіх воєводств, тож сповіщення про тривоги не приходитимуть, а Strażnik не нагадуватиме про дозволи. Мапа працює далі.\n\nДозволи на сповіщення в налаштуваннях ${IS_IOS ? "iPhone" : "Android"} лишаються без змін — застосунок не може їх змінити; вимкнете їх у налаштуваннях системи.`))) {
      e.target.checked = true;
      return;
    }
    try {
      if (off) localStorage.setItem(ALERTS_OFF_KEY, "1");
      else { localStorage.removeItem(ALERTS_OFF_KEY); localStorage.removeItem(BGWARN_HIDDEN_KEY); }
    } catch {}
    try { await syncObservedRegions(); } catch {}
    refreshBgStatus(); refreshBgWarning();
    // potwierdzenie z Firebase przychodzi po chwili — odświeżamy status jeszcze dwa razy
    setTimeout(() => refreshBgStatus(), 3000); setTimeout(() => refreshBgStatus(), 9000);
    toast(off ? (UI.t("🔕 Alarmy wyłączone na tym telefonie. Mapa działa dalej.", "🔕 Alerts are off on this phone. The map keeps working.", "🔕 Тривоги вимкнено на цьому телефоні. Мапа працює далі."))
      : (UI.t("🔔 Alarmy znów włączone dla Twoich miejsc.", "🔔 Alerts are on again for your places.", "🔔 Тривоги знову ввімкнено для ваших місць.")), 6000);
  });
}
document.getElementById("set-force-volume")?.addEventListener("change", async (e) => {
  const plugin = BG(); if (!plugin) return;
  const want = e.target.checked;
  // świadoma zgoda: nie może wyć na maksa w nocy u kogoś, kto tego nie chce
  if (want && !confirm(UI.t("Włączyć pełną głośność czerwonego alarmu?\n\nPrzy czerwonym alarmie Strażnik ustawi głośność „Alarmy” w Androidzie na maksimum — także w nocy. Poprzednia głośność wróci po wyciszeniu alarmu. Wyłączysz to tym samym przełącznikiem.", "Turn on full volume for red alerts?\n\nDuring a red alert Strażnik will set the Android “Alarms” volume to maximum — also at night. The previous volume returns after you silence the alert. You can turn this off with the same switch.", "Увімкнути повну гучність червоної тривоги?\n\nПри червоній тривозі Strażnik встановить гучність «Будильники» в Android на максимум — також уночі. Попередня гучність повернеться після вимкнення тривоги. Вимкнете це тим самим перемикачем."))) {
    e.target.checked = false;
    return;
  }
  try {
    await plugin.setForceMaxVolume({ enabled: want });
    toast(want
      ? (UI.t("🔊 Czerwony alarm zagra na pełnej głośności.", "🔊 Red alerts will play at full volume.", "🔊 Червона тривога звучатиме на повній гучності."))
      : (UI.t("Czerwony alarm użyje obecnej głośności „Alarmy”.", "Red alerts use your current “Alarms” volume.", "Червона тривога використає поточну гучність «Будильники».")));
  } catch (err) { e.target.checked = !want; toast("Błąd: " + err); }
  refreshNativeSound();
});
document.getElementById("btn-sound-settings")?.addEventListener("click", () => BG()?.openSoundSettings?.());
/* Przy wyłączonych alarmach test nie może udawać, że alarm zadziała (15.09.2026:
   „test 5 s przechodzi”, choć telefon był wypisany — test jest lokalny, bez FCM). */
function blockedByAlertsOff() {
  if (!alertsOff()) return false;
  // alert(), nie toast: toast chował się pod otwartym oknem ustawień (sprawdzone na emulatorze)
  alert(UI.t("🔕 Alarmy są wyłączone na tym telefonie, więc alarm by nie przyszedł.\n\nWłącz „Alarmy na tym telefonie” w zakładce Alarmy, żeby przetestować.", "🔕 Alerts are off on this phone, so no alert would arrive.\n\nTurn on “Alerts on this phone” in the Alerts tab to test.", "🔕 Тривоги вимкнено на цьому телефоні, тож тривога не прийшла б.\n\nУвімкніть «Тривоги на цьому телефоні» у вкладці Тривоги, щоб протестувати."));
  return true;
}
async function nativeTest(level) {
  const plugin = BG(); if (!plugin?.testNativeAlarm) return;
  if (blockedByAlertsOff()) return;
  document.getElementById("settings").close();
  // iOS zwraca {scheduled:false, reason:"denied"} przy zablokowanych powiadomieniach;
  // bez tego toast obiecywał alarm, który nigdy nie przyszedł. Android zwraca undefined.
  // `lang`: na iOS treść testu była zawsze po polsku; Android parametr pomija
  const r = await plugin.testNativeAlarm({ level, delayMs: 5000, voivodeship: myVoiv() || "lubelskie",
                                           lang: UI.lang });
  if (r && r.scheduled === false)
    return toast(UI.t("Powiadomienia są zablokowane — włącz je w Ustawienia → Strażnik → Powiadomienia.", "Notifications are blocked — enable them in Settings → Strażnik → Notifications.", "Сповіщення заблоковано — увімкніть їх у Налаштування → Strażnik → Сповіщення."), 6000);
  /* iOS (11.10.2026): czerwony test idzie jako alarm krytyczny tylko ze zgodą Apple.
     Bez niej wyciszony iPhone milczy — człowiek odkładał telefon, nie słyszał nic
     i uznawał aplikację za zepsutą. Mówimy to PRZED testem. Android zwraca
     undefined, więc oba warunki go omijają. */
  if (r?.silentRisk)
    return toast(UI.t("Test alarmu za 5 sekund. Przy wyciszonym iPhonie będzie cichy: bez zgody na alarm krytyczny system wycisza powiadomienia. Zgodę daje przycisk „Włącz alarm mimo wyciszenia” w ustawieniach.",
      "Test alert in 5 seconds. On a muted iPhone it will be silent: without the critical-alert permission iOS mutes notifications. The “Turn on alert despite silent mode” button in settings grants it.",
      "Тест тривоги за 5 секунд. На iPhone з вимкненим звуком він буде тихим: без дозволу на критичну тривогу система приглушує сповіщення. Дозвіл дає кнопка «Увімкнути тривогу попри вимкнений звук» у налаштуваннях."), 9000);
  if (r?.critical)
    return toast(UI.t("Test alarmu za 5 sekund — przyjdzie jak prawdziwy czerwony alarm, także przy wyciszonym telefonie.",
      "Test alert in 5 seconds — it arrives like a real red alert, even on a muted phone.",
      "Тест тривоги за 5 секунд — прийде як справжня червона тривога, навіть на телефоні з вимкненим звуком."), 7000);
  toast(UI.t("Test alarmu za 5 sekund — możesz teraz zablokować ekran.", "Test alert in 5 seconds — you can lock the screen now.", "Тест тривоги за 5 секунд — можете зараз заблокувати екран."), 5000);
}
document.getElementById("btn-native-test")?.addEventListener("click", () => nativeTest("high"));
document.getElementById("btn-native-test-yellow")?.addEventListener("click", () => nativeTest("elevated"));
// po deklaracji BG (const) — wcześniej byłby błąd strefy martwej
if (IS_APP) {
  try { BG()?.addListener?.("fcmAlarm", onForegroundPush); } catch (e) { console.warn("fcmAlarm", e); }
}
for (const kind of ["neptun", "adsb"]) {
  const sel = document.getElementById(`set-trail-${kind}`);
  if (!sel) continue;
  sel.value = trailMode(kind);
  sel.addEventListener("change", () => {
    try { localStorage.setItem(TRAIL_KEYS[kind], sel.value); } catch {}
    if (kind === "adsb" && mapReady) drawFollowTrail();
    odswiezWartosciUstawien();
  });
}

const aboutDlg = document.getElementById("about");
document.getElementById("btn-about").onclick = () => aboutDlg.showModal();
document.getElementById("about-close").onclick = () => aboutDlg.close();
document.getElementById("btn-test-chime").onclick = () => { if (IS_APP && blockedByAlertsOff()) return; attentionChime(); };
document.getElementById("btn-test-siren").onclick = () => { if (IS_APP && blockedByAlertsOff()) return; airRaidSiren(false, true); };
document.getElementById("btn-test-alarm").onclick = () => {
  if (IS_APP && blockedByAlertsOff()) return;
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
/* Dzwonek na stronie WWW: gdy push już działa, otwiera zakładkę „Alarmy" z przyciskiem
   wyłączenia — wcześniej ponowne dotknięcie tylko jeszcze raz zapisywało subskrypcję. */
document.getElementById("btn-push").onclick = async () => {
  // Audyt B9: w APK dzwonek próbował Web Push (WebView go nie obsługuje), a jego
  // „wyciszenie” nie wyłączało pushy FCM. Teraz otwiera prawdziwy stan powiadomień.
  if (IS_APP && BG()) {
    openSettings();
    document.querySelector('#settings .set-tab[data-pane="alarmy"]')?.click();
    refreshBgStatus();
    return;
  }
  if (!IS_APP && !standalone) {
    let sub = null;
    try { sub = Notification.permission === "granted" ? await browserPushSubscription() : null; } catch {}
    if (sub) {
      openSettings();
      document.querySelector('#settings .set-tab[data-pane="alarmy"]')?.click();
      return;
    }
  }
  enablePush().then(() => refreshWebPushStatus()).catch(e => toast("Błąd: " + e));
};
document.getElementById("btn-web-push-off")?.addEventListener("click", () =>
  disableBrowserPush().catch(e => toast("Błąd: " + e)));
document.getElementById("btn-web-push-on")?.addEventListener("click", () => {
  localStorage.setItem(NOTIF_KEY, "1");
  enablePush().then(() => refreshWebPushStatus()).catch(e => toast("Błąd: " + e));
});
refreshBell();
function pokazStan3d() {
  // ikona w pasku bez podpisu: stan niesie podświetlenie i tytuł
  const b3 = document.getElementById("btn-3d");
  if (!b3) return;
  b3.classList.toggle("active", is3d);
  b3.setAttribute("aria-pressed", is3d ? "true" : "false");   // stan dla czytnika ekranu
  b3.title = is3d ? (UI.t("Przełącz na widok 2D", "Switch to 2D view", "Перемкнути на вигляд 2D"))
                  : (UI.t("Przełącz na widok 3D", "Switch to 3D view", "Перемкнути на вигляд 3D"));
}
document.getElementById("btn-3d").onclick = () => {
  is3d = !is3d;
  try { localStorage.setItem("straznik_widok", is3d ? "3d" : "2d"); } catch {}
  map?.easeTo({ pitch: is3d ? 45 : 0, bearing: is3d ? -8 : 0, duration: 700 });
  pokazStan3d();
};
pokazStan3d();

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
  // widok modułu jest osobnym ekranem — zakładka, która przejmuje ekran, go zamyka
  if ((panelOpen || histOn) && window.Grota?.widoczny) ukryjGrote();
}

function setPanel(open) {
  const p = document.getElementById("panel");
  p.classList.toggle("collapsed", !open);
  document.getElementById("btn-panel").classList.toggle("active", open);
  document.body.classList.toggle("panel-open", open);
  syncTabs();
  requestAnimationFrame(fitMapActions);   // po zamknięciu panelu przyciski wracają
}
document.getElementById("btn-panel").onclick = () =>
  setPanel(document.getElementById("panel").classList.contains("collapsed"));

/* Systemowy przycisk „wstecz” na Androidzie (17.09.2026). MainActivity pyta tę
   funkcję; true = coś zamknięte, false = nic do zamknięcia, aplikacja idzie w tło.
   Kolejność: od tego, co leży na wierzchu, do mapy. Czerwonego alarmu „wstecz”
   nie zamyka — do tego służą przyciski alarmu, przypadkowe dotknięcie nie może go uciszyć. */
window.straznikBack = function () {
  if (!document.getElementById("alarm-overlay")?.classList.contains("hidden")) return true;
  const open = [...document.querySelectorAll("dialog[open]")];
  if (open.length) {
    const d = open[open.length - 1];          // okno otwarte z innego leży później w DOM
    if (d.dispatchEvent(new Event("cancel", { cancelable: true }))) d.close();
    return true;
  }
  // Grota leży nad mapą na cały ekran: najpierw cofa własne kroki (karta, zakładka),
  // a gdy nie ma już czego — wracamy do Strażnika. Bez wstecz() (starszy moduł) po prostu zamyka.
  if (window.Grota?.widoczny) {
    if (!window.Grota.wstecz?.()) ukryjGrote();
    return true;
  }
  const card = document.getElementById("ac-card");
  if (card && !card.classList.contains("hidden")) { hideCard(); return true; }
  const brand = document.querySelector(".brand-open");
  if (brand) { brand.classList.remove("brand-open"); return true; }
  if (!document.getElementById("legend")?.classList.contains("hidden")) {
    document.getElementById("btn-legend").click(); return true;
  }
  if (histMode) { exitHistory(); return true; }
  if (!document.getElementById("panel").classList.contains("collapsed")) { setPanel(false); return true; }
  return false;
};
/* Esc robi na stronie to, co systemowe „wstecz” w aplikacji: zamyka kartę obiektu,
   legendę, historię i panel (przegląd UI 14.10.2026 — na stronie Esc nie działało).
   Otwarte okna obsługują Esc same (zdarzenie cancel), więc wtedy nie wchodzimy. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
  if (window.straznikBack?.()) e.preventDefault();
});
/* Ten sam skutek co ponowne dotknięcie ikony na pasku — tylko widoczny. */
document.getElementById("legend-x")?.addEventListener("click", () =>
  document.getElementById("btn-legend").click());
document.getElementById("btn-legend").onclick = () => {
  document.getElementById("legend").classList.toggle("hidden");
  document.getElementById("btn-legend").classList.toggle("active");
};

/* Panel i przyciski mapy muszą wiedzieć, ile miejsca zajmuje dolny stos —
   inaczej pasek zastrzeżenia zasłaniał nagłówek listy sygnałów. */
/* Przyciski mapy: pełne kafelki, jeśli się mieszczą; inaczej same ikony; bez miejsca
   nawet na ikonę — ukryte (Android 12, 360×640, czcionka 130%, tryb historii). */
function fitMapActions() {
  const box = document.getElementById("map-actions");
  if (!box) return;
  box.classList.remove("compact", "no-room");
  const room = box.clientHeight;
  if (!room) return;                                  // ukryty (panel otwarty)
  const need = el => [...el.children].reduce((h, c) => h + c.offsetHeight + 8, -8);
  if (need(box) <= room) return;
  box.classList.add("compact");
  const one = box.firstElementChild?.offsetHeight || 0;
  if (one > room) box.classList.add("no-room");
}
addEventListener("resize", () => requestAnimationFrame(fitMapActions));

/* Chowane kafelki mapy (21.09.2026, próba): strzałka chowa je za prawą krawędź,
   dotknięcie paska albo strzałki wysuwa. Wybór zostaje na tym urządzeniu. */
(function kafelkiChowane() {
  const box = document.getElementById("map-actions");
  const btn = document.getElementById("btn-tiles");
  if (!box || !btn) return;
  const ustaw = (schowane) => {
    box.classList.toggle("schowane", schowane);
    btn.setAttribute("aria-expanded", String(!schowane));
    btn.title = schowane ? (UI.t("Pokaż przyciski mapy", "Show map buttons", "Показати кнопки мапи"))
                         : (UI.t("Schowaj przyciski mapy", "Hide map buttons", "Сховати кнопки мапи"));
    try { localStorage.setItem("straznik_kafelki_schowane", schowane ? "1" : "0"); } catch {}
  };
  let start = false;
  try { start = localStorage.getItem("straznik_kafelki_schowane") === "1"; } catch {}
  ustaw(start);
  btn.addEventListener("click", () => ustaw(!box.classList.contains("schowane")));
  // Schowany kafelek najpierw się wysuwa — dotknięcie paska nie może od razu przesunąć mapy.
  box.addEventListener("click", (e) => {
    if (!box.classList.contains("schowane") || e.target.closest("#btn-tiles")) return;
    if (e.target.closest(".map-btn")) { e.stopPropagation(); e.preventDefault(); ustaw(false); }
  }, true);
})();
/* Okno aktualizacji ma kończyć się POD górnym paskiem, a nie na nim.
   CSS liczył jego wysokość ze zmiennej --topbar-h, której nikt nie ustawia, więc
   zawsze zakładał pasek 52 px. Na wąskim telefonie pasek ma dwa rzędy przycisków
   i okno z dłuższą listą zmian wchodziło pod niego: tytuł znikał za ikonami,
   a przewinąć dało się tylko to, co wystawało z samego okna (zgłoszenie usera
   26.09.2026). Stos na dole jest przyklejony do dołu ekranu, a pod oknem są tylko
   atrybucja i zastrzeżenie — dolna krawędź okna nie zależy więc od jego wysokości
   i wystarczy odjąć od niej dół górnego paska. Resztę robi CSS: tekst przewija się
   w swoim wierszu, przyciski zostają widoczne.
   Pasek szukany po id, nie przez `topbarEl`: ta funkcja rusza już z obserwatora
   stosu, zanim niżej powstanie stała topbarEl. */
function dopasujOknoAktualizacji() {
  const el = document.getElementById("update-banner");
  const pasek = document.getElementById("topbar");
  if (!el || !pasek || el.classList.contains("hidden")) return;
  const r = el.getBoundingClientRect();
  if (!r.height) return;                 // schowane (np. otwarty panel) — policzymy, gdy wróci
  const gora = pasek.getBoundingClientRect().bottom + 10;
  // 170 px to tytuł, jedna linijka zmian i przyciski — mniej już się nie da czytać
  el.style.maxHeight = Math.max(170, Math.floor(r.bottom - gora)) + "px";
}

const stackEl = document.getElementById("bottom-stack");
if (stackEl && window.ResizeObserver) {
  const setStackH = () => { document.documentElement.style
    .setProperty("--stack-h", stackEl.offsetHeight + "px"); requestAnimationFrame(fitMapActions);
    dopasujOknoAktualizacji(); };
  new ResizeObserver(setStackH).observe(stackEl);
  setStackH();
}
/* Dół górnego paska: kolumna przycisków mapy nie może na niego wejść (duża czcionka
   systemowa + komunikat MiG-31K wypychały „mój region” na przyciski paska). */
const topbarEl = document.getElementById("topbar");
if (topbarEl && window.ResizeObserver) {
  const setTopbarB = () => { document.documentElement.style
    .setProperty("--topbar-bottom", Math.round(topbarEl.getBoundingClientRect().bottom) + "px");
    requestAnimationFrame(fitMapActions); dopasujOknoAktualizacji(); };
  new ResizeObserver(setTopbarB).observe(topbarEl);
  addEventListener("resize", setTopbarB);
  setTopbarB();
}

/* Atrybucja: (i) i okienko obok niego (przegląd UI 14.10.2026). Okienko jest
   otwarte przy starcie i znika po pięciu sekundach, przy pierwszym dotknięciu
   albo przewinięciu mapy, po „Zamknij” albo klawiszem Esc. (i) przełącza TYLKO
   okienko — pełna lista źródeł jest pod diodami. Zgodne z wytyczną OSMF
   („Interactive maps”), patrz komentarz w index.html. */
const attrEl = document.getElementById("attribution");
if (attrEl) {
  const przycisk = document.getElementById("attr-i");
  let odliczanie = null;
  const ustaw = (otwarta) => {
    attrEl.classList.toggle("otwarta", otwarta);
    przycisk?.setAttribute("aria-expanded", otwarta ? "true" : "false");
    if (!otwarta) { attrEl.classList.remove("odliczanie"); clearTimeout(odliczanie); odliczanie = null; }
  };
  const zamknij = () => ustaw(false);
  attrEl.classList.add("odliczanie");
  odliczanie = setTimeout(zamknij, 5000);
  przycisk?.addEventListener("click", () => {
    const otworz = !attrEl.classList.contains("otwarta");
    ustaw(otworz);                       // ponowne otwarcie zostaje, aż ktoś je zamknie
  });
  document.getElementById("attr-x")?.addEventListener("click", () => { zamknij(); przycisk?.focus(); });
  attrEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && attrEl.classList.contains("otwarta")) { zamknij(); przycisk?.focus(); }
  });
  /* Dotknięcie albo przewinięcie mapy zwija okienko (tak, jak pozwala OSMF) —
     także otwarte ręcznie: na mapie nic nie ma zostawać na stałe. */
  const mapaEl = document.getElementById("map");
  const ruchMapy = () => { if (attrEl.classList.contains("otwarta")) zamknij(); };
  mapaEl?.addEventListener("pointerdown", ruchMapy, { passive: true });
  mapaEl?.addEventListener("wheel", ruchMapy, { passive: true });
}

/* ── moduł schronienia (GROTA) ───────────────────────────────────────────────
   Strażnik mówi, że jest zagrożenie; GROTA pokazuje, dokąd iść.

   Interfejs uzgodniony z sesją Groty 21.09.2026: globalny `window.Grota` z
   `otworz()`, `ukryj()` i getterem `widoczny` — zwykłe skrypty, bez modułów ES.
   `grota/widok.js` jest jedynym punktem wejścia i sam dociąga resztę swoich plików.

   Wczytujemy go dopiero przy pierwszym wejściu: to kilkaset KB kodu i 11 MB punktów,
   a aplikacja alarmowa ma startować natychmiast. Pliki są tylko w aplikacji —
   strona ich nie ma, więc tam przycisku nie widać (app-only), a gdyby ktoś jednak
   wywołał otwarcie, dostanie komunikat zamiast pustego ekranu. */
let grotaLadowanie = null;
function wczytajGrote() {
  if (window.Grota) return Promise.resolve(window.Grota);
  if (!grotaLadowanie) {
    grotaLadowanie = new Promise((ok, zle) => {
      const s = document.createElement("script");
      s.src = "grota/widok.js";
      s.onload = () => (window.Grota ? ok(window.Grota)
                                     : zle(new Error("grota/widok.js nie wystawił window.Grota")));
      s.onerror = () => zle(new Error("nie udało się wczytać grota/widok.js"));
      document.head.appendChild(s);
    }).catch(e => { grotaLadowanie = null; throw e; });   // pozwól spróbować ponownie
  }
  return grotaLadowanie;
}
async function otworzGrote(opcje) {
  if (grotaWylaczona()) return;
  setPanel(false);
  if (moreSheet?.open) moreSheet.close();
  if (document.body.classList.contains("history-mode")) toggleHistory();
  try {
    (await wczytajGrote()).otworz(opcje);
  } catch (e) {
    console.warn("GROTA:", e);
    toast(UI.t("Wyszukiwanie schronień nie jest dostępne w tej wersji.", "Shelter finder is not available in this version.", "Пошук укриттів недоступний у цій версії."));
  }
}
/* Przy alarmie wczytujemy moduł i punkty w tle, zanim człowiek potwierdzi alarm:
   pierwsze otwarcie na telefonie 2 GB trwało 14 s, po przygotowaniu ~0,1 s.
   Tylko w aplikacji (strona nie ma plików Groty) i bez błędów na zewnątrz. */
function przygotujGrote() {
  if (!document.documentElement.classList.contains("native-app") || grotaWylaczona()) return;
  wczytajGrote().then(g => g.przygotuj?.()).catch(e => console.warn("GROTA przygotuj:", e));
}
/* Każde przejście gdzie indziej zatrzymuje mapę modułu — bez tego jej renderowanie
   zjadałoby procesor w tle, obok mapy Strażnika. */
function ukryjGrote() { window.Grota?.ukryj(); }

/* Dostępność przy otwartej GROCIE (przegląd UI 14.10.2026): moduł zakrywa cały
   ekran (z-index 60), ale czytnik widział pod nim cały Strażnik, a fokus zostawał
   na zakładce pod spodem. Gdy moduł jest widoczny, reszta strony dostaje inert
   (Chrome 102+) i aria-hidden (starsze WebView — czytnik i tak ją pomija). Poza
   tym zostają: alarm (leży NAD Grotą i musi działać), okna, komunikaty i pola
   aria-live. Fokus idzie na nagłówek zakładki modułu (#g-tytul, zaczep z eksportu
   a149d8b983), a po zamknięciu wraca na przycisk GROTA — chyba że człowiek
   przeszedł już gdzie indziej (np. dotknął innej zakładki). */
const GROTA_TLO_ZOSTAJE = new Set(["grota-widok", "alarm-overlay", "toast", "a11y-alert", "a11y-info"]);
function grotaTlo(wylacz) {
  for (const el of document.body.children) {
    if (GROTA_TLO_ZOSTAJE.has(el.id) || el.tagName === "DIALOG" || el.tagName === "SCRIPT"
        || el.tagName === "STYLE" || el.getAttribute("aria-live")) continue;
    if (wylacz) {
      if (el.hasAttribute("aria-hidden") && !el.dataset.grotaTlo) continue;   // już ukryty z innego powodu
      el.dataset.grotaTlo = "1";
      el.setAttribute("aria-hidden", "true");
      el.inert = true;
    } else if (el.dataset.grotaTlo) {
      delete el.dataset.grotaTlo;
      el.removeAttribute("aria-hidden");
      el.inert = false;
    }
  }
}
const grotaWidokEl = document.getElementById("grota-widok");
if (grotaWidokEl && window.MutationObserver) {
  let grotaBylaWidoczna = false;
  new MutationObserver(() => {
    const widoczna = !grotaWidokEl.hidden;
    if (widoczna === grotaBylaWidoczna) return;
    grotaBylaWidoczna = widoczna;
    grotaTlo(widoczna);
    if (widoczna) {
      /* Nagłówek powstaje w render() modułu: przy pierwszym otwarciu dopiero po
         wczytaniu modułu i punktów (na emulatorze ~6,5 s), a potem moduł przerysowuje
         panel jeszcze raz. Stałe opóźnienia trafiały na styk, więc patrzymy na samą
         treść modułu: przez 10 s od otwarcia każde przerysowanie, po którym fokus
         nie jest w module, oddaje go nagłówkowi. Dalej nie wchodzimy w drogę. */
      const naglowek = () => {
        if (grotaWidokEl.hidden || grotaWidokEl.contains(document.activeElement)) return;
        document.getElementById("g-tytul")?.focus({ preventScroll: true });
      };
      const obs = new MutationObserver(naglowek);
      obs.observe(grotaWidokEl, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 10000);
      naglowek();
    } else {
      const a = document.activeElement;
      if (!a || a === document.body || grotaWidokEl.contains(a))
        document.getElementById("btn-grota")?.focus({ preventScroll: true });
    }
  }).observe(grotaWidokEl, { attributes: true, attributeFilter: ["hidden"] });
}

/* ── dolne zakładki i menu „Więcej” ── */
const moreSheet = document.getElementById("more-sheet");
document.getElementById("btn-grota")?.addEventListener("click", () => otworzGrote());
document.documentElement.classList.toggle("grota-off", grotaWylaczona());   // ostatnia znana wartość, zanim przyjdzie stan
document.getElementById("tab-more")?.addEventListener("click", () => {
  if (moreSheet?.open) moreSheet.close(); else moreSheet?.showModal();
});
document.getElementById("tab-map")?.addEventListener("click", () => {
  ukryjGrote();
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
  const karta = document.getElementById("ac-card");
  /* Karta obiektu i strefy NIE jest „poza panelem": otwiera się z listy sygnałów
     (plakietki stref w karcie województwa), a leży poza elementem #panel. Bez tego
     wyjątku dotknięcie ✕ na karcie zamykało listę sygnałów — i to zanim doszedł
     właściwy klik, bo zwinięcie panelu przesuwało kartę spod palca, więc samo okno
     zostawało otwarte (zgłoszone 12.09.2026). */
  const wKarcie = karta && !karta.classList.contains("hidden") && path.includes(karta);
  if (!panel.classList.contains("collapsed") && !wKarcie
      && !path.includes(panel) && !path.includes(panelBtn)) setPanel(false);

  const legend = document.getElementById("legend");
  const legendBtn = document.getElementById("btn-legend");
  if (!legend.classList.contains("hidden") && !wKarcie
      && !path.includes(legend) && !path.includes(legendBtn)) {
    legend.classList.add("hidden");
    legendBtn.classList.remove("active");
  }

  if (karta && !karta.classList.contains("hidden") && !path.includes(karta)) hideCard();

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
setInterval(() => refreshZones(), 60000);   // strefy: własny TTL 4 min w środku
setInterval(pollState, 60000);   // siatka bezpieczeństwa, gdyby zegar odpytywania padł
setTimeout(checkForUpdate, 6000);   // po starcie, gdy mapa i dane są już w drodze
// Powrót aplikacji na wierzch traktujemy jak kolejne otwarcie — z odstępem,
// żeby krótkie przełączenie na inną aplikację nie odpytywało GitHuba za każdym razem.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  checkForUpdate(false, true);
  // Audyt C11: po dotknięciu powiadomienia aplikacja pokazywała do minuty stary
  // stan. Pobieramy go od razu i wznawiamy zerwane połączenie.
  pollOnce();          // świeży stan od razu, bez czekania na kolejny obieg
  if (IS_APP) refreshNativeSound();
  // W historii dziurę widać od razu na suwaku, więc uzupełniamy ją bez czekania
  // na kolejne wejście w tryb historii.
  if (histMode && !standalone && needSeed()) seedBundle().then(() => {
    const h = fetchHistory();
    histTimes = h?.times || [];
    paintTimeline(fetchTimeline());
    syncTbControls(histIdx());
  });
});
setTimeout(refreshBgWarning, 3500);
setInterval(refreshBgWarning, 60000);
setTimeout(maybeCheckFullScreenAfterUpdate, 5000);
setInterval(maybeCheckFullScreenAfterUpdate, 60000);

/* Region trzeba podać warstwie natywnej przy KAŻDYM starcie, nie tylko przy
   zapisie ustawień — od niego zależy subskrypcja tematu FCM. Kto wybrał
   województwo we wcześniejszej wersji i po aktualizacji nie zajrzał do ustawień,
   miał pusty region — a wtedy telefon subskrybował tylko cztery tematy
   przygraniczne i nie dostawał pusha o własnym województwie. */
/* Stan „Alarmy na tym telefonie” najpierw z pamięci natywnej: localStorage WebView
   zapisuje się z opóźnieniem i przy zamknięciu aplikacji wyłączenie ginęło, a start
   zapisywał telefon z powrotem do województwa (zgłoszenie 15.09.2026). Wersje do
   1.7.49 nie miały flagi natywnej — wtedy przenosimy do niej stan z localStorage. */
async function restoreAlertsOff() {
  const plugin = IS_APP ? BG() : null;
  if (!plugin?.status) return;
  try {
    const s = await plugin.status();
    if (s.alertsOffSet) {
      if (s.alertsOff) localStorage.setItem(ALERTS_OFF_KEY, "1");
      else localStorage.removeItem(ALERTS_OFF_KEY);
    }
  } catch {}
  const box = document.getElementById("set-alerts-on");
  if (box) box.checked = !alertsOff();
}
setTimeout(async () => { await restoreAlertsOff(); syncObservedRegions(); }, 2500);
if ("serviceWorker" in navigator && !IS_APP)
  navigator.serviceWorker.register("sw.js").catch(() => {});

/* Strażnik — WBUDOWANY silnik (tryb standalone, bez zewnętrznego backendu).
   Port logiki backendu do JS: kolektory Neptun/ADS-B/RSS/RCB + fuzja punktowa.
   Aktywny w aplikacji Android (Capacitor) lub gdy nie skonfigurowano adresu
   backendu. Żądania HTTP idą natywnie (CapacitorHttp omija CORS); w zwykłej
   przeglądarce bez backendu działają tylko źródła z otwartym CORS (Neptun, ADS-B).
   PAŻP niedostępny w standalone (brak API — patrz backend/pansa.py). */
"use strict";

const Engine = (() => {

/* ── konfiguracja (lustrzana wobec backend/app/config.py) ────────────────── */
// okno 60 min z wygaszaniem: pełna waga przez 30 min, potem liniowo do zera
const WINDOW_MIN = 60, FULL_MIN = 30, TH_ELEVATED = 2, TH_HIGH = 4, COOLDOWN_MIN = 10;
const HISTORY_H = 12;   // ile godzin trzymamy do przeglądania wstecz
const POINTS = { neptun_high: 3, neptun_medlow: 1.5, adsb_spike: 1, media_keywords: 2,
                 rcb_alert: 2, ua_alert_border: 1, baltic_context: 1, pansa_zone: 1 };
// Neptun ma wyższy limit niż reszta (każdy track to osobny fizyczny obiekt),
// ale nie nieograniczony — przy kilkudziesięciu obiektach suma i tak dawno
// przekroczyła próg alarmu, a trzycyfrowa punktacja psułaby czytelność skali.
const SOURCE_CAPS = { media: 2, rcb: 2, adsb: 1, pansa: 1, neptun: 8 };
const VOIVODESHIPS = ["lubelskie","podkarpackie","podlaskie","mazowieckie","świętokrzyskie",
  "małopolskie","warmińsko-mazurskie","łódzkie","śląskie","kujawsko-pomorskie","pomorskie",
  "zachodniopomorskie","lubuskie","wielkopolskie","dolnośląskie","opolskie"];
/* Propagacja kaskadowa (lustrzana kopia backendu): każdy kolejny krąg sąsiedztwa
   dostaje SPILLOVER_FACTOR tego, co poprzedni — 0.4, 0.16, 0.064… — licząc po
   najkrótszej drodze od źródła. Zdarzenie na wschodzie daje więc mocny sygnał
   w centrum i słabszy, ale niezerowy, na zachodzie. */
const SPILLOVER_FACTOR = 0.4, SPILLOVER_MIN = 2.0;
const SPILLOVER_MIN_CONTRIB = 0.1, SPILLOVER_MAX_DEPTH = 5;
const NEIGHBORS = {
  "dolnośląskie":["lubuskie","wielkopolskie","opolskie"],
  "kujawsko-pomorskie":["pomorskie","warmińsko-mazurskie","mazowieckie","łódzkie","wielkopolskie"],
  "lubelskie":["podkarpackie","świętokrzyskie","mazowieckie","podlaskie"],
  "lubuskie":["zachodniopomorskie","wielkopolskie","dolnośląskie"],
  "łódzkie":["mazowieckie","kujawsko-pomorskie","wielkopolskie","opolskie","śląskie","świętokrzyskie"],
  "małopolskie":["śląskie","świętokrzyskie","podkarpackie"],
  "mazowieckie":["warmińsko-mazurskie","podlaskie","lubelskie","świętokrzyskie","łódzkie","kujawsko-pomorskie"],
  "opolskie":["dolnośląskie","wielkopolskie","łódzkie","śląskie"],
  "podkarpackie":["małopolskie","świętokrzyskie","lubelskie"],
  "podlaskie":["warmińsko-mazurskie","mazowieckie","lubelskie"],
  "pomorskie":["zachodniopomorskie","wielkopolskie","kujawsko-pomorskie","warmińsko-mazurskie"],
  "śląskie":["opolskie","łódzkie","świętokrzyskie","małopolskie"],
  "świętokrzyskie":["łódzkie","mazowieckie","lubelskie","podkarpackie","małopolskie","śląskie"],
  "warmińsko-mazurskie":["pomorskie","kujawsko-pomorskie","mazowieckie","podlaskie"],
  "wielkopolskie":["zachodniopomorskie","pomorskie","kujawsko-pomorskie","łódzkie","opolskie","dolnośląskie","lubuskie"],
  "zachodniopomorskie":["pomorskie","wielkopolskie","lubuskie"],
};
/* Punktacja obiektów NEPTUN — lustrzana kopia config.py z backendu.
   Zagrożenie zależy od tego CO leci, ILE tego jest, JAK BLISKO i JAK PEWNA
   jest obserwacja, więc zamiast jednej stawki liczymy iloczyn czynników. */
const NEPTUN_TYPE_WEIGHTS = {
  ballistic: 3.0, mig31k: 2.6, cruise: 2.4, missile: 2.4,
  kab: 1.8, shahed: 1.4, uav: 1.1, recon: 0.5, fpv: 0.0,
};
const NEPTUN_DIST_BANDS = [[30, 1.6], [60, 1.3], [100, 1.0], [150, 0.55], [250, 0.25]];
const NEPTUN_MAX_KM = 250;
const NEPTUN_CONF_MULT = { high: 1.0, medium: 0.6, low: 0.35 };
const NEPTUN_LIFECYCLE_MULT = { confirmed: 1.1, uncertain: 0.85, created: 0.7 };
const NEPTUN_SOURCE_MULT = [[1, 0.7], [2, 0.9], [4, 1.1]];
const NEPTUN_SOURCE_MULT_MAX = 1.25;
const HEADING_TOL = 50;
const BORDER_POINTS = [
  [54.44,19.80,"warmińsko-mazurskie"],[54.35,20.60,"warmińsko-mazurskie"],
  [54.36,21.50,"warmińsko-mazurskie"],[54.34,22.79,"warmińsko-mazurskie"],
  [53.90,23.55,"podlaskie"],[53.51,23.65,"podlaskie"],[53.16,23.87,"podlaskie"],
  [52.70,23.87,"podlaskie"],[52.07,23.62,"lubelskie"],[51.75,23.55,"lubelskie"],
  [51.55,23.55,"lubelskie"],[51.18,23.80,"lubelskie"],[50.80,24.02,"lubelskie"],
  [50.58,24.05,"lubelskie"],[50.19,23.55,"podkarpackie"],[49.96,23.10,"podkarpackie"],
  [49.80,22.94,"podkarpackie"],[49.63,22.64,"podkarpackie"],[49.20,22.70,"podkarpackie"]];
const VOIV_BBOX = {
  "lubelskie":[50.25,21.60,52.30,24.15], "podkarpackie":[49.00,21.10,50.85,23.60],
  "podlaskie":[52.28,21.60,54.40,24.00], "warmińsko-mazurskie":[53.13,19.10,54.45,22.95]};
const UA_BORDER_OBLASTS = { "Волинська":["lubelskie"], "Львівська":["lubelskie","podkarpackie"],
  "Закарпатська":["podkarpackie"], "Рівненська":["lubelskie"] };
/* Klasyfikacja: CRITICAL sam wystarczy, inaczej potrzebna para AIR + EVENT.
   Lustrzana kopia backend/app/config.py — testy w scripts/test_textmatch.py. */
const CRITICAL = ["alarm powietrzny","zagrożenie z powietrza","zawyły syreny","zawyła syrena",
  "naruszenie przestrzeni powietrznej","naruszyła przestrzeń powietrzną",
  "naruszył przestrzeń powietrzną","obiekt powietrzny spadł","niezidentyfikowany obiekt",
  "zestrzelono dron","zestrzelono rakiet","poderwano myśliwce","poderwano lotnictwo",
  "schrony otwarte"];
const AIR = ["dron","bezzałogow","bsp","shahed","geran","rakiet","pocisk","ch-101","kalibr",
  "iskander","kab","bomb","myśliwc","mig-31","obiekt powietrzny","przestrzeni powietrznej",
  "przestrzeń powietrzną","obrona powietrzna","obiekt latając"];
const EVENT = ["spadł","spadła","spadło","eksploz","wybuch","zestrzel","przechwyc","poderwan",
  "naruszen","naruszył","naruszyła","wleciał","wtargn","uderzy","trafił","szczątki","atak",
  "ostrzał","zawył","alarm","ewakuac","schron","zagrożeni"];
const EXCLUDE = ["ćwiczeni","trening","test syren","próba syren","próby syren","głośna próba",
  "rocznic","upamiętni","minuta ciszy","wymian","modernizac","przetarg","inwestycj","zakup",
  "montaż","zamontow","instalac","rozbudow","dofinansow","dotacj","planowan","potrwa",
  "konserwac","remont","pojawią się","powstan","wdroż","komunikat głosowy",
  "system ostrzegania będzie","nowe syreny","nowych syren","pożar bloku","pożar domu",
  "pożar mieszkania","pożar lasu","wypadek drogow","kolizja","lpr lądował","śmigłowiec lpr",
  "utonię","potrąc","dachowa","karambol","zderzenie samochod"];
const B_CRITICAL = ["airspace violation","violated airspace","airspace was violated","air raid",
  "airspace closed","shot down a drone","scrambled jets","oro erdvės pažeid",
  "gaisa telpas pārkāp","õhuruumi rikku"];
const B_AIR = ["airspace","air space","drone","uav","missile","shahed","air defence","air defense",
  "oro erdv","bepilot","raket","gaisa telp","droon","õhuruum","military aircraft","fighter jet","jets"];
const B_EVENT = ["violat","intercept","shot down","scrambl","incursion","crash","fell","explos",
  "struck","entered","closed","alert","debris"];
const B_EXCLUDE = ["exercise","drill","training","anniversary","drone show","festival",
  "pratyb","mācīb","õppus","delivery drone","drone racing","photo drone"];
/* Kolejność ma znaczenie: dopasowanie kończy się na pierwszym trafieniu, więc
   nazwy zawierające się w innych (pomorskie ⊂ kujawsko-pomorskie) idą później.
   Świadomie pomijamy nazwy kolidujące ze słowami pospolitymi ("piła", "żary",
   "hel", "brzeg"). Lustrzana kopia VOIV_KEYWORDS z backendu. */
const VOIV_KEYWORDS = {
  "lubelskie":["lubelski","lublin","chełm","zamość","zamoś","biała podlask","hrubiesz",
    "włodaw","terespol","dorohusk","świdnik","puław","kraśnik","łęczn"],
  "podkarpackie":["podkarpack","rzeszów","rzeszow","przemyśl","przemysl","medyk","jarosław",
    "lubaczów","sanok","krosno","mielec","stalowa wol","tarnobrzeg"],
  // Białystok odmienia się nieregularnie (Białymstoku, Białegostoku)
  "podlaskie":["podlask","białystok","bialystok","białymstok","białegostok","suwałk",
    "suwalk","augustów","sokółk","kuźnic","siemiatycz","hajnówk","bielsk podlask","łomż"],
  "mazowieckie":["mazowieck","warszaw","radom","siedlc","płock","ostrołęk","pruszków",
    "legionow","otwock","żyrardów","ciechanów"],
  "warmińsko-mazurskie":["warmińsko","warminsko","olsztyn","elbląg","ełk","gołdap","braniew",
    "ostróda","iława","kętrzyn","giżyck","mrągow"],
  "świętokrzyskie":["świętokrzysk","swietokrzysk","kielc","ostrowiec świętokrzysk",
    "starachowic","skarżysk","sandomierz","końskie","jędrzejów","busko"],
  "małopolskie":["małopolsk","malopolsk","kraków","krakow","tarnów","nowy sącz","oświęcim",
    "zakopane","chrzanów","olkusz","bochni","wadowic"],
  "łódzkie":["łódzk","lodzk","łódź","piotrków trybunalsk","pabianic","bełchatów","sieradz",
    "kutno","zgierz","radomsk","tomaszów mazowieck","tomaszowie mazowieck",
    "tomaszowa mazowieck","skierniewic"],
  "śląskie":["śląski","slaski","katowic","częstochow","gliwic","sosnowiec","zabrze","bytom",
    "rybnik","bielsko-biał","tychy","chorzów","dąbrowa górnicz","jastrzębie","żywiec"],
  "kujawsko-pomorskie":["kujawsko","bydgoszcz","toruń","torun","włocławek","grudziądz",
    "inowrocław","brodnic","świecie","chełmn","chełmż"],
  "zachodniopomorskie":["zachodniopomorsk","szczecin","koszalin","kołobrzeg","świnoujści",
    "stargard","police","wałcz","gryfin"],
  "pomorskie":["woj. pomorsk","pomorskiego","gdańsk","gdansk","gdyni","sopot","słupsk",
    "tczew","malbork","wejherow","kaszub","kwidzyn","starogard gdańsk","chojnic","lębork","puck"],
  "lubuskie":["lubusk","zielona gór","zielonej gór","gorzów","gorzow","nowa sól",
    "świebodzin","międzyrzecz","słubic","sulechów"],
  "wielkopolskie":["wielkopolsk","poznań","poznan","kalisz","konin","leszno","gniezno",
    "ostrów wielkopolsk","piła wielkopolsk","swarzędz","śrem"],
  "dolnośląskie":["dolnośląsk","dolnoslask","wrocław","wroclaw","legnic","wałbrzych",
    "jelenia gór","lubin","głogów","świdnic","bolesławiec","oleśnic"],
  "opolskie":["opolsk","opole","opolu","kędzierzyn","nysa","kluczbork","prudnik",
    "strzelce opolsk","namysłów"]};
const RSS_FEEDS = [
  ["https://www.lublin112.pl/feed/","lubelskie"],
  ["https://radio.lublin.pl/feed/","lubelskie"],
  ["https://www.dziennikwschodni.pl/rss","lubelskie"],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podkarpackie&hl=pl&gl=PL&ceid=PL:pl","podkarpackie"],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podlaskie&hl=pl&gl=PL&ceid=PL:pl","podlaskie"],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20lubelskie&hl=pl&gl=PL&ceid=PL:pl","lubelskie"],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl","warmińsko-mazurskie"],
  // Ogólnopolski nasłuch bez domyślnego regionu — województwo rozpoznaje
  // VOIV_KEYWORDS. Jedno zapytanie pokrywa pozostałe 12 województw, zamiast
  // dokładać po osobnym kanale na każde.
  ["https://news.google.com/rss/search?q=(%22alarm%20powietrzny%22%20OR%20%22zawy%C5%82y%20syreny%22%20OR%20%22naruszenie%20przestrzeni%20powietrznej%22%20OR%20%22zestrzelono%20dron%22)&hl=pl&gl=PL&ceid=PL:pl", null]];
const BALTIC_FEEDS = [["https://news.err.ee/rss","EE"],["https://eng.lsm.lv/rss/","LV"],
  ["https://www.delfi.lt/rss/feeds/daily.xml","LT"]];
const BALTIC_TARGETS = ["podlaskie","warmińsko-mazurskie"];
const MAX_AGE_MS = 45*60*1000;

/* ── stan ────────────────────────────────────────────────────────────────── */
const tracks = new Map();          // Neptun tracks
let alertOblasts = new Set();
let adsbAircraft = [];
const health = { neptun:false, adsb:false, rcb:false, rss:{}, pansa:false };
/* Alarmy obwodów UA mają w aplikacji dwie niezależne drogi: WebSocket Neptuna
   (ramki `alerts`) i — gdy nasłuch w tle działa — REST-owy pośrednik po stronie
   usługi. Dioda „Alarmy UA" zapala się, gdy działa którakolwiek z nich, więc
   stan usługi doczytujemy z jej diagnostyki (patrz syncWithBackground). */
let bgUaAlertsOk = false;
let onState = null, ws = null, wsRetry = 1;
// bootstrap RCB uznany tylko po JAWNIE odnotowanym udanym przebiegu —
// wcześniej pusta lista "seen" zapisana przez inny kod myliła się z bootstrapem
// i stare, statyczne wpisy (np. "Stopnie alarmowe") punktowały jako nowe
let rcbBootstrapped = localStorage.getItem("eng_rcb_boot") === "1";
const rcbSeen = new Set(JSON.parse(localStorage.getItem("eng_rcb_seen") || "[]"));
let signals = JSON.parse(localStorage.getItem("eng_signals") || "[]");
const seenKeys = new Map(JSON.parse(localStorage.getItem("eng_seen") || "[]"));
/* Pamięć poziomów przeżywa zamknięcie aplikacji. Trzymana w RAM zerowała się
   przy każdym starcie, więc aplikacja „odkrywała" ponownie poziom, o którym
   usługa w tle dawno powiadomiła — i alarmowała drugi raz. Wyglądało to tak,
   jakby powiadomienia czekały na otwarcie aplikacji. */
let lastLevels = {}, lastNotif = {};
try {
  lastLevels = JSON.parse(localStorage.getItem("eng_levels") || "{}");
  lastNotif = JSON.parse(localStorage.getItem("eng_notif") || "{}");
} catch {}
function persistLevels() {
  try {
    localStorage.setItem("eng_levels", JSON.stringify(lastLevels));
    localStorage.setItem("eng_notif", JSON.stringify(lastNotif));
  } catch {}
}

function persist() {
  const cut = Date.now() - 24*3600*1000;
  signals = signals.filter(s => s.t > cut);
  for (const [k, t] of seenKeys) if (t < cut) seenKeys.delete(k);
  localStorage.setItem("eng_signals", JSON.stringify(signals));
  localStorage.setItem("eng_seen", JSON.stringify([...seenKeys]));
  localStorage.setItem("eng_rcb_seen", JSON.stringify([...rcbSeen].slice(-200)));
}

/* ── geo ─────────────────────────────────────────────────────────────────── */
const rad = d => d*Math.PI/180;
function haversine(a,b,c,d){const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b);
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*6371*Math.asin(Math.sqrt(x));}
function bearing(a,b,c,d){const p1=rad(a),p2=rad(c),dl=rad(d-b);
  const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;}
function assess(lat,lon,heading){
  let best=null;
  for(const [bl,bo,v] of BORDER_POINTS){const d=haversine(lat,lon,bl,bo);
    if(!best||d<best[0])best=[d,bl,bo,v];}
  const brg=bearing(lat,lon,best[1],best[2]);
  const diff=heading==null?999:Math.min(Math.abs(heading-brg)%360,360-Math.abs(heading-brg)%360);
  return {dist_km:Math.round(best[0]*10)/10, border_voiv:best[3],
          bearing_to_border:Math.round(brg), toward_pl:diff<=HEADING_TOL};
}
function voivForPoint(lat,lon){
  let hits=[];
  for(const [v,[a,b,c,d]] of Object.entries(VOIV_BBOX))
    if(lat>=a&&lat<=c&&lon>=b&&lon<=d)
      hits.push([haversine(lat,lon,(a+c)/2,(b+d)/2),v]);
  return hits.length?hits.sort((x,y)=>x[0]-y[0])[0][1]:null;
}

/* ── HTTP natywny (CapacitorHttp gdy dostępny — omija CORS) ──────────────── */
/* Nagłówki jak z przeglądarki: samo „Mozilla/5.0" bywa odrzucane przez serwisy
   filtrujące automaty (m.in. gov.pl), a te trzy pola wysyła każda przeglądarka.
   Dłuższy limit czasu, bo strony rządowe potrafią odpowiadać wolno. */
const HTTP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
};

async function httpGet(url) {
  const CH = window.Capacitor?.Plugins?.CapacitorHttp;
  if (CH) {
    const r = await CH.get({ url, headers: HTTP_HEADERS,
                             connectTimeout: 20000, readTimeout: 20000 });
    if (r.status >= 400) throw new Error("HTTP " + r.status);
    return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.text();
}

/* ── dopasowanie słów kluczowych (jak backend/textmatch.py) ──────────────── */
function matchKw(text, critical, air, event, exclude) {
  const tl = text.toLowerCase();
  if (exclude.some(k => tl.includes(k))) return [];
  const c = critical.filter(k => tl.includes(k));
  if (c.length) return c;
  const a = air.filter(k => tl.includes(k)), e = event.filter(k => tl.includes(k));
  return a.length && e.length ? a.slice(0, 2).concat(e.slice(0, 2)) : [];
}
/* Małe litery bez znaków diakrytycznych — ł nie rozkłada się w NFD, stąd osobna
   podmiana. Część źródeł pisze „Chelm" zamiast „Chełm". */
const fold = (s) => s.toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

const matchVoiv = (text) => {
  const tl = text.toLowerCase();
  /* Najdłuższe pasujące hasło, nie pierwsze: nazwy się zawierają — "Chełmno"
     (kujawsko-pomorskie) zawiera "chełm" (lubelskie), "Radomsko" (łódzkie)
     zawiera "radom" (mazowieckie). Dłuższe hasło jest bardziej szczegółowe.
     Porównujemy bez znaków diakrytycznych, bo część źródeł pisze bez ogonków. */
  const folded = fold(tl);
  let bestVoiv = null, bestLen = 0;
  for (const [v, keys] of Object.entries(VOIV_KEYWORDS))
    for (const k of keys) {
      const kf = fold(k);
      if (kf.length > bestLen && folded.includes(kf)) { bestVoiv = v; bestLen = kf.length; }
    }
  return bestVoiv;
};

/* Dioda źródła gaśnie dopiero po kilku nieudanych próbach z rzędu.
   Pojedynczy timeout albo zerwane połączenie zdarza się na mobilnym internecie
   stale — czerwona dioda przy działającym źródle niepokoiła bez powodu i kazała
   szukać awarii tam, gdzie jej nie było. */
const FAIL_TOLERANCE = 3;
const failCount = {};
function markHealth(src, ok) {
  if (ok) { failCount[src] = 0; health[src] = true; return; }
  failCount[src] = (failCount[src] || 0) + 1;
  if (failCount[src] >= FAIL_TOLERANCE) health[src] = false;
}
function markRss(url, ok) {
  const key = "rss:" + url;
  if (ok) { failCount[key] = 0; health.rss[url] = true; return; }
  failCount[key] = (failCount[key] || 0) + 1;
  if (failCount[key] >= FAIL_TOLERANCE) health.rss[url] = false;
}

/* ── fuzja ───────────────────────────────────────────────────────────────── */
function addSignal(source, eventType, voiv, points, title, details, key) {
  if (seenKeys.has(key)) return false;
  seenKeys.set(key, Date.now());
  // klucz zostaje przy sygnale: usługa w tle dostaje go przy scalaniu i po nim
  // rozpoznaje, że to samo zdarzenie już zna (patrz syncWithBackground)
  signals.push({ t: Date.now(), ts: new Date().toISOString(), source,
    event_type: eventType, voivodeship: voiv, points, title, details, key });
  persist();
  reevaluate();
  return true;
}

/* ── scalanie ze stanem usługi w tle ─────────────────────────────────────── */
/* Usługa i aplikacja liczyły dotąd z dwóch niezależnych zbiorów: usługa ze
   SharedPreferences, aplikacja z localStorage — a localStorage zapełnia się
   TYLKO wtedy, gdy aplikacja jest otwarta. Po godzinie zamknięcia okno 60 min
   siłą rzeczy było puste, więc pasek powiadomień pokazywał punkty, a aplikacja
   po otwarciu „0 pkt, brak sygnałów". Odkąd usługa działa, to ona ma komplet —
   aplikacja dociąga jej sygnały i scala po kluczu, tym samym, którego sama
   używa do deduplikacji, więc nic nie liczy się dwa razy. */
async function syncWithBackground() {
  const BG = window.Capacitor?.Plugins?.StraznikBackground;
  if (!BG?.signals) return;
  let res;
  try { res = await BG.signals(); } catch { bgUaAlertsOk = false; return; }
  if (!res || !res.enabled || !Array.isArray(res.signals)) { bgUaAlertsOk = false; return; }

  // Dioda „Alarmy UA": usługa czyta alarmy obwodowe z pośrednika REST i melduje
  // ich stan w diagnostyce („Alarmy UA✓"/„✕"). Aplikacja sama zna je tylko przez
  // WebSocket Neptuna — dlatego łączymy obie drogi przy zapalaniu diody (emit()).
  bgUaAlertsOk = /Alarmy UA✓/.test(res.diag || "");

  /* Najpierw w drugą stronę: sygnały, których usługa nie ma skąd wziąć
     (alarmy w obwodach UA idą tylko WebSocketem, a usługa czyta REST).
     Wysyłamy całe bieżące okno — deduplikacja po stronie usługi odsieje to,
     co już zna, a koszt to jedno przejście przez most raz na 30 s. */
  const cut = Date.now() - WINDOW_MIN * 60 * 1000;
  const mine = signals
    .filter(s => s.t >= cut && s.key && !s.from_background)
    .map(s => ({ key: s.key, source: s.source, voivodeship: s.voivodeship,
                 points: s.points, title: s.title, t: s.t }));
  if (mine.length && BG.pushSignals) {
    try { await BG.pushSignals({ signals: mine }); } catch {}
  }

  let added = 0;
  for (const s of res.signals) {
    if (!s || !s.key || seenKeys.has(s.key)) continue;
    if (!VOIVODESHIPS.includes(s.voivodeship)) continue;
    const pts = Number(s.points);
    if (!Number.isFinite(pts) || pts <= 0) continue;
    const t = Number(s.t) || Date.now();
    seenKeys.set(s.key, Date.now());
    signals.push({ t, ts: new Date(t).toISOString(), source: s.source,
      event_type: "bg_" + s.source, voivodeship: s.voivodeship, points: pts,
      title: s.title || "", details: { from_background: true },
      key: s.key, from_background: true });
    added++;
  }
  if (added) { persist(); reevaluate(); }
}

/* Województwa osiągalne z `src` wraz z odległością w krokach sąsiedztwa (BFS).
   Każde trafia na listę raz, po najkrótszej drodze — to ona decyduje o tym,
   jak bardzo sygnał osłabnie, zanim tam dotrze. */
function cascadeTargets(src) {
  const seen = new Set([src]);
  let frontier = [src];
  const out = [];
  for (let depth = 1; depth <= SPILLOVER_MAX_DEPTH; depth++) {
    const next = [];
    for (const node of frontier)
      for (const nb of NEIGHBORS[node] || []) {
        if (seen.has(nb)) continue;
        seen.add(nb); next.push(nb); out.push([nb, depth]);
      }
    if (!next.length) break;
    frontier = next;
  }
  return out;
}

function computeState() {
  const cut = Date.now() - WINDOW_MIN*60*1000;
  const per = {}; VOIVODESHIPS.forEach(v => per[v] = { score: 0, level: "none", signals: [] });
  const perSource = {};
  for (const s of signals.filter(s => s.t >= cut).sort((a,b) => a.t-b.t)) {
    // Number.isFinite: jedna zła wartość punktów zatruwałaby NaN-em całą sumę,
    // spillover i karty województw — lepiej pominąć sygnał niż zepsuć fuzję
    if (!(s.voivodeship in per) || !Number.isFinite(s.points) || s.points <= 0) continue;
    const k = s.voivodeship + "|" + s.source;
    const cap = SOURCE_CAPS[s.source];
    const already = perSource[k] || 0;
    let counted = cap == null ? s.points : Math.max(0, Math.min(cap - already, s.points));
    perSource[k] = already + s.points;
    const ageMin = (Date.now() - s.t) / 60000;
    const w = ageMin <= FULL_MIN ? 1
      : Math.max(0, 1 - (ageMin - FULL_MIN) / Math.max(WINDOW_MIN - FULL_MIN, 1));
    counted *= w;
    per[s.voivodeship].score += counted;
    per[s.voivodeship].signals.push({ ...s, counted_points: Math.round(counted*10)/10,
      weight: Math.round(w * 100) / 100 });
  }
  // propagacja kaskadowa do kolejnych kręgów sąsiedztwa (jak w backendzie)
  const base = {}; for (const [v, st] of Object.entries(per)) base[v] = st.score;
  for (const [src, score] of Object.entries(base)) {
    if (score < SPILLOVER_MIN) continue;
    for (const [nb, depth] of cascadeTargets(src)) {
      const spill = Math.round(score * Math.pow(SPILLOVER_FACTOR, depth) * 10) / 10;
      if (spill < SPILLOVER_MIN_CONTRIB) continue;
      const hop = depth === 1 ? "sąsiad" : `${depth}. krąg`;
      per[nb].score += spill;
      per[nb].signals.push({ t: Date.now(), ts: new Date().toISOString(),
        source: "spillover", event_type: "neighbour_spillover", voivodeship: nb,
        points: spill, counted_points: spill,
        title: `Przeniesienie z woj. ${src} (${score} pkt × ${SPILLOVER_FACTOR}^${depth}, ${hop})`,
        details: { from: src, from_score: score, depth } });
    }
  }
  for (const st of Object.values(per)) {
    st.score = Math.round(st.score*10)/10;
    st.level = st.score >= TH_HIGH ? "high" : st.score >= TH_ELEVATED ? "elevated" : "none";
    st.signals.reverse();
  }
  return { ts: new Date().toISOString(), window_min: WINDOW_MIN,
           thresholds: { elevated: TH_ELEVATED, high: TH_HIGH }, voivodeships: per };
}

async function notifyNative(title, body, high) {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try {
      // te same kanały, które tworzy usługa natywna (MonitorService) — inaczej
      // powiadomienie z otwartej aplikacji trafiało w kanał, który usługa kasuje,
      // i nie pokazywało się z właściwym dźwiękiem ani jako heads-up
      await LN.schedule({ notifications: [{ id: Date.now() % 2147483647, title, body,
        schedule: { at: new Date(Date.now() + 200) },
        channelId: high ? "straznik-high-v3" : "straznik-info-v3" }] });
      return;
    } catch (e) { console.warn("LocalNotifications:", e); }
  }
  if ("Notification" in window && Notification.permission === "granted")
    new Notification(title, { body });
}

const LEVEL_LABELS = { elevated: "PODWYŻSZONA UWAGA", high: "WYSOKI PRIORYTET" };
const PRIORITY_VOIVS = ["lubelskie","podkarpackie","podlaskie","warmińsko-mazurskie"];
/* Powiadamiamy o moim regionie; bez ustawionej lokalizacji — o przygranicznych.
   Bez tego filtra propagacja do sąsiadów zasypałaby telefon alertami o całym kraju. */
function shouldNotify(voiv) {
  const mine = localStorage.getItem("straznik_voiv");
  return mine ? voiv === mine : PRIORITY_VOIVS.includes(voiv);
}

/* Gdy nasłuch w tle działa, to on odpowiada za powiadomienia systemowe.
   Bez tego rozdziału oba silniki alarmowały niezależnie: użytkownik dostawał
   duplikaty albo — częściej — powiadomienie dopiero po otwarciu aplikacji,
   o zdarzeniu, które usługa zgłosiła znacznie wcześniej. Alarm w interfejsie
   (pełny ekran, syrena) pokazuje się niezależnie od tego ustawienia. */
let bgServiceOwnsAlerts = false;
async function refreshAlertOwnership() {
  try {
    const s = await window.Capacitor?.Plugins?.StraznikBackground?.status();
    bgServiceOwnsAlerts = !!(s?.enabled && s?.serviceAlive !== false);
  } catch { bgServiceOwnsAlerts = false; }
}

function reevaluate() {
  const st = computeState();
  for (const [voiv, s] of Object.entries(st.voivodeships)) {
    const prev = lastLevels[voiv] || "none";
    if (s.level !== prev) {
      const order = ["none","elevated","high"];
      if (order.indexOf(s.level) > order.indexOf(prev) && shouldNotify(voiv)
          && !bgServiceOwnsAlerts) {
        const ck = voiv + "|" + s.level;
        if (!lastNotif[ck] || Date.now() - lastNotif[ck] > COOLDOWN_MIN*60*1000) {
          lastNotif[ck] = Date.now();
          const brk = s.signals.slice(0,5).map(x => `• [${x.source}] ${x.title}`).join("\n");
          notifyNative(`${LEVEL_LABELS[s.level]}: woj. ${voiv} (${s.score} pkt)`,
            brk + "\nNIEOFICJALNE źródło — kieruj się syrenami/RCB/RSO.", s.level === "high");
        }
      }
      lastLevels[voiv] = s.level;
      persistLevels();
    }
  }
  emit();
}

/* ── kolektor: Neptun (WS bezpośrednio z telefonu) ───────────────────────── */
/* Punktacja obiektu — lustrzana kopia reguły z backendu:
   waga typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu. */
function distMult(km) {
  for (const [limit, mult] of NEPTUN_DIST_BANDS) if (km < limit) return mult;
  return 0;
}
function sourceMult(n) {
  for (const [limit, mult] of NEPTUN_SOURCE_MULT) if (n <= limit) return mult;
  return NEPTUN_SOURCE_MULT_MAX;
}
function scoreThreat(t, distKm) {
  const weight = NEPTUN_TYPE_WEIGHTS[(t.type || "").toLowerCase()] || 0;
  if (weight <= 0 || distKm >= NEPTUN_MAX_KM) return 0;
  const count = Math.max(parseInt(t.count) || 1, 1);
  const conf = (t.confidenceLevel || "low").toLowerCase();
  const life = (t.lifecycle || "uncertain").toLowerCase();
  const sources = Math.max(parseInt(t.sourceCount) || 1, 1);
  const p = weight * Math.sqrt(count) * distMult(distKm)
    * (NEPTUN_CONF_MULT[conf] ?? 0.35) * sourceMult(sources)
    * (NEPTUN_LIFECYCLE_MULT[life] ?? 0.85);
  return Math.round(p * 100) / 100;
}

function neptunEval(t) {
  if (t.lat == null) return t;
  t.pl_assessment = assess(t.lat, t.lon, t.heading);
  const a = t.pl_assessment, ty = (t.type||"").toLowerCase();
  if (a.toward_pl) {
    const points = scoreThreat(t, a.dist_km);
    if (points > 0) {
      const count = Math.max(parseInt(t.count) || 1, 1);
      const conf = (t.confidenceLevel||"low").toLowerCase();
      const sources = Math.max(parseInt(t.sourceCount) || 1, 1);
      const ile = count > 1 ? `${count}× ` : "";
      // poziom w kluczu: gdy obiekt się zbliży lub zyska potwierdzenia,
      // sygnał wchodzi ponownie z wyższą punktacją
      const tier = Math.floor(points * 2);
      addSignal("neptun", "neptun_threat", a.border_voiv, points,
        `${ile}${t.title||ty} kursem na granicę PL, ${a.dist_km} km (woj. ${a.border_voiv}, `
        + `confidence: ${conf}, ${sources} potwierdzeń, ±${t.uncertaintyKm??"?"} km)`,
        { track_id: t.id, dist_km: a.dist_km, count, source_count: sources },
        `neptun:${t.id}:t${tier}`);
    }
  }
  return t;
}
function neptunAlerts(data) {
  const names = new Set();
  for (const it of (data?.oblasts||[]))
    names.add(typeof it === "string" ? it : (it?.name||it?.region||it?.title||""));
  const active = new Set();
  for (const n of names) for (const [ob, voivs] of Object.entries(UA_BORDER_OBLASTS))
    if (n.includes(ob)) {
      active.add(ob);
      if (!alertOblasts.has(ob)) {
        const hk = new Date().toISOString().slice(0,13);
        for (const v of voivs)
          addSignal("neptun","ua_alert_border",v,POINTS.ua_alert_border,
            `Alarm powietrzny w obwodzie ${ob} (graniczy z woj. ${v})`,{oblast:ob},
            `neptun_alert:${ob}:${v}:${hk}`);
      }
    }
  alertOblasts = active;
}
function startNeptun() {
  try { ws = new WebSocket("wss://neptun.in.ua/api/v1/stream"); } catch { return retryNeptun(); }
  ws.onopen = () => { markHealth("neptun", true); wsRetry = 1; emit(); };
  ws.onmessage = (e) => {
    let env; try { env = JSON.parse(e.data); } catch { return; }
    if (env.type === "snapshot") { tracks.clear();
      for (const t of env.data?.threats||[]) tracks.set(t.id, neptunEval(t)); }
    else if (env.type === "upsert") tracks.set(env.data.id, neptunEval(env.data));
    else if (env.type === "remove") tracks.delete(env.data?.id);
    else if (env.type === "alerts") neptunAlerts(env.data);
    emit();
  };
  ws.onclose = ws.onerror = () => { markHealth("neptun", false); retryNeptun(); };
}
function retryNeptun() {
  if (ws) { ws.onclose = ws.onerror = null; try { ws.close(); } catch {} ws = null; }
  setTimeout(startNeptun, Math.min(wsRetry*1000, 30000));
  wsRetry = Math.min(wsRetry*2, 30);
}

/* ── kolektor: ADS-B ─────────────────────────────────────────────────────── */
async function tickAdsb() {
  try {
    /* airplanes.live wzbogaca rekordy o pełną nazwę typu (desc), operatora (ownOp)
       i rok — adsb.lol tego nie zwraca, a to właśnie te pola robią różnicę w karcie
       samolotu. Dlatego pytamy najpierw jego, a adsb.lol zostaje zapasem. Oba mają
       ten sam format /v2/mil, więc reszta kodu się nie zmienia. */
    let txt = null;
    for (const u of ["https://api.airplanes.live/v2/mil", "https://api.adsb.lol/v2/mil"]) {
      try { txt = await httpGet(u); if (txt) break; } catch {}
    }
    if (!txt) throw new Error("brak odpowiedzi ADS-B");
    const ac = (JSON.parse(txt).ac||[]);
    const per = {}; Object.keys(VOIV_BBOX).forEach(v => per[v] = []);
    adsbAircraft = [];
    for (const a of ac) {
      if (a.lat == null) continue;
      const v = voivForPoint(a.lat, a.lon);
      // Punktujemy tylko województwa priorytetowe, ale POKAZUJEMY całą wschodnią
      // flankę: Bałtyk, Kaliningrad, Białoruś, kraje bałtyckie (LT/LV/EE), Ukrainę
      // i Rumunię — po to, żeby obce (RU/BY) maszyny nad tym regionem trafiały do
      // warstwy obserwacyjnej (patrz D w app.js). To tylko podgląd, nie punktacja.
      const inWatch = a.lat >= 43 && a.lat <= 61 && a.lon >= 14 && a.lon <= 42;
      if (!v && !inWatch) continue;
      // pełniejszy zestaw pól — karta samolotu pokazuje to, co airplanes.live
      const p = { hex:a.hex, callsign:(a.flight||"").trim(), type:a.t, lat:a.lat, lon:a.lon,
                  alt:a.alt_baro, alt_geom:a.alt_geom, gs:a.gs, tas:a.tas, ias:a.ias, mach:a.mach,
                  track:a.track, true_heading:a.true_heading, mag_heading:a.mag_heading,
                  vr: a.baro_rate ?? a.geom_rate, squawk:a.squawk, voivodeship:v, desc:a.desc,
                  reg:a.r, op:a.ownOp, cat:a.category, vr_src:a.baro_rate!=null?"baro":"geom",
                  year:a.year, dbflags:a.dbFlags, nav_modes:a.nav_modes, nav_qnh:a.nav_qnh,
                  nav_alt:a.nav_altitude_mcp, wd:a.wd, ws:a.ws, oat:a.oat, tat:a.tat,
                  rssi:a.rssi, messages:a.messages, seen:a.seen, version:a.version,
                  source:(a.mlat&&a.mlat.length)?"MLAT":(a.tisb&&a.tisb.length)?"TIS-B":"ADS-B" };
      if (v && per[v]) per[v].push(p);
      adsbAircraft.push(p);
    }
    const samples = JSON.parse(localStorage.getItem("eng_adsb") || "[]");
    const now = Date.now();
    const nowHour = new Date(now).getUTCHours();
    for (const [v, planes] of Object.entries(per)) {
      samples.push([now, v, planes.length]);
      const weekAll = samples.filter(s => s[1] === v && now - s[0] < 7*24*3600*1000);
      /* Porównujemy z TĄ SAMĄ porą doby: średnia dobowa myliłaby noc z dniem,
         przez co każde normalne popołudnie wyglądałoby jak anomalia. Gdy dla
         tej godziny nie ma jeszcze próbek, schodzimy do średniej dobowej. */
      const sameHour = weekAll.filter(s => new Date(s[0]).getUTCHours() === nowHour);
      const week = sameHour.length ? sameHour : weekAll;
      const baseline = week.reduce((a,s) => a+s[2], 0) / Math.max(week.length, 1);
      if (baseline > 0 && planes.length >= 3 && planes.length > 2*baseline) {
        addSignal("adsb","adsb_spike",v,POINTS.adsb_spike,
          `ADS-B: ${planes.length} maszyn wojskowych nad woj. ${v} (baseline 7d: ${baseline.toFixed(1)})`,
          {count:planes.length}, `adsb:${v}:${new Date().toISOString().slice(0,13)}`);
      }
    }
    localStorage.setItem("eng_adsb",
      JSON.stringify(samples.filter(s => now - s[0] < 14*24*3600*1000)));
    markHealth("adsb", true);
  } catch (e) { markHealth("adsb", false); }
  emit();
}

/* ── kolektor: RSS (PL + bałtyckie) ──────────────────────────────────────── */
function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  return [...doc.querySelectorAll("item, entry")].map(it => ({
    title: it.querySelector("title")?.textContent || "",
    link: it.querySelector("link")?.getAttribute("href") || it.querySelector("link")?.textContent || "",
    desc: it.querySelector("description, summary, content")?.textContent || "",
    date: it.querySelector("pubDate, published, updated")?.textContent || "",
  }));
}
async function tickRss() {
  for (const [url, defVoiv] of RSS_FEEDS) {
    try {
      const items = parseFeed(await httpGet(url));
      markRss(url, true);
      for (const it of items.slice(0,30)) {
        const age = it.date ? Date.now() - new Date(it.date).getTime() : 0;
        if (age > MAX_AGE_MS) continue;
        const text = it.title + " " + it.desc;
        const hits = matchKw(text, CRITICAL, AIR, EVENT, EXCLUDE);
        if (!hits.length) continue;
        const voiv = matchVoiv(text) || defVoiv;
        addSignal("media","media_keywords",voiv,POINTS.media_keywords,
          `Media: „${it.title.slice(0,120)}”`, {link:it.link, keywords:hits},
          "media:" + (it.link || it.title));
      }
    } catch { markRss(url, false); }
  }
  for (const [url, country] of BALTIC_FEEDS) {
    try {
      const items = parseFeed(await httpGet(url));
      markRss(url, true);
      for (const it of items.slice(0,30)) {
        const age = it.date ? Date.now() - new Date(it.date).getTime() : 0;
        if (age > MAX_AGE_MS) continue;
        const hits = matchKw(it.title + " " + it.desc, B_CRITICAL, B_AIR, B_EVENT, B_EXCLUDE);
        if (!hits.length) continue;
        for (const v of BALTIC_TARGETS)
          addSignal("media","baltic_context",v,POINTS.baltic_context,
            `Media ${country}: „${it.title.slice(0,110)}”`, {link:it.link},
            `baltic:${it.link||it.title}:${v}`);
      }
    } catch { markRss(url, false); }
  }
  emit();
}

/* ── kolektor: RCB ───────────────────────────────────────────────────────── */
async function tickRcb() {
  try {
    const html = await httpGet("https://www.gov.pl/web/rcb");
    markHealth("rcb", true);
    const re = /href="(\/web\/rcb\/[a-z0-9-]{8,})"[^>]*>([\s\S]*?)<\/a>/gi;
    let m, found = [];
    while ((m = re.exec(html)) && found.length < 20) {
      const title = m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      if (title.length >= 8) found.push([m[1], title]);
    }
    for (const [href, title] of found) {
      // ta sama reguła co dla mediów: mocne słowo albo ≥2 słabe — pojedyncze
      // "alarm" łapało statyczną podstronę "Stopnie alarmowe"
      if (!matchKw(title, CRITICAL, AIR, EVENT, EXCLUDE).length) continue;
      if (!rcbBootstrapped) { rcbSeen.add(href); continue; }
      if (rcbSeen.has(href)) continue;
      rcbSeen.add(href);
      const voivs = (() => { const v = matchVoiv(title);
        return v ? [v] : ["lubelskie","podkarpackie","podlaskie","warmińsko-mazurskie"]; })();
      for (const v of voivs)
        addSignal("rcb","rcb_alert",v,POINTS.rcb_alert,`RCB: „${title.slice(0,120)}”`,
          {url:"https://www.gov.pl"+href}, `rcb:${href}:${v}`);
    }
    rcbBootstrapped = true;
    localStorage.setItem("eng_rcb_boot", "1");
    persist();
  } catch { markHealth("rcb", false); }
  emit();
}

/* ── kolektor: PAŻP (AUP/UUP — publiczny GeoJSON mapy airspace.pansa.pl) ── */
let voivPolys = null;
/* Zbiór stref z poprzedniego obiegu MUSI przeżyć zamknięcie aplikacji: sygnałem
   jest POJAWIENIE SIĘ nowej strefy, nie jej trwanie. Trzymany dotąd w RAM
   zerował się przy każdym starcie, więc pierwszy obieg tylko zapamiętywał stan,
   a strefa aktywowana przy zamkniętej aplikacji nigdy nie wchodziła do
   punktacji. Usługa w tle zapisuje to samo trwale (Sources.pansa) — stąd brał
   się rozjazd: pasek powiadomień pokazywał punkt za strefę PAŻP, a aplikacja
   po otwarciu zero. */
const PANSA_ZONES_KEY = "eng_pansa_zones";
function loadPrevZones() {
  const raw = localStorage.getItem(PANSA_ZONES_KEY);
  if (raw == null) return null;             // nigdy nie było obiegu → bootstrap
  try { return new Set(JSON.parse(raw)); } catch { return null; }
}
function savePrevZones(zones) {
  try { localStorage.setItem(PANSA_ZONES_KEY, JSON.stringify([...zones])); } catch {}
}
async function loadVoivPolys() {
  if (voivPolys) return voivPolys;
  const gj = await (await fetch("assets/wojewodztwa.geojson")).json();
  voivPolys = gj.features.map(f => [f.properties.nazwa,
    f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates]);
  return voivPolys;
}
function ringHas(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function voivAtPoint(lon, lat) {
  for (const [name, polys] of voivPolys || [])
    for (const poly of polys)
      if (ringHas(poly[0], lon, lat) && !poly.slice(1).some(h => ringHas(h, lon, lat)))
        return name;
  return null;
}
async function tickPansa() {
  try {
    await loadVoivPolys();
    let feats = null;
    for (const u of ["https://airspace.pansa.pl/map-configuration/uup",
                     "https://airspace.pansa.pl/map-configuration/aup"]) {
      try {
        const d = JSON.parse(await httpGet(u));
        if (Array.isArray(d) && d.length) { feats = d; break; }
      } catch {}
    }
    if (!feats) { markHealth("pansa", false); return emit(); }
    markHealth("pansa", true);
    const now = Date.now(), active = new Map();
    for (const f of feats) {
      const p = f.properties || {}, dz = p.designator;
      if (!dz) continue;
      const res = (p.airspaceReservations || []).find(r => {
        const s = Date.parse(r.startDate), e = Date.parse(r.endDate);
        return s && e && now >= s && now <= e &&
               (r.reservationStatus || "").toUpperCase() !== "CANCELLED";
      });
      if (!res) continue;
      const c = (p.centroid || [])[0];
      if (!c || c.x == null) continue;
      const voiv = voivAtPoint(c.x, c.y);
      if (!voiv) continue;
      active.set(dz, { voiv, type: p.airspaceElementType, lower: res.lowerAltitude,
        upper: res.upperAltitude, remarks: res.remarks, end: res.endDate });
    }
    const prevZones = loadPrevZones();
    if (prevZones) {
      for (const [dz, info] of active) {
        if (prevZones.has(dz) || !PRIORITY_VOIVS.includes(info.voiv)) continue;
        addSignal("pansa","pansa_zone",info.voiv,POINTS.pansa_zone,
          `PAŻP: aktywacja strefy ${(info.type||"")} ${dz} nad woj. ${info.voiv} `
          + `(${info.lower}–${info.upper}${info.remarks ? ", " + info.remarks : ""})`,
          { designator: dz, ...info }, `pansa:${dz}:${info.end}`);
      }
    }
    savePrevZones(active.keys());
  } catch (e) { markHealth("pansa", false); }
  emit();
}

/* ── emisja stanu (ten sam kształt co backend build_state) ───────────────── */
let emitPending = false;
function emit() {
  if (!onState || emitPending) return;
  emitPending = true;
  setTimeout(() => {
    emitPending = false;
    onState({
      fusion: computeState(),
      neptun: { status: { connected: health.neptun, mode: "app-ws" },
        threats: [...tracks.values()], alert_oblasts: [...alertOblasts] },
      adsb: { aircraft: adsbAircraft, counts: {}, baselines: {} },
      // ua_alerts nie jest osobnym kolektorem po stronie aplikacji: przychodzą
      // WebSocketem Neptuna (transport = health.neptun) albo z usługi w tle.
      health: { ...health, ua_alerts: health.neptun || bgUaAlertsOk },
      engine: "standalone",
    });
  }, 1500);
}

/* ── historia 12 h (migawki co 2 min w localStorage) ─────────────────────── */
function saveSnapshot() {
  try {
    const snaps = JSON.parse(localStorage.getItem("eng_snaps") || "[]");
    snaps.push({ ts: new Date().toISOString(), t: Date.now(),
      threats: [...tracks.values()].filter(t => t.lat != null).map(t => ({
        id: t.id, type: t.type, lat: +t.lat.toFixed(3), lon: +t.lon.toFixed(3),
        heading: t.heading, confidenceLevel: t.confidenceLevel,
        uncertaintyKm: t.uncertaintyKm, region: t.region, locality: t.locality,
        sourceCount: t.sourceCount, destination: t.destination,
        pl_assessment: t.pl_assessment })),
      aircraft: adsbAircraft.map(a => ({ hex: a.hex, callsign: a.callsign, type: a.type,
        lat: +a.lat.toFixed(3), lon: +a.lon.toFixed(3), alt: a.alt, gs: a.gs,
        track: a.track, voivodeship: a.voivodeship, desc: a.desc, cat: a.cat })),
    });
    const cut = Date.now() - HISTORY_H * 3600 * 1000;
    const kept = snaps.filter(s => s.t > cut);
    localStorage.setItem("eng_snaps", JSON.stringify(kept));
  } catch (e) {
    // przepełniony localStorage — przytnij historię do połowy i próbuj dalej
    try {
      const snaps = JSON.parse(localStorage.getItem("eng_snaps") || "[]");
      localStorage.setItem("eng_snaps", JSON.stringify(snaps.slice(-Math.floor(snaps.length / 2))));
    } catch {}
  }
}

/* API historii dla UI — ten sam kształt co /api/history w backendzie */
function history(atIso) {
  const snaps = JSON.parse(localStorage.getItem("eng_snaps") || "[]");
  const times = snaps.map(s => s.ts);
  if (!atIso) return { times, hours: HISTORY_H };
  const at = Date.parse(atIso);
  let snap = null;
  for (const s of snaps) if (s.t <= at) snap = s;
  if (!snap) snap = snaps[0] || null;
  const end = snap ? snap.t : at;
  const start = end - WINDOW_MIN * 60000;
  return { times, at: atIso, snapshot: snap,
    signals: signals.filter(s => s.t >= start && s.t <= end).sort((a, b) => b.t - a.t) };
}

/* Oś czasu do pokolorowania suwaka: najwyższy wynik w kraju dla każdej migawki. */
function timeline() {
  const snaps = JSON.parse(localStorage.getItem("eng_snaps") || "[]");
  return snaps.map(s => {
    const per = {};
    for (const sig of signals) {
      const age = (s.t - sig.t) / 60000;
      if (age < 0 || age > WINDOW_MIN || sig.points <= 0 || !sig.voivodeship) continue;
      const w = age <= FULL_MIN ? 1
        : Math.max(0, 1 - (age - FULL_MIN) / Math.max(WINDOW_MIN - FULL_MIN, 1));
      per[sig.voivodeship] = (per[sig.voivodeship] || 0) + sig.points * w;
    }
    const entries = Object.entries(per);
    const best = entries.length ? entries.reduce((a, b) => a[1] >= b[1] ? a : b) : null;
    const score = best ? Math.round(best[1] * 10) / 10 : 0;
    return { ts: s.ts, score, voiv: best ? best[0] : null,
      level: score >= TH_HIGH ? "high" : score >= TH_ELEVATED ? "elevated" : "none" };
  });
}

/* ── start ───────────────────────────────────────────────────────────────── */
async function start(stateCb) {
  onState = stateCb;
  // kto odpowiada za powiadomienia: usługa w tle czy silnik w aplikacji
  await refreshAlertOwnership();
  setInterval(refreshAlertOwnership, 60000);
  // sygnały usługi wczytujemy PRZED własnymi kolektorami — inaczej pierwsze
  // sekundy po otwarciu aplikacji pokazywałyby zero mimo alertu na pasku
  await syncWithBackground();
  setInterval(syncWithBackground, 30000);
  // Tuż po otwarciu WebView mógł być długo uśpiony: pasek powiadomień (usługa)
  // ma komplet, a aplikacja dopiero się dolicza — stąd „punkty różnią się przez
  // chwilę, potem się wyrównują". Kilka szybkich scaleń na starcie skraca ten
  // rozjazd z ~30 s (odstęp pętli) do kilku sekund.
  setTimeout(syncWithBackground, 3000);
  setTimeout(syncWithBackground, 10000);
  // Powrót do aplikacji z tła: dociągnij, co usługa zebrała, i odśwież wygaszanie
  // okna — bez tego po odblokowaniu telefonu widać jeszcze stan sprzed uśpienia.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    reevaluate();
    syncWithBackground();
  });
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    // Kanały tworzy wyłącznie strona natywna (MonitorService.createChannels
    // z MainActivity.onCreate): ma właściwe ważności, wibracje i własne dźwięki
    // (alert_uwaga / alarm_syrena), a przy okazji kasuje stare kanały. Silnik
    // celowo ich NIE tworzy — inaczej odtwarzał skasowane „straznik-high/info"
    // i użytkownik widział w ustawieniach zbędne, nieużywane kanały.
    try { await LN.requestPermissions(); } catch (e) { console.warn(e); }
  } else if ("Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission(); } catch {}
  }
  startNeptun();
  tickAdsb(); setInterval(tickAdsb, 60000);
  tickRss(); setInterval(tickRss, 60000);
  tickRcb(); setInterval(tickRcb, 180000);   // 3 min: alerty RCB nie zmieniają się częściej
  tickPansa(); setInterval(tickPansa, 300000);
  setInterval(reevaluate, 30000);   // wygasanie okna bez nowych zdarzeń
  setTimeout(saveSnapshot, 20000);
  setInterval(saveSnapshot, 120000);
}

return { start, history, timeline };
})();

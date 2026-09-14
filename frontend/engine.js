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
const ETA_BUFFER_MIN = 2.5, ETA_ELEVATED_MIN = 10, ETA_HIGH_MIN = 5, ETA_MIN_SOURCES = 2;
const HISTORY_H = 12;   // ile godzin trzymamy do przeglądania wstecz
const POINTS = { neptun_high: 3, neptun_medlow: 1.5, media_keywords: 0.5, media_critical: 1,
                 adsb_spike: 0, rcb_alert: 2, ua_alert_border: 1, baltic_context: 1, baltic_alert: 0.3, pansa_zone: 0.5,
                 pansa_zone_north: 1 };
// Neptun ma wyższy limit niż reszta (każdy track to osobny fizyczny obiekt),
// ale nie nieograniczony — przy kilkudziesięciu obiektach suma i tak dawno
// przekroczyła próg alarmu, a trzycyfrowa punktacja psułaby czytelność skali.
// Alarmy obwodowe UA to JEDNA informacja, nie kilka niezależnych potwierdzeń:
// bez własnego limitu trzy obwody naraz dawały 3,0 pkt i żółty bez żadnego obiektu.
const SOURCE_CAPS = { media: 1, rcb: 2, adsb: 1, pansa: 1, neptun: 8, ua_alert: 1 };
const VOIVODESHIPS = ["lubelskie","podkarpackie","podlaskie","mazowieckie","świętokrzyskie",
  "małopolskie","warmińsko-mazurskie","łódzkie","śląskie","kujawsko-pomorskie","pomorskie",
  "zachodniopomorskie","lubuskie","wielkopolskie","dolnośląskie","opolskie"];
/* Propagacja kaskadowa (lustrzana kopia backendu): każdy kolejny krąg sąsiedztwa
   dostaje SPILLOVER_FACTOR tego, co poprzedni — 0.4, 0.16, 0.064… — licząc po
   najkrótszej drodze od źródła. Regionalne Alerty RCB/RSO nie wchodzą do tej
   podstawy: ich obszar wskazuje już oficjalny nadawca. */
const SPILLOVER_FACTOR = 0.4, SPILLOVER_MIN = 2.0;
const SPILLOVER_MIN_CONTRIB = 0.1, SPILLOVER_MAX_DEPTH = 5;
/* Kiedy BUDZIMY TELEFON — lustro config.ALERT_* i fusion.alert_level. Kolor mapy
   liczy się z wyniku łącznego, powiadomienie wymaga punktów własnych, a
   przeniesienie domyka najwyżej jeden stopień ponad nie (13.09.2026). */
const ALERT_OWN_MIN = 1.0, ALERT_REPEAT_QUIET_MIN = 60;   // bez marginesu przy zejściu
/* Po odwołaniu alertu RCB/RSO artykuły o alarmie to relacja z przeszłości. */
const RSO_CLEAR_MEDIA_ECHO_MIN = 240;
const RSO_CLEAR_ECHO_MARKERS = ["syren", "alert", "alarm", "rcb"];
/* Bez wyjątków — lustro config.RSO_CLEAR_NOT_ECHO_MARKERS (13.09.2026 wyjątki
   przepuściły fałszywy żółty). Lista zostaje, żeby obie strony miały ten sam kształt. */
const RSO_CLEAR_NOT_ECHO_MARKERS = [];
const RCB_RELAY_WINDOW_MS = 45*60*1000;
const RELAY_STOP = new Set(["alert","rcb","uwaga","media","woj","wojewodztwo",
  "sytuacja","monitorowana","terenie","teren","oraz","jest","przez","dla",
  "polskie","polski","polska","ktory","ktora","ktore","przed"]);
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
const NEPTUN_TYPE_LABELS_PL = {
  uav:"Dron / BpSP", shahed:"Dron Shahed", fpv:"Dron FPV (lokalny)",
  missile:"Rakieta manewrująca", cruise:"Rakieta manewrująca",
  ballistic:"Rakieta balistyczna", kab:"Kierowana bomba lotnicza (KAB)",
  mig31k:"MiG-31K (nosiciel)", recon:"Dron rozpoznawczy"
};
const neptunTypeLabelPL = (type) => NEPTUN_TYPE_LABELS_PL[String(type||"").toLowerCase()]
  || "Obiekt powietrzny";
/* Krzywa odległości interpolowana liniowo (lustro NEPTUN_DIST_CURVE): półki
   dawały skok 99→101 km (×1,0 → ×0,55) i sklejały 30 km z 59 km. */
const NEPTUN_DIST_CURVE = [[0,1.7],[15,1.6],[45,1.3],[80,1.0],[110,0.7],[150,0.4],[200,0.25],[250,0.10]];
/* Podłoga dla ciężkich obiektów tuż przy granicy (lustro NEPTUN_NEAR_FLOOR_*). */
const NEAR_FLOOR_KM = 60, NEAR_FLOOR_SOURCES = 2, NEAR_FLOOR_POINTS = 2.0;
const NEAR_FLOOR_TYPES = ["ballistic", "mig31k", "cruise", "missile"];
const NEPTUN_MAX_KM = 250;
const NEPTUN_CONF_MULT = { high: 1.0, medium: 0.6, low: 0.35 };
const NEPTUN_LIFECYCLE_MULT = { confirmed: 1.1, uncertain: 0.85, created: 0.7 };
const NEPTUN_SOURCE_MULT = [[1, 0.7], [2, 0.9], [4, 1.1]];
const NEPTUN_SOURCE_MULT_MAX = 1.25;
const NEPTUN_POSITION_MULT = { point: 1, source_approx: 0.6, locality_center: 0.5 };
// Audytowalna lista potwierdzonych punktów katalogowych. Nie jest bazą miast.
const NEPTUN_LOCALITY_ANCHORS = [{ name:"Łuck", lat:50.7472, lon:25.3254 }];
/* Alarm ogólnokrajowy NEPTUN-a („national-mig31k”, region „Загальнодержавна
   загроза”, umowny punkt w środku Ukrainy) — lustro config.NEPTUN_NATIONAL_*. */
const NEPTUN_NATIONAL_ID_PREFIX = "national-";
const NEPTUN_NATIONAL_REGION_MARKERS = ["загальнодержавн"];
const isNationalThreat = (t) => String(t?.id ?? "").startsWith(NEPTUN_NATIONAL_ID_PREFIX)
  || NEPTUN_NATIONAL_REGION_MARKERS.some(m => String(t?.region ?? "").toLowerCase().includes(m));
const HEADING_TOL = 50;
/* Waga kursu (lustro geo.course_factor): twarde cięcie na 50° gubiło obiekty tuż
   za progiem, a brak pola heading wyciszał nawet rakietę tuż przy granicy. */
const HEADING_SOFT = 70, UNKNOWN_HEADING_MULT = 0.5, UNKNOWN_HEADING_MAX_KM = 150;
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
/* Obwód UA -> najkrótsza odległość od województwa (km). Lustro
   config.UA_ALERT_OBLASTS; liczby z scripts/ua_oblast_rings.py. Polska graniczy
   tylko z wołyńskim, lwowskim i krótkim odcinkiem zakarpackiego — dalsze obwody
   dostają mniej punktów, zamiast udawać przygraniczne. */
const UA_ALERT_OBLASTS = {
  "Львівська":{lubelskie:0, podkarpackie:0},
  "Волинська":{lubelskie:0, podkarpackie:55},
  "Закарпатська":{lubelskie:135, podkarpackie:0},
  "Івано-Франківська":{lubelskie:100, podkarpackie:50},
  "Рівненська":{lubelskie:70, podkarpackie:110},
  "Тернопільська":{lubelskie:100, podkarpackie:115},
  "Хмельницька":{lubelskie:160, podkarpackie:190},
  "Чернівецька":{lubelskie:225, podkarpackie:180},
  // Żytomierski nie graniczy z Polską, ale stamtąd — przez Białoruś — szły drony
  // 10.09.2026; alarm w tym obwodzie jest wskaźnikiem wyprzedzającym.
  "Житомирська":{lubelskie:220, podkarpackie:265},
  "Вінницька":{lubelskie:280, podkarpackie:305} };
/* Krzywa odległości interpolowana liniowo — lustro config.UA_ALERT_CURVE. */
const UA_ALERT_CURVE = [[0,1.0],[50,0.7],[100,0.5],[150,0.3],[220,0.15],[320,0.08]];
/* Czas trwania alarmu obwodu — lustro config (wariant B2, 13.09.2026): pełna
   waga przez FULL_MIN od prawdziwego początku (`since`), potem połowa, dopóki
   alarm trwa; koniec (obwód znika z listy na 3 min) od razu gasi punkty. */
const UA_ALERT_LONG_FACTOR = 0.5, UA_ALERT_END_GRACE_S = 180, UA_ALERT_MAX_MIN = 720;
function uaAlertEnds(sigs) {
  const ends = new Map();
  for (const s of sigs) {
    if (s.event_type !== "ua_alert_end") continue;
    const at = Date.parse(s.details?.ended_at || "") || s.t || Date.parse(s.ts) || 0;
    const k = `${s.voivodeship}|${s.details?.oblast}|${s.details?.episode}`;
    if (!ends.has(k) || at < ends.get(k)) ends.set(k, at);
  }
  return ends;
}
/* [waga, koniec|null] — dawne sygnały bez epizodu liczą się po staremu. */
function uaAlertFactor(s, ends, ref) {
  const ep = s.details?.episode;
  const st = s.t || Date.parse(s.ts) || 0;
  if (!ep) {
    const ageMin = (ref - st) / 60000;
    return [ageMin <= FULL_MIN ? 1 : Math.max(0, 1 - (ageMin - FULL_MIN) / Math.max(WINDOW_MIN - FULL_MIN, 1)), null];
  }
  const end = ends.get(`${s.voivodeship}|${s.details?.oblast}|${ep}`);
  if (end && end <= ref) return [0, end];
  const ageMin = Math.max(0, (ref - (Date.parse(ep) || st)) / 60000);
  if (ageMin <= FULL_MIN) return [1, null];
  return [ageMin <= UA_ALERT_MAX_MIN ? UA_ALERT_LONG_FACTOR : 0, null];
}
/* Starty alarmów starsze niż okno fuzji, które w chwili `ref` wciąż trwają. */
function activeUaAlerts(sigs, ref) {
  const ends = uaAlertEnds(sigs.filter(x => (x.t || Date.parse(x.ts) || 0) <= ref));
  const winStart = ref - WINDOW_MIN * 60000;
  return sigs.filter(x => {
    if (x.event_type !== "ua_alert_border" || !x.details?.episode) return false;
    const t = x.t || Date.parse(x.ts) || 0;
    if (t >= winStart || t > ref) return false;
    const [w, end] = uaAlertFactor(x, ends, ref);
    return w > 0 && end == null;
  });
}
function uaAlertWeight(km) {
  if (km > UA_ALERT_CURVE[UA_ALERT_CURVE.length - 1][0]) return 0;
  for (let i = 1; i < UA_ALERT_CURVE.length; i++) {
    const [ka, wa] = UA_ALERT_CURVE[i - 1], [kb, wb] = UA_ALERT_CURVE[i];
    if (km <= kb) return wa + (wb - wa) * (Math.max(km, ka) - ka) / (kb - ka);
  }
  return UA_ALERT_CURVE[UA_ALERT_CURVE.length - 1][1];
}
/* Nazwa obwodu po polsku w tytule sygnału — lustro config.UA_OBLAST_PL. */
const UA_OBLAST_PL = { "Волинська":"wołyńskim", "Львівська":"lwowskim",
  "Закарпатська":"zakarpackim", "Рівненська":"rówieńskim", "Житомирська":"żytomierskim",
  "Тернопільська":"tarnopolskim", "Івано-Франківська":"iwanofrankowskim",
  "Хмельницька":"chmielnickim", "Чернівецька":"czerniowieckim", "Вінницька":"winnickim" };
/* Klasyfikacja: CRITICAL oznacza 1,5 pkt, para AIR + EVENT 1,0 pkt. Twardy
   limit RSS 1,5 sprawia, że same media nigdy nie osiągają żółtego progu 2,0.
   Lustrzana kopia backend/app/config.py — testy w scripts/test_textmatch.py. */
const CRITICAL = ["alarm powietrzny", "zagrożenie z powietrza", "zawyły syreny", "zawyła syrena", "obiekt powietrzny spadł", "niezidentyfikowany obiekt spadł", "zestrzelono dron", "zestrzelono rakiet", "poderwano myśliwce", "poderwano lotnictwo", "schrony otwarte", "zamknięto przestrzeń powietrzn", "zamknięcie przestrzeni powietrzn", "zamknięta przestrzeń powietrzn", "operacja obrony powietrzn", "operację obrony powietrzn", "operacji obrony powietrzn", "poderwano f-16", "poderwano f-35", "poderwano samoloty", "poderwała myśliwce", "poderwała samoloty", "poderwała lotnictwo", "poderwało myśliwce", "poderwało samoloty", "poderwało lotnictwo", "poderwali myśliwce", "podrywa myśliwce", "podrywa samoloty", "podrywa lotnictwo", "wojsko poderwało", "operuje lotnictwo", "operuje polskie lotnictwo", "lotnictwo operuje", "rozpoczęło się operowanie", "rozpoczęło operowanie", "atakiem z powietrza"];
const AIR = ["dron", "bezzałogow", "bsp", "shahed", "geran", "rakiet", "pocisk", "ch-101", "kalibr", "iskander", "kab", "bomb", "myśliwc", "mig-31", "obiekt powietrzny", "przestrzeni powietrznej", "przestrzeń powietrzną", "obrona powietrzna", "obiekt latając", "lancet", "kindżał", "kinżał", "kh-101", "kh-47", "kh-59", "amunicja krążąc", "fpv", "kamikadze", "statek powietrzny", "pocisk manewrując", "pocisk balistyczn", "hipersoniczn", "f-16", "f-35", "su-24", "su-34", "su-35", "tu-95", "tu-160", "mig-29", "lotnictwo wojskow"];
const EVENT = ["spadł", "spadła", "spadło", "eksploz", "wybuch", "zestrzel", "przechwyc", "poderwan", "naruszen", "naruszył", "naruszyła", "wleciał", "wtargn", "uderzy", "trafił", "szczątki", "atak", "ostrzał", "zawył", "alarm", "ewakuac", "schron", "zagrożeni", "przekrocz", "wtargnięci", "detonac", "runął", "runęła", "runęło", "zestrzelen", "przechwycen", "poderwał", "poderwało", "poderwali", "podrywa", "eksplod", "zaatak", "uderza"];
const EXCLUDE = ["ćwiczeni", "trening", "test syren", "próba syren", "próby syren", "głośna próba", "rocznic", "upamiętni", "minuta ciszy", "wymian", "modernizac", "przetarg", "inwestycj", "zakup", "montaż", "zamontow", "instalac", "rozbudow", "dofinansow", "dotacj", "planowan", "potrwa", "konserwac", "remont", "pojawią się", "powstan", "wdroż", "komunikat głosowy", "system ostrzegania będzie", "nowe syreny", "nowych syren", "pożar bloku", "pożar domu", "pożar mieszkania", "pożar lasu", "wypadek drogow", "kolizja", "lpr lądował", "śmigłowiec lpr", "utonię", "potrąc", "dachowa", "karambol", "zderzenie samochod", "pożar ciężarów", "pożar samochod", "pożar autobusu", "pożar cystern", "zapaliła się ciężarów", "zapalił się samoch", "zbiornik paliw", "wyciek paliw", "demograf", "przyrost naturaln", "liczba mieszkańc", "wyludnia", "tydzień po", "tygodnie po", "tygodni po", "dzień po", "dni po", "miesiąc po", "miesiące po", "miesięcy po", "rok po", "lata po", "lat po", "rok temu", "lata temu", "lat temu", "ubiegłym roku", "ubiegłego roku", "godzin po", "godziny po", "kalendarium", "przypominamy", "wspomina", "kulisy", "reportaż", "felieton", "czy na pewno", "co wiemy", "jak doszło", "śledztwo w sprawie", "śledztwo ws", "podsumowanie roku", "zawyły syreny?", "zawyła syrena?", "alarm powietrzny?", "co powinieneś zrobić", "co należy zrobić", "jak się zachować w razie", "co robić w razie", "co zrobić w razie", "poradnik bezpieczeństwa", "poznaj sygnały alarmowe", "co oznacza sygnał alarmowy", "film fabularn", "film dokumentaln", "serial", "premiera", "recenzja", "zwiastun", "gra wideo", "gry wideo", "powieść", "komiks", "cosplay", "spektakl", "1939", "1944", "1945", "ii wojn", "powstanie warszawsk", "rakieta kosmiczn", "rakieta nośn", "start rakiety", "spacex", "falcon", "starship", "misja kosmiczn", "kosmodrom", "odbudow", "ma być gotow", "rakieta tenisow", "rakietka", "rakiety śnieżn", "bomba atomow", "wybuchła afera", "pokaz dron", "dron rolnicz", "dron dostawcz", "wyścig dron", "nagranie z drona", "zdjęcia z drona", "zdjęcie z drona", "widok z drona", "wybiła godzina", "godzina \"w\"", "godzinie \"w\"", "godziny \"w\"", "oddali hołd", "oddał hołd", "oddano hołd", "hołd bohaterom", "hołd powstańcom", "uroczystoś", "próbny alarm", "alarm próbny", "próbnego alarmu", "próba syren alarmowych", "ogólnopolskie ćwiczenia", "są zarzuty", "usłyszał zarzut", "usłyszała zarzut", "usłyszeli zarzuty", "postawiono zarzut", "postawiono zarzuty", "zarzuty dla", "akt oskarżenia", "odpowie przed sądem", "stanął przed sądem", "stanęła przed sądem", "skazany za", "skazana za", "do zdarzenia miało dojść", "po nocnym alarmie", "po porannym alarmie", "po wieczornym alarmie", "po nocnym ataku", "po porannym ataku", "po nocnych alarmach", "nie zawyły", "nie zawyła", "pomyłk", "omyłkow", "fałszywy alarm", "umorzył", "umorzono", "przespał", "stado ptaków", "to ptaki", "wykrył ptaki", "testy syren", "testy dron", "testuje", "testów", "rozpoczyna testy", "korytarz", "zawyją", "rozlegną się", "zabrzmią", "przelecą", "polecą", "będą latać", "dostaną alert", "wyją syreny", "alarm bombowy", "alarmy bombowe", "alarmu bombowego", "alarmów bombowych", "alarmie bombowym", "alarmem bombowym", "alarmów bombowych", "o podłożeniu ładunku", "podłożeniu bomby", "informacja o bombie"];
const B_CRITICAL = ["airspace violation", "violated airspace", "airspace was violated", "airspace closed", "shot down a drone", "scrambled jets", "oro erdvės pažeid", "gaisa telpas pārkāp", "õhuruumi rikku"];
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
  "dolnośląskie":["dolnośląsk","dolnoslask","dolny śląsk","dolnym śląsku","dolnym śląskiem","dolnego śląska","dolnoślązak","wrocław","wroclaw","legnic","wałbrzych","jelenia gór","jeleniej gór","lubin","głogów","świdnic","bolesławiec","oleśnic","dzierżoniów","zgorzelec","polkowic","kłodzk","bielaw","oława","oławie","brzeg dolny","strzelin","środa śląsk","trzebnic","złotoryj","kamienna gór","kamiennej gór","lubań","milicz","syców","chojnów","karpacz","szklarska poręb","bogatyni","zgorzelc"],
  "kujawsko-pomorskie":["kujawsko","kujawach","kujawy","bydgoszcz","toruń","torun","włocławek","grudziądz","inowrocław","brodnic","świeciu","świecia","świecie nad wisłą","chełmn","chełmż","rypin","lipno","nakło","żnin","mogilno","tuchol","sępólno","wąbrzeźno","golub-dobrzyń","aleksandrów kujawsk","ciechocinek","solec kujawsk","kruszwic","radziejów","janikowo","koronowo","szubin"],
  "lubelskie":["lubelski","lubelskie","lubelskiem","lubelszczy","lublin","chełm","zamość","zamoś","hrubiesz","włodaw","terespol","dorohusk","świdnik","puław","kraśnik","łęczn","biała podlask","białej podlask","białą podlask","bialskopodlask","radzyń podlask","radzyniu podlask","radzynia podlask","tomaszów lubelsk","tomaszowie lubelsk","janów lubelsk","opole lubelsk","opolu lubelsk","biłgoraj","lubartów","łuków","parczew","dęblin","krasnystaw","krasnymstaw","szczebrzeszyn","józefów","poniatowa","bychawa","rejowiec","międzyrzec podlask","kock","annopol","tarnawa-kolonia","wyryki","czosnówka"],
  "lubuskie":["lubusk","zielona gór","zielonej gór","gorzów","gorzow","nowa sól","nowej soli","świebodzin","międzyrzecz","słubic","sulechów","żagań","kostrzyn","gubin","krosno odrzańsk","krośnie odrzańsk","drezdenko","strzelce krajeńsk","wschowa","szprotawa","lubsko","skwierzyna","sulęcin","rzepin","dobiegniew","witnica","międzyrzeck"],
  "łódzkie":["łódzk","lodzk","łódź","piotrków trybunalsk","pabianic","bełchatów","sieradz","kutno","zgierz","radomsk","skierniewic","tomaszów mazowieck","tomaszowie mazowieck","tomaszowa mazowieck","tomaszowem mazowieck","zduńska wol","zduńskiej wol","wieluń","opoczno","rawa mazowieck","łowicz","kolusz","aleksandrów łódzk","konstantynów łódzk","ozorków","głowno","poddębic","łęczyc","pajęczno","wieruszów","warta k. sieradza"],
  "małopolskie":["małopolsk","malopolsk","małopolsce","kraków","krakow","tarnów","nowy sącz","nowym sączu","nowego sącza","oświęcim","zakopane","chrzanów","olkusz","bochni","wadowic","nowy targ","nowym targu","gorlic","brzesk","andrychów","skawina","myślenic","limanow","trzebini","libiąż","wieliczk","sucha beskidzk","krynic-zdrój","muszyn","dąbrowa tarnowsk","proszowic","miechów","wolbrom","kęty","niepołomic","bukowno","szczawnic"],
  "mazowieckie":["mazowieck","mazowsz","warszaw","radom","siedlc","płock","ostrołęk","pruszków","legionow","otwock","żyrardów","ciechanów","mińsk mazowieck","nowy dwór mazowieck","grodzisk mazowieck","maków mazowieck","ostrów mazowieck","ostrowie mazowieck","sokołów podlask","sokołowie podlask","sokołowa podlask","mińsku mazowieck","grodzisku mazowieck","makowie mazowieck","rawie mazowieck","wołomin","piaseczno","sochaczew","wyszków","garwolin","węgrów","płońsk","mława","żuromin","gostynin","sierpc","przasnysz","pułtusk","łosic","grójec","kozienic","zwoleń","lipsko","szydłowiec","białobrzeg","sulejówek","konstancin","modlin","sochaczewsk"],
  "opolskie":["opolsk","opole","opolu","opolszczy","kędzierzyn","nysa","nysie","kluczbork","prudnik","strzelce opolsk","namysłów","krapkowic","głubczyc","olesno","ozimek","zdzieszowic","praszka","grodków","niemodlin","gogolin","brzeg opolsk","paczków","biała prudnick"],
  "podkarpackie":["podkarpack","podkarpaci","rzeszów","rzeszow","przemyśl","przemysl","medyk","jarosław","lubaczów","sanok","krosno","krośni","mielec","stalowa wol","stalowej woli","tarnobrzeg","dębic","jasło","jaśle","łańcut","ropczyc","sędziszów","leżajsk","przeworsk","ustrzyk","lesko","brzozów","strzyżów","kolbuszow","głogów małopolsk","nowa dęba","radymno","korczowa","budomierz","krościenko","bieszczad","nisku","jasionka","arłamów"],
  "podlaskie":["podlask","podlasi","białystok","bialystok","białymstok","białegostok","suwałk","suwalk","augustów","sokółk","kuźnic","siemiatycz","hajnówk","bielsk podlask","bielsku podlask","wysokie mazowieck","wysokiem mazowieck","łomż","grajewo","zambrów","mońk","kolno","sejny","dąbrowa białostock","czarna białostock","supraśl","michałowo","narewk","białowież","krynk","czeremch","siemianówk","wasilków","zabłudów","kuźnica białostock","połowce"],
  "pomorskie":["woj. pomorsk","pomorskiego","pomorzu","pomorza","pomorze","kaszub","gdańsk","gdansk","gdyni","sopot","słupsk","tczew","malbork","wejherow","kwidzyn","starogard gdańsk","chojnic","lębork","puck","pruszcz gdańsk","kościerzyn","kartuz","bytów","człuchów","sztum","nowy dwór gdańsk","ustk","półwysep hel","władysławow","jastarni","krynica morsk","skarszew","żukowo","trójmiast"],
  "śląskie":["śląski","slaski","śląsku","śląska","śląsk","katowic","częstochow","gliwic","sosnowiec","zabrze","bytom","rybnik","bielsko-biał","bielsku-biał","tychy","tychach","chorzów","dąbrowa górnicz","jastrzębie","żywiec","ruda śląsk","tarnowskie gór","tarnowskich gór","mysłowic","siemianowic","piekary śląsk","świętochłowic","zawiercie","będzin","racibórz","wodzisław","mikołów","czechowic","cieszyn","pszczyn","lubliniec","myszków","kłobuck","knurów","żory","jaworzno","bieruń","radzionków","orzesze","pyrzowic"],
  "świętokrzyskie":["świętokrzysk","swietokrzysk","kielc","kielecczy","ostrowiec świętokrzysk","starachowic","skarżysk","sandomierz","końskie","jędrzejów","busko","staszów","opatów","pińczów","włoszczow","kazimierza wielk","chmielnik","suchedniów","morawic","daleszyc","bodzentyn","połaniec","ćmielów"],
  "warmińsko-mazurskie":["warmińsko","warminsko","warmii","warmia","mazurach","mazurskiego","olsztyn","elbląg","ełk","gołdap","braniew","ostróda","iława","kętrzyn","giżyck","mrągow","szczytno","działdow","bartoszyc","lidzbark","węgorzew","olecko","nidzic","nowe miasto lubawsk","morąg","orneta","dobre miasto","biskupiec","mikołajk","bezledy","grzechotki","gronowo","pieniężno","pasłęk","piszu"],
  "wielkopolskie":["wielkopolsk","wielkopolsce","poznań","poznan","kalisz","konin","leszno","gniezno","ostrów wielkopolsk","piła wielkopolsk","grodzisk wielkopolsk","środa wielkopolsk","swarzędz","śrem","luboń","kościan","wrześni","jarocin","krotoszyn","słupc","oborniki","szamotuł","wągrowiec","chodzież","czarnków","złotów","rawicz","gostyń","pleszew","wolsztyn","nowy tomyśl","murowana goślin","puszczykowo","opalenic","krzesiny"],
  "zachodniopomorskie":["zachodniopomorsk","pomorze zachodnie","pomorzu zachodnim","pomorza zachodniego","zachodnim pomorzu","zachodniego pomorza","szczecin","koszalin","kołobrzeg","świnoujści","stargard","police","wałcz","gryfin","białogard","szczecinek","goleniów","gryfic","kamień pomorsk","nowogard","choszczno","drawsko pomorsk","świdwin","myślibórz","dębno","barlinek","trzebiatów","darłowo","sławno","złocieniec","połczyn","mielno","międzyzdroj"]};
const RSS_FEEDS = [
  ["https://www.lublin112.pl/feed/","lubelskie"],
  ["https://radio.lublin.pl/feed/","lubelskie"],
  ["https://www.dziennikwschodni.pl/rss","lubelskie"],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podkarpackie&hl=pl&gl=PL&ceid=PL:pl",null],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20podlaskie&hl=pl&gl=PL&ceid=PL:pl",null],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20lubelskie&hl=pl&gl=PL&ceid=PL:pl",null],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(warmi%C5%84sko-mazurskie%20OR%20mazurskie%20OR%20olsztyn)&hl=pl&gl=PL&ceid=PL:pl",null],
  // Północ ma własne kanały, bo od 1.7.30 punktuje tam strefa PAŻP i musi mieć
  // czym się sparować (te same słowa co dla ściany wschodniej).
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(pomorskie%20OR%20Gda%C5%84sk%20OR%20Gdynia%20OR%20S%C5%82upsk)&hl=pl&gl=PL&ceid=PL:pl",null],
  ["https://news.google.com/rss/search?q=(syreny%20OR%20alarm%20OR%20dron%20OR%20rakieta)%20(zachodniopomorskie%20OR%20Szczecin%20OR%20Ko%C5%82obrzeg)&hl=pl&gl=PL&ceid=PL:pl",null],
  // Ogólnopolski nasłuch bez domyślnego regionu — województwo rozpoznaje
  // VOIV_KEYWORDS. Jedno zapytanie pokrywa pozostałe 12 województw, zamiast
  // dokładać po osobnym kanale na każde.
  ["https://news.google.com/rss/search?q=(%22alarm%20powietrzny%22%20OR%20%22zawy%C5%82y%20syreny%22%20OR%20%22naruszenie%20przestrzeni%20powietrznej%22%20OR%20%22zestrzelono%20dron%22)&hl=pl&gl=PL&ceid=PL:pl", null]];
/* Lustro config.BALTIC_FEEDS: po dwa kanały na kraj (sprawdzone 13.09.2026). */
const BALTIC_FEEDS = [["https://www.lrt.lt/tema/oro-pavojus?rss", "LT"], ["https://www.15min.lt/rss", "LT"], ["https://www.lsm.lv/rss/", "LV"], ["https://eng.lsm.lv/rss/", "LV"], ["https://www.err.ee/rss", "EE"], ["https://news.err.ee/rss", "EE"]];
const BALTIC_COUNTRY_NAMES = {"LT": "Litwa", "LV": "Łotwa", "EE": "Estonia"};
const BALTIC_ALERT_COUNTRY_WEIGHTS = {"LT": 1.0, "LV": 0.6, "EE": 0.4};
/* Ogłoszony alarm dla ludności LT/LV/EE — sprawdzany przed listą incydentów. */
const B_ALERT = ["oro pavoj", "oro pavojus", "(geltona)", "(raudona)", "geltonas signalas", "raudonas signalas", "įspėjimas dėl galimai fiksuoto drono", "gyventojams išsiųsti įspėjimai", "gaisa telpas apdraudējum", "apdraudējums gaisa telpā", "dzeltenās pakāpes brīdinājum", "oranžās pakāpes brīdinājum", "šūnu apraide", "õhuohu hoiatus", "võimalik õhuoht", "drooniohu hoiatus", "drooniohu teavitus", "ohuteavitus", "ee-alarm", "õhuoht", "air alert", "air raid", "airspace alert", "air hazard alert", "air threat alert", "air danger alert", "drone threat warning", "drone warning", "air threat warning"];
const BALTIC_ALERT_PAST = ["buvo", "bija", "oli"];
// lustro config.BALTIC_DISCUSSION_MARKERS / BALTIC_FOREIGN_MARKERS (14.09.2026)
const BALTIC_DISCUSSION = ["klausim", " sako", "sakė", "kritik", "komentar", "interviu", "diskusij", "aiškina", "says", "said", "questions", "criticism", "interview", "debate", "explains", "saka", "jautājum", "skaidro", "ütles", "küsimus", "kriitik", "selgitab"];
const BALTIC_FOREIGN = ["ukrain", "kyiv", "kiev", "kharkiv", "odesa", "lviv", "kijev", "kijiv"];
const BALTIC_CLEAR_CONTEXT = ["air", "drone", "uav", "oro", "pavoj", "gaisa", "apdraud", "õhu", "droon", "ohu", "oht", "alert", "alarm", "warning", "threat"];
const BALTIC_CLEAR_MAX_AGE_MS = 360*60*1000;
/* Incydent nad Bałtykiem dotyczy całego wybrzeża, nie tylko flanki wschodniej;
   waga maleje z odległością od miejsca zdarzenia. Musi się zgadzać z
   config.BALTIC_TARGET_WEIGHTS — pilnuje tego scripts/test_spojnosc.py. */
const BALTIC_TARGET_WEIGHTS = {"podlaskie":1, "warmińsko-mazurskie":1,
                               "pomorskie":1, "zachodniopomorskie":0.5};
const BALTIC_TARGETS = Object.keys(BALTIC_TARGET_WEIGHTS);
const BALTIC_CLEAR = ["alert over", "alert is over", "threat over", "threat is over", "warning over", "warning is over", "warning lifted", "alert lifted", "threat ended", "threat has ended", "danger has passed", "all clear", "no longer a threat", "cancelled", "canceled", "apdraudējums noslēdzies", "apdraudējums beidzies", "brīdinājums atcelts", "draudi beigušies", "gaisa apdraudējums noslēdzies", "oht on möödas", "õhuoht on möödas", "ohu lõpp", "oht lõppenud", "ohuhoiatus tühistati", "ohuteade lõpetati", "pavojus baigėsi", "oro pavojus baigėsi", "perspėjimas atšauktas", "oro pavojus atšauktas", "oro pavojaus nebėra", "(balta)", "baltas signalas", "buvo skelbiamas oro pavojus", "atšauktas tikėtinas oro pavojus", "atšaukt", "atšauk", "lifted", "beidzies iespējamais gaisa telpas apdraudējums", "beidzies gaisa telpas apdraudējums", "brīdinājums atsaukts", "õhuhoiatus võeti maha", "ohu möödumisest", "ohuteavitus lõpetati", "drooniohtu ei tuvastatud"];
const MAX_AGE_MS = 45*60*1000;

/* ── stan ────────────────────────────────────────────────────────────────── */
const tracks = new Map();          // Neptun tracks
let alertOblasts = new Set();
let adsbAircraft = [];
const health = { neptun:false, adsb:false, rcb:false, rss:{}, pansa:false };
let onState = null, ws = null, wsRetry = 1, wsRetryPending = false;
// bootstrap RCB uznany tylko po JAWNIE odnotowanym udanym przebiegu —
// wcześniej pusta lista "seen" zapisana przez inny kod myliła się z bootstrapem
// i stare, statyczne wpisy (np. "Stopnie alarmowe") punktowały jako nowe
let rcbBootstrapped = localStorage.getItem("eng_rcb_boot") === "1";
const rcbSeen = new Set(JSON.parse(localStorage.getItem("eng_rcb_seen") || "[]"));
let signals = JSON.parse(localStorage.getItem("eng_signals") || "[]");
const seenKeys = new Map(JSON.parse(localStorage.getItem("eng_seen") || "[]"));
/* Pamięć poziomów przeżywa zamknięcie aplikacji. Trzymana w RAM zerowała się
   przy każdym starcie, więc aplikacja „odkrywała" ponownie poziom, o którym już
   wcześniej powiadomiła — i alarmowała drugi raz po każdym otwarciu. */
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

/* Audyt C13: przepełniony localStorage rzucał wyjątek w persist(), wołanym z
   addSignal PRZED reevaluate() — przy dużym ataku gubiło to powiadomienie.
   Zapis nigdy nie przerywa obróbki; przy braku miejsca najpierw oddajemy historię
   mapy (najmniej ważna), potem próbujemy jeszcze raz. */
function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch {
    try { localStorage.removeItem("eng_snaps"); localStorage.setItem(key, value); return true; }
    catch (e) { console.warn("localStorage pełny:", key, e?.name); return false; }
  }
}
function persist() {
  const cut = Date.now() - 24*3600*1000;
  signals = signals.filter(s => s.t > cut);
  for (const [k, t] of seenKeys) if (t < cut) seenKeys.delete(k);
  safeSet("eng_signals", JSON.stringify(signals));
  safeSet("eng_seen", JSON.stringify([...seenKeys]));
  safeSet("eng_rcb_seen", JSON.stringify([...rcbSeen].slice(-200)));
}

/* ── geo ─────────────────────────────────────────────────────────────────── */
const rad = d => d*Math.PI/180;
function haversine(a,b,c,d){const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b);
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*6371*Math.asin(Math.sqrt(x));}
function bearing(a,b,c,d){const p1=rad(a),p2=rad(c),dl=rad(d-b);
  const y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;}
function courseFactor(heading, brg, distKm){
  if (heading == null)
    return distKm <= UNKNOWN_HEADING_MAX_KM ? UNKNOWN_HEADING_MULT : 0;
  const raw = Math.abs(heading - brg) % 360;
  const d = Math.min(raw, 360 - raw);
  if (d <= HEADING_TOL) return 1;
  if (d >= HEADING_SOFT) return 0;
  return Math.round((HEADING_SOFT - d) / (HEADING_SOFT - HEADING_TOL) * 1000) / 1000;
}
/* Audyt A2b (lustro geo.assess_threat_outline_extent): odległość do KONTURU Polski
   z wybrzeżem (0 nad Polską), kurs porównywany z całym wycinkiem kierunków, pod
   którym obiekt widzi Polskę. Dane: pl-outline.js (scripts/build_pl_outline.py). */
function inRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [y1, x1] = ring[i], [y2, x2] = ring[(i + 1) % n];
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1)) inside = !inside;
  }
  return inside;
}
/* Wybór odcinka w lokalnym rzucie płaskim, odległość po kuli (jak geo.nearest_outline_point). */
function nearestOutline(lat, lon) {
  const kx = Math.cos(rad(lat));
  let best = null;
  for (const ring of PL_OUTLINE.rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      const ax = (a[1] - lon) * kx, ay = a[0] - lat;
      const dx = (b[1] - a[1]) * kx, dy = b[0] - a[0], den = dx * dx + dy * dy;
      const t = den === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den));
      const px = ax + dx * t, py = ay + dy * t, d2 = px * px + py * py;
      if (!best || d2 < best[0]) best = [d2, a, b, t];
    }
  }
  const [, a, b, t] = best;
  const plat = a[0] + (b[0] - a[0]) * t, plon = a[1] + (b[1] - a[1]) * t;
  return [haversine(lat, lon, plat, plon), plat, plon, PL_OUTLINE.voivs[t < 0.5 ? a[2] : b[2]]];
}
function bearingArc(lat, lon, points) {
  const brgs = points.map(p => bearing(lat, lon, p[0], p[1])).sort((x, y) => x - y);
  let gap = -1, at = 0;
  for (let i = 0; i < brgs.length; i++) {
    const g = ((brgs[(i + 1) % brgs.length] - brgs[i]) % 360 + 360) % 360;
    if (g > gap) { gap = g; at = i; }
  }
  return [brgs[(at + 1) % brgs.length], (360 - gap) % 360];
}
/* Spoza otoczki wypukłej wycinek wyznaczają jej wierzchołki; wewnątrz — cały kontur. */
function plBearingInterval(lat, lon) {
  const arc = bearingArc(lat, lon, PL_OUTLINE.hull);
  return arc[1] < 180 ? arc : bearingArc(lat, lon, PL_OUTLINE.rings.flat());
}
function courseFactorExtent(heading, interval, distKm) {
  if (heading == null) return distKm <= UNKNOWN_HEADING_MAX_KM ? UNKNOWN_HEADING_MULT : 0;
  const [start, width] = interval;
  const off = ((heading - start) % 360 + 360) % 360;
  const d = off <= width ? 0 : Math.min(off - width, 360 - off);
  if (d <= HEADING_TOL) return 1;
  if (d >= HEADING_SOFT) return 0;
  return Math.round((HEADING_SOFT - d) / (HEADING_SOFT - HEADING_TOL) * 1000) / 1000;
}
function assess(lat,lon,heading){
  const [d, plat, plon, segVoiv] = nearestOutline(lat, lon);
  if (PL_OUTLINE.rings.some(r => inRing(lat, lon, r)))
    return {dist_km:0, border_voiv:(voivPolys && voivAtPoint(lon, lat)) || segVoiv, bearing_to_border:null,
            course_factor:1, heading_known:heading!=null, toward_pl:true, inside_pl:true};
  const dist = Math.round(d*10)/10;
  const interval = plBearingInterval(lat, lon);
  const cf = interval ? courseFactorExtent(heading, interval, dist)
    : courseFactor(heading, bearing(lat, lon, plat, plon), dist);
  return {dist_km:dist, border_voiv:segVoiv, bearing_to_border:Math.round(bearing(lat, lon, plat, plon)),
          course_factor:cf, heading_known:heading!=null, toward_pl:cf>0, inside_pl:false};
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
const TOKEN_KEYWORDS = new Set(["kab", "bsp", "fpv"]);
/* Hasło musi zaczynać się na GRANICY SŁOWA. Bez tego weto „dni po" trafiało
   w środek „wscho-DNI PO-wiat" i kasowało prawdziwy meldunek o poderwaniu
   lotnictwa (ustalenie A8 audytu). Prawa strona zostaje otwarta, bo hasła są
   rdzeniami odmian; krótkie skróty (kab, bsp, fpv) domykamy z obu stron.
   Bez lookbehind — starsze WebView na Androidzie 7 go nie znają. */
const _wzorceHasel = new Map();
function hasKeyword(text, keyword) {
  let re = _wzorceHasel.get(keyword);
  if (!re) {
    const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prawo = TOKEN_KEYWORDS.has(keyword) ? "([^\\p{L}\\p{N}_]|$)" : "";
    re = new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}${prawo}`, "u");
    _wzorceHasel.set(keyword, re);
  }
  return re.test(text);
}
/* Weta MIĘKKIE obniżają frazę krytyczną do zwykłej pary zamiast ją kasować —
   musi się zgadzać z config.SOFT_EXCLUDE_KEYWORDS. */
const SOFT_EXCLUDE = ["co wiemy", "co należy zrobić", "co powinieneś zrobić", "co robić w razie", "co zrobić w razie", "jak się zachować w razie", "poradnik bezpieczeństwa", "poznaj sygnały alarmowe", "co oznacza sygnał alarmowy", "przypominamy", "potrwa", "jak doszło", "kulisy", "czy na pewno", "felieton", "reportaż"];
function podzialWet(tl, exclude) {
  const miekkie = SOFT_EXCLUDE.filter(k => hasKeyword(tl, k));
  const zbior = new Set(miekkie);
  const twarde = exclude.filter(k => hasKeyword(tl, k) && !zbior.has(k));
  return { twarde, miekkie };
}
function matchKw(text, critical, air, event, exclude) {
  const tl = text.toLowerCase();
  const { twarde, miekkie } = podzialWet(tl, exclude);
  if (twarde.length) return [];
  const c = critical.filter(k => hasKeyword(tl, k));
  if (c.length) return c;
  if (miekkie.length) return [];
  const a = air.filter(k => hasKeyword(tl, k)), e = event.filter(k => hasKeyword(tl, k));
  return a.length && e.length ? a.slice(0, 2).concat(e.slice(0, 2)) : [];
}
/* Jak matchKw, ale zwraca SIŁĘ dopasowania (lustro textmatch.classify_level):
   "critical" = relacja operacyjna (1,5 pkt), "weak" = para obiekt+zdarzenie
   (1 pkt). Oba wymagają innej klasy źródła; null = brak/weto. */
/* Słabe frazy samodzielne i „alert RCB" w kontekście powietrznym (E3) —
   lustro config.MEDIA_WEAK_PHRASES / RCB_HEADLINE_WORDS / RCB_HEADLINE_CONTEXT. */
const MEDIA_WEAK = ["syreny wyły", "rozległy się syreny", "usłyszeli syreny", "włączono syreny", "uruchomiono syreny", "zgłoszenia o wybuch", "zgłoszenia o huk", "wstrzymało operacje", "wstrzymano operacje", "wstrzymany ruch na lotnisku", "zamknięto część polskiego nieba", "lotnictwo w powietrzu", "myśliwce w powietrzu", "operowało lotnictwo"];
const RCB_HEAD = ["alert rcb", "alerty rcb", "alertu rcb", "rcb wydało alert", "rcb wysłało alert"];
const RCB_HEAD_CTX = ["atak", "lotnictw", "obrony powietrznej", "myśliwc", "dron", "rakiet", "z powietrza", "powietrzn"];
function matchLevel(text, critical, air, event, exclude) {
  const tl = text.toLowerCase();
  const { twarde, miekkie } = podzialWet(tl, exclude);
  if (twarde.length) return { level: null, hits: [] };
  const c = critical.filter(k => hasKeyword(tl, k));
  if (c.length) return { level: miekkie.length ? "weak" : "critical", hits: c };
  if (miekkie.length) return { level: null, hits: [] };
  const a = air.filter(k => hasKeyword(tl, k)), e = event.filter(k => hasKeyword(tl, k));
  if (a.length && e.length) return { level: "weak", hits: a.slice(0, 2).concat(e.slice(0, 2)) };
  const w = MEDIA_WEAK.filter(k => hasKeyword(tl, k));
  if (w.length) return { level: "weak", hits: w.slice(0, 2) };
  const r = RCB_HEAD.filter(k => hasKeyword(tl, k));
  const rc = r.length ? RCB_HEAD_CTX.filter(k => hasKeyword(tl, k)) : [];
  if (rc.length) return { level: "weak", hits: [r[0], rc[0]] };
  return { level: null, hits: [] };
}
/* Małe litery bez znaków diakrytycznych — ł nie rozkłada się w NFD, stąd osobna
   podmiana. Część źródeł pisze „Chelm" zamiast „Chełm". */
const fold = (s) => s.toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

/* WSZYSTKIE województwa wymienione w tekście — lustro _match_voivs z backendu.
   Wcześniej zwracaliśmy jedno, z najdłuższym hasłem, więc alert „dla województw
   lubelskiego i podkarpackiego" trafiał tylko do podkarpackiego. Odrzucamy jedynie
   trafienia zawarte w DŁUŻSZYM trafieniu innego województwa w tym samym miejscu
   (kolizje nazw: „Biała Podlaska" to lubelskie, „Chełmno" kujawsko-pomorskie).
   Porównujemy bez znaków diakrytycznych, bo część źródeł pisze bez ogonków. */
/* Lustro config.REGION_NEUTRAL_PATTERNS (miesiąc „września/wrześniu” ≠ miasto
   Września) i config.MEDIA_TEASER_PATTERNS (odnośniki „CZYTAJ: …” w opisie RSS). */
const MONTH_NOT_PLACE = /(^|[^\p{L}])wrze[sś]ni(?:a|u)(?![\p{L}])/giu;
const TEASER = /(^|[^\p{L}])(?:przeczytaj|czytaj|zobacz|posłuchaj|sprawdź)(?:\s+(?:także|też|również|więcej))?\s*:\s*[^\n–—]{0,220}/giu;
const stripTeasers = (s) => String(s || "").replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(TEASER, "$1 ");
const matchVoivs = (text) => {
  const folded = fold(String(text).replace(MONTH_NOT_PLACE, "$1 ").toLowerCase());
  const hits = [];
  for (const [v, keys] of Object.entries(VOIV_KEYWORDS))
    for (const k of keys) {
      const kf = fold(k);
      for (let i = folded.indexOf(kf); i !== -1; i = folded.indexOf(kf, i + 1)) {
        /* Trafienie MUSI zaczynać się na granicy słowa: „rozpoznania" zawiera
           „poznan" i ogólnopolski komunikat wojskowy wpadał do wielkopolskiego
           (złapane na żywo 12.09.2026); tak samo „bełkot"→Ełk, „topole"→Opole. */
        const p = i ? folded[i - 1] : "";
        if (i === 0 || !(/[a-z0-9]/.test(p) || p === "-")) hits.push([i, i + kf.length, v]);
      }
    }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [s, e, v] of hits) {
    const covered = hits.some(([os, oe, o]) => o !== v && os <= s && e <= oe && (oe - os) > (e - s));
    if (!covered && !out.includes(v)) out.push(v);
  }
  return out;
};
const matchVoiv = (text) => matchVoivs(text)[0] || null;
const FOREIGN_PLACES = ["w rumunii","nad rumunią","do rumunii","rumunia:","rumunii","w bułgarii","nad bułgarią","bułgarii","w mołdawii","nad mołdawią","mołdawii","na łotwie","nad łotwą","łotwy","na litwie","nad litwą","litwy","w estonii","nad estonią","estonii","w finlandii","nad finlandią","finlandii","na ukrainie","nad ukrainą","ukrainy","charkow","charków","kijow","kijów","na białorusi","białorusi","w rosji","rosji","obwodzie kaliningradzkim","w niemczech","niemiec","w czechach","czech","na słowacji","słowacji","na węgrzech","węgier","w danii","danii","w norwegii","norwegii","w szwecji","szwecji","w iranie","iranu","w izraelu","izraela"];
/* Domyślny region kanału to DOMNIEMANIE: nie stosujemy go, gdy tekst
   umiejscawia zdarzenie za granicą („drony spadły w Rumunii" z Radia Szczecin). */
const mentionsAbroad = (text) => {
  const t = fold(String(text).toLowerCase());
  return FOREIGN_PLACES.some(k => t.includes(fold(k)));
};


/* Artykuł mówiący, że jest PO wszystkim, nie jest dowodem zagrożenia. Musi się
   zgadzać z config.MEDIA_CLEAR_KEYWORDS — pilnuje tego scripts/test_spojnosc.py. */
const MEDIA_CLEAR = ["odwołano alarm", "odwołanie alarmu", "alarm odwołany", "koniec alarmu", "zakończono operowanie", "zakończyło operowanie", "zakończone operowanie", "powróciły do standardowej", "wrócił do standardowej", "powrót do standardowej", "zagrożenie minęło", "zagrożenie minelo", "niebezpieczeństwo minęło", "zakończono działania", "zakończyły się działania", "zakończono operację", "przestrzeń powietrzna została otwarta", "wznowiono ruch lotniczy", "lotniska wznowiły", "lotnisko wznowiło", "odwołano ostrzeżenie", "ostrzeżenie odwołane", "alert odwołany", "alert rcb odwołany", "sytuacja wróciła do normy", "po zagrożeniu", "odwołano alert", "odwołuje alert", "odwołało alert", "zakończyło się operowanie"];
const isMediaClear = (text) => {
  const t = fold(String(text).toLowerCase());
  return MEDIA_CLEAR.some(k => t.includes(fold(k)));
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
  // klucz zostaje przy sygnale: to po nim deduplikujemy kolejne obiegi kolektorów
  signals.push({ t: Date.now(), ts: new Date().toISOString(), source,
    event_type: eventType, voivodeship: voiv, points, title, details, key });
  persist();
  reevaluate();
  return true;
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

function relayTokens(value) {
  return new Set(fold(String(value || "")).match(/[a-z0-9]+/g)?.filter(
    w => w.length >= 4 && !RELAY_STOP.has(w)) || []);
}
function mediaRelayOfOfficial(media, officials) {
  if (media.source !== "media" || media.event_type !== "media_keywords"
      || !fold(media.title || "").includes("alert rcb")) return null;
  const mt = relayTokens(media.title);
  for (const official of officials) {
    if (official.voivodeship !== media.voivodeship) continue;
    const apart = Math.abs((media.t || Date.parse(media.ts))
      - (official.t || Date.parse(official.ts)));
    if (!Number.isFinite(apart) || apart > RCB_RELAY_WINDOW_MS) continue;
    const ot = relayTokens(official.title), shared = [...mt].filter(w => ot.has(w));
    if (shared.length >= 4 && shared.length / Math.max(1, Math.min(mt.size, ot.size)) >= 0.45)
      return official;
  }
  return null;
}

const MEDIA_RETROSPECTIVE_TITLE_MARKERS = ["rok temu", "lata temu", "lat temu", "sledztwo ws", "odbudow", "ma byc gotow", "wybila godzina", "godzina \"w\"", "godzinie \"w\"", "godziny \"w\"", "oddali hold", "oddal hold", "oddano hold", "hold bohaterom", "hold powstancom", "uroczystos", "probny alarm", "alarm probny", "probnego alarmu", "proba syren alarmowych", "ogolnopolskie cwiczenia", "sa zarzuty", "uslyszal zarzut", "uslyszala zarzut", "uslyszeli zarzuty", "postawiono zarzut", "postawiono zarzuty", "zarzuty dla", "akt oskarzenia", "odpowie przed sadem", "stanal przed sadem", "stanela przed sadem", "skazany za", "skazana za", "do zdarzenia mialo dojsc", "po nocnym alarmie", "po porannym alarmie", "po wieczornym alarmie", "po nocnym ataku", "po porannym ataku", "po nocnych alarmach"];
const LEVEL_ORDER = ["none", "elevated", "high"];
const levelOf = (score) => score >= TH_HIGH ? "high" : score >= TH_ELEVATED ? "elevated" : "none";
/* Lustro fusion.alert_level: poziom, który budzi telefon (bez marginesu przy zejściu). */
function alertLevel(own, total) {
  own = Math.round(own * 10) / 10; total = Math.round(total * 10) / 10;
  if (own < ALERT_OWN_MIN) return "none";
  const cap = Math.min(2, LEVEL_ORDER.indexOf(levelOf(own)) + 1);
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(levelOf(total)), cap)];
}
/* Ciszę po powiadomieniu przełamuje tylko nowy alert RCB/RSO (lustro fusion). */
function freshStrongSignal(sigs, sinceMs) {
  return sigs.some(s => (s.t || Date.parse(s.ts) || 0) > sinceMs && (s.counted_points || 0) > 0
    && s.source === "rcb");
}
/* Tożsamość zdarzenia niezależna od województwa (lustro fusion._event_key). */
function eventKey(s) {
  const d = s.details || {};
  for (const f of ["link", "incident_key", "oblast", "designator"])
    if (d[f]) return `${s.source}|${f}|${d[f]}`;
  if (d.ident) return `${s.source}|ident|${d.country}:${d.ident}`;
  return `${s.source}|id|${s.id ?? s.key ?? s.t}`;
}
function isOfficial(s) {
  return s.source === "rcb" && ["rso_alert","rcb_alert"].includes(s.event_type) && s.points > 0;
}
/* Czas RSO jest lokalny polski bez strefy. */
function plLocalToMs(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let offsetMin = 120;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw",
      hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
      minute: "2-digit", second: "2-digit" }).formatToParts(new Date(asUtc)).map(x => [x.type, x.value]));
    offsetMin = Math.round((Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - asUtc) / 60000);
  } catch {}
  return asUtc - offsetMin * 60000;
}
function issuedAt(s) {
  const v = plLocalToMs(s.details?.valid_from);
  return Number.isFinite(v) ? v : (s.t || Date.parse(s.ts) || 0);
}
function officialCleared(s, rsoClears) {
  const id = String(s.details?.rso_id ?? ""), issued = issuedAt(s);
  return (rsoClears.get(s.voivodeship) || []).some(c => (id && c.rsoId === id) || issued <= c.at);
}
function mediaAfterOfficialClear(media, clears, activeIssued) {
  const t = media.t || Date.parse(media.ts) || 0;
  if (clears.some(c => c.at >= t)) return "before_clear";
  const last = Math.max(...clears.map(c => c.at));
  if ((t - last) / 60000 > RSO_CLEAR_MEDIA_ECHO_MIN || activeIssued.some(i => i > last)) return null;
  const title = fold(media.title || "");
  if (RSO_CLEAR_NOT_ECHO_MARKERS.some(m => title.includes(m))) return null;
  return RSO_CLEAR_ECHO_MARKERS.some(m => title.includes(m)) ? "after_clear" : null;
}

/* Lustro fusion._media_article_status: artykuł nieprzeczytany albo o dawnym
   zdarzeniu jest widoczny, ale bez punktów. */
function mediaArticleStatus(media) {
  if (media.source !== "media" || media.event_type !== "media_keywords") return null;
  const st = media.details?.article?.status;
  return st === "past" || st === "unreadable" ? st : null;
}

function mediaRetrospective(media) {
  if (media.source !== "media" || media.event_type !== "media_keywords") return false;
  const title = fold(media.title || "");
  return MEDIA_RETROSPECTIVE_TITLE_MARKERS.some(marker => title.includes(marker));
}

/* Wynik per województwo z limitem klasy źródła (SOURCE_CAPS) i wygaszaniem
   wiekiem względem `refT` (domyślnie teraz; w rekonstrukcji historii — czas
   migawki). Wspólny rdzeń fuzji na żywo i historii — bez tego historia sumowała
   SUROWE punkty i np. 4 rutynowe strefy PAŻP (cap 1) dawały fałszywe 4.0 zamiast
   1.0. Kaskadę sąsiedzką dokłada dopiero computeState.
   Number.isFinite: jedna zła wartość punktów zatrułaby NaN-em całą sumę. */
function accumulate(sigs, refT) {
  const ref = refT || Date.now();
  const per = {}; VOIVODESHIPS.forEach(v => per[v] = { score: 0, signals: [], _spillover_score: 0, _spill_parts: {} });
  const perSource = {};
  const officials = sigs.filter(isOfficial);
  const uaEnds = uaAlertEnds(sigs);
  /* Odwołania RCB/RSO (lustro fusion.accumulate). Wpis RSO bywa edytowany
     w miejscu: 13.09.2026 alert 23329799 zmienił się w odwołanie. */
  const rsoClears = new Map();
  for (const s of sigs) {
    if (s.event_type !== "rso_clear" || !s.voivodeship) continue;
    const at = Date.parse(s.details?.cleared_at || "") || s.t || Date.parse(s.ts) || 0;
    if (!rsoClears.has(s.voivodeship)) rsoClears.set(s.voivodeship, []);
    rsoClears.get(s.voivodeship).push({ at, rsoId: String(s.details?.rso_id ?? "") });
  }
  const activeIssued = new Map();
  for (const o of officials) if (!officialCleared(o, rsoClears)) {
    if (!activeIssued.has(o.voivodeship)) activeIssued.set(o.voivodeship, []);
    activeIssued.get(o.voivodeship).push(issuedAt(o));
  }
  const balticClears = new Map();
  for (const s of sigs) {
    if (s.event_type !== "baltic_clear" || !s.details?.incident_key) continue;
    const key = s.voivodeship + "|" + s.details.incident_key;
    const prev = balticClears.get(key) || 0;
    balticClears.set(key, Math.max(prev, s.t || Date.parse(s.ts) || 0));
  }
  /* Odwołanie w mediach polskich nie ma wspólnego klucza zdarzenia z artykułem
     alarmowym (to zwykle inny adres), więc wygasza WSZYSTKIE wcześniejsze
     doniesienia medialne w tym województwie. Lustrzane wobec fusion.accumulate. */
  const mediaClears = new Map();
  for (const s of sigs) {
    if (s.event_type !== "media_clear" || !s.voivodeship) continue;
    const t = s.t || Date.parse(s.ts) || 0;
    if (t > (mediaClears.get(s.voivodeship) || 0)) mediaClears.set(s.voivodeship, t);
  }
  const neptunWinners = new Map();
  for (const s of sigs) {
    const trackId = s.source === "neptun" && s.details?.track_id;
    const physicalId = trackId && (s.details?.physical_key || trackId);
    if (!physicalId) continue;
    const key = s.voivodeship + "|" + physicalId;
    const prev = neptunWinners.get(key);
    if (!prev || s.points > prev.points || (s.points === prev.points && s.t > prev.t)) {
      neptunWinners.set(key, s);
    }
  }
  // Limit klasy źródła przydzielamy PO wygaszeniu wiekiem i od NAJMOCNIEJSZEGO
  // wkładu (lustro backend/app/fusion.py). Liczony wcześniej na surowych punktach
  // w kolejności czasu powodował, że w ataku dłuższym niż FULL_MIN stare wpisy
  // wypełniały limit, a świeży obiekt przy granicy wnosił 0 pkt.
  const prepared = [];
  for (const s of [...sigs].sort((a, b) => a.t - b.t)) {
    if (!(s.voivodeship in per) || !Number.isFinite(s.points) || s.points <= 0) continue;
    const trackId = s.source === "neptun" && s.details?.track_id;
    const physicalId = trackId && (s.details?.physical_key || trackId);
    const superseded = !!physicalId
      && neptunWinners.get(s.voivodeship + "|" + physicalId) !== s;
    const incident = (s.event_type === "baltic_context" || s.event_type === "baltic_alert")
      && s.details?.incident_key;
    const clearT = incident && balticClears.get(s.voivodeship + "|" + incident);
    const st = s.t || Date.parse(s.ts) || 0;
    const mediaClearT = s.source === "media" ? (mediaClears.get(s.voivodeship) || 0) : 0;
    let officialClear = null;
    if (isOfficial(s) && officialCleared(s, rsoClears)) officialClear = "alert";
    else if (s.event_type === "media_keywords" && rsoClears.has(s.voivodeship))
      officialClear = mediaAfterOfficialClear(s, rsoClears.get(s.voivodeship),
                                              activeIssued.get(s.voivodeship) || []);
    const cleared = (!!clearT && clearT >= st) || (mediaClearT > 0 && mediaClearT >= st)
      || !!officialClear;
    const relayOf = mediaRelayOfOfficial(s, officials);
    const retrospective = mediaRetrospective(s);
    const articleStatus = mediaArticleStatus(s);
    let w, uaEnd = null;
    if (s.event_type === "ua_alert_border") [w, uaEnd] = uaAlertFactor(s, uaEnds, ref);
    else {
      const ageMin = (ref - s.t) / 60000;
      w = ageMin <= FULL_MIN ? 1
        : Math.max(0, 1 - (ageMin - FULL_MIN) / Math.max(WINDOW_MIN - FULL_MIN, 1));
    }
    const zeroed = superseded || cleared || relayOf || retrospective || articleStatus;
    prepared.push({ s, w, counted: 0, weighted: zeroed ? 0 : s.points * w,
                    cleared, relayOf, retrospective, officialClear, articleStatus, uaEnd });
  }
  for (const e of [...prepared].sort((a, b) => b.weighted - a.weighted || a.s.t - b.s.t)) {
    const k = e.s.voivodeship + "|" + e.s.source;
    const cap = SOURCE_CAPS[e.s.source];
    const already = perSource[k] || 0;
    e.counted = cap == null ? e.weighted : Math.max(0, Math.min(cap - already, e.weighted));
    perSource[k] = already + e.counted;
  }
  for (const e of prepared) {        // do wyniku i rozbicia — w kolejności czasu
    const { s, counted, relayOf } = e;
    per[s.voivodeship].score += counted;
    if (s.source !== "rcb") {
      per[s.voivodeship]._spillover_score += counted;
      if (counted > 0) {
        const parts = per[s.voivodeship]._spill_parts, k = eventKey(s);
        parts[k] = (parts[k] || 0) + counted;
      }
    }
    per[s.voivodeship].signals.push({ ...s, counted_points: Math.round(counted * 10) / 10,
      weight: Math.round(e.w * 100) / 100, ...(e.cleared ? { cleared:true } : {}),
      ...(relayOf ? { duplicate_of_official: relayOf.details?.rso_id || relayOf.id || true } : {}),
      ...(e.retrospective ? { retrospective:true } : {}),
      ...(e.officialClear ? { official_clear: e.officialClear } : {}),
      ...(e.articleStatus ? { article_status: e.articleStatus } : {}),
      ...(e.uaEnd ? { alert_ended: new Date(e.uaEnd).toISOString() } : {}) });
  }
  return per;
}

function computeState() {
  const cut = Date.now() - WINDOW_MIN*60*1000;
  const clearCut = Date.now() - (RSO_CLEAR_MEDIA_ECHO_MIN + WINDOW_MIN)*60*1000;
  const now = Date.now();
  return stateFrom(signals.filter(s => s.t >= cut
    || (s.event_type === "rso_clear" && s.t >= clearCut)).concat(activeUaAlerts(signals, now)), now);
}

/* Stan z podanej listy sygnałów w chwili `refT` — rdzeń computeState, osobno,
   żeby testy mogły odtworzyć przeszłą chwilę (lustro fusion.compute_state). */
function stateFrom(sigs, refT) {
  const ref = refT || Date.now();
  // limit klasy źródła + wygaszanie — wspólny rdzeń z rekonstrukcją historii
  const per = accumulate(sigs, ref);
  for (const v of VOIVODESHIPS) per[v].level = "none";
  const base = {}, parts = {};
  for (const [v, st] of Object.entries(per)) {
    base[v] = st._spillover_score || 0; delete st._spillover_score;
    parts[v] = st._spill_parts || {}; delete st._spill_parts;
    st.own_score = Math.round(st.score * 10) / 10;
  }
  const nowIso = new Date(ref).toISOString();
  for (const [src, score] of Object.entries(base)) {
    if (score < SPILLOVER_MIN) continue;
    for (const [nb, depth] of cascadeTargets(src)) {
      /* Zdarzenie obecne u sąsiada BEZPOŚREDNIO nie wraca do niego przeniesieniem
         (13.09.2026 lubelskie i podkarpackie podbijały się tym samym artykułem). */
      const shared = Object.entries(parts[src]).reduce((a, [k, p]) => a + (k in parts[nb] ? p : 0), 0);
      const effective = score - shared;
      if (effective < SPILLOVER_MIN) continue;
      const spill = Math.round(effective * Math.pow(SPILLOVER_FACTOR, depth) * 10) / 10;
      if (spill < SPILLOVER_MIN_CONTRIB) continue;
      const hop = depth === 1 ? "sąsiad" : `${depth}. krąg`;
      const eff = Math.round(effective * 10) / 10;
      per[nb].score += spill;
      per[nb].signals.push({ t: ref, ts: nowIso,
        source: "spillover", event_type: "neighbour_spillover", voivodeship: nb,
        points: spill, counted_points: spill,
        title: `Przeniesienie z woj. ${src} (${eff} pkt × ${SPILLOVER_FACTOR}^${depth}, ${hop}`
          + (shared > 0 ? ", bez zdarzeń wspólnych)" : ")"),
        details: { from: src, from_score: eff, depth,
                   ...(shared > 0 ? { shared_excluded: Math.round(shared * 100) / 100 } : {}) } });
    }
  }
  for (const [v, st] of Object.entries(per)) {
    st.score = Math.round(st.score*10)/10;
    st.level = st.score >= TH_HIGH ? "high" : st.score >= TH_ELEVATED ? "elevated" : "none";
    st.alert_level = alertLevel(st.own_score, st.score);
    st.spill_raised = LEVEL_ORDER.indexOf(st.level) > LEVEL_ORDER.indexOf(st.alert_level);
    st.signals.reverse();
  }
  return { ts: new Date(ref).toISOString(), window_min: WINDOW_MIN,
           thresholds: { elevated: TH_ELEVATED, high: TH_HIGH }, voivodeships: per };
}

async function notifyNative(title, body, high) {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try {
      // te same kanały, które tworzy strona natywna (Alarms.createChannels) —
      // inaczej powiadomienie z otwartej aplikacji trafiało w kanał kasowany przy
      // starcie i nie pokazywało się z właściwym dźwiękiem ani jako heads-up
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
  // Wyciszenie z dzwonka musi działać też tutaj — wcześniej czytał je wyłącznie
  // interfejs, więc tryb awaryjny powiadamiał mimo wyciszenia.
  try { if (localStorage.getItem("straznik_notif_on") === "0") return false; } catch {}
  // Wszystkie obserwowane „Moje miejsca", nie tylko pierwsze: drugie miejsce
  // w innym województwie nie dostawało w trybie awaryjnym żadnego alarmu.
  try {
    const places = globalThis.Places?.migrate?.(localStorage) || [];
    const observed = globalThis.Places?.observedVoivodeships?.(places) || [];
    if (observed.length) return observed.includes(voiv);
  } catch {}
  const mine = localStorage.getItem("straznik_voiv");
  return mine ? voiv === mine : PRIORITY_VOIVS.includes(voiv);
}

function reevaluate() {
  const st = computeState();
  for (const [voiv, s] of Object.entries(st.voivodeships)) {
    const prev = lastLevels[voiv] || "none";
    // poziom powiadomień (lustro fusion.reevaluate), nie kolor mapy
    const level = s.alert_level;
    if (level === prev) continue;
    const rising = LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(prev);
    lastLevels[voiv] = level;
    persistLevels();
    if (!rising || !shouldNotify(voiv)) continue;
    const ck = voiv + "|" + level, last = lastNotif[ck];
    // powrót na ten sam poziom krótko po powiadomieniu — bez dźwięku, chyba że
    // doszedł nowy alert RCB/RSO albo obiekt NEPTUN
    if (last && Date.now() - last < ALERT_REPEAT_QUIET_MIN*60*1000
        && !freshStrongSignal(s.signals, last)) continue;
    if (last && Date.now() - last < COOLDOWN_MIN*60*1000) continue;
    lastNotif[ck] = Date.now();
    persistLevels();
    const brk = s.signals.slice(0,5).map(x => `• [${x.source}] ${x.title}`).join("\n");
    notifyNative(`${LEVEL_LABELS[level]}: woj. ${voiv} (${s.score} pkt)`,
      brk + "\nNIEOFICJALNE źródło — kieruj się syrenami/RCB/RSO.", level === "high");
  }
  emit();
}

/* ── kolektor: Neptun (WS bezpośrednio z telefonu) ───────────────────────── */
/* Punktacja obiektu — lustrzana kopia reguły z backendu:
   waga typu × √liczba × k_odległości × k_wiarygodności × k_potwierdzeń × k_cyklu. */
function distMult(km) {
  const p = NEPTUN_DIST_CURVE;
  if (km <= p[0][0]) return p[0][1];
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[i + 1];
    if (km <= x2) return Math.round((y1 + (y2 - y1) * (km - x1) / (x2 - x1)) * 10000) / 10000;
  }
  return 0;
}
function sourceMult(n) {
  for (const [limit, mult] of NEPTUN_SOURCE_MULT) if (n <= limit) return mult;
  return NEPTUN_SOURCE_MULT_MAX;
}
function scoreThreat(t, distKm, courseFactorVal = 1) {
  const weight = NEPTUN_TYPE_WEIGHTS[(t.type || "").toLowerCase()] || 0;
  if (weight <= 0 || distKm >= NEPTUN_MAX_KM) return 0;
  const count = Math.max(parseInt(t.count) || 1, 1);
  const conf = (t.confidenceLevel || "low").toLowerCase();
  const life = (t.lifecycle || "uncertain").toLowerCase();
  const sources = Math.max(parseInt(t.sourceCount) || 1, 1);
  const positionFactor = NEPTUN_POSITION_MULT[(t.straznik_position || positionInfo(t)).reason] ?? 1;
  const p = weight * Math.sqrt(count) * distMult(distKm)
    * (NEPTUN_CONF_MULT[conf] ?? 0.35) * sourceMult(sources)
    * (NEPTUN_LIFECYCLE_MULT[life] ?? 0.85)
    * positionFactor
    * courseFactorVal;          // waga kursu (lustro geo.course_factor)
  // podłoga dla ciężkich typów tuż przy granicy, skalowana pewnością kursu
  const pts = (!isApproxPosition(t) && NEAR_FLOOR_TYPES.includes((t.type || "").toLowerCase())
      && distKm <= NEAR_FLOOR_KM && sources >= NEAR_FLOOR_SOURCES)
    ? Math.max(p, NEAR_FLOOR_POINTS * courseFactorVal) : p;
  return Math.round(pts * 100) / 100;
}

/* Ostatnia pozycja tracka — kurs wyliczany z ruchu, gdy NEPTUN go nie podaje. */
const lastPos = new Map();
function movementHeading(t) {
  const prev = lastPos.get(t.id);
  if (prev && haversine(prev[0], prev[1], t.lat, t.lon) >= 2) {
    const est = bearing(prev[0], prev[1], t.lat, t.lon);
    t.heading_movement = Math.round(est * 10) / 10;
    return est;
  }
  return null;
}
function headingOf(t) {
  const moved = movementHeading(t);
  if (t.heading != null) return t.heading;
  if (moved != null) { t.heading_estimated = Math.round(moved * 10) / 10; return moved; }
  return null;
}
/* G3/G6 — lustro neptun.heading_source i neptun.is_jet */
const headingSourceOf = (t) => t.heading != null
  ? (t.presumptiveCourse === true ? "presumptive" : "reported")
  : (t.heading_estimated != null ? "measured" : "unknown");
const JET_MARKERS = ["реактивн"], JET_SPEED_KMH = 450;   // decyzja usera 14.09.2026
const isJet = (t) => JET_MARKERS.some(m => `${t.title || ""} ${t.explanationShort || ""}`.toLowerCase().includes(m));
/* Prędkość: ze źródła, a gdy brak — typowa dla klasy (NEPTUN jej nie podaje). */
const TYPE_SPEED_KMH = { uav: 180, shahed: 180, fpv: 100, missile: 800, cruise: 800,
  ballistic: 3000, kab: 900, mig31k: 900, recon: 180 };
const positionQuality = (t) => String(t?.positionQuality
  ?? t?.source_metadata?.source_fields?.positionQuality ?? "").toLowerCase();
function positionInfo(t) {
  if (positionQuality(t) === "approx" || t?.areaOnly === true)
    return { quality:"approx", reason:"source_approx" };
  if (t?.lat != null && t?.lon != null) for (const a of NEPTUN_LOCALITY_ANCHORS)
    if (haversine(t.lat, t.lon, a.lat, a.lon) <= 0.25)
      return { quality:"approx", reason:"locality_center", locality:a.name };
  return { quality:"point", reason:"source_point" };
}
const isApproxPosition = (t) => (t?.straznik_position || positionInfo(t)).quality === "approx";
const physicalKey = (t) => isApproxPosition(t)
  ? `area:${(t.type||"unknown").toLowerCase()}:${(+t.lat).toFixed(3)}:${(+t.lon).toFixed(3)}`
  : `track:${t.id}`;
const areaDistance = (km) => km < 10 ? "mniej niż 10 km"
  : `około ${Math.round(km / 10) * 10} km`;
const speedOf = (t) => t.velocity?.speedKmh || (isJet(t) ? JET_SPEED_KMH : null)
  || TYPE_SPEED_KMH[(t.type || "").toLowerCase()] || null;
const etaRawMinutes = (km, kmh) => (km == null || !kmh) ? null : Math.max(0, km / kmh * 60);
const etaMinutes = (km, kmh) => {
  const raw = etaRawMinutes(km, kmh);
  return raw == null ? null : Math.max(0, Math.floor(raw - ETA_BUFFER_MIN));
};
/* Odległość do województwa liczymy z tych samych punktów granicy co ocena
   zagrożenia — w trybie wbudowanym nie mamy pełnych obrysów, więc bierzemy
   najbliższy punkt granicy przypisany do danego województwa. */
function etaPerVoiv(t) {
  if (isApproxPosition(t)) return {};
  const sp = speedOf(t);
  if (!sp || t.lat == null) return {};
  const best = {};
  for (const [bl, bo, v] of BORDER_POINTS) {
    const d = haversine(t.lat, t.lon, bl, bo);
    if (best[v] == null || d < best[v]) best[v] = d;
  }
  const out = {};
  for (const [v, d] of Object.entries(best)) out[v] = etaMinutes(d, sp);
  return out;
}

function neptunEval(t) {
  if (isNationalThreat(t)) {
    // umowny punkt: bez odległości, kursu i punktów (jak neptun._evaluate na serwerze)
    t.straznik_national = { since: t.confirmedAt || t.createdAt || t.updatedAt || null };
    t.straznik_position = { quality: "approx", reason: "national_alert" };
    t.pl_assessment = null;
    return t;
  }
  if (t.lat == null) return t;
  t.straznik_position = positionInfo(t);
  t.pl_assessment = assess(t.lat, t.lon, headingOf(t));
  t.heading_source = headingSourceOf(t);
  if (isJet(t)) t.straznik_jet = true;
  if (t.id != null) lastPos.set(t.id, [t.lat, t.lon]);
  const a = t.pl_assessment, ty = (t.type||"").toLowerCase();
  if (a.toward_pl) {
    let points = scoreThreat(t, a.dist_km, a.course_factor);
    if (points > 0) {
      const count = Math.max(parseInt(t.count) || 1, 1);
      const conf = (t.confidenceLevel||"low").toLowerCase();
      const sources = Math.max(parseInt(t.sourceCount) || 1, 1);
      const approx = isApproxPosition(t);
      const speed = approx ? null : speedOf(t), etaRaw = etaRawMinutes(a.dist_km, speed);
      const etaConservative = etaRaw == null ? null : Math.max(0, etaRaw - ETA_BUFFER_MIN);
      const etaSafe = etaMinutes(a.dist_km, speed);
      let etaAlarm = null;
      // G3: przy kursie domniemanym alarm ETA tylko z kursu z ruchu
      const presumed = t.heading_source === "presumptive";
      const etaA = !presumed ? a
        : (t.heading_movement != null ? assess(t.lat, t.lon, t.heading_movement) : { heading_known: false });
      const etaEligible = !approx && etaA.heading_known && etaA.toward_pl !== false && sources >= ETA_MIN_SOURCES
        && ["medium", "high"].includes(conf) && etaConservative != null;
      if (etaEligible && etaConservative <= ETA_HIGH_MIN) {
        etaAlarm = "high"; points = Math.max(points, TH_HIGH);
      } else if (etaEligible && etaConservative <= ETA_ELEVATED_MIN) {
        etaAlarm = "elevated"; points = Math.max(points, TH_ELEVATED);
      }
      const ile = count > 1 ? `${count}× ` : "";
      // poziom w kluczu: gdy obiekt się zbliży lub zyska potwierdzenia,
      // sygnał wchodzi ponownie z wyższą punktacją
      const tier = Math.floor(points * 2);
      const distanceInfo = approx ? `${areaDistance(a.dist_km)} [pozycja rejonowa]`
        : `${a.dist_km} km`;
      addSignal("neptun", "neptun_threat", a.border_voiv, points,
        `${ile}${neptunTypeLabelPL(ty)} kursem na granicę PL, ${distanceInfo}`
        + `${etaAlarm ? `, konserwatywny czas dolotu ~${etaSafe} min` : ""} (woj. ${a.border_voiv}, `
        + `confidence: ${conf}, ${sources} potwierdzeń, ±${t.uncertaintyKm??"?"} km)`,
        { track_id: t.id, dist_km: a.dist_km, count, source_count: sources,
          position_quality: t.positionQuality,
          position_approximate: approx,
          position_reason: t.straznik_position.reason,
          position_locality: t.straznik_position.locality,
          distance_display_km: approx ? Math.round(a.dist_km / 10) * 10 : a.dist_km,
          physical_key: physicalKey(t),
          // czas dolotu (lustro backendu): do granicy oraz do każdego woj. —
          // panel pokazuje ten dla regionu wybranego przez użytkownika
          speed_kmh: speed,
          eta_raw_border_min: etaRaw == null ? null : Math.round(etaRaw * 10) / 10,
          eta_border_min: etaSafe,
          eta_buffer_min: ETA_BUFFER_MIN,
          eta_alarm: etaAlarm,
          eta_voiv_min: etaPerVoiv(t),
          course: presumed ? "presumptive" : a.heading_known ? "known"
                : (t.heading_estimated != null ? "estimated" : "unknown"),
          heading_source: t.heading_source, jet: !!t.straznik_jet,
          course_factor: a.course_factor },
        `neptun:${t.id}:t${tier}`);
    }
  }
  return t;
}
const ALERT_LEVELS_OFF = new Set(["none","green","off","clear","no","false"]);
/* Epizody alarmów obwodów (lustro backendu): obwód → początek; koniec po
   UA_ALERT_END_GRACE_S nieobecności na liście przy otwartym połączeniu. */
const uaEpisodes = new Map(), uaAbsentSince = new Map();
function uaFinishEnded(now = Date.now()) {
  if (!ws || ws.readyState !== 1) return;
  for (const [ob, gone] of [...uaAbsentSince]) {
    if (now - gone < UA_ALERT_END_GRACE_S * 1000) continue;
    uaAbsentSince.delete(ob);
    const ep = uaEpisodes.get(ob); uaEpisodes.delete(ob);
    if (!ep) continue;
    for (const [v, km] of Object.entries(UA_ALERT_OBLASTS[ob] || {})) {
      if (uaAlertWeight(km) <= 0) continue;
      addSignal("ua_alert","ua_alert_end",v,0,
        `Koniec alarmu powietrznego w obwodzie ${UA_OBLAST_PL[ob] || ob} (woj. ${v})`,
        {oblast:ob, episode:ep, ended_at:new Date(gone).toISOString()},
        `neptun_alert_end:${ob}:${v}:${ep}`);
    }
  }
}
function neptunAlerts(data) {
  // Obwody z aktywnym alarmem bierzemy z `oblasts` ORAZ `raions`: w `oblasts`
  // NEPTUN trzyma wyłącznie obwody okupowane (alarm od 2022), więc sam ten sygnał
  // nie zadziałał ani razu. Alarmy zachodniej Ukrainy przychodzą jako rejony,
  // z nazwą obwodu w polu `oblast` (audyt 11.09.2026 — lustro backendu).
  const since = new Map();       // obwód → najwcześniejszy `since` aktywnych rejonów
  for (const field of ["oblasts","raions"])
    for (const it of (data?.[field]||[])) {
      let name, sin = null;
      if (typeof it === "string") name = it;
      else if (!it || ALERT_LEVELS_OFF.has(String(it.level||"").toLowerCase())) continue;
      else { name = it.oblast || it.name || it.region || it.title || ""; sin = it.since || null; }
      for (const ob of Object.keys(UA_ALERT_OBLASTS)) if (String(name).includes(ob)) {
        const prev = since.get(ob);
        since.set(ob, prev && sin ? (prev < sin ? prev : sin) : (prev || sin));
      }
    }
  const now = Date.now();
  for (const [ob, sin] of since) {
    uaAbsentSince.delete(ob);
    if (uaEpisodes.has(ob)) continue;
    const ep = new Date(Date.parse(sin || "") || now).toISOString().replace(/\.\d{3}Z$/, "+00:00");
    uaEpisodes.set(ob, ep);
    for (const [v, km] of Object.entries(UA_ALERT_OBLASTS[ob])) {
      const w = uaAlertWeight(km);
      if (w <= 0) continue;
      const where = km <= 0 ? "przy granicy" : `${km} km`;
      addSignal("ua_alert","ua_alert_border",v,
        Math.round(POINTS.ua_alert_border * w * 100) / 100,
        `Alarm powietrzny w obwodzie ${UA_OBLAST_PL[ob] || ob} (woj. ${v} — ${where})`,
        {oblast:ob, distance_km:km, episode:ep},
        `neptun_alert:${ob}:${v}:${ep}`);
    }
  }
  for (const ob of uaEpisodes.keys()) if (!since.has(ob) && !uaAbsentSince.has(ob)) uaAbsentSince.set(ob, now);
  alertOblasts = new Set(since.keys());
  uaFinishEnded(now);
}
/* Silnik da się ZATRZYMAĆ: gdy serwer wróci, przełączamy się na niego w locie,
   zamiast trzymać dwa źródła stanu naraz (i zamiast przeładowywać apkę pod
   palcami użytkownika). `stopped` blokuje wszystko, co mogłoby jeszcze wystrzelić
   z zaległych żądań, a `timers` trzyma uchwyty do wyczyszczenia. */
let stopped = false;
const timers = [];
const every = (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return id; };
const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

function startNeptun() {
  if (stopped) return;
  wsRetryPending = false;
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
  // WebSocket po `error` emituje także `close`; retry robimy dopiero tam, bo
  // tylko close niesie kod 1013 i powód „server full”.
  ws.onerror = () => { markHealth("neptun", false); };
  ws.onclose = (e) => {
    markHealth("neptun", false);
    const full = e?.code === 1013 || String(e?.reason || "").toLowerCase().includes("server full");
    retryNeptun(full ? 15000 + Math.random() * 15000 : null);
  };
}
function retryNeptun(forcedDelay = null) {
  if (wsRetryPending) return; // onerror i onclose dotyczą zwykle tego samego zerwania
  if (ws) { ws.onclose = ws.onerror = null; try { ws.close(); } catch {} ws = null; }
  if (stopped) return;
  wsRetryPending = true;
  later(startNeptun, forcedDelay ?? Math.min(wsRetry*1000, 30000));
  wsRetry = forcedDelay == null ? Math.min(wsRetry*2, 30) : 30;
}

/* Zatrzymanie silnika: gasi wszystkie interwały/timery i zamyka gniazdo Neptuna.
   Po tym żaden kolektor nie odpytuje już źródeł ani nie zgłasza stanu do UI. */
function stop() {
  if (stopped) return;
  stopped = true;
  for (const id of timers) { clearInterval(id); clearTimeout(id); }
  timers.length = 0;
  if (ws) { ws.onclose = ws.onerror = ws.onmessage = null; try { ws.close(); } catch {} ws = null; }
  onState = null;   // zaległe odpowiedzi nie wepchną już stanu do UI
}

/* ── kolektor: ADS-B ─────────────────────────────────────────────────────── */
const ADSB_MIL_PREFIXES = ["NATO","MMF","REDEYE","BART","OSY","PLF","HKY","VIPER",
  "WOLF","FENIX","DUKE","TIGER","KAPLAN","TUAF","TURAF","SOLOTURK"];
const ADSB_MIL_TYPES = new Set(["F16","F15","F18","FA18","F35","EUFI","RFAL","JAS39",
  "MIR2","M2K","SU27","SU30","SU35","MIG29","MIG31","A10","B1","B2","B52",
  "E3CF","E3TF","A400","C130","C17","KC135","ATLA"]);
function looksMilitaryAdsb(a) {
  if ((Number(a.dbFlags)||0) & 1) return true;
  const call = String(a.flight||"").trim().toUpperCase();
  if (ADSB_MIL_PREFIXES.some(p => call.startsWith(p))) return true;
  const type = String(a.t||"").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ADSB_MIL_TYPES.has(type)) return true;
  return /air ?force|army|navy|military|nato|force aérienne|luftwaffe|türk hava|turkish af|polish af/i
    .test(String(a.ownOp||""));
}
async function tickAdsb() {
  try {
    /* airplanes.live wzbogaca rekordy o pełną nazwę typu (desc), operatora (ownOp)
       i rok — adsb.lol tego nie zwraca. Wszystkie mają ten sam format /v2/mil,
       więc kolejność można zmieniać bez ruszania reszty kodu. */
    let txt = null;
    /* Kolejność wg tego, co REALNIE odpowiada (sprawdzone 20.08.2026):
       airplanes.live zaczął zwracać 403, więc pytamy najpierw adsb.lol; gdy
       airplanes.live wróci, znów wzbogaci karty o desc/ownOp. opendata.adsb.fi
       to trzeci zapas (stary api.adsb.fi/v2 już nie istnieje — 404). */
    let base = null;
    for (const u of ["https://api.adsb.lol/v2/mil", "https://api.airplanes.live/v2/mil",
                     "https://opendata.adsb.fi/api/v2/mil"]) {
      try { txt = await httpGet(u); if (txt) { base = u.replace(/\/mil$/, ""); break; } } catch {}
    }
    if (!txt) throw new Error("brak odpowiedzi ADS-B");
    const merged = new Map();
    for (const a of (JSON.parse(txt).ac||[])) {
      const key = a.hex || `${a.lat}:${a.lon}:${a.flight}`;
      merged.set(key, {...a, _straznik_detection:"mil_registry"});
    }
    // Gdy backend jest niedostępny, standalone nadal sam sprawdza Bałtyk. Dwa
    // niewielkie koła/min są filtrowane lokalnie i nie pobierają globalnego ruchu.
    if (base) {
      const points = [[55.5,24.0,220],[58.2,25.5,220]];
      const geo = await Promise.all(points.map(([lat,lon,r]) =>
        httpGet(`${base}/point/${lat}/${lon}/${r}`).catch(() => null)));
      for (const body of geo) {
        if (!body) continue;
        for (const a of (JSON.parse(body).ac||[])) {
          if (!looksMilitaryAdsb(a)) continue;
          const key = a.hex || `${a.lat}:${a.lon}:${a.flight}`;
          if (!merged.has(key)) merged.set(key, {...a, _straznik_detection:"baltic_geo"});
        }
      }
    }
    const ac = [...merged.values()];
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
                  source:(a.mlat&&a.mlat.length)?"MLAT":(a.tisb&&a.tisb.length)?"TIS-B":"ADS-B",
                  detection:a._straznik_detection||"mil_registry" };
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
    // baseline używa 7 dni, więc 14 dni tylko zajmowało miejsce (audyt C13);
    // górny limit próbek chroni przed rozrostem przy długiej pracy offline
    safeSet("eng_adsb",
      JSON.stringify(samples.filter(s => now - s[0] < 7*24*3600*1000).slice(-40000)));
    markHealth("adsb", true);
  } catch (e) { markHealth("adsb", false); }
  emit();
}

/* ── kolektor: RSS (PL + bałtyckie) ──────────────────────────────────────── */
/* Adres z kanału RSS trafia potem do `href` w panelu sygnałów, więc odsiewamy
   wszystko poza http(s) już przy wczytaniu — „javascript:" z przejętego kanału
   nie może stać się klikalnym kodem (lustro `safeUrl` w app.js). */
function feedLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, "https://example.invalid/");
    return (parsed.protocol === "http:" || parsed.protocol === "https:") ? value : "";
  } catch { return ""; }
}
function parseFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  return [...doc.querySelectorAll("item, entry")].map(it => ({
    title: it.querySelector("title")?.textContent || "",
    link: feedLink(it.querySelector("link")?.getAttribute("href") || it.querySelector("link")?.textContent || ""),
    desc: it.querySelector("description, summary, content")?.textContent || "",
    date: it.querySelector("pubDate, published, updated")?.textContent || "",
  }));
}
function balticIncidentKey(link, title, country) {
  const s = String(link || "");
  const m = s.match(/(?:^|[./-])(a\d{5,})(?:[/?#.-]|$)/i)
    || s.match(/(?:^|[./-])(\d{7,})(?:[/?#.-]|$)/);
  if (m) return `${country}:${m[1].toLowerCase()}`;
  let basis = String(title || "").toLowerCase();
  try { basis = new URL(s).pathname.replace(/\/$/, "").split("/").pop() || basis; } catch {}
  let h = 2166136261;
  for (let i=0; i<basis.length; i++) h = Math.imul(h ^ basis.charCodeAt(i), 16777619);
  return `${country}:fallback:${(h >>> 0).toString(16)}`;
}
/* Ten sam alarm w dwóch redakcjach to jedno zdarzenie (lustro rss_media). */
const balticActive = new Map(), balticClearsSeen = new Set(), balticAlerted = new Set();
const BALTIC_ACTIVE_MS = 3*3600*1000;
async function tickRss() {
  for (const [url, defVoiv] of RSS_FEEDS) {
    try {
      const items = parseFeed(await httpGet(url));
      markRss(url, true);
      for (const it of items.slice(0,30)) {
        const age = it.date ? Date.now() - new Date(it.date).getTime() : 0;
        if (age > MAX_AGE_MS) continue;
        const text = it.title + " " + stripTeasers(it.desc);
        // RSS jest wyłącznie wsparciem: relacja operacyjna = 1,5, a słabsze
        // obiekt+zdarzenie = 1,0. Limit całej klasy 1,5 blokuje alarm z samych mediów.
        const { level, hits } = matchLevel(text, CRITICAL, AIR, EVENT, EXCLUDE);
        if (!level) continue;
        const pts = level === "critical" ? POINTS.media_critical : POINTS.media_keywords;
        const voivs = matchVoivs(text);
        const targets = voivs.length ? voivs
          : (defVoiv && !mentionsAbroad(text) ? [defVoiv] : []);
        // Tekst mówiący, że jest PO wszystkim, nie jest dowodem zagrożenia:
        // 0 pkt i wygaszenie wcześniejszych mediów w tym województwie.
        if (isMediaClear(text)) {
          for (const voiv of targets)
            addSignal("media","media_clear",voiv,0,
              `Media: odwołanie — „${it.title.slice(0,110)}”`,
              {link:it.link, clear:true},
              "media-clear:" + (it.link || it.title) + ":" + voiv);
          continue;
        }
        for (const voiv of targets)
          /* Serwer czyta cały artykuł przed przyznaniem punktów; tryb awaryjny
             tego nie robi, więc artykuł jest widoczny z linkiem, ale bez punktów
             (decyzja z 13.09.2026: bez przeczytania treści — 0 pkt). */
          addSignal("media","media_keywords",voiv,pts,
            `Media: „${it.title.slice(0,120)}”`,
            {link:it.link, keywords:hits, level, voivodeships:voivs,
             article:{status:"unreadable", url:it.link,
                      reason:"tryb awaryjny — aplikacja nie czyta treści artykułów"}},
            "media:" + (it.link || it.title) + ":" + voiv);
      }
    } catch { markRss(url, false); }
  }
  for (const [url, country] of BALTIC_FEEDS) {
    try {
      const items = parseFeed(await httpGet(url));
      // 200 bez artykułów z datą to martwy kanał (delfi.lt po zmianie adresu)
      if (!items.some(it => it.date)) { markRss(url, false); continue; }
      markRss(url, true);
      for (const it of items.slice(0,40)) {
        const age = it.date ? Date.now() - new Date(it.date).getTime() : 0;
        if (age > BALTIC_CLEAR_MAX_AGE_MS) continue;
        const text = (it.title + " " + it.desc).toLowerCase();
        const incident = balticIncidentKey(it.link, it.title, country);
        if (BALTIC_CLEAR.some(k => text.includes(k))
            && BALTIC_CLEAR_CONTEXT.some(k => text.includes(k))) {
          if (balticClearsSeen.has(incident)) continue;
          balticClearsSeen.add(incident);
          const keys = new Set(balticAlerted.has(incident) ? [incident] : []);
          const active = balticActive.get(country);
          balticActive.delete(country);
          if (active && Date.now() - active.at < BALTIC_ACTIVE_MS) keys.add(active.key);
          for (const key of keys) for (const v of BALTIC_TARGETS)
            addSignal("media","baltic_clear",v,0,
              `Media ${country}: odwołanie — „${it.title.slice(0,100)}”`,
              {link:it.link, country, incident_key:key, clear:true},
              `baltic-clear:${key}:${v}`);
          continue;
        }
        if (age > MAX_AGE_MS) continue;
        const words = new Set(text.match(/[\p{L}\p{N}_]+/gu) || []);
        if (!B_EXCLUDE.some(k => text.includes(k)) && !BALTIC_ALERT_PAST.some(k => words.has(k))) {
          // alarm tylko z TYTUŁU, bez artykułów-rozmów o alarmach
          const titleL = " " + String(it.title || "").toLowerCase();
          const alertHits = BALTIC_DISCUSSION.some(k => titleL.includes(k)) ? []
            : B_ALERT.filter(k => titleL.includes(k));
          if (alertHits.length) {
            const active = balticActive.get(country);
            if (active && Date.now() - active.at < BALTIC_ACTIVE_MS && active.key !== incident) continue;
            if (!active) balticActive.set(country, {key: incident, at: Date.now()});
            const w = BALTIC_ALERT_COUNTRY_WEIGHTS[country] ?? 0.4;
            for (const v of BALTIC_TARGETS)
              addSignal("media","baltic_alert",v,
                Math.round(POINTS.baltic_alert * w * (BALTIC_TARGET_WEIGHTS[v] ?? 1) * 100) / 100,
                `Alarm powietrzny — ${BALTIC_COUNTRY_NAMES[country] || country}: „${it.title.slice(0,110)}”`,
                {link:it.link, keywords:alertHits, country, incident_key:incident},
                `baltic-alert:${incident}:${v}`);
            balticAlerted.add(incident);
            continue;
          }
        }
        if (BALTIC_FOREIGN.some(k => String(it.title || "").toLowerCase().includes(k))) continue;
        const hits = matchKw(text, B_CRITICAL, B_AIR, B_EVENT, B_EXCLUDE);
        if (!hits.length) continue;
        for (const v of BALTIC_TARGETS)
          addSignal("media","baltic_context",v,
            POINTS.baltic_context * (BALTIC_TARGET_WEIGHTS[v] ?? 1),
            `Media ${country}: „${it.title.slice(0,110)}”`,
            {link:it.link, country, incident_key:incident},
            `baltic:${it.link||it.title}:${v}`);
        balticAlerted.add(incident);
      }
    } catch { markRss(url, false); }
  }
  emit();
}

/* ── kolektor: RCB ───────────────────────────────────────────────────────── */
async function tickRcb() {
  try {
    const html = await httpGet("https://www.gov.pl/web/rcb");
    const re = /href="(\/web\/rcb\/[a-z0-9-]{8,})"[^>]*>([\s\S]*?)<\/a>/gi;
    let m, found = [];
    // Wszystkie linki: pierwsze 20 to samo menu nawigacji (E3, 13.09.2026).
    const hrefs = new Set();
    while ((m = re.exec(html))) {
      const title = m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      if (title.length >= 8 && !hrefs.has(m[1])) { hrefs.add(m[1]); found.push([m[1], title]); }
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
        // Tylko punkt odniesienia czasowego — prawdziwe alerty daje RSO niżej.
        addSignal("rcb","rcb_govpl",v,0,`RCB (gov.pl, odniesienie): „${title.slice(0,120)}”`,
          {url:"https://www.gov.pl"+href, reference_only:true}, `rcb:${href}:${v}`);
    }
    rcbBootstrapped = true;
    safeSet("eng_rcb_boot", "1");
    persist();
  } catch { /* gov.pl to tylko punkt odniesienia — dioda pokazuje RSO */ }
  emit();
}

/* ── kolektor: oficjalne alerty RCB przez RSO ────────────────────────────────
   Lustro backendowego `rso.py`. Scraping gov.pl (wyżej) NIE łapie prawdziwych
   „Alertów RCB" — to broadcasty SMS/RSO, nie wpisy na stronie; 20.08.2026 ludzie
   dostali alert, a Strażnik go nie widział. RSO wystawia je publicznie w JSON.

   UWAGA na obciążenie źródła: backend odpytuje RAZ dla wszystkich, a tutaj każdy
   telefon pyta sam. Dlatego rzadziej (3 min zamiast 60 s) i tylko w trybie
   wbudowanym, który jest awaryjny — przy działającym serwerze ten kod nie biegnie.
   Odpowiedź to ~20 rekordów, więc koszt jest niewielki. */
const RSO_URL = "https://komunikaty.tvp.pl/komunikatyxml/wszystkie/wszystkie/1?_format=json";
const RSO_ORIGIN = ["alert rcb","uwaga! uwaga! uwaga","uwaga!uwaga!uwaga","spo-","rcb"];
const RSO_AIR = ["powietrzn","z powietrza","dron","bezzałogow","bezzalogow","bsp","shahed",
  "geran","rakiet","pocisk","nalot","ostrzał","ostrzal","obiekt lataj",
  "naruszenie przestrzeni","myśliwc","mysliwc","obrony powietrzn","obiekt powietrzn"];
// komunikat KOŃCZĄCY zagrożenie nie może wywołać alarmu
const RSO_END = ["zakończył","zakonczyl","zakończen","zakonczen","odwoł","odwol",
  "brak zagroż","brak zagroz","zniesion","sytuacja opanowan"];

let rsoBootstrapped = localStorage.getItem("eng_rso_boot") === "1";
const rsoSeen = new Set(JSON.parse(localStorage.getItem("eng_rso_seen") || "[]"));

const RSO_CONTINUES = ["do odwołania","do odwolania","do czasu odwołania","do czasu odwolania",
  "do czasu zakończenia","do czasu zakonczenia","aż do odwołania","az do odwolania"];
/* Odwołanie: rso_alarm = 2 albo zwrot końca w tytule/skrócie (lustro rso.py). */
function rsoIsCancellation(it) {
  if (String(it.rso_alarm ?? "").trim() === "2") return true;
  let head = `${it.title || ""} ${it.shortcut || ""}`.toLowerCase();
  for (const c of RSO_CONTINUES) head = head.split(c).join(" ");
  return RSO_END.some(w => head.includes(w));
}

async function tickRso() {
  try {
    const j = JSON.parse(await httpGet(RSO_URL));
    for (const it of (j.newses || [])) {
      const text = `${it.title || ""} ${it.shortcut || ""} ${it.content || ""}`.toLowerCase();
      if (!RSO_ORIGIN.some(w => text.includes(w))) continue;   // musi pochodzić od RCB
      if (!RSO_AIR.some(w => text.includes(w))) continue;      // …i dotyczyć powietrza
      const cancelled = rsoIsCancellation(it);
      // pomiń wygasłe (valid_to jest w czasie lokalnym PL — tak też czyta je telefon)
      const vt = Date.parse(String(it.valid_to || "").replace(" ", "T"));
      if (isFinite(vt) && vt < Date.now() - 3600000) continue;
      const voivs = [];
      for (const p of Object.values(it.provinces || {})) {
        const hit = VOIVODESHIPS.find(v => fold(v) === fold((p && (p.slug_name || p.name)) || ""));
        if (hit && !voivs.includes(hit)) voivs.push(hit);
      }
      if (!voivs.length) voivs.push("lubelskie","podkarpackie","podlaskie","warmińsko-mazurskie");
      for (const v of voivs) {
        if (cancelled) {
          /* Odwołanie (0 pkt) zapisujemy także przy pierwszym obiegu — fuzja
             porównuje czasy wydania, więc nie zgasi nowszego alertu. */
          addSignal("rcb", "rso_clear", v, 0,
            `RCB (RSO): odwołanie — „${String(it.shortcut || it.title || "").slice(0,120)}”`,
            { rso_id: String(it.id), clear: true, updated_at: it.updated_at,
              cleared_at: new Date(plLocalToMs(it.updated_at || it.created_at || it.valid_from)
                || Date.now()).toISOString() }, `rso-clear:${it.id}:${v}`);
          continue;
        }
        const key = `rso:${it.id}:${v}`;
        if (!rsoBootstrapped) { rsoSeen.add(key); continue; }   // istniejące przy starcie nie alarmują
        if (rsoSeen.has(key)) continue;
        rsoSeen.add(key);
        addSignal("rcb", "rso_alert", v, POINTS.rcb_alert,
          `Alert RCB (RSO): „${String(it.shortcut || it.title || "").slice(0,120)}”`,
          { rso_id: String(it.id), valid_from: it.valid_from, valid_to: it.valid_to }, key);
      }
    }
    rsoBootstrapped = true;
    safeSet("eng_rso_boot", "1");
    safeSet("eng_rso_seen", JSON.stringify([...rsoSeen].slice(-200)));
    persist();
    markHealth("rcb", true);   // dioda „RCB/RSO" = stan RSO, jak na serwerze
  } catch { markHealth("rcb", false); }
  emit();
}

/* ── kolektor: PAŻP (AUP/UUP — publiczny GeoJSON mapy airspace.pansa.pl) ── */
let voivPolys = null;
/* Zbiór stref z poprzedniego obiegu MUSI przeżyć zamknięcie aplikacji: sygnałem
   jest POJAWIENIE SIĘ nowej strefy, nie jej trwanie. Trzymany dotąd w RAM
   zerował się przy każdym starcie, więc pierwszy obieg tylko zapamiętywał stan,
   a strefa aktywowana przy zamkniętej aplikacji nigdy nie wchodziła do
   punktacji. Dlatego zapisujemy go trwale w localStorage. */
const PANSA_ZONES_KEY = "eng_pansa_zones";
const PANSA_SEEN_KEY = "eng_pansa_seen_7d", PANSA_REPEAT_MS = 7 * 24 * 3600 * 1000;
const PANSA_ROUTINE_TYPES = new Set(["TRA", "TSA", "MRT", "ATZ"]);
const PANSA_SCORING_TYPES = new Set(["ADHOC", "R", "NPZ", "D"]);
function loadPrevZones() {
  const raw = localStorage.getItem(PANSA_ZONES_KEY);
  if (raw == null) return null;             // nigdy nie było obiegu → bootstrap
  try { return new Set(JSON.parse(raw)); } catch { return null; }
}
function savePrevZones(zones) {
  try { localStorage.setItem(PANSA_ZONES_KEY, JSON.stringify([...zones])); } catch {}
}
function loadPansaSeen(now) {
  try {
    const raw = JSON.parse(localStorage.getItem(PANSA_SEEN_KEY) || "{}");
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => now - Number(t) <= PANSA_REPEAT_MS));
  } catch { return {}; }
}
function savePansaSeen(seen) {
  try { localStorage.setItem(PANSA_SEEN_KEY, JSON.stringify(seen)); } catch {}
}
function shouldScorePansa(dz, info, seen, now) {
  const ty = String(info.type || "").toUpperCase();
  const lo = String(info.lower || "").toUpperCase();
  const up = String(info.upper || "").toUpperCase();
  if (PANSA_ROUTINE_TYPES.has(ty) || !PANSA_SCORING_TYPES.has(ty)) return false;
  if (!(lo === "GND" && up.startsWith("F"))) return false;
  return seen[dz] == null || now - Number(seen[dz]) > PANSA_REPEAT_MS;
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
    const prevZones = loadPrevZones(), seen = loadPansaSeen(now);
    if (prevZones) {
      for (const [dz, info] of active) {
        if (prevZones.has(dz) || !PRIORITY_VOIVS.includes(info.voiv)) continue;
        // TRA/TSA/MRT/ATZ to rutyna nawet przy GND–F. Punktujemy tylko rzadkie
        // ADHOC/R/NPZ/D z pełną kolumną, jeśli designator nie wracał przez 7 dni.
        if (!shouldScorePansa(dz, info, seen, now)) continue;
        addSignal("pansa","pansa_zone",info.voiv,POINTS.pansa_zone,
          `PAŻP: aktywacja strefy ${(info.type||"")} ${dz} nad woj. ${info.voiv} `
          + `(${info.lower}–${info.upper}${info.remarks ? ", " + info.remarks : ""})`,
          { designator: dz, ...info }, `pansa:${dz}:${info.end}`);
      }
    }
    for (const dz of active.keys()) seen[dz] = now;
    savePansaSeen(seen);
    savePrevZones(active.keys());
  } catch (e) { markHealth("pansa", false); }
  emit();
}

/* ── emisja stanu (ten sam kształt co backend build_state) ───────────────── */
let emitPending = false;
function emit() {
  if (stopped || !onState || emitPending) return;
  emitPending = true;
  setTimeout(() => {
    emitPending = false;
    if (stopped || !onState) return;   // silnik zatrzymany w międzyczasie
    onState({
      fusion: computeState(),
      neptun: { status: { connected: health.neptun, mode: "app-ws" },
        threats: [...tracks.values()], alert_oblasts: [...alertOblasts] },
      adsb: { aircraft: adsbAircraft, counts: {}, baselines: {} },
      // ua_alerts nie jest osobnym kolektorem po stronie aplikacji: alarmy
      // obwodowe przychodzą WebSocketem Neptuna (transport = health.neptun).
      health: { ...health, ua_alerts: health.neptun },
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
        positionQuality: t.positionQuality, areaOnly: t.areaOnly,
        straznik_position: t.straznik_position, straznik_national: t.straznik_national,
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

/* API historii dla UI — ten sam kształt co /api/history w backendzie.
   RDZEŃ przyjmuje dane (migawki + sygnały) z ZEWNĄTRZ, żeby liczył identycznie
   niezależnie od źródła: w trybie offline to lokalne `eng_snaps`+`signals`, a w
   trybie serwerowym bufor pobrany raz z /api/history/bundle i dokładany z żywego
   feedu (app.js). Dzięki temu przewijanie suwaka nie pyta serwera o każdą pozycję. */
function historyFrom(snaps, sigs, atIso) {
  const times = snaps.map(s => s.ts);
  if (!atIso) return { times, hours: HISTORY_H };
  const at = Date.parse(atIso);
  let snap = null;
  for (const s of snaps) if (s.t <= at && (!snap || s.t > snap.t)) snap = s;
  const end = snap ? snap.t : at;
  const start = end - WINDOW_MIN * 60000;
  // Ten sam rdzeń co stan na żywo (stateFrom: limit klasy źródła, wygaszanie
  // I przeniesienie od sąsiadów). Audyt A11/C10: samo accumulate pomijało
  // przeniesienie, więc województwo zaalarmowane przez sąsiada miało w historii 0.
  const per = stateFrom(sigs.filter(s => s.t >= start && s.t <= end)
    .concat(activeUaAlerts(sigs, end)), end).voivodeships;
  const scores = {}, spill = {};
  for (const [v, st] of Object.entries(per)) {
    if (st.score > 0) scores[v] = st.score;
    if (st.spill_raised) spill[v] = true;   // kolor tylko z przeniesienia (jak na żywo)
  }
  const annotated = [].concat(...Object.values(per).map(st => st.signals)).sort((a, b) => b.t - a.t);
  return { times, at: atIso, snapshot: snap, signals: annotated, scores, spill };
}
function history(atIso) {
  return historyFrom(JSON.parse(localStorage.getItem("eng_snaps") || "[]"), signals, atIso);
}

/* Oś czasu do pokolorowania suwaka: najwyższy wynik w kraju dla każdej migawki. */
function timelineFrom(snaps, sigs) {
  return snaps.map(s => {
    const win = sigs.filter(sig => {
      const age = (s.t - sig.t) / 60000;
      return age >= 0 && age <= WINDOW_MIN;
    });
    const per = stateFrom(win.concat(activeUaAlerts(sigs, s.t)), s.t).voivodeships;
    let best = 0, voiv = null;
    for (const [v, st] of Object.entries(per)) if (st.score > best) { best = st.score; voiv = v; }
    const score = Math.round(best * 10) / 10;
    return { ts: s.ts, score, voiv,
      level: score >= TH_HIGH ? "high" : score >= TH_ELEVATED ? "elevated" : "none" };
  });
}
function timeline() {
  return timelineFrom(JSON.parse(localStorage.getItem("eng_snaps") || "[]"), signals);
}

/* ── start ───────────────────────────────────────────────────────────────── */
async function start(stateCb) {
  onState = stateCb;
  // Powrót do aplikacji z tła: odśwież wygaszanie okna, żeby po odblokowaniu
  // telefonu nie było widać stanu sprzed uśpienia.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reevaluate();
  });
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    // Kanały tworzy wyłącznie strona natywna (Alarms.createChannels
    // z MainActivity.onCreate): ma właściwe ważności, wibracje i własne dźwięki
    // (alert_uwaga / alarm_syrena), a przy okazji kasuje stare kanały. Silnik
    // celowo ich NIE tworzy — inaczej odtwarzał skasowane „straznik-high/info"
    // i użytkownik widział w ustawieniach zbędne, nieużywane kanały.
    try { await LN.requestPermissions(); } catch (e) { console.warn(e); }
  } else if ("Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission(); } catch {}
  }
  startNeptun();
  tickAdsb(); every(tickAdsb, 60000);
  tickRss(); every(tickRss, 60000);
  tickRcb(); every(tickRcb, 180000);   // 3 min: alerty RCB nie zmieniają się częściej
  tickRso(); every(tickRso, 180000);   // 3 min: rzadziej niż backend (60 s), bo tu
                                       // pyta KAŻDY telefon osobno — nie obciążamy źródła
  tickPansa(); every(tickPansa, 300000);
  every(reevaluate, 30000);   // wygasanie okna bez nowych zdarzeń
  every(() => uaFinishEnded(), 30000);   // koniec alarmów obwodów po okresie łaski
  later(saveSnapshot, 20000);
  every(saveSnapshot, 120000);
}

// matchVoivs wystawiamy wyłącznie do testów zgodności z backendem
// (scripts/test_voiv_match.cjs) — reszta aplikacji go nie używa.
return { start, stop, history, timeline, historyFrom, timelineFrom, accumulate, matchVoivs,
         stateFrom, alertLevel, rsoIsCancellation, assess };
})();

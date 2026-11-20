// Karta obiektu: rozpisany rachunek czasu dolotu i ocena kursu z ruchu (20.11.2026).
//
// Zrzut karty z 20.11 05:56: „3× Rakieta manewrująca, rejon Lwiw, ±4 km, kurs z ruchu
// 335°, odległość od granicy PL 57,7 km, ostatni meldunek 1 min temu, kurs na Polskę,
// konserwatywny czas dolotu do granicy PL: 0–1 min”. 57,7 km ÷ 800 km/h to 4,3 min,
// więc samo „0–1 min” wyglądało na błąd. Wynik był poprawny, tylko nie dało się go
// sprawdzić: 2,5 min opóźnienia danych, ±4 km niepewności i 13 km lotu przez minutę
// od potwierdzenia. Karta rozpisuje teraz oba końce przedziału.
//
// Ten sam obiekt przez 50 min stał w miejscu: 57,2 → 60,0 → 57,7 → 56,6 → 60,3 km od
// granicy. „Kurs z ruchu” wyliczono z szumu pozycji, a karta pisała czerwone „kurs
// na Polskę”. Teraz, gdy ślad (≥10 min) nie pokazuje zbliżenia o 2 km, karta mówi
// „kurs niepewny — obiekt nie zbliża się do granicy”. Punktacja serwera bez zmian.
//
// Test URUCHAMIA produkcyjne funkcje wycięte z app.js.
// Uruchomienie: node scripts/test_karta_eta_arytmetyka.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'frontend/app.js'), 'utf8');
const Places = require(path.join(ROOT, 'frontend/places.js'));

function funkcja(nazwa) {
  const start = APP.indexOf(`function ${nazwa}(`);
  assert.notEqual(start, -1, `nie znalazłem ${nazwa} w app.js`);
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    if (APP[i] === '{') glebokosc++;
    else if (APP[i] === '}' && --glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error(`niedomknięta funkcja ${nazwa}`);
}
// do średnika na zerowej głębokości nawiasów — deklaracje bywają wieloliniowe
function stala(nazwa) {
  const start = APP.indexOf(`const ${nazwa} = `);
  assert.notEqual(start, -1, `nie znalazłem stałej ${nazwa} w app.js`);
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    const z = APP[i];
    if (z === '{' || z === '[' || z === '(') glebokosc++;
    else if (z === '}' || z === ']' || z === ')') glebokosc--;
    else if (z === ';' && glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error(`niedomknięta stała ${nazwa}`);
}

const MINUTA = 60000;
const TERAZ = Date.parse('2026-11-20T05:44:00Z');
class StalyCzas extends Date {
  constructor(...a) { super(...(a.length ? a : [TERAZ])); }
  static now() { return TERAZ; }
}

const UI_PL = { isEn: false, t: (pl) => pl, voiv: (v) => v };
const UI_EN = { isEn: true, t: (pl, en) => en, voiv: (v) => v };
const UI_UK = { isEn: false, t: (pl, en, uk) => (uk !== undefined ? uk : en), voiv: (v) => v };

function piaskownica(UI = UI_PL, { miejsca = [] } = {}) {
  const ctx = {
    UI, Date: StalyCzas, Math, Number, String, Set, Map, Array, Object,
    histMode: false, historyAdsbTime: null,
    Places, savedPlaces: miejsca, localTrails: new Map(),
    esc: (s) => String(s), esc2: (s) => String(s),
    isApproxPosition: () => false,
    approxPositionNote: () => '',
    measuredTrackSpeed: () => null,
    measuredHeading: () => null,
    myVoiv: () => null,
    distToVoivKm: () => null,
  };
  vm.createContext(ctx);
  vm.runInContext([
    stala('ETA_SOURCE_BUFFER_MIN'), stala('etaMin'),
    stala('FAST_TYPES_AREA_KM'),
    stala('TYPE_SPEED_KMH'), stala('typeSpeedKmh'),
    stala('JET_ALARM_KMH'), stala('COLLECTIVE_DRONE_TYPES'), stala('isJetDrone'),
    stala('isPresumedCourse'), stala('etaTxt'), stala('etaRangeTxt'),
    funkcja('nowRefMs'), funkcja('alarmSpeedKmh'), funkcja('etaInfo'),
    funkcja('localPlaceHtml'), funkcja('etaHtml'), funkcja('etaRachunekHTML'),
    funkcja('liczba1'),
    stala('TRACK_MAX_AGE_MS'), stala('kmBetween'), funkcja('cleanTrail'), funkcja('trackPoints'),
    stala('ZBLIZANIE_MIN_SLAD_MIN'), funkcja('zblizanieDoGranicy'),
    funkcja('courseVerdictHTML'), funkcja('kursZRuchuNiepotwierdzony'), funkcja('kursZRuchuNotkaHTML'),
  ].join('\n'), ctx);
  return ctx;
}

// punkt odległy o `km` w kierunku `brg` (sfera, jak Places.distanceKm)
function przesun(lat, lon, brg, km) {
  const R = 6371, d = km / R, b = brg * Math.PI / 180;
  const f1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: f2 * 180 / Math.PI, lon: l2 * 180 / Math.PI };
}

const LWIW = { lat: 49.86, lon: 24.02 };
const NA_GRANICE = 290;   // azymut na najbliższy punkt granicy (bearing_to_border)

// rakieta z karty 20.11 05:56
const rakieta = (extra = {}) => ({
  id: 'r1', type: 'cruise', ...LWIW, heading: 335, uncertaintyKm: 4,
  confirmedAt: new Date(TERAZ - MINUTA).toISOString(),
  pl_assessment: { toward_pl: true, heading_known: true, dist_km: 57.7, bearing_to_border: NA_GRANICE },
  ...extra,
});

test('etaInfo: wyniki bez zmian, składniki rachunku dostępne', () => {
  const s = piaskownica();
  const e = s.etaInfo(rakieta());
  assert.equal(e.speed, 800);
  assert.equal(e.border, 1, '57,7 km ÷ 800 km/h = 4,3 min − 2,5 = 1,8 → 1');
  assert.equal(e.borderLo, 0, '(57,7 − 4 − 13,3) km ÷ 800 km/h = 3,0 min − 2,5 = 0,5 → 0');
  const r = e.rachunek;
  assert.equal(r.km, 57.7);
  assert.equal(r.uncKm, 4);
  assert.ok(Math.abs(r.ageMin - 1) < 1e-9);
  assert.ok(Math.abs(r.lotKm - 800 / 60) < 1e-9);
  assert.equal(r.v, 800); assert.equal(r.vLo, 800);
  assert.ok(Math.abs(r.hiRaw - 1.8275) < 1e-9);
  assert.ok(Math.abs(r.loRaw - (40.3667 / 800 * 60 - 2.5)) < 1e-3);
  assert.equal(Math.max(0, Math.floor(r.hiRaw)), e.border, 'górna granica = zaokrąglenie w dół surowej');
  assert.equal(Math.max(0, Math.floor(r.loRaw)), e.borderLo, 'dolna granica = zaokrąglenie w dół surowej');
  assert.equal(r.szybki, true);
});

test('karta z 20.11: obie linie rachunku rozpisane i zgodne z przedziałem', () => {
  const html = piaskownica().etaHtml(rakieta());
  assert.ok(html.includes('konserwatywny czas dolotu do granicy PL: <b>0–1 min</b>'), html);
  assert.ok(html.includes('jeśli jest w miejscu meldunku: 57,7 km ÷ 800 km/h = 4,3 min − 2,5 min (opóźnienie danych) = 1,8 → <b>1 min</b>'), html);
  assert.ok(html.includes('najgorszy przypadek: 57,7 km − 4 km (niepewność meldunku) − 13,3 km (lot przez 1 min od potwierdzenia) = 40,4 km ÷ 800 km/h = 3,0 min − 2,5 min = 0,5 → <b>0 min</b>'), html);
  assert.ok(html.includes('lot od potwierdzenia jest doliczony do czasu, a nie do okręgu na mapie'),
    'rakieta: okrąg nie rośnie z wiekiem, więc karta mówi, gdzie poszedł lot od potwierdzenia');
  assert.ok(html.includes('minuty zaokrąglone w dół'));
  assert.ok(html.includes('nie uwzględnia obrony powietrznej'));
});

test('angielski i ukraiński: ten sam rachunek, separator według języka', () => {
  const en = piaskownica(UI_EN).etaHtml(rakieta());
  assert.ok(en.includes('if it is where reported: 57.7 km ÷ 800 km/h = 4.3 min − 2.5 min (data delay) = 1.8 → <b>1 min</b>'), en);
  assert.ok(en.includes('worst case: 57.7 km − 4 km (report uncertainty) − 13.3 km (flown in 1 min since confirmation) = 40.4 km'), en);
  const uk = piaskownica(UI_UK).etaHtml(rakieta());
  assert.ok(uk.includes('якщо він там, де повідомлено: 57,7 км ÷ 800 км/год = 4,3 хв − 2,5 хв (затримка даних) = 1,8 → <b>1 хв</b>'), uk);
  assert.ok(uk.includes('найгірший випадок: 57,7 км − 4 км (невизначеність повідомлення) − 13,3 км (політ за 1 хв від підтвердження)'), uk);
});

test('dron odrzutowy: druga linia liczona prędkością końcowego odcinka (600 km/h)', () => {
  const t = rakieta({ type: 'uav', title: 'реактивний БпЛА', heading: 290, uncertaintyKm: 4,
    confirmedAt: new Date(TERAZ - 2 * MINUTA).toISOString(),
    pl_assessment: { toward_pl: true, heading_known: true, dist_km: 100, bearing_to_border: NA_GRANICE } });
  const s = piaskownica();
  const e = s.etaInfo(t);
  assert.equal(e.rachunek.v, 450); assert.equal(e.rachunek.vLo, 600);
  const html = s.etaHtml(t);
  assert.ok(html.includes('jeśli jest w miejscu meldunku: 100 km ÷ 450 km/h'), html);
  assert.match(html, /najgorszy przypadek: 100 km − 4 km \(niepewność meldunku\) − 15 km \(lot przez 2 min od potwierdzenia\) = 81 km ÷ 600 km\/h/);
  assert.ok(!html.includes('doliczony do czasu, a nie do okręgu'), 'dron: okrąg rośnie z wiekiem, uwaga zbędna');
});

test('świeży meldunek bez niepewności: jedna linia, bez pustego „najgorszego przypadku”', () => {
  const html = piaskownica().etaHtml(rakieta({ uncertaintyKm: 0, confirmedAt: new Date(TERAZ).toISOString() }));
  assert.ok(html.includes('jeśli jest w miejscu meldunku: 57,7 km'));
  assert.ok(!html.includes('najgorszy przypadek'));
});

test('zapisane miejsce: rachunek w nawiasie, wynik jak dotąd (Dom 189 km ~11 min)', () => {
  const dom = przesun(LWIW.lat, LWIW.lon, 335, 189);
  const s = piaskownica(UI_PL, { miejsca: [{ name: 'Dom', precision: 'gps', gps: dom }] });
  const html = s.etaHtml(rakieta());
  assert.ok(html.includes('<b>Dom</b>: 189 km · ⏱ <b>~11 min</b> <span style="color:#95a1b7">(189 km ÷ 800 km/h − 2,5 min)</span>'), html);
});

// ślad: odległość od granicy w kolejnych minutach → punkty przesunięte wzdłuż
// kierunku na granicę względem bieżącej pozycji, z bocznym szumem ±1,5 km
function slad(odleglosci, teraz = LWIW, distTeraz) {
  return odleglosci.map(([minTemu, dist, bok]) => {
    const p = przesun(teraz.lat, teraz.lon, NA_GRANICE, distTeraz - dist);
    const q = bok ? przesun(p.lat, p.lon, NA_GRANICE + 90, bok) : p;
    return { lat: q.lat, lon: q.lon, t: new Date(TERAZ - minTemu * MINUTA).toISOString() };
  });
}

test('ślad 20.11: 57,2 → 60,3 km — obiekt się nie zbliża, kurs z ruchu niepewny', () => {
  const s = piaskownica();
  const t = rakieta({ confirmedAt: new Date(TERAZ).toISOString(),
    pl_assessment: { toward_pl: true, heading_known: true, dist_km: 60.3, bearing_to_border: NA_GRANICE },
    trail: slad([[44, 57.2, 1.5], [35, 60.0, -1], [28, 57.7, 0.5], [15, 56.6, -1.5], [0, 60.3, 0]], LWIW, 60.3) });
  const zb = s.zblizanieDoGranicy(t);
  assert.ok(zb, 'ślad 44 min wystarcza do werdyktu');
  assert.equal(zb.min, 44);
  assert.equal(zb.nieZbliza, true);
  assert.ok(Math.abs(zb.distA - 57.2) < 0.3, `odległość na początku śladu ≈57,2, jest ${zb.distA}`);
  assert.ok(zb.kuGranicyKm < 0, 'w sumie się oddalił');
  // właściwości znacznika jak w animate()
  const p = { type: 'cruise', toward_pl: true, heading_known: true, heading_measured: true, heading: 335,
    course_off: 45, zb_min: zb.min, zb_km: Math.round(zb.netKm * 10) / 10, zb_unc: zb.uncKm,
    zb_a: Math.round(zb.distA * 10) / 10, zb_b: zb.distB };
  const werdykt = s.courseVerdictHTML(p);
  assert.ok(werdykt.includes('<b>kurs niepewny</b> — obiekt nie zbliża się do granicy (≈57,2 → 60,3 km w 44 min)'), werdykt);
  assert.ok(werdykt.includes('#ffb020'), 'bursztyn, nie czerwień');
  assert.ok(!werdykt.includes('kurs na Polskę'));
  const notka = s.kursZRuchuNotkaHTML(p);
  assert.match(notka, /niepewny — w ciągu 44 min przesunięcie \d+,\d km \(niepewność ±4 km\), odległość od granicy ≈57,2 → 60,3 km/);
  // właściwości warstwy GL bywają tekstem
  const tekstem = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
  assert.ok(s.courseVerdictHTML(tekstem).includes('kurs niepewny'));
});

test('dron zbliżający się: werdykt „kurs na Polskę” bez zmian', () => {
  const s = piaskownica();
  const t = rakieta({ type: 'uav', confirmedAt: new Date(TERAZ).toISOString(),
    pl_assessment: { toward_pl: true, heading_known: true, dist_km: 54, bearing_to_border: NA_GRANICE },
    trail: slad([[12, 90, 0.5], [6, 72, -0.5], [0, 54, 0]], LWIW, 54) });
  const zb = s.zblizanieDoGranicy(t);
  assert.ok(zb && zb.nieZbliza === false, 'zbliżył się o ~36 km');
  const werdykt = s.courseVerdictHTML({ toward_pl: true, heading_known: true, heading_measured: true, course_off: 5 });
  assert.ok(werdykt.includes('kurs na Polskę') && werdykt.includes('#ff7b88'), werdykt);
  assert.equal(s.kursZRuchuNotkaHTML({ toward_pl: true, heading_measured: true }), '');
});

test('ślad krótszy niż 10 min — bez werdyktu', () => {
  const s = piaskownica();
  const t = rakieta({ confirmedAt: new Date(TERAZ).toISOString(),
    pl_assessment: { toward_pl: true, heading_known: true, dist_km: 60.3, bearing_to_border: NA_GRANICE },
    trail: slad([[8, 57.2, 1], [0, 60.3, 0]], LWIW, 60.3) });
  assert.equal(s.zblizanieDoGranicy(t), null);
});

test('kurs podany przez źródło (nie z ruchu) — werdykt jak dotąd, nawet przy zb_*', () => {
  const s = piaskownica();
  const p = { toward_pl: true, heading_known: true, heading_measured: false, course_off: 10,
    zb_min: 30, zb_a: 57.2, zb_b: 60.3, zb_km: 3, zb_unc: 4 };
  assert.ok(s.courseVerdictHTML(p).includes('kurs na Polskę'));
  assert.equal(s.kursZRuchuNotkaHTML(p), '');
});

test('animate() liczy ocenę tylko dla kursu z ruchu „na Polskę” i przekazuje ją znacznikowi', () => {
  assert.match(APP, /const zb = mh != null && t\.pl_assessment\?\.toward_pl === true\s*\?\s*zblizanieDoGranicy\(t\)/);
  assert.match(APP, /zb\?\.nieZbliza \?/);
  assert.match(APP, /\.\.\.zbProps,\s*eta: etaHtml\(t\)/);
  assert.match(funkcja('openThreatPopup'), /kursZRuchuNotkaHTML\(p\)/);
});

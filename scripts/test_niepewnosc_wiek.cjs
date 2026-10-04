// Okrąg niepewności musi rosnąć z wiekiem meldunku.
//
// Zgłoszenie z 30.09.2026: na mapie stał dron 14 km w głębi Mołdawii, z okręgiem
// ±12 km, który granicy NIE dotykał — mapa twierdziła więc, że obiekt na pewno był
// po tamtej stronie. Meldunek miał wtedy 4 minuty, a dron przy 180 km/h mógł
// przelecieć w tym czasie 12 km, czyli równie dobrze być nad Ukrainą. Rysujemy
// ostatnią ZNANĄ pozycję, więc okrąg musi obejmować to, co obiekt zdążył przelecieć.
//
// Ten sam rachunek (niepewność + droga od potwierdzenia) robił już etaInfo przy
// czasie dolotu; brakowało go tylko tam, gdzie użytkownik patrzy — na mapie.
//
// Czego pilnuje ten test:
//   * świeży meldunek nie jest karany (okrąg = niepewność źródła),
//   * po 4 minutach dron dostaje dorzut 12 km — dokładnie przypadek z 30.09,
//   * dorzut jest ucinany na 15 minutach, żeby okrąg nie zalał mapy,
//   * szybkie typy (rakiety, KAB, balistyka) zostają przy stałym rejonie z audytu
//     G8 — NEPTUN nie podaje im kursu, więc doliczanie drogi udawałoby wiedzę,
//   * pozycja dokładna też się starzeje,
//   * brak niepewności w źródle nadal nie rysuje okręgu.
//
// Test URUCHAMIA produkcyjne funkcje wycięte z app.js, nie porównuje tekstu —
// dzięki temu przetrwa przeformatowanie kodu.
//
// Uruchomienie: node scripts/test_niepewnosc_wiek.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.resolve(__dirname, '..', 'frontend/app.js'), 'utf8');

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

/* Stałe bierzemy z app.js, żeby test sprawdzał WARTOŚCI produkcyjne, a nie ich
   kopie — zmiana progu w kodzie ma tu od razu zmienić oczekiwania.
   Czytamy do średnika na zerowej głębokości nawiasów, bo deklaracja bywa
   rozbita na kilka linii (TYPE_SPEED_KMH) — dopasowanie do jednej linii
   urywało obiekt w pół i psuło test, nie kod. */
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
const TERAZ = Date.parse('2026-09-30T08:00:00Z');

function piaskownica({ approx = true, mierzona = null } = {}) {
  const ctx = {
    histMode: false, historyAdsbTime: null,
    Date, Math, Number,
    isApproxPosition: () => approx,
    measuredTrackSpeed: () => mierzona,
  };
  vm.createContext(ctx);
  vm.runInContext([
    stala('APPROX_MIN_UNCERTAINTY_KM'),
    stala('FAST_TYPES_AREA_KM'),
    stala('TYPE_SPEED_KMH'),
    // Tablicy prędkości nie czyta się już wprost — jedyne wejście to
    // typeSpeedKmh (sprowadza nazwę klasy do małych liter). Bez niego
    // ageSlackKm wywala się na ReferenceError i cały plik pada.
    stala('typeSpeedKmh'),
    stala('AGE_SLACK_MAX_MIN'),
    funkcja('nowRefMs'),
    funkcja('threatAgeMin'),
    funkcja('ageSlackKm'),
    funkcja('uncertaintyParts'),
    funkcja('shownUncertaintyKm'),
  ].join('\n'), ctx);
  return ctx;
}

const obiekt = (wiekMin, extra = {}) => ({
  type: 'uav', uncertaintyKm: 4,
  confirmedAt: new Date(TERAZ - wiekMin * MINUTA).toISOString(),
  ...extra,
});

test('świeży meldunek nie dostaje dorzutu — zostaje minimum dla rejonu', () => {
  const s = piaskownica();
  assert.equal(s.shownUncertaintyKm(obiekt(0), TERAZ), 12);
});

test('przypadek z 30.09: po 4 minutach okrąg sięga 24 km, więc dotyka granicy', () => {
  const s = piaskownica();
  const km = s.shownUncertaintyKm(obiekt(4), TERAZ);
  assert.equal(km, 24, 'dron 180 km/h przelatuje w 4 minuty 12 km');
  assert.ok(km > 14.1, 'granica UA/MD leżała 14,1 km od punktu — okrąg musi ją obejmować');
});

test('dorzut jest ucinany na 15 minutach, a nie rośnie bez końca', () => {
  const s = piaskownica();
  const pol = s.shownUncertaintyKm(obiekt(15), TERAZ);
  const godzina = s.shownUncertaintyKm(obiekt(60), TERAZ);
  assert.equal(pol, 12 + 45);
  assert.equal(godzina, pol, 'po 15 minutach okrąg przestaje rosnąć');
});

test('szybkie typy zostają przy stałym rejonie z audytu G8', () => {
  const s = piaskownica();
  for (const typ of ['missile', 'cruise', 'ballistic', 'kab']) {
    assert.equal(s.shownUncertaintyKm(obiekt(10, { type: typ }), TERAZ), 25,
      `${typ}: bez kursu nie udajemy wiedzy o przebytej drodze`);
  }
});

test('zmierzona prędkość ma pierwszeństwo, gdy jest wyższa od typowej', () => {
  const s = piaskownica({ approx: false, mierzona: 600 });
  // pozycja dokładna: podstawą jest niepewność źródła, nie minimum rejonowe
  assert.equal(s.shownUncertaintyKm(obiekt(6), TERAZ), 4 + 60);
});

test('pozycja dokładna też się starzeje', () => {
  const s = piaskownica({ approx: false });
  assert.equal(s.shownUncertaintyKm(obiekt(0), TERAZ), 4);
  assert.equal(s.shownUncertaintyKm(obiekt(10), TERAZ), 4 + 30);
});

test('bez niepewności w źródle i przy pozycji dokładnej nie rysujemy okręgu', () => {
  const s = piaskownica({ approx: false });
  assert.equal(s.shownUncertaintyKm(obiekt(10, { uncertaintyKm: null }), TERAZ), null);
});

test('karta dostaje rozbicie, które sumuje się do pokazanej liczby', () => {
  // Karta pisze „±24 km (12 km zgłoszenia + 12 km lotu od meldunku)”. Gdyby
  // części zaokrąglały się osobno od sumy, liczby w nawiasie by się nie zgadzały.
  const s = piaskownica();
  for (const wiek of [0, 1, 4, 7, 15, 40]) {
    const p = s.uncertaintyParts(obiekt(wiek), TERAZ);
    assert.equal(p.zgloszenie + p.lot, s.shownUncertaintyKm(obiekt(wiek), TERAZ),
      `wiek ${wiek} min: rozbicie musi sumować się do całości`);
    assert.ok(Number.isInteger(p.zgloszenie) && Number.isInteger(p.lot));
  }
});

test('w podglądzie historii wiek liczy się od migawki, nie od „teraz”', () => {
  const s = piaskownica();
  s.histMode = true;
  s.historyAdsbTime = TERAZ;
  // bez jawnego czasu funkcja ma sięgnąć po czas migawki — inaczej obiekt sprzed
  // godziny wyglądałby na przeterminowany o całą różnicę do dzisiaj
  assert.equal(s.shownUncertaintyKm(obiekt(4)), 24);
});

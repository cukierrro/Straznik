// Adres miniatury kamery nie może się starzeć sam z siebie.
//
// Zgłoszenie z 03.10.2026 (najpierw iOS, potem to samo na Androidzie): w karcie
// sygnałów „Kamery w regionie" nie było widać nic. Lista frontend/assets/kamery.json
// zbudowana 30.07.2026 trzymała gotowe adresy miniatur:
//     https://www.img.worldcam.pl/webcams/400x225/2026-07-30/36608.jpg
// i tego dnia KAŻDY z nich zwracał 404 — zero bajtów, content-type: text/html.
// Na sztywno wpisane były tam DWIE rzeczy i obie okazały się nietrwałe:
//
//   * rozmiar — worldcam.pl wymienił 400x225 na 400x226. Sprawdzone 03.10.2026:
//     400x226 z bieżącą datą zwraca obraz, a 400x225 zwraca 404 dla KAŻDEJ daty,
//     również dla 2026-07-30, pod którą został zapisany. To było realne zepsucie.
//   * data — serwis trzyma archiwum po dniach, więc zamrożona data pokazywałaby
//     zdjęcie z dnia budowy listy jako bieżące. Dziś ścieżka z 30.07 wraca już do
//     obrazu aktualnego (archiwum tak stare wygasło), ale to zachowanie serwisu,
//     nie nasza gwarancja — data zapisana w pliku danych to pułapka na później.
//
// Czego pilnuje ten test:
//   * kamery.json nie zawiera ANI adresu miniatury, ANI żadnej daty — za to ma
//     identyfikator kamery, z którego aplikacja składa adres sama,
//   * produkcyjne camDay/camThumb z app.js, uruchomione pod podstawionym zegarem,
//     wstawiają w adres dzień z TEGO zegara (dwa różne dni, dwa różne adresy) —
//     czyli po północy przy otwartym okienku adres też się przesunie,
//   * dzień bierze się z czasu lokalnego, nie z UTC (po północy w Polsce jest już
//     nowy dzień, a toISOString podałby jeszcze poprzedni),
//   * lista rozmiarów ma co najmniej dwie pozycje i camNextStep przechodzi po nich
//     do końca, a potem orzeka zastępnik — jeden zaszyty rozmiar to powrót do
//     awarii z 03.10,
//   * zastępnik jest WIDOCZNY: .cam-dead nie ukrywa całego kafelka (tak było do
//     03.10 i dlatego okno kamer robiło się puste), tylko sam obraz, a podpis
//     .cam-fallback się odsłania.
//
// Test jest OFFLINE — nie odpytuje worldcam.pl. Sprawdza WARTOŚCI zwracane przez
// produkcyjny kod wycięty z app.js, nie obecność słów w pliku.
//
// Uruchomienie: node scripts/test_kamery_miniatury.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const PLIK_KAMER = path.join(ROOT, 'frontend/assets/kamery.json');
const APP = fs.readFileSync(path.join(ROOT, 'frontend/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'frontend/style.css'), 'utf8');
const SUROWY = fs.readFileSync(PLIK_KAMER, 'utf8');
const KAMERY = JSON.parse(SUROWY);

/* Wycinanie z app.js po nazwie — jak w test_niepewnosc_wiek.cjs. Czytamy do
   domknięcia nawiasu albo średnika na zerowej głębokości, żeby deklaracja rozbita
   na kilka linii nie urwała się w połowie: wtedy pada test, a nie kod. */
function funkcja(nazwa) {
  const start = APP.indexOf('function ' + nazwa + '(');
  assert.notEqual(start, -1, 'nie znalazłem ' + nazwa + ' w app.js');
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    if (APP[i] === '{') glebokosc++;
    else if (APP[i] === '}' && --glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error('niedomknięta funkcja ' + nazwa);
}
function stala(nazwa) {
  const start = APP.indexOf('const ' + nazwa + ' = ');
  assert.notEqual(start, -1, 'nie znalazłem stałej ' + nazwa + ' w app.js');
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    const z = APP[i];
    if (z === '{' || z === '[' || z === '(') glebokosc++;
    else if (z === '}' || z === ']' || z === ')') glebokosc--;
    else if (z === ';' && glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error('niedomknięta stała ' + nazwa);
}

/* Piaskownica z PODSTAWIONYM zegarem: new Date() bez argumentów udaje podaną
   chwilę czasu LOKALNEGO, reszta Date działa normalnie. Dzięki temu sprawdzamy,
   co produkcyjny kod realnie wstawia w adres, zamiast czytać go wzrokiem. */
function piaskownica(chwilaLokalna) {
  const ustalony = new Date(chwilaLokalna);
  assert.ok(!Number.isNaN(ustalony.getTime()), 'zła chwila w teście: ' + chwilaLokalna);
  class DateStub extends Date {
    constructor(...a) { super(...(a.length ? a : [ustalony.getTime()])); }
    static now() { return ustalony.getTime(); }
  }
  const ctx = { Date: DateStub, String, Number, Math, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext([
    stala('CAM_HOST'), stala('CAM_SIZES'),
    'let camSizeIdx = 0;',
    funkcja('camDay'), funkcja('camThumb'), funkcja('camNextStep'),
  ].join('\n'), ctx);
  /* `const` w vm nie trafia na obiekt globalny (deklaracje funkcji trafiają),
     więc wartość stałej czytamy, wykonując jej nazwę jako wyrażenie. */
  ctx.CAM_SIZES = vm.runInContext('CAM_SIZES', ctx);
  return ctx;
}

const WPISY = Object.entries(KAMERY).flatMap(([voiv, l]) => l.map(c => [voiv, c]));

test('lista kamer nie jest pusta (inaczej reszta testu nic nie sprawdza)', () => {
  assert.ok(WPISY.length > 100, 'w kamery.json jest tylko ' + WPISY.length + ' wpisów');
});

test('kamery.json nie zawiera adresu miniatury ani żadnej daty', () => {
  const daty = SUROWY.match(/\d{4}-\d{2}-\d{2}/g) || [];
  assert.deepEqual(daty, [],
    'w kamery.json siedzi zamrożona data: ' + daty.slice(0, 3).join(', '));
  assert.ok(!/img\.worldcam\.pl/.test(SUROWY),
    'w kamery.json jest gotowy adres obrazka — adres składa aplikacja, nie plik danych');
  for (const [voiv, c] of WPISY) {
    assert.ok(!('thumb' in c), voiv + '/' + c.id + ': wróciło pole thumb');
    assert.match(String(c.id), /^\d+$/,
      voiv + '/' + c.name + ': identyfikator kamery nie jest liczbą');
    assert.match(String(c.url), /^https:\/\/www\.worldcam\.pl\//,
      voiv + '/' + c.id + ': odnośnik do wpisu nie prowadzi do worldcam.pl');
  }
});

test('adres miniatury bierze dzień z zegara — dwa dni, dwa adresy', () => {
  const a = piaskownica('2026-10-03T12:00:00');
  const b = piaskownica('2026-10-04T12:00:00');
  const adresA = a.camThumb('36608');
  const adresB = b.camThumb('36608');
  assert.ok(adresA.includes('/2026-10-03/'), 'brak dnia z zegara w adresie: ' + adresA);
  assert.ok(adresB.includes('/2026-10-04/'), 'brak dnia z zegara w adresie: ' + adresB);
  assert.notEqual(adresA, adresB, 'adres nie zmienia się z dniem — data jest zamrożona');
  assert.match(adresA,
    /^https:\/\/www\.img\.worldcam\.pl\/webcams\/\d+x\d+\/2026-10-03\/36608\.jpg$/,
    'adres nie ma oczekiwanego kształtu: ' + adresA);
});

test('dzień liczony z czasu LOKALNEGO, nie z UTC', () => {
  // 01:30 czasu polskiego 4 października to w UTC jeszcze 23:30 dnia 3 —
  // toISOString().slice(0,10) podałby więc wczorajszą datę i miniatura byłaby
  // przez pierwsze godziny po północy archiwalna.
  const noc = piaskownica('2026-10-04T01:30:00');
  assert.equal(noc.camDay(), '2026-10-04',
    'dzień policzony z UTC — po północy miniatura byłaby z wczoraj');
  const poludnie = piaskownica('2026-01-09T12:00:00');
  assert.equal(poludnie.camDay(), '2026-01-09',
    'jednocyfrowy miesiąc i dzień muszą być dopełnione zerem');
});

test('rozmiarów jest kilka i camNextStep przechodzi je do końca, potem zastępnik', () => {
  const ctx = piaskownica('2026-10-03T12:00:00');
  const rozmiary = ctx.CAM_SIZES;
  assert.ok(Array.isArray(rozmiary) && rozmiary.length >= 2,
    'CAM_SIZES ma mniej niż dwa rozmiary — jeden zaszyty rozmiar to awaria z 03.10.2026');
  for (const r of rozmiary) assert.match(r, /^\d+x\d+$/, 'dziwny rozmiar: ' + r);
  for (let i = 0; i < rozmiary.length - 1; i++) {
    const krok = ctx.camNextStep(i);
    assert.equal(krok.dead, undefined,
      'po rozmiarze ' + rozmiary[i] + ' jest jeszcze co próbować');
    assert.equal(krok.idx, i + 1);
    assert.equal(krok.size, rozmiary[i + 1]);
  }
  const ostatni = ctx.camNextStep(rozmiary.length - 1);
  assert.equal(ostatni.dead, true,
    'po wyczerpaniu rozmiarów musi padać decyzja o zastępniku');
  for (const r of rozmiary) {
    assert.equal(ctx.camThumb('8635', r),
      'https://www.img.worldcam.pl/webcams/' + r + '/2026-10-03/8635.jpg');
  }
});

test('zastępnik jest widoczny — martwy kafelek nie znika z okna', () => {
  const regula = (sel) => {
    const i = CSS.indexOf(sel + ' ');
    assert.notEqual(i, -1, 'brak reguły CSS dla ' + sel);
    const otw = CSS.indexOf('{', i);
    return CSS.slice(otw + 1, CSS.indexOf('}', otw)).replace(/\s+/g, ' ').trim();
  };
  assert.ok(!/\.cam-tile\.cam-dead\s*\{[^}]*display:\s*none/.test(CSS),
    'cam-dead ukrywa cały kafelek — przy padniętych miniaturach okno kamer jest puste');
  assert.match(regula('.cam-tile.cam-dead img'), /display:\s*none/,
    'martwa miniatura musi schować sam obraz');
  assert.match(regula('.cam-tile.cam-dead .cam-fallback'), /display:\s*block/,
    'podpis zastępczy musi się odsłonić, gdy miniatura padnie');
  /* Podpis chowamy selektorem Z `.cam-tile`, nie samym `.cam-fallback`. Złapane
     w przeglądarce 03.10.2026: `.cam-tile span { display: block }` stoi wyżej
     w pliku, ale ma większą specyficzność (klasa + element), więc samo
     `.cam-fallback { display: none }` przegrywało i napis „podgląd niedostępny"
     wisiał pod KAŻDĄ działającą miniaturą. */
  assert.ok(/\.cam-tile\s+\.cam-fallback\s*\{[^}]*display:\s*none/.test(CSS),
    'podpis zastępczy chowany słabszym selektorem niż .cam-tile span — będzie widoczny zawsze');
});

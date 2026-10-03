// Legenda ma być przetłumaczona W CAŁOŚCI — po polsku, angielsku i ukraińsku.
//
// Dlaczego ten test istnieje: legenda nie jest tłumaczona po identyfikatorach,
// tylko przez SŁOWNIK CAŁYCH NAPISÓW. `translateStatic` chodzi po węzłach
// tekstowych i podmienia te, które trafi w `EN`; potem `ukrainize` robi drugi
// przebieg z `EN2UK`. Napis, którego nie ma w słowniku, zostaje po polsku
// i NIC o tym nie mówi — żadnego błędu, żadnego pustego miejsca.
//
// 02.10.2026 przegrupowałem legendę i zmieniłem brzmienie nagłówków
// („Obiekty (Dane: NEPTUN, nad Ukrainą)" → „Obiekty — dane NEPTUN, nad
// Ukrainą"), nie ruszając słownika. Efekt: po angielsku i ukraińsku połowa
// legendy została po polsku i nikt tego nie zauważył przez dobę.
//
// Uruchomienie: node scripts/test_legenda_tlumaczenia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
/* Konce linii normalizujemy ZARAZ po odczycie. W checkoucie z
   `core.autocrlf=true` (tak ma sesja iOS) kazdy `\n` poprzedza `\r`,
   wiec wzorce z `\n</div>` nie trafialy i test przewracal sie na pierwszej
   asercji — czyli nie sprawdzal niczego, zamiast zglosic brak tlumaczenia. */
const czytaj = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const HTML = czytaj('frontend/index.html');
const I18N = czytaj('frontend/i18n.js');

function legenda() {
  const m = /<div id="legend"[\s\S]*?\n<\/div>\n/.exec(HTML);
  assert.ok(m, 'nie znalazłem bloku #legend w index.html');
  return m[0];
}

/* Napisy widoczne w legendzie: treść tekstowa znaczników, bez komentarzy.
   Tak samo jak translateStatic, który chodzi po węzłach tekstowych i kluczem
   jest CAŁY przycięty węzeł. */
function napisy() {
  const bez = legenda().replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const kawalek of bez.split(/<[^>]*>/)) {
    const s = kawalek.replace(/\s+/g, ' ').trim();
    if (s && /[a-ząćęłńóśźż]/i.test(s)) out.push(s);
  }
  return [...new Set(out)];
}

/* Klucze słowników czytamy z kodu, żeby test nie żył własnym życiem. */
function klucze(nazwa) {
  const i = I18N.indexOf('const ' + nazwa + ' = {');
  assert.ok(i >= 0, 'nie znalazłem słownika ' + nazwa);
  const blok = I18N.slice(i, I18N.indexOf('\n  };', i));
  return new Set([...blok.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)]
    .map(m => m[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi,
      (_, h) => String.fromCharCode(parseInt(h, 16)))));
}

/* Wartości PL→EN: to one są kluczami w drugim przebiegu, EN→UK. */
function wartosciEN() {
  const i = I18N.indexOf('const EN = {');
  const blok = I18N.slice(i, I18N.indexOf('\n  };', i));
  const map = new Map();
  for (const m of blok.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g))
    map.set(m[1].replace(/\\"/g, '"'), m[2].replace(/\\"/g, '"'));
  return map;
}

test('każdy napis legendy ma wersję angielską', () => {
  const EN = klucze('EN');
  const braki = napisy().filter(s => !EN.has(s));
  assert.deepEqual(braki, [], 'napisy legendy bez wpisu w słowniku EN — zostaną po polsku:\n'
    + braki.map(s => `  ${JSON.stringify(s)}: "",`).join('\n'));
});

test('każdy napis legendy ma wersję ukraińską', () => {
  const EN = wartosciEN();
  const UK = klucze('EN2UK');
  const braki = napisy()
    .map(s => EN.get(s))
    .filter(en => en && !UK.has(en));
  assert.deepEqual(braki, [], 'angielskie napisy legendy bez wpisu w EN2UK:\n'
    + braki.map(s => `  ${JSON.stringify(s)}: "",`).join('\n'));
});

test('legenda ma przycisk zamykania ze słowem', () => {
  // Zasada z 03.10.2026: przy samym znaku × nie wiadomo, co się zamknie,
  // a legenda jako jedyny panel nie miała go wcale — zamykało ją ponowne
  // dotknięcie ikony na pasku albo dotknięcie mapy. Nic tego nie mówiło.
  const lg = legenda();
  assert.ok(/id="legend-x"/.test(lg), 'legenda musi mieć przycisk #legend-x');
  assert.ok(/id="legend-x-txt"/.test(lg), 'przy znaku × musi stać słowo (#legend-x-txt)');
});

test('ikony lotnictwa rysowane tymi samymi pikselami co mapa', () => {
  // Śmigłowiec stał w legendzie jako emoji 🚁, a na mapie jest rysowany
  // przez makeHeliImage(). Legenda ma pokazywać TO, co widać na mapie.
  const lg = legenda();
  assert.ok(!/🚁/.test(lg), 'emoji śmigłowca zamiast ikony z mapy');
  for (const typ of ['plane', 'heli'])
    assert.ok(new RegExp(`data-air="${typ}"`).test(lg), `brak wiersza data-air="${typ}"`);
  const APP = czytaj('frontend/app.js');
  assert.ok(/\.lg-air\[data-air\]/.test(APP),
    'app.js musi wypełniać ikony lotnictwa w legendzie');
});

test('legenda wymienia wszystkie kraje, które kolorujemy na mapie', () => {
  // BALTIC_ISO3 decyduje, które kraje dostają kolor. 1.7.88 dorzuciło sześć
  // nowych i legenda przestała się z tym zgadzać: wymieniała trzy z dziewięciu.
  const APP = czytaj('frontend/app.js');
  const m = /const BALTIC_ISO3 = \{([\s\S]*?)\};/.exec(APP);
  assert.ok(m, 'nie znalazłem BALTIC_ISO3');
  const kody = [...m[1].matchAll(/(\w{2}):/g)].map(x => x[1]);
  const NAZWY = { LT: 'Litwa', LV: 'Łotwa', EE: 'Estonia', MD: 'Mołdawia', RO: 'Rumunia',
    SK: 'Słowacja', CZ: 'Czechy', SE: 'Szwecja', HU: 'Węgry' };
  const lg = legenda();
  const braki = kody.filter(k => !lg.includes(NAZWY[k] || k));
  assert.deepEqual(braki, [],
    'kraje kolorowane na mapie, których legenda nie wymienia: ' + braki.join(', '));
});

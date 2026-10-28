// Polityka prywatności wymienia KAŻDY host, z którym telefon łączy się w trybie awaryjnym.
//
// Przegląd podstaw korzystania z cudzych danych (26.10.2026) znalazł lukę: gdy
// serwer nie odpowiada, aplikacja przechodzi w tryb awaryjny (app.js
// startStandalone → frontend/engine.js) i TELEFON odpytuje wprost NEPTUN-a, ADS-B,
// gov.pl, RSO, PAŻP, Google News i kanały RSS redakcji. Polityka mówiła wtedy
// „Strony redakcji odczytuje nasz serwer, nie Twój telefon" i nie wymieniała
// żadnego z tych podmiotów — a czytają ją Apple, Google i użytkownicy.
//
// Czego pilnuje ten test:
//   * zbiór hostów w adresach zapisanych w engine.js jest RÓWNY zbiorowi hostów
//     w bloku #tryb-awaryjny każdej z trzech polityk (PL/EN/UK) — w obie strony:
//     nowe źródło w engine.js bez wpisu w polityce wywraca test, a wpis
//     w polityce po źródle, którego już nie ma, też,
//   * usunięte 26.10.2026 źródła nie wracają do kodu: CARTO (kafelki bez klucza,
//     wbrew warunkom z 29.09.2026), fonts.openmaptiles.org (czcionki zapasu CARTO),
//     opendata.adsb.fi (tylko użytek osobisty, niekomercyjny), airplanes.live
//     (regulamin zakazuje automatycznego pobierania) i ADSBexchange przez RapidAPI
//     (opcja bez przeczytanych warunków),
//   * polityka nie twierdzi już, że redakcje czyta wyłącznie serwer.
//
// Test jest OFFLINE i porównuje WARTOŚCI (zbiory hostów), nie obecność słów.
//
// Uruchomienie: node scripts/test_prywatnosc_tryb_awaryjny.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Hosty z literałów adresów w kodzie. Pomijamy komentarze, żeby notatka
// o usuniętym źródle nie udawała połączenia; example.invalid to tylko baza
// do parsowania względnych odnośników w feedLink.
function hostyZKodu(src) {
  const bezKomentarzy = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
  const hosty = new Set();
  for (const m of bezKomentarzy.matchAll(/(?:https?|wss?):\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const h = m[1].toLowerCase();
    if (h !== 'example.invalid') hosty.add(h);
  }
  return hosty;
}

// Hosty z bloku #tryb-awaryjny polityki: od elementu z tym id do końca
// pierwszej listy po nim; każdy host w osobnym <code>.
function hostyZPolityki(html, plik) {
  const start = html.indexOf('id="tryb-awaryjny"');
  assert.ok(start >= 0, `${plik}: brak bloku id="tryb-awaryjny"`);
  const koniec = html.indexOf('</ul>', start);
  assert.ok(koniec > start, `${plik}: blok #tryb-awaryjny bez listy`);
  const blok = html.slice(start, koniec);
  return new Set([...blok.matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1].trim().toLowerCase()));
}

const roznica = (a, b) => [...a].filter(x => !b.has(x)).sort();

const ENGINE = hostyZKodu(read('frontend/engine.js'));
const POLITYKI = ['docs/prywatnosc.html', 'docs/prywatnosc-en.html', 'docs/prywatnosc-uk.html'];

test('engine.js ma niepustą listę hostów (parser działa)', () => {
  // gdyby wyrażenie przestało łapać adresy, porównanie zbiorów przeszłoby na pustych
  for (const h of ['neptun.in.ua', 'api.adsb.lol', 'komunikaty.tvp.pl', 'www.gov.pl'])
    assert.ok(ENGINE.has(h), `parser nie znalazł ${h} w engine.js`);
});

for (const plik of POLITYKI) {
  test(`${plik}: lista hostów trybu awaryjnego zgadza się z engine.js`, () => {
    const pol = hostyZPolityki(read(plik), plik);
    assert.deepEqual(roznica(ENGINE, pol), [],
      `hosty z engine.js, których ${plik} nie wymienia`);
    assert.deepEqual(roznica(pol, ENGINE), [],
      `hosty w ${plik}, z którymi engine.js już się nie łączy`);
  });

  test(`${plik}: nie twierdzi, że redakcje czyta tylko serwer`, () => {
    const html = read(plik);
    for (const zdanie of ['Strony redakcji odczytuje nasz serwer, nie Twój telefon',
                          "Publishers' pages are read by our server, not by your phone",
                          'Сторінки редакцій читає наш сервер, а не ваш телефон'])
      assert.ok(!html.includes(zdanie), `${plik} nadal zawiera: „${zdanie}”`);
  });
}

test('usunięte źródła nie wracają do kodu aplikacji i serwera', () => {
  const pliki = ['frontend/engine.js', 'frontend/app.js', 'frontend/i18n.js', 'frontend/index.html',
                 'grota/grota.js', 'grota/grota-core.js',
                 'backend/app/config.py', 'backend/app/collectors/adsb.py'];
  const zakazane = ['cartocdn.com', 'fonts.openmaptiles.org', 'opendata.adsb.fi', 'airplanes.live',
                    'rapidapi.com'];
  for (const p of pliki) {
    // JS: bez komentarzy; Python i HTML: każdy adres ze schematem (notatka
    // „dlaczego usunięte” w docstringu nie ma schematu i nie jest połączeniem)
    const hosty = p.endsWith('.js')
      ? hostyZKodu(read(p))
      : new Set([...read(p).matchAll(/(?:https?|wss?):\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase()));
    for (const z of zakazane) {
      // 26–27.10.2026 serwer miał tymczasowy zapas adsb.fi; 27.10 zastąpiony FlyItalyADSB (pisemna zgoda),
      // więc adsb.fi znów nie ma prawa wrócić nigdzie — także na serwer.
      assert.ok(![...hosty].some(h => h === z || h.endsWith('.' + z)), `${p} łączy się z ${z}`);
    }
  }
});

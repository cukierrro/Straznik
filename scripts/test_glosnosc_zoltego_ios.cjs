// „Głośność sygnału uwagi (żółty)” na iPhonie (B11, 13.10.2026, zgłoszenie użytkownika iOS).
//
// „Bez dźwięku” nie wyciszało żółtego powiadomienia na iPhonie: setYellowLevel istnieje
// tylko w pluginie Androida (proxy Capacitora 8 odrzuca obietnicę, try/catch ją zjadał,
// a pigułka wyglądała na zapisaną), a dźwięk żółtego pusha na iOS jest w ładunku APNs
// z serwera. Na iPhonie ustawienie działa tylko dla sygnału przy otwartej aplikacji —
// mówimy to wprost i nie wołamy metody, której tam nie ma. Segment zostaje widoczny.
//
// Uruchomienie: node scripts/test_glosnosc_zoltego_ios.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
const HTML = fs.readFileSync('frontend/index.html', 'utf8');
const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
const CSS = fs.readFileSync('frontend/style.css', 'utf8');

// B13 (17.10.2026): od 1.7.96 plugin iOS MA setYellowLevel i setPushLanguage — zapisują
// do wspólnego kontenera, z którego czyta rozszerzenie powiadomień (NSE). Bez tych wywołań
// pierwszy push testowy NSE przyszedł po polsku i z dźwiękiem mimo „Bez dźwięku”.
// Starsze buildy iOS metod nie mają: odrzucona obietnica musi być złapana.
test('setYellowLevel przy wyborze poziomu — także na iOS, w try z await', () => {
  assert.match(APP, /try \{ await BG\(\)\?\.setYellowLevel\?\.\(\{ level: poziom \}\); \} catch \{\}/);
  assert.doesNotMatch(APP, /if \(!IS_IOS\) try \{ await BG\(\)\?\.setYellowLevel/, 'dawna osłona !IS_IOS zdjęta');
});

test('iOS przy starcie zapisuje język i poziom żółtego dla rozszerzenia (B13)', () => {
  const od = APP.indexOf('if (IS_IOS) {\n  const nse = BG();');
  const odCrlf = od >= 0 ? od : APP.indexOf('if (IS_IOS) {\r\n  const nse = BG();');
  assert.ok(odCrlf >= 0, 'blok startowy B13 pod IS_IOS');
  const blok = APP.slice(odCrlf, odCrlf + 400);   // cały blok startowy; nawiasy w środku są zagnieżdżone
  assert.match(blok, /setPushLanguage\?\.\(\{ lang: UI\.lang \|\| "pl" \}\)\)\.catch\(\(\) => \{\}\)/);
  assert.match(blok, /setYellowLevel\?\.\(\{ level: chimeLevel\(\) \}\)\)\.catch\(\(\) => \{\}\)/);
  // przed blokiem musi już istnieć BG (const) — inaczej błąd strefy martwej przy starcie
  assert.ok(APP.indexOf('const BG = () =>') < odCrlf, 'BG zadeklarowane przed użyciem');
});

test('notka tylko dla iOS w „Czego dotyczy to ustawienie”, jako <p> (CSS pokazuje tylko p.ios-only)', () => {
  const od = HTML.indexOf('id="jak-yv"');
  const blok = HTML.slice(od, HTML.indexOf('</details>', od));
  assert.match(blok, /<p class="fineprint ios-only" id="yv-ios-note">Na iPhonie to ustawienie zmienia tylko sygnał przy otwartej aplikacji\./);
  // ZMIERZONE 14.10 (TestFlight, ios-app/TESTFLIGHT_TESTY.md §17): „Dźwięki” i „Alerty krytyczne”
  // to w iOS niezależne przełączniki — przy wyłączonych Dźwiękach czerwony ze zgodą krytyczną
  // gra dalej. Dawne zdanie „dotyczy także czerwonego” obiecywało ciszę, której nie ma.
  assert.match(blok, /Czerwony alarm zagra mimo to, jeśli na tym samym ekranie włączone są Alerty krytyczne\./);
  assert.match(blok, /wyłącza również je — powiadomienie przyjdzie wtedy bez dźwięku\./);
  assert.doesNotMatch(blok, /także czerwonego alarmu/, 'stara, obalona pomiarem obietnica ciszy');
  assert.doesNotMatch(blok, /wycisza także/, 'bez niesprawdzonej obietnicy');
  assert.match(CSS, /\.ios-app p\.ios-only \{ display: block !important; \}/);
  assert.ok(!/id="yellow-volume"[^>]*android-only/.test(HTML), 'segment zostaje widoczny na iPhonie');
});

test('tłumaczenia EN i UK', () => {
  assert.match(I18N, /button\("yv-ios-note", "Na iPhonie/);
  assert.match(I18N, /set\("#yv-ios-note", "On iPhone this setting only changes the signal while the app is open\./);
  assert.match(I18N, /"On iPhone this setting only changes[^"]*": "На iPhone це налаштування змінює лише сигнал/);
});

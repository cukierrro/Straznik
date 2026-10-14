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

test('iOS nie woła setYellowLevel (tylko Android ma tę metodę)', () => {
  assert.match(APP, /if \(!IS_IOS\) try \{ await BG\(\)\?\.setYellowLevel\?\.\(\{ level: poziom \}\); \} catch \{\}/);
  const wolania = APP.match(/setYellowLevel\?\.\(/g) || [];
  assert.equal(wolania.length, 1, 'jedno wywołanie, i to osłonięte');
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

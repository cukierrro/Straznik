// Linia „Zapisane miejsca” w Ustawieniach (zgłoszenie z Google Play 17.11.2026:
// 8 zapisanych miejsc, a linia wymieniała 5 województw i wyglądała jak ucięta lista).
// Uruchomienie: node scripts/test_opis_miejsc.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Końce linii zależą od checkoutu (CRLF na Windows) — normalizujemy przed cięciem.
const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8').split(String.fromCharCode(13)).join('');
global.window = global.window || {};
const P = require(path.join(__dirname, '..', 'frontend', 'places.js'));
const Places = P.observedVoivodeships ? P : (global.window.Places || globalThis.Places);

function zbuduj(jezyk) {
  const start = app.indexOf('function opisMiejsc(');
  assert.ok(start >= 0, 'brak funkcji opisMiejsc');
  const koniec = app.indexOf('\n}\n', start) + 2;
  const UI = { t: (pl, en, uk) => ({ pl, en, uk })[jezyk], voiv: (v) => v };
  return new Function('UI', 'Places', app.slice(start, koniec) + '\nreturn opisMiejsc;')(UI, Places);
}

const miejsca = [
  { name: 'Dom', region: 'lubelskie', alerts: true },
  { name: 'Praca', region: 'lubelskie', alerts: true },
  { name: 'Mama', region: 'mazowieckie', alerts: true },
  { name: 'Działka', region: 'lubelskie', alerts: false },
  { name: 'Brat', region: 'podkarpackie', alerts: true },
  { name: 'Szkoła', region: 'małopolskie', alerts: true },
  { name: 'Ciocia', region: 'śląskie', alerts: false },
  { name: 'Babcia', region: 'lubelskie', alerts: true },
];

test('każde z 8 miejsc pada w linii z nazwy, liczba miejsc i województw się zgadza', () => {
  const t = zbuduj('pl')(miejsca);
  assert.match(t, /Zapisane miejsca: 8 z 8, w 5 województwach\./);
  for (const m of miejsca) assert.ok(t.includes(m.name), `brak miejsca ${m.name}: ${t}`);
});

test('alarmy pogrupowane po województwie, bez alarmów osobno', () => {
  const t = zbuduj('pl')(miejsca);
  assert.match(t, /Alarmy dla: lubelskie \(Dom, Praca, Babcia\); mazowieckie \(Mama\); podkarpackie \(Brat\); małopolskie \(Szkoła\)\./);
  assert.match(t, /Bez alarmów: Działka, Ciocia\.$/);
});

test('jedno województwo, wszystkie z alarmami — bez sekcji „Bez alarmów”', () => {
  const t = zbuduj('pl')([{ name: 'Dom', region: 'lubelskie', alerts: true }]);
  assert.equal(t, 'Zapisane miejsca: 1 z 8, w 1 województwie. Alarmy dla: lubelskie (Dom).');
});

test('żadne miejsce bez alarmów — „brak”, a nie pusta lista', () => {
  const t = zbuduj('pl')([{ name: 'Dom', region: 'lubelskie', alerts: false }]);
  assert.match(t, /Alarmy dla: brak\. Bez alarmów: Dom\./);
});

test('EN i UK mają te same liczby', () => {
  assert.match(zbuduj('en')(miejsca), /^Saved places: 8 of 8, in 5 provinces\./);
  assert.match(zbuduj('uk')(miejsca), /^Збережені місця: 8 з 8, у 5 воєводствах\./);
});

test('renderPlacesSummary pisze przez textContent (nazwy miejsc to tekst użytkownika)', () => {
  const s = app.indexOf('function renderPlacesSummary(');
  const f = app.slice(s, app.indexOf('\n}\n', s));
  assert.match(f, /el\.textContent\s*=\s*opisMiejsc\(savedPlaces\)/);
  assert.doesNotMatch(f, /innerHTML/);
});

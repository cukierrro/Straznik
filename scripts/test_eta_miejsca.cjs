// Czas do zapisanego miejsca liczony tą samą prędkością co czas do granicy
// i województwa (17.11.2026: „do woj. 47–51 min”, a „Dom 299 km ~572 min”).
// Uruchomienie: node scripts/test_eta_miejsca.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');

function cialo(nazwa) {
  const start = app.indexOf(`function ${nazwa}(`);
  assert.ok(start >= 0, `brak funkcji ${nazwa}`);
  const next = app.indexOf('\nfunction ', start + 10);
  return app.slice(start, next < 0 ? undefined : next);
}

test('jedna funkcja wybiera prędkość: serwer, potem większa ze zmierzonej i typowej', () => {
  const f = cialo('alarmSpeedKmh');
  assert.match(f, /straznik_speed/);
  assert.match(f, /Math\.max\(\s*measuredTrackSpeed\(t\)\s*\|\|\s*0\s*,\s*typical\s*\)/);
});

test('czas do granicy i województwa bierze alarmSpeedKmh', () => {
  assert.match(cialo('etaInfo'), /const v\s*=\s*alarmSpeedKmh\(t\)/);
});

test('zapisane miejsca nie biorą gołej prędkości ze śladu', () => {
  const f = cialo('localPlaceHtml');
  assert.match(f, /alarmSpeedKmh\(t\)/);
  assert.doesNotMatch(f, /measuredTrackSpeed\(/);
  assert.match(f, /Places\.exactPoint\([^)]*speed/);
});

test('rachunek z karty 17.11: 299 km przy 180 km/h to ~97 min, nie ~572', () => {
  global.window = global.window || {};
  const Places = require(path.join(__dirname, '..', 'frontend', 'places.js'));
  const P = Places.exactPoint ? Places : (global.window.Places || globalThis.Places);
  // punkt 299 km dokładnie na kursie 0° (na północ)
  const info = P.exactPoint({ gps: { lat: 49.4 + 299 / 111.2, lon: 25.6 } },
    { lat: 49.4, lon: 25.6, heading: 0 }, 180, 2.5);
  assert.ok(info.etaMin >= 95 && info.etaMin <= 98, String(info.etaMin));
});

// Klucz czerwonego dla rakiet: „pierwsza linia” — TRYB WBUDOWANY (lustro
// scripts/test_rakieta_pierwsza_linia.py, decyzja usera 20.11.2026).
//
// 20.11.2026 05:54 małopolskie i świętokrzyskie dostały czerwony od rakiet nad obwodem
// lwowskim, ~190 km od tych województw, z nieznanym kursem. Poza Polską i bez kursu na
// województwo klucz dostają tylko województwa pierwszej linii (do granicy PL + 60 km).
//
// Uruchomienie: node scripts/test_rakieta_pierwsza_linia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const context = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
});
// PL_OUTLINE jest w osobnym pliku (w aplikacji ładowany przed engine.js)
const zrodlo = ['frontend/pl-outline.js', 'frontend/engine.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
vm.runInContext(zrodlo + '\nthis.TestEngine = Engine;', context);
const Engine = context.TestEngine;
const REF = Date.parse('2026-11-20T04:55:00Z');
const LWOW = [49.836, 24.032];

const rakieta = (voiv, km, eta, o = {}) => ({
  id: Math.random(), t: REF - 60000, ts: new Date(REF - 60000).toISOString(), source: 'neptun',
  event_type: 'neptun_threat', voivodeship: voiv, points: 0.8, title: 'test',
  details: { type: o.typ || 'missile', lat: o.lat ?? LWOW[0], lon: o.lon ?? LWOW[1], dist_km: km,
             eta_border_min: eta, course: o.course || 'unknown', heading: o.heading ?? null,
             confidence: 'high', source_count: 20, uncertainty_km: 4 },
});

test('stałe jak w config.py', () => {
  const m = /RED_GATE_RAKIETY_MARGINES_KM = ([\d.]+)/.exec(fs.readFileSync('backend/app/config.py', 'utf8'));
  const j = /RED_GATE_RAKIETY_MARGINES_KM = ([\d.]+)/.exec(fs.readFileSync('frontend/engine.js', 'utf8'));
  assert.ok(m && j, 'brak RED_GATE_RAKIETY_MARGINES_KM');
  assert.equal(Number(j[1]), Number(m[1]));
});

test('poranek 20.11: pierwsza linia tak, głąb kraju nie', () => {
  assert.ok(Engine.redKey([rakieta('lubelskie', 57.7, 1)], REF), 'lubelskie 57,7 km');
  assert.ok(Engine.redKey([rakieta('podkarpackie', 57.8, 1)], REF), 'podkarpackie 57,8 km');
  assert.equal(Engine.redKey([rakieta('małopolskie', 192.5, 11)], REF), null, 'małopolskie 192,5 km');
  assert.equal(Engine.redKey([rakieta('świętokrzyskie', 187.8, 11)], REF), null, 'świętokrzyskie 187,8 km');
});

test('wyjątki: nad Polską, dron, brak pozycji', () => {
  assert.ok(Engine.redKey([rakieta('małopolskie', 90, 7, { lat: 50.04, lon: 22.0 })], REF), 'nad Polską');
  assert.ok(Engine.redKey([rakieta('małopolskie', 40, 13, { typ: 'uav' })], REF), 'dron bez zmian');
  const s = rakieta('małopolskie', 192.5, 11);
  delete s.details.lat;
  assert.ok(Engine.redKey([s], REF), 'bez pozycji jak dotąd (główny sygnał obiektu w trybie wbudowanym)');
});

// Premia za kurs na województwo (B15) i napis „w odległości” — TRYB WBUDOWANY,
// lustro scripts/test_kurs_woj.py. Oba porównują się z tym samym wzorcem serwera
// w scripts/kurs_woj_przypadki.json (25.10.2026).
//
// Uruchomienie: node scripts/test_kurs_woj.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const context = vm.createContext({
  console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval, window: {},
  fetch: async () => ({ ok: true, text: async () => '{}' }),
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  },
});
// kontury Polski i województw ładuje index.html osobnymi plikami — doklejamy je przed silnikiem
vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n'
  + fs.readFileSync('frontend/voiv-outline.js', 'utf8') + '\n'
  + fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const E = context.TestEngine;
const DANE = JSON.parse(fs.readFileSync('scripts/kurs_woj_przypadki.json', 'utf8'));

const sygnaly = (track) => {
  E.podloga.neptunEval(JSON.parse(JSON.stringify(track)));
  const out = {};
  for (const s of E.podloga.sygnaly().filter(x => x.details?.track_id === track.id && x.event_type === 'neptun_threat'))
    out[s.voivodeship] = s;
  return out;
};

test('dron pod Tarnopolem (kurs 233°): w lubelskim „w odległości”, nie „kursem na granicę”', () => {
  const w = sygnaly(DANE.przypadki.find(p => p.nazwa === 'tarnopol_233').track);
  assert.match(w.lubelskie.title, /w odległości 148,9 km od woj\. lubelskie/);
  assert.doesNotMatch(w.lubelskie.title, /kursem na granicę/);
  assert.equal(w.lubelskie.details.voiv_secondary, true, 'panel opisuje jak przypisanie po odległości');
  assert.ok(w.podkarpackie.details.waga_kursu_woj > 1 && w.lubelskie.details.waga_kursu_woj < 1,
    'podkarpackie (bliżej kursu) zyskuje, lubelskie oddaje');
});

test('punkty i napisy zgodne z serwerem we wszystkich przypadkach', () => {
  for (const p of DANE.przypadki) {
    const w = sygnaly(p.track);
    const teraz = Object.fromEntries(Object.entries(w).map(([v, s]) =>
      [v, { points: s.points, obok: !!s.details.kurs_obok_woj }]));
    assert.deepEqual(JSON.parse(JSON.stringify(teraz)), DANE.oczekiwane[p.nazwa], p.nazwa);
  }
});

test('bez kursu — mnożnik 1 i napis jak dotąd', () => {
  const w = sygnaly(DANE.przypadki.find(p => p.nazwa === 'bez_kursu').track);
  for (const s of Object.values(w)) {
    assert.equal(s.details.waga_kursu_woj ?? 1, 1);
    assert.ok(!s.details.kurs_obok_woj);
  }
});

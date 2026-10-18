// Klucz czerwonego w TRYBIE WBUDOWANYM (lustro test_czerwony_domniemany.py, 18.10.2026).
//
// 1. V3: punkt „na cel” (kurs domniemany + pozycja rejonowa) nie daje klucza.
// 2. Ścieżka OD POCZĄTKU DO KOŃCA: neptunEval → stateFrom → red_key. Do 18.10.2026
//    sygnał NEPTUN z silnika nie miał pól `type`, `area_only` ani `uncertainty_km`,
//    więc redKey odrzucał każdy obiekt i tryb bez serwera nigdy nie dawał czerwonego
//    z bliskiego obiektu. test_czerwony_klucz.cjs tego nie widział, bo buduje
//    sygnały ręcznie — dlatego tutaj sygnał tworzy produkcyjny neptunEval.
//
// Uruchomienie: node scripts/test_czerwony_domniemany.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function silnik() {
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
  vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n'
    + fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
  return context.TestEngine;
}

const KULIKOW = {
  t: Date.parse('2026-10-18T07:17:43Z'), ts: '2026-10-18T07:17:43+00:00', source: 'neptun',
  event_type: 'neptun_threat', voivodeship: 'lubelskie', points: 0.38, title: 'Dron „na cel”',
  details: { track_id: 'trk_00277892', type: 'uav', course: 'presumptive', heading_source: 'presumptive',
    position_approximate: true, uncertainty_km: 25, area_only: null, dist_km: 48.9, eta_border_min: 13,
    source_count: 2, confidence: 'medium' },
};
const UA = { t: Date.parse('2026-10-18T06:55:28Z'), ts: '2026-10-18T06:55:28+00:00', source: 'ua_alert',
  event_type: 'ua_alert_border', voivodeship: 'lubelskie', points: 1.0, title: 'Alarm w obwodzie lwowskim',
  details: { oblast: 'Львівська', distance_km: 0 } };
const tlo = (n) => Array.from({ length: n }, (_, i) => ({
  t: Date.parse('2026-10-18T07:1' + (i % 9) + ':00Z'), ts: `2026-10-18T07:1${i % 9}:00+00:00`,
  source: 'neptun', event_type: 'neptun_threat', voivodeship: 'lubelskie', points: 0.5,
  title: `dron ${i}`, details: { track_id: `trk_tlo_${i}`, type: 'uav', course: 'known', dist_km: 120,
    eta_border_min: 38, source_count: 3, confidence: 'high' } }));
const REF = Date.parse('2026-10-18T07:20:19Z');

test('V3: punkt „na cel” z 18.10 nie otwiera czerwonego, wersja punktowa tak', () => {
  const E = silnik();
  const st = E.stateFrom([UA, KULIKOW, ...tlo(8)], REF).voivodeships.lubelskie;
  assert.ok(st.own_score >= 4, `punkty ponad próg czerwonego (${st.own_score})`);
  assert.equal(st.red_key, null, 'bez klucza');
  assert.notEqual(st.alert_level, 'high', 'zostaje żółty');

  const punktowy = { ...KULIKOW, details: { ...KULIKOW.details, position_approximate: false } };
  const st2 = E.stateFrom([UA, punktowy, ...tlo(8)], REF).voivodeships.lubelskie;
  assert.equal(st2.red_key?.powod, 'eta', 'kurs domniemany przy pozycji punktowej nadal daje klucz (28.09)');
});

test('od neptunEval do klucza: bliski dron w trybie bez serwera otwiera czerwony', () => {
  const E = silnik();
  // dron 10 km od granicy pod Rostaniem, z kursem na granicę, potwierdzony
  E.podloga.neptunEval({ id: 'trk_e2e', type: 'uav', lat: 51.59944, lon: 23.70936, heading: 243,
    confidenceLevel: 'high', sourceCount: 4, lifecycle: 'confirmed', positionQuality: 'confirmed',
    uncertaintyKm: 4, region: 'Волинська область' });
  const s = [...E.podloga.sygnaly()].filter(x => x.details?.track_id === 'trk_e2e');
  assert.equal(s.length, 1, 'silnik utworzył sygnał');
  assert.equal(s[0].details.type, 'uav', 'sygnał niesie typ obiektu');
  const st = E.stateFrom([UA, ...s], Date.now()).voivodeships.lubelskie;
  assert.ok(st.red_key, `klucz czerwonego z bliskiego obiektu (punkty ${st.own_score}, sygnał ${s[0].points} pkt)`);
});

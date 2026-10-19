// Podłoga dla dronów tuż przy granicy — TRYB WBUDOWANY (lustro test_podloga_dron.py).
// Noc 17/18.10.2026: dron pod Rostaniem, 10,2 km od granicy, bez kursu, 2 zgłoszenia
// — 0,57 pkt. Teraz sam daje próg żółtego w lubelskim, a dodatek z podłogi nie
// przechodzi do sąsiadów.
//
// Uruchomienie: node scripts/test_podloga_dron.cjs
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
// kontur Polski ładuje index.html osobnym plikiem — tu doklejamy go przed silnikiem
vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n'
  + fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const E = context.TestEngine;

const ROSTAN = { id: 'trk_test_rostan', type: 'uav', lat: 51.59944, lon: 23.70936,
  confidenceLevel: 'high', sourceCount: 2, lifecycle: 'created',
  positionQuality: 'confirmed', uncertaintyKm: 28, region: 'Волинська область' };

test('kto dostaje podłogę', () => {
  const f = E.podloga.borderUavFloor;
  assert.equal(f({ ...ROSTAN }, 10.2), 2);
  assert.equal(f({ ...ROSTAN, sourceCount: 1 }, 10.2), 0, 'jedno zgłoszenie — nie');
  assert.equal(f({ ...ROSTAN }, 30.5), 0, 'dalej niż 30 km — nie');
  assert.equal(f({ ...ROSTAN, type: 'recon' }, 12), 0, 'rozpoznanie — nie');
  assert.equal(f({ ...ROSTAN, positionQuality: 'approx' }, 12), 0, 'pozycja rejonowa — nie');
});

test('dron spod Rostania: 2,0 pkt w lubelskim, bez przelewu do sąsiadów', () => {
  E.podloga.neptunEval({ ...ROSTAN });
  const s = E.podloga.sygnaly().filter(x => x.details?.track_id === ROSTAN.id);
  assert.equal(s.length, 1);
  assert.equal(s[0].voivodeship, 'lubelskie');
  assert.equal(s[0].points, 2, 'próg żółtego');
  assert.ok(Math.abs(s[0].details.bez_przeniesienia_pkt - 1.43) < 0.02,
    `dodatek z podłogi zapisany (${s[0].details.bez_przeniesienia_pkt})`);
  assert.match(s[0].title, /\[blisko granicy\]/);

  const st = E.stateFrom(s, Date.now()).voivodeships;
  assert.ok(st.lubelskie.own_score >= 2, `lubelskie własne ${st.lubelskie.own_score}`);
  const sasiedzi = Object.entries(st).filter(([v, x]) => v !== 'lubelskie' && x.score > 0);
  assert.deepEqual(sasiedzi.map(([v]) => v), [], 'podłoga nie przelewa się do sąsiadów');

  // kontrola W1 (19.10.2026): obiekty NEPTUN w ogóle nie przechodzą do sąsiadów —
  // także te same 2,0 pkt bez znacznika podłogi (wcześniej kontrola była odwrotna)
  const zwykly = { ...s[0], details: { ...s[0].details } };
  delete zwykly.details.bez_przeniesienia_pkt;
  const st2 = E.stateFrom([zwykly], Date.now()).voivodeships;
  assert.equal(st2.podkarpackie.score, 0, 'zwykłe punkty drona też nie przechodzą do sąsiada');
});

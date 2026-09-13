// Lustro scripts/test_przeniesienia.py i test_rso_odwolanie.py dla silnika
// wbudowanego (tryb awaryjny bez serwera). Uruchomienie: node --test scripts/test_przeniesienia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const context = vm.createContext({
  console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
});
vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const Engine = context.TestEngine;

const REF = Date.parse('2026-09-13T05:20:00Z');
const sig = (id, voiv, source, points, details = {}, ts = '2026-09-13T05:10:00Z', event_type) => ({
  id, t: Date.parse(ts), ts, source, voivodeship: voiv, points, title: `sygnał ${id}`, details,
  event_type: event_type || { media: 'media_keywords', neptun: 'neptun_threat',
    ua_alert: 'ua_alert_border', rcb: 'rso_alert' }[source],
});
const spill = (st, target, src) => st.voivodeships[target].signals
  .filter(s => s.source === 'spillover' && s.details.from === src)
  .reduce((a, s) => a + s.counted_points, 0);

test('shared event does not come back through spillover', () => {
  const link = { link: 'https://example.test/rcb-wyslalo-alerty' };
  const obwod = { oblast: 'Рівненська', distance_km: 70 };
  const st = Engine.stateFrom([
    sig(1, 'lubelskie', 'media', 1.0, link), sig(2, 'podkarpackie', 'media', 1.0, link),
    sig(3, 'lubelskie', 'ua_alert', 0.6, obwod), sig(4, 'podkarpackie', 'ua_alert', 0.6, obwod),
    sig(5, 'podkarpackie', 'neptun', 1.0, { track_id: 'a' }),
    sig(6, 'lubelskie', 'neptun', 0.5, { track_id: 'b' }),
  ], REF);
  assert.equal(spill(st, 'lubelskie', 'podkarpackie'), 0);
  assert.equal(spill(st, 'świętokrzyskie', 'podkarpackie'), 1.0);
  assert.equal(st.voivodeships.lubelskie.own_score, 2.1);
});

test('independent neighbour event still spills', () => {
  const st = Engine.stateFrom([sig(10, 'podkarpackie', 'neptun', 3.0, { track_id: 'c' }),
                               sig(11, 'lubelskie', 'neptun', 0.5, { track_id: 'd' })], REF);
  assert.equal(spill(st, 'lubelskie', 'podkarpackie'), 1.2);
});

test('spillover-only colour is flagged and does not alert', () => {
  const st = Engine.stateFrom([sig(20, 'lubelskie', 'neptun', 5.0, { track_id: 'e' })], REF);
  const sw = st.voivodeships['podkarpackie'];
  assert.equal(sw.level, 'elevated');
  assert.equal(sw.alert_level, 'none');
  assert.equal(sw.spill_raised, true);
  assert.equal(st.voivodeships.lubelskie.spill_raised, false);
});

test('alert level matches fusion.alert_level', () => {
  const A = Engine.alertLevel;
  assert.equal(A(0.0, 2.0), 'none');
  assert.equal(A(0.05, 2.5), 'none');
  assert.equal(A(1.2, 4.5), 'elevated');
  assert.equal(A(2.1, 4.0), 'high');
  assert.equal(A(2.0, 2.0), 'elevated');
  assert.equal(A(1.97, 1.97), 'elevated');
  assert.equal(A(3.87, 3.87, 'high'), 'high');
  assert.equal(A(3.4, 3.4, 'high'), 'elevated');
  assert.equal(A(1.4, 1.4, 'elevated'), 'none');
  assert.equal(A(3.87, 3.87, 'elevated'), 'elevated');
});

test('RSO cancellation recognised like rso.py', () => {
  assert.equal(Engine.rsoIsCancellation({ rso_alarm: '2', title: 'ALERT RCB', shortcut: '' }), true);
  assert.equal(Engine.rsoIsCancellation({ rso_alarm: '', title: 'ALERT RCB',
    shortcut: 'UWAGA! Odwołano zagrożenie atakiem z powietrza.' }), true);
  assert.equal(Engine.rsoIsCancellation({ rso_alarm: '', title: 'ALERT RCB',
    shortcut: 'Alert obowiązuje do odwołania.' }), false);
  assert.equal(Engine.rsoIsCancellation({ rso_alarm: '1', title: 'ALERT RCB-ZAGROŻENIE Z POWIETRZA',
    shortcut: 'Rosyjski atak powietrzny na terenie Ukrainy.' }), false);
});

test('cancelled alert and echo articles score zero, newer alert stays', () => {
  const alert = sig(1, 'lubelskie', 'rcb', 2.0, { rso_id: '23329799', valid_from: '2026-09-13 04:09:00' },
                    '2026-09-13T02:11:10Z');
  const clear = sig(2, 'lubelskie', 'rcb', 0, { rso_id: '23329799', cleared_at: '2026-09-13T02:58:13Z' },
                    '2026-09-13T02:58:40Z', 'rso_clear');
  let lub = Engine.accumulate([alert, clear], Date.parse('2026-09-13T03:00:00Z')).lubelskie;
  assert.equal(lub.score, 0);
  assert.equal(lub.signals[0].official_clear, 'alert');

  const syreny = { ...sig(10, 'lubelskie', 'media', 1.5, {}, '2026-09-13T05:39:57Z'),
    title: 'Media: „Alarm powietrzny na Lubelszczyźnie. W sześciu powiatach zawyły syreny”' };
  const ref = Date.parse('2026-09-13T05:46:00Z');
  lub = Engine.accumulate([syreny, clear], ref).lubelskie;
  assert.equal(lub.score, 0);
  assert.equal(lub.signals[0].official_clear, 'after_clear');

  const nowy = sig(11, 'lubelskie', 'rcb', 2.0, { rso_id: '23330500', valid_from: '2026-09-13 07:19:00' },
                   '2026-09-13T05:20:00Z');
  lub = Engine.accumulate([syreny, clear, nowy], ref).lubelskie;
  assert.equal(lub.score, 3);

  const dron = { ...sig(12, 'lubelskie', 'media', 1.5, {}, '2026-09-13T05:39:57Z'),
    title: 'Media: „Szczątki drona znalezione w polu pod Chełmem”' };
  assert.equal(Engine.accumulate([dron, clear], ref).lubelskie.score, 1);
});

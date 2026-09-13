// Koniec i czas trwania alarmów obwodów UA w silniku aplikacji — lustro
// scripts/test_ua_koniec.py (wariant B2, 13.09.2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

const js = fs.readFileSync('frontend/engine.js', 'utf8');
const a = js.indexOf('const UA_ALERT_LONG_FACTOR');
const b = js.indexOf('function uaAlertWeight(km)');
const ctx = vm.createContext({});
vm.runInContext('const WINDOW_MIN = 60, FULL_MIN = 30;' + js.slice(a, b), ctx);

const START = Date.parse('2026-09-13T01:00:00Z');
const EP = '2026-09-13T01:00:00+00:00';
const start = (episode = EP, t = START) => ({ t, ts: new Date(t).toISOString(), event_type: 'ua_alert_border',
  voivodeship: 'lubelskie', points: 1, details: episode ? { oblast: 'Львівська', episode } : { oblast: 'Львівська' } });
const end = (min) => ({ t: START + min * 60000, event_type: 'ua_alert_end', voivodeship: 'lubelskie', points: 0,
  details: { oblast: 'Львівська', episode: EP, ended_at: new Date(START + min * 60000).toISOString() } });
const w = (sigs, min) => ctx.uaAlertFactor(sigs[0], ctx.uaAlertEnds(sigs), START + min * 60000)[0];

test('stałe zgodne z config.py', () => {
  const cfg = fs.readFileSync('backend/app/config.py', 'utf8');
  assert.equal(ctx.UA_ALERT_LONG_FACTOR ?? vm.runInContext('UA_ALERT_LONG_FACTOR', ctx),
    Number(cfg.match(/UA_ALERT_LONG_FACTOR = ([\d.]+)/)[1]));
  assert.equal(vm.runInContext('UA_ALERT_END_GRACE_S', ctx), Number(cfg.match(/UA_ALERT_END_GRACE_S = (\d+)/)[1]));
  assert.equal(vm.runInContext('UA_ALERT_MAX_MIN', ctx), 12 * 60);
});

test('wariant B2 jak na serwerze', () => {
  assert.equal(w([start()], 10), 1);
  assert.equal(w([start()], 45), 0.5);
  assert.equal(w([start()], 150), 0.5);
  assert.equal(w([start(), end(10)], 12), 0);
  assert.equal(w([start(), end(100)], 90), 0.5);
  assert.equal(w([start(null)], 45), 0.5);
  assert.equal(w([start(null)], 70), 0);
  assert.equal(w([start()], 13 * 60), 0);
});

test('trwający alarm spoza okna', () => {
  const ref = START + 150 * 60000;
  assert.equal(ctx.activeUaAlerts([start()], ref).length, 1);
  assert.equal(ctx.activeUaAlerts([start(), end(120)], ref).length, 0);
  assert.equal(ctx.activeUaAlerts([start(EP, ref - 5 * 60000)], ref).length, 0);
  assert.equal(ctx.activeUaAlerts([start(null)], ref).length, 0);
});

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
const source = fs.readFileSync('frontend/engine.js', 'utf8');
vm.runInContext(source + '\nthis.TestEngine = Engine;', context);
const Engine = context.TestEngine;

const t = iso => Date.parse(iso);
const official = {
  id: 1, t: t('2026-09-10T04:21:41Z'), ts: '2026-09-10T04:21:41Z',
  source: 'rcb', event_type: 'rso_alert', voivodeship: 'lubelskie', points: 2,
  title: 'Alert RCB (RSO): UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. W przestrzeni RP operuje polskie lotnictwo.',
  details: {rso_id: '23321638'},
};

test('standalone keeps an RCB relay visible with zero extra points', () => {
  const relay = {
    id: 2, t: t('2026-09-10T04:24:55Z'), ts: '2026-09-10T04:24:55Z',
    source: 'media', event_type: 'media_keywords', voivodeship: 'lubelskie', points: 1.5,
    title: 'Media: ALERT RCB: rosyjski atak powietrzny na Ukrainę. Polskie lotnictwo operuje w przestrzeni RP',
    details: {},
  };
  const state = Engine.accumulate([official, relay], t('2026-09-10T04:30:00Z')).lubelskie;
  assert.equal(state.score, 2);
  assert.equal(state.signals[1].counted_points, 0);
  assert.equal(state.signals[1].duplicate_of_official, '23321638');
});

test('standalone does not suppress a distinct article that only mentions RCB', () => {
  const distinct = {
    id: 3, t: t('2026-09-10T04:25:00Z'), ts: '2026-09-10T04:25:00Z',
    source: 'media', event_type: 'media_keywords', voivodeship: 'lubelskie', points: 1.5,
    title: 'Media: Rosja zaatakowała Kijów pociskami balistycznymi. Alert RCB dla Lubelszczyzny',
    details: {},
  };
  const state = Engine.accumulate([official, distinct], t('2026-09-10T04:30:00Z')).lubelskie;
  assert.equal(state.score, 3.5);
  assert.equal(state.signals[1].duplicate_of_official, undefined);
});

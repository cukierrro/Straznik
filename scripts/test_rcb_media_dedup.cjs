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

test('standalone keeps a stored Wyryki retrospective visible with zero points', () => {
  const historical = {
    id: 721, t: t('2026-09-10T17:31:11Z'), ts: '2026-09-10T17:31:11Z',
    source: 'media', event_type: 'media_keywords', voivodeship: 'lubelskie', points: 1.5,
    title: 'Media: „Najpierw postawimy choinkę. Dom w Wyrykach ma być gotowy na święta”',
    details: {},
  };
  const state = Engine.accumulate([historical], t('2026-09-10T17:40:00Z')).lubelskie;
  assert.equal(state.score, 0);
  assert.equal(state.signals[0].counted_points, 0);
  assert.equal(state.signals[0].retrospective, true);
});

test('standalone keeps a stored Podlaskie legal follow-up visible with zero points', () => {
  const historical = {
    id: 722, t: t('2026-09-11T05:16:28Z'), ts: '2026-09-11T05:16:28Z',
    source: 'media', event_type: 'media_keywords', voivodeship: 'podlaskie', points: 2,
    title: 'Media: „Amatorski lot dronem i naruszenie przestrzeni powietrznej. Są zarzuty”',
    details: {},
  };
  const state = Engine.accumulate([historical], t('2026-09-11T05:20:00Z')).podlaskie;
  assert.equal(state.score, 0);
  assert.equal(state.signals[0].counted_points, 0);
  assert.equal(state.signals[0].retrospective, true);
});

test('standalone media source cap cannot reach the yellow threshold', () => {
  const articles = [1, 2, 3].map(id => ({
    id: 800 + id, t: t(`2026-09-11T06:0${id}:00Z`), ts: `2026-09-11T06:0${id}:00Z`,
    source: 'media', event_type: 'media_keywords', voivodeship: 'podlaskie', points: 1.5,
    title: `Media: niezależny artykuł ${id}`, details: {},
  }));
  const state = Engine.accumulate(articles, t('2026-09-11T06:10:00Z')).podlaskie;
  assert.equal(state.score, 1.5);
});

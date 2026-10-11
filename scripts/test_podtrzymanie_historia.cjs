// Podtrzymanie poziomu w historii i opis w karcie (11.10.2026, zgłoszenie usera).
//
// Na żywo żółty trzyma się 10 min po ostatnim przekroczeniu progu (fusion.hold_level,
// Engine.holdLevel — koniec migotania z 16.09). 11.10 lubelskie spadło o 09:55 do
// 1,7 pkt i na mapie świeciło na żółto do 10:05, a historia gasiła je już o 09:56.
// Historia ma pokazywać to, co człowiek widział — ta sama reguła, z tym samym
// wyjątkiem: odwołanie RSO zdejmuje podtrzymanie od razu.
//
// Odtwarzamy kształt poranka 11.10: alarm w obwodzie lwowskim (1,0) + dron (1,2) daje
// żółty, koniec alarmu obwodu zdejmuje 1,0 i zostaje sam dron.
//
// Uruchomienie: node scripts/test_podtrzymanie_historia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const context = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
});
vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const Engine = context.TestEngine;
const APP = fs.readFileSync('frontend/app.js', 'utf8');
const FUSION = fs.readFileSync('backend/app/fusion.py', 'utf8');

const t = iso => Date.parse(iso);
const sygnal = (o) => ({ id: o.id, t: t(o.ts), ts: o.ts, source: o.source, event_type: o.event_type,
  voivodeship: 'lubelskie', points: o.points, title: o.title, details: o.details || {} });
const EPIZOD = '2026-10-11T07:47:59+00:00';
const lwow = sygnal({ id: 1, ts: '2026-10-11T07:47:59Z', source: 'ua_alert', event_type: 'ua_alert_border',
  points: 1.0, title: 'Alarm powietrzny w obwodzie lwowskim', details: { oblast: 'Львівська', episode: EPIZOD } });
const dron = sygnal({ id: 2, ts: '2026-10-11T07:50:54Z', source: 'neptun', event_type: 'neptun_threat',
  points: 1.22, title: 'Dron / BpSP kursem na granicę PL, 88.4 km',
  details: { type: 'uav', dist_km: 88.4, eta_border_min: 40, track_id: 'trk_1' } });
const koniec = sygnal({ id: 3, ts: '2026-10-11T07:55:32Z', source: 'ua_alert', event_type: 'ua_alert_end',
  points: 0, title: 'Koniec alarmu w obwodzie lwowskim',
  details: { oblast: 'Львівська', episode: EPIZOD, ended_at: '2026-10-11T07:55:32Z' } });
const sygnaly = [lwow, dron, koniec];
// migawki co minutę, jak na serwerze (:16)
const snaps = [];
for (let m = 49; m <= 59 + 10; m++) {
  const ts = new Date(Date.UTC(2026, 9, 11, 7, 0, 16) + m * 60000).toISOString();
  snaps.push({ ts, t: t(ts), threats: [], aircraft: [] });
}
const chwila = (hhmm) => snaps.find(s => s.ts.slice(11, 16) === hhmm);
const historia = (hhmm, sigs = sygnaly) => Engine.historyFrom(snaps, sigs, chwila(hhmm).ts);

test('punkty: żółty od 07:51, po końcu alarmu obwodu sam dron poniżej progu', () => {
  const surowo = (hhmm) => Engine.stateFrom(sygnaly.filter(s => s.t <= chwila(hhmm).t), chwila(hhmm).t)
    .voivodeships.lubelskie;
  assert.ok(surowo('07:51').score >= 2, `07:51 ma być ≥ 2 pkt (${surowo('07:51').score})`);
  assert.ok(surowo('07:56').score < 2, `07:56 ma być < 2 pkt (${surowo('07:56').score})`);
});

test('historia trzyma żółty 10 min po ostatnim przekroczeniu progu', () => {
  const h = historia('07:56');
  assert.equal(h.levels.lubelskie, 'elevated', '07:56 przy 1,x pkt nadal żółty — jak na żywo');
  assert.ok(h.podtrzymanie.lubelskie, 'historia mówi, że to podtrzymanie');
  assert.equal(h.podtrzymanie.lubelskie.do.slice(11, 16), '08:05', 'do 10 min po 07:55 (ostatnia żółta migawka)');
  assert.equal(historia('08:04').levels.lubelskie, 'elevated', '08:04 jeszcze żółty');
  assert.equal(historia('08:06').levels.lubelskie, undefined, '08:06 już zgaszony');
  assert.equal(historia('08:06').podtrzymanie.lubelskie, undefined);
});

test('odwołanie RSO zdejmuje podtrzymanie od razu', () => {
  const odwolanie = sygnal({ id: 4, ts: '2026-10-11T07:55:50Z', source: 'rcb', event_type: 'rso_clear',
    points: 0, title: 'Odwołanie alertu RCB' });
  assert.equal(historia('07:57', sygnaly.concat(odwolanie)).levels.lubelskie, undefined);
});

test('pasek suwaka ma to samo podtrzymanie', () => {
  const pkt = Engine.timelineFrom(snaps, sygnaly);
  const p = (hhmm) => pkt.find(x => x.ts.slice(11, 16) === hhmm);
  assert.equal(p('07:56').level, 'elevated');
  assert.equal(p('07:56').podtrzymany, true);
  assert.equal(p('08:06').level, 'none');
  assert.equal(p('07:50').level, 'none', 'przed przekroczeniem — bez zmian');
});

test('karta na żywo i w historii mówi „podtrzymany do”; serwer podaje pole', () => {
  assert.match(APP, /function podtrzymanieHTML\(p\)/);
  assert.match(APP, /\$\{podtrzymanieHTML\(st\.podtrzymanie\)\}/, 'karta na żywo');
  assert.match(APP, /\$\{podtrzymanieHTML\(podtrzymanie\[name\]\)\}/, 'karta w historii');
  assert.match(APP, /renderHistoryPanel\(sigs, perVoiv, when, ageMin, poziomHist, h\?\.podtrzymanie \|\| \{\}\)/);
  assert.match(FUSION, /st\["podtrzymanie"\] = \{/, 'fusion na żywo podaje podtrzymanie');
});

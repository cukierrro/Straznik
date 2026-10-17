// Zapasowy silnik aplikacji czyta RSO tak jak serwer (16–17.10.2026).
// 1. Zmiana stopnia W MIEJSCU (ten sam id) — w górę i w dół — to nowa wersja alertu.
//    Noc 15/16.10: wpis 23420577 zmienił się z „monitorowana” na „Znajdź bezpieczne
//    miejsce”, a silnik (jak wcześniej serwer) znał już klucz i zmianę pomijał.
// 2. Poziom z CAŁEJ treści, razem z `content`.
// 3. Czas wydania = późniejsze z valid_from i chwili pojawienia się w RSO (#12):
//    odwołanie innego wpisu z okna między nimi nie gasi nowego alertu.
//
// Uruchomienie: node scripts/test_rso_silnik.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map([['eng_rso_boot', '1']]);
let odpowiedz = [];
const context = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval, window: {},
  fetch: async () => ({ ok: true, text: async () => JSON.stringify({ newses: odpowiedz }) }),
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  },
});
vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const E = context.TestEngine;

const LUB = { 3: { id: '3', name: 'Lubelskie', slug_name: 'lubelskie' } };
const MONITOR = {
  id: 23420577, title: 'ALERT RCB ', rso_alarm: '2', provinces: LUB,
  shortcut: 'UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.',
  content: 'UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.',
  valid_from: '2026-10-15 23:59:00', valid_to: '2099-10-16 23:59:00',
  created_at: '2026-10-16 00:00:22', updated_at: '2026-10-16 00:00:22',
};
const SCHRONIENIE = { ...MONITOR,
  shortcut: 'Alert RCB',
  content: 'UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. Stosuj się do poleceń służb. Oczekuj dalszych komunikatów. dotyczy powiatów : włodawski, łęczyński.',
  updated_at: '2026-10-16 01:06:24' };
const alerty = () => E.rso.sygnaly().filter(s => s.event_type === 'rso_alert');

test('zmiana stopnia w miejscu: w górę i w dół, bez dubli', async () => {
  odpowiedz = [MONITOR];
  await E.rso.tickRso();
  assert.deepEqual([...alerty().map(s => s.details.rcb_level)], [1]);
  assert.equal(alerty()[0].details.issued_rso, '2026-10-16 00:00:22');
  await E.rso.tickRso();
  assert.equal(alerty().length, 1, 'ta sama treść nie dubluje');

  odpowiedz = [SCHRONIENIE];
  await E.rso.tickRso();
  assert.deepEqual([...alerty().map(s => s.details.rcb_level)], [1, 3],
    'poziom 3 z samego `content` (nagłówek to tylko „Alert RCB”)');
  assert.equal(alerty()[1].details.issued_rso, '2026-10-16 01:06:24', 'wersja: chwila edycji w RSO');

  odpowiedz = [{ ...MONITOR, updated_at: '2026-10-16 01:20:00' }];
  await E.rso.tickRso();
  assert.deepEqual([...alerty().map(s => s.details.rcb_level)], [1, 3, 1], 'zejście do poziomu 1 też wchodzi');
});

test('odwołanie innego wpisu z okna valid_from…RSO nie gasi nowego alertu (#12)', () => {
  const T = Date.parse('2026-10-15T22:01:00Z');
  const alert = { id: 1, t: T, ts: new Date(T).toISOString(), source: 'rcb', event_type: 'rso_alert',
    voivodeship: 'lubelskie', points: 1.5, title: 'Alert RCB (RSO)',
    details: { rso_id: '23420577', valid_from: '2026-10-15 23:59:00', issued_rso: '2026-10-16 00:00:22', rcb_level: 1 } };
  // odwołanie STAREGO wpisu o 23:59:40 PL — po valid_from, ale przed pojawieniem się nowego alertu
  const odw = { id: 2, t: T - 30000, ts: new Date(T - 30000).toISOString(), source: 'rcb', event_type: 'rso_clear',
    voivodeship: 'lubelskie', points: 0, title: 'RCB (RSO): odwołanie',
    details: { rso_id: '23419999', clear: true, cleared_at: '2026-10-15T21:59:40.000Z' } };
  const ref = T + 60000;
  const z = E.stateFrom([alert, odw], ref).voivodeships.lubelskie;
  assert.equal(z.score, 1.5, `nowy alert zostaje (${z.score})`);
  const bez = { ...alert, details: { ...alert.details, issued_rso: undefined } };
  const stary = E.stateFrom([bez, odw], ref).voivodeships.lubelskie;
  assert.equal(stary.score, 0, 'bez chwili z RSO (sam valid_from) — tak było przed poprawką');
});

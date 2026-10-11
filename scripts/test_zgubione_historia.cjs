// Obiekt zgubiony z feedu NEPTUN-a gaśnie szybciej — w HISTORII aplikacji (11.10.2026).
//
// Na żywo liczy serwer (fusion.lost_weight + collectors/neptun._zgubione), a historię
// aplikacja z migawek: obiekt, którego nie ma w migawce, zniknął w chwili ostatniej
// obecności. Pełna waga 15 min od zniknięcia, potem liniowo do zera w 15 min.
// Wyjątek: zgubiony bliżej granicy niż 50 km — NEPTUN gubi obiekty wlatujące nad
// Polskę (28.09 0,2 km, 08.10 12,5 km przed alertem RCB).
//
// Odtwarzamy poranek 11.10: dron 88,4 km od granicy o 07:50:54 dawał lubelskiemu
// 1,22 pkt jeszcze godzinę po zniknięciu z mapy.
//
// Uruchomienie: node scripts/test_zgubione_historia.cjs
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
const ENGINE = fs.readFileSync('frontend/engine.js', 'utf8');
const CONFIG = fs.readFileSync('backend/app/config.py', 'utf8');

const t = iso => Date.parse(iso);
const dron = (km) => ({ id: 2, t: t('2026-10-11T07:50:54Z'), ts: '2026-10-11T07:50:54Z',
  source: 'neptun', event_type: 'neptun_threat', voivodeship: 'lubelskie', points: 1.22,
  title: `Dron / BpSP kursem na granicę PL, ${km} km`,
  details: { type: 'uav', dist_km: km, eta_border_min: 40, track_id: 'trk_1' } });

// migawki co minutę od 07:50:16 do 08:40:16; obiekt obecny do `do` włącznie
function migawki({ km = 88.4, doHHMM = '07:52', bezPozycjiPotem = false, dziuraPo = false } = {}) {
  const out = [];
  for (let m = 50; m <= 100; m++) {
    const ts = new Date(Date.UTC(2026, 9, 11, 7, 0, 16) + m * 60000).toISOString();
    const hhmm = ts.slice(11, 16);
    if (dziuraPo && hhmm > doHHMM && hhmm < '08:30') continue;     // aplikacja w tle
    const jest = hhmm <= doHHMM;
    out.push({ ts, t: t(ts), aircraft: [],
      threats: jest ? [{ id: 'trk_1', type: 'uav', lat: 50.5, lon: 25.0, pl_assessment: { dist_km: km } }] : [],
      ...(bezPozycjiPotem && !jest ? { bezPozycji: ['trk_1'] } : {}) });
  }
  return out;
}
const pkt = (snaps, sigs, hhmm) => {
  const sn = snaps.find(s => s.ts.slice(11, 16) === hhmm);
  const h = Engine.historyFrom(snaps, sigs, sn.ts);
  const sig = h.signals.find(s => s.details?.track_id === 'trk_1');
  return { score: h.scores.lubelskie || 0, counted: sig?.counted_points ?? 0, lost: !!sig?.lost_feed };
};

test('stałe są lustrem config.py', () => {
  const py = (n) => Number(CONFIG.match(new RegExp(`^${n}\\s*=\\s*([\\d.]+)`, 'm'))[1]);
  const js = (n) => Number(ENGINE.match(new RegExp(`${n} = ([\\d.]+)`))[1]);
  assert.equal(js('LOST_FULL_MIN'), py('NEPTUN_LOST_FULL_MIN'));
  assert.equal(js('LOST_FADE_MIN'), py('NEPTUN_LOST_FADE_MIN'));
  assert.equal(js('LOST_EXEMPT_KM'), py('NEPTUN_LOST_EXEMPT_KM'));
});

test('lostWeight: 15 min pełnej wagi, potem do zera w 15 min; ≤50 km bez zmian', () => {
  const at = t('2026-10-11T08:00:00Z'), m = 60000;
  assert.equal(Engine.lostWeight(null, at, at + 60 * m), 1, 'nieznany = jak dotąd');
  assert.equal(Engine.lostWeight([at, 100], at - m, at + 15 * m), 1);
  assert.ok(Math.abs(Engine.lostWeight([at, 100], at - m, at + 22.5 * m) - 0.5) < 1e-9);
  assert.equal(Engine.lostWeight([at, 100], at - m, at + 30 * m), 0);
  assert.equal(Engine.lostWeight([at, 50], at - m, at + 45 * m), 1, '50 km = wyjątek');
  assert.equal(Engine.lostWeight([at, null], at - m, at + 30 * m), 0, 'bez odległości — bez wyjątku');
  assert.equal(Engine.lostWeight([at, 100], at + 10 * m, at + 25 * m), 1,
    'sygnał po zniknięciu — liczymy od sygnału');
});

test('11.10: dron zgubiony 88 km od granicy gaśnie po ~30 min zamiast 60', () => {
  const snaps = migawki(), sigs = [dron(88.4)];
  const a = pkt(snaps, sigs, '08:00');
  assert.equal(a.counted, 1.2, `08:00 (8 min po zniknięciu) pełna waga, jest ${a.counted}`);
  assert.equal(a.lost, false);
  const b = pkt(snaps, sigs, '08:15');
  assert.ok(b.counted > 0 && b.counted < 1.0, `08:15 częściowo wygaszony, jest ${b.counted}`);
  assert.equal(b.lost, true, 'sygnał oznaczony lost_feed');
  const c = pkt(snaps, sigs, '08:25');
  assert.equal(c.counted, 0, `08:25 (33 min po zniknięciu) zero, jest ${c.counted}`);
  // dla porównania: obiekt nadal w feedzie trzyma wagę wiekiem
  const stale = migawki({ doHHMM: '23:59' });
  assert.ok(pkt(stale, sigs, '08:25').counted > 0.9, 'śledzony obiekt — bez zmian (waga wiekiem)');
});

test('wyjątek: zgubiony ≤50 km od granicy liczy się jak dotąd', () => {
  const snaps = migawki({ km: 12.5 }), sigs = [dron(12.5)];
  const c = pkt(snaps, sigs, '08:25');
  const stale = pkt(migawki({ km: 12.5, doHHMM: '23:59' }), sigs, '08:25');
  assert.equal(c.counted, stale.counted, 'tyle samo co śledzony');
  assert.ok(c.counted > 0.9);
  assert.equal(c.lost, false);
});

test('nie wiemy, kiedy zniknął — bez zmian', () => {
  const sigs = [dron(88.4)];
  const zawsze = pkt(migawki({ doHHMM: '23:59' }), sigs, '08:25').counted;
  // dziura w buforze zaraz po ostatniej obecności (aplikacja w tle)
  assert.equal(pkt(migawki({ dziuraPo: true }), sigs, '08:35').counted,
               pkt(migawki({ doHHMM: '23:59' }), sigs, '08:35').counted, 'dziura = jak dotąd');
  // obiekt nigdy niewidziany w migawkach
  const pusto = migawki({ doHHMM: '00:00' });
  assert.equal(pkt(pusto, sigs, '08:25').counted, zawsze, 'nieznany track = jak dotąd');
  // obiekt w feedzie, ale bez współrzędnych (pole bezPozycji w buforze aplikacji)
  assert.equal(pkt(migawki({ bezPozycjiPotem: true }), sigs, '08:25').counted, zawsze,
    'obiekt bez pozycji nie jest zgubiony');
});

test('pasek suwaka i podtrzymanie liczą to samo', () => {
  const snaps = migawki(), sigs = [dron(88.4)];
  const tl = Engine.timelineFrom(snaps, sigs);
  const p = tl.find(x => x.ts.slice(11, 16) === '08:25');
  assert.equal(p.score, 0, `pasek 08:25 = 0, jest ${p.score}`);
  assert.ok(/surowyStan\(s, sigs, snaps\)/.test(ENGINE), 'podtrzymanie w historii też z migawkami');
});

test('bufor aplikacji zapisuje obiekty bez pozycji, serwer ma je w migawce', () => {
  assert.match(APP, /bezPozycji: \(s\?\.neptun\?\.threats \|\| \[\]\)\.filter\(t => t\.lat == null\)/);
  assert.match(ENGINE, /bezPozycji: \[\.\.\.tracks\.values\(\)\]\.filter\(t => t\.lat == null\)/);
});

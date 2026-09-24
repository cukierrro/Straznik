// Klucz czerwonego alarmu, poziomy Alertu RCB i fala obiektów (decyzje usera 23.09.2026).
//
// Tła: 23.09.2026 lubelskie doszło do 5,6 pkt („WYSOKI PRIORYTET”), choć RCB wysłało
// alert NAJNIŻSZEGO poziomu („sytuacja jest monitorowana”), najbliższy obiekt był 84 km
// od granicy, a Geran spadł na Kowel po stronie ukraińskiej. Wszystkie siedem czerwonych
// alarmów w historii stało na alercie tego poziomu. Od teraz czerwony wymaga KLUCZA.
//
// Uruchomienie: node scripts/test_czerwony_klucz.cjs
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
vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
const Engine = context.TestEngine;
const t = iso => Date.parse(iso);
const REF = t('2026-09-23T05:24:00Z');

const sygnal = (o) => ({ id: o.id, t: t(o.ts), ts: o.ts, source: o.source, event_type: o.event_type,
  voivodeship: 'lubelskie', points: o.points, title: o.title, details: o.details || {} });

const alertMonitorowana = sygnal({ id: 1, ts: '2026-09-23T05:13:00Z', source: 'rcb', event_type: 'rso_alert',
  points: 1.5, title: 'Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo.”' });
const alertSchronienie = sygnal({ id: 2, ts: '2026-09-23T05:13:00Z', source: 'rcb', event_type: 'rso_alert',
  points: 4.5, title: 'Alert RCB (RSO): „UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. Stosuj się do poleceń służb.”' });
const obwodyUA = sygnal({ id: 3, ts: '2026-09-23T04:54:00Z', source: 'ua_alert', event_type: 'ua_alert_border',
  points: 1.0, title: 'Alarm powietrzny w obwodzie wołyńskim' });
const dron = (id, km, eta, minuta) => sygnal({ id, ts: `2026-09-23T05:${minuta}:00Z`, source: 'neptun',
  event_type: 'neptun_threat', points: 0.5, title: `Dron / BpSP kursem na granicę PL, ${km} km`,
  details: { type: 'uav', dist_km: km, eta_border_min: eta, track_id: `trk_${id}` } });

test('alert „sytuacja monitorowana” nie zapala czerwonego nawet przy 4+ pkt', () => {
  // dokładnie poranek 23.09: alert poziomu 1 + obwody UA + drony 84–120 km
  const sygnaly = [alertMonitorowana, obwodyUA, dron(10, 84, 28, '05'), dron(11, 91, 30, '06'),
                   dron(12, 118, 39, '13'), dron(13, 104, 34, '05')];
  const st = Engine.stateFrom(sygnaly, REF).voivodeships.lubelskie;
  assert.ok(st.score >= 4, `suma miała przekroczyć 4 pkt, jest ${st.score}`);
  assert.equal(st.level, 'elevated');
  assert.equal(st.alert_level, 'elevated');
  assert.equal(st.red_key, null);
});

test('alert „znajdź bezpieczne miejsce” zapala czerwony sam', () => {
  const st = Engine.stateFrom([alertSchronienie], REF).voivodeships.lubelskie;
  assert.equal(st.alert_level, 'high');
  assert.equal(st.red_key.powod, 'rcb3');
});

test('obiekt 15 minut od granicy otwiera czerwony', () => {
  const st = Engine.stateFrom([alertMonitorowana, obwodyUA, dron(20, 54.7, 15, '20'),
                               dron(21, 84, 28, '05'), dron(22, 91, 30, '06')], REF).voivodeships.lubelskie;
  assert.equal(st.alert_level, 'high');
  assert.equal(st.red_key.powod, 'eta');
});

test('bezpiecznik 50 km działa, gdy nie znamy czasu dolotu', () => {
  const blisko = sygnal({ id: 30, ts: '2026-09-23T05:20:00Z', source: 'neptun', event_type: 'neptun_threat',
    points: 0.9, title: 'Dron / BpSP kursem na granicę PL, około 40 km [pozycja rejonowa]',
    details: { type: 'uav', dist_km: 40, track_id: 'trk_30' } });
  const st = Engine.stateFrom([alertMonitorowana, obwodyUA, blisko, dron(31, 84, 28, '05'),
                               dron(32, 91, 30, '06')], REF).voivodeships.lubelskie;
  assert.equal(st.red_key.powod, 'blisko');
});

test('dron rozpoznawczy tuż przy granicy NIE jest kluczem', () => {
  const recon = sygnal({ id: 40, ts: '2026-09-23T05:20:00Z', source: 'neptun', event_type: 'neptun_threat',
    points: 0.2, title: 'Dron rozpoznawczy kursem na granicę PL, około 20 km',
    details: { type: 'recon', dist_km: 20, eta_border_min: 6, track_id: 'trk_40' } });
  const st = Engine.stateFrom([alertMonitorowana, obwodyUA, recon, dron(41, 84, 28, '05'),
                               dron(42, 91, 30, '06')], REF).voivodeships.lubelskie;
  assert.equal(st.red_key, null);
  assert.equal(st.alert_level, 'elevated');
});

test('fala: trzy różne obiekty w 15 min dokładają pół punktu', () => {
  const bez = Engine.stateFrom([dron(50, 84, 28, '20'), dron(51, 91, 30, '21')], REF).voivodeships.lubelskie;
  const zfala = Engine.stateFrom([dron(52, 84, 28, '20'), dron(53, 91, 30, '21'),
                                  dron(54, 104, 34, '22')], REF).voivodeships.lubelskie;
  assert.ok(!bez.signals.some(s => s.event_type === 'neptun_wave'), 'dwa obiekty to jeszcze nie fala');
  const fala = zfala.signals.find(s => s.event_type === 'neptun_wave');
  assert.ok(fala, 'trzy obiekty powinny dać sygnał fali');
  assert.equal(fala.points, 0.5);
});

test('ten sam obiekt zgłoszony trzy razy NIE jest falą', () => {
  const jeden = ['20', '21', '22'].map((m, i) => {
    const s = dron(60 + i, 84, 28, m);
    s.details.track_id = 'trk_ten_sam';
    s.details.physical_key = 'fiz_ten_sam';
    return s;
  });
  const st = Engine.stateFrom(jeden, REF).voivodeships.lubelskie;
  assert.ok(!st.signals.some(s => s.event_type === 'neptun_wave'));
});

test('poziom alertu RCB rozpoznawany po treści, nie po liczbie „UWAGA!”', () => {
  const potrojneUwaga = sygnal({ id: 70, ts: '2026-09-23T05:13:00Z', source: 'rcb', event_type: 'rso_alert',
    points: 1.5, title: 'Alert RCB (RSO): „UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.”' });
  const st = Engine.stateFrom([potrojneUwaga, obwodyUA, dron(71, 84, 28, '05'), dron(72, 91, 30, '06'),
                               dron(73, 104, 34, '07')], REF).voivodeships.lubelskie;
  assert.equal(st.red_key, null, 'potrójne UWAGA! to wciąż poziom 1');
});

test('dwa alerty RCB w krótkim czasie nie sumują się — liczy się najnowszy', () => {
  const pierwszy = sygnal({ id: 80, ts: '2026-09-23T05:00:00Z', source: 'rcb', event_type: 'rso_alert',
    points: 1.5, title: 'Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.”' });
  const drugi = sygnal({ id: 81, ts: '2026-09-23T05:15:00Z', source: 'rcb', event_type: 'rso_alert',
    points: 3.0, title: 'Alert RCB (RSO): „UWAGA! Trwa zmasowany rosyjski atak powietrzny na Zachodnią Ukrainę. Reaguj na sygnały alarmowe.”' });
  const st = Engine.stateFrom([pierwszy, drugi], REF).voivodeships.lubelskie;
  assert.equal(st.score, 3, `oczekiwano 3,0 (sam nowszy alert), jest ${st.score}`);
  const stary = st.signals.find(s => s.id === 80);
  assert.equal(stary.counted_points, 0, 'starszy alert zostaje widoczny, ale bez punktów');
});

test('po obniżeniu stopnia punktacja schodzi płynnie do nowego poziomu', () => {
  // Decyzja usera 23.09.2026: łagodniejszy komunikat nie kasuje ostrzeżenia z sekundy na
  // sekundę, ale też nie może sztucznie zawyżać — nadwyżka gaśnie w 10 minut, a czerwony
  // gaśnie od razu, bo liczy się BIEŻĄCA ocena państwa.
  const wysoki = sygnal({ id: 90, ts: '2026-09-23T05:00:00Z', source: 'rcb', event_type: 'rso_alert',
    points: 4.5, title: 'Alert RCB (RSO): „UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce.”' });
  const nizszy = sygnal({ id: 91, ts: '2026-09-23T05:20:00Z', source: 'rcb', event_type: 'rso_alert',
    points: 1.5, title: 'Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.”' });
  const wChwili = (min) => Engine.stateFrom([wysoki, nizszy], t('2026-09-23T05:20:00Z') + min * 60000).voivodeships.lubelskie;
  assert.equal(wChwili(0).score, 4.5, 'w chwili obniżenia jeszcze pełne 4,5');
  assert.equal(wChwili(0).red_key, null, 'ale czerwony gaśnie od razu');
  assert.ok(wChwili(5).score < 3 && wChwili(5).score > 1.5, `po 5 min ma być między 1,5 a 3, jest ${wChwili(5).score}`);
  assert.equal(wChwili(11).score, 1.5, 'po 10 minutach zostaje sam poziom nowego alertu');
});

test('pasek historii nie maluje czerwieni bez klucza (zgłoszenie 24.09.2026)', () => {
  // Ten sam poranek 23.09: ponad 4 pkt, ale bez klucza — mapa pokazywała ŻÓŁTY,
  // a pasek historii malował czerwony i sugerował alarm, którego nie było.
  const sygnaly = [alertMonitorowana, obwodyUA, dron(10, 84, 28, '05'), dron(11, 91, 30, '06'),
                   dron(12, 118, 39, '13'), dron(13, 104, 34, '05')];
  const snaps = [{ t: REF, ts: new Date(REF).toISOString() }];
  const [punkt] = Engine.timelineFrom(snaps, sygnaly);
  assert.ok(punkt.score >= 4, `suma miała przekroczyć 4 pkt, jest ${punkt.score}`);
  assert.equal(punkt.level, 'elevated', 'pasek ma pokazać żółty, tak jak mapa');
});

test('pasek historii pokazuje czerwień, gdy klucz JEST', () => {
  const snaps = [{ t: REF, ts: new Date(REF).toISOString() }];
  const [punkt] = Engine.timelineFrom(snaps, [alertSchronienie]);
  assert.equal(punkt.level, 'high', 'alert „znajdź bezpieczne miejsce” to czerwony także na pasku');
});

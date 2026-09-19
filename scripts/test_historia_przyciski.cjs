// Przyciski paska historii i systemowe „wstecz” (1.7.57, 17.09.2026).
// Uruchomienie: node scripts/test_historia_przyciski.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const cut = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i >= 0, `brak fragmentu: ${a}`);
  return src.slice(i, src.indexOf(b, i));
};

// ── 1. krok po czasie migawek i skoki do alarmów ──
const T0 = Date.parse('2026-09-17T08:00:00Z');
const min = (m) => new Date(T0 + m * 60000).toISOString();
// migawki co minutę, z dziurą 20 min (aplikacja była zamknięta) między 10 a 30
const minutes = [...Array(11).keys()].concat([...Array(20).keys()].map(i => 30 + i));
const levels = minutes.map(m => (m >= 5 && m <= 7) || (m >= 35 && m <= 36) ? 'elevated'
  : m === 40 ? 'high' : 'none');
const ctx = { histTimes: minutes.map(min), timelinePoints: levels.map(level => ({ level })) };
vm.createContext(ctx);
vm.runInContext(cut('function histStepIdx', 'function syncTbControls'), ctx);
const at = (m) => minutes.indexOf(m);

assert.equal(ctx.histStepIdx(at(3), 1), at(4), '+1 min: następna migawka');
assert.equal(ctx.histStepIdx(at(3), -1), at(2), '−1 min: poprzednia migawka');
assert.equal(ctx.histStepIdx(at(10), 1), at(30), '+1 przez dziurę: pierwsza migawka po przerwie');
assert.equal(ctx.histStepIdx(at(30), -1), at(10), '−1 przez dziurę: ostatnia przed przerwą');
assert.equal(ctx.histStepIdx(at(2), 10), at(30), '+10 z 08:02 → pierwsza migawka ≥ 08:12, czyli po przerwie');
assert.equal(ctx.histStepIdx(at(45), -10), at(35), '−10 w ciągłym odcinku');
assert.equal(ctx.histStepIdx(at(49), 10), at(49), '+10 na końcu zostaje na końcu');
assert.equal(ctx.histStepIdx(0, -10), 0, '−10 na początku zostaje na początku');

assert.deepEqual([...ctx.alarmStarts()], [at(5), at(35), at(40)], 'początki alarmów: 08:05, 08:35 i osobny 08:40 (przerwa 08:37–39)');
assert.equal(ctx.prevAlarmIdx(at(46)), at(40), 'poprzedni alarm z 08:46 → 08:40');
assert.equal(ctx.prevAlarmIdx(at(39)), at(35), 'poprzedni alarm z 08:39 → 08:35');
assert.equal(ctx.prevAlarmIdx(at(6)), at(5), 'w środku alarmu „poprzedni” wraca na jego początek');
assert.equal(ctx.prevAlarmIdx(at(5)), -1, 'przed pierwszym alarmem nie ma poprzedniego');
assert.equal(ctx.nextAlarmIdx(at(0)), at(5), 'następny alarm z 08:00 → 08:05');
assert.equal(ctx.nextAlarmIdx(at(35)), at(40), 'następny po 08:35 → 08:40');
assert.equal(ctx.nextAlarmIdx(at(40)), -1, 'po ostatnim alarmie nie ma następnego');
console.log('OK: kroki po czasie migawek (także przez dziurę) i skoki do alarmów');

// ── 2. układ: 9 przycisków, ZMIEŃ NA ŻYWO w nagłówku, bez pełnej szerokości ──
const acts = [...html.matchAll(/class="tb-btn[^"]*" data-act="([a-z0-9-]+)"/g)].map(m => m[1]);
assert.deepEqual(acts, ['start', 'prev-alarm', 'back10', 'back1', 'play', 'fwd1', 'fwd10', 'next-alarm', 'end'],
  'dziewięć przycisków w ustalonej kolejności');
const head = html.slice(html.indexOf('<div class="tb-head">'), html.indexOf('<div class="tb-row">'));
assert.match(head, /id="tb-live"[^>]*>ZMIEŃ<br>NA ŻYWO</, '„ZMIEŃ NA ŻYWO” w nagłówku, w dwóch liniach');
assert.match(head, /PODGLĄD<br>HISTORII/, '„PODGLĄD HISTORII” w dwóch liniach');
assert.match(head, /id="tb-speed"/, 'wybór prędkości w nagłówku');
assert.ok(!/chip primary">▶ Wróć do podglądu/.test(html), 'stary przycisk na całą szerokość usunięty');
console.log('OK: układ paska historii');

// ── 3. systemowe „wstecz”: od wierzchu do mapy ──
function backCtx(state) {
  const cls = (hidden) => ({ contains: (c) => c === 'hidden' ? hidden : c === 'collapsed' ? hidden : false });
  const calls = [];
  const els = {
    'alarm-overlay': { classList: cls(!state.alarm) },
    'ac-card': { classList: cls(!state.card) },
    legend: { classList: cls(!state.legend) },
    panel: { classList: cls(!state.panel) },
    'btn-legend': { click: () => { calls.push('legend'); state.legend = false; } },
  };
  const dialogs = (state.dialogs || []).map(name => ({
    name, dispatchEvent: () => !state.preventCancel, close() { calls.push('close:' + name); },
  }));
  const c = {
    calls, Event: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    window: {}, histMode: !!state.hist,
    exitHistory: () => calls.push('exitHistory'), hideCard: () => calls.push('hideCard'),
    setPanel: (open) => calls.push('setPanel:' + open),
    document: {
      getElementById: (id) => els[id],
      querySelectorAll: (sel) => sel === 'dialog[open]' ? dialogs : [],
      querySelector: (sel) => sel === '.brand-open' && state.brand
        ? { classList: { remove: () => calls.push('brand') } } : null,
    },
  };
  vm.createContext(c);
  vm.runInContext(cut('window.straznikBack = function', '\n};') + '\n};', c);
  return c;
}
const back = (state) => { const c = backCtx(state); const r = c.window.straznikBack(); return [r, c.calls]; };
assert.deepEqual(back({}), [false, []], 'sama mapa: false → aplikacja idzie w tło');
assert.deepEqual(back({ dialogs: ['settings', 'places-dialog'], hist: true }), [true, ['close:places-dialog']],
  'najpierw zamyka okno leżące na wierzchu, nie tryb historii');
assert.deepEqual(back({ dialogs: ['onboard-bg'], preventCancel: true }), [true, []],
  'okno blokujące zamknięcie (cancel.preventDefault) zostaje, aplikacja nie idzie w tło');
assert.deepEqual(back({ card: true, hist: true }), [true, ['hideCard']], 'karta obiektu przed historią');
assert.deepEqual(back({ legend: true }), [true, ['legend']], 'legenda');
assert.deepEqual(back({ hist: true, panel: true }), [true, ['exitHistory']], 'tryb historii');
assert.deepEqual(back({ panel: true }), [true, ['setPanel:false']], 'panel sygnałów');
assert.deepEqual(back({ alarm: true, dialogs: ['settings'] }), [true, []],
  'czerwony alarm: „wstecz” nic nie zamyka i nie chowa aplikacji');
const java = fs.readFileSync(path.join(__dirname,
  '../android-app/android/app/src/main/java/pl/straznik/app/MainActivity.java'), 'utf8');
assert.match(java, /OnBackPressedCallback/, 'MainActivity przechwytuje „wstecz”');
assert.match(java, /window\.straznikBack/, 'i pyta stronę');
assert.match(java, /moveTaskToBack\(true\)/, 'bez niczego do zamknięcia aplikacja idzie w tło jak dotąd');
console.log('OK: systemowe „wstecz” zamyka od wierzchu, na mapie chowa aplikację');

// ── 4. tryb sygnału: WebSocket „zmieniło się" + stan z pamięci Cloudflare ──
assert.match(src, /\/ws\?v=2/, 'klient łączy się w trybie sygnału (/ws?v=2)');
const tickCtx = {
  console, applyState: (s) => tickCtx.applied.push(s), applied: [], fetched: [],
  apiBase: () => 'https://straznik.eu',
  fetch: async (url) => { tickCtx.fetched.push(url); return { ok: true, json: async () => ({ n: tickCtx.fetched.length }) }; },
};
vm.createContext(tickCtx);
vm.runInContext(cut('let lastTickEtag = null', '\nfunction openBackendWs'), tickCtx);
(async () => {
  await tickCtx.fetchStateTick('"a"');
  await tickCtx.fetchStateTick('"a"');            // ten sam ETag — bez drugiego pobrania
  await tickCtx.fetchStateTick('"b"');
  assert.deepEqual(tickCtx.fetched, ['https://straznik.eu/api/state', 'https://straznik.eu/api/state'],
    'pobranie stanu tylko przy nowym ETagu');
  assert.equal(tickCtx.applied.length, 2, 'każde pobranie trafia do mapy');
  console.log('OK: sygnał pobiera stan raz na zmianę, a nie przy każdej ramce');

// ── 5. wiek meldunku: podpis pod ikoną i wygaszanie ──
const wiek = { UI: { isEn: false } };
vm.createContext(wiek);
vm.runInContext(cut('function threatAgeMin', String.fromCharCode(10) + 'function predict'), wiek);
const T = Date.UTC(2026, 8, 17, 20, 0, 0);
assert.equal(wiek.threatAgeMin({ updatedAt: new Date(T - 7 * 60000).toISOString() }, T), 7, 'wiek liczony z updatedAt');
assert.equal(wiek.threatAgeMin({ confirmedAt: new Date(T - 90 * 60000).toISOString(), updatedAt: new Date(T).toISOString() }, T), 90,
  'confirmedAt ma pierwszeństwo nad updatedAt');
assert.equal(wiek.threatAgeMin({}, T), 0, 'brak czasu = 0, bez wygaszania');
assert.equal(wiek.ageLabel(7), '7 min');
assert.equal(wiek.ageLabel(65), '1 h 5 min');
assert.equal(wiek.ageLabel(120), '2 h');
assert.equal(wiek.ageAgoText(0), 'przed chwilą');
assert.equal(wiek.ageAgoText(7), '7 min temu');
wiek.UI.isEn = true;
assert.equal(wiek.ageAgoText(7), '7 min ago');
const layers = html.includes('threats-age') || src.includes('threats-age');
assert.ok(layers, 'warstwa z podpisem wieku istnieje');
assert.match(src, /OWN_LABEL_LAYERS[\s\S]{0,120}threats-age/, 'podpis wieku wyłączony z tłumaczenia etykiet mapy');
assert.match(src, /icon-opacity[\s\S]{0,200}age_min/, 'ikona blednie z wiekiem meldunku');
console.log('OK: wiek meldunku - podpis, wygaszanie i tekst w karcie');

// ── 6. historia zna wiek meldunku (18.09.2026) ──
// Migawki nie mają confirmedAt, więc znaczniki w historii szły bez `age_min`.
// MapLibre dostawał null w interpolacji, wywracał wyrażenie i rysował domyślne
// pełne krycie: zamiast poświaty pod ikoną robił się pełny żółty krążek.
const histWiek = {};
vm.createContext(histWiek);
vm.runInContext(cut('function snapAgeMin', String.fromCharCode(10) + 'function showHistoryAt'), histWiek);
assert.equal(histWiek.snapAgeMin({ age_min: 12 }), 12, 'wiek z migawki brany wprost');
assert.equal(histWiek.snapAgeMin({}), 0, 'stara migawka bez wieku = obiekt jak świeży');
assert.equal(histWiek.snapAgeMin({ age_min: -3 }), 0, 'ujemny wiek nie wygasza ikony');
for (const wyr of [/circle-opacity[\s\S]{0,260}coalesce.{0,30}age_min/,
                   /icon-opacity[\s\S]{0,200}coalesce.{0,30}age_min/,
                   /filter: \[">=", \["coalesce", \["get", "age_min"\], 0\], 5\]/])
  assert.match(src, wyr, 'brak wieku nie wywraca wyrażenia warstwy');
assert.match(src, /historyThreats[\s\S]{0,4000}age_min: snapAgeMin\(t\)/,
  'znaczniki w historii niosą wiek meldunku');
assert.match(src, /age_min: Math\.max\(0, Math\.round\(\(when\.getTime\(\) - Date\.parse\(s\.ts\)\)/,
  'duch z sygnału liczy wiek względem oglądanej chwili');
console.log('OK: historia rysuje wiek meldunku zamiast pełnych krążków');

// ── 7. dziura w buforze, gdy aplikacja była w tle (19.09.2026) ──
// System zamraża WebView, więc nic się nie nagrywa; po powrocie aplikacja dopisuje
// migawkę z bieżącą godziną i bufor WYGLĄDA na świeży, choć w środku brakuje godziny.
// Zgłoszone z telefonu: przeskok ok. 19:25 i brak danych do 20:25.
const buf = {
  console, positionQuality: () => null, positionInfo: () => null,
  watchSyncState: '', fetch: () => { throw new Error('bez sieci w teście'); },
  apiBase: () => '', Engine: {},
};
let ZEGAR = Date.UTC(2026, 8, 19, 17, 0, 0);
function FakeDate(x) { return new Date(x); }
FakeDate.now = () => ZEGAR;
FakeDate.parse = Date.parse;
buf.Date = FakeDate;
vm.createContext(buf);
vm.runInContext(cut('let srvSnaps = []', String.fromCharCode(10) + '/* Historia lokalnie'), buf);

const stan = { fusion: { voivodeships: {} }, neptun: { threats: [] }, adsb: { aircraft: [] } };
vm.runInContext('srvSeeded = true', buf);      // po seedzie z serwera
buf.srvRecord(stan);                        // pierwsza migawka
ZEGAR += 60000;
buf.srvRecord(stan);                        // druga, minutę później
const ile = () => vm.runInContext('srvSnaps.length', buf);
assert.equal(ile(), 2, 'nagrywa migawkę co minutę');
assert.equal(buf.needSeed(), false, 'ciągły zapis nie wymaga dociągania');

ZEGAR += 60 * 60000;                        // godzina w tle — nic się nie nagrało
buf.srvRecord(stan);                        // powrót na wierzch: migawka „teraz”
assert.equal(ile(), 3, 'po powrocie dopisuje bieżącą migawkę');
assert.equal(buf.needSeed(), true,
  'dziura po tle wymusza dociągnięcie paczki, choć najnowsza migawka jest świeża');

// Po udanym seedzie flaga znika — inaczej każde wejście w historię ciągnęłoby 270 kB.
vm.runInContext('srvSnaps.push({ts:"2026-09-19T18:01:00+00:00", t: Date.now()})', buf);
vm.runInContext('srvSeeded = true; _srvHole = false;', buf);
assert.equal(buf.needSeed(), false, 'po dociągnięciu paczki nie powtarzamy pobrania');

// Sama pauza krótsza niż dwie migawki (np. chwilowy brak sieci) nie jest dziurą.
ZEGAR += 2 * 60000;
buf.srvRecord(stan);
assert.equal(buf.needSeed(), false, 'dwuminutowa przerwa mieści się w tolerancji');
console.log('OK: powrót z tła uzupełnia historię zamiast zostawiać dziurę');
})();

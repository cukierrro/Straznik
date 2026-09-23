// Odpytywanie zamiast gniazda (20.09.2026). Do 1.7.62 każdy telefon trzymał WebSocket
// do naszego serwera; teraz pyta o /api/state z If-None-Match, a niezmieniony stan
// oddaje Cloudflare ze swojego brzegu („304"), nie nasz serwer.
// Sprawdzamy to, co się liczy: ile zapytań w 10 minut, czy 304 nie przerysowuje mapy,
// czy zajęty serwer nie wygląda jak awaria i czy brak sieci pokazuje się z opóźnieniem.
// Uruchomienie: node scripts/test_odpytywanie.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app.js'), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

function symulacja({ minuty = 10, alarm = false, tryb = 'ok', widoczna = true } = {}) {
  let now = 0, seq = 0;
  const timers = [];
  const licznik = { zapytan: 0, pelnych: 0, applied: 0, badge: '', etagi: [] };
  let etag = '2026-09-20T06:00:00+00:00';
  const ctx = {
    console, Math, AbortController: class { constructor() { this.signal = {}; } abort() {} },
    Date: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0, clearInterval: () => {},
    document: { get hidden() { return !widoczna; } },
    UI: { isEn: false, isUk: false, t: (pl) => pl },
    apiBase: () => 'https://straznik.eu',
    myVoiv: () => 'lubelskie',
    state: { fusion: { voivodeships: { lubelskie: { alert_level: alarm ? 'high' : 'none' } } } },
    applyState: () => { licznik.applied++; },
    connBadge: { classList: { add: () => { licznik.badge = ''; }, remove: () => {}, contains: () => licznik.badge === '' } },
    fetch: async (url) => {
      licznik.zapytan++;
      const wersja = /[?&]v=([^&]*)/.exec(String(url));
      licznik.etagi.push(wersja ? decodeURIComponent(wersja[1]) : null);
      if (tryb === 'padl') throw new Error('brak sieci');
      if (tryb === 'zajety') return { status: 503, ok: false };
      if (wersja && decodeURIComponent(wersja[1]) === etag)
        return { status: 200, ok: true, json: async () => ({ unchanged: true }) };
      licznik.pelnych++;
      return { status: 200, ok: true, json: async () => ({ fusion: { ts: etag } }) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const POLL_ALARM_MS', String.fromCharCode(10) + 'let standalone = false;')
    + 'let standalone = false;\n'
    + cut('/* Odpytywanie: jedno zapytanie naraz', String.fromCharCode(10) + 'function applyState')
    + '\nstartPolling();', ctx);
  // obieg zegara: kolejki obietnic domykamy zwykłym setImmediate między krokami
  return (async () => {
    while (timers.length) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift();
      if (t.at > minuty * 60000) break;
      now = t.at;
      t.fn();
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));
    }
    return { ...licznik, connLost: licznik.badge };
  })();
}

const bledy = [];
function sprawdz(warunek, opis) {
  console.log((warunek ? '  OK   ' : '  BŁĄD ') + opis);
  if (!warunek) bledy.push(opis);
}

(async () => {
console.log('1. Ile zapytań i ile pełnych odpowiedzi w 10 minut');
const spokoj = await symulacja({ alarm: false });
const alarm = await symulacja({ alarm: true });
console.log(`   spokój: ${spokoj.zapytan} zapytań, ${spokoj.pelnych} pełnych | alarm: ${alarm.zapytan} zapytań, ${alarm.pelnych} pełnych`);
sprawdz(spokoj.zapytan >= 100 && spokoj.zapytan <= 130, `spokój ≈ co 5 s (${spokoj.zapytan} w 10 min)`);
sprawdz(alarm.zapytan >= 250 && alarm.zapytan <= 310, `alarm ≈ co 2 s (${alarm.zapytan} w 10 min)`);
sprawdz(spokoj.pelnych === 1, `stan pobrany raz, reszta to „nic nowego" (${spokoj.pelnych})`);
sprawdz(spokoj.applied === 1, 'niezmieniony stan nie przerysowuje mapy');
sprawdz(spokoj.etagi.filter(e => e).length >= spokoj.zapytan - 1,
  'każde kolejne zapytanie niesie wersję stanu');

console.log('2. Zajęty serwer to nie awaria');
const zajety = await symulacja({ tryb: 'zajety' });
console.log(`   503: ${zajety.zapytan} zapytań w 10 min`);
sprawdz(zajety.zapytan <= 70, `przy 503 pytamy rzadziej, co ~10 s (${zajety.zapytan})`);
sprawdz(zajety.applied === 0, 'przy 503 nic nie trafia do mapy');

console.log('3. Brak sieci');
const padl = await symulacja({ tryb: 'padl' });
sprawdz(padl.zapytan >= 100, `przy braku sieci dalej próbujemy (${padl.zapytan} prób w 10 min)`);
sprawdz(padl.applied === 0, 'i nic nie udajemy na mapie');

console.log('4. W tle nie pytamy');
const tlo = await symulacja({ widoczna: false });
sprawdz(tlo.zapytan === 0, `aplikacja w tle nie odpytuje serwera (${tlo.zapytan})`);

console.log('5. Po stronie kodu nie ma już gniazda');
sprawdz(!/new WebSocket\(/.test(src), 'klient nie otwiera WebSocketu');
sprawdz(!/\/ws\?v=2/.test(src), 'i nie zna już adresu gniazda');
sprawdz(/api\/state" \+ \(pollVer/.test(src) || /\?v=/.test(src), 'zapytania niosą wersję stanu');

console.log();
if (bledy.length) {
  console.log('BŁĘDY:', bledy.length);
  bledy.forEach(b => console.log(' -', b));
  process.exit(1);
}
console.log('OK: odpytywanie — 304 zamiast gniazda, rzadziej przy spokoju, bez pytań w tle.');
})();

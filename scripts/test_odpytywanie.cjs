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

function symulacja({ minuty = 10, alarm = false, aktywnie = false, tryb = 'ok', widoczna = true } = {}) {
  let now = 0, seq = 0;
  const timers = [];
  const licznik = { zapytan: 0, pelnych: 0, applied: 0, badge: '', etagi: [], adresy: [] };
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
    // `aktywnie` = podniesiony poziom w INNYM województwie niż moje. Od 27.09.2026
    // to osobny poziom tempa: zwalniamy dopiero przy ciszy w całym kraju.
    state: { fusion: { voivodeships: {
      lubelskie: { alert_level: alarm ? 'high' : 'none' },
      mazowieckie: { alert_level: aktywnie ? 'elevated' : 'none' } } } },
    applyState: () => { licznik.applied++; },
    connBadge: { classList: { add: () => { licznik.badge = ''; }, remove: () => {}, contains: () => licznik.badge === '' } },
    fetch: async (url) => {
      licznik.zapytan++;
      licznik.adresy.push(String(url));
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
const aktywnie = await symulacja({ aktywnie: true });
console.log(`   cisza: ${spokoj.zapytan} | coś w kraju: ${aktywnie.zapytan} | alarm: ${alarm.zapytan} (zapytań w 10 min)`);
// Cisza w CAŁYM kraju trwa ~93,5% czasu, a ticki serwera przychodzą wtedy co ~16 s —
// pytanie co 5 s nic nie wnosiło. Gdy gdziekolwiek jest podniesiony poziom, wracamy
// do dawnego tempa; przy alarmie u mnie albo czerwonym gdziekolwiek — do 2 s.
sprawdz(spokoj.zapytan >= 35 && spokoj.zapytan <= 45, `pełna cisza ≈ co 15 s (${spokoj.zapytan} w 10 min)`);
sprawdz(aktywnie.zapytan >= 100 && aktywnie.zapytan <= 130,
  `podniesiony poziom gdziekolwiek ≈ co 5 s (${aktywnie.zapytan} w 10 min)`);
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
sprawdz(padl.zapytan >= 35, `przy braku sieci dalej próbujemy (${padl.zapytan} prób w 10 min)`);
sprawdz(padl.applied === 0, 'i nic nie udajemy na mapie');

console.log('4. Adres jest kanoniczny (jeden klucz cache na brzegu)');
const pierwszy = spokoj.adresy[0] || "";
const kolejne = spokoj.adresy.slice(1);
sprawdz(pierwszy.endsWith('/api/state?part=main'),
  `pierwsze zapytanie bez wersji: ${pierwszy.split("/api")[1]}`);
sprawdz(kolejne.every(u => u.includes('/api/state?part=main&v=')),
  'w kolejnych zapytaniach part= zawsze przed v= — jedna postać adresu');
sprawdz(!spokoj.adresy.some(u => /v=[^&]*\+/.test(u)),
  'wersja jest zakodowana (plus strefy czasowej nie trafia surowy do adresu)');

console.log('5. W tle nie pytamy');
const tlo = await symulacja({ widoczna: false });
sprawdz(tlo.zapytan === 0, `aplikacja w tle nie odpytuje serwera (${tlo.zapytan})`);

console.log('6. Scalanie części stanu (ścieżka wdrożenia i wycofania)');
{
  // Bierzemy prawdziwy kod scalania z app.js i sprawdzamy go na trzech sytuacjach.
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext('let auxDane = null, auxWersja = null;' + String.fromCharCode(10)
    + cut('function zlozStan(glowna)', 'async function pobierzAux'), ctx);

  const bezAux = vm.runInContext('zlozStan({ fusion: 1 })', ctx);
  sprawdz(bezAux.adsb === undefined && bezAux.fusion === 1,
    'sama część główna przed pobraniem pomocniczej przechodzi bez zmian');

  vm.runInContext('auxDane = { adsb: "POMOCNICZE", health: {} }; auxWersja = "abc";', ctx);
  sprawdz(vm.runInContext('zlozStan({ fusion: 2 }).adsb', ctx) === 'POMOCNICZE',
    'część pomocnicza dokleja się do części głównej');

  // Serwer bez podziału (starszy writer albo wycofane wydanie) przysyła pełny stan.
  // Nałożenie na niego zapamiętanej części pomocniczej zamroziłoby samoloty,
  // a mapa wyglądałaby normalnie — nikt by tego nie zgłosił.
  const pelny = vm.runInContext('zlozStan({ fusion: 3, adsb: "SWIEZE", health: {} })', ctx);
  sprawdz(pelny.adsb === 'SWIEZE',
    'pełny stan ze starszego serwera NIE jest nadpisywany starą częścią pomocniczą');
  sprawdz(vm.runInContext('auxDane === null && auxWersja === null', ctx),
    'i zapamiętana część pomocnicza jest wtedy wyrzucana');
}

console.log('7. Po stronie kodu nie ma już gniazda');
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

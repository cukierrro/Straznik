// Tryb BEZ SERWERA musi trzymać niemożliwe skoki pozycji tak samo jak backend.
//
// 25.09.2026: algierski C-130H 7T-WHL (hex 0a401c, pozycja z MLAT-u, nic=0) dostał
// dwie kolejne pozycje odchylone o 82 i 71 km od faktycznej trasy — skoki 87 i 67 km
// w 60 s, czyli 5232 i 4016 km/h. Ikona przeskakiwała w woj. podlaskie i wracała,
// a oba odcinki trafiały do „Przebytej trasy” jako prawdziwy przelot.
//
// Backendową stronę tej poprawki sprawdza scripts/test_skok_pozycji.py; tutaj idzie
// PRODUKCYJNY `adsbHoldJump` z frontend/engine.js, uruchomiony na tych samych,
// prawdziwych współrzędnych. Progi muszą się zgadzać z backendem co do liczby —
// aplikacja po przełączeniu w tryb awaryjny nie może rysować czego innego.
//
// Uruchomienie: node scripts/test_skok_pozycji.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = fs.readFileSync(path.join(ROOT, 'frontend/engine.js'), 'utf8');
const PY = fs.readFileSync(path.join(ROOT, 'backend/app/collectors/adsb.py'), 'utf8');

/* Silnik uruchamiamy tak samo jak scripts/test_voiv_match.cjs — cały produkcyjny
   plik w sandboksie, bez przeglądarki i bez sieci. */
function silnik() {
  const kontekst = vm.createContext({
    console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext(ENGINE + '\nthis.TestEngine = Engine;', kontekst);
  return kontekst.TestEngine;
}

/* Progi czytamy z obu implementacji, zamiast przepisywać je do testu. */
function progiJs() {
  const m = /ADSB_JUMP_MAX_KMH = (\d+), ADSB_JUMP_HOLD_MAX_S = (\d+)/.exec(ENGINE);
  assert.ok(m, 'nie znalazłem progów w engine.js');
  return { kmh: +m[1], hold: +m[2] };
}
function progiPy() {
  const m = /JUMP_MAX_KMH, JUMP_HOLD_MAX_S = (\d+), (\d+)/.exec(PY);
  assert.ok(m, 'nie znalazłem progów w backend/app/collectors/adsb.py');
  return { kmh: +m[1], hold: +m[2] };
}

// Migawki z 25.09.2026 (czas lokalny). 17:40 i 17:41 to pozycje fałszywe.
const PRZELOT = {
  '17:38': [52.5520, 24.8477],
  '17:39': [52.5032, 24.7361],
  '17:40': [52.7290, 23.4991],
  '17:41': [52.6558, 23.5543],
  '17:42': [52.3593, 24.4149],
};
const rekord = ([lat, lon]) => ({
  hex: '0a401c', flight: 'KJD202  ', r: '7T-WHL', t: 'C130',
  mlat: ['lat', 'lon', 'nic', 'rc'], tisb: [], lat, lon, alt_baro: 22000, gs: 294, track: 233,
});

/* Każdy przebieg dostaje świeży silnik — kotwice żyją w module. */
function przepusc(punkty, { krokMs = 60000, start = 1_700_000_000_000 } = {}) {
  const hold = silnik().adsbHoldJump;
  return punkty.map((pkt, i) => {
    const out = hold(rekord(pkt), start + i * krokMs);
    return { lat: +out.lat.toFixed(4), lon: +out.lon.toFixed(4), trzymana: !!out._straznik_position_held };
  });
}

test('spokojny przelot przechodzi nietknięty', () => {
  const [a, b] = przepusc([PRZELOT['17:38'], PRZELOT['17:39']]);
  assert.equal(a.trzymana, false);
  assert.equal(b.trzymana, false, '9 km na minutę to zwykły lot, nie skok');
  assert.deepEqual([b.lat, b.lon], PRZELOT['17:39']);
});

test('oba fałszywe meldunki z incydentu są trzymane, powrót przyjęty', () => {
  const etykiety = Object.keys(PRZELOT);
  const wynik = przepusc(Object.values(PRZELOT));
  const stan = Object.fromEntries(etykiety.map((e, i) => [e, wynik[i]]));
  for (const t of ['17:40', '17:41']) {
    assert.equal(stan[t].trzymana, true, `${t}: niemożliwy skok miał zostać odrzucony`);
    assert.deepEqual([stan[t].lat, stan[t].lon], PRZELOT['17:39'],
      `${t}: trzymamy ostatnią przyjętą pozycję`);
  }
  assert.equal(stan['17:42'].trzymana, false, 'powrót na trasę jest wiarygodny');
  assert.deepEqual([stan['17:42'].lat, stan['17:42'].lon], PRZELOT['17:42']);
});

test('próg jest o prędkości, nie o kilometrach', () => {
  // Ten sam dystans zgłoszony po czterech minutach to 1300 km/h — zwykły przelot.
  const [, drugi] = przepusc([PRZELOT['17:39'], PRZELOT['17:40']], { krokMs: 240000 });
  assert.equal(drugi.trzymana, false);
  assert.deepEqual([drugi.lat, drugi.lon], PRZELOT['17:40']);
});

test('bezpiecznik: po JUMP_HOLD_MAX_S maszyna rusza z miejsca', () => {
  const { kmh, hold } = progiJs();
  // Dystans dobrany tak, by przekraczał próg NAWET po czasie trzymania — inaczej
  // test sprawdzałby łagodnienie progu w czasie, a nie sam bezpiecznik.
  const DALEKO = [52.5032, 39.0];
  const km = 111.32 * Math.cos(52.5 * Math.PI / 180) * (39.0 - 24.7361);
  assert.ok(km > kmh * hold / 3600, `${km.toFixed(0)} km za blisko, by sprawdzić bezpiecznik`);
  for (const [odstepS, oczekiwane] of [[60, true], [hold - 1, true], [hold + 1, false]]) {
    const silniczek = silnik().adsbHoldJump;
    const t0 = 1_700_000_000_000;
    silniczek(rekord(PRZELOT['17:39']), t0);
    const out = silniczek(rekord(DALEKO), t0 + odstepS * 1000);
    assert.equal(!!out._straznik_position_held, oczekiwane,
      `skok ${km.toFixed(0)} km po ${odstepS} s — po ${hold} s podejrzana jest już kotwica, nie meldunek`);
  }
});

test('pierwsza pozycja, brak hexa i brak współrzędnych nie wywracają strażnika', () => {
  const hold = silnik().adsbHoldJump;
  const t0 = 1_700_000_000_000;
  assert.equal(!!hold(rekord(PRZELOT['17:40']), t0)._straznik_position_held, false,
    'pierwsza pozycja nie ma się do czego odnieść');
  assert.equal(hold({ lat: 52, lon: 23 }, t0)._straznik_position_held, undefined);
  assert.equal(hold({ hex: '0a401c', lat: null, lon: null }, t0)._straznik_position_held, undefined);
});

test('progi w obu trybach są identyczne', () => {
  assert.deepEqual(progiJs(), progiPy(),
    'tryb bez serwera i backend muszą trzymać tak samo — inaczej ta sama maszyna '
    + 'rysuje się inaczej po przełączeniu w tryb awaryjny');
});

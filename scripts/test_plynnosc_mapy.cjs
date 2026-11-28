// Płynność mapy przy wielu obiektach (zgłoszenie 15.10.2026: w przeglądarce na
// komputerze przesuwanie mapy przycinało, gdy nad Ukrainą było kilkadziesiąt dronów).
// Pętle animacji nie mogą przerysowywać mapy w trakcie jej przesuwania, a warstwy
// obiektów przebudowujemy tylko wtedy, gdy coś się zmieniło.
//
// Uruchomienie: node scripts/test_plynnosc_mapy.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
const wytnij = (od) => APP.slice(APP.indexOf(od)).match(/^[\s\S]*?\r?\n\}/)[0];
const PULS = wytnij('function pulseLoop(');
const ANIM = wytnij('function animate(ts)');

test('puls: stoi w trakcie przesuwania mapy i nie składa wyrażenia 20×/s', () => {
  assert.match(PULS, /if \(map\.isMoving\(\)\) return;/);
  // część animowana (po sprawdzeniu ruchu mapy) — bez nowego wyrażenia co klatkę
  const zywy = PULS.slice(PULS.indexOf('if (map.isMoving()) return;'));
  assert.doesNotMatch(zywy, /"interpolate"/, 'promień jako liczba, nie nowe wyrażenie co klatkę');
  // lekki tryb (28.11.2026): stały pierścień — wyrażenie ustawiane RAZ, pod strażnikiem
  const wszystkie = PULS.match(/"interpolate"/g) || [];
  const strzezone = PULS.match(/if \(!lekkiPierscien[^\n]*\n[^\n]*"interpolate"/g) || [];
  assert.equal(wszystkie.length, strzezone.length, 'interpolate tylko w jednorazowym ustawieniu lekkiego trybu');
  assert.match(PULS, /pulseOff/, 'wygaszenie raz, nie co 50 ms');
});

test('puls: promień taki sam jak dawne interpolate po zoomie 4→8', () => {
  const r = (k, zoom) => { const z = Math.min(1, Math.max(0, (zoom - 4) / 4)); return (11 + 12 * k) + ((20 + 20 * k) - (11 + 12 * k)) * z; };
  assert.equal(r(0, 4), 11); assert.equal(r(0, 8), 20); assert.equal(r(1, 8), 40);
  assert.equal(r(0.5, 6), (17 + 30) / 2); assert.equal(r(0, 2), 11); assert.equal(r(0, 12), 20);
  // ta sama arytmetyka jest w kodzie
  assert.match(PULS, /\(11 \+ 12 \* k\) \+ \(\(20 \+ 20 \* k\) - \(11 \+ 12 \* k\)\) \* z/);
});

test('animacja: nic nie przebudowuje w trakcie przesuwania mapy', () => {
  assert.match(ANIM, /if \(map\.isMoving\(\)\) return;/);
  // od 28.11.2026 warstwy przez ustawDane (pomija tę samą treść) — dalej po sprawdzeniu ruchu
  const zapis = ANIM.search(/setData\(|ustawDane\(/);
  assert.ok(zapis > 0 && ANIM.indexOf('map.isMoving()') < zapis, 'sprawdzenie przed setData');
});

// Symulacja: ile razy animate wywoła setData w różnych sytuacjach
function swiat() {
  const zapisy = [];
  const zrodlo = { setData: () => zapisy.push(1) };
  const ctx = { requestAnimationFrame: () => {}, histMode: false, mapReady: true, moving: false,
    // próba przebudowy warstwy (logika animate); pomijanie tej samej treści — osobny test niżej
    ustawDane: (id, fc) => zapisy.push(1),
    Date: { now: () => ctx.teraz }, teraz: 1_000_000, Math, String, Set, Map, Number,
    glides: new Map(), GLIDE_MS: 45000,
    trailMode: () => 'off', state: { neptun: { threats: [] } } };
  ctx.map = { isMoving: () => ctx.moving, getSource: () => zrodlo };
  vm.createContext(ctx);
  vm.runInContext('let lastAnim = 0; let _animState = null, _animBucket = -1, _animMode = "", _animSrc = null;\n'
    + ANIM + '\nthis.animate = animate; this.reset = () => { lastAnim = 0; };', ctx);
  const krok = (ms = 300) => { ctx.teraz += ms; ctx.reset(); ctx.animate(ctx.teraz); };
  return { ctx, zapisy, krok };
}

test('animacja: bez zmian nie rysuje ponownie; nowy stan, 15 s, przejście ikony i powrót z historii rysują', () => {
  const { ctx, zapisy, krok } = swiat();
  krok(); const po1 = zapisy.length; assert.ok(po1 > 0, 'pierwszy stan rysuje');
  krok(); krok(); assert.equal(zapisy.length, po1, 'ten sam stan i ta sama ćwiartka minuty — bez setData');
  ctx.state = { neptun: { threats: [] } }; krok(); assert.ok(zapisy.length > po1, 'nowy stan rysuje');
  const po2 = zapisy.length; krok(15000); assert.ok(zapisy.length > po2, 'po 15 s rysuje (wiek meldunku, okrąg)');
  const po3 = zapisy.length; ctx.glides.set('x', { start: ctx.teraz, seen: ctx.teraz }); krok(); krok();
  assert.ok(zapisy.length >= po3 + 2, 'w trakcie przejścia ikony rysuje co krok');
  ctx.glides.clear();
  const po4 = zapisy.length; ctx.histMode = true; krok(); ctx.histMode = false; krok();
  assert.ok(zapisy.length > po4, 'po wyjściu z historii rysuje od nowa');
  const po5 = zapisy.length; ctx.state = { neptun: { threats: [] } }; ctx.moving = true; krok();
  assert.equal(zapisy.length, po5, 'w trakcie przesuwania nie rysuje');
  ctx.moving = false; krok(); assert.ok(zapisy.length > po5, 'po zatrzymaniu dorysowuje');
});

// 28.11.2026: setData tylko przy innej treści (nowy stan z serwera z tymi samymi obiektami
// przebudowywał 7 warstw i przerysowywał mapę bez przerwy — na słabym sprzęcie stale).
test('ustawDane: ta sama treść nie trafia do mapy, inna treść i nowe źródło tak', () => {
  const kod = APP.slice(APP.indexOf('const daneZrodel = new Map();'));
  const fn = kod.match(/^[\s\S]*?function ustawDane\(id, fc\) \{[\s\S]*?\r?\n\}/)[0];
  const wgrane = [];
  let zrodlo = { setData: d => wgrane.push(d) };
  const ctx = { Map, JSON, map: { getSource: () => zrodlo } };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.ustawDane = ustawDane;', ctx);
  const fc = n => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { n }, geometry: { type: 'Point', coordinates: [24, 51] } }] });
  ctx.ustawDane('threats', fc(1)); assert.equal(wgrane.length, 1, 'pierwsze wgranie');
  ctx.ustawDane('threats', fc(1)); assert.equal(wgrane.length, 1, 'ta sama treść — bez setData');
  ctx.ustawDane('threats', fc(2)); assert.equal(wgrane.length, 2, 'inna treść — setData');
  zrodlo = { setData: d => wgrane.push(d) };
  ctx.ustawDane('threats', fc(2)); assert.equal(wgrane.length, 3, 'nowe źródło (np. po przeładowaniu stylu) — wgranie od nowa');
});

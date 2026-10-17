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
  assert.doesNotMatch(PULS, /"interpolate"/, 'promień jako liczba, nie nowe wyrażenie co klatkę');
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
  assert.ok(ANIM.indexOf('map.isMoving()') < ANIM.indexOf('setData'), 'sprawdzenie przed setData');
});

// Symulacja: ile razy animate wywoła setData w różnych sytuacjach
function swiat() {
  const zapisy = [];
  const zrodlo = { setData: () => zapisy.push(1) };
  const ctx = { requestAnimationFrame: () => {}, histMode: false, mapReady: true, moving: false,
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

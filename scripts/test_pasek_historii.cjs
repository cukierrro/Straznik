// Pasek historii nie może opisywać każdej migawki osobno.
//
// Zgłoszenie #8 (30.09.2026): Firefox 156 / Windows 11 zawieszał się lub wywalał
// przy wejściu w zakładkę Historia. `paintTimeline` budowało gradient z DWOMA
// przystankami na każdy punkt osi. Przy 12 h migawek co minutę to 1440
// przystanków i ~22 kB CSS-a w jednej właściwości, przeliczanej przy każdym
// odmalowaniu suwaka. Kolorów jest cztery, więc sąsiednie punkty o tym samym
// kolorze muszą się sklejać w jeden pas.
//
// Czego pilnuje ten test:
//   * jednolita oś daje JEDEN pas, nie tysiąc,
//   * liczba przystanków zależy od liczby ZMIAN koloru, a nie od długości osi,
//   * granice pasów padają tam, gdzie naprawdę zmienia się poziom,
//   * pusta oś nie rysuje nic,
//   * kolory zostają te same co dotąd (czerwony, żółty, sygnał, cisza).
//
// Test URUCHAMIA produkcyjną funkcję wyciętą z app.js.
//
// Uruchomienie: node scripts/test_pasek_historii.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.resolve(__dirname, '..', 'frontend/app.js'), 'utf8');

function funkcja(nazwa) {
  const start = APP.indexOf(`function ${nazwa}(`);
  assert.notEqual(start, -1, `nie znalazłem ${nazwa} w app.js`);
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    if (APP[i] === '{') glebokosc++;
    else if (APP[i] === '}' && --glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error(`niedomknięta funkcja ${nazwa}`);
}

/** Zwraca gradient, który funkcja ustawiła na suwaku (albo null, gdy wyczyściła). */
function maluj(points) {
  let ustawione = null;
  const slider = {
    style: {
      setProperty: (k, v) => { if (k === "--tl") ustawione = v; },
      removeProperty: (k) => { if (k === "--tl") ustawione = null; },
    },
  };
  const ctx = {
    document: { getElementById: () => slider },
    timelinePoints: null,
  };
  vm.createContext(ctx);
  vm.runInContext(funkcja('paintTimeline'), ctx);
  ctx.paintTimeline(points);
  return ustawione;
}

// „90deg” też jest członem po przecinku — odejmujemy go, żeby liczyć same przystanki
const liczPrzystanki = (css) => css.split(",").length - 1;
const pkt = (level, score = 1) => ({ level, score });

test('jednolita oś to jeden pas, niezależnie od liczby migawek', () => {
  for (const n of [10, 720, 5000]) {
    const css = maluj(Array.from({ length: n }, () => pkt("none", 0)));
    assert.equal(liczPrzystanki(css), 2,
      `${n} migawek jednego koloru ma dać 2 przystanki, nie ${liczPrzystanki(css)}`);
  }
});

test('liczba przystanków zależy od ZMIAN koloru, nie od długości osi', () => {
  // ta sama liczba zmian, dwie bardzo różne długości osi
  const dlugosc = (n) => {
    const p = [];
    for (let i = 0; i < n; i++) p.push(pkt(i < n / 2 ? "none" : "high", 1));
    return liczPrzystanki(maluj(p));
  };
  assert.equal(dlugosc(100), 4);
  assert.equal(dlugosc(720), 4, 'dłuższa oś przy tej samej liczbie zmian = tyle samo przystanków');
});

test('przypadek ze zgłoszenia: 720 migawek nie daje 1440 przystanków', () => {
  // realistyczny rozkład z 30.09: głównie tło, pas żółtego, trochę ciszy
  const p = [];
  for (let i = 0; i < 720; i++) {
    if (i >= 300 && i < 394) p.push(pkt("elevated", 2.9));
    else if (i >= 600) p.push(pkt("none", 0));
    else p.push(pkt("none", 0.4));
  }
  const przystanki = liczPrzystanki(maluj(p));
  assert.equal(przystanki, 8, 'cztery pasy = osiem przystanków');
  assert.ok(przystanki < 50, `1440 przystanków wywalało Firefoksa; jest ${przystanki}`);
});

test('granice pasów padają tam, gdzie zmienia się poziom', () => {
  const p = [pkt("none", 0), pkt("none", 0), pkt("high", 5), pkt("high", 5)];
  const css = maluj(p);
  // pierwszy pas 0–50%, drugi 50–100%
  assert.match(css, /0\.00%/);
  assert.match(css, /50\.00%/);
  assert.match(css, /100\.00%/);
});

test('pusta oś nie rysuje nic', () => {
  assert.equal(maluj([]), null);
  assert.equal(maluj(null), null);
});

test('kolory poziomów zostają bez zmian', () => {
  assert.match(maluj([pkt("high", 5)]), /#ff4d5e/);
  assert.match(maluj([pkt("elevated", 2)]), /#ffb020/);
  assert.match(maluj([pkt("none", 0.5)]), /#4a5c86/);
  assert.match(maluj([pkt("none", 0)]), /#2a3550/);
});

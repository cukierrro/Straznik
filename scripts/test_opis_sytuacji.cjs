// Sytuacja jednym zdaniem dla czytnika ekranu (dostępność, obiecane w 1.7.81).
//
// Osoba niewidoma słyszała zmianę poziomu, ale nie miała jak sprawdzić, jak
// jest TERAZ — mapa jest dla czytnika pustym obrazkiem. Niewidoczny nagłówek
// #sytuacja przed mapą mówi to jednym zdaniem.
//
// Czego pilnuje ten test:
//   * liczy się poziom ALARMU (alert_level), nie kolor mapy z przeniesień —
//     inaczej czytnik mówiłby „podwyższona uwaga” tam, gdzie telefon milczy,
//   * obserwowane województwa idą wszystkie, w kolejności użytkownika,
//   * bez obserwowanych: najwyżej trzy województwa z sygnałami, najgroźniejsze
//     pierwsze; pusty kraj to osobne zdanie,
//   * najbliższy obiekt tylko przy podniesionym poziomie i dla najgroźniejszego,
//   * zawsze zastrzeżenie, że źródło jest nieoficjalne,
//   * polski przecinek dziesiętny, angielski bez „woj.”,
//   * nagłówek stoi w index.html PRZED mapą i jest niewidoczny (sr-only).
//
// Test URUCHAMIA funkcję wyciętą z app.js, nie porównuje tekstu kodu.
// Uruchomienie: node scripts/test_opis_sytuacji.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'frontend/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');

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
function linia(poczatek) {
  const start = APP.indexOf(poczatek);
  assert.notEqual(start, -1, `nie znalazłem „${poczatek}” w app.js`);
  return APP.slice(start, APP.indexOf('\n', start));
}

function piaskownica(lang) {
  const UI = {
    t: (pl, en, uk) => (lang === 'pl' ? pl : lang === 'uk' ? (uk ?? en) : en),
    voiv: (v) => v,
  };
  const ctx = { UI };
  vm.createContext(ctx);
  vm.runInContext(`${linia('const alarmLevel = ')}\n${funkcja('opisSytuacji')}\n`
    + 'this.opis = opisSytuacji;', ctx);
  return ctx.opis;
}

const brak = () => null;
const dron = () => ({ what: 'dron', km: 146, eta: 48 });

test('pusty kraj', () => {
  const t = piaskownica('pl')({}, [], brak, '21:35');
  assert.match(t, /^Sytuacja o 21:35: w całym kraju brak sygnałów\./);
  assert.match(t, /źródło nieoficjalne/);
});

test('obserwowane województwo z sygnałami i najbliższym obiektem', () => {
  const voivs = { lubelskie: { alert_level: 'elevated', level: 'elevated', score: 3.2 },
                  podkarpackie: { alert_level: 'none', level: 'none', score: 0.4 } };
  const t = piaskownica('pl')(voivs, ['podkarpackie', 'lubelskie'], dron, '21:35');
  assert.match(t, /woj\. podkarpackie — brak sygnałów; woj\. lubelskie — podwyższona uwaga, 3,2 pkt\./,
    'kolejność użytkownika, polski przecinek');
  assert.match(t, /Najbliżej: dron, 146 km, około 48 min\./);
  assert.match(t, /kieruj się syrenami i komunikatami RCB\.$/);
});

test('kolor z przeniesień nie udaje alarmu', () => {
  const voivs = { lubelskie: { alert_level: 'none', level: 'elevated', score: 2.6, spill_raised: true } };
  let pytano = false;
  const t = piaskownica('pl')(voivs, ['lubelskie'], () => { pytano = true; return dron(); }, '08:00');
  assert.match(t, /woj\. lubelskie — brak sygnałów\./);
  assert.equal(pytano, false, 'przy braku alarmu nie podajemy najbliższego obiektu');
});

test('bez obserwowanych: trzy najgroźniejsze, czerwony pierwszy', () => {
  const voivs = {
    mazowieckie: { alert_level: 'elevated', score: 2.6 },
    lubelskie: { alert_level: 'high', score: 6.1 },
    podlaskie: { alert_level: 'elevated', score: 3.4 },
    podkarpackie: { alert_level: 'elevated', score: 2.5 },
    opolskie: { alert_level: 'none', score: 0 },
  };
  const pytane = [];
  const t = piaskownica('pl')(voivs, [], (v) => { pytane.push(v); return dron(); }, '03:10');
  assert.match(t, /woj\. lubelskie — wysoki priorytet, 6,1 pkt; woj\. podlaskie — podwyższona uwaga, 3,4 pkt; woj\. mazowieckie — podwyższona uwaga, 2,6 pkt\./);
  assert.ok(!/podkarpackie|opolskie/.test(t), 'najwyżej trzy, bez spokojnych');
  assert.deepEqual(pytane, ['lubelskie'], 'najbliższy obiekt dla najgroźniejszego');
});

test('angielski: bez „woj.”, kropka dziesiętna, bez podwójnych spacji', () => {
  const voivs = { lubelskie: { alert_level: 'high', score: 4.5 } };
  const t = piaskownica('en')(voivs, ['lubelskie'], () => ({ what: 'drone', km: 40, eta: 0 }), '21:35');
  assert.match(t, /^Situation at 21:35: lubelskie — high priority, 4\.5 pts\. Nearest: drone, 40 km, about 1 min\./);
  assert.ok(!/ {2}/.test(t));
  assert.match(t, /unofficial source/);
});

test('ukraiński ma własne teksty', () => {
  const t = piaskownica('uk')({}, [], brak, '21:35');
  assert.match(t, /^Ситуація о 21:35: по всій Польщі сигналів немає\./);
});

test('nagłówek stoi przed mapą i jest niewidoczny', () => {
  const naglowek = HTML.search(/<h2 id="sytuacja" class="sr-only"/);
  const mapa = HTML.indexOf('<div id="map">');
  assert.notEqual(naglowek, -1, 'brak #sytuacja w index.html');
  assert.ok(naglowek < mapa, '#sytuacja musi stać przed mapą');
  assert.match(APP, /odswiezOpisSytuacji\(\);/, 'applyState musi odświeżać opis');
});

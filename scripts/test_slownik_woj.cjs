/* Lustro app/slownik_woj.py w engine.js (23.10.2026): te same przypadki co
   scripts/test_slownik_woj.py (scripts/slownik_woj_przypadki.json) i ten sam plik
   słownika. Bez słownika silnik zostaje przy dawnym dopasowaniu po rdzeniach —
   sprawdzamy też, że start() go ładuje. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SLOWNIK = JSON.parse(fs.readFileSync('frontend/assets/slownik-woj.json', 'utf8'));
const PRZYPADKI = JSON.parse(fs.readFileSync('scripts/slownik_woj_przypadki.json', 'utf8')).przypadki;

const nowySilnik = () => {
  const context = vm.createContext({
    console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
  return context.TestEngine;
};

test('engine.js gives the same provinces as the backend dictionary', () => {
  const E = nowySilnik();
  E.ustawSlownik(SLOWNIK);
  for (const [tekst, oczekiwane] of PRZYPADKI)
    assert.deepEqual([...E.matchVoivs(tekst)], oczekiwane, tekst);
});

test('long text: linear time, same result, 8000-character safety cap', () => {
  const E = nowySilnik();
  E.ustawSlownik(SLOWNIK);
  const dlugi = 'Drony nad Lublinem, Chełmem i Zamościem, potem Rzeszów oraz Przemyśl. '.repeat(4000);
  const t0 = Date.now();
  assert.deepEqual([...E.matchVoivs(dlugi)], ['lubelskie', 'podkarpackie']);
  assert.ok(Date.now() - t0 < 1500, `280 KB w ${Date.now() - t0} ms`);
  assert.deepEqual([...E.matchVoivs('x'.repeat(8000) + ' Alarm w Rzeszowie')], [], 'po 8000. znaku nie czytamy');
  assert.deepEqual([...E.matchVoivs('Alert. W powiatach: puławski, opolski. Syreny w Opolu.')], ['opolskie'],
    'reguła powiatu w obrębie zdania');
});

test('without the dictionary the engine keeps the old stem matching', () => {
  const E = nowySilnik();
  assert.deepEqual([...E.matchVoivs('Alarm w Rzeszowie')], ['podkarpackie']);
});

test('start() loads the dictionary from the bundled assets before reading sources', () => {
  const src = fs.readFileSync('frontend/engine.js', 'utf8');
  const start = src.slice(src.indexOf('async function start(stateCb)'));
  const ladowanie = start.search(/ustawSlownik\(\s*await\s*\(\s*await\s+fetch\(\s*["']assets\/slownik-woj\.json/);
  assert.ok(ladowanie > 0, 'start() nie ładuje assets/slownik-woj.json');
  const pierwszyOdczyt = start.search(/\btick[A-Z]\w*\(\)/);
  assert.ok(pierwszyOdczyt === -1 || ladowanie < pierwszyOdczyt, 'słownik ładowany po pierwszym odczycie źródeł');
});

// Tryb BEZ SERWERA: koła bałtyckie muszą działać także u zapasowych dostawców.
//
// 16.10.2026: engine.js brał `base` od dostawcy, który odpowiedział na /v2/mil,
// i doklejał `/point/{lat}/{lon}/{r}`. adsb.fi odpowiada na to 400 — ma
// `/api/v2/lat/{lat}/lon/{lon}/dist/{r}` i listę pod `aircraft`, nie `ac`.
// Gdy adsb.lol i airplanes.live nie odpowiadały, koła wracały puste.
//
// Backendową stronę sprawdza scripts/test_adsb_geo_zapas.py; tutaj idą
// PRODUKCYJNE `adsbGeoUrl` i `adsbGeoAircraft` z frontend/engine.js.
//
// Uruchomienie: node scripts/test_adsb_geo_zapas.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = fs.readFileSync(path.join(ROOT, 'frontend/engine.js'), 'utf8');

function silnik() {
  const kontekst = vm.createContext({
    console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext(ENGINE + '\nthis.TestEngine = Engine;', kontekst);
  return kontekst.TestEngine;
}

const E = silnik();
const F16 = { hex: '4b8452', flight: 'TUAF123 ', t: 'F16', lat: 55.9, lon: 23.1 };

test('adresy kół dla każdego dostawcy z listy /v2/mil', () => {
  assert.equal(E.adsbGeoUrl('https://api.adsb.lol/v2', 55.5, 24.0, 220),
               'https://api.adsb.lol/v2/point/55.5/24/220');
  assert.equal(E.adsbGeoUrl('https://api.airplanes.live/v2', 58.2, 25.5, 220),
               'https://api.airplanes.live/v2/point/58.2/25.5/220');
  assert.equal(E.adsbGeoUrl('https://opendata.adsb.fi/api/v2', 58.2, 25.5, 220),
               'https://opendata.adsb.fi/api/v2/lat/58.2/lon/25.5/dist/220');
});

test('lista maszyn spod `ac` i spod `aircraft`', () => {
  assert.deepEqual(E.adsbGeoAircraft({ ac: [F16], total: 1 }).map(a => a.hex), ['4b8452']);
  assert.deepEqual(E.adsbGeoAircraft({ now: 1792172236.001, aircraft: [F16] }).map(a => a.hex),
                   ['4b8452']);
  assert.equal(E.adsbGeoAircraft({}).length, 0);
  assert.equal(E.adsbGeoAircraft(null).length, 0);
});

test('tickAdsb używa obu pomocników, nie sklejonego /point/', () => {
  // \r?\n: na Windows checkout daje CRLF i bez tego test padał na końcach linii, nie na kodzie
  const m = /async function tickAdsb\(\)[\s\S]*?\r?\n}\r?\n/.exec(ENGINE);
  assert.ok(m, 'nie znalazłem tickAdsb w engine.js');
  assert.match(m[0], /adsbGeoUrl\(\s*base\s*,/);
  assert.match(m[0], /adsbGeoAircraft\(/);
  assert.doesNotMatch(m[0], /\$\{base\}\/point\//);
});

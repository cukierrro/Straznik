// Tryb BEZ SERWERA: ADS-B pyta wyłącznie adsb.lol — bez airplanes.live i adsb.fi.
//
// 16.10.2026 koła bałtyckie dostały obsługę zapasu adsb.fi (inna ścieżka, lista
// pod `aircraft`). 26.10.2026 przegląd podstaw korzystania z cudzych danych:
// airplanes.live w regulaminie zakazuje automatycznego pobierania i budowania
// z danych bazy bez pisemnej zgody, a opendata.adsb.fi pozwala tylko na użytek
// osobisty i niekomercyjny. Decyzja usera z 26.10: zapasy ADS-B usunąć.
//
// Backendową stronę sprawdza scripts/test_adsb_bez_zapasu.py; tutaj idą
// PRODUKCYJNE `adsbGeoUrl`, `adsbGeoAircraft` i `tickAdsb` z frontend/engine.js.
//
// Uruchomienie: node scripts/test_adsb_bez_zapasu.cjs
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

test('adres kół adsb.lol: /point/{lat}/{lon}/{r}', () => {
  assert.equal(E.adsbGeoUrl('https://api.adsb.lol/v2', 55.5, 24.0, 220),
               'https://api.adsb.lol/v2/point/55.5/24/220');
});

test('lista maszyn spod `ac`', () => {
  assert.deepEqual(E.adsbGeoAircraft({ ac: [F16], total: 1 }).map(a => a.hex), ['4b8452']);
  assert.equal(E.adsbGeoAircraft({}).length, 0);
  assert.equal(E.adsbGeoAircraft(null).length, 0);
});

test('tickAdsb łączy się tylko z api.adsb.lol i składa koła pomocnikiem', () => {
  // \r?\n: na Windows checkout daje CRLF i bez tego test padał na końcach linii, nie na kodzie
  const m = /async function tickAdsb\(\)[\s\S]*?\r?\n}\r?\n/.exec(ENGINE);
  assert.ok(m, 'nie znalazłem tickAdsb w engine.js');
  const kod = m[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const hosty = new Set([...kod.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(x => x[1]));
  assert.deepEqual([...hosty], ['api.adsb.lol'], `tickAdsb pyta też: ${[...hosty]}`);
  assert.match(kod, /adsbGeoUrl\(\s*base\s*,/);
  assert.match(kod, /adsbGeoAircraft\(/);
  assert.doesNotMatch(kod, /\$\{base\}\/point\//);
});

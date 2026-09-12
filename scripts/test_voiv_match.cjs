/* Przypisywanie artykułu RSS do województw — backend i silnik wbudowany muszą
   dawać ten sam wynik. Regresja z 12.09.2026: alert RCB rozesłany „do osób na
   terenie województw lubelskiego i podkarpackiego" trafiał TYLKO do
   podkarpackiego, bo dopasowanie brało jedno, najdłuższe hasło. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: () => null, setItem: () => {} },
});
vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8')
  + '\nthis.TestEngine = Engine;', context);
// tablica z sandboxa ma prototyp innego realmu — rozpakowujemy do zwykłej
const matchVoivs = (text) => [...context.TestEngine.matchVoivs(text)];

const RCB_TWO_REGIONS =
  'Lubelskie: RCB ostrzega mieszkańców w związku z atakami Rosji na Ukrainę. '
  + 'Rządowe Centrum Bezpieczeństwa rozesłało w sobotę alert do osób na terenie '
  + 'województw lubelskiego i podkarpackiego.';

test('an alert for two provinces reaches both of them', () => {
  assert.deepEqual(matchVoivs(RCB_TWO_REGIONS), ['lubelskie', 'podkarpackie']);
});

test('colliding place names still resolve to one province', () => {
  // krótsze hasło schowane w dłuższym trafieniu innego województwa musi przegrać
  assert.deepEqual(matchVoivs('Chełmno: ćwiczenia syren'), ['kujawsko-pomorskie']);
  assert.deepEqual(matchVoivs('Radomsko: alarm'), ['łódzkie']);
  assert.deepEqual(matchVoivs('Tomaszów Mazowiecki — nalot'), ['łódzkie']);
  assert.deepEqual(matchVoivs('Biała Podlaska: syreny'), ['lubelskie']);
  assert.deepEqual(matchVoivs('Ostrowiec Świętokrzyski'), ['świętokrzyskie']);
});

test('one province, no text and diacritic-free spelling', () => {
  assert.deepEqual(matchVoivs('Alarm w Rzeszowie'), ['podkarpackie']);
  assert.deepEqual(matchVoivs('Alarm w Rzeszowie'), matchVoivs('Alarm w Rzeszowie'.normalize('NFD')));
  assert.deepEqual(matchVoivs('Nic o regionach'), []);
});

test('provinces come in the order they appear in the text', () => {
  assert.deepEqual(matchVoivs('Syreny w Przemyślu, potem w Lublinie'),
    ['podkarpackie', 'lubelskie']);
});

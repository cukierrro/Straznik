// Test natywny alarmu uprzedza PRZED testem, czy zagra przy wyciszeniu (11.10.2026).
//
// Zgłoszenie z iPhone'a: „nie przychodzi alert”. Czerwony test szedł zawsze jako
// zwykłe powiadomienie, więc wyciszony iPhone milczał — także u ludzi ze zgodą na
// alarm krytyczny, u których prawdziwy czerwony zagrałby. Strona natywna iOS (sesja
// iOS) zwraca teraz {scheduled, critical, silentRisk}; wspólny app.js mówi to
// człowiekowi, zanim odłoży telefon, i przekazuje język treści testu.
// Android zwraca undefined — zachowanie bez zmian.
//
// Uruchomienie: node scripts/test_test_natywny_uprzedzenie.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
// koniec funkcji = pierwsza klamra w kolumnie 0 (CRLF na Windows, LF w repo)
const kod = APP.slice(APP.indexOf('async function nativeTest(')).match(/^[\s\S]*?\r?\n\}/)[0];

function uruchom(wynik, lang = 'pl') {
  const z = { toasty: [], wywolania: [] };
  const ctx = vm.createContext({
    BG: () => ({ testNativeAlarm: async (o) => { z.wywolania.push(o); return wynik; } }),
    blockedByAlertsOff: () => false,
    document: { getElementById: () => ({ close() {} }) },
    myVoiv: () => 'podkarpackie',
    toast: (m) => z.toasty.push(m),
    UI: { lang, t: (pl, en, uk) => ({ pl, en, uk })[lang] },
  });
  vm.runInContext(kod + '\nthis.nativeTest = nativeTest;', ctx);
  return { nativeTest: ctx.nativeTest, z };
}

test('Android (undefined): jak dotąd — 5 sekund, można zablokować ekran', async () => {
  const { nativeTest, z } = uruchom(undefined);
  await nativeTest('high');
  assert.equal(z.toasty.length, 1);
  assert.match(z.toasty[0], /zablokować ekran/);
});

test('iOS bez zgody na alarm krytyczny: uprzedza o ciszy i wskazuje przycisk', async () => {
  const { nativeTest, z } = uruchom({ scheduled: true, silentRisk: true });
  await nativeTest('high');
  assert.equal(z.toasty.length, 1, 'jeden komunikat, nie dwa');
  assert.match(z.toasty[0], /wyciszonym iPhonie będzie cichy/);
  assert.match(z.toasty[0], /„Włącz alarm mimo wyciszenia”/);
  assert.match(APP, /T\("Włącz alarm mimo wyciszenia",/, 'nazwa przycisku zgodna z prawdziwą etykietą');
});

test('iOS ze zgodą: mówi, że zagra mimo wyciszenia', async () => {
  const { nativeTest, z } = uruchom({ scheduled: true, critical: true });
  await nativeTest('high');
  assert.equal(z.toasty.length, 1);
  assert.match(z.toasty[0], /także przy wyciszonym telefonie/);
});

test('zablokowane powiadomienia nadal mają pierwszeństwo', async () => {
  const { nativeTest, z } = uruchom({ scheduled: false, silentRisk: true });
  await nativeTest('high');
  assert.equal(z.toasty.length, 1);
  assert.match(z.toasty[0], /zablokowane/);
});

test('język trafia do strony natywnej; komunikaty w EN i UK', async () => {
  const en = uruchom({ scheduled: true, silentRisk: true }, 'en');
  await en.nativeTest('high');
  assert.equal(en.z.wywolania[0].lang, 'en');
  assert.match(en.z.toasty[0], /“Turn on alert despite silent mode”/);
  assert.match(APP, /"🔊 Turn on alert despite silent mode"/, 'nazwa EN zgodna z etykietą przycisku');
  const uk = uruchom({ scheduled: true, critical: true }, 'uk');
  await uk.nativeTest('high');
  assert.equal(uk.z.wywolania[0].lang, 'uk');
  assert.match(uk.z.toasty[0], /справжня червона тривога/);
});

test('alarm przychodzi po polsku — powiedziane w aplikacji i w instrukcjach EN/UK/iPhone', () => {
  const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
  assert.ok(I18N.includes('Real alerts arrive in Polish, whatever the app language.'), 'nota EN przy teście');
  assert.ok(I18N.includes('Справжні тривоги приходять польською, незалежно від мови застосунку.'), 'nota UK przy teście');
  for (const [plik, zdanie] of [['docs/en.html', '<b>Alerts arrive in Polish.</b>'],
                                ['docs/iphone-en.html', '<b>Alerts arrive in Polish.</b>'],
                                ['docs/uk.html', '<b>Тривоги приходять польською.</b>']])
    assert.ok(fs.readFileSync(plik, 'utf8').includes(zdanie), plik);
});

test('instrukcja UK nazywa przycisk testu tak jak aplikacja', () => {
  const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
  const UK = fs.readFileSync('docs/uk.html', 'utf8');
  assert.ok(I18N.includes('"▶ Тест: червона системна (через 5 с)"'));
  assert.ok(!UK.includes('червоний нативний'), 'stara, nieistniejąca etykieta');
  assert.ok(UK.includes('<kbd>▶ Тест: червона системна</kbd>'));
});

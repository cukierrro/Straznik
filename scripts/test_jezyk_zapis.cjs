// Straznik zapisuje jezyk, ktorym faktycznie mowi (14.10.2026).
// GROTA (grota/jezyk.js) bierze kolejno: grota_lang -> straznik_lang -> jezyk telefonu.
// Straznik bez zapisu mowil po polsku, ale nic nie zapisywal — kto nigdy nie wybieral
// jezyka, dostawal polskiego Straznika i Grote w jezyku telefonu (audyt UI/UX 14.10).
//
// Uruchomienie: node scripts/test_jezyk_zapis.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
const GROTA = fs.readFileSync('grota/jezyk.js', 'utf8');

// Uruchamiamy tylko poczatek IIFE z i18n.js — wybor i zapis jezyka.
const kod = I18N.slice(I18N.indexOf('const JEZYKI'), I18N.indexOf('// Brak ukrainskiego'));

function start(zapis, { rzuca = false } = {}) {
  const pamiec = new Map(zapis === undefined ? [] : [['straznik_lang', zapis]]);
  const zapisy = [];
  const localStorage = {
    getItem: (k) => (pamiec.has(k) ? pamiec.get(k) : null),
    setItem: (k, v) => { if (rzuca) throw new Error('QuotaExceeded'); zapisy.push([k, v]); pamiec.set(k, String(v)); },
  };
  const ctx = vm.createContext({ localStorage });
  vm.runInContext(kod + '\nthis.lang = lang;', ctx);
  return { lang: ctx.lang, zapisy, pamiec };
}

test('pierwsze uruchomienie: zapisuje „pl”, ktorym Straznik mowi', () => {
  const r = start(undefined);
  assert.equal(r.lang, 'pl');
  assert.deepEqual(r.zapisy, [['straznik_lang', 'pl']]);
});

test('zly zapis jest zastepowany tym, czym Straznik naprawde mowi', () => {
  const r = start('de');
  assert.equal(r.lang, 'pl');
  assert.equal(r.pamiec.get('straznik_lang'), 'pl');
});

test('wybrany jezyk zostaje i nie jest przepisywany', () => {
  for (const j of ['pl', 'en', 'uk']) {
    const r = start(j);
    assert.equal(r.lang, j);
    assert.deepEqual(r.zapisy, [], j);
  }
});

test('zablokowany zapis (tryb prywatny) nie psuje startu', () => {
  assert.equal(start(undefined, { rzuca: true }).lang, 'pl');
});

test('GROTA nadal czyta straznik_lang przed jezykiem telefonu', () => {
  const f = GROTA.slice(GROTA.indexOf('function wykryj()'));
  assert.ok(f.indexOf('czytaj("straznik_lang")') > 0);
  assert.ok(f.indexOf('czytaj("straznik_lang")') < f.indexOf('navigator.language'),
    'jesli GROTA zacznie od telefonu, zapis w Strazniku nic nie da');
});

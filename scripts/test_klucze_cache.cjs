// Klucz ?v= w index.html musi być nie starszy niż plik, który opisuje.
//
// 24.09.2026: `frontend/aircraft-photos.js` zmienił się 23.09 (ukraiński podpis
// pod zdjęciem maszyny), ale w index.html został przy `?v=1.7.19` z 9 września.
// Cloudflare i przeglądarki serwowały więc wersję sprzed poprawki i ukraiński
// użytkownik widział polski podpis. Tego samego dnia ta sama pułapka złapała
// `app.js` — klucz podbity raz przy wydaniu, a frontend zmieniał się jeszcze
// trzy razy po nim. Dwa razy w jeden dzień to za dużo, żeby pilnować tego z głowy.
//
// Zasada: dla każdego pliku z katalogu frontend/ podpiętego w index.html commit,
// który ostatnio ruszył TEN PLIK, musi być przodkiem commitu, który ostatnio
// ruszył JEGO LINIĘ w index.html (albo być tym samym commitem). Inaczej znaczy,
// że plik zmieniono, a klucza nie podbito.
//
// Nie wymagamy jednego wspólnego klucza dla wszystkich plików — pliki, które się
// nie zmieniają (katalog zdjęć, miejsca), nie mają po co być pobierane od nowa
// przy każdym wydaniu.
//
// Uruchomienie: node scripts/test_klucze_cache.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = 'frontend/index.html';

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/* Wszystkie lokalne zasoby podpięte w index.html razem z ich kluczem. */
function podpiete() {
  const html = fs.readFileSync(path.join(ROOT, INDEX), 'utf8');
  const out = [];
  for (const m of html.matchAll(/(?:src|href)="([A-Za-z0-9._-]+)\?v=([^"]*)"/g)) {
    const plik = `frontend/${m[1]}`;
    if (fs.existsSync(path.join(ROOT, plik))) out.push({ nazwa: m[1], plik, klucz: m[2] });
  }
  return out;
}

const ZASOBY = podpiete();

test('index.html w ogóle podpina zasoby z kluczem (test nie zjada sam siebie)', () => {
  assert.ok(ZASOBY.length >= 5, `znalazłem tylko ${ZASOBY.length} zasobów z ?v= — zmienił się zapis w index.html?`);
});

for (const { nazwa, plik, klucz } of ZASOBY) {
  test(`${nazwa}: klucz ?v=${klucz} nie jest starszy od pliku`, () => {
    if (git('status', '--porcelain', '--', plik)) {
      // Plik ma niezacommitowane zmiany — klucz podbija się przy commicie, nie teraz.
      return;
    }
    const cPlik = git('log', '-1', '--format=%H', '--', plik);
    // -G: ostatni commit, który ruszył linię pasującą do wzorca w index.html
    const wzor = nazwa.split('.').join('[.]') + '[?]v=';
    const cKlucz = git('log', '-1', '--format=%H', '-G', wzor, '--', INDEX);
    assert.ok(cPlik, `brak historii dla ${plik}`);
    assert.ok(cKlucz, `nie znalazłem w historii index.html linii z ${nazwa}?v=`);
    let ok = true;
    try { git('merge-base', '--is-ancestor', cPlik, cKlucz); } catch { ok = false; }
    assert.ok(ok,
      `${plik} zmieniono w ${cPlik.slice(0, 7)} (${git('log', '-1', '--format=%ad', '--date=short', cPlik)}), `
      + `a klucz ?v=${klucz} ostatnio ruszono w ${cKlucz.slice(0, 7)} `
      + `(${git('log', '-1', '--format=%ad', '--date=short', cKlucz)}) — podbij klucz w ${INDEX}`);
  });
}

// Klucz ?v= w index.html musi być nie starszy niż plik, który opisuje.
//
// 24.09.2026: `frontend/aircraft-photos.js` zmienił się 23.09 (ukraiński podpis
// pod zdjęciem maszyny), ale w index.html został przy `?v=1.7.19` z 9 września.
// Cloudflare i przeglądarki serwowały więc wersję sprzed poprawki i ukraiński
// użytkownik widział polski podpis. Tego samego dnia ta sama pułapka złapała
// `app.js` — klucz podbity raz przy wydaniu, a frontend zmieniał się jeszcze
// trzy razy po nim. Dwa razy w jeden dzień to za dużo, żeby pilnować tego z głowy.
//
// 26.09.2026: ta sama regresja, tylko rozłożona na dwie gałęzie. `origin/main`
// podbił `app.js` i `engine.js` na `?v=1.7.79a` przy poprawkach RCB i to poszło
// na produkcję — Cloudflare i przeglądarki ten klucz już widziały. Niezależnie
// gałąź z poprawkami MLAT ruszyła te same pliki i też ustawiła `?v=1.7.79a`.
// Po scaleniu pliki mają obie zmiany pod kluczem, który jest już rozdany, czyli
// znowu stara treść u użytkownika. Reguła przodka tego nie widzi: oba commity
// są przodkami scalenia, więc przechodzi. Kolizję wyłapało wtedy ręczne
// porównanie gałęzi, zanim doszło do scalenia.
//
// Zasada pierwsza: dla każdego pliku z katalogu frontend/ podpiętego w index.html
// commit, który ostatnio ruszył TEN PLIK, musi być przodkiem commitu, który
// ostatnio ruszył JEGO LINIĘ w index.html (albo być tym samym commitem). Inaczej
// znaczy, że plik zmieniono, a klucza nie podbito.
//
// Zasada druga: jeżeli treść zasobu różni się od tej z `origin/main`, to jego
// klucz musi się różnić od klucza, który ma `origin/main`. Klucz raz wypuszczony
// opisuje dokładnie jedną treść i nie wolno pod niego podłożyć innej.
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
const WZOR_ZASOBU = /(?:src|href)="([A-Za-z0-9._-]+)\?v=([^"]*)"/g;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/* Git, który na brak referencji odpowiada null zamiast wywracać test. */
function gitCiche(...args) {
  try { return git(...args); } catch { return null; }
}

/* Wszystkie lokalne zasoby podpięte w index.html razem z ich kluczem. */
function podpiete() {
  const html = fs.readFileSync(path.join(ROOT, INDEX), 'utf8');
  const out = [];
  for (const m of html.matchAll(WZOR_ZASOBU)) {
    const plik = `frontend/${m[1]}`;
    if (fs.existsSync(path.join(ROOT, plik))) out.push({ nazwa: m[1], plik, klucz: m[2] });
  }
  return out;
}

/* Stan origin/main: to, co Cloudflare i przeglądarki już widziały.
   Brak tej referencji (świeży klon, brak sieci) to stan środowiska, nie błąd
   wydania — wtedy drugiej zasady po prostu nie da się sprawdzić. Nie pobieramy
   niczego z sieci, bo test ma działać offline. */
function stanMain() {
  const ref = gitCiche('rev-parse', '--verify', 'origin/main^{commit}');
  if (!ref) return null;
  // Gałąź, która nie wyprzedza origin/main (świeży klon, praca tuż po wydaniu),
  // nie wnosi własnej treści — nie ma czego porównywać.
  let wyprzedzamy = true;
  try { git('merge-base', '--is-ancestor', 'HEAD', ref); wyprzedzamy = false; } catch { /* wyprzedzamy */ }
  const html = gitCiche('show', `${ref}:${INDEX}`);
  const klucze = new Map();
  if (html) for (const m of html.matchAll(WZOR_ZASOBU)) klucze.set(m[1], m[2]);
  return { ref, wyprzedzamy, klucze };
}

/* Skrót treści pliku w danej rewizji — null, gdy rewizja go nie zna. */
function tresc(rewizja, plik) {
  return gitCiche('rev-parse', `${rewizja}:${plik}`);
}

const ZASOBY = podpiete();
const MAIN = stanMain();

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

  test(`${nazwa}: klucz ?v=${klucz} nie powtarza klucza z origin/main`, (t) => {
    if (!MAIN) return t.skip('brak origin/main lokalnie — nie ma z czym porównać');
    if (!MAIN.wyprzedzamy) return t.skip('gałąź nie wyprzedza origin/main — nie wnosi własnej treści');
    if (git('status', '--porcelain', '--', plik)) {
      return t.skip('niezacommitowane zmiany — klucz podbija się przy commicie');
    }
    const zMain = tresc(MAIN.ref, plik);
    if (!zMain) return;                        // plik dodany na gałęzi, main go nie zna
    if (tresc('HEAD', plik) === zMain) return; // ta sama treść może mieć ten sam klucz
    const kluczMain = MAIN.klucze.get(nazwa);
    if (kluczMain === undefined) return;       // main nie podpina tego pliku w index.html
    assert.notEqual(klucz, kluczMain,
      `${plik} różni się od wersji z origin/main (${MAIN.ref.slice(0, 7)}), `
      + `a klucz ?v=${klucz} jest dokładnie ten sam co tam — ten klucz Cloudflare i przeglądarki `
      + 'już rozdały dla treści z main, więc po scaleniu użytkownik dostanie starą. '
      + `Nadaj na gałęzi własny klucz (np. ?v=${klucz}-${nazwa.split('.')[0]}) albo od razu klucz wydania.`);
  });
}

// Okno „O aplikacji i punktacja" — żadnych tłumaczeń po kolejności.
//
// To okno najdłużej trzymało się selektorów pozycyjnych: `.about-body > p`
// po indeksie oraz `.about-tab:first-of-type` / `:nth-of-type(2)`. W samym
// index.html stały trzy komentarze ostrzegające, żeby nie dokładać akapitu,
// bo „rozjechałby całą wersję angielską" — czyli dokumentacja pułapki zamiast
// jej usunięcia. Przy zwijaniu rozdziałów w <details> 03.10.2026 obie rzeczy
// padłyby naraz: akapit przestaje być bezpośrednim dzieckiem, a każda tabela
// zostaje `:first-of-type` we własnym rodzicu.
//
// Uruchomienie: node scripts/test_o_aplikacji.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'frontend/i18n.js'), 'utf8');

function okno() {
  const i = HTML.indexOf('<dialog id="about">');
  assert.ok(i >= 0, 'nie znalazłem okna #about');
  return HTML.slice(i, HTML.indexOf('\n</dialog>', i));
}

test('nic w tym oknie nie jest tłumaczone po kolejności', () => {
  const pozycyjne = [
    /#about \.about-body > p/,
    /\.about-tab:first-of-type/,
    /\.about-tab:nth-of-type/,
    /querySelectorAll\("#about \.about-note"\)/,
  ].filter(re => re.test(I18N)).map(String);
  assert.deepEqual(pozycyjne, [],
    'wrócił selektor pozycyjny w oknie „O aplikacji":\n  ' + pozycyjne.join('\n  '));
});

test('akapity, tabele i ramki mają identyfikatory', () => {
  const o = okno();
  const bez = [];
  // akapity poza nagłówkiem okna (.about-sub ma własny selektor)
  for (const m of o.matchAll(/<p(?! class="about-sub")([^>]*)>([\s\S]{0,50})/g))
    if (!/id="/.test(m[1])) bez.push('  <p> ' + m[2].replace(/\s+/g, ' ').trim().slice(0, 50));
  for (const m of o.matchAll(/<table([^>]*)>/g))
    if (!/id="/.test(m[1])) bez.push('  <table> bez id');
  for (const m of o.matchAll(/<div class="fineprint about-note"([^>]*)>/g))
    if (!/id="/.test(m[1])) bez.push('  about-note bez id');
  assert.deepEqual(bez, [], 'bez identyfikatora nie zostaną przetłumaczone:\n' + bez.join('\n'));
});

test('każdy identyfikator jest obsłużony w i18n', () => {
  const o = okno();
  const braki = [];
  for (const m of o.matchAll(/<(?:p|table|div)[^>]*\bid="(ab-[a-z0-9-]+)"/g))
    // tabele wchodzą do selektora z dalszym ciągiem („#ab-tab-punkty tr td…"),
    // więc szukamy identyfikatora, nie całego, zamkniętego napisu
    if (!I18N.includes('#' + m[1]) && !I18N.includes('"' + m[1] + '"'))
      braki.push('  #' + m[1]);
  assert.deepEqual(braki, [], 'identyfikatory bez tłumaczenia:\n' + braki.join('\n'));
});

test('rozdziały są sekcjami rozwijanymi, a nagłówki zostają h3', () => {
  const o = okno();
  const otwarte = (o.match(/<details class="about-sec"/g) || []).length;
  const zamkniete = (o.match(/<\/details>/g) || []).length;
  assert.equal(otwarte, 6, 'sześć rozdziałów, sześć sekcji');
  assert.equal(zamkniete, 6, 'niedomknięta sekcja rozsypie resztę okna');
  // i18n dalej mapuje `#about h3` po kolejności — nagłówki muszą zostać h3
  // i stać w tej samej kolejności, co tablica tłumaczeń.
  assert.equal((o.match(/<summary><h3>/g) || []).length, 6, 'każdy nagłówek w swoim podpisie');
  assert.equal((o.match(/<h3>/g) || []).length, 6, 'żadnego h3 poza sekcjami');
});

test('tabela punktacji wymienia sąsiadów w cieniu', () => {
  // 1.7.88 dodało sześć krajów rysowanych na mapie bez punktów. Instrukcja
  // je opisuje, okno punktacji nie wymieniało ich wcale.
  const o = okno();
  for (const kraj of ['Mołdawii', 'Rumunii', 'Słowacji', 'Czechach', 'Szwecji', 'Węgrzech'])
    assert.ok(o.includes(kraj), 'brak kraju w tabeli punktacji: ' + kraj);
  // liczba wierszy tabeli punktacji musi zgadzać się z tablicą tłumaczeń
  const tab = /<table class="about-tab" id="ab-tab-punkty">([\s\S]*?)<\/table>/.exec(o);
  assert.ok(tab, 'nie znalazłem tabeli punktacji');
  const wierszy = (tab[1].match(/<tr>/g) || []).length;
  const lista = /setMany\("#ab-tab-punkty tr td:nth-child\(2\)", \[([\s\S]*?)\n    \]\);/.exec(I18N);
  assert.ok(lista, 'nie znalazłem angielskich opisów tabeli punktacji');
  const opisow = (lista[1].match(/^\s*"/gm) || []).length;
  assert.equal(opisow, wierszy,
    `tabela ma ${wierszy} wierszy, a angielskich opisów jest ${opisow} — ta lista idzie po kolejności`);
});

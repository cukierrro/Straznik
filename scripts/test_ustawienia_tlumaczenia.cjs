// Tłumaczenia akapitów w oknie ustawień idą PO INDEKSIE, nie po identyfikatorze.
//
// 24.09.2026: dołożenie jednego akapitu (#dnd-note) w zakładce Alarmy przesunęło
// wszystkie kolejne o jeden. Efekt widać było dopiero na zrzucie ekranu: w zakładce
// Dźwięk zniknął opis żółtego poziomu, a pod przyciskami testów wylądował tekst
// o sprawdzaniu aktualizacji z zakładki Aplikacja. Nowe akapity muszą albo trafiać
// na listę wyjątków w selektorze, albo dostać własny wpis w tablicy tłumaczeń.
//
// Uruchomienie: node scripts/test_ustawienia_tlumaczenia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'frontend/i18n.js'), 'utf8');

/* Selektor z i18n.js — czytamy go z kodu, żeby test nie żył własnym życiem. */
function wyjatki() {
  const m = /\.set-pane > p\.fineprint((?::not\([^)]*\))+)/.exec(I18N);
  assert.ok(m, 'nie znalazłem selektora akapitów w i18n.js');
  return [...m[1].matchAll(/:not\(([^)]*)\)/g)].map(x => x[1]);
}

/* Bezpośrednie dzieci <section class="set-pane"> — zagnieżdżone <div> wycinamy,
   bo akapity w nich (np. w #native-sound) nie są dziećmi panelu. */
function akapity() {
  const out = [];
  for (const sek of HTML.matchAll(/<section class="set-pane"[^>]*data-pane="([a-z]+)"[\s\S]*?<\/section>/g)) {
    const pane = sek[1];
    let plain = sek[0], prev;
    do { prev = plain; plain = plain.replace(/<div\b[^>]*>(?:(?!<div\b)[\s\S])*?<\/div>/g, ' '); } while (plain !== prev);
    for (const p of plain.matchAll(/<p class="([^"]*fineprint[^"]*)"([^>]*)>([\s\S]{0,80})/g))
      out.push({ pane, cls: p[1], attrs: p[2], tekst: p[3].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

function kwalifikujace() {
  const wyj = wyjatki();
  return akapity().filter(a => !wyj.some(w => w.startsWith('.')
    ? a.cls.split(/\s+/).includes(w.slice(1))
    : a.attrs.includes(`id="${w.slice(1)}"`)));
}

function tablice() {
  const i = I18N.indexOf('.set-pane > p.fineprint');
  const blok = I18N.slice(i, i + 4000);
  const en = /en \? \[([\s\S]*?)\n    \] : \[([\s\S]*?)\n    \]\);/.exec(blok);
  assert.ok(en, 'nie znalazłem tablic tłumaczeń akapitów');
  const zlicz = (s) => (s.match(/^\s*"/gm) || []).length;
  return { en: zlicz(en[1]), pl: zlicz(en[2]) };
}

test('obie tablice tłumaczeń mają tyle samo wpisów', () => {
  const { en, pl } = tablice();
  assert.equal(en, pl, `angielska ${en}, polska ${pl}`);
});

test('tłumaczone akapity trafiają w te zakładki, co trzeba', () => {
  const lista = kwalifikujace();
  const { en } = tablice();
  const kolejnosc = lista.slice(0, en).map(a => a.pane);
  assert.deepEqual(kolejnosc, ['alarmy', 'alarmy', 'miejsca', 'dzwiek', 'dzwiek', 'aplikacja'],
    'kolejność zakładek nie zgadza się z tablicą tłumaczeń — nowy akapit przesunął indeksy;\n'
    + 'dopisz go do :not(...) w selektorze albo dołóż wpis w obu tablicach.\n'
    + lista.slice(0, en + 2).map((a, i) => `  [${i}] ${a.pane}: ${a.tekst.slice(0, 55)}`).join('\n'));
});

test('akapit tłumaczony osobno jest wyłączony z selektora', () => {
  // #dnd-note ma własne DND_NOTE_PL/EN i ukraińskie innerHTML — nie może wpaść
  // do listy pozycyjnej, bo przesunąłby resztę.
  assert.ok(wyjatki().includes('#dnd-note'), '#dnd-note musi być w :not(...)');
  assert.ok(I18N.includes('DND_NOTE_PL') && I18N.includes('DND_NOTE_EN'),
    'osobne teksty dla #dnd-note muszą istnieć');
});

test('nagłówki h3 też nie rozjechały się po indeksie', () => {
  const m = /\.set-pane > h3((?::not\([^)]*\))*)/.exec(I18N);
  assert.ok(m, 'nie znalazłem selektora nagłówków');
  const wyj = [...m[1].matchAll(/:not\(([^)]*)\)/g)].map(x => x[1].slice(1));
  const h3 = [];
  for (const sek of HTML.matchAll(/<section class="set-pane"[^>]*data-pane="([a-z]+)"[\s\S]*?<\/section>/g)) {
    let plain = sek[0], prev;
    do { prev = plain; plain = plain.replace(/<div\b[^>]*>(?:(?!<div\b)[\s\S])*?<\/div>/g, ' '); } while (plain !== prev);
    for (const h of plain.matchAll(/<h3([^>]*)>/g))
      if (!wyj.some(w => h[1].includes(`id="${w}"`))) h3.push(sek[1]);
  }
  // Tablica tłumaczeń nagłówków ma pięć wpisów; szósty („Wersja” w Aplikacji)
  // zostaje nietknięty. Pilnujemy pierwszej piątki — to ona idzie po indeksie.
  assert.deepEqual(h3.slice(0, 5), ['alarmy', 'miejsca', 'dzwiek', 'aplikacja', 'aplikacja'],
    'zmieniła się liczba lub kolejność nagłówków h3 w panelach ustawień:\n  ' + h3.join(', '));
});

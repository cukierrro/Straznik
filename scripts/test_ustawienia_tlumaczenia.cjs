// Tłumaczenia w oknie ustawień — każdy napis ma IDENTYFIKATOR, nie numer w kolejce.
//
// Historia, dla której ten test istnieje:
//
// 24.09.2026 — dołożenie jednego akapitu (#dnd-note) w zakładce Alarmy przesunęło
// wszystkie kolejne o jeden: w zakładce Dźwięk zniknął opis żółtego poziomu,
// a pod przyciskami testów wylądował tekst o aktualizacjach z zakładki Aplikacja.
// Test pilnował wtedy, żeby kolejność akapitów zgadzała się z tablicą tłumaczeń.
//
// 03.10.2026 — ta sama pułapka zadziałała drugi raz i inaczej: schowanie
// pierwszego akapitu pod sekcję „Jak to działa?" sprawiło, że przestał być
// DZIECKIEM sekcji, selektor `.set-pane > p.fineprint` przestał go widzieć
// i lista znów przesunęła się o jeden. Po angielsku „Zapisz do 8 miejsc"
// dostawało tekst o alarmie pełnoekranowym. Zamiast łatać listę po raz drugi
// zlikwidowaliśmy mechanizm: każdy akapit i każdy podpis sekcji dostał
// identyfikator i własny wpis.
//
// Dlatego test sprawdza teraz warunek mocniejszy niż kolejność:
//   1. w i18n.js NIE MA już selektora pozycyjnego nad akapitami ustawień,
//   2. każdy akapit i każdy podpis sekcji w ustawieniach MA identyfikator,
//   3. każdy taki identyfikator jest obsłużony w OBU ścieżkach językowych
//      (okno ustawień przy zmianie języka i globalne przełączenie na angielski).
//
// Uruchomienie: node scripts/test_ustawienia_tlumaczenia.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'frontend/i18n.js'), 'utf8');

/* Napisy wypełniane z kodu w czasie działania — nie mają stałej treści,
   więc nie mają też tłumaczenia w słowniku. */
const Z_KODU = new Set(['app-version', 'upd-status', 'bg-status', 'ns-volume', 'more-links']);

function sekcje() {
  return [...HTML.matchAll(/<section class="set-pane"[^>]*data-pane="([a-z]+)"[\s\S]*?<\/section>/g)];
}

/* Wszystkie akapity drobnego druku w ustawieniach — także te schowane
   w <div> i <details>, bo zagnieżdżenie przestało mieć znaczenie. */
function akapity() {
  const out = [];
  for (const sek of sekcje())
    for (const p of sek[0].matchAll(/<p class="([^"]*fineprint[^"]*)"([^>]*)>([\s\S]{0,70})/g))
      out.push({
        pane: sek[1],
        id: (/id="([^"]+)"/.exec(p[2]) || [])[1] || null,
        tekst: p[3].replace(/\s+/g, ' ').trim(),
      });
  return out;
}

/* Napisy przełączników: <b> i <span class="muted"> w .sw-text. Po zmianie
   języka w samym oknie zostawały po polsku, bo znało je tylko applyEnglish. */
function przelaczniki() {
  const out = [];
  for (const sek of sekcje())
    // \b po nazwie znacznika: bez tego „b" łapało też każdy <button ...>,
    // a te tłumaczone są po treści napisu, nie po identyfikatorze.
    for (const s of sek[0].matchAll(/<(?:b|span)\b([^>]*\bid="[^"]+"[^>]*)>([^<]{0,60})/g)) {
      const id = (/id="([^"]+)"/.exec(s[1]) || [])[1];
      out.push({ pane: sek[1], id, tekst: s[2].replace(/\s+/g, ' ').trim() });
    }
  return out;
}

function podpisy() {
  const out = [];
  for (const sek of sekcje())
    for (const s of sek[0].matchAll(/<summary([^>]*)>([^<]{0,60})/g))
      out.push({
        pane: sek[1],
        id: (/id="([^"]+)"/.exec(s[1]) || [])[1] || null,
        tekst: s[2].replace(/\s+/g, ' ').trim(),
      });
  return out;
}

/* Identyfikator jest obsłużony, gdy pada w i18n.js po obu stronach: raz
   w ścieżce okna ustawień (button/getElementById) i raz w globalnym
   przejściu na angielski (set("#id") / getElementById). Liczymy wystąpienia
   — jedno znaczy, że jedna z dwóch ścieżek o nim nie wie. */
function wystapienia(id) {
  return (I18N.match(new RegExp('"#?' + id.replace(/[-]/g, '\\-') + '"', 'g')) || []).length;
}

test('akapity ustawień nie są już tłumaczone po kolejności', () => {
  const pozycyjne = I18N.match(/\.set-pane > p\.fineprint[^"]*/g) || [];
  assert.deepEqual(pozycyjne, [],
    'wrócił selektor pozycyjny nad akapitami ustawień — dwa razy przesunął tłumaczenia '
    + '(24.09 i 03.10.2026). Nowy akapit dostaje identyfikator i własny wpis:\n  '
    + pozycyjne.join('\n  '));
});

test('każdy akapit ustawień ma identyfikator', () => {
  const bez = akapity().filter(a => !a.id);
  assert.deepEqual(bez, [], 'akapit bez id nie zostanie przetłumaczony:\n'
    + bez.map(a => `  [${a.pane}] ${a.tekst}`).join('\n'));
});

test('każdy podpis sekcji rozwijanej ma identyfikator', () => {
  const bez = podpisy().filter(s => !s.id);
  assert.deepEqual(bez, [], 'podpis bez id zostanie po polsku w EN i UK:\n'
    + bez.map(s => `  [${s.pane}] ${s.tekst}`).join('\n'));
});

test('każdy napis jest obsłużony w obu ścieżkach językowych', () => {
  const braki = [];
  for (const el of [...akapity(), ...podpisy(), ...przelaczniki()]) {
    if (!el.id || Z_KODU.has(el.id)) continue;
    const ile = wystapienia(el.id);
    if (ile < 2) braki.push(`  [${el.pane}] #${el.id} — wystąpień w i18n.js: ${ile}`);
  }
  assert.deepEqual(braki, [],
    'napis znany tylko jednej ścieżce: okno ustawień tłumaczy przy zmianie języka,\n'
    + 'a applyEnglish/ukrainize przy przełączeniu całej aplikacji. Brakuje wpisu w jednej z nich:\n'
    + braki.join('\n'));
});

test('akapit tłumaczony osobnym innerHTML dalej ma oba teksty', () => {
  // #dnd-note ma pogrubienia, więc nie da się go ustawić przez textContent.
  assert.ok(I18N.includes('DND_NOTE_PL') && I18N.includes('DND_NOTE_EN'),
    'osobne teksty dla #dnd-note muszą istnieć');
});

test('nagłówki h3 nie rozjechały się po indeksie', () => {
  // Nagłówki zostały przy liście pozycyjnej: jest ich pięć, stoją bezpośrednio
  // w sekcjach i nie chowamy ich pod nic. Gdyby i to miało się zmieniać,
  // należy je przepiąć na identyfikatory jak akapity wyżej.
  const m = /\.set-pane > h3((?::not\([^)]*\))*)/.exec(I18N);
  assert.ok(m, 'nie znalazłem selektora nagłówków');
  const wyj = [...m[1].matchAll(/:not\(([^)]*)\)/g)].map(x => x[1].slice(1));
  const h3 = [];
  for (const sek of sekcje()) {
    let plain = sek[0], prev;
    do { prev = plain; plain = plain.replace(/<div\b[^>]*>(?:(?!<div\b)[\s\S])*?<\/div>/g, ' '); } while (plain !== prev);
    for (const h of plain.matchAll(/<h3([^>]*)>/g))
      if (!wyj.some(w => h[1].includes(`id="${w}"`))) h3.push(sek[1]);
  }
  assert.deepEqual(h3.slice(0, 5), ['alarmy', 'miejsca', 'dzwiek', 'aplikacja', 'aplikacja'],
    'zmieniła się liczba lub kolejność nagłówków h3 w panelach ustawień:\n  ' + h3.join(', '));
});

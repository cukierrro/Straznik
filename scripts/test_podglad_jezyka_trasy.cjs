// Podgląd języka w ustawieniach musi objąć TĘ SAMĄ sekcję, co pełne przełączenie.
//
// 24.09.2026, zgłoszenie z emulatora (APK 1.7.79): przy ukraińskim interfejsie
// zmiana „Мова інтерфейсу" na „Polski" przerysowywała nagłówki i zakładki okna,
// ale sekcja „Mapa: trasy obiektów" zostawała po ukraińsku aż do zapisu i
// przeładowania — etykiety obu list, ich opcje i akapit pod nimi opisywał wyłącznie
// translateStatic (jednokierunkowo, przy starcie), a previewSettings ustawiał tam
// tylko sam nagłówek. Teraz całą sekcję składa trailSection(), wołane z obu miejsc.
//
// Test uruchamia PRODUKCYJNE previewSettings i ukrainize z frontend/i18n.js na
// atrapie DOM-u zbudowanej z prawdziwego frontend/index.html i przechodzi wszystkie
// dziewięć przejść między językami — usterkę widać było tylko przy zmianie języka
// na już przetłumaczonym ekranie, nie przy pierwszym otwarciu ustawień.
//
// Wzorce są niezależne od treści samego trailSection, żeby test nie potwierdzał sam
// siebie: polski musi zgadzać się co do znaku z index.html, angielski ma się od
// polskiego różnić i nie mieć cyrylicy, a ukraiński ma być cyrylicą.
//
// Uruchomienie: node scripts/test_podglad_jezyka_trasy.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const I18N = fs.readFileSync(path.join(ROOT, 'frontend/i18n.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8');

/* ── produkcyjny kod wycinany z i18n.js (bez uruchamiania całego pliku, który
      potrzebuje przeglądarki) ───────────────────────────────────────────────── */
function wytnij(poczatek, nazwa) {
  const start = I18N.indexOf(poczatek);
  assert.notEqual(start, -1, `nie znalazłem ${nazwa} w frontend/i18n.js`);
  let glebokosc = 0;
  for (let i = start; i < I18N.length; i++) {
    if (I18N[i] === '{') glebokosc++;
    else if (I18N[i] === '}' && --glebokosc === 0) return I18N.slice(start, i + 1);
  }
  throw new Error(`niedomknięty ${nazwa}`);
}
const funkcja = (nazwa) => wytnij(`function ${nazwa}(`, `funkcji ${nazwa}`);
const stala = (nazwa) => wytnij(`const ${nazwa} = {`, `stałej ${nazwa}`) + ';';
const NORM = /const norm = .*/.exec(I18N);
assert.ok(NORM, 'nie znalazłem pomocnika norm w i18n.js');

/* ── oczekiwane teksty polskie: prosto z index.html ───────────────────────── */
const zwin = (s) => s.replace(/\s+/g, ' ').trim();
function zHtml(re, nazwa) {
  const m = re.exec(HTML);
  assert.ok(m, `nie znalazłem ${nazwa} w frontend/index.html`);
  return m[1];
}
function opcjeZHtml(id) {
  const blok = zHtml(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`), `listy ${id}`);
  return [...blok.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/g)].map((m) => zwin(m[1]));
}
const PL = {
  naglowek: zwin(zHtml(/<h3[^>]*id="trail-head">([\s\S]*?)<\/h3>/, 'nagłówka tras')),
  etykietaNeptun: zwin(zHtml(/<label id="trail-neptun-label">([\s\S]*?)<select/, 'etykiety NEPTUN')),
  etykietaAdsb: zwin(zHtml(/<label id="trail-adsb-label">([\s\S]*?)<select/, 'etykiety ADS-B')),
  opcjeNeptun: opcjeZHtml('set-trail-neptun'),
  opcjeAdsb: opcjeZHtml('set-trail-adsb'),
  opis: zwin(zHtml(/<div class="fineprint" id="trail-note">([\s\S]*?)<\/div>/, 'opisu tras')),
};
assert.equal(PL.opcjeNeptun.length, 3, 'lista NEPTUN ma mieć trzy opcje');
assert.equal(PL.opcjeAdsb.length, 3, 'lista ADS-B ma mieć trzy opcje');

/* ── atrapa DOM-u: tylko sekcja tras, reszta okna zgłasza się jako nieobecna ── */
function elementTekstowy(tekst) {
  const wezel = { nodeValue: tekst };
  return {
    wezly: [wezel],
    firstChild: wezel,
    get textContent() { return wezel.nodeValue; },
    set textContent(v) { wezel.nodeValue = v; },
    closest: () => null,
  };
}
function lista(teksty) {
  const options = teksty.map((t) => elementTekstowy(t));
  return { options, wezly: options.flatMap((o) => o.wezly), firstChild: null, closest: () => null };
}
function zbudujDom() {
  const el = {
    'trail-head': elementTekstowy(PL.naglowek),
    'trail-neptun-label': elementTekstowy(PL.etykietaNeptun + '\n      '),
    'set-trail-neptun': lista(PL.opcjeNeptun),
    'trail-adsb-label': elementTekstowy(PL.etykietaAdsb + '\n      '),
    'set-trail-adsb': lista(PL.opcjeAdsb),
    'trail-note': { innerHTML: PL.opis, wezly: [], firstChild: null, closest: () => null },
  };
  // Kolejność węzłów tekstowych jak w HTML — po nich chodzi drzewo w ukrainize().
  const wezly = ['trail-head', 'trail-neptun-label', 'set-trail-neptun',
    'trail-adsb-label', 'set-trail-adsb'].flatMap((k) => el[k].wezly);
  const dlg = { querySelector: () => null, querySelectorAll: () => [] };
  const document = {
    documentElement: {}, title: '', body: dlg,
    getElementById: (id) => (id === 'settings' ? dlg : el[id] || null),
    querySelector: () => null,
    querySelectorAll: () => [],
    // korzeń pomijamy: atrapa zawiera wyłącznie zawartość okna ustawień
    createTreeWalker: () => {
      let i = -1;
      return { currentNode: null, nextNode() { return (this.currentNode = wezly[++i] || null); } };
    },
  };
  return { document, el };
}

function podglad(kolejne) {
  const { document, el } = zbudujDom();
  const kontekst = vm.createContext({
    document, console,
    NodeFilter: { SHOW_TEXT: 4 },
    // opisy spoza sekcji tras — test ich nie sprawdza, a bez nich kod by się wywalił
    DND_NOTE_PL: '', DND_NOTE_EN: '',
  });
  vm.runInContext([NORM[0], stala('EN2UK'), stala('ATTR_UK'),
    funkcja('trailSection'), funkcja('ukrainize'), funkcja('previewSettings')].join('\n'), kontekst);
  for (const jezyk of kolejne) vm.runInContext(`previewSettings(${JSON.stringify(jezyk)})`, kontekst);
  return {
    naglowek: zwin(el['trail-head'].textContent),
    etykietaNeptun: zwin(el['trail-neptun-label'].firstChild.nodeValue),
    etykietaAdsb: zwin(el['trail-adsb-label'].firstChild.nodeValue),
    opcjeNeptun: el['set-trail-neptun'].options.map((o) => zwin(o.textContent)),
    opcjeAdsb: el['set-trail-adsb'].options.map((o) => zwin(o.textContent)),
    opis: zwin(el['trail-note'].innerHTML),
  };
}

const CYRYLICA = /[Ѐ-ӿ]/;
const teksty = (stan) => [
  ['nagłówek', stan.naglowek, PL.naglowek],
  ['etykieta NEPTUN', stan.etykietaNeptun, PL.etykietaNeptun],
  ['etykieta ADS-B', stan.etykietaAdsb, PL.etykietaAdsb],
  ...stan.opcjeNeptun.map((v, i) => [`opcja NEPTUN ${i}`, v, PL.opcjeNeptun[i]]),
  ...stan.opcjeAdsb.map((v, i) => [`opcja ADS-B ${i}`, v, PL.opcjeAdsb[i]]),
  ['opis', stan.opis, PL.opis],
];

function sprawdz(stan, jezyk, skad) {
  for (const [co, jest, pl] of teksty(stan)) {
    const gdzie = `${skad} → ${jezyk}: ${co} = „${jest}"`;
    assert.ok(jest, `${gdzie} — pusty tekst`);
    if (jezyk === 'pl') {
      assert.equal(jest, pl, `${gdzie} — polski musi być dokładnie taki jak w index.html`);
    } else if (jezyk === 'en') {
      assert.ok(!CYRYLICA.test(jest), `${gdzie} — została cyrylica`);
      assert.notEqual(jest, pl, `${gdzie} — został polski`);
    } else {
      assert.ok(CYRYLICA.test(jest), `${gdzie} — brak ukraińskiego`);
    }
  }
}

for (const skad of ['pl', 'en', 'uk'])
  for (const dokad of ['pl', 'en', 'uk'])
    test(`podgląd ${skad} → ${dokad} przestawia całą sekcję tras`, () => {
      sprawdz(podglad([skad, dokad]), dokad, skad);
    });

test('zgłoszony przypadek: ukraiński ekran, podgląd polskiego przed zapisem', () => {
  const stan = podglad(['uk', 'pl']);
  assert.equal(stan.opcjeNeptun[1], 'Przebyta trasa');
  assert.equal(stan.opcjeAdsb[0], 'Wyłączone (tylko śledzony samolot)');
  assert.ok(!CYRYLICA.test(JSON.stringify(stan)), 'w sekcji tras nie może zostać ani słowo po ukraińsku');
});

test('translateStatic i podgląd używają tego samego kodu sekcji', () => {
  // Gdyby sekcja wróciła do rozpisania osobno w obu miejscach, znów rozjechałyby się
  // przy najbliższej zmianie tekstu — to był powód usterki.
  const wywolania = (I18N.match(/trailSection\(/g) || []).length;
  assert.equal(wywolania, 3, 'trailSection ma być zadeklarowane raz i wołane z previewSettings i translateStatic');
  assert.ok(!/set\("#trail-head"/.test(I18N), 'nagłówek tras nie może być tłumaczony drugi raz obok trailSection');
});

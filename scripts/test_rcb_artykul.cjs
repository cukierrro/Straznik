// Treść artykułu gov.pl uzupełnia województwa, których nie niesie RSO — TRYB WBUDOWANY.
//
// Lustro scripts/test_rcb_artykul.py (serwer). Standalone czytał Alert RCB wyłącznie
// z RSO/TVP, a ten kanał niesie czasem tylko CZĘŚĆ odbiorców: 24.09.2026 komunikat
// poszedł „do odbiorców na terenie woj. podkarpackiego i lubelskiego", a punktowało
// się samo lubelskie; 17.09 tak samo przepadło podkarpackie. Tryb wbudowany działa
// wtedy, gdy serwera nie ma, więc musi zamykać tę samą dziurę co backend.
//
// Pułapki, które sprawdza ten test (te same co w wersji pythonowej):
//   * „(powiaty: puławski, opolski, …)" to POWIATY — nie wolno z nich robić woj. opolskiego,
//   * „Odwołano" ma „ł" bez rozkładu NFD — musi pasować do rdzenia odwołania,
//   * lead artykułu bywa samym cytatem, bez zdania o odbiorcach,
//   * meldunek zastany przy pierwszym otwarciu może być sprzed godzin,
//   * gov.pl pisze encjami HTML (&bdquo; &rdquo; &oacute;) — bez ich rozwinięcia
//     cudzysłów nie jest cudzysłowem i treść alertu w ogóle się nie znajduje.
//
// Uruchomienie: node scripts/test_rcb_artykul.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const MONITOR = 'UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. '
  + 'W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikat&oacute;w.';
const SCHRON = 'UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. '
  + 'Stosuj się do poleceń służb. Oczekuj dalszych komunikat&oacute;w.';
const KONIEC = 'UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.';

const TYTUL = 'Alert RCB - zagrożenie z powietrza (24.09)';
const LINK = '/web/rcb/alert-rcb---zagrozenie-z-powietrza-2409';
const LISTA = `<html><body><a href="${LINK}">${TYTUL}</a></body></html>`;
const ODBIORCY = 'Alert RCB został wysłany do odbiorc&oacute;w na terenie woj. podkarpackiego i lubelskiego.';
const BLOK_ALERT = `&bdquo;${MONITOR}&rdquo; ${ODBIORCY}`;
const BLOK_SCHRON = `&bdquo;${SCHRON}&rdquo; ${ODBIORCY}`;
const BLOK_KONIEC = `&bdquo;${KONIEC}&rdquo; Alert RCB o tej treści został wysłany do `
  + 'odbiorc&oacute;w na terenie wojew&oacute;dztwa lubelskiego.';
const SEP = ' --------------------------- ';

/* Nazwy województw prosto z engine.js — bez przepisywania ich do testu. */
function WOJEWODZTWA_Z_SILNIKA() {
  const src = fs.readFileSync(require('node:path').resolve(__dirname, '..', 'frontend/engine.js'), 'utf8');
  const m = /const VOIVODESHIPS = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'nie znalazłem VOIVODESHIPS w engine.js');
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}

// tablice z silnika żyją w osobnym kontekście vm — deepEqual porównuje prototypy
const tab = (x) => Array.from(x || []);

const stronaArtykulu = (bloki, data = '24.09.2026') =>
  `<html><body><nav>Menu gov.pl</nav><h1>${TYTUL}</h1> ${data} ${bloki}`
  + '<script>var x=1;</script><div>{"register":{"foo":"bar"}}</div></body></html>';

/* Świeży silnik na każdy scenariusz: kolektor trzyma stan przeczytanych artykułów
   w pamięci procesu, a testy sprawdzają właśnie zachowanie „pierwszego otwarcia".
   `rso` to żywe alerty RSO zastane w sygnałach — tak jak po starcie aplikacji. */
function swiezySilnik({ artykul, rso = [], teraz = '2026-09-24T12:00:00Z' }) {
  const storage = new Map();
  const zadania = [];
  const stan = { artykul };
  if (rso.length) storage.set('eng_signals', JSON.stringify(rso.map(([voiv, poziom = 1], i) => ({
    t: Date.parse('2026-09-24T11:55:00Z'), ts: '2026-09-24T11:55:00Z', source: 'rcb',
    event_type: 'rso_alert', voivodeship: voiv, points: 1.5,
    title: 'Alert RCB (RSO)', details: { rcb_level: poziom }, key: `rso:${i}:${voiv}` }))));
  const context = vm.createContext({
    console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
    window: {},
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [teraz])); }
      static now() { return Date.parse(teraz); }
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    fetch: async (url) => {
      zadania.push(url);
      return { ok: true, text: async () => url.endsWith('/web/rcb') ? LISTA : stan.artykul };
    },
  });
  vm.runInContext(fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
  const sygnaly = () => JSON.parse(storage.get('eng_signals') || '[]');
  // punktowane = to, co wnosi ARTYKUŁ; wpisy 0 pkt z samej listy (rcb_govpl) pomijamy
  const punktowane = () => sygnaly().filter(s => ['rcb_alert', 'rso_clear'].includes(s.event_type));
  return { Engine: context.TestEngine, stan, zadania, sygnaly, punktowane };
}

const P = swiezySilnik({ artykul: stronaArtykulu(BLOK_ALERT) }).Engine.rcbArtykul;

test('1. województwa z treści komunikatu', () => {
  const woj = (s) => tab(P.wojewodztwaAlertu(s));
  assert.deepEqual(
    woj(`„${MONITOR}” Alert RCB został wysłany do odbiorców na terenie `
      + 'woj. podkarpackiego i lubelskiego.'),
    ['podkarpackie', 'lubelskie'], 'dwa województwa z jednego zdania');
  assert.deepEqual(
    woj(`„${MONITOR}” Alert RCB o tej treści został wysłany do odbiorców na `
      + 'terenie województwa lubelskiego (powiaty: puławski, opolski, Lublin, lubelski, kraśnicki).'),
    ['lubelskie'], 'powiat opolski w nawiasie nie robi z alertu woj. opolskiego (21.09.2026)');
  assert.deepEqual(woj(`„${MONITOR}”`), [],
    'blok bez zdania o wysyłce nie zgaduje województw');
  assert.deepEqual(woj('wysłany do odbiorców na terenie woj. dolnośląskiego'),
    ['dolnośląskie'], 'dolnośląskie nie wpada jako śląskie');

  /* 25.09.2026: kotwicą było samo „wysłany", a RCB pisze też „zostały wysłane"
     i „wysłano" — liczby mnogiej używa WŁAŚNIE przy alercie dla kilku województw.
     Wtedy tryb awaryjny nie znajdował ani jednego odbiorcy i blok przepadał bez
     punktów, po cichu. Strona serwera ma to samo w test_wojewodztwa_alertu.py. */
  for (const czas of ['zostały wysłane do odbiorców', 'wysłano do odbiorców',
                      'został przekazany do odbiorców'])
    assert.deepEqual(woj(`Alert RCB o tej treści ${czas} na terenie województwa podkarpackiego.`),
      ['podkarpackie'], `forma „${czas}" też musi dawać odbiorcę`);

  /* …i zakres 260 znaków ucinał długą listę (16 nazw w dopełniaczu to ~290).
     Listę czytamy z PRODUKCYJNEGO engine.js, żeby test nie chwalił własnej kopii. */
  const wszystkie = WOJEWODZTWA_Z_SILNIKA();
  assert.equal(wszystkie.length, 16, `w engine.js jest ${wszystkie.length} województw zamiast 16`);
  const lista = wszystkie.map(v => v.slice(0, -2) + 'ego').join(', ');
  assert.deepEqual(
    woj(`Alert RCB został wysłany do odbiorców na terenie województw ${lista}.`).sort(),
    wszystkie.slice().sort(), 'lista wszystkich województw nie może się urwać');
});

test('2. poziom i odwołanie z treści', () => {
  const z = (t) => P.meldunkiArtykulu(`„${t}” wysłany do odbiorców na terenie woj. lubelskiego.`)[0];
  assert.equal(z(SCHRON.replace(/&oacute;/g, 'ó')).poziom, 3, '„znajdź bezpieczne miejsce” to 3. poziom');
  assert.equal(z(MONITOR.replace(/&oacute;/g, 'ó')).poziom, 1, '„sytuacja jest monitorowana” to 1. poziom');
  assert.ok(P.czyOdwolanieRcb('UWAGA! UWAGA! UWAGA! Odwołano zagrożenie atakiem z powietrza.'),
    '„Odwołano” rozpoznane mimo „ł” (13.09.2026)');
  assert.ok(P.czyOdwolanieRcb(KONIEC), '„zakończył się / brak zagrożenia” to odwołanie');
  assert.ok(!P.czyOdwolanieRcb(SCHRON), 'wezwanie do schronienia to nie odwołanie');
});

test('3. który blok jest najnowszy', () => {
  const tekst = P.tekstArtykuluRcb(
    stronaArtykulu(`&bdquo;${MONITOR}&rdquo; Aktualizacja! ${BLOK_ALERT}`), TYTUL);
  const m = P.najnowszyMeldunek(P.meldunkiArtykulu(tekst));
  assert.deepEqual(m && tab(m.wojewodztwa), ['podkarpackie', 'lubelskie'],
    'lead bez zdania o odbiorcach bierze listę z powtórzenia tej samej treści');
  const starszy = P.tekstArtykuluRcb(
    stronaArtykulu(`&bdquo;${SCHRON}&rdquo;${SEP}&bdquo;${MONITOR}&rdquo; `
      + 'wysłany do odbiorców na terenie woj. lubelskiego.'), TYTUL);
  assert.equal(P.najnowszyMeldunek(P.meldunkiArtykulu(starszy)), null,
    'gdy odbiorcy są tylko przy STARSZEJ treści, artykuł nic nie wnosi');
});

test('4. encje HTML gov.pl i odcięcie strony', () => {
  const tekst = P.tekstArtykuluRcb(stronaArtykulu(BLOK_ALERT), TYTUL);
  assert.ok(tekst.startsWith(TYTUL), 'tekst zaczyna się od tytułu, bez menu portalu');
  assert.ok(!tekst.includes('{"register"'), 'blok danych strony odcięty');
  assert.ok(!tekst.includes('var x=1'), '<script> wycięty');
  assert.ok(tekst.includes('komunikatów.”'), '&oacute; i &rdquo; rozwinięte');
  assert.equal(P.dataArtykuluRcb(tekst), '2026-09-24', 'data wpisu spod tytułu');
});

test('5. pierwszy obieg: bez żywego alertu RSO artykuł nie punktuje', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_ALERT) });
  await e.Engine.rcbArtykul.tickRcb();
  assert.deepEqual(e.punktowane(), [], 'zastany meldunek bez alertu w RSO nie daje punktów');
  assert.ok(e.sygnaly().some(s => s.event_type === 'rcb_art_seen'),
    '…ale zostaje ślad w sygnałach (0 pkt)');
  assert.ok(e.zadania.includes('https://www.gov.pl' + LINK), 'artykuł dnia został otwarty');
});

test('6. RSO potwierdza alert → artykuł dokłada brakujące województwo', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_ALERT), rso: [['lubelskie']] });
  await e.Engine.rcbArtykul.tickRcb();
  const p = e.punktowane();
  assert.deepEqual(p.map(s => s.voivodeship), ['podkarpackie'], 'punktuje samo podkarpackie');
  assert.equal(p[0].event_type, 'rcb_alert', 'typ rcb_alert — oficjalny w fuzji');
  assert.equal(p[0].points, 1.5, 'alert RCB 1. poziomu = 1,5 pkt');
  assert.equal(p[0].details.rcb_level, 1);
  await e.Engine.rcbArtykul.tickRcb();
  assert.equal(e.punktowane().length, 1, 'ten sam meldunek nie punktuje drugi raz');
});

test('7. aktualizacja artykułu na 3. poziom obejmuje oba województwa', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_ALERT), rso: [['lubelskie']] });
  await e.Engine.rcbArtykul.tickRcb();
  e.stan.artykul = stronaArtykulu(BLOK_SCHRON + SEP + BLOK_ALERT);
  await e.Engine.rcbArtykul.tickRcb();
  const nowe = e.punktowane().filter(s => s.points === 4.5);
  assert.deepEqual(nowe.map(s => s.voivodeship).sort(), ['lubelskie', 'podkarpackie'],
    'lubelskie też, bo RSO ma tam dopiero 1. poziom');
  assert.ok(nowe.every(s => s.details.rcb_level === 3), 'wezwanie do schronienia = 4,5 pkt');
});

test('8. odwołanie dopisane przy nas gasi alert', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_ALERT), rso: [['lubelskie']] });
  await e.Engine.rcbArtykul.tickRcb();
  e.stan.artykul = stronaArtykulu(BLOK_KONIEC + SEP + BLOK_ALERT);
  await e.Engine.rcbArtykul.tickRcb();
  const clears = e.punktowane().filter(s => s.event_type === 'rso_clear');
  assert.deepEqual(clears.map(s => s.voivodeship), ['lubelskie'], 'odwołanie dla lubelskiego');
  assert.ok(clears.every(s => s.points === 0), 'odwołanie nie dokłada punktów');
});

test('9. artykuł z innego dnia to sama historia', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_SCHRON, '17.09.2026'), rso: [['lubelskie']] });
  await e.Engine.rcbArtykul.tickRcb();
  assert.deepEqual(e.punktowane(), [],
    'wpis sprzed kilku dni nie punktuje, choćby wołał o schronienie');
  await e.Engine.rcbArtykul.tickRcb();
  assert.equal(e.zadania.filter(u => u.endsWith(LINK)).length, 1,
    'i nie jest otwierany po raz drugi — znamy już jego datę');
});

test('10. odwołanie zastane przy pierwszym otwarciu nie wycisza alertu', async () => {
  const e = swiezySilnik({ artykul: stronaArtykulu(BLOK_KONIEC + SEP + BLOK_ALERT), rso: [['lubelskie']] });
  await e.Engine.rcbArtykul.tickRcb();
  assert.deepEqual(e.punktowane(), [],
    'przy pierwszym czytaniu nie wiemy, czy odwołanie nie jest starsze');
});

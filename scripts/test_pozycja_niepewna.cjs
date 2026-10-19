// Pozycja niepewna na mapie i punkty w karcie obiektu (19.10.2026).
//
// Wieczorem 19.10 wokół Lwowa było na mapie do 9 ikon dronów naraz, z czego 11 z 16
// tropów to meldunki „w kierunku X” (pozycja rejonowa), a dokładne pozycje tylko
// cztery. Na mapie wyglądały tak samo. Od 1.7.99:
//   - ikona pozycji niepewnej: przygaszone wypełnienie i przerywany kontur w kolorze
//     typu (wariant C wybrany przez usera), osobny obraz dart-<typ>[-unk]-apx;
//   - karta obiektu: plakietka „pozycja potwierdzona / niepewna” i „Punkty teraz”
//     per województwo, a przy zerze — dlaczego (limit NEPTUN-a albo ten sam punkt);
//   - po dotknięciu obiektu jego okrąg niepewności jest wyraźny, pozostałe bledną.
// Punktacja się nie zmienia (przeliczone 11–19.10: zmiana dawała mało, a opóźniała
// czerwony alarm o 6–12 min).
//
// Uruchomienie: node scripts/test_pozycja_niepewna.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'frontend/i18n.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'frontend/engine.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'backend/app/config.py'), 'utf8');
let ok = 0;
const sprawdz = (warunek, opis) => { assert.ok(warunek, opis); ok++; };
const wycinek = (od, do_) => {
  const a = app.indexOf(od), b = app.indexOf(do_, a + 1);
  assert.ok(a >= 0 && b > a, `nie znaleziono wycinka ${od} … ${do_}`);
  return app.slice(a, b);
};

// 1. Ikony: osobne obrazy dla pozycji niepewnej i wyrażenie, które je wybiera.
sprawdz(/addImage\("dart-" \+ t \+ "-apx"/.test(app), 'obraz dart-<typ>-apx dla każdego typu');
sprawdz(/addImage\("dart-" \+ t \+ "-unk-apx"/.test(app), 'obraz dart-<typ>-unk-apx dla typów z kursem');
sprawdz(/\["case", \["==", \["get", "apx"\], true\], "-apx", ""\]/.test(app), 'icon-image dokleja -apx według właściwości apx');
sprawdz(/function makeThreatImage\(type, color, headingUnknown = false, approx = false\)/.test(app),
  'makeThreatImage ma tryb pozycji niepewnej');
// Obie ścieżki budowy znaczników (na żywo i historia) niosą apx i punkty.
sprawdz((app.match(/\.\.\.pozycjaIPunkty\(t, /g) || []).length === 2, 'apx i punkty na żywo i w historii');

// 2. Okręgi niepewności: tid w obu ścieżkach i wyróżnienie zaznaczonego.
sprawdz((app.match(/properties: \{ color: [^}]*tid: String\(t\.id \?\? ""\)/gs) || []).length >= 1
  && /color: \(TYPE_META\[t\.type\] \|\| \{\}\)\.color \|\| "#8a93a6",\s*tid: String\(t\.id \?\? ""\)/.test(app),
  'okrąg niepewności ma tid na żywo i w historii');
sprawdz(/okregiWybranego\(kind === "threat"/.test(app), 'markSelected wyróżnia okrąg wybranego obiektu');
{
  const pamiec = {};
  const ctx = { localStorage: { getItem: k => pamiec[k] ?? null },
    map: { getLayer: () => true, wywolania: [], filtr: undefined,
      setPaintProperty(l, k, v) { this.wywolania.push([l, k, v]); },
      setFilter(l, f) { this.filtr = f; } } };
  vm.createContext(ctx);
  vm.runInContext(wycinek('const OKRAG_KRYCIE =', '\nfunction showCard('), ctx);
  ctx.okregiWybranego('trk_7');
  const [, , krycie] = ctx.map.wywolania.find(w => w[1] === 'line-opacity');
  sprawdz(JSON.stringify(krycie) === JSON.stringify(['case', ['==', ['get', 'tid'], 'trk_7'], 0.95, 0.22]),
    'wybrany okrąg 0,95, pozostałe 0,22');
  ctx.map.wywolania = [];
  ctx.okregiWybranego(null);
  sprawdz(ctx.map.wywolania.find(w => w[1] === 'line-opacity')[2] === 0.85, 'po zamknięciu karty krycie wraca');

  // Które okręgi w ogóle rysujemy (czytelnik 19.10: okręgi zlewały się w plamę;
  // decyzja usera: domyślnie dotknięty + pozycja potwierdzona do 50 km od granicy).
  const widac = (filtr, f) => {
    if (filtr == null) return true;
    const ev = (e) => {
      const [op, ...a] = e;
      if (op === 'get') return f[a[0]];
      if (op === 'coalesce') { const v = ev(a[0]); return v ?? a[1]; }
      if (op === 'any') return a.some(ev);
      if (op === 'all') return a.every(ev);
      const x = Array.isArray(a[0]) ? ev(a[0]) : a[0], y = Array.isArray(a[1]) ? ev(a[1]) : a[1];
      return { '==': x === y, '!=': x !== y, '<=': x <= y }[op];
    };
    return ev(filtr);
  };
  sprawdz(ctx.okregiTryb() === 'granica', 'domyślny tryb: wybrany i przy granicy');
  const g = ctx.okregiFiltr('granica', 'wyb');
  sprawdz(widac(g, { tid: 'a', apx: false, dist_km: 37 }), 'pozycja potwierdzona 37 km od granicy — okrąg jest');
  sprawdz(!widac(g, { tid: 'b', apx: false, dist_km: 57 }), 'pozycja potwierdzona 57 km — bez okręgu');
  sprawdz(!widac(g, { tid: 'c', apx: true, dist_km: 9 }), 'pozycja niepewna nawet tuż przy granicy — bez okręgu');
  sprawdz(widac(g, { tid: 'wyb', apx: true, dist_km: 240 }), 'dotknięty obiekt — okrąg zawsze');
  sprawdz(!widac(g, { tid: 'd', apx: false, dist_km: null }), 'bez znanej odległości — bez okręgu');
  sprawdz(ctx.okregiFiltr('wszystkie', null) === null, '„Wszystkie” — bez filtra, jak do 1.7.98');
  sprawdz(!widac(ctx.okregiFiltr('off', 'wyb'), { tid: 'wyb' }), '„Wyłączone” — także bez okręgu dotkniętego');
  pamiec.straznik_okregi = 'wszystkie';
  sprawdz(ctx.okregiTryb() === 'wszystkie', 'tryb z pamięci telefonu');
  pamiec.straznik_okregi = 'cokolwiek';
  sprawdz(ctx.okregiTryb() === 'granica', 'nieznana wartość — domyślny');
  ctx.okregiWybranego('x');
  sprawdz(Array.isArray(ctx.map.filtr) && ctx.map.filtr[0] === 'any', 'zmiana wyboru ustawia filtr warstwy');
}
sprawdz(/apx: isApproxPosition\(t\), dist_km: t\.pl_assessment\?\.dist_km \?\? null/.test(app)
  && /tid: String\(t\.id \?\? ""\), apx: isApproxPosition\(t\),\s*dist_km: t\.pl_assessment\?\.dist_km \?\? null/.test(app),
  'okrąg niesie apx i odległość na żywo i w historii');
sprawdz(/<select id="set-okregi">/.test(html) && /okregiFiltr\(okregiTryb\(\), null\)/.test(app),
  'przełącznik w Ustawieniach → Mapa i filtr od startu mapy');
sprawdz(i18n.includes('"Selected and near the border": "Вибраний і біля кордону"')
  && i18n.includes('["Selected and near the border", "All", "Off"]'), 'przełącznik po angielsku i ukraińsku');

// 3. Lustra stałych: limit NEPTUN-a i waga pozycji niepewnej jak w serwerze i silniku.
sprawdz(/const NEPTUN_LIMIT_PKT = 8;/.test(app) && /neptun: 8\b/.test(engine) && /"neptun": 8\.0/.test(config),
  'limit NEPTUN-a 8 pkt w app.js, engine.js i config.py');
sprawdz(/const POZYCJA_WAGA = \{ source_approx: 0\.6, locality_center: 0\.5 \}/.test(app)
  && /source_approx: 0\.6, locality_center: 0\.5/.test(engine)
  && /"source_approx": 0\.6,\s*"locality_center": 0\.5/.test(config),
  'waga pozycji niepewnej jak NEPTUN_POSITION_MULT');

// 4. Punkty obiektu: dają, limit, ten sam punkt, wygasłe i fala pomijane.
const ctx = {
  UI: { t: (pl) => pl, voiv: (v) => v }, esc2: (s) => String(s),
  pktTxt: (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ','),
};
vm.createContext(ctx);
vm.runInContext(wycinek('const NEPTUN_LIMIT_PKT', '/* Właściwości znacznika'), ctx);
vm.runInContext(wycinek('function kartaPozycjaHTML(', '/* Karta samolotu'), ctx);
const sig = (tid, v, counted, points, weight = 1, extra = {}) => ({ source: 'neptun', voivodeship: v,
  counted_points: counted, points, weight, details: { track_id: tid, physical_key: `track:${tid}`, ...extra } });
const lubelskiePelne = [sig('a', 'lubelskie', 4.0, 4.0), sig('b', 'lubelskie', 4.0, 4.0)];
const sygnaly = [
  ...lubelskiePelne,
  sig('x', 'podkarpackie', 1.3, 1.3), sig('x', 'lubelskie', 0, 0.6),          // limit pełny
  sig('x', 'mazowieckie', 0.04, 0.04),                                        // wygasły, pomijamy
  sig('r1', 'podkarpackie', 0.5, 0.5, 1, { physical_key: 'area:uav:50.264:23.753' }),
  sig('r2', 'podkarpackie', 0, 0.4, 1, { physical_key: 'area:uav:50.264:23.753' }),
  { source: 'neptun', voivodeship: 'lubelskie', counted_points: 0.5, points: 0.5, details: { wave: true } },
];
const px = ctx.punktyObiektu('x', sygnaly);
sprawdz(JSON.stringify(px.daje) === JSON.stringify([{ v: 'podkarpackie', p: 1.3 }]), `daje: ${JSON.stringify(px.daje)}`);
sprawdz(JSON.stringify(px.zero) === JSON.stringify([{ v: 'lubelskie', why: 'limit' }]),
  `lubelskie z pełnym limitem → "limit" (fala się nie wlicza): ${JSON.stringify(px.zero)}`);
const pr = ctx.punktyObiektu('r2', sygnaly);
sprawdz(JSON.stringify(pr.zero) === JSON.stringify([{ v: 'podkarpackie', why: 'ten_sam' }]),
  `ten sam punkt rejonowy liczony z innego meldunku → "ten_sam": ${JSON.stringify(pr.zero)}`);
sprawdz(ctx.punktyObiektu('brak', sygnaly).daje.length === 0, 'obiekt bez sygnałów — pusto');

// 5. Karta: plakietka, punkty i powody zera.
const karta = (p) => ctx.kartaPozycjaHTML(p) + ctx.kartaPunktyHTML(p);
const k1 = karta({ apx: false, pkt: JSON.stringify(px) });
sprawdz(k1.includes('pozycja potwierdzona') && k1.includes('Punkty teraz:') && k1.includes('<b>podkarpackie 1,3</b>'),
  'karta pozycji potwierdzonej: plakietka i punkty');
sprawdz(k1.includes('lubelskie: nie dolicza punktów — limit NEPTUN-a (8 pkt) w województwie jest już pełny'),
  'karta podaje powód zera: limit');
sprawdz(!k1.includes('0 pkt'), 'zero opisane słowami, nie „0 pkt” (to zarezerwowane dla obiektu bez kursu na PL)');
const k2 = karta({ apx: 'true', apx_why: 'locality_center', pkt: JSON.stringify(pr) });
sprawdz(k2.includes('pozycja niepewna') && k2.includes('ten sam punkt liczy się już z innego meldunku'),
  'karta pozycji niepewnej: plakietka i powód „ten sam punkt”');
sprawdz(k2.includes('waży 50% pewnej'), 'waga środka miejscowości 50%');
sprawdz(karta({ apx: true, apx_why: 'source_approx', pkt: JSON.stringify(px) }).includes('waży 60% pewnej'),
  'waga meldunku kierunkowego 60%');
sprawdz(ctx.kartaPunktyHTML({}) === '' && ctx.kartaPunktyHTML({ pkt: '{"daje":[],"zero":[]}' }) === '',
  'bez danych o punktach wiersz znika');

// 5a. Obiekt-duch z historii nie ma oceny kursu: bez werdyktu „0 pkt — kurs nie prowadzi
// na Polskę”, który przeczył wierszowi punktów (zrzut 19.10.2026).
vm.runInContext(wycinek('function courseVerdictHTML(', '/* Plakietka pewności'), ctx);
sprawdz(ctx.courseVerdictHTML({ kurs_znany: false, toward_pl: false }) === '', 'duch z historii — bez werdyktu kursu');
sprawdz(ctx.courseVerdictHTML({ toward_pl: false, heading_known: true, course_off: 86 }).includes('0 pkt'),
  'zwykły obiekt mijający Polskę — werdykt jak dotąd');
sprawdz(/kurs_znany: t\.pl_assessment\?\.toward_pl !== undefined/.test(app), 'historia ustawia kurs_znany');

// 6. Legenda i tłumaczenia.
sprawdz(/data-type="uav" data-approx="1"><\/i><span>Pozycja niepewna<small>/.test(html), 'wpis w legendzie');
sprawdz(/el\.dataset\.approx === "1"/.test(app), 'legenda rysuje ikonę tymi samymi pikselami co mapa');
for (const [pl, en, uk] of [
  ['Pozycja niepewna', 'Uncertain position', 'Непевна позиція'],
  ['meldunek o kierunku lotu, nie namiar — liczy się słabiej', 'a report of the flight direction, not a fix — counts less',
    'повідомлення про напрямок польоту, а не координати — важить менше'],
]) {
  sprawdz(i18n.includes(`"${pl}": "${en}"`), `EN: ${pl}`);
  sprawdz(i18n.includes(`"${en}": "${uk}"`), `UK: ${en}`);
}

console.log(`OK: ${ok} asercji — ikona pozycji niepewnej, punkty i powody zera w karcie, okręgi wybranego, legenda PL/EN/UK`);

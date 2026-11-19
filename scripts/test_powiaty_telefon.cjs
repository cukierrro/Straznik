/* Powiat zapisanego miejsca liczony na telefonie (etap 3 alarmów powiatowych, 19.11.2026).

   Punkty z NIEUPROSZCZONYCH granic PRG (scripts/dane_testowe/powiaty_punkty.json,
   scripts/build_powiaty_telefon.py --punkty): przy granicach powiatów po obu stronach
   (5–300 m), w miastach na prawach powiatu i wokół nich, przy granicy państwa, losowo
   w całej Polsce i kilka nazwanych (Lublin wobec powiatu lubelskiego…).

   Pilnuje, że:
    1. prawdziwy powiat jest ZAWSZE na liście (inaczej alarm za mało);
    2. punkt dalej od granicy niż margines z zapasem dostaje dokładnie jeden powiat;
    3. przy granicy najwyżej garść powiatów (zwykle dwa), nie pół województwa;
    4. miejsce bez lokalizacji = wszystkie powiaty województwa; alarmy wyłączone = nic;
    5. plik granic jest tym, który opisuje generator (380 powiatów, 16 województw),
       ładowany tylko w aplikacji, a współrzędne nigdy nie trafiają do warstwy natywnej.

   Uruchomienie:  node scripts/test_powiaty_telefon.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const P = require(path.join(ROOT, 'frontend', 'powiaty.js'));
const dane = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'assets', 'powiaty-telefon-v1.json'), 'utf8'));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'dane_testowe', 'powiaty_punkty.json'), 'utf8'));

let bledy = 0;
function ok(w, opis) { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; }

console.log('1. Plik granic');
const tercs = Object.keys(dane.pow);
ok(tercs.length === 380, `380 powiatów (${tercs.length})`);
ok(new Set(Object.values(dane.pow).map(p => p.w)).size === 16, '16 województw');
ok(dane.margines_m > dane.uproszczenie_m + 20, `margines ${dane.margines_m} m > uproszczenie ${dane.uproszczenie_m} m z zapasem na zaokrąglenie i rzut`);
ok(/PRG GUGiK/.test(dane.zrodlo), 'źródło: PRG GUGiK');
ok(tercs.every(t => /^\d{4}$/.test(t) && dane.pow[t].r.length), 'TERYT 4 cyfry, każdy ma obrys');

console.log('\n2. Punkty z prawdziwych granic');
const t0 = Date.now();
let brak = [], nieJeden = [], maks = 0, dwa = 0, poGranicy = 0;
for (const [lat, lon, t, d, rodzaj, nazwa] of fx.punkty) {
  const z = P.znajdz(dane, lat, lon);
  if (!z.powiaty.includes(t)) brak.push(`${nazwa || rodzaj} ${lat},${lon} prawdziwy ${t}, wynik ${z.powiaty}`);
  // sąsiad uproszczony o `uproszczenie_m` może się przybliżyć do punktu właśnie o tyle
  if (d > dane.margines_m + dane.uproszczenie_m + 15 && z.powiaty.length !== 1) nieJeden.push(`${rodzaj} ${lat},${lon} ${t} d=${d} → ${z.powiaty}`);
  if (d <= dane.margines_m) { poGranicy++; if (z.powiaty.length > 1) dwa++; }
  maks = Math.max(maks, z.powiaty.length);
}
const ms = Date.now() - t0;
ok(brak.length === 0, `prawdziwy powiat zawsze na liście (${fx.punkty.length} punktów)` + (brak.length ? '\n       ' + brak.slice(0, 8).join('\n       ') : ''));
ok(nieJeden.length === 0, 'dalej od granicy niż margines + uproszczenie — dokładnie jeden powiat' + (nieJeden.length ? '\n       ' + nieJeden.slice(0, 8).join('\n       ') : ''));
ok(maks <= 4, `przy granicy najwyżej kilka powiatów (maks. ${maks}; ${dwa} z ${poGranicy} punktów w pasie granicy dostaje więcej niż jeden)`);
ok(ms / fx.punkty.length < 5, `szybko: ${(ms / fx.punkty.length).toFixed(2)} ms na punkt`);
for (const k of ['granica', 'miasto', 'wokol_miasta', 'losowy', 'nazwany'])
  ok(fx.punkty.some(p => p[4] === k), `w zestawie są punkty „${k}”`);

console.log('\n3. Nazwane miejsca');
const jeden = (lat, lon) => P.znajdz(dane, lat, lon).powiaty;
ok(JSON.stringify(jeden(51.24808, 22.56037)) === '["0663"]', 'Lublin, Plac Litewski → tylko Lublin (miasto na prawach powiatu, nie powiat lubelski)');
ok(P.nazwa(dane, '0663') === 'Lublin' && P.nazwa(dane, '0604') === 'powiat hrubieszowski', 'nazwy: „Lublin”, „powiat hrubieszowski”');
const swidnik = jeden(51.2198, 22.6962);
ok(swidnik.length === 1 && dane.pow[swidnik[0]].n === 'powiat świdnicki' && dane.pow[swidnik[0]].w === 'lubelskie',
  `Świdnik → powiat świdnicki w lubelskim, nie w dolnośląskim (${swidnik})`);
ok(jeden(52.2318, 21.006).length === 1 && dane.pow[jeden(52.2318, 21.006)[0]].n === 'powiat Warszawa', 'Warszawa');
ok(jeden(54.5, 18.6).length >= 1, 'Zatoka Gdańska przy brzegu — najbliższy powiat zamiast niczego');
ok(jeden(49.84, 24.03).length === 0, 'Lwów (poza Polską, daleko od granicy) — żadnego powiatu');
ok(jeden(52.52, 13.405).length === 0, 'Berlin — żadnego powiatu');
// wierzchołki uproszczonego obrysu Lublina leżą na PRAWDZIWEJ granicy (Douglas–Peucker
// zostawia oryginalne punkty): każdy musi dać Lublin i sąsiada
const lubR = P.przygotuj(dane).pow['0663']._r[0];
let lubZle = 0, zLubelskim = 0;
for (let i = 0; i < lubR.length; i += 2) {
  const z = P.znajdz(dane, lubR[i + 1] / dane.skala, lubR[i] / dane.skala).powiaty;
  if (!z.includes('0663') || z.length < 2) lubZle++;
  if (z.includes('0609')) zLubelskim++;
}
ok(lubZle === 0 && zLubelskim > lubR.length / 4,
  `na samej granicy Lublina — Lublin i sąsiad (${lubR.length / 2} punktów, z powiatem lubelskim ${zLubelskim})`);

console.log('\n4. Miejsca → tematy');
const miejsca = [
  { name: 'Dom', precision: 'gps', region: 'lubelskie', gps: { lat: 51.24808, lon: 22.56037 }, alerts: true },
  { name: 'Praca', precision: 'gps', region: 'lubelskie', gps: { lat: 51.2198, lon: 22.6962 }, alerts: true },
  { name: 'Działka', precision: 'gps', region: 'podkarpackie', gps: { lat: 50.0376, lon: 22.0046 }, alerts: false },
];
ok(JSON.stringify(P.powiatyMiejsc(dane, miejsca)) === JSON.stringify([swidnik[0], '0663'].sort()),
  'dwa miejsca z alarmami → dwa powiaty; miejsce bez alarmów pominięte');
const woj = P.powiatyMiejsc(dane, [{ name: 'Rodzice', precision: 'region', region: 'podlaskie', gps: null, alerts: true }]);
ok(woj.length === tercs.filter(t => dane.pow[t].w === 'podlaskie').length && woj.every(t => t.startsWith('20')),
  `miejsce bez lokalizacji → wszystkie ${woj.length} powiaty województwa`);
const zagranica = P.powiatyMiejsc(dane, [{ name: 'Lwów', precision: 'gps', region: 'podkarpackie', gps: { lat: 49.84, lon: 24.03 }, alerts: true }]);
ok(zagranica.length && zagranica.every(t => t.startsWith('18')), 'miejsce poza Polską → województwo wybrane przy miejscu');
ok(P.powiatyMiejsc(dane, []).length === 0 && P.powiatyMiejsc(null, miejsca).length === 0, 'bez miejsc / bez granic — pusta lista');
const opis = P.opisMiejsca(dane, miejsca[0]);
ok(opis && !opis.caleWojewodztwo && opis.powiaty[0] === 'Lublin', 'opis miejsca: „Lublin”');
ok(P.opisMiejsca(dane, { precision: 'region', region: 'lubelskie' }).caleWojewodztwo, 'opis miejsca bez lokalizacji: całe województwo');

console.log('\n5. Prywatność i ładowanie');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'frontend', 'index.html'), 'utf8');
ok(/powiaty\.js\?v=/.test(idx), 'index.html ładuje powiaty.js z kluczem wersji');
ok(/powiaty-telefon-v1\.json/.test(app), 'app.js czyta granice z assets (w paczce aplikacji)');
const wywolania = app.match(/setObservedVoivodeships\(\{[^}]*\}\)/g) || [];
ok(wywolania.length > 0 && wywolania.every(w => !/gps|lat|lon/.test(w)),
  'do warstwy natywnej idą tylko numery powiatów — bez współrzędnych');

console.log();
if (bledy) { console.log(`BŁĘDY: ${bledy}`); process.exit(1); }
console.log('Wszystko OK');

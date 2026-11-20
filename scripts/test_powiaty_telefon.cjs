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
/* Decyzja usera 19.11.2026: miejsca bez dokładnej lokalizacji NIE dostają powiatów całego
   województwa i powiatu nie zgadujemy. Dopóki choć jedno miejsce z alarmami nie ma powiatu,
   telefon zostaje przy województwach (pusta lista → warstwa natywna nie przechodzi). */
const rodzice = { name: 'Rodzice', precision: 'region', region: 'podlaskie', gps: null, alerts: true };
const plan1 = P.planPowiatow(dane, [rodzice]);
ok(plan1.powiaty.length === 0 && plan1.bezPowiatu.length === 1 && plan1.bezPowiatu[0].powod === 'bez_lokalizacji',
  'miejsce z zakresem „Województwo” — żadnego powiatu, powód „bez lokalizacji” (nie całe województwo)');
ok(P.powiatyMiejsc(dane, [rodzice]).length === 0, 'samo takie miejsce — pusta lista (telefon na województwach)');
ok(P.powiatyMiejsc(dane, [...miejsca, rodzice]).length === 0,
  'dwa miejsca z lokalizacją + jedno bez — CAŁY telefon zostaje na województwach (żadne miejsce nie traci alarmów)');
const legacy = { id: 'legacy-home', name: 'Dom', precision: 'region', region: 'lubelskie', gps: null, alerts: true };
ok(P.planPowiatow(dane, [legacy]).bezPowiatu[0]?.powod === 'bez_lokalizacji', 'miejsce przeniesione ze starej wersji (legacy-home) — bez powiatu');
ok(P.planPowiatow(dane, [{ ...rodzice, alerts: false }]).bezPowiatu.length === 0
  && JSON.stringify(P.powiatyMiejsc(dane, [...miejsca, { ...rodzice, alerts: false }])) === JSON.stringify([swidnik[0], '0663'].sort()),
  'miejsce bez lokalizacji, ale bez alarmów — nie blokuje przejścia');
const zagranica = P.planPowiatow(dane, [{ name: 'Lwów', precision: 'gps', region: 'podkarpackie', gps: { lat: 49.84, lon: 24.03 }, alerts: true }]);
ok(zagranica.powiaty.length === 0 && zagranica.bezPowiatu[0].powod === 'poza_polska', 'pozycja poza Polską — bez powiatu, nie województwo wybrane przy miejscu');
// pozycja przybliżona: promień dokładności jest marginesem — prawdziwy powiat zawsze na liście
const lubR2 = P.przygotuj(dane).pow['0663']._r[0];
const naGr = { lat: lubR2[1] / dane.skala, lon: lubR2[0] / dane.skala };
const przybl = P.powiatMiejsca(dane, { precision: 'gps', gps: { ...naGr, accuracy: 1500 }, alerts: true });
ok(przybl.powiaty.includes('0663') && przybl.powiaty.length >= 2, `pozycja z dokładnością 1,5 km przy granicy Lublina — wszystkie powiaty w promieniu (${przybl.powiaty})`);
let zle = 0;
for (const [lat, lon, t, d] of fx.punkty.slice(0, 3000)) {
  const z = P.powiatMiejsca(dane, { precision: 'gps', gps: { lat, lon, accuracy: 900 }, alerts: true }).powiaty;
  if (!z.includes(t)) zle++;
}
ok(zle === 0, 'dokładność 900 m: prawdziwy powiat zawsze na liście (3000 punktów z prawdziwych granic)');
ok(P.powiatMiejsca(dane, { precision: 'gps', gps: { lat: 51.24808, lon: 22.56037, accuracy: P.DOKLADNOSC_MAX_M + 1 }, alerts: true }).powod === 'przyblizona',
  `dokładność gorsza niż ${P.DOKLADNOSC_MAX_M} m (lokalizacja „przybliżona” systemu) — bez powiatu`);
ok(P.powiatyMiejsc(dane, []).length === 0 && P.powiatyMiejsc(null, miejsca).length === 0, 'bez miejsc / bez granic — pusta lista');
const opis = P.opisMiejsca(dane, miejsca[0]);
ok(opis && !opis.powod && opis.powiaty[0] === 'Lublin', 'opis miejsca: „Lublin”');
ok(P.opisMiejsca(dane, { precision: 'region', region: 'lubelskie' }).powod === 'bez_lokalizacji', 'opis miejsca bez lokalizacji: powód, bez powiatów');
const appSrc = fs.readFileSync(path.join(ROOT, 'frontend', 'powiaty.js'), 'utf8');
ok(!/p\.w === pl\.region/.test(appSrc), 'w powiaty.js nie ma już dopinania wszystkich powiatów województwa');

console.log('\n5. Prywatność i ładowanie');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'frontend', 'index.html'), 'utf8');
ok(/powiaty\.js\?v=/.test(idx), 'index.html ładuje powiaty.js z kluczem wersji');
ok(/powiaty-telefon-v1\.json/.test(app), 'app.js czyta granice z assets (w paczce aplikacji)');
const wywolania = app.match(/setObservedVoivodeships\(\{[^}]*\}\)/g) || [];
ok(wywolania.length > 0 && wywolania.every(w => !/gps|lat|lon/.test(w)),
  'do warstwy natywnej idą tylko numery powiatów — bez współrzędnych');

console.log('\n6. Otwarta aplikacja na torze powiatów');
// wykonujemy powiatyWStanie z app.js z podstawionym otoczeniem
const mPws = app.match(/function powiatyWStanie\(\) \{[\s\S]*?\n\}/);
ok(!!mPws, 'app.js: powiatyWStanie');
if (mPws) {
  const pws = (tor, standalone, pw) => new Function('torTematow', 'standalone', 'powiatyDoTematow', 'state', 'granicePowiatow',
    mPws[0] + '\nreturn powiatyWStanie();')(() => tor, standalone, () => ['0663', '0617'], { fusion: { powiaty: pw } }, dane);
  ok(pws('woj', false, {}) === null, 'tor województw — alarm z poziomów województw jak dotąd');
  ok(pws('pow', true, {}) === null, 'tryb wbudowany (engine.js liczy tylko województwa) — z powrotem na województwa, nie cisza');
  const l = pws('pow', false, { '0663': { level: 'high', score: 4.5, woj: 'lubelskie' }, '1863': { level: 'high', score: 5, woj: 'podkarpackie' } });
  ok(l && l.length === 2 && l.find(p => p.terc === '0663').level === 'high' && l.find(p => p.terc === '0617').level === 'none'
    && !l.some(p => p.terc === '1863'), 'tor powiatów — tylko powiaty miejsc; brak w słowniku = spokój; obcy powiat pominięty');
}

const mLinia = app.match(/function liniaBezPowiatu\(lang = UI\.lang\) \{[\s\S]*?\n\}/);
ok(!!mLinia, 'app.js: wiersz o miejscach bez dokładnej lokalizacji');
if (mLinia) {
  const linia = (tor, places, lang) => new Function('torTematow', 'granicePowiatow', 'Powiaty', 'alertsOff', 'savedPlaces', 'esc', 'UI',
    mLinia[0] + '\nreturn liniaBezPowiatu;')(() => tor, dane, P, () => false, places, x => x, { lang: 'pl' })(lang);
  const zRodzicami = [...miejsca, { ...rodzice, name: 'Rodzice' }];
  ok(linia('pow', zRodzicami, 'pl').includes('Rodzice') && linia('pow', zRodzicami, 'pl').includes('alarmy dla województw'),
    'tor powiatów + miejsce bez lokalizacji: wiersz wymienia je i mówi, że alarmy idą dla województw');
  ok(linia('pow', zRodzicami, 'en').startsWith('County alerts') && linia('pow', zRodzicami, 'uk').startsWith('Тривоги для повітів'),
    'wiersz po angielsku i ukraińsku');
  ok(linia('woj', zRodzicami, 'pl') === '' && linia('pow', miejsca, 'pl') === '',
    'bez wiersza: tor województw albo wszystkie miejsca z powiatem');
  ok(!/(?:ałeś|ałaś|eś |aś )/.test(linia('pow', zRodzicami, 'pl')), 'tekst bezosobowy');
}

console.log('\n7. Powiat wybrany ręcznie (opcja a, decyzja usera 20.11.2026)');
const Places = require(path.join(ROOT, 'frontend', 'places.js'));
const pam = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
// zapis i odczyt
const zWyborem = Places.clean({ id: 'r1', name: 'Rodzice', precision: 'region', region: 'lubelskie', alerts: true, powiat: '0609' });
ok(zWyborem.powiat === '0609', 'clean: powiat z województwa miejsca zostaje');
ok(!('powiat' in Places.clean({ ...zWyborem, powiat: '1863' })), 'clean: powiat z innego województwa przepada (Rzeszów przy lubelskim)');
ok(!('powiat' in Places.clean({ ...zWyborem, powiat: '06x9' })) && !('powiat' in Places.clean({ ...zWyborem, powiat: 609 })), 'clean: tylko 4 cyfry TERYT');
ok(!('powiat' in Places.clean({ ...zWyborem, powiat: '' })), 'clean: bez wyboru — dawny kształt miejsca, bez pola');
const s1 = pam();
Places.save(s1, [zWyborem]);
ok(Places.load(s1)[0].powiat === '0609', 'zapis na urządzeniu i odczyt zachowują wybór');
ok(!JSON.parse(s1.getItem(Places.KEY))[0].gps, 'zapisany wybór nie dokłada współrzędnych');
const s2 = pam(); s2.setItem('straznik_voiv', 'lubelskie');
const mig = Places.migrate(s2);
ok(mig.length === 1 && !('powiat' in mig[0]) && P.planPowiatow(dane, mig).bezPowiatu.length === 1,
  'migracja starego „Dom” (samo województwo) — bez powiatu, telefon zostaje na województwach');
ok(Places.migrate(s1)[0].powiat === '0609', 'już zapisane miejsca z wyborem — migracja ich nie rusza');
// pierwszeństwo: dokładna lokalizacja wypełnia powiat sama
const reczny = P.powiatMiejsca(dane, zWyborem);
ok(reczny.zrodlo === 'reczny' && JSON.stringify(reczny.powiaty) === '["0609"]', 'miejsce bez współrzędnych — powiat z wyboru');
const gpsIWybor = { ...miejsca[0], powiat: '0609' };   // GPS Plac Litewski (Lublin) + ręcznie lubelski
ok(JSON.stringify(P.powiatMiejsca(dane, gpsIWybor).powiaty) === '["0663"]' && P.powiatMiejsca(dane, gpsIWybor).zrodlo === 'gps',
  'dokładna lokalizacja ma pierwszeństwo przed wyborem ręcznym');
const przyGranicy = P.powiatMiejsca(dane, { precision: 'gps', region: 'lubelskie', gps: { ...naGr, accuracy: 10 }, powiat: '0609' });
ok(przyGranicy.zrodlo === 'gps' && przyGranicy.powiaty.length >= 2, `GPS przy granicy — oba powiaty jak dotąd, wybór nie zawęża (${przyGranicy.powiaty})`);
ok(P.powiatMiejsca(dane, { ...gpsIWybor, gps: { ...gpsIWybor.gps, accuracy: 5000 } }).zrodlo === 'reczny',
  'pozycja zbyt przybliżona — liczy się wybór ręczny');
ok(P.powiatMiejsca(dane, { ...zWyborem, region: 'podkarpackie' }).powod === 'bez_lokalizacji',
  'wybór z innego województwa niż miejsce — ignorowany (nie zgadujemy)');
// tor tematów
ok(JSON.stringify(P.powiatyMiejsc(dane, [...miejsca, zWyborem])) === JSON.stringify(['0609', '0617', '0663']),
  'wszystkie miejsca z powiatem (GPS + wybór) — telefon może przejść na powiaty');
ok(P.powiatyMiejsc(dane, [...miejsca, zWyborem, { ...rodzice, name: 'Działka' }]).length === 0,
  'jedno miejsce bez wyboru — dalej województwa');
// lista do wyboru
const lub = P.listaPowiatow(dane, 'lubelskie', 'pl');
ok(lub.length === tercs.filter(t => dane.pow[t].w === 'lubelskie').length, `lista lubelskiego: wszystkie ${lub.length} powiaty z PRG`);
const iLublin = lub.findIndex(p => p.terc === '0663'), iLubelski = lub.findIndex(p => p.terc === '0609');
ok(lub[iLublin].etykieta === 'Lublin (miasto)' && lub[iLubelski].etykieta === 'powiat lubelski' && Math.abs(iLublin - iLubelski) === 1,
  '„Lublin (miasto)” tuż obok „powiat lubelski”');
const en = P.listaPowiatow(dane, 'lubelskie', 'en'), uk = P.listaPowiatow(dane, 'lubelskie', 'uk');
ok(en.find(p => p.terc === '0663').etykieta === 'Lublin (city)' && en.find(p => p.terc === '0609').etykieta === 'Lubelski County',
  'EN: „Lublin (city)”, „Lubelski County”');
ok(uk.find(p => p.terc === '0663').etykieta === 'Lublin (місто)' && uk.find(p => p.terc === '0609').etykieta === 'повіт lubelski',
  'UK: „Lublin (місто)”, „повіт lubelski”');
const wszystkie = Places.REGIONS.flatMap(r => P.listaPowiatow(dane, r, 'pl'));
ok(wszystkie.length === 380 && new Set(wszystkie.map(p => p.terc)).size === 380, 'listy 16 województw obejmują wszystkie 380 powiatów, każdy raz');
ok(wszystkie.filter(p => p.miasto).length === 66, `66 miast na prawach powiatu oznaczonych „(miasto)” (${wszystkie.filter(p => p.miasto).length})`);
ok(Places.REGIONS.every(r => P.listaPowiatow(dane, r).every(p => p.terc.slice(0, 2) === Places.REGION_KOD[r])),
  'kody województw w places.js zgodne z TERYT w PRG');
// formularz
ok(/<div id="place-powiat-row" hidden><label id="place-powiat-l">/.test(idx)
  && (idx.match(/<form[^>]*>[\s\S]*?<\/form>/g) || []).some(f => f.includes('place-powiat')),
  'index.html: pole powiatu w <div> — nie przesuwa tłumaczeń etykiet formularza po kolejności');
ok(/function draftFromForm\(\)\{[^\n]*powiat\}\);\}/.test(app), 'app.js: zapis miejsca niesie wybrany powiat');
ok(/sel\.disabled=true; sel\.value=z\.powiaty\.length===1/.test(app), 'app.js: dokładna lokalizacja wypełnia i blokuje pole');
ok(/data-akcja="wybierz-powiat"/.test(app) && /closest\?\.\('\[data-akcja="wybierz-powiat"\]'\)[\s\S]{0,200}openPlaces\(\)/.test(app),
  'app.js: wiersz w Ustawieniach prowadzi do wyboru powiatu');
for (const [jez, wz] of [['pl', /wybierz powiat/i], ['en', /choose a county/i], ['uk', /виберіть повіт/i]])
  ok(wz.test(app), `app.js: podpowiedź wyboru po ${jez}`);

console.log();
if (bledy) { console.log(`BŁĘDY: ${bledy}`); process.exit(1); }
console.log('Wszystko OK');

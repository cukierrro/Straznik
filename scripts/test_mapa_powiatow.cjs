/* Mapa powiatów (wydanie 1.8.10, decyzja usera 21.11.2026).

   Alarmy przychodzą dla powiatu, więc mapa umie pokazać powiaty zamiast województw
   (Ustawienia → Mapa → „Podział mapy”, domyślnie powiaty, także na stronie), dotknięcie
   powiatu otwiera jego kartę, wiersz „mój region” pokazuje powiaty moich miejsc, a historia
   koloruje powiaty z migawek (od 21.11.2026).

   Pilnuje:
    1. pliku granic do rysowania: 380 powiatów, te same TERYT i województwa co plik telefonu,
       rozmiar w budżecie;
    2. updatePowStates — powiat, który zniknął ze stanu, wraca do „brak” (inaczej zostałby
       czerwony po końcu alarmu);
    3. applyPodzialMapy — przełącznik, tryb wbudowany i brak pliku granic → województwa;
    4. nazw powiatów (miasto / powiat, EN z wielkiej litery);
    5. historii: migawka bez pola `powiaty` (sprzed zmiany) ≠ migawka z pustym słownikiem;
    6. ustawienia i tłumaczeń PL/EN/UK.

   Wykonuje PRAWDZIWE funkcje z frontend/app.js (wycięte ze źródła) na atrapach.

   Uruchomienie:  node scripts/test_mapa_powiatow.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'frontend', 'index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'frontend', 'i18n.js'), 'utf8');
const plikMapy = path.join(ROOT, 'frontend', 'assets', 'powiaty-mapa-v1.geojson');
const mapa = JSON.parse(fs.readFileSync(plikMapy, 'utf8'));
const telefon = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'assets', 'powiaty-telefon-v1.json'), 'utf8'));

let bledy = 0;
function ok(w, opis) { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; }

console.log('1. Plik granic do rysowania');
const tercy = mapa.features.map(f => f.properties.t);
ok(mapa.features.length === 380 && new Set(tercy).size === 380, `380 różnych powiatów (${mapa.features.length})`);
ok(tercy.every(t => telefon.pow[t] && telefon.pow[t].w === mapa.features.find(f => f.properties.t === t).properties.w),
  'te same TERYT i województwa co plik telefonu');
ok(mapa.features.every(f => /^(Multi)?Polygon$/.test(f.geometry.type) && f.properties.k), 'wielokąty i nazwa krótka w każdym');
const kb = fs.statSync(plikMapy).size / 1024;
ok(kb < 800, `rozmiar ${Math.round(kb)} KB < 800 KB (strona pobiera go przy każdym pierwszym wejściu)`);
ok(new RegExp('powiaty-mapa-v1\\.geojson\\?v=').test(app), 'plik ładowany z wersją w adresie (cache przeglądarki)');

// ── wycięcie funkcji ze źródła ────────────────────────────────────────────────
const od = app.indexOf('const PODZIAL_KEY');
const doK = app.indexOf('let granicePowiatow = null');
ok(od > 0 && doK > od, 'blok mapy powiatów stoi przed granicePowiatow');
const blok = app.slice(od, doK);

function srodowisko({ podzial = 'pow', standalone = false, geo = true, isApp = false, moje = [] } = {}) {
  const stany = new Map(), widocznosc = {}, filtry = {};
  const warstwy = new Set(['voiv-extrude', 'pow-extrude', 'pow-line', 'my-pow', 'my-pow-glow', 'my-voiv', 'my-voiv-glow']);
  const map = {
    getSource: id => (id === 'pow' ? {} : null),
    getLayer: id => (warstwy.has(id) ? {} : null),
    setFeatureState: (k, v) => stany.set(k.id, v),
    setLayoutProperty: (id, p, v) => { widocznosc[id] = v; },
    setFilter: (id, f) => { filtry[id] = f; },
  };
  const ls = new Map(podzial ? [['straznik_mapa_podzial', podzial]] : []);
  const localStorage = { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) };
  const UI = { lang: 'pl', t(pl, en, uk) { return this.lang === 'en' ? en : this.lang === 'uk' ? uk : pl; } };
  const powGeoDane = geo ? mapa : null;
  const fn = new Function('map', 'mapReady', 'localStorage', 'UI', 'standalone', 'IS_APP', 'powiatyDoTematow', 'powGeoStart',
    `${blok}
     powGeo = powGeoStart;
     return { updatePowStates, applyPodzialMapy, podzialMapy, mapaPowiatow, nazwaPowiatuMapy,
              get powStanyMapy() { return powStanyMapy; } };`);
  const api = fn(map, true, localStorage, UI, standalone, isApp, () => moje, powGeoDane);
  return { api, stany, widocznosc, filtry, UI };
}

console.log('\n2. Stan brył powiatów');
let s = srodowisko();
s.api.updatePowStates({ '0663': { level: 'high', score: 5.2 }, '0604': { level: 'elevated', score: 11 } });
ok(s.stany.get('0663').level === 'high' && s.stany.get('0663').score === 5.2, 'Lublin czerwony, 5,2 pkt');
ok(s.stany.get('0604').score === 8, 'wysokość przycięta do 8 pkt jak u województw');
s.api.updatePowStates({ '0604': { level: 'elevated', score: 2.4 } });
ok(s.stany.get('0663').level === 'none' && s.stany.get('0663').score === 0, 'Lublin, który zniknął ze stanu, wraca do „brak”');
s.api.updatePowStates(undefined);
ok(s.stany.get('0604').level === 'none' && s.api.powStanyMapy.size === 0, 'brak słownika (cisza) — wszystko gaśnie');

console.log('\n3. Przełącznik podziału');
s = srodowisko({ podzial: null });
s.api.applyPodzialMapy();
ok(s.api.podzialMapy() === 'pow' && s.widocznosc['pow-extrude'] === 'visible' && s.widocznosc['voiv-extrude'] === 'none',
  'domyślnie powiaty: bryły powiatów widoczne, województw ukryte');
s = srodowisko({ podzial: 'woj' });
s.api.applyPodzialMapy();
ok(s.widocznosc['pow-extrude'] === 'none' && s.widocznosc['pow-line'] === 'none' && s.widocznosc['voiv-extrude'] === 'visible',
  '„Województwa” — jak do 1.8.09');
s = srodowisko({ standalone: true });
s.api.applyPodzialMapy();
ok(s.widocznosc['voiv-extrude'] === 'visible' && !s.api.mapaPowiatow(), 'tryb wbudowany (bez serwera) — województwa');
s = srodowisko({ geo: false });
s.api.applyPodzialMapy();
ok(s.widocznosc['voiv-extrude'] === 'visible', 'plik granic się nie wczytał — województwa');
s = srodowisko({ isApp: true, moje: ['0663', '1862'] });
s.api.applyPodzialMapy();
ok(s.widocznosc['my-pow'] === 'visible' && s.widocznosc['my-voiv'] === 'none'
   && JSON.stringify(s.filtry['my-pow']) === JSON.stringify(['in', ['get', 't'], ['literal', ['0663', '1862']]]),
  'aplikacja z powiatami miejsc — obrys moich powiatów zamiast województwa');
s = srodowisko({ isApp: false });
s.api.applyPodzialMapy();
ok(s.widocznosc['my-pow'] === 'none' && s.widocznosc['my-voiv'] === 'visible', 'strona — obrys województwa jak dotąd');

console.log('\n4. Nazwy');
s = srodowisko();
ok(s.api.nazwaPowiatuMapy('0663') === 'Lublin', 'miasto na prawach powiatu: „Lublin”');
ok(s.api.nazwaPowiatuMapy('0610') === 'powiat łęczyński', 'powiat ziemski: „powiat łęczyński”');
s.UI.lang = 'en';
ok(s.api.nazwaPowiatuMapy('0610') === 'Łęczyński County', 'EN: „Łęczyński County” (z wielkiej litery)');
s.UI.lang = 'uk';
ok(s.api.nazwaPowiatuMapy('0610') === 'повіт łęczyński', 'UK: „повіт łęczyński” (nazwa własna po polsku, jak na mapie)');

console.log('\n5. Historia');
ok(/powHistoria = snap && Object\.prototype\.hasOwnProperty\.call\(snap, "powiaty"\) \? \(snap\.powiaty \|\| \{\}\) : null;\s*updatePowStates\(powHistoria \|\| \{\}\);/.test(app),
  'migawka bez pola `powiaty` → null (karta: brak zapisu), z polem → kolory z tamtej chwili');
ok(/powiaty: s\?\.fusion\?\.powiaty \|\| \{\}/.test(app), 'migawki nagrywane w aplikacji też niosą powiaty (pole zawsze)');
ok(/histMode \? powHistoria : \(state\?\.fusion\?\.powiaty \|\| \{\}\)/.test(app), 'karta powiatu w historii czyta migawkę, nie stan na żywo');

console.log('\n5a. Wiersz „mój region”: który powiat (zgłoszenie usera 21.11.2026)');
{
  const od2 = app.indexOf('function wybierzPowiatBanera(');
  const do2 = app.indexOf('/* Powiaty miejsc z alarmami w kolejności miejsc');
  ok(od2 > 0 && do2 > od2, 'funkcja wyboru stoi w app.js');
  const wybierz = new Function(app.slice(od2, do2) + '\nreturn wybierzPowiatBanera;')();
  // kolejność miejsc usera: Dom (Lublin), …, piąte — biłgorajski; lista z TERYT posortowana
  const kolejnosc = ['0663', '1465', '1862', '1809', '0602', '0619', '2661', '1863'];
  const spokoj = ['0602', '0619', '0663', '1465', '1809', '1862', '1863', '2661'].map(t => ({ terc: t, level: 'none', score: 0 }));
  ok(wybierz(spokoj, kolejnosc).terc === '0663', 'spokój — powiat pierwszego miejsca (Lublin), nie pierwszy po TERYT (biłgorajski)');
  const ponizej = spokoj.map(p => p.terc === '0602' ? { ...p, score: 1.4 } : p);
  ok(wybierz(ponizej, kolejnosc).terc === '0663', 'punkty poniżej progu gdzie indziej nie zabierają wiersza pierwszemu miejscu');
  const zolty = spokoj.map(p => p.terc === '0602' ? { ...p, level: 'elevated', score: 2.4 } : p);
  ok(wybierz(zolty, kolejnosc).terc === '0602', 'żółty w biłgorajskim — wiersz pokazuje biłgorajski');
  const dwa = spokoj.map(p => p.terc === '1862' ? { ...p, level: 'high', score: 4.5 } : p.terc === '1809' ? { ...p, level: 'high', score: 6 } : p);
  ok(wybierz(dwa, kolejnosc).terc === '1809', 'dwa czerwone — ten z większą liczbą punktów');
  const remis = spokoj.map(p => ['1862', '1809'].includes(p.terc) ? { ...p, level: 'high', score: 5 } : p);
  ok(wybierz(remis, kolejnosc).terc === '1862', 'remis — wcześniejsze miejsce (Przemyśl przed lubaczowskim)');
  ok(wybierz(spokoj, []).terc === '0602', 'bez kolejności miejsc (granice niewczytane) — pierwszy z listy, bez błędu');
  ok(/b class="pow-nazwa">\$\{esc\(wielkaPierwsza\(nazwaPowiatuMapy/.test(app), 'nazwa: „Powiat biłgorajski” (wielka tylko pierwsza litera)');
  ok(/#my-banner b\.pow-nazwa \{ text-transform: none; \}/.test(fs.readFileSync(path.join(ROOT, 'frontend', 'style.css'), 'utf8')),
    'styl wiersza nie robi „Powiat Biłgorajski”');
  ok(/\$\{pkt > 0 \? " · " : "· "\}/.test(app), 'kropka między poziomem a liczbą powiatów także przy 0 pkt');
}

console.log('\n5b. Start bez „mignięcia” województw (zgłoszenie usera 22.11.2026)');
{
  const pobranie = app.indexOf('const powGeoPobranie = fetch("assets/powiaty-mapa-v1.geojson');
  const mapaStart = app.indexOf('async function initMap(');
  ok(pobranie > 0 && pobranie < mapaStart, 'plik granic mapy pobierany przy starcie skryptu, przed tworzeniem mapy');
  ok(/const gj = await powGeoPobranie;/.test(app), 'warstwa korzysta z pobranego zawczasu pliku');
  const liniaWoj = app.indexOf('id: "voiv-line", type: "line", source: "voiv"');
  const wolanie = app.indexOf('dodajWarstwePowiatow();', liniaWoj);
  const gotowa = app.indexOf('mapReady = true;', liniaWoj);
  ok(liniaWoj > 0 && wolanie > liniaWoj && wolanie < gotowa, 'warstwa powiatów dokładana zaraz po liniach województw, przed mapReady');
  const gr = app.indexOf('wczytajGranicePowiatow().then(() => {\n  try { if (state && !histMode) renderPanel();');
  const odlozone = app.indexOf('setTimeout(async () => { await restoreAlertsOff(); await wczytajGranicePowiatow();');
  ok(gr > 0 && odlozone > gr, 'granice telefonu wczytywane od razu (nie po 2,5 s) i potem przerysowanie wiersza „mój region”');
}

console.log('\n5c. Historia w widoku powiatów (user 22.11.2026, do 1.8.11)');
{
  const od3 = app.indexOf('function najwyzszyPowiatHistorii(');
  const do3 = app.indexOf('/* Powiaty miejsc z alarmami w kolejności miejsc');
  ok(od3 > 0 && do3 > od3, 'funkcja wyboru powiatu do wiersza pod suwakiem stoi w app.js');
  const naj = new Function(app.slice(od3, do3) + '\nreturn najwyzszyPowiatHistorii;')();
  ok(naj({}) === null && naj(undefined) === null, 'brak powiatów z alarmem (albo migawka bez zapisu) — null, wiersz jak dotąd');
  ok(naj({ '0663': { level: 'none', score: 1.2 } }) === null, 'punkty poniżej progu to nie alarm');
  const r = naj({ '0610': { level: 'elevated', score: 3 }, '0604': { level: 'high', score: 5 }, '0663': { level: 'high', score: 6.5 } });
  ok(r.terc === '0663' && r.level === 'high' && r.wiecej === 2, 'najwyższy poziom, potem punkty; liczba pozostałych z alarmem');
  ok(/const powNaj = mapaPowiatow\(\) \? najwyzszyPowiatHistorii\(snap\?\.powiaty\) : null;/.test(app),
    'wiersz pod suwakiem bierze powiat tylko w widoku powiatów');
  ok(/\(powNaj\s*\n\s*\? `<b style/.test(app), 'gdy powiat miał alarm, wiersz zaczyna się od niego, inaczej województwo jak dotąd');
  ok(/histWoj = Object\.fromEntries\(ALL_VOIVS\.map\(v => \[v, \{ score: perVoiv\[v\] \|\| 0, level: poziomHist\(v, perVoiv\[v\] \|\| 0\) \}\]\)\);/.test(app),
    'historia zapamiętuje punkty i poziom województw z wybranej chwili');
  ok(/const vst = histMode \? \(histWoj\?\.\[woj\] \|\| null\) : state\?\.fusion\?\.voivodeships\?\.\[woj\];/.test(app),
    'karta powiatu w historii podaje województwo z tamtej chwili (punkty i poziom)');
}

console.log('\n6. Ustawienie i tłumaczenia');
ok(/<select id="set-podzial">\s*<option value="pow">Powiaty<\/option>\s*<option value="woj">Województwa<\/option>/.test(html),
  'Ustawienia → Mapa: „Powiaty” pierwsze (domyślne), „Województwa”');
ok(i18n.includes('["Counties", "Provinces"]') && i18n.includes('["Повіти", "Воєводства"]'), 'opcje po angielsku i ukraińsku');
ok(i18n.includes('"Map division"') && i18n.includes('"Поділ мапи"'), 'nagłówek po angielsku i ukraińsku');
ok(/map\.on\("click", "pow-extrude"/.test(app) && /function openPowCard\(terc\)/.test(app), 'dotknięcie powiatu otwiera jego kartę');
ok(/const powBaner = histMode \? null : powiatyWStanie\(\);/.test(app), 'wiersz „mój region” z powiatów moich miejsc (tor powiatów)');

if (bledy) { console.log(`\nBLEDY: ${bledy}`); process.exit(1); }
console.log('\nOK - mapa powiatów: granice, stan, przełącznik, nazwy, historia i tłumaczenia');

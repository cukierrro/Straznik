/* Geometria warstw ukraińskich pobierana dopiero, gdy jest co narysować.
 *
 * Do 27.09.2026 `obwody-ua.geojson` (328 KB po gzipie, 57 266 punktów na 10 obwodów)
 * i `rejony-ua-v1.geojson` (156 KB) pobierały się przy KAŻDYM wejściu na stronę,
 * choć warstwa obwodów ma `fill-opacity: 0`, dopóki żaden obwód nie ma punktowanego
 * alarmu. 24.09.2026 strona miała 231 737 odsłon — to setki gigabajtów za coś,
 * czego zwykle nie widać, płacone głównie transferem komórkowym ludzi w trakcie
 * zdarzenia.
 *
 * Zachowanie sprawdzone w przeglądarce (lokalny backend, 27.09.2026): po cofnięciu
 * `uaGeo` do stanu „nie wczytane" wywołanie obu malowań z PUSTĄ listą alarmów nie
 * wygenerowało ani jednego zapytania, a pojedynczy alarm rejonowy pobrał wyłącznie
 * `rejony` — `obwody` zostały nietknięte. Ten test pilnuje, żeby konstrukcja, która
 * to umożliwia, nie została przypadkiem cofnięta.
 *
 * Uruchomienie: node scripts/test_leniwe_warstwy_ua.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');

const bledy = [];
function sprawdz(warunek, opis) {
  console.log((warunek ? '  OK   ' : '  BŁĄD ') + opis);
  if (!warunek) bledy.push(opis);
}

// ── 1. nic nie pobiera się przy tworzeniu warstw ─────────────────────────────
sprawdz(/addSource\("rejony", \{ type: "geojson", data: emptyFC\(\)/.test(app),
  'źródło "rejony" powstaje puste');
sprawdz(/addSource\("obwody", \{ type: "geojson", data: emptyFC\(\)/.test(app),
  'źródło "obwody" powstaje puste');
sprawdz(!/await \(await fetch\("assets\/(rejony|obwody)-ua/.test(app),
  'przy starcie mapy nie ma już pobierania geometrii UA');

// ── 2. adresy plików są w jednym miejscu, w ładowarce ────────────────────────
const wystapienia = (app.match(/assets\/(rejony-ua-v1|obwody-ua)\.geojson/g) || []).length;
sprawdz(wystapienia === 2,
  `adresy geometrii UA występują dokładnie raz każdy (znaleziono ${wystapienia})`);
sprawdz(/const UA_GEO_PLIKI = \{/.test(app) && /async function wczytajGeoUA\(ktore\)/.test(app),
  'pobieranie jest w jednej funkcji wczytajGeoUA()');

// ── 3. warstwy zostają na swoim miejscu w kolejności rysowania ───────────────
const kolejnosc = ['"pl-fill"', '"rejony-alert-fill"', '"obwody-fill"', '"trails"']
  .map(id => app.indexOf(`addLayer({ id: ${id}`));
sprawdz(kolejnosc.every(i => i > 0) && kolejnosc.every((v, i, a) => i === 0 || a[i - 1] < v),
  'warstwy UA dalej powstają między Polską a śladami — nic nie trafia nad Polskę');
sprawdz(!/addLayer\(\{ id: "(rejony|obwody)-[a-z]+"[\s\S]{0,400}?\}, "[a-z-]+"\)/.test(app),
  'warstwy UA nie są wstawiane przez beforeId (kolejność ustalona raz, przy starcie)');

// ── 4. pobranie wyzwala dopiero to, co trzeba narysować ──────────────────────
function cialo(nazwa) {
  const i = app.indexOf(`function ${nazwa}(`);
  return i < 0 ? '' : app.slice(i, i + 900);
}
sprawdz(/if \(next\.size\) wczytajGeoUA\("obwody"\)/.test(cialo('paintOblasts')),
  'obwody pobierane dopiero, gdy jest choć jeden obwód do zapalenia');
sprawdz(/if \(\(areas \|\| \[\]\)\.length\) wczytajGeoUA\("rejony"\)/.test(cialo('paintRaionAlerts')),
  'rejony pobierane dopiero, gdy przyszedł choć jeden alarm rejonowy');

// ── 5. spóźniona geometria nie gubi alarmu ───────────────────────────────────
const ladowarka = cialo('wczytajGeoUA');
sprawdz(/paintRaionAlerts\(ostatnieRejonyUA\)/.test(ladowarka)
     && /paintOblasts\(ostatnieObwodyUA\)/.test(ladowarka),
  'po pobraniu geometrii malujemy jeszcze raz — alarm sprzed pobrania nie przepada');
sprawdz(/ostatnieObwodyUA = sigs;/.test(cialo('paintOblasts'))
     && /ostatnieRejonyUA = areas;/.test(cialo('paintRaionAlerts')),
  'malowania zapamiętują ostatnie dane do tego przemalowania');
sprawdz(/uaGeo\[ktore\] = null;/.test(ladowarka),
  'nieudane pobranie wraca do stanu „nie wczytane" — spróbujemy przy następnym alarmie');

// ── 6. bez granic nie krzyczymy o nieznanych rejonach ────────────────────────
sprawdz(/uaGeo\.rejony === "gotowe" && !paintRaionAlerts\.warned/.test(app),
  'ostrzeżenie „rejon bez granic" dopiero po wczytaniu granic');

if (bledy.length) {
  console.log(`\n${bledy.length} błędów`);
  process.exit(1);
}
console.log('\nOK: geometria UA pobierana leniwie, kolejność warstw nietknięta');

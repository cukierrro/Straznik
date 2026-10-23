/* Spis miejscowości GROTY: każde miasto z urzędowego rejestru TERYT musi być w nim jako „m”.

   Powstał 23.10.2026, po porównaniu spisu z rejestrem SIMC. Brakowało pięciu miast — Gdańska,
   Gdyni, Helu, Jastarni i Pucka — bo granice gmin nadmorskich sięgają w OSM morza terytorialnego,
   więc narzędzie budujące granice odrzucało te gminy, a miejscowości bez gminy wypadały po cichu.
   Wyszukiwanie „gdzie jestem” bez internetu podawało wtedy dla „Gdynia” osadę w gminie Lidzbark.
   Pięć miast na 1026 nie rzuca się w oczy w żadnym podsumowaniu, a dotyczyło to miasta, w którym
   mieszka ćwierć miliona ludzi — dlatego pilnuje tego test, nie czujność przy przebudowie paczki.

   Druga zguba z tego samego dnia: scalanie województw usuwało powtórzenia po nazwie i gminie,
   a sześć par miast ma jedno i drugie takie samo w różnych województwach. Wypadł Olsztyn
   warmiński — „Olsztyn” wskazywał wieś pod Częstochową. Dlatego test liczy miasta, nie sprawdza
   samej obecności nazwy.

   Odniesienie: scripts/dane_testowe/miasta_teryt.txt — wyciąg z rejestru (GUS, TERYT, dane
   publiczne). Całego SIMC (100 tys. wierszy) nie wkładamy do repozytorium; wyciąg odświeża
   `py tools/miasta_teryt.py <katalog>` w repozytorium GROTY, razem z paczką danych. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const KORZEN = path.join(__dirname, "..");
const SPIS = path.join(KORZEN, "grota", "data", "miejscowosci.json");
const WYKAZ = path.join(__dirname, "dane_testowe", "miasta_teryt.txt");

const bezOgonkow = (s) =>
  String(s).toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();

const spis = JSON.parse(fs.readFileSync(SPIS, "utf-8"));
assert.ok(Array.isArray(spis.m) && spis.m.length > 50000, `spis wygląda na niepełny: ${spis.m && spis.m.length}`);
assert.ok(Array.isArray(spis.gminy) && spis.gminy.length > 2000, "brak listy gmin w spisie");

// „nazwa|gmina” -> ile razy spis ma takie miasto. Liczymy, bo są pary miast o tej samej nazwie
// I tej samej nazwie gminy w różnych województwach (Olsztyn warmiński i śląski pod Częstochową,
// Bolesławiec, Dobra, Józefów, Oleśnica, Ujazd). Scalanie województw po samej nazwie gubiło jedno
// z pary — ze spisu zniknął Olsztyn warmiński, 170 tys. mieszkańców (naprawione 23.10.2026).
const miastaSpisu = new Map();
const gminyNazwy = new Map();
for (const [nazwa, gminaIdx, , , rodzaj] of spis.m) {
  if (rodzaj !== "m") continue;
  const k = bezOgonkow(nazwa) + "|" + bezOgonkow(spis.gminy[gminaIdx]);
  miastaSpisu.set(k, (miastaSpisu.get(k) || 0) + 1);
  const n = bezOgonkow(nazwa);
  if (!gminyNazwy.has(n)) gminyNazwy.set(n, new Set());
  gminyNazwy.get(n).add(spis.gminy[gminaIdx]);
}

const wiersze = fs.readFileSync(WYKAZ, "utf-8").split(/\r?\n/)
  .filter((w) => w.trim() && !w.startsWith("#"));
assert.ok(wiersze.length > 900, `wykaz miast wygląda na obcięty: ${wiersze.length} wierszy`);

// ile miast o danym „nazwa|gmina” ma rejestr — tyle samo musi mieć spis
const rejestrLiczby = new Map();
for (const w of wiersze) {
  const [nazwa, , gmina] = w.split(";");
  const k = bezOgonkow(nazwa) + "|" + bezOgonkow(gmina);
  rejestrLiczby.set(k, (rejestrLiczby.get(k) || 0) + 1);
}

const brak = [], zlaGmina = [], zaMalo = [], zgloszone = new Set();
for (const w of wiersze) {
  const [nazwa, woj, gmina] = w.split(";");
  const gminy = gminyNazwy.get(bezOgonkow(nazwa));
  if (!gminy) { brak.push(`${nazwa} (${woj}, gmina ${gmina})`); continue; }
  // Miasto musi siedzieć w swojej gminie. Nazwy miast się powtarzają (dwa Brzeziny, trzy Chełmy),
  // więc wystarczy, że wśród gmin o tej nazwie w spisie jest ta z rejestru.
  const k = bezOgonkow(nazwa) + "|" + bezOgonkow(gmina);
  const maSpis = miastaSpisu.get(k) || 0;
  if (!maSpis) { zlaGmina.push(`${nazwa} (${woj}): rejestr mówi gmina ${gmina}, spis ma ${[...gminy].join(", ")}`); continue; }
  if (maSpis < rejestrLiczby.get(k) && !zgloszone.has(k)) {
    zgloszone.add(k);
    zaMalo.push(`${nazwa}, gm. ${gmina}: rejestr ma ${rejestrLiczby.get(k)} takich miast (różne województwa), spis ${maSpis}`);
  }
}

if (brak.length || zlaGmina.length || zaMalo.length) {
  console.error(`BŁĄD: miast w rejestrze ${wiersze.length}, brakuje w spisie jako „m”: ${brak.length}, z inną gminą: ${zlaGmina.length}, scalonych z imiennikiem: ${zaMalo.length}`);
  for (const b of brak.slice(0, 30)) console.error("  brak:", b);
  for (const z of zlaGmina.slice(0, 30)) console.error("  gmina:", z);
  for (const z of zaMalo.slice(0, 30)) console.error("  scalone:", z);
  console.error("Przebuduj spis: py tools/granice_gmin.py && py tools/miejscowosci.py (repozytorium GROTY), potem eksport modułu.");
  process.exit(1);
}

console.log(`OK: wszystkie ${wiersze.length} miast z rejestru TERYT są w spisie jako „m”, każde w swojej gminie`);
console.log(`     (spis: ${spis.m.length} wpisów, ${spis.gminy.length} gmin)`);

/* Druga połowa: czy wyszukiwanie offline naprawdę je podaje. Sam spis może być pełny, a człowiek
   bez internetu dostanie zły wynik, bo przy równych nazwach o kolejności decyduje rodzaj
   miejscowości — tak „Gdynia” wskazywała dzielnicę pod Brodnicą. Idziemy tą samą ścieżką
   co aplikacja: GrotaCore.findLocalities bez pozycji odniesienia (GPS nie działa — po to jest spis). */
const core = (() => {
  const window_ = {};                       // bez GrotaJezyk: rdzeń ma wtedy własny, polski tekst
  // poradnik.js pierwszy — rdzeń bierze z niego zasady już przy wczytywaniu
  for (const plik of ["poradnik.js", "grota-core.js"]) {
    new Function("window", fs.readFileSync(path.join(KORZEN, "grota", plik), "utf-8"))(window_);
  }
  return window_.GrotaCore;
})();
assert.ok(core && core.findLocalities, "nie udało się wczytać grota-core.js");

const idx = core.localityIndex(spis);
const SPRAWDZANE = [
  // [wpisane w wyszukiwarkę, oczekiwana nazwa, oczekiwana gmina]
  ["Gdynia", "Gdynia", "Gdynia"],
  ["gdansk", "Gdańsk", "Gdańsk"],          // ludzie piszą bez polskich znaków
  ["Hel", "Hel", "Hel"],
  ["Jastarnia", "Jastarnia", "Jastarnia"],
  ["Puck", "Puck", "Puck"],
  ["Warszawa", "Warszawa", "Warszawa"],
  ["Wałcz", "Wałcz", "Wałcz"],             // miasto obok gminy wiejskiej o tej samej nazwie
];
const zle = [];
for (const [pytanie, nazwa, gmina] of SPRAWDZANE) {
  const wyniki = core.findLocalities(idx, pytanie, null);
  const p = wyniki[0];
  if (!p) { zle.push(`„${pytanie}”: brak wyników`); continue; }
  if (p.label !== nazwa || !p.detail.includes(gmina) || p.kind !== "m") {
    zle.push(`„${pytanie}”: pierwszy wynik to ${p.label} (${p.detail}, rodzaj ${p.kind}), a ma być ${nazwa}, gm. ${gmina}, miasto`);
  }
}
if (zle.length) {
  console.error("BŁĄD: wyszukiwanie offline podaje złe miejscowości:");
  for (const z of zle) console.error("  ", z);
  process.exit(1);
}
console.log(`OK: wyszukiwanie offline dla ${SPRAWDZANE.length} nazw podaje właściwe miasto na pierwszym miejscu`);

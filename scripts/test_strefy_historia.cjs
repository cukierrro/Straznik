/* Strefy PAŻP nie mogą udawać, że wiemy, co obowiązywało w przeszłości.

   Znalezione 07.10.2026. Migawka zapisuje WYŁĄCZNIE `threats` i `aircraft` —
   stref w niej nie ma. Mimo to warstwa stref rysowała się w trybie historii
   z BIEŻĄCYCH danych, a `setInterval(refreshZones, 60000)` dalej je odświeżał.
   Suwak pokazywał więc dzisiejsze strefy nad przeszłą sytuacją.

   Pomiar z produkcji tego dnia: PAŻP rotuje cały zestaw raz na dobę o 06:00
   UTC — 33 z 34 stref zaczynały dokładnie o tej godzinie. Przez pół doby okno
   historii (12 h) sięgało więc przed rotację. Gorzej: strefa zdjęta znika
   z bieżącego zestawu zupełnie, a strefy doraźne, otwierane w trakcie
   zdarzenia, są w historii najważniejsze — odtwarzany atak wyglądał na odbyty
   przy otwartym niebie.

   Dyscyplina była, tylko strefy ją ominęły: tuż obok stoi
   `paintRaionAlerts([])` z komentarzem „w historii nie udajemy, że trwały". */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const main = czytaj("backend/app/main.py");

console.log("1. Warstwa stref jest ukryta w trybie historii");
sprawdz(/const on = zonesOn\(\) && !histMode;/.test(app),
  "applyZones: widocznosc wymaga NIE-historii");
sprawdz(/if \(histMode\) \{ applyZones\(\); return; \}/.test(app),
  "refreshZones nie odpytuje serwera w historii (ruch za nic)");
sprawdz(/b\.style\.display = \(standalone \|\| !apiBase\(\) \|\| histMode\) \? "none" : "";/.test(app),
  "przycisk stref znika w historii — nie ma czego przelaczac");

console.log("2. Wejscie i wyjscie z historii przestawiaja warstwe");
const wejscie = app.indexOf("histMode = true;");
const wejscieBlok = app.slice(wejscie, wejscie + 400);
sprawdz(/applyZones\(\); syncZonesButton\(\);/.test(wejscieBlok),
  "wejscie w historie chowa strefy raz, nie przy kazdym ruchu suwaka");

const wyjscie = app.indexOf("function exitHistory()");
const wyjscieBlok = app.slice(wyjscie, app.indexOf("\n}", wyjscie));
sprawdz(/applyZones\(\)/.test(wyjscieBlok), "wyjscie z historii przywraca strefy");
/* PUŁAPKA, na którą się nadziałem przy pisaniu: refreshZones() bez `force`
   wraca na TTL (4 min) ZANIM dojdzie do rysowania. Samo jego wywołanie
   zostawiłoby warstwę ukrytą az do wygasniecia TTL-a — czyli po wyjsciu
   z historii strefy znikalyby na kilka minut bez zadnego powodu. */
sprawdz(wyjscieBlok.indexOf("applyZones()") < wyjscieBlok.indexOf("refreshZones()"),
  "applyZones stoi PRZED refreshZones — TTL nie moze zjesc przywrocenia");

console.log("3. Baner historii mowi o tym wprost, we wszystkich jezykach");
for (const [jezyk, wzor] of [["PL", /stref PAŻP nie zapisujemy/],
                             ["EN", /PAŻP zones are not recorded/],
                             ["UK", /зони PAŻP не зберігаються/]])
  sprawdz(wzor.test(app), `baner historii tlumaczy brak stref (${jezyk})`);

console.log("4. Tripwire: migawka nadal NIE zawiera stref");
/* Ukrywanie jest uczciwe dokladnie dopoty, dopoki nie mamy czym go zastapic.
   Gdy ktos dolozy strefy do migawki, ten test ma upasc i przypomniec, ze
   warstwe wolno wtedy ODSLONIC — zamiast zostawic ukrywanie na zawsze. */
const zapis = main.match(/db\.add_snapshot\(\{[\s\S]{0,400}?\}\)/);
sprawdz(!!zapis, "znaleziono zapis migawki w backendzie");
sprawdz(!!zapis && !/zone|stref/i.test(zapis[0]),
  "migawka nie ma stref — jesli to sie zmieni, zdjac ukrywanie w applyZones");

console.log("\nBLEDY: " + bledy);
process.exit(bledy ? 1 : 0);

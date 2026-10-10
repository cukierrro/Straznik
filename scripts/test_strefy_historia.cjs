/* Strefy PAŻP w historii: z TAMTEJ chwili albo żadne — nigdy bieżące.

   Znalezione 07.10.2026. Migawka zapisywała WYŁĄCZNIE `threats` i `aircraft`,
   a warstwa stref rysowała się w trybie historii z BIEŻĄCYCH danych. Suwak
   pokazywał więc dzisiejsze strefy nad przeszłą sytuacją. Pomiar z produkcji:
   PAŻP rotuje cały zestaw raz na dobę o 06:00 UTC (33 z 34 stref), więc przez
   pół doby okno 12 h sięgało przed rotację; strefa zdjęta znikała z bieżącego
   zestawu zupełnie, a doraźne — najważniejsze w historii — przepadały.
   07.10 warstwę w historii ukryliśmy. Ten test miał wtedy tripwire: „gdy ktoś
   dołoży strefy do migawki, test upadnie i przypomni, że ukrywanie wolno
   zdjąć”. 10.10.2026 upadł zgodnie z planem — migawka niesie klucze stref
   (pansa.zones_snapshot), a definicje przychodzą w paczce (`zone_defs`).

   Teraz test pilnuje nowej zasady i URUCHAMIA funkcje z app.js:
     * migawka bez pola `zones` (sprzed wdrożenia, tryb wbudowany) = brak
       danych → warstwa ukryta, NIE bieżące strefy,
     * migawka z `zones` → strefy z definicji, z wiekiem liczonym od chwili
       z suwaka (stan „stoi ponad dobę” i „ile temu” według tamtej chwili),
     * każdy odczyt stref idzie przez aktywneStrefy(), które w historii nigdy
       nie sięga po żywe zonesData,
     * pozostałe zasady z 07.10 (bez odpytywania serwera w historii, kolejność
       applyZones/refreshZones przy wyjściu, baner we wszystkich językach). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const main = czytaj("backend/app/main.py");
const cache = czytaj("backend/app/public_cache.py");

function funkcja(nazwa) {
  const start = app.indexOf(`function ${nazwa}(`);
  if (start < 0) throw new Error(`brak ${nazwa} w app.js`);
  let g = 0;
  for (let i = start; i < app.length; i++) {
    if (app[i] === "{") g++;
    else if (app[i] === "}" && --g === 0) return app.slice(start, i + 1);
  }
  throw new Error(`niedomknięta ${nazwa}`);
}
const linia = (poczatek) => { const s = app.indexOf(poczatek); return app.slice(s, app.indexOf("\n", s)); };

const ctx = { histMode: false, histZonesData: null, zonesData: null, srvZoneDefs: {} };
vm.createContext(ctx);
vm.runInContext([funkcja("zoneAltM"), funkcja("strefyZMigawki"), linia("const aktywneStrefy = "),
  "this.strefyZMigawki = strefyZMigawki; this.aktywneStrefy = aktywneStrefy;"].join("\n"), ctx);

console.log("1. Migawka bez zapisu stref = warstwa ukryta, nie bieżące strefy");
sprawdz(ctx.strefyZMigawki({ ts: "x", threats: [] }, 0) === null, "brak pola zones → null");
sprawdz(ctx.strefyZMigawki(null, 0) === null, "brak migawki → null");
ctx.histMode = true; ctx.histZonesData = null;
ctx.zonesData = { type: "FeatureCollection", features: [{ properties: { designator: "TERAZ" } }] };
sprawdz(vm.runInContext("aktywneStrefy()", ctx) === null,
  "w historii aktywneStrefy() NIE sięga po żywe zonesData");
ctx.histMode = false;
sprawdz(vm.runInContext("aktywneStrefy()", ctx) === ctx.zonesData, "na żywo — bieżące strefy");

console.log("2. Migawka ze strefami odtwarza tamtą chwilę");
const godz = 3600;
const chwila = Date.UTC(2026, 9, 8, 18, 0) / 1000;        // 08.10 18:00 UTC
ctx.srvZoneDefs = {
  aaa: { type: "Feature", geometry: { type: "Polygon", coordinates: [[[22, 50], [23, 50], [23, 51], [22, 50]]] },
         properties: { key: "aaa", designator: "EPR999", type: "ADHOC", lower: "GND", upper: "F095", voiv: "lubelskie" } },
  bbb: { type: "Feature", geometry: { type: "Polygon", coordinates: [[[20, 52], [21, 52], [21, 53], [20, 52]]] },
         properties: { key: "bbb", designator: "EPTS1", type: "TSA", lower: "A020", upper: "F100", voiv: "mazowieckie" } },
};
const fc = ctx.strefyZMigawki({ zones: [["aaa", chwila - 2 * godz, false], ["bbb", chwila - 30 * godz, true],
                                        ["brak", chwila, false]] }, chwila * 1000);
const p = Object.fromEntries((fc?.features || []).map((f) => [f.properties.designator, f.properties]));
sprawdz(fc && fc.features.length === 2, "dwie strefy z definicji, klucz bez definicji pominięty");
sprawdz(p.EPR999?.standing === false && p.EPTS1?.standing === true,
  "„stoi ponad dobę” liczone od chwili z suwaka (2 h → zdarzenie, 30 h → stan)");
sprawdz(p.EPTS1?.atBoot === true && p.EPR999?.atBoot === false, "atBoot z migawki");
sprawdz(p.EPR999?.baseM === 0 && Math.round(p.EPR999?.topM) === 2896, "pułapy przeliczone na metry");
sprawdz(ctx.srvZoneDefs.aaa.properties.since === undefined, "definicja nie zostaje nadpisana chwilą");

console.log("3. Każdy odczyt stref idzie przez aktywneStrefy()");
const odczyty = app.match(/zonesData(\?\.|\.)features/g) || [];
const dozwolone = [funkcja("refreshZones"), funkcja("srvRecord")].join("\n").match(/zonesData(\?\.|\.)features/g) || [];
sprawdz(odczyty.length === dozwolone.length,
  `zonesData.features czytane tylko w refreshZones/srvRecord (jest ${odczyty.length}, dozwolone ${dozwolone.length})`);
const apply = funkcja("applyZones");
sprawdz(/const dane = aktywneStrefy\(\);/.test(apply) && !/zonesData/.test(apply.replace(/\/\*[\s\S]*?\*\//g, "")),
  "applyZones rysuje aktywneStrefy(), nie zonesData");
sprawdz(/histZonesData = strefyZMigawki\(snap, when\.getTime\(\)\);/.test(funkcja("showHistoryAt")),
  "showHistoryAt ustawia strefy wybranej chwili");
sprawdz(/\(histMode && zoneRefMs\) \|\| Date\.now\(\)/.test(funkcja("zoneSinceText")),
  "karta strefy w historii liczy „ile temu” od chwili z suwaka");

console.log("4. Zasady z 07.10 zostają");
sprawdz(/if \(histMode\) \{ applyZones\(\); return; \}/.test(funkcja("refreshZones")),
  "refreshZones nie odpytuje serwera w historii (ruch za nic)");
const wejscie = app.indexOf("histMode = true;");
sprawdz(/applyZones\(\); syncZonesButton\(\);/.test(app.slice(wejscie, wejscie + 400)),
  "wejście w historię przestawia warstwę raz");
const wyjscie = funkcja("exitHistory");
sprawdz(/histZonesData = null;/.test(wyjscie), "wyjście z historii zapomina strefy z migawki");
/* PUŁAPKA z 07.10: refreshZones() bez `force` wraca na TTL (4 min) ZANIM dojdzie
   do rysowania — samo jego wywołanie zostawiłoby warstwę pustą po wyjściu. */
sprawdz(wyjscie.indexOf("applyZones()") > 0 && wyjscie.indexOf("applyZones()") < wyjscie.indexOf("refreshZones()"),
  "applyZones stoi PRZED refreshZones — TTL nie może zjeść przywrócenia");

console.log("5. Baner historii mówi, skąd strefy, we wszystkich językach");
for (const [jezyk, jest, brak] of [["PL", /strefy PAŻP z tamtej chwili/, /nie mamy zapisu stref PAŻP/],
                                   ["EN", /PAŻP zones as they were then/, /no PAŻP zone record for this moment/],
                                   ["UK", /зони PAŻP на той момент/, /немає запису зон PAŻP/]])
  sprawdz(jest.test(app) && brak.test(app), `baner: obie wersje (${jezyk})`);

console.log("6. Serwer zapisuje strefy w migawce i oddaje definicje w paczce");
sprawdz(/strefy, definicje = pansa\.zones_snapshot\(\)/.test(main) && /migawka\["zones"\] = strefy/.test(main),
  "migawka 12 h niesie klucze stref");
sprawdz(/\{"zones": strefy\} if strefy is not None/.test(main), "archiwum 30 dni też");
sprawdz(/"zone_defs": zone_defs/.test(cache), "paczka historii ma zone_defs");

console.log("\nBLEDY: " + bledy);
process.exit(bledy ? 1 : 0);

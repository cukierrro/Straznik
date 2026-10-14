// Licznik dronów i rakiet na mapie (14.10.2026).
// Pilnuje decyzji usera: co jest dronem, a co rakietą (KAB z rakietami, bez FPV,
// MiG-31K i nieznanych), że licznik liczy DOKŁADNIE to, co rysuje mapa (obiekty
// z pozycją, bez alarmów ogólnokrajowych, bez doliczania zgubionych z feedu —
// próba z oknem 15 min dawała ~2× więcej niż ikon), odmiany PL/EN/UK, historii
// z tej samej funkcji i tego, że licznik nie gada co tick (bez aria-live).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "frontend", "app.js"), "utf8").replace(/\r\n/g, "\n");
const html = fs.readFileSync(path.join(ROOT, "frontend", "index.html"), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
function sprawdz(warunek, opis) {
  console.log(`  ${warunek ? "OK  " : "BŁĄD"}  ${opis}`);
  if (!warunek) bledy++;
}

// Wycinamy z app.js blok licznika: od stałych do licznikZdanie włącznie.
const od = app.indexOf("const LICZNIK_DRONY");
const doK = app.indexOf("function licznikGodzina");
assert(od > 0 && doK > od, "nie znaleziono bloku licznika w app.js");
const blok = app.slice(od, doK);

function piaskownica(jezyk) {
  const UI = { isEn: jezyk === "en", isUk: jezyk === "uk",
    t: (pl, en, uk) => (jezyk === "en" ? en : jezyk === "uk" ? uk : pl) };
  const ctx = { UI, isNationalThreat: t => !!t.straznik_national };
  vm.createContext(ctx);
  vm.runInContext(blok + "\nthis.f = { licznikZObiektow, licznikDrony, licznikRakiety, licznikZdanie };", ctx);
  return ctx.f;
}

console.log("1. Co jest liczone");
const f = piaskownica("pl");
const obiekty = [
  { type: "uav", lat: 50, lon: 30 }, { type: "shahed", lat: 50, lon: 30 }, { type: "recon", lat: 50, lon: 30 },
  { type: "UAV", lat: 50, lon: 30 },                          // typ wielkimi literami też
  { type: "missile", lat: 50, lon: 30 }, { type: "cruise", lat: 50, lon: 30 },
  { type: "ballistic", lat: 50, lon: 30 }, { type: "kab", lat: 50, lon: 30 },
  { type: "fpv", lat: 50, lon: 30 }, { type: "mig31k", lat: 50, lon: 30 }, { type: "unknown", lat: 50, lon: 30 },
  { type: "uav", lat: null, lon: null },                      // bez pozycji — mapa go nie rysuje
  { type: "ballistic", lat: 50, lon: 30, straznik_national: true },   // alarm ogólnokrajowy
];
const l = f.licznikZObiektow(obiekty);
sprawdz(l.drony === 4, `drony = uav + shahed + recon (4), jest ${l.drony}`);
sprawdz(l.rakiety === 4, `rakiety = missile + cruise + ballistic + kab (4), jest ${l.rakiety}`);
sprawdz(l.kab === 1, "KAB policzony osobno do opisu");
sprawdz(f.licznikZObiektow([]).drony === 0 && f.licznikZObiektow(undefined).rakiety === 0, "brak danych = zera, bez błędu");

console.log("2. Tylko to, co mapa — bez doliczania zgubionych");
const zLost = f.licznikZObiektow(Object.assign([{ type: "uav", lat: 1, lon: 1 }], {}));
sprawdz(zLost.drony === 1, "jeden obiekt na mapie = 1");
sprawdz(!/lost_counts/.test(app), "app.js nie czyta neptun.lost_counts");
sprawdz(/odswiezLicznik\(l = licznikZObiektow\(state\?\.neptun\?\.threats\)/.test(app),
  "na żywo: licznik z obiektów, które rysuje mapa");
sprawdz(/const licznikHist = licznikZObiektow\(snapThreats\)/.test(app),
  "historia: ta sama funkcja na obiektach z migawki");

console.log("3. Odmiana");
sprawdz(f.licznikDrony(1) === "1 dron" && f.licznikDrony(3) === "3 drony" && f.licznikDrony(5) === "5 dronów"
  && f.licznikDrony(12) === "12 dronów" && f.licznikDrony(22) === "22 drony", "PL: dron / drony / dronów (z 12–14)");
sprawdz(f.licznikRakiety(1) === "1 rakieta" && f.licznikRakiety(4) === "4 rakiety" && f.licznikRakiety(0) === "0 rakiet",
  "PL: rakieta / rakiety / rakiet");
const en = piaskownica("en");
sprawdz(en.licznikDrony(1) === "1 drone" && en.licznikDrony(2) === "2 drones", "EN: drone / drones");
const uk = piaskownica("uk");
sprawdz(uk.licznikDrony(21) === "21 дрон" && uk.licznikDrony(3) === "3 дрони" && uk.licznikDrony(11) === "11 дронів",
  "UK: дрон / дрони / дронів (z 11)");
sprawdz(f.licznikZdanie({ drony: 2, rakiety: 1, kab: 1 }) === "Na mapie: 2 drony i 1 rakieta (w tym 1 KAB).",
  "zdanie z rozbiciem KAB");

console.log("4. Przycisk i okno");
const przycisk = (html.match(/<button[^>]*id="licznik"[^>]*>/) || [""])[0];
sprawdz(!!przycisk, "przycisk #licznik w pasku");
sprawdz(!/aria-live/.test(przycisk), "licznik bez aria-live (nie gada co kilka sekund)");
sprawdz(/<dialog id="licznik-okno"[^>]*aria-labelledby="lk-h"/.test(html), "okno wyjaśnienia ma nazwę dla czytnika");
sprawdz(/function wypelnijOknoLicznika/.test(app) && /Dlaczego liczba skacze\?/.test(app),
  "okno wyjaśnia, dlaczego liczba skacze");
sprawdz(/Nie liczymy: dronów FPV/.test(app), "okno mówi, czego NIE liczymy");
sprawdz(/opisSytuacji\(voivs, watched\.length[\s\S]{0,120}licznikZdanie\(/.test(app),
  "liczby trafiają do „sytuacji jednym zdaniem” dla czytnika");

console.log(`\nBŁĘDY: ${bledy}`);
process.exit(bledy ? 1 : 0);

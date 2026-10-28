// Kurs domniemany nie obraca ikony (28.10.2026).
// „курсом на X” to namiar ze wstawionego punktu na cel, nie obserwacja lotu: w 30 dniach
// w zachodniej Ukrainie wskazywał Polskę w 99% przypadków. Ikona jak przy kursie
// nieznanym, kurs zostaje w karcie jako „domniemany”. Pilnujemy też migawek historii,
// które nie mają `heading_source` — tam rozpoznaje go `destination`.
// Uruchomienie: node scripts/test_kurs_domniemany_ikona.cjs
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "frontend", "app.js"), "utf8");
let bledy = 0;
const sprawdz = (w, opis) => { console.log((w ? "  OK   " : "  BŁĄD ") + opis); if (!w) bledy++; };

const def = src.match(/const isPresumedCourse = [^\n]+\n(?:\/\*[\s\S]*?\*\/\n)?const kursDomniemany = [\s\S]*?;\n/);
sprawdz(!!def, "definicje isPresumedCourse i kursDomniemany są w app.js");
const ctx = {};
vm.runInNewContext((def ? def[0] : "") + "this.k = kursDomniemany;", ctx);
const k = ctx.k || (() => null);
sprawdz(k({ heading: 255, presumptiveCourse: true }) === true, "presumptiveCourse z NEPTUN-a");
sprawdz(k({ heading: 229, heading_source: "presumptive" }) === true, "heading_source z serwera");
sprawdz(k({ heading: 248, destination: true }) === true, "migawka historii: destination bez heading_source");
sprawdz(k({ heading: 335, heading_source: "reported" }) === false, "kurs podany wprost obraca ikonę");
sprawdz(k({ heading: 248, destination: true, heading_source: "reported" }) === false,
  "serwer mówi „reported” — wierzymy serwerowi");
sprawdz(k({ heading: null, destination: true }) === false, "bez kursu to nie domniemany");

// obie ścieżki rysowania (na żywo i historia) używają funkcji w hdg_unknown i dają kurs do karty
const hdg = src.match(/hdg_unknown:[^\n]*(?:\n[^\n]*kursDomniemany\(t\)\),)?/g) || [];
sprawdz(hdg.length >= 2 && hdg.every(l => l.includes("kursDomniemany(t)")),
  `hdg_unknown uwzględnia kurs domniemany w obu ścieżkach (${hdg.length})`);
sprawdz((src.match(/kurs_domn:/g) || []).length >= 2, "karta dostaje kurs domniemany w obu ścieżkach");
sprawdz(/p\.kurs_domn != null[\s\S]{0,200}kurs domniemany/.test(src), "karta pisze „kurs domniemany”");

if (bledy) { console.log(`\nBŁĘDY: ${bledy}`); process.exit(1); }
console.log("\nOK — kurs domniemany bez obrotu ikony");

// Kurs domniemany nie obraca ikony (28.10.2026).
// „курсом на X” to namiar ze wstawionego punktu na cel, nie obserwacja lotu: w 30 dniach
// w zachodniej Ukrainie wskazywał Polskę w 99% przypadków. Ikona jak przy kursie
// nieznanym, kurs zostaje w karcie jako „domniemany”. Pilnujemy też migawek historii,
// które nie mają `heading_source` — tam rozpoznaje go `destination`.
// Uruchomienie: node scripts/test_kurs_domniemany_ikona.cjs
const fs = require("fs"), path = require("path"), vm = require("vm");
// końce linii ujednolicone — wzorce niżej nie mogą zależeć od CRLF w kopii roboczej
const src = fs.readFileSync(path.join(__dirname, "..", "frontend", "app.js"), "utf8").replace(/\r\n/g, "\n");
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

// Karta (treść uzgodniona z userem 28.10.2026): co zgłoszono, położenie, kierunek, Polska,
// czas dolotu. Bez „przedłużenie trasy prowadzi w stronę Polski” i „wyznaczona przez źródło”.
const blok = src.match(/const PRESUMPTIVE_MAX_KM = [\s\S]*?\nfunction kartaDomniemanyHTML\(p\) \{[\s\S]*?\n\}\n/);
sprawdz(!!blok, "funkcja kartaDomniemanyHTML jest w app.js");
const kctx = { UI: { t: (pl) => pl }, esc2: (s) => String(s), compass: (d) => (d > 200 && d < 250 ? "płd.-zach." : "płn.") };
vm.runInNewContext((blok ? blok[0] : "") + "this.f = kartaDomniemanyHTML; this.m = maKursDomniemany; this.max = PRESUMPTIVE_MAX_KM;", kctx);
const cfg = fs.readFileSync(path.join(__dirname, "..", "backend", "app", "config.py"), "utf8");
const maxSrv = Number((cfg.match(/NEPTUN_PRESUMPTIVE_MAX_KM = ([\d.]+)/) || [])[1]);
sprawdz(kctx.max === maxSrv, `próg w karcie = próg serwera (${kctx.max} / ${maxSrv})`);
const f = kctx.f || (() => "");
const blisko = f({ na_cel: true, cel: "Nowojaworiwsk", kurs_domn: 246, zgl: 6, uncertainty: 43, toward_pl: true, dist_km: 50 });
sprawdz(/Co zgłoszono:[\s\S]*dokąd dron leci \(zgłoszeń: 6\)/.test(blisko), "„Co zgłoszono” z liczbą zgłoszeń");
sprawdz(/Położenie: niepewne\.[\s\S]*umownie stawia przed celem[\s\S]*±43 km/.test(blisko), "położenie umowne z okręgiem");
sprawdz(/Kierunek: nieznany\.[\s\S]*Kąt 246°, płd\.-zach\./.test(blisko), "kierunek nieznany, kąt NEPTUN-a opisany");
sprawdz(/bliżej niż 150 km od granicy, liczy się do punktacji/.test(blisko), "blisko granicy — liczy się");
sprawdz(/nie liczymy, bo położenie i kierunek nie są znane/.test(blisko), "czas dolotu — bez położenia i kierunku");
sprawdz(!/przedłużenie trasy|wyznaczona przez źródło|nikt tego lotu/.test(blisko), "bez dawnych, niejasnych sformułowań");
const daleko = f({ na_cel: true, cel: "Kowel", kurs_domn: 250, uncertainty: 40, toward_pl: true, dist_km: 210 });
sprawdz(/za daleko[\s\S]*ponad 150 km od granicy/.test(daleko), "dalej niż 150 km — „za daleko”");
const mijajacy = f({ na_cel: true, cel: "Kijów", kurs_domn: 90, uncertainty: 40, toward_pl: false, dist_km: 400 });
sprawdz(/nie leży w stronę Polski/.test(mijajacy), "cel nie w stronę Polski — bez punktów");
const pewny = f({ na_cel: false, miejsce: "Dykańka", kurs_domn: 18, toward_pl: false });
sprawdz(/Położenie: z meldunku \(Dykańka\)\.[\s\S]*Kąt 18°[\s\S]*nie pochodzi on ze zgłoszenia/.test(pewny),
  "pozycja z meldunku + kąt NEPTUN-a");
sprawdz(/nie liczymy, bo kierunek nie jest znany/.test(pewny), "pozycja pewna — czas dolotu bez kierunku");
sprawdz(/maKursDomniemany\(p\) \? kartaDomniemanyHTML\(p\) : courseVerdictHTML\(p\)/.test(src),
  "karta używa bloku zamiast werdyktu „kurs na cel”");
sprawdz(/"położenie umowne"/.test(src), "plakietka „położenie umowne” dla punktu „kursem na X”");

if (bledy) { console.log(`\nBŁĘDY: ${bledy}`); process.exit(1); }
console.log("\nOK — kurs domniemany bez obrotu ikony");

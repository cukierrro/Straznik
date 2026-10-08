/* Stan zapisu do województw na iPhonie z alarmem krytycznym.

   Powstał 08.10.2026 ze zgłoszenia sesji iOS. Telefon ze zgodą na alarm
   krytyczny jest zapisany na `voiv_X_krytyczne` (notify.py,
   CRITICAL_TOPIC_SUFFIX), a ustawienia porównywały tematy dokładnie z `voiv_X`.
   Od 1.7.89 taki człowiek czytał „Telefon nie jest zapisany do żadnego
   województwa (potwierdzone przez Firebase)", choć alarmy do niego szły —
   i trafiało to akurat w tych, którzy zrobili dodatkowy krok.

   Test WYKONUJE fragment z app.js (slug + filtr), a nie szuka w nim napisu. */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const notify = czytaj("backend/app/notify.py");

// Filtr bywa w jednej linii albo w bloku { ... } — wzorzec łapie oba kształty.
const FILTR = /const subscribed = ALL_VOIVS\.filter\((?:v => \{[\s\S]*?\n\s*\}\)|[^{\n]*\));\n/;
const m = app.match(new RegExp(/const slug = v => [^\n]*\n[\s\S]*?/.source + FILTR.source));
sprawdz(!!m, "w app.js jest slug i filtr subscribed");
if (!m) { console.log("BLEDY: " + bledy); process.exit(1); }

const ALL_VOIVS = ["Lubelskie", "Podkarpackie", "Łódzkie", "Mazowieckie"];
const policz = new Function("ALL_VOIVS", "s", m[0] + "\nreturn subscribed;");
const zapisane = (topics) => policz(ALL_VOIVS, { topicsConfirmed: topics });

console.log("1. Tematy zwykłe i krytyczne");
sprawdz(JSON.stringify(zapisane(["voiv_lubelskie"])) === '["Lubelskie"]', "voiv_lubelskie → Lubelskie");
sprawdz(JSON.stringify(zapisane(["voiv_lubelskie_krytyczne"])) === '["Lubelskie"]',
  "voiv_lubelskie_krytyczne → Lubelskie (to był błąd)");
sprawdz(JSON.stringify(zapisane(["voiv_lodzkie_krytyczne", "voiv_podkarpackie"])) === '["Podkarpackie","Łódzkie"]',
  "mieszane: łódzkie krytyczne + podkarpackie zwykłe");
sprawdz(zapisane([]).length === 0, "brak tematów → pusto");
sprawdz(zapisane(undefined).length === 0, "brak pola → pusto, bez wyjątku");

console.log("2. Nic, co tylko wygląda podobnie");
sprawdz(zapisane(["voiv_lubelskie_test", "voiv_lubelskiex", "test_voiv_lubelskie"]).length === 0,
  "inne sufiksy i przedrostki nie liczą się jako zapis");

console.log("3. Sufiks zgodny z serwerem");
sprawdz(/CRITICAL_TOPIC_SUFFIX = "_krytyczne"/.test(notify), "notify.py używa _krytyczne");

console.log("4. Kontrola dodatnia: stary filtr naprawdę nie widział tematu krytycznego");
const stary = m[0].replace(FILTR,
  "const subscribed = ALL_VOIVS.filter(v => (s.topicsConfirmed || []).includes(slug(v)));\n");
const staryWynik = new Function("ALL_VOIVS", "s", stary + "\nreturn subscribed;")(ALL_VOIVS, { topicsConfirmed: ["voiv_lubelskie_krytyczne"] });
sprawdz(staryWynik.length === 0, "dawne porównanie dokładne dawało pustą listę");

console.log("BLEDY: " + bledy);
process.exit(bledy ? 1 : 0);

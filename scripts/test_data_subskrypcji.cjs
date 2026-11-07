/* Data potwierdzenia zapisu do województw w ustawieniach (1.8.07).

   Zgłoszenie 3.11.2026: iPhone po aktualizacji iOS nie dostał alarmu, a ekran
   mówił „Zapisany do alarmów dla: … (potwierdzone przez Firebase)” — bez daty,
   więc nie było widać, czy to potwierdzenie z dziś, czy sprzed tygodnia.
   Warstwa natywna zapisuje chwilę udanego zapisu (Android `topics_ok_at`,
   iPhone `Key.topicsOkAt`) i zwraca ją w statusie jako `topicsOkAt`.

   Test WYKONUJE fragment z app.js (od `const loc` do `const subLine`), a nie
   szuka w nim napisu — tak jak test_tematy_krytyczne.cjs. */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const plugin = czytaj("android-app/android/app/src/main/java/pl/straznik/app/BackgroundPlugin.java");

// Od `const loc = previewLang` do końca wyrażenia `const subLine = …;` (ostatnie
// `));` po wierszu „nie jest zapisany”). Kształt bywa łamany — szukamy po treści.
const m = app.match(/\n(\s*const loc = previewLang[\s\S]*?const subLine = [\s\S]*?Телефон не записаний на жодне воєводство[^\n]*\n)/);
sprawdz(!!m, "w app.js jest `loc`, data potwierdzenia i subLine");
if (!m) { console.log("BLEDY: " + bledy); process.exit(1); }

const uruchom = (lang, s, subscribed) => {
  const T = (pl, en, uk) => lang === "pl" ? pl : lang === "uk" ? (uk !== undefined ? uk : en) : en;
  const f = new Function("previewLang", "T", "esc", "UI", "alertsOff", "s", "subscribed", "noRegion",
    m[1] + "\nreturn subLine;");
  return f(lang, T, (x) => String(x), { voiv: (v) => v }, () => false, s, subscribed, false);
};

const chwila = Date.UTC(2026, 10, 7, 9, 5);   // 7.11.2026 09:05 UTC
const data = new Date(chwila).toLocaleString("pl-PL", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

// 1. Zapisany, z datą — PL, EN, UK
const pl = uruchom("pl", { topicsOkAt: chwila }, ["Podkarpackie"]);
sprawdz(pl.includes("Zapisany do alarmów dla: Podkarpackie") && pl.includes(`potwierdzone przez Firebase ${data}`),
  `PL: data przy „Zapisany do alarmów dla” → ${pl}`);
const en = uruchom("en", { topicsOkAt: chwila }, ["Podkarpackie"]);
sprawdz(/confirmed by Firebase on \d/.test(en), `EN: data po „confirmed by Firebase on” → ${en}`);
const uk = uruchom("uk", { topicsOkAt: chwila }, ["Podkarpackie"]);
sprawdz(/підтверджено Firebase \d/.test(uk), `UK: data po „підтверджено Firebase” → ${uk}`);

// 2. Wypisany (żadne województwo) też pokazuje, kiedy Firebase to potwierdził
const wyp = uruchom("pl", { topicsOkAt: chwila }, []);
sprawdz(wyp.includes("nie jest zapisany") && wyp.includes(data), `PL: data także przy „nie jest zapisany” → ${wyp}`);

// 3. Starsza warstwa natywna bez pola albo 0 — wiersz jak dawniej, bez „Invalid Date”
for (const s of [{}, { topicsOkAt: 0 }, { topicsOkAt: null }, { topicsOkAt: "x" }]) {
  const w = uruchom("pl", s, ["Lubelskie"]);
  sprawdz(w.endsWith("(potwierdzone przez Firebase).") && !/Invalid|NaN|1970/.test(w),
    `bez daty przy topicsOkAt=${JSON.stringify(s.topicsOkAt)} → ${w}`);
}

// 4. Android dalej zwraca pole w statusie (iPhone: StraznikBackgroundPlugin.swift na gałęzi ios)
sprawdz(/ret\.put\("topicsOkAt",\s*fcm\.getLong\("topics_ok_at",\s*0\)\)/.test(plugin),
  "BackgroundPlugin.status() zwraca topicsOkAt");

console.log(bledy ? "BLEDY: " + bledy : "wszystko OK");
process.exit(bledy ? 1 : 0);

/* GROTA musi skalować się razem z resztą aplikacji (zgłoszenie #4, regulacja wielkości tekstu).
   Moduł siedzi w tym samym dokumencie co Strażnik, więc `rem` liczy się od tego samego `:root`
   — ale px mnożnika nie widzi. Jedna deklaracja w px wystarczy, żeby przy ustawieniu
   „Największa” ten jeden napis został mały.

   Osobny plik, a nie asercje w scripts/test_wielkosc_tekstu.cjs, celowo: moduł GROTY i regulacja
   wielkości tekstu w Strażniku to dwie zmiany, które użytkownik może wydać w dowolnej kolejności.
   Gdy obie będą na main, można je złączyć. */
const fs = require("fs");
const path = require("path");

// Końce linii normalizujemy ZARAZ po odczycie: przy core.autocrlf=true wzorce z \n nie trafiają
// i test przewraca się, zamiast sprawdzać (ta sama lekcja, co w test_wielkosc_tekstu.cjs).
const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BŁĄD") + "  " + opis); if (!ok) bledy++; };

const KATALOG = path.join(__dirname, "..", "grota");
const pliki = fs.readdirSync(KATALOG).filter((f) => f.endsWith(".js") || f.endsWith(".css"));

console.log("1. Rozmiary tekstu w module GROTY — w rem, nie w px");
for (const f of pliki) {
  const t = czytaj("grota/" + f);
  // `font-size: 0` chowa napis, a `max(16px, …)` to podłoga dla pól formularzy na iOS:
  // pole mniejsze niż 16 px każe iPhone'owi przybliżyć ekran i nie da się tego cofnąć.
  const px = [...t.matchAll(/font-size:\s*([0-9.]+)px/g)].filter((m) => m[1] !== "0"
    && !t.slice(Math.max(0, m.index - 12), m.index + 2).includes("max("));
  // skrót `font:` niesie rozmiar razem z krojem — łatwo go przeoczyć, szukając samego `font-size`
  const skrot = [...t.matchAll(/(?<![-\w])font:\s*[^;]*?([0-9.]+)px/g)];
  sprawdz(px.length === 0 && skrot.length === 0,
    `grota/${f} bez rozmiarów w px (${[...px, ...skrot].map((m) => m[1] + "px").join(", ") || "czysto"})`);
}

console.log("2. Interlinia proporcjonalna");
for (const f of pliki) {
  const t = czytaj("grota/" + f);
  const lh = [...t.matchAll(/line-height:\s*([0-9.]+)px/g)];
  // stała interlinia nie rośnie razem z tekstem i przy „Największa” obcina go od góry
  sprawdz(lh.length === 0, `grota/${f} bez line-height w px (${lh.map((m) => m[1] + "px").join(", ") || "czysto"})`);
}

console.log("3. Baza, od której liczą się rem");
const css = czytaj("grota/grota.css");
sprawdz(/font:\s*0\.9333rem\/1\.45/.test(css), "tekst modułu to 0.9333rem (14 px przy bazie 15 px), nie sztywne 14px");

console.log(bledy ? `\n${bledy} błędów` : "\nOK: GROTA skaluje się razem z resztą aplikacji");
process.exit(bledy ? 1 : 0);

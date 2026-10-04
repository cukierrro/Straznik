/* Regulacja wielkości tekstu (zgłoszenie #4, filo4444, 22.09.2026).
   Cała typografia musi zostać w `rem`: wystarczy JEDNA deklaracja w px,
   żeby przy powiększeniu ten jeden napis został mały i rozjechał wiersz.
   Test pilnuje też, żeby napisy nowego ustawienia były w OBU ścieżkach
   tłumaczeń (kontrakt z 1.7.89) i żeby nie wrócił selektor pozycyjny po h3. */
const fs = require("fs");
const path = require("path");

// Końce linii normalizujemy ZARAZ po odczycie: przy core.autocrlf=true wzorce
// z \n nie trafiają i test przewraca się zamiast sprawdzać (lekcja z 28.09).
const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const css = czytaj("frontend/style.css");
const html = czytaj("frontend/index.html");
const app = czytaj("frontend/app.js");
const i18n = czytaj("frontend/i18n.js");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BŁĄD") + "  " + opis); if (!ok) bledy++; };

console.log("1. Typografia w rem, nie w px");
// `font-size: 0` to sztuczka chowania napisu, a `max(16px, …)` to podłoga dla
// pól formularzy na iOS (mniejsze pole przybliża ekran i nie da się cofnąć).
const pxWCss = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)]
  .filter(m => m[1] !== "0" && !css.slice(Math.max(0, m.index - 12), m.index + 2).includes("max("));
sprawdz(pxWCss.length === 0, `style.css bez font-size w px (znaleziono: ${pxWCss.map(m => m[1] + "px").join(", ") || "brak"})`);
const pxWApp = [...app.matchAll(/font-size:\s*([0-9.]+)px/g)].filter(m => m[1] !== "0");
sprawdz(pxWApp.length === 0, `app.js bez font-size w px (znaleziono: ${pxWApp.map(m => m[1] + "px").join(", ") || "brak"})`);
const pxWHtml = [...html.matchAll(/font-size:\s*([0-9.]+)px/g)].filter(m => m[1] !== "0");
sprawdz(pxWHtml.length === 0, `index.html bez font-size w px (znaleziono: ${pxWHtml.map(m => m[1] + "px").join(", ") || "brak"})`);

console.log("2. Mnożnik na :root");
sprawdz(/--skala-tekstu:\s*1;/.test(css), ":root ma --skala-tekstu z wartością domyślną 1");
sprawdz(/font-size:\s*calc\(15px\s*\*\s*var\(--skala-tekstu/.test(css), "rozmiar bazowy liczony z mnożnika");
sprawdz(/input, select, textarea \{ font-size: max\(\s*16px\s*,/.test(css),
  "pola formularzy nigdy poniżej 16 px — inaczej iPhone przybliża ekran bezpowrotnie");

console.log("3. Sterowanie");
for (const id of ["ts-1", "ts-2", "ts-3"])
  sprawdz(new RegExp('id="' + id + '"[^>]*data-skala="').test(html), `#${id} istnieje i ma data-skala`);
sprawdz(/id="ts-1"[^>]*aria-pressed=/.test(html), "przyciski mają aria-pressed — sama klasa .active jest tylko wizualna");
sprawdz(/aria-pressed["'],\s*on \? "true" : "false"/.test(app) || /setAttribute\("aria-pressed"/.test(app),
  "app.js uaktualnia aria-pressed przy zmianie");
sprawdz(/SKALE_TEKSTU\s*=\s*\["1",\s*"1.15",\s*"1.3"\]/.test(app), "lista dozwolonych wartości w app.js");
sprawdz(/_ts === "1.15" \|\| _ts === "1.3"/.test(html),
  "skrypt w nagłówku wpuszcza do CSS tylko znane wartości, nie to, co stoi w pamięci przeglądarki");

console.log("4. Tłumaczenia w obu ścieżkach (kontrakt 1.7.89)");
for (const id of ["ts-head", "ts-1", "ts-2", "ts-3", "jak-ts"]) {
  sprawdz(i18n.includes(`button("${id}"`), `#${id} w podglądzie okna ustawień`);
  sprawdz(i18n.includes(`set("#${id}"`), `#${id} w globalnym przejściu na angielski`);
}
sprawdz(/getElementById\("ts-note"\)/.test(i18n), "#ts-note podmieniany wprost (ma pogrubienia, słownik go nie złapie)");
for (const k of ['"Text size":', '"Larger":', '"Largest":'])
  sprawdz(i18n.includes(k), `EN2UK zna ${k.replace(/[":]/g, "")}`);
// „Normal" znaczy w słowniku „Звичайна" (rodzaj żeński, od głośności).
// Przy „розмір" potrzebny jest rodzaj męski, więc ten przycisk ma wyjątek.
const ukr = i18n.slice(i18n.indexOf("function ukrainize"));
sprawdz(/ts1\.textContent = "Звичайний"/.test(ukr), "wyjątek rodzaju dla ts-1 stoi w ukrainize, nie w ścieżce angielskiej");

console.log("5. Nagłówki ustawień po identyfikatorach, nie po kolejności");
sprawdz(!/many\(":scope \.set-pane > h3/.test(i18n.replace(/\/\*[\s\S]*?\*\//g, "")),
  "brak selektora pozycyjnego po h3 — dołożenie nagłówka nie przesuwa tłumaczeń");
for (const id of ["set-h-alarmy", "set-h-miejsca", "set-h-dzwiek", "set-h-jezyk", "set-h-wersja"])
  sprawdz(html.includes(`id="${id}"`) && i18n.includes(`button("${id}"`), `#${id} ma identyfikator i tłumaczenie`);

console.log("\nBŁĘDY: " + bledy);
process.exit(bledy ? 1 : 0);

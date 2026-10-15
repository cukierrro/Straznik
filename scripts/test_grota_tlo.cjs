// Dostępność przy otwartej GROCIE (przegląd UI 14.10.2026).
// Moduł zakrywa cały ekran, ale czytnik widział pod nim cały Strażnik, a fokus
// zostawał na zakładce pod spodem. Pilnujemy, że tło dostaje inert + aria-hidden,
// że alarm (leży NAD Grotą), okna i pola aria-live zostają dostępne, że po
// zamknięciu tło wraca do stanu sprzed — także element ukryty z innego powodu —
// i że fokus idzie na zaczep modułu #g-tytul, a po zamknięciu na przycisk GROTA.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const app = fs.readFileSync(path.join(__dirname, "..", "frontend", "app.js"), "utf8").replace(/\r\n/g, "\n");
let bledy = 0;
const sprawdz = (w, opis) => { console.log(`  ${w ? "OK  " : "BŁĄD"}  ${opis}`); if (!w) bledy++; };

const od = app.indexOf("const GROTA_TLO_ZOSTAJE");
const doK = app.indexOf("const grotaWidokEl");
if (od < 0 || doK < od) { console.log("BŁĄD: nie znaleziono grotaTlo w app.js"); process.exit(1); }

function el(id, tag = "DIV", atr = {}) {
  const a = { ...atr };
  return { id, tagName: tag, dataset: {}, inert: false,
    getAttribute: k => (k in a ? a[k] : null), hasAttribute: k => k in a,
    setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; } };
}
const dzieci = [el("topbar"), el("map"), el("tabbar", "NAV"), el("panel"),
  el("ukryty", "DIV", { "aria-hidden": "true" }),
  el("grota-widok", "SECTION"), el("alarm-overlay"), el("toast"),
  el("a11y-alert", "DIV", { "aria-live": "assertive" }), el("settings", "DIALOG"), el("", "SCRIPT")];
const ctx = { document: { body: { children: dzieci } } };
vm.createContext(ctx);
vm.runInContext(app.slice(od, doK) + "\nthis.grotaTlo = grotaTlo;", ctx);
const po = id => dzieci.find(d => d.id === id);

console.log("1. Otwarta GROTA: tło wyłączone");
ctx.grotaTlo(true);
for (const id of ["topbar", "map", "tabbar", "panel"])
  sprawdz(po(id).inert && po(id).getAttribute("aria-hidden") === "true", `${id}: inert + aria-hidden`);
for (const id of ["grota-widok", "alarm-overlay", "toast", "a11y-alert", "settings"])
  sprawdz(!po(id).inert && po(id).getAttribute("aria-hidden") !== "true", `${id} zostaje dostępny`);

console.log("2. Zamknięta GROTA: tło jak przedtem");
ctx.grotaTlo(false);
for (const id of ["topbar", "map", "tabbar", "panel"])
  sprawdz(!po(id).inert && !po(id).hasAttribute("aria-hidden"), `${id} znów dostępny`);
sprawdz(po("ukryty").getAttribute("aria-hidden") === "true", "element ukryty z innego powodu zostaje ukryty");

console.log("3. Fokus");
sprawdz(/attributeFilter: \["hidden"\]/.test(app) && /getElementById\("grota-widok"\)/.test(app),
  "obserwator atrybutu hidden na #grota-widok");
sprawdz(/getElementById\("g-tytul"\)\?\.focus/.test(app), "po otwarciu fokus na zaczep #g-tytul z modułu");
// Pierwsze otwarcie wczytuje moduł i punkty kilka sekund (emulator ~6,5 s), potem
// moduł przerysowuje panel — fokus ma iść za treścią modułu, nie za stałym czasem.
sprawdz(/observe\(grotaWidokEl, \{ childList: true, subtree: true \}\)/.test(app),
  "fokus podąża za przerysowaniem treści modułu (obserwator poddrzewa)");
sprawdz(/grotaWidokEl\.contains\(document\.activeElement\)\) return;/.test(app),
  "nie zabiera fokusu, gdy człowiek jest już w module");
sprawdz(/getElementById\("btn-grota"\)\?\.focus/.test(app), "po zamknięciu fokus wraca na przycisk GROTA");

console.log(`\nBŁĘDY: ${bledy}`);
process.exit(bledy ? 1 : 0);

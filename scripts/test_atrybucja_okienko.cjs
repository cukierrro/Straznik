// Atrybucja mapy: przycisk (i) i okienko obok niego (przegląd UI 14.10.2026).
//
// Wcześniej długi pasek przewijany palcem po pięciu sekundach zwijał się do (i)
// w tym samym miejscu — wyglądało to, jakby nowy guzik przykrywał pasek — a (i)
// otwierało to samo okno źródeł, co diody. Przy okazji wyszło, że w wersji
// angielskiej i ukraińskiej brakowało wymaganego przez OpenFreeMap
// „© OpenMapTiles”.
//
// Pilnujemy warunków licencyjnych, nie wyglądu:
// - NEPTUN, OpenFreeMap, OpenMapTiles i OpenStreetMap są w KAŻDYM języku
//   (NEPTUN — warunek korzystania z API; OpenMapTiles — warunek OpenFreeMap),
// - okienko jest widoczne przy starcie i zwija się dopiero po 5 s, po ruchu mapy
//   albo po „Zamknij” — tak pozwala wytyczna OSMF („Interactive maps”),
// - po zwinięciu zostaje (i), które otwiera okienko z powrotem.
//
// Uruchomienie: node scripts/test_atrybucja_okienko.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "frontend/app.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "frontend/i18n.js"), "utf8");
const css = fs.readFileSync(path.join(root, "frontend/style.css"), "utf8");

let bledy = 0;
function sprawdz(warunek, opis) {
  console.log(`${warunek ? "OK  " : "BŁĄD"} ${opis}`);
  if (!warunek) bledy++;
}

console.log("1. Wymagane nazwy w każdym języku");
const pl = (html.match(/<p id="attr-text">([\s\S]*?)<\/p>/) || [])[1] || "";
// W i18n.js atrybucję ustawiają dwa przypisania innerHTML: angielskie i ukraińskie.
const przypisania = [...i18n.matchAll(/attr\.innerHTML = ([\s\S]*?);\r?\n/g)].map(m => m[1]);
sprawdz(przypisania.length === 2, "i18n.js ma osobną atrybucję EN i UK");
const wersje = { PL: pl, EN: przypisania[0] || "", UK: przypisania[1] || "" };
for (const [jez, tekst] of Object.entries(wersje)) {
  for (const nazwa of ["neptun.in.ua", "openfreemap.org", "openmaptiles.org", "openstreetmap.org/copyright"])
    sprawdz(tekst.includes(nazwa), `${jez}: jest odnośnik ${nazwa}`);
  sprawdz(/©\s*<a[^>]*openmaptiles/.test(tekst), `${jez}: „© OpenMapTiles”`);
}

console.log("2. Pokazana przy starcie, zwijana zgodnie z OSMF");
sprawdz(/<div id="attribution" class="otwarta">/.test(html), "okienko jest otwarte od pierwszego renderu");
sprawdz(/aria-expanded="true"[^>]*aria-controls="attr-pop"|aria-controls="attr-pop"[^>]*aria-expanded="true"/.test(html.replace(/\s+/g, " ")),
  "(i) mówi czytnikowi, że okienko jest rozwinięte i które to");
sprawdz(/setTimeout\(zamknij, 5000\)/.test(js), "zwija się samo po pięciu sekundach");
sprawdz(/getElementById\("map"\)[\s\S]{0,200}addEventListener\("pointerdown"/.test(js), "dotknięcie mapy je zwija");
sprawdz(/key === "Escape"/.test(js.slice(js.indexOf('const attrEl = document.getElementById("attribution")'))),
  "Esc je zamyka");
sprawdz(/id="attr-x"[\s\S]{0,80}>Zamknij</.test(html), "przy zamykaniu jest słowo „Zamknij” (zasada 6)");
sprawdz(/<button id="attr-i"/.test(html), "po zwinięciu zostaje przycisk (i)");

console.log("3. Bez starego paska");
sprawdz(!/overflow-x:\s*auto[^}]*touch-action:\s*pan-x/.test(css), "nie ma już wiersza przewijanego palcem");
sprawdz(!/#attribution\.mini/.test(css) && !/mini-label/.test(js), "nie ma zwijania paska do kwadratu .mini");
const blokI = css.slice(css.indexOf("#attr-i {"), css.indexOf("}", css.indexOf("#attr-i {")));
sprawdz(/width:\s*44px/.test(blokI) && /height:\s*44px/.test(blokI), "(i) ma pole dotyku 44 px");

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko w porządku");
process.exit(bledy ? 1 : 0);

/* Język GROTY: skąd moduł bierze język i w jakiej kolejności.

   Ustalenie użytkownika z 14.10.2026: Strażnik w aplikacji idzie za językiem telefonu i NIC nie
   zapisuje przy starcie, a GROTA pyta po kolei: własny wybór w Grocie → wybór w Strażniku → język
   telefonu. Dzięki temu u kogoś, kto nigdy nie wybierał języka, obie części mówią tym samym językiem.
   Test powstał, bo jedyny strażnik tej kolejności (scripts/test_jezyk_zapis.cjs z gałęzi
   godziny-ciszy) został cofnięty razem z zapisem języka i nie trafi na main. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const KORZEN = path.join(__dirname, "..");
const PLIK = path.join(KORZEN, "grota", "jezyk.js");

function zaladuj(jezykTelefonu, pamiec) {
  // moduł sięga po `localStorage` i `navigator` wprost (bez `window.`), więc podstawiamy je jako
  // argumenty opakowania — inaczej trafiłby na globalne obiekty Node'a i nie zobaczyłby ani pamięci,
  // ani języka telefonu
  const localStorage_ = {
    getItem: (k) => (k in pamiec ? pamiec[k] : null),
    setItem: (k, v) => { pamiec[k] = String(v); },
  };
  const navigator_ = { languages: [jezykTelefonu], language: jezykTelefonu };
  const window_ = {
    localStorage: localStorage_, navigator: navigator_,
    addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {},
  };
  window_.window = window_;
  const kod = fs.readFileSync(PLIK, "utf-8");
  new Function("window", "globalThis", "document", "localStorage", "navigator", kod)(
    window_, window_, undefined, localStorage_, navigator_);
  return window_.GrotaJezyk;
}

const PRZYPADKI = [
  // [język telefonu, pamięć, oczekiwany język, po co]
  ["pl-PL", {}, "pl", "czysty telefon po polsku"],
  ["uk-UA", {}, "uk", "czysty telefon po ukraińsku"],
  ["de-DE", {}, "en", "język, którego nie mamy — angielski"],
  ["en-GB", { straznik_lang: "uk" }, "uk", "wybór w Strażniku ważniejszy niż telefon"],
  ["en-GB", { grota_lang: "pl", straznik_lang: "uk" }, "pl", "własny wybór w Grocie najważniejszy"],
  ["pl-PL", { straznik_lang: "zz" }, "pl", "nieznany zapis pomijany, nie wywraca Groty"],
];

for (const [telefon, pamiec, oczekiwany, po_co] of PRZYPADKI) {
  const J = zaladuj(telefon, { ...pamiec });
  assert.strictEqual(J.jezyk, oczekiwany, `${po_co}: telefon ${telefon}, pamięć ${JSON.stringify(pamiec)} → ${J.jezyk}, oczekiwano ${oczekiwany}`);
  console.log(`  OK   ${po_co}`);
}

// Samo wczytanie modułu nie może niczego zapisywać — Strażnik też przy starcie nic nie zapisuje.
const pamiec = {};
zaladuj("uk-UA", pamiec);
assert.deepStrictEqual(Object.keys(pamiec), [], `wczytanie jezyk.js zapisało: ${JSON.stringify(pamiec)}`);
console.log("  OK   samo wczytanie nic nie zapisuje");

console.log("OK: język GROTY — grota_lang → straznik_lang → telefon, bez zapisu przy starcie.");

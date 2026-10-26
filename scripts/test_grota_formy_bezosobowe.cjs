/* GROTA mówi do człowieka bezosobowo — bez form, które zakładają jego płeć.

   Ustalenie użytkownika z 26.10.2026. Wyszło przy przeglądzie ostrzeżenia o zmianie wykazu PSP:
   napisałem „Zapisałeś tu…”, a przy okazji znalazły się cztery starsze teksty z tym samym
   problemem — „Sprawdziłem to miejsce na miejscu”, „Nic nie znalazłem”, „Nie znalazłem tego adresu
   ani ulicy" i „obszar, który sam wybrałeś”. Aplikacja alarmowa nie ma powodu zgadywać, kim jest
   osoba po drugiej stronie, a w sytuacji zagrożenia takie potknięcie dodatkowo odciąga uwagę.

   Sprawdzamy TEKSTY PRZEZNACZONE DLA CZŁOWIEKA, czyli argumenty `T("…")` i klucze słowników —
   nie cały plik. Inaczej test potykałby się o zwykłe słowa kończące się tak samo („modułem”)
   i o komentarze w kodzie, które pisane są do nas, nie do użytkownika. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const KORZEN = path.join(__dirname, "..");
const PLIKI_UI = ["grota.js", "grota-core.js", "poradnik.js", "widok.js"];
const SLOWNIKI = ["jezyk-en.js", "jezyk-uk.js"];

// formy czasu przeszłego zdradzające płeć: „zapisałeś”, „sprawdziłam”, „znalazłem”…
/* Uwaga:  w JavaScripcie liczy tylko znaki ASCII, więc po „ś” granica słowa wypada
   w złym miejscu i „Zapisałeś” nie zostaje dopasowane — ta sama pułapka, co przy słowie
   „schroń” w test_grota_slowo_schron.cjs. Zamiast  patrzymy, że dalej nie ma polskiej litery. */
const FORMY = /[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]{2,}(łeś|łaś|łem|łam)(?![a-ząćęłńóśźż])/g;
// „modułem”, „posiłkiem” — rzeczowniki w narzędniku, nie formy osobowe
const WYJATKI = /^(modułem|posiłkiem|wysiłkiem|przedziałem|działem|udziałem|sygnałem|materiałem|kanałem)$/i;

function tekstyDlaCzlowieka(kod) {
  /* Wyciągamy pierwszy argument każdego wywołania T("…") albo T('…'). Prosty parser wystarcza,
     bo to nasze własne pliki i nie zdarzają się w nich zagnieżdżone cudzysłowy tego samego typu. */
  const out = [];
  for (const m of kod.matchAll(/\bT\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) out.push(m[2]);
  return out;
}

function kluczeSlownika(kod) {
  const out = [];
  for (const m of kod.matchAll(/^\s*"((?:\\.|[^"])+)"\s*:/gm)) out.push(m[1]);
  return out;
}

const znalezione = [];
for (const plik of PLIKI_UI) {
  const pelna = path.join(KORZEN, "grota", plik);
  if (!fs.existsSync(pelna)) continue;
  for (const tekst of tekstyDlaCzlowieka(fs.readFileSync(pelna, "utf-8"))) {
    for (const m of tekst.match(FORMY) || []) {
      if (!WYJATKI.test(m)) znalezione.push(`${plik}: „${m}” w „${tekst.slice(0, 70)}…”`);
    }
  }
}
for (const plik of SLOWNIKI) {
  const pelna = path.join(KORZEN, "grota", plik);
  if (!fs.existsSync(pelna)) continue;
  for (const klucz of kluczeSlownika(fs.readFileSync(pelna, "utf-8"))) {
    for (const m of klucz.match(FORMY) || []) {
      if (!WYJATKI.test(m)) znalezione.push(`${plik} (klucz): „${m}” w „${klucz.slice(0, 70)}…”`);
    }
  }
}

if (znalezione.length) {
  console.error(`BŁĄD: ${znalezione.length} tekstów zakłada płeć czytelnika:`);
  for (const z of znalezione.slice(0, 20)) console.error("  ", z);
  console.error("Napisz je bezosobowo, np. „Sprawdzone na miejscu” zamiast „Sprawdziłem to miejsce”.");
  process.exit(1);
}

// kontrola samego testu: gdyby wzorzec przestał cokolwiek łapać, test świeciłby na zielono nad niczym
assert.ok("Zapisałeś tu schronienie".match(FORMY), "wzorzec nie wykrywa formy „Zapisałeś” — test byłby ślepy");
assert.ok(!"Sprawdzone na miejscu".match(FORMY), "wzorzec fałszywie oskarża poprawny tekst");
assert.ok(WYJATKI.test("modułem"), "lista wyjątków nie chroni zwykłych rzeczowników");

const ile = PLIKI_UI.filter((p) => fs.existsSync(path.join(KORZEN, "grota", p))).length;
console.log(`OK: teksty GROTY dla człowieka są bezosobowe (${ile} plików interfejsu + ${SLOWNIKI.length} słowniki)`);

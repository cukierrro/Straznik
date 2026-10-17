/* GROTA nie wysyła ludzi „do schronu”.

   Decyzja użytkownika z 15.10.2026: wykaz PSP to MIEJSCA SCHRONIENIA, nie schrony — w 1.7.95
   poprawiony został ekran alarmu Strażnika („przejdź do miejsca schronienia”), a od 1.7.96 ta sama
   zasada obowiązuje w module GROTY. Słowo „schron” zostaje tylko tam, gdzie jest nazwą kategorii
   z ustawy i z wykazu PSP (schron / ukrycie / miejsce doraźnego schronienia) albo cytatem tego,
   czego szuka człowiek („Czemu nie ma tu »schronów«?”). Każde nowe użycie ma przejść przez decyzję,
   a nie wejść niepostrzeżenie — dlatego lista dozwolonych miejsc jest zamknięta.

   Szukamy wyłącznie RZECZOWNIKA „schron” w odmianie; „schronienie”, „schronisko” i czasowniki
   („gdzie się schronić”) to inne słowa i ich nie dotyczy.

   Sprawdzamy WYEKSPORTOWANY moduł (grota/), czyli to, co trafia do aplikacji. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const GROTA = path.join(__dirname, "..", "grota");
const PLIKI = ["grota.js", "poradnik.js", "jezyk-en.js", "jezyk-uk.js", "widok.js", "grota-core.js", "offline.js", "trasa-lokalna.js"];

// Zwroty, którymi nie wolno nikogo nigdzie wysyłać — to właśnie je zdjął user z ekranu alarmu.
const ZAKAZANE = [
  /do\s+schronu\b/i, /do\s+schronów\b/i, /w\s+schronie\b/i, /ze\s+schronu\b/i,
  /najbliższy\s+schron\b/i, /najbliższego\s+schronu\b/i, /znajdź\s+schron\b/i,
];

/* Dozwolone użycia: kategoria z ustawy i wykazu PSP oraz cytat oczekiwania czytelnika.
   Fragment musi być na tyle długi, żeby nie przepuścił przypadkowego zdania. */
const DOZWOLONE = [
  "Czemu nie ma tu „schronów”?",
  "nie rozróżniają schronu, ukrycia i miejsca doraźnego schronienia",
  "rodzaju obiektu (schron / ukrycie / miejsce doraźne)",
  "Dlaczego w Grocie nie ma „schronów”",
  "wykazała w Polsce 1 903 schrony",
  "punkty schronienia bez etykiety „schron”",
  "dlaczego nie ma kategorii „schron”",            // komentarz przy stanie infoSchrony
  'INFO_KEY = "grota_info_schrony"',               // klucz w pamięci telefonu, nie tekst na ekranie
];

/* Granicy słowa \b w JavaScripcie nie wolno tu użyć: zna tylko znaki ASCII, więc „ń” w „schronień”
   wygląda dla niej jak koniec wyrazu i dopełniacz od „schronienie” wpadał jako „schronie”.
   Dlatego z obu stron pilnujemy, że nie ma dalej polskiej litery. */
const RZECZOWNIK = /(?<![a-ząćęłńóśźż])schron(a|u|owi|em|ie|y|ów|om|ami|ach)?(?![a-ząćęłńóśźż])/gi;

let sprawdzonych = 0, zle = 0;
for (const nazwa of PLIKI) {
  const sciezka = path.join(GROTA, nazwa);
  if (!fs.existsSync(sciezka)) continue;
  const tekst = fs.readFileSync(sciezka, "utf-8");
  sprawdzonych++;

  for (const wzor of ZAKAZANE) {
    const m = tekst.match(wzor);
    assert(!m, `${nazwa}: „${m && m[0]}” — GROTA ma kierować do MIEJSCA SCHRONIENIA, nie do schronu`);
  }

  RZECZOWNIK.lastIndex = 0;
  let m;
  while ((m = RZECZOWNIK.exec(tekst))) {
    const otoczenie = tekst.slice(Math.max(0, m.index - 70), m.index + 70);
    if (DOZWOLONE.some((d) => otoczenie.includes(d))) continue;
    console.error(`  NOWE UŻYCIE  ${nazwa}: …${otoczenie.replace(/\s+/g, " ").trim()}…`);
    zle++;
  }
}

assert(sprawdzonych >= 6, `sprawdzono tylko ${sprawdzonych} plików modułu — zła ścieżka?`);
assert(zle === 0, `${zle} użyć słowa „schron” poza listą dozwolonych — potrzebna decyzja, nie cichy commit`);
console.log(`OK: w ${sprawdzonych} plikach GROTY „schron” tylko jako nazwa kategorii z ustawy i wykazu PSP; żadne zdanie nie wysyła do schronu.`);

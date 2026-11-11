/* Akapit „Przesunięte szpilki" — liczby i odmiana po przebudowie paczki.

   Powstał 09.11.2026, bo przy wykazie z 06.11 skrypt `tools/liczby_w_zasadach.py` wypisał
   do instrukcji w aplikacji zdanie „54 punkty nie mająją żadnego budynku". Przyczyna:
   w wyrażeniu `nie m(?:a|ają)` alternatywa próbowała najpierw krótszej formy, dopasowywała
   samo „nie ma" wewnątrz „nie mają" i zostawiała za podmianą sierotę „ją". Poprawka w skrypcie
   odwraca kolejność, ale sama poprawka nie wystarczy: ten akapit jest przepisywany automatycznie
   przy KAŻDEJ cotygodniowej przebudowie wykazu, a czyta go człowiek, który sprawdza, czy może
   zaufać szpilce na mapie. Dlatego pilnujemy tu wyniku, nie skryptu.

   Czego pilnujemy:
     1. liczby w akapicie trzymają się kupy: 30 m + 30–60 m + 60–150 m + bez budynku = wszystkie
        punkty poza budynkiem (ta suma łapie podmianę, która trafiła tylko część zdań),
     2. polska odmiana zgadza się z liczbą: „1027 punktów … nie stoi", ale „54 punkty … nie mają",
     3. zdanie kończy się tak, jak powinno — żadnych resztek w rodzaju „mająją" ani urwanego zdania,
     4. angielska i ukraińska wersja podają TE SAME liczby (i ukraińską odmianę rzeczownika),
     5. sam ten test naprawdę odrzuca zepsute zdanie — na końcu puszczamy go na prawdziwym
        tekście z 06.11 i oczekujemy, że go odrzuci. Test, który tylko sprawdza, czy zdanie
        istnieje, świeciłby na zielono nad zepsutym mechanizmem. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const KORZEN = path.join(__dirname, "..");
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, "grota", p), "utf-8");

const mnoga = (n) => [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100);
const liczba = (s) => parseInt(s.replace(/[^\d]/g, ""), 10);

function jeden(tekst, wzor, co) {
  const t = tekst.match(wzor);
  assert.ok(t, `nie znalazłem w tekście: ${co} (wzór ${wzor})`);
  return t;
}

/* Polski akapit — źródło liczb i jedyne miejsce, gdzie odmiana zależy od wyniku pomiaru. */
function sprawdzPL(pl) {
  const a = jeden(pl, /<b>(\d[\d \u00a0]*) (punkty|punktów)<\/b> \((\d+,\d)%\) (nie stoi|nie stoją) na żadnym budynku\./,
    "zdanie o punktach poza budynkiem");
  const daleko = liczba(a[1]);
  assert.strictEqual(a[2], mnoga(daleko) ? "punkty" : "punktów",
    `„${daleko} ${a[2]}" — zła forma rzeczownika`);
  assert.strictEqual(a[4], mnoga(daleko) ? "nie stoją" : "nie stoi",
    `„${daleko} ${a[2]} … ${a[4]}" — czasownik nie zgadza się z liczbą`);

  const do30 = liczba(jeden(pl, /Przy (\d+) z nich budynek jest w promieniu 30 m/, "próg 30 m")[1]);
  const m30 = liczba(jeden(pl, /przy (\d+) w 30–60 m/, "próg 30–60 m")[1]);
  const m60 = liczba(jeden(pl, /przy (\d+) w 60–150 m/, "próg 60–150 m")[1]);

  /* Ciąg dalszy zdania jest tu częścią asercji: to on łapie resztkę po podmianie. */
  const b = jeden(pl, /<b>(\d+) (punkty|punktów) (nie mają|nie ma) żadnego budynku w promieniu 150 m<\/b>/,
    "zdanie o braku budynku w 150 m");
  const brak = liczba(b[1]);
  assert.strictEqual(b[2], mnoga(brak) ? "punkty" : "punktów",
    `„${brak} ${b[2]}" — zła forma rzeczownika`);
  assert.strictEqual(b[3], mnoga(brak) ? "nie mają" : "nie ma",
    `„${brak} ${b[2]} ${b[3]}" — czasownik nie zgadza się z liczbą`);

  assert.strictEqual(do30 + m30 + m60 + brak, daleko,
    `liczby się nie sumują: ${do30} + ${m30} + ${m60} + ${brak} ≠ ${daleko}`);
  return { daleko, do30, m30, m60, brak, procent: a[3] };
}

function sprawdzEN(en, w) {
  const a = jeden(en, /<b>([\d,]+) points<\/b> \((\d+\.\d)%\)/, "angielskie zdanie o punktach");
  assert.strictEqual(liczba(a[1]), w.daleko, "angielska liczba punktów poza budynkiem ≠ polska");
  assert.strictEqual(a[2].replace(".", ","), w.procent, "angielski procent ≠ polski");
  assert.strictEqual(liczba(jeden(en, /For (\d+) of them/, "angielski próg 30 m")[1]), w.do30);
  assert.strictEqual(liczba(jeden(en, /for (\d+) within 30–60 m/, "angielski próg 30–60 m")[1]), w.m30);
  assert.strictEqual(liczba(jeden(en, /for (\d+) within 60–150 m/, "angielski próg 60–150 m")[1]), w.m60);
  assert.strictEqual(
    liczba(jeden(en, /<b>(\d+) points have no building within 150 m<\/b>/, "angielskie zdanie o 150 m")[1]),
    w.brak, "angielska liczba punktów bez budynku ≠ polska");
}

function sprawdzUK(uk, w) {
  const a = jeden(uk, /<b>(\d[\d \u00a0]*) (пункти|пунктів)<\/b> \((\d+,\d)%\)/, "ukraińskie zdanie o punktach");
  assert.strictEqual(liczba(a[1]), w.daleko, "ukraińska liczba punktów poza budynkiem ≠ polska");
  assert.strictEqual(a[3], w.procent, "ukraiński procent ≠ polski");
  assert.strictEqual(liczba(jeden(uk, /Для (\d+) з них/, "ukraiński próg 30 m")[1]), w.do30);
  assert.strictEqual(liczba(jeden(uk, /для (\d+) — у 30–60 м/, "ukraiński próg 30–60 m")[1]), w.m30);
  assert.strictEqual(liczba(jeden(uk, /для (\d+) — у 60–150 м/, "ukraiński próg 60–150 m")[1]), w.m60);

  const b = jeden(uk, /<b>(\d+) (пункт|пункти|пунктів) (не має|не мають) жодної будівлі в радіусі 150 м<\/b>/,
    "ukraińskie zdanie o 150 m");
  const brak = liczba(b[1]);
  assert.strictEqual(brak, w.brak, "ukraińska liczba punktów bez budynku ≠ polska");
  /* ukraiński: 51 пункт, 52 пункти, 55 пунктів */
  const poj = brak % 10 === 1 && brak % 100 !== 11;
  assert.strictEqual(b[2], poj ? "пункт" : (mnoga(brak) ? "пункти" : "пунктів"),
    `„${brak} ${b[2]}" — zła ukraińska forma rzeczownika`);
  assert.strictEqual(b[3], poj ? "не має" : "не мають",
    `„${brak} ${b[2]} ${b[3]}" — ukraiński czasownik nie zgadza się z liczbą`);
}

const przypadki = [];
const przypadek = (nazwa, fn) => przypadki.push({ nazwa, fn });

przypadek("polski akapit: liczby się sumują, odmiana zgadza się z liczbą", () => {
  const w = sprawdzPL(czytaj("grota.js"));
  assert.ok(w.daleko > 0 && w.daleko < 10000, `nieprawdopodobna liczba punktów poza budynkiem: ${w.daleko}`);
});

przypadek("angielskie tłumaczenie podaje te same liczby", () => {
  sprawdzEN(czytaj("jezyk-en.js"), sprawdzPL(czytaj("grota.js")));
});

przypadek("ukraińskie tłumaczenie podaje te same liczby i poprawną odmianę", () => {
  sprawdzUK(czytaj("jezyk-uk.js"), sprawdzPL(czytaj("grota.js")));
});

przypadek("ten test odrzuca zdanie zepsute przez podmianę (prawdziwy błąd z 06.11.2026)", () => {
  const zepsute = 'Sprawdziliśmy to na danych z całej Polski: <b>1027 punktów</b> (1,2%) nie stoi '
    + 'na żadnym budynku. Przy 620 z nich budynek jest w promieniu 30 m, przy 247 w 30–60 m, '
    + 'przy 106 w 60–150 m, a <b>54 punkty nie mająją żadnego budynku w promieniu 150 m</b> — koniec.';
  assert.throws(() => sprawdzPL(zepsute), /zdanie o braku budynku/,
    "test przepuścił zdanie z „mająją” — nie pilnuje tego, po co powstał");

  const zlaSuma = zepsute.replace("mająją", "mają").replace("Przy 620", "Przy 600");
  assert.throws(() => sprawdzPL(zlaSuma), /nie sumują/,
    "test przepuścił liczby, które się nie sumują");

  const zlaOdmiana = zepsute.replace("mająją", "ma");
  assert.throws(() => sprawdzPL(zlaOdmiana), /nie zgadza się z liczbą/,
    "test przepuścił zdanie „54 punkty nie ma …”");
});

let padlo = 0;
for (const { nazwa, fn } of przypadki) {
  try { fn(); console.log("  OK  ", nazwa); }
  catch (e) { padlo++; console.error("  PADŁ", nazwa, "\n        ", e.message); }
}
if (padlo) { console.error(`\nBŁĄD: padło ${padlo} z ${przypadki.length}`); process.exit(1); }
console.log(`\nOK: liczby i odmiana w akapicie o przesuniętych szpilkach (${przypadki.length} przypadków)`);

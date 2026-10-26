/* Zapisane schronienie, które po nowym wykazie PSP jest już czym innym.

   Powstał 26.10.2026, po wykazie, w którym PSP przepisało 31 identyfikatorów na inne obiekty.
   Prawdziwy przypadek: OZO-852EACB93576 był piwnicą pod adresem „51a, Kromolice, gm. Pogorzela",
   a w wykazie z 26.10 ten sam numer wskazuje „os. Osiedle Gawrony 2, Gostyń" — 23,3 km dalej,
   przy okazji zamknięte („Na żądanie"). GROTA zapisuje wybrane schronienia jako listę
   IDENTYFIKATORÓW, więc bez tej kontroli człowiek dostałby po cichu inne miejsce pod swoim starym
   wpisem i w alarmie pobiegł pod adres, którego nigdy nie wybierał.

   Czego pilnujemy:
     1. przeniesiony punkt jest wykryty, ze starym adresem z paczki (w telefonie nie ma go skąd wziąć,
        bo paczka podmienia się razem z aplikacją — dlatego jedzie w niej lista `przeniesione`),
     2. punkt usunięty z wykazu też jest wykryty,
     3. punkt, który stoi w miejscu, NIE podnosi fałszywego alarmu,
     4. drugie sito — odległość od miejsca — działa nawet bez listy `przeniesione`,
     5. zamknięcie („Na żądanie") jest widoczne, bo zmienia plan na alarm. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");

const KORZEN = path.join(__dirname, "..");

const core = (() => {
  const window_ = {};
  for (const plik of ["poradnik.js", "grota-core.js"]) {
    new Function("window", fs.readFileSync(path.join(KORZEN, "grota", plik), "utf-8"))(window_);
  }
  return window_.GrotaCore;
})();
assert.ok(core && core.zmienioneSchronienia, "grota-core.js nie udostępnia zmienioneSchronienia");

// Kromolice (gm. Pogorzela) i Gostyń — prawdziwe położenia z wykazu, zaokrąglone do czterech miejsc
const DOM = { id: "m1", lat: 51.8186, lon: 17.2300, shelters: [], routes: {} };
const PUNKT_GOSTYN = { id: "OZO-852EACB93576", lat: 51.8839, lon: 17.0109, adres: "os. Osiedle Gawrony 2, Gostyń", dostep: "na_zadanie" };
const PUNKT_OBOK = { id: "OZO-BLISKI", lat: 51.8190, lon: 17.2310, adres: "12, Kromolice", dostep: "24h" };

const indeks = (...punkty) => new Map(punkty.map((p) => [p.id, p]));
const PRZENIESIONE = { "OZO-852EACB93576": { byl: "51a, Kromolice", gmina: "Pogorzela", m: 23300 } };

const przypadki = [];
const sprawdz = (nazwa, fn) => przypadki.push({ nazwa, fn });

sprawdz("przeniesiony punkt wykryty, ze starym adresem i zamknięciem", () => {
  const pl = { ...DOM, shelters: ["OZO-852EACB93576"], routes: { "OZO-852EACB93576": { coords: [] } } };
  const [z] = core.zmienioneSchronienia(pl, indeks(PUNKT_GOSTYN), PRZENIESIONE);
  assert.ok(z, "nie wykryto przeniesionego schronienia");
  assert.strictEqual(z.powod, "przeniesiony");
  assert.strictEqual(z.byl, "51a, Kromolice", "brak starego adresu — człowiek nie zrozumie, co się zmieniło");
  assert.strictEqual(z.bylaGmina, "Pogorzela");
  assert.strictEqual(z.przesuniecieM, 23300);
  assert.ok(z.zamkniete, "nowy obiekt jest „Na żądanie” — to musi być widać");
  // 16,7 km w linii prostej z Kromolic do Gostynia; 23,3 km to przesunięcie samego punktu
  assert.ok(z.odMiejscaM > 15000, `odległość od domu: ${z.odMiejscaM} m`);
});

sprawdz("punkt usunięty z wykazu też wymaga decyzji", () => {
  const pl = { ...DOM, shelters: ["OZO-ZNIKNAL"] };
  const [z] = core.zmienioneSchronienia(pl, indeks(PUNKT_GOSTYN), PRZENIESIONE);
  assert.ok(z, "zniknięty punkt ma być zgłoszony");
  assert.strictEqual(z.powod, "znikl");
  assert.strictEqual(z.punkt, undefined, "nie ma już czego pokazać na mapie");
});

sprawdz("punkt, który stoi w miejscu, nie podnosi alarmu", () => {
  const pl = { ...DOM, shelters: ["OZO-BLISKI"] };
  assert.deepStrictEqual(core.zmienioneSchronienia(pl, indeks(PUNKT_OBOK), PRZENIESIONE), [],
    "schronienie tuż obok domu nie może straszyć człowieka bez powodu");
});

sprawdz("daleko, ale w wykazie bez zmian — ANI SŁOWA", () => {
  /* Uwaga z przeglądu 26.10, najważniejsza w całym tym zadaniu: na wsi najbliższy punkt bywa dalej
     niż 3 km — dwa miliony ludzi ma ponad 5 km — a ostrzeżenie twierdziło wtedy wprost, że „pod tym
     numerem jest teraz inny obiekt". Dla kogoś, kto wybrał to schronienie świadomie i komu nic się
     nie zmieniło, byłoby to kategoryczne kłamstwo. Mówimy tylko o tym, co wiemy z wykazu. */
  const pl = { ...DOM, shelters: ["OZO-852EACB93576"] };
  assert.deepStrictEqual(core.zmienioneSchronienia(pl, indeks(PUNKT_GOSTYN), {}), [],
    "schronienie daleko od domu, ale niezmienione w wykazie, nie może podnosić alarmu");
});

sprawdz("poprawka współrzędnych to NIE jest „inny obiekt”", () => {
  /* PSP poprawia też błędne pozycje: punkt przy al. Sikorskiego na Mokotowie leżał 222 km dalej,
     na Kujawach. To wciąż ten sam budynek pod tym samym adresem, więc komunikat musi mówić
     o poprawionym położeniu, a nie o innym obiekcie. Rozpoznajemy po braku starego adresu. */
  const punkt = { id: "OZO-POPRAWIONY", lat: 52.19, lon: 21.02, adres: "al. Sikorskiego 3, Mokotów", dostep: "24h" };
  const pl = { ...DOM, shelters: ["OZO-POPRAWIONY"] };
  const [z] = core.zmienioneSchronienia(pl, indeks(punkt), { "OZO-POPRAWIONY": { m: 221900, od: "2026-09-14" } });
  assert.ok(z, "poprawiony punkt też wymaga uwagi człowieka");
  assert.strictEqual(z.powod, "poprawiony", `powód ma brzmieć „poprawiony", a jest „${z.powod}"`);
  assert.strictEqual(z.byl, null, "przy poprawce nie zmyślamy starego adresu");
  const grota = fs.readFileSync(path.join(KORZEN, "grota", "grota.js"), "utf-8");
  assert.ok(grota.includes("PSP poprawiło w wykazie{d} jego położenie"),
    "brak osobnego zdania dla poprawionego położenia");
});

sprawdz("lista przeniesień sięga wszystkich wydanych wykazów, nie tylko poprzedniego", () => {
  /* Kto pominął aktualizację, przeskakuje cały wykaz. Lista w paczce musi pamiętać przepisania
     z każdego wydanego wcześniej wykazu, inaczej taki człowiek nie dowie się o swoim schronieniu. */
  const paczka = JSON.parse(fs.readFileSync(path.join(KORZEN, "grota", "data", "polska.min.json"), "utf-8"));
  const wykazy = new Set(Object.values(paczka.przeniesione).map((w) => w.od).filter(Boolean));
  assert.ok(wykazy.size >= 1, "wpisy nie mówią, z którego wykazu pochodzi zapamiętany adres");
  const najstarszy = [...wykazy].sort()[0];
  assert.ok(najstarszy < paczka.data_danych, `najstarszy zapamiętany wykaz (${najstarszy}) ma być starszy niż paczka`);
  assert.ok(Object.keys(paczka.przeniesione).length > 31,
    "lista wygląda na zbudowaną tylko z ostatniego tygodnia — ktoś, kto pominął aktualizację, nic się nie dowie");
});

sprawdz("próg jest ten sam, co przy przeprowadzce (3 km)", () => {
  assert.strictEqual(core.PRZENIESIONE_M, 3000, "próg musi się zgadzać z DALEKIE_SCHRONIENIE_M w grota.js");
  const grota = fs.readFileSync(path.join(KORZEN, "grota", "grota.js"), "utf-8");
  const m = /DALEKIE_SCHRONIENIE_M\s*=\s*(\d+)/.exec(grota);
  assert.ok(m, "nie znalazłem DALEKIE_SCHRONIENIE_M w grota.js");
  assert.strictEqual(Number(m[1]), core.PRZENIESIONE_M, "dwa różne progi myliłyby człowieka i nas");
});

sprawdz("interfejs mówi wprost, co się stało i co trzeba zrobić", () => {
  /* Komunikat jest tu najważniejszy: ma nazwać przyczynę (wykaz PSP), pokazać stary i nowy adres
     oraz powiedzieć wprost, że wybór nowego schronienia jest konieczny. Sprawdzamy teksty w kodzie,
     bo to one trafiają do człowieka — i w trzech językach, bo GROTA mówi w trzech. */
  const grota = fs.readFileSync(path.join(KORZEN, "grota", "grota.js"), "utf-8");
  for (const fragment of [
    "Zmienił się wykaz PSP — sprawdź zapisane schronienia",
    "Wybór nowego miejsca schronienia jest konieczny.",
    "Zapisane tu schronienie: {stary}.",
    "Nowy obiekt jest <b>zamknięty („Na żądanie”)</b> — otwiera go zarządca.",
    "Nagrana trasa prowadzi do starego miejsca i jest nieaktualna.",
    "Nic nie usunęliśmy — decyzja należy do Ciebie.",
  ]) {
    assert.ok(grota.includes(fragment), `brak w interfejsie: „${fragment}”`);
  }
  for (const jezyk of ["jezyk-en.js", "jezyk-uk.js"]) {
    const slownik = fs.readFileSync(path.join(KORZEN, "grota", jezyk), "utf-8");
    for (const klucz of ["Wybór nowego miejsca schronienia jest konieczny.", "Zapisane tu schronienie: {stary}.",
      "Zmienił się wykaz PSP — sprawdź zapisane schronienia"]) {
      assert.ok(slownik.includes(klucz), `${jezyk}: brak tłumaczenia dla „${klucz}”`);
    }
  }
  // nie prowadzimy nagraną trasą do punktu, który jest już czym innym
  assert.ok(/trasaNieaktualna\(pl, id\)/.test(grota), "showOwnRoute nie sprawdza, czy trasa jest jeszcze aktualna");
});

sprawdz("nowy adres bierzemy z paczki, a nie z pamięci", () => {
  /* Uwaga z przeglądu 26.10: w pierwszym pokazie podstawiłem punkt wybrany wyrażeniem /Gosty/, które
     pasuje także do Gostycyna w kujawsko-pomorskim — i opisałem jego adres jako adres punktu
     z Gostynia. Kod był dobry, pomyłka była moja, ale komunikat ma prostować cudzą pomyłkę, więc
     musi pokazywać adres dokładnie tego rekordu, który człowiek ma zapisany. */
  const paczka = JSON.parse(fs.readFileSync(path.join(KORZEN, "grota", "data", "polska.min.json"), "utf-8"));
  const iId = paczka.pola.indexOf("id"), iAdr = paczka.pola.indexOf("adres");
  const rekord = paczka.punkty.find((p) => p[iId] === "OZO-852EACB93576");
  assert.ok(rekord, "brak OZO-852EACB93576 w paczce — sprawdź, czy paczka jest z nowego wykazu");
  const adresZPaczki = rekord[iAdr];
  const punkt = { id: "OZO-852EACB93576", lat: rekord[paczka.pola.indexOf("lat")] / 1e6,
    lon: rekord[paczka.pola.indexOf("lon")] / 1e6, adres: adresZPaczki, dostep: "na_zadanie" };
  const pl = { ...DOM, shelters: ["OZO-852EACB93576"] };
  const [z] = core.zmienioneSchronienia(pl, indeks(punkt), PRZENIESIONE);
  assert.ok(z, "nie wykryto zmiany dla OZO-852EACB93576");
  assert.strictEqual(z.punkt.adres, adresZPaczki, "komunikat pokazałby inny adres niż ten z paczki");
  assert.ok(!/Gostycyn/.test(adresZPaczki), `w paczce pod tym numerem jest „${adresZPaczki}" — to nie ten rekord`);
});

sprawdz("definicja: co trafia na listę przeniesień", () => {
  /* Świadomie przyjęta definicja (26.10.2026), żeby nikt jej później nie zgadywał z kodu:
     na listę trafia punkt, który względem DOWOLNEJ wcześniej wydanej paczki przesunął się
     o co najmniej 3 km — niezależnie od tego, czy zmienił gminę. Rozróżniamy potem dwa przypadki:
       • zmienił się adres  → „przeniesiony": pod tym numerem jest inny obiekt (pole `byl`),
       • adres bez zmian    → „poprawiony": PSP poprawiło współrzędne tego samego obiektu.
     Progu nie wiążemy ze zmianą gminy, bo człowieka obchodzi odległość do jego schronienia,
     a nie granica administracyjna: przepisanie w obrębie jednej gminy (Toruń → inna ulica, 5,6 km)
     jest dla niego tak samo ważne jak przeniesienie do sąsiedniej. */
  const paczka = JSON.parse(fs.readFileSync(path.join(KORZEN, "grota", "data", "polska.min.json"), "utf-8"));
  const wpisy = Object.values(paczka.przeniesione);
  assert.ok(wpisy.length, "pusta lista przeniesień — sprawdź, czy uruchomiono tools/przeniesione.py");
  assert.ok(wpisy.every((w) => w.m >= 3000), "na liście jest wpis poniżej progu 3 km");
  assert.ok(wpisy.some((w) => w.byl), "brak przypadków z nowym adresem (przeniesionych)");
  assert.ok(wpisy.some((w) => !w.byl), "brak przypadków bez zmiany adresu (poprawki współrzędnych)");
});

sprawdz("paczka niesie listę przeniesień razem z danymi", () => {
  /* Stary adres musi przyjechać z paczką: w telefonie nie ma go skąd wziąć, bo paczka podmienia się
     razem z aplikacją. Pole bywa puste (gdy nic się nie przesunęło) — ale musi istnieć. */
  const paczka = JSON.parse(fs.readFileSync(path.join(KORZEN, "grota", "data", "polska.min.json"), "utf-8"));
  assert.ok(Object.prototype.hasOwnProperty.call(paczka, "przeniesione"),
    "paczka nie ma pola `przeniesione` — uruchom py tools/przeniesione.py po przebudowie");
  for (const [id, w] of Object.entries(paczka.przeniesione)) {
    assert.ok(/^OZO-/.test(id), `dziwny identyfikator w przeniesieniach: ${id}`);
    assert.ok(typeof w.m === "number" && w.m >= 3000, `${id}: przesunięcie ${w.m} m poniżej progu`);
  }
});

let padlo = 0;
for (const { nazwa, fn } of przypadki) {
  try { fn(); console.log("  OK  ", nazwa); }
  catch (e) { padlo++; console.error("  PADŁ", nazwa, "\n        ", e.message); }
}
if (padlo) { console.error(`\nBŁĄD: padło ${padlo} z ${przypadki.length}`); process.exit(1); }
console.log(`\nOK: zapisane schronienia po zmianie wykazu PSP (${przypadki.length} przypadków)`);

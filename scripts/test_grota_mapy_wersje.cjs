/* Mapy offline GROTY: skąd telefon wie, że ma starą mapę, i czy potrafi ją podmienić.

   Powstał 24.10.2026. Mapa pobrana do telefonu nie starzeje się sama: kafelki leżą w IndexedDB,
   a pobieranie z założenia pomija to, co telefon już ma. Po przebudowie paczek (świeższy
   OpenStreetMap) człowiek trzymałby więc starą mapę i nikt by mu o tym nie powiedział.
   Test pilnuje czterech rzeczy naraz, bo każda z osobna wygląda na działającą:
     1. przy pobraniu zapisujemy wersję (nazwa pliku + początek sumy sha256) i obszar,
     2. nowsza wersja na serwerze jest wykrywana, a identyczna NIE podnosi fałszywego alarmu,
     3. aktualizacja naprawdę nadpisuje kafelki (bez tego cała reszta byłaby teatrem),
     4. przerwanie w połowie zostawia prawdę: zapisane są tylko części, które weszły w całości,
        a następne podejście dobiera resztę zamiast ciągnąć wszystko od nowa.

   Telefonu nie ma, więc podstawiamy atrapy: serwer paczek (z zakresami bajtów i nagłówkiem
   Content-Range, bo offline.js sprawdza długość pliku wobec spisu), IndexedDB, localStorage
   i fflate. Atrapy są celowo proste — mają sprawdzać NASZ kod, nie udawać przeglądarki. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert"), zlib = require("zlib");

const KORZEN = path.join(__dirname, "..");
const PLIK = path.join(KORZEN, "grota", "offline.js");

/* ---------- budowanie paczki w pamięci (format GRP1, jak tools/paczki/buduj.cjs) ---------- */

function czescGRP1({ obszar, nr, tresc, komorki = ["1100/680"] }) {
  const kaf = komorki.map((k) => zlib.gzipSync(Buffer.from(`${k}|${tresc}`)));
  const graf = komorki.map((k) => zlib.gzipSync(Buffer.from(`graf|${k}|${tresc}`)));
  const ogolny = zlib.gzipSync(Buffer.from(`przeglad|${tresc}`));
  const kafelki = [], grafIdx = [];
  let off = 0;
  const kawalki = [];
  kafelki.push([9, 275, 170, off, ogolny.length]); kawalki.push(ogolny); off += ogolny.length;
  komorki.forEach((k, i) => {
    const [x, y] = k.split("/").map(Number);
    kafelki.push([11, x, y, off, kaf[i].length]); kawalki.push(kaf[i]); off += kaf[i].length;
  });
  komorki.forEach((k, i) => {
    const [x, y] = k.split("/").map(Number);
    grafIdx.push([x, y, off, graf[i].length]); kawalki.push(graf[i]); off += graf[i].length;
  });
  const h = { format: "GRP1", wersja: 1, obszar, czesc: nr, czesci: 1, z_grafu: 11,
    komorki, kafelki, graf: grafIdx };
  const nag = Buffer.from(JSON.stringify(h), "utf-8");
  const dl = Buffer.alloc(4); dl.writeUInt32LE(nag.length, 0);
  return Buffer.concat([Buffer.from("GRP1", "ascii"), dl, nag, ...kawalki]);
}

const sha = (b) => require("crypto").createHash("sha256").update(b).digest("hex");

/* Spis dokładnie w kształcie, jaki układa tools/paczki/spis.cjs. `ogolne` i `komorki` są tym,
   z czego offline.js liczy rozmiar pobrania, zanim cokolwiek ściągnie. */
function spisZCzesci(wpisy, utworzono) {
  const obszary = {};
  for (const { plik, obszar, bufor, komorki } of wpisy) {
    const kom = {};
    for (const k of komorki) kom[k] = [500, 300];
    const o = (obszary[obszar] = obszary[obszar] || { czesci: [], bajty: 0, bbox: [14, 49, 24, 55] });
    o.czesci.push({ plik, obszar, czesc: o.czesci.length + 1, czesci: 1, bajty: bufor.length,
      sha256: sha(bufor), bbox: [14, 49, 24, 55], ogolne: 200, komorki: kom,
      rozpakowane: { mapa: 1.3, graf: 1.3 } });
    o.bajty += bufor.length;
  }
  return { format: "GROTA-SPIS", wersja: 1, utworzono, obszary };
}

/* ---------- atrapy przeglądarki ---------- */

function atrapaSerwera(pliki, spis) {
  const licznik = { zakresy: 0, bajty: 0, spisy: 0 };
  async function fetchAtrapa(url, opcje = {}) {
    if (url.endsWith("/spis.bin")) {
      licznik.spisy++;
      return { ok: true, status: 200, text: async () => JSON.stringify(spis), headers: { get: () => null } };
    }
    const nazwa = url.split("/").pop();
    const b = pliki.get(nazwa);
    if (!b) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    const zakres = /bytes=(\d+)-(\d+)/.exec(opcje.headers?.Range || "");
    if (!zakres) return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    const od = Number(zakres[1]), doB = Math.min(Number(zakres[2]), b.length - 1);
    licznik.zakresy++; licznik.bajty += doB - od + 1;
    const wycinek = b.subarray(od, doB + 1);
    return { ok: true, status: 206,
      headers: { get: (h) => (h.toLowerCase() === "content-range" ? `bytes ${od}-${doB}/${b.length}` : null) },
      arrayBuffer: async () => wycinek.buffer.slice(wycinek.byteOffset, wycinek.byteOffset + wycinek.length) };
  }
  return { fetchAtrapa, licznik };
}

// IndexedDB w tyle, ile offline.js naprawdę używa: put, get, getAllKeys, count, clear.
function atrapaIndexedDB(dane = new Map()) {
  const zadanie = (wynik) => {
    const r = { result: wynik, onsuccess: null, onerror: null };
    setTimeout(() => r.onsuccess?.({ target: r }), 0);
    return r;
  };
  const sklep = (nazwa) => ({
    put: (v, k) => { dane.set(`${nazwa}:${k}`, v); return zadanie(undefined); },
    get: (k) => zadanie(dane.get(`${nazwa}:${k}`)),
    getAllKeys: () => zadanie([...dane.keys()].filter((k) => k.startsWith(`${nazwa}:`)).map((k) => k.slice(nazwa.length + 1))),
    count: () => zadanie([...dane.keys()].filter((k) => k.startsWith(`${nazwa}:`)).length),
    clear: () => { for (const k of [...dane.keys()]) if (k.startsWith(`${nazwa}:`)) dane.delete(k); return zadanie(undefined); },
  });
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    // zapis czeka na `oncomplete` transakcji — bez tego cały kod pobierania wisiałby w teście
    transaction: () => {
      const t = { objectStore: sklep, oncomplete: null, onerror: null, onabort: null };
      setTimeout(() => t.oncomplete?.(), 0);
      return t;
    },
  };
  return { dane, indexedDB: { open: () => { const r = zadanie(db); r.onupgradeneeded = null; return r; } } };
}

function atrapaLS(start = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _mapa: m };
}

function zaladuj({ pliki, spis, ls = atrapaLS(), dane }) {
  const { fetchAtrapa, licznik } = atrapaSerwera(pliki, spis);
  const idb = atrapaIndexedDB(dane);
  const window_ = {
    location: { hostname: "straznik.eu", port: "" },
    localStorage: ls,
    indexedDB: idb.indexedDB,
    navigator: {},
    fetch: fetchAtrapa,
    fflate: { gunzipSync: (u8) => new Uint8Array(zlib.gunzipSync(Buffer.from(u8))) },
    AbortController, TextDecoder, setTimeout, clearTimeout, Error,
  };
  window_.window = window_;
  new Function("window", "location", "localStorage", "indexedDB", "navigator", "fetch", "AbortController", "TextDecoder",
    fs.readFileSync(PLIK, "utf-8"))(
    window_, window_.location, ls, idb.indexedDB, window_.navigator, fetchAtrapa, AbortController, TextDecoder);
  return { O: window_.GrotaOffline, licznik, ls, dane: idb.dane };
}

/* ---------- przypadki ---------- */

const WRZESIEN = "2026-09-21T13:06:18.077Z";
const PAZDZIERNIK = "2026-10-24T08:00:00.000Z";
const KOMORKI = ["1100/680", "1100/681"];

function paczkaStara() {
  const bufor = czescGRP1({ obszar: "opolskie", nr: 1, tresc: "wrzesien", komorki: KOMORKI });
  return { plik: "opolskie-1.bin", obszar: "opolskie", bufor, komorki: KOMORKI };
}
function paczkaNowa() {
  const bufor = czescGRP1({ obszar: "opolskie", nr: 1, tresc: "pazdziernik", komorki: KOMORKI });
  return { plik: "opolskie-1.20261024.bin", obszar: "opolskie", bufor, komorki: KOMORKI };
}

const wyniki = [];
const sprawdz = (nazwa, fn) => wyniki.push({ nazwa, fn });

sprawdz("pobranie zapisuje wersję mapy i obszar", async () => {
  const c = paczkaStara();
  const spis = spisZCzesci([c], WRZESIEN);
  const { O } = zaladuj({ pliki: new Map([[c.plik, c.bufor]]), spis });
  const plan = O.planuj(spis, { obszary: ["opolskie"], komorki: null, trasy: true });
  await O.pobierzPlan({ id: "woj:opolskie", nazwa: "województwo opolskie", opcje: { obszary: ["opolskie"], komorki: null } }, plan, null);
  O.zakoncz?.();
  const [p] = O.paczki();
  assert.ok(p, "paczka nie została zapisana");
  assert.strictEqual(p.spis, WRZESIEN, "nie zapisano wersji spisu");
  assert.ok(Array.isArray(p.czesci) && p.czesci.length === 1, `oczekiwano jednej części, jest ${JSON.stringify(p.czesci)}`);
  assert.ok(p.czesci[0].startsWith("opolskie-1.bin:"), `zły znacznik części: ${p.czesci[0]}`);
  assert.deepStrictEqual(p.opcje, { obszary: ["opolskie"], komorki: null }, "nie zapisano obszaru pobrania");
  assert.ok(!p.niepelna, "pełne pobranie nie powinno być oznaczone jako niepełne");
});

sprawdz("ten sam spis = cisza, nowszy = informacja o nowszej mapie", async () => {
  const stara = paczkaStara(), nowa = paczkaNowa();
  const spisWrzesien = spisZCzesci([stara], WRZESIEN);
  const { O, ls, dane } = zaladuj({ pliki: new Map([[stara.plik, stara.bufor]]), spis: spisWrzesien });
  const plan = O.planuj(spisWrzesien, { obszary: ["opolskie"], komorki: null, trasy: true });
  await O.pobierzPlan({ id: "woj:opolskie", nazwa: "województwo opolskie", opcje: { obszary: ["opolskie"], komorki: null } }, plan, null);
  O.zakoncz?.();
  assert.deepStrictEqual(O.doAktualizacji(spisWrzesien), [], "ten sam spis nie może podnosić alarmu");

  // ten sam telefon, nowy spis na serwerze
  const spisPazdziernik = spisZCzesci([nowa], PAZDZIERNIK);
  const drugi = zaladuj({ pliki: new Map([[nowa.plik, nowa.bufor]]), spis: spisPazdziernik, ls, dane });
  const lista = drugi.O.doAktualizacji(spisPazdziernik);
  assert.strictEqual(lista.length, 1, "nowsza mapa nie została wykryta");
  assert.strictEqual(lista[0].id, "woj:opolskie");
  assert.strictEqual(lista[0].wersjaSerwera, PAZDZIERNIK);
  assert.ok(lista[0].bajty > 0, "rozmiar aktualizacji musi być znany przed pobraniem");
});

sprawdz("wpis sprzed zapisywania wersji: cisza przy starym spisie, informacja przy nowym", async () => {
  const stara = paczkaStara();
  const bezWersji = [{ id: "woj:opolskie", nazwa: "województwo opolskie", trasy: true, bajtow: 1000, data: "2026-10-01" }];
  const ls = atrapaLS({ grota_paczki: JSON.stringify(bezWersji) });
  const spisWrzesien = spisZCzesci([stara], WRZESIEN);
  const a = zaladuj({ pliki: new Map([[stara.plik, stara.bufor]]), spis: spisWrzesien, ls });
  assert.deepStrictEqual(a.O.doAktualizacji(spisWrzesien), [], "stary wpis przy tym samym spisie ma być uznany za aktualny");

  const nowa = paczkaNowa();
  const b = zaladuj({ pliki: new Map([[nowa.plik, nowa.bufor]]), spis: spisZCzesci([nowa], PAZDZIERNIK), ls });
  const lista = b.O.doAktualizacji(spisZCzesci([nowa], PAZDZIERNIK));
  assert.strictEqual(lista.length, 1, "stary wpis przy nowszym spisie ma dostać informację");
  assert.ok(lista[0].bezWersji, "powinno być widać, że wersja nie była zapisana");
});

sprawdz("aktualizacja naprawdę nadpisuje kafelki w telefonie", async () => {
  const stara = paczkaStara(), nowa = paczkaNowa();
  const spisWrzesien = spisZCzesci([stara], WRZESIEN);
  const pierwszy = zaladuj({ pliki: new Map([[stara.plik, stara.bufor]]), spis: spisWrzesien });
  const plan = pierwszy.O.planuj(spisWrzesien, { obszary: ["opolskie"], komorki: null, trasy: true });
  await pierwszy.O.pobierzPlan({ id: "woj:opolskie", nazwa: "opolskie", opcje: { obszary: ["opolskie"], komorki: null } }, plan, null);
  pierwszy.O.zakoncz?.();
  const tresc = (d, k) => new TextDecoder().decode(new Uint8Array(d.get(`kafelki:${k}`)));
  assert.ok(tresc(pierwszy.dane, "11/1100/680").includes("wrzesien"), "w telefonie miała być wrześniowa mapa");

  const spisPazdziernik = spisZCzesci([nowa], PAZDZIERNIK);
  const drugi = zaladuj({ pliki: new Map([[nowa.plik, nowa.bufor]]), spis: spisPazdziernik, ls: pierwszy.ls, dane: pierwszy.dane });
  const [stan] = drugi.O.doAktualizacji(spisPazdziernik);
  await drugi.O.pobierzPlan({ id: "woj:opolskie", nazwa: "opolskie", opcje: { obszary: ["opolskie"], komorki: null } },
    stan.plan, null, { nadpisz: true, zachowaj: stan.zachowaj });
  drugi.O.zakoncz?.();
  assert.ok(tresc(pierwszy.dane, "11/1100/680").includes("pazdziernik"), "kafelek nie został nadpisany nową wersją");
  assert.deepStrictEqual(drugi.O.doAktualizacji(spisPazdziernik), [], "po aktualizacji mapa ma być uznana za aktualną");
  const [p] = drugi.O.paczki();
  assert.ok(p.czesci[0].startsWith("opolskie-1.20261024.bin:"), `po aktualizacji zła wersja w zapisie: ${p.czesci[0]}`);
});

sprawdz("przerwana aktualizacja zapisuje tylko części, które weszły w całości", async () => {
  // dwie części: pierwsza przechodzi, na drugiej przerywamy
  const a1 = { plik: "opolskie-1.20261024.bin", obszar: "opolskie", komorki: ["1100/680"],
    bufor: czescGRP1({ obszar: "opolskie", nr: 1, tresc: "nowa-a", komorki: ["1100/680"] }) };
  const a2 = { plik: "opolskie-2.20261024.bin", obszar: "opolskie", komorki: ["1100/681"],
    bufor: czescGRP1({ obszar: "opolskie", nr: 2, tresc: "nowa-b", komorki: ["1100/681"] }) };
  const spis = spisZCzesci([a1, a2], PAZDZIERNIK);
  const start = [{ id: "woj:opolskie", nazwa: "opolskie", trasy: true, bajtow: 10, data: "2026-09-25",
    spis: WRZESIEN, czesci: ["opolskie-1.bin:aaaaaaaaaaaaaaaa"], opcje: { obszary: ["opolskie"], komorki: null } }];
  const ls = atrapaLS({ grota_paczki: JSON.stringify(start) });
  const { O } = zaladuj({ pliki: new Map([[a1.plik, a1.bufor], [a2.plik, a2.bufor]]), spis, ls });
  const [stan] = O.doAktualizacji(spis);
  assert.strictEqual(stan.plan.czesci.length, 2, "do pobrania powinny być obie części");

  let widziane = 0;
  const wynik = await O.pobierzPlan({ id: "woj:opolskie", nazwa: "opolskie", opcje: { obszary: ["opolskie"], komorki: null } },
    stan.plan, () => { if (++widziane === 4) O.anuluj(); }, { nadpisz: true, zachowaj: stan.zachowaj });
  O.zakoncz?.();
  assert.ok(wynik.anulowane, "pobranie miało zostać przerwane");
  const [p] = O.paczki();
  assert.ok(p.niepelna, "przerwana aktualizacja ma być oznaczona jako niepełna");
  assert.ok(p.czesci.length < 2, `zapisano ${p.czesci.length} części, a druga nie zdążyła wejść`);
  assert.ok(!p.czesci.includes("opolskie-1.bin:aaaaaaaaaaaaaaaa"), "wrześniowa część nie może zostać w zapisie po jej nadpisaniu");

  // druga próba dobiera resztę, a nie wszystko od nowa
  const dalej = O.doAktualizacji(spis);
  assert.strictEqual(dalej.length, 1, "po przerwaniu dalej ma być co dobierać");
  assert.ok(dalej[0].plan.czesci.length < 2, "druga próba miała dobrać tylko brakującą część");
});

sprawdz("przerwane pobranie to nie to samo co stara mapa", async () => {
  /* Po zerwanym wifi w telefonie brakuje części — ale mapa nie jest przestarzała, tylko niepełna.
     Gdyby GROTA mówiła wtedy „jest nowsza mapa”, kłamałaby o przyczynie. */
  const a1 = { plik: "opolskie-1.20261024.bin", obszar: "opolskie", komorki: ["1100/680"],
    bufor: czescGRP1({ obszar: "opolskie", nr: 1, tresc: "a", komorki: ["1100/680"] }) };
  const a2 = { plik: "opolskie-2.20261024.bin", obszar: "opolskie", komorki: ["1100/681"],
    bufor: czescGRP1({ obszar: "opolskie", nr: 2, tresc: "b", komorki: ["1100/681"] }) };
  const spis = spisZCzesci([a1, a2], PAZDZIERNIK);
  const { O } = zaladuj({ pliki: new Map([[a1.plik, a1.bufor], [a2.plik, a2.bufor]]), spis });
  const plan = O.planuj(spis, { obszary: ["opolskie"], komorki: null, trasy: true });
  let widziane = 0;
  await O.pobierzPlan({ id: "woj:opolskie", nazwa: "opolskie", opcje: { obszary: ["opolskie"], komorki: null } },
    plan, () => { if (++widziane === 4) O.anuluj(); });
  O.zakoncz?.();

  const [stan] = O.doAktualizacji(spis);
  assert.ok(stan, "niedokończone pobranie powinno być widoczne");
  assert.strictEqual(stan.powod, "niepelna", `powód ma brzmieć „niepelna”, a jest „${stan.powod}”`);

  // ten sam telefon, ale serwer ma już nowszą mapę — wtedy powód jest inny
  const nowszy = spisZCzesci([{ ...a1, plik: "opolskie-1.20261101.bin" }, { ...a2, plik: "opolskie-2.20261101.bin" }],
    "2026-11-01T09:00:00.000Z");
  const [stan2] = O.doAktualizacji(nowszy);
  assert.strictEqual(stan2.powod, "nowsza", `po przebudowie powód ma brzmieć „nowsza”, a jest „${stan2.powod}”`);
});

sprawdz("spis nie może mieć dwóch różnych części pod tym samym adresem", () => {
  // adres części jest w cache wieczny — ta sama nazwa przy innej zawartości to mapa z dwóch wersji
  const a = czescGRP1({ obszar: "opolskie", nr: 1, tresc: "A", komorki: ["1100/680"] });
  const b = czescGRP1({ obszar: "opolskie", nr: 1, tresc: "B", komorki: ["1100/680"] });
  const spis = spisZCzesci([
    { plik: "opolskie-1.20261024.bin", obszar: "opolskie", bufor: a, komorki: ["1100/680"] },
    { plik: "opolskie-1.20261024.bin", obszar: "lubuskie", bufor: b, komorki: ["1100/680"] },
  ], PAZDZIERNIK);
  const wszystkie = Object.values(spis.obszary).flatMap((o) => o.czesci);
  const poNazwie = new Map();
  for (const c of wszystkie) {
    const byla = poNazwie.get(c.plik);
    assert.ok(!byla || byla === c.sha256,
      `dwie różne części pod adresem ${c.plik} — przy „immutable” telefon dostałby bajty z jednej wersji i spis z drugiej`);
    poNazwie.set(c.plik, c.sha256);
  }
  assert.fail("ten przypadek ma wykryć kolizję adresów — jeśli tu doszliśmy, asercja wyżej nie działa");
});

(async () => {
  let padlo = 0;
  for (const { nazwa, fn } of wyniki) {
    try {
      await fn();
      console.log("  OK  ", nazwa);
    } catch (e) {
      // ostatni przypadek jest odwrócony: ma rzucić, bo sprawdza samą asercję
      if (nazwa.startsWith("spis nie może") && /dwie różne części pod adresem/.test(e.message)) { console.log("  OK  ", nazwa); continue; }
      padlo++;
      console.error("  PADŁ", nazwa, "\n        ", e.message);
    }
  }
  if (padlo) { console.error(`\nBŁĄD: padło ${padlo} z ${wyniki.length}`); process.exit(1); }
  console.log(`\nOK: mapy offline wiedzą, kiedy są nieaktualne, i dają się podmienić (${wyniki.length} przypadków)`);
})();

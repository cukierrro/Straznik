/* Mapa offline: pamięć podręczna kafelków, stylu, ikon i czcionek w telefonie.
   Zasada: aplikacja czyta najpierw to, co pobrane, a do sieci sięga dopiero, gdy czegoś nie ma lokalnie.
   Dzięki temu przy syrenach — kiedy sieć jest przeciążona — mapa po prostu działa, a my nie obciążamy serwera.

   Mapy do pobrania leżą na serwerze Strażnika jako paczki (części po ok. 100 MB, tools/paczki/).
   Telefon czyta spis, liczy z niego dokładny rozmiar i pobiera zakresami bajtów — przerwane pobieranie
   powtarza najwyżej jeden kawałek, a wznowienie idzie z pamięci brzegu Cloudflare, nie z naszego serwera.

   Kafelki trzymamy w IndexedDB rozpakowane, tak jak czyta je MapLibre. W paczce każdy wpis jest spakowany
   gzipem osobno; rozpakowujemy biblioteką fflate, bo `DecompressionStream` nie jest pewny na starszych
   WebView (w testach mamy urządzenia z WebView 69, a minimum aplikacji to Chrome 80). */
(function (global) {
  "use strict";

  const BAZA = "grota-mapa", WERSJA = 1, SKLEP = "kafelki", SKLEP_META = "meta";
  const PACZKI_KEY = "grota_paczki";

  /* Jedyne miejsce do podmiany, gdy paczki zmienią adres (np. inny hosting — wtedy nasz serwer zostaje
     kopią zapasową). W podglądzie na komputerze czytamy z lokalnego serwera testowego. */
  const PACZKI_URL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && location.port === "8623"
    ? "http://127.0.0.1:8624/grota/paczki"
    : "https://straznik.eu/grota/paczki";

  let db = null;
  const pusty = () => new Uint8Array(0).buffer;

  function otworz() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(BAZA, WERSJA);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(SKLEP)) d.createObjectStore(SKLEP);
        if (!d.objectStoreNames.contains(SKLEP_META)) d.createObjectStore(SKLEP_META);
      };
      req.onsuccess = () => { db = req.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }

  function zapisz(sklep, klucz, wartosc) {
    return otworz().then((d) => new Promise((res, rej) => {
      const t = d.transaction(sklep, "readwrite");
      t.objectStore(sklep).put(wartosc, klucz);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    }));
  }

  // Wiele wpisów w jednej transakcji — przy tysiącach kafelków paczki to rząd wielkości szybciej niż po jednym.
  function zapiszWiele(sklep, pary) {
    return otworz().then((d) => new Promise((res, rej) => {
      const t = d.transaction(sklep, "readwrite");
      const s = t.objectStore(sklep);
      for (const [k, v] of pary) s.put(v, k);
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("zapis przerwany"));
    }));
  }

  function czytaj(sklep, klucz) {
    return otworz().then((d) => new Promise((res, rej) => {
      const r = d.transaction(sklep, "readonly").objectStore(sklep).get(klucz);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }

  function wszystkieKlucze() {
    return otworz().then((d) => new Promise((res) => {
      const r = d.transaction(SKLEP, "readonly").objectStore(SKLEP).getAllKeys();
      r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
    }));
  }

  function wyczysc() {
    return otworz().then((d) => new Promise((res, rej) => {
      const t = d.transaction([SKLEP, SKLEP_META], "readwrite");
      t.objectStore(SKLEP).clear(); t.objectStore(SKLEP_META).clear();
      t.oncomplete = res; t.onerror = () => rej(t.error);
    }));
  }

  const czytajLS = (k, dom) => { try { const v = localStorage.getItem(k); return v == null ? dom : JSON.parse(v); } catch { return dom; } };
  const zapiszLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* prywatne okno */ } };

  // Adres serwera testowego z czasów prototypu — kasujemy, żeby telefon nie czekał na coś, czego nie ma.
  try { localStorage.removeItem("grota_serwer_map"); } catch { /* prywatne okno */ }

  /* ---------- kafelki na żywo, gdy nie ma ich w telefonie ---------- */

  let zrodloOFM = null;
  let udajeBrakSieci = false;
  const ustawUdawanie = (v) => { udajeBrakSieci = !!v; };
  const udaje = () => udajeBrakSieci;
  function ustawZrodloOFM(szablon) { zrodloOFM = szablon; }

  async function zSieci(z, x, y) {
    if (udajeBrakSieci || !zrodloOFM) return null;
    try {
      const r = await fetch(zrodloOFM.replace("{z}", z).replace("{x}", x).replace("{y}", y));
      if (r.status === 204) return pusty();          // obszar bez danych — nie ma czego szukać dalej
      if (r.ok) return await r.arrayBuffer();
    } catch { /* bez sieci po prostu nie ma tego kafelka */ }
    return null;
  }

  /* ---------- pobrane obszary ---------- */

  const paczki = () => czytajLS(PACZKI_KEY, []);
  function dopiszPaczke(p) { const l = paczki().filter((x) => x.id !== p.id); l.push(p); zapiszLS(PACZKI_KEY, l); }
  function usunPaczke(id) { zapiszLS(PACZKI_KEY, paczki().filter((x) => x.id !== id)); }

  /* ---------- siatka ---------- */

  const MAXZOOM = 14, Z_GRAFU = 11;
  const xT = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const yT = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const lonZ = (x, z) => (x / 2 ** z) * 360 - 180;
  const latZ = (y, z) => { const q = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(q) - Math.exp(-q))); };
  const klGrafu = (x, y) => `grf:${Z_GRAFU}/${x}/${y}`;

  function odleglosc(la1, lo1, la2, lo2) {
    const R = 6371, t = (d) => (d * Math.PI) / 180;
    const a = Math.sin(t(la2 - la1) / 2) ** 2 + Math.cos(t(la1)) * Math.cos(t(la2)) * Math.sin(t(lo2 - lo1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /* Komórki z11 (ok. 12 × 20 km) zachodzące na koło wokół punktu. Bierzemy komórkę, jeśli najbliższy
     jej punkt leży w promieniu — inaczej na skraju koła zostawałyby dziury bez mapy. */
  function komorkiPromien(lat, lon, km) {
    const dLat = km / 111, dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
    const wynik = new Set();
    for (let x = xT(lon - dLon, Z_GRAFU); x <= xT(lon + dLon, Z_GRAFU); x++) {
      for (let y = yT(lat + dLat, Z_GRAFU); y <= yT(lat - dLat, Z_GRAFU); y++) {
        const w = lonZ(x, Z_GRAFU), e = lonZ(x + 1, Z_GRAFU), n = latZ(y, Z_GRAFU), s = latZ(y + 1, Z_GRAFU);
        const pLat = Math.min(Math.max(lat, s), n), pLon = Math.min(Math.max(lon, w), e);
        if (odleglosc(lat, lon, pLat, pLon) <= km) wynik.add(`${x}/${y}`);
      }
    }
    return wynik;
  }

  // Komórki grafu potrzebne do policzenia trasy między dwoma punktami — wyłącznie z telefonu.
  async function grafDlaKorytarza(A, B) {
    const margines = 0.02;   // ok. 2 km zapasu, żeby trasa mogła wyjść poza prostokąt
    const w = Math.min(A[0], B[0]) - margines, s = Math.min(A[1], B[1]) - margines;
    const e = Math.max(A[0], B[0]) + margines, n = Math.max(A[1], B[1]) + margines;
    const bufory = [];
    for (let x = xT(w, Z_GRAFU); x <= xT(e, Z_GRAFU); x++) {
      for (let y = yT(n, Z_GRAFU); y <= yT(s, Z_GRAFU); y++) {
        const b = await czytaj(SKLEP, klGrafu(x, y)).catch(() => null);
        if (b) bufory.push(b);
      }
    }
    return bufory;
  }

  async function maGraf() {
    return (await wszystkieKlucze()).some((k) => String(k).startsWith("grf:"));
  }

  /* ---------- spis paczek ---------- */

  let spisPamiec = null, spisCzas = 0;
  const SPIS_WAZNY = 120000;     // tyle samo, ile żyje na serwerze

  async function spis(wymus = false) {
    if (!wymus && spisPamiec && Date.now() - spisCzas < SPIS_WAZNY) return spisPamiec;
    if (udajeBrakSieci) throw new Error("Bez internetu nie sprawdzę, jakie mapy są do pobrania.");
    const r = await pobierzZLimitem(`${PACZKI_URL}/spis.bin`, { cache: "no-cache" }, 15000);
    if (!r.ok) throw new Error(`Serwer map nie podał spisu (kod ${r.status}).`);
    const s = JSON.parse(await r.text());
    if (s.format !== "GROTA-SPIS") throw new Error("Serwer map podał spis w nieznanym formacie.");
    spisPamiec = s; spisCzas = Date.now();
    return s;
  }

  /* Plan pobrania liczony z samego spisu: które części, które komórki i ile bajtów — zanim człowiek
     zgodzi się na pobranie. `komorki` = null oznacza całe obszary (województwo, cała Polska). */
  function planuj(s, { obszary, komorki, trasy }) {
    const czesci = [];
    let bajty = 0, zajmie = 0, mapa = 0, graf = 0;
    for (const [nazwa, o] of Object.entries(s.obszary)) {
      if (obszary && !obszary.includes(nazwa)) continue;
      const wybraneWObszarze = [];
      for (const c of o.czesci) {
        // spis sprzed rozmiarów na komórkę nie da się zaplanować — taką część pomijamy, zamiast się wywrócić
        const kom = Object.keys(c.komorki || {}).filter((k) => !komorki || komorki.has(k));
        if (!kom.length) continue;
        wybraneWObszarze.push({ c, komorki: komorki ? new Set(kom) : null });
      }
      if (!wybraneWObszarze.length) continue;
      // kafelki przeglądowe (z8–z10) leżą w pierwszej części obszaru — potrzebne przy oddaleniu mapy
      const pierwsza = o.czesci.find((c) => c.czesc === 1);
      if (pierwsza && !wybraneWObszarze.some((w) => w.c === pierwsza)) wybraneWObszarze.unshift({ c: pierwsza, komorki: new Set() });
      for (const w of wybraneWObszarze) {
        w.ogolne = w.c.czesc === 1;
        let m = w.ogolne ? w.c.ogolne : 0, g = 0;
        for (const [k, [km, kg]] of Object.entries(w.c.komorki || {})) {
          if (w.komorki && !w.komorki.has(k)) continue;
          m += km; if (trasy) g += kg;
        }
        mapa += m; graf += g; bajty += m + g;
        zajmie += m * (w.c.rozpakowane?.mapa || 1.35) + g * (w.c.rozpakowane?.graf || 1.3);
        czesci.push(w);
      }
    }
    return { czesci, bajty, mapa, graf, zajmie, trasy };
  }

  /* ---------- pobieranie ---------- */

  /* Jedno pobieranie naraz. Trzymamy też kontrolery żądań w locie, żeby „Przerwij” działał od razu,
     a nie dopiero wtedy, gdy telefon sam uzna połączenie za stracone. */
  let trwa = null;
  const KAWALEK = 4 * 1024 * 1024;       // tyle najwyżej w jednym żądaniu — tyle najwyżej powtórzymy po zerwaniu
  const PRZERWA_SCALANIA = 64 * 1024;    // wpisy bliżej niż tyle bierzemy jednym żądaniem, żeby nie mnożyć zapytań
  const CZAS_KAWALKA = 60000;            // 4 MB na słabym zasięgu potrafią iść kilkadziesiąt sekund
  const PROB = 4;

  const zacznij = () => (trwa = trwa || { anulowane: false, kontrolery: new Set() });
  const zakoncz = () => { trwa = null; };

  function anuluj() {
    if (!trwa) return;
    trwa.anulowane = true;
    for (const k of trwa.kontrolery) { try { k.abort(); } catch { /* już zakończone */ } }
    trwa.kontrolery.clear();
  }

  /* Paczki pobieramy zwykłym zapytaniem przeglądarki, z pominięciem mostu CapacitorHttp. Strażnik włącza
     ten most dla całej aplikacji, a on psuje zakresy bajtów: sprawdzone na emulatorze — przy kawałku od
     środka pliku oddaje za mało bajtów (2 625 321 zamiast 2 793 318), a dalej w ogóle się wywraca. Zwykłe
     zapytanie oddaje zakresy co do bajtu; wymaga za to nagłówków CORS, które serwer ustawia dla
     /grota/paczki/. `CapacitorWebFetch` istnieje tylko wtedy, gdy most jest włączony. */
  const siec = (url, opcje) => (global.CapacitorWebFetch || global.fetch).call(global, url, opcje);

  /* Bez AbortSignal.timeout — na starszych WebView go nie ma. */
  async function pobierzZLimitem(url, opcje = {}, czas = 15000) {
    const kontroler = new AbortController();
    const licznik = setTimeout(() => kontroler.abort(), czas);
    trwa?.kontrolery.add(kontroler);
    try {
      return await siec(url, { ...opcje, signal: kontroler.signal });
    } finally {
      clearTimeout(licznik);
      trwa?.kontrolery.delete(kontroler);
    }
  }

  class Przerwane extends Error {}
  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Jeden zakres bajtów z ponowieniem. Serwer musi odpowiedzieć 206 i podać całą długość pliku zgodną
     ze spisem — inaczej mielibyśmy spis od jednej wersji paczki, a bajty z innej. */
  async function zakres(url, od, doBajtu, dlugoscPliku) {
    let ostatni = null;
    for (let proba = 0; proba < PROB; proba++) {
      if (trwa?.anulowane) throw new Przerwane();
      try {
        const r = await pobierzZLimitem(url, { headers: { Range: `bytes=${od}-${doBajtu}` } }, CZAS_KAWALKA);
        if (r.status !== 206) throw new Error(r.status === 200 ? "serwer nie obsługuje pobierania zakresami" : `kod ${r.status}`);
        const cr = r.headers.get("Content-Range");
        const calosc = cr && Number(cr.split("/")[1]);
        if (dlugoscPliku && calosc && calosc !== dlugoscPliku) throw new Error("paczka na serwerze nie zgadza się ze spisem");
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length !== doBajtu - od + 1) throw new Error("niepełny kawałek");
        return b;
      } catch (e) {
        if (trwa?.anulowane) throw new Przerwane();
        ostatni = e;
        if (/nie zgadza się|nie obsługuje/.test(e.message)) break;   // tego nie naprawi ponowienie
        await czekaj(1000 * 2 ** proba);
      }
    }
    throw new Error(`Nie udało się pobrać fragmentu mapy (${ostatni?.message || "brak połączenia"}).`);
  }

  // Nagłówek części: znacznik, długość, spis wpisów. Zwykle mieści się w pierwszych 256 KB.
  async function naglowek(url, dlugoscPliku) {
    const poczatek = await zakres(url, 0, Math.min(262143, dlugoscPliku - 1), dlugoscPliku);
    const znak = String.fromCharCode(...poczatek.subarray(0, 4));
    if (znak !== "GRP1") throw new Error("Paczka na serwerze ma nieznany format.");
    const n = new DataView(poczatek.buffer, poczatek.byteOffset).getUint32(4, true);
    const tekst = 8 + n <= poczatek.length ? poczatek.subarray(8, 8 + n) : await zakres(url, 8, 8 + n - 1, dlugoscPliku);
    return { h: JSON.parse(new TextDecoder().decode(tekst)), dane: 8 + n };
  }

  function rozpakuj(u8) {
    const wynik = global.fflate.gunzipSync(u8);      // gzip ma własną sumę kontrolną — uszkodzony wpis rzuci błąd
    return wynik.byteOffset === 0 && wynik.byteLength === wynik.buffer.byteLength
      ? wynik.buffer : wynik.buffer.slice(wynik.byteOffset, wynik.byteOffset + wynik.byteLength);
  }

  async function pobierzPlan(obszar, plan, onPostep) {
    zacznij();
    const mamy = new Set((await wszystkieKlucze()).map(String));
    let zrobione = 0, pobrane = 0, kafelkow = 0, komorekGrafu = 0, zajete = 0;
    const razem = plan.bajty;
    const postep = (extra) => onPostep?.({ zrobione, razem, pobrane, kafelkow, komorekGrafu, ...extra });
    postep();
    try {
      for (const w of plan.czesci) {
        const url = `${PACZKI_URL}/${w.c.plik}`;
        const { h, dane } = await naglowek(url, w.c.bajty);
        const z = h.z_grafu;
        const wpisy = [];
        for (const [tz, x, y, off, len] of h.kafelki) {
          if (tz < z) { if (!w.ogolne) continue; }
          else if (w.komorki && !w.komorki.has(`${x >> (tz - z)}/${y >> (tz - z)}`)) continue;
          const klucz = `${tz}/${x}/${y}`;
          if (mamy.has(klucz)) { zrobione += len; continue; }       // było już w telefonie — nie ciągniemy drugi raz
          wpisy.push({ klucz, off, len, graf: false });
        }
        if (plan.trasy) for (const [x, y, off, len] of h.graf) {
          if (w.komorki && !w.komorki.has(`${x}/${y}`)) continue;
          const klucz = klGrafu(x, y);
          if (mamy.has(klucz)) { zrobione += len; continue; }
          wpisy.push({ klucz, off, len, graf: true });
        }
        postep();
        wpisy.sort((a, b) => a.off - b.off);
        const grupy = [];
        for (const e of wpisy) {
          const g = grupy[grupy.length - 1];
          if (g && e.off - g.koniec <= PRZERWA_SCALANIA && e.off + e.len - g.start <= KAWALEK) { g.wpisy.push(e); g.koniec = e.off + e.len; }
          else grupy.push({ start: e.off, koniec: e.off + e.len, wpisy: [e] });
        }
        for (const g of grupy) {
          let pary = null;
          for (let proba = 0; proba < 2 && !pary; proba++) {
            const b = await zakres(url, dane + g.start, dane + g.koniec - 1, w.c.bajty);
            try { pary = g.wpisy.map((e) => [e.klucz, rozpakuj(b.subarray(e.off - g.start, e.off - g.start + e.len))]); }
            catch (err) { if (proba) throw new Error("Pobrany fragment mapy jest uszkodzony — spróbuj jeszcze raz."); }
          }
          await zapiszWiele(SKLEP, pary);
          for (const [, v] of pary) zajete += v.byteLength;
          for (const e of g.wpisy) { zrobione += e.len; pobrane += e.len; if (e.graf) komorekGrafu++; else kafelkow++; }
          postep();
        }
      }
    } catch (e) {
      if (e instanceof Przerwane) return { anulowane: true, kafelkow, komorekGrafu, pobrane };
      throw e;
    }
    dopiszPaczke({ id: obszar.id, nazwa: obszar.nazwa, trasy: plan.trasy, bajtow: plan.bajty, zajmuje: zajete,
      data: new Date().toISOString().slice(0, 10) });
    postep({ koniec: true });
    return { anulowane: false, kafelkow, komorekGrafu, pobrane };
  }

  /* ---------- styl, ikony, czcionki (bez nich pobrane kafelki są bezużyteczne offline) ---------- */

  async function zapiszZasob(url, klucz) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    const b = await r.arrayBuffer();
    await zapisz(SKLEP, klucz, b);
    return b.byteLength;
  }

  // Zapisuje styl razem ze wszystkim, czego potrzebuje do narysowania mapy bez sieci.
  async function pobierzStyl(nazwa, adresStylu) {
    const r = await fetch(adresStylu);
    const styl = await r.json();
    let bajty = 0;
    const sprite = typeof styl.sprite === "string" ? styl.sprite : styl.sprite?.[0]?.url;
    if (sprite) {
      for (const koniec of [".json", ".png"]) {
        try { bajty += await zapiszZasob(sprite + koniec, `sprite:${nazwa}${koniec}`); } catch { /* bez ikon styl i tak się wczyta */ }
      }
      // Ekran o dużej gęstości prosi o wariant @2x. Jeśli serwer go nie ma, podstawiamy zwykły —
      // brak odpowiedzi na sprite zatrzymywał wczytywanie całego stylu bez sieci.
      for (const koniec of ["@2x.json", "@2x.png"]) {
        try { bajty += await zapiszZasob(sprite + koniec, `sprite:${nazwa}${koniec}`); }
        catch {
          const zwykly = await czytaj(SKLEP, `sprite:${nazwa}${koniec.replace("@2x", "")}`);
          if (zwykly) await zapisz(SKLEP, `sprite:${nazwa}${koniec}`, zwykly);
        }
      }
    }
    if (styl.glyphs) {
      // MapLibre prosi o CAŁY stos krojów naraz („Noto Sans Regular,Noto Sans Italic”), więc zapisujemy tak samo
      const stosy = new Set();
      styl.layers.forEach((l) => { const f = l.layout?.["text-font"]; if (Array.isArray(f) && f.length) stosy.add(f.join(",")); });
      for (const stos of stosy) for (const zakresZn of ["0-255", "256-511"]) {
        try { bajty += await zapiszZasob(styl.glyphs.replace("{fontstack}", encodeURIComponent(stos)).replace("{range}", zakresZn), `glyph:${stos}:${zakresZn}`); }
        catch { /* brak zakresu dla tego kroju */ }
      }
    }
    await zapisz(SKLEP_META, `styl:${nazwa}`, styl);
    return bajty;
  }

  const stylZPamieci = (nazwa) => czytaj(SKLEP_META, `styl:${nazwa}`);

  /* ---------- własny protokół dla MapLibre ---------- */

  async function zrodlo(url) {
    // grota://kafelek/{z}/{x}/{y} | grota://sprite/{nazwa}{koniec} | grota://glyph/{font}/{zakres}
    const sciezka = url.replace(/^grota:\/\//, "");
    const [rodzaj, ...reszta] = sciezka.split("/");
    if (rodzaj === "kafelek") {
      const [z, x, y] = reszta;
      const lokalny = await czytaj(SKLEP, `${z}/${x}/${y}`);
      if (lokalny) return { data: lokalny };              // ZAWSZE najpierw to, co pobrane
      return { data: (await zSieci(z, x, y)) || pusty() };
    }
    if (rodzaj === "sprite" || rodzaj === "glyph") {
      const klucz = rodzaj === "sprite" ? `sprite:${reszta.join("/")}` : `glyph:${decodeURIComponent(reszta[0])}:${reszta[1]}`;
      const lokalny = await czytaj(SKLEP, klucz);
      if (lokalny) return { data: lokalny };
      if (klucz.includes("@2x")) {
        const zwykly = await czytaj(SKLEP, klucz.replace("@2x", ""));
        if (zwykly) return { data: zwykly };
      }
      const adres = await czytaj(SKLEP_META, `adres:${klucz}`);
      if (adres && !udajeBrakSieci) {
        try { const r = await fetch(adres); if (r.ok) return { data: await r.arrayBuffer() }; } catch { /* brak sieci */ }
      }
      // Pusta odpowiedź zatrzymuje wczytywanie stylu — błąd MapLibre pomija i rysuje mapę bez tego elementu.
      throw new Error(`brak zasobu ${klucz}`);
    }
    throw new Error("nieznany zasób " + url);
  }

  // Protokół działa na całą stronę — rejestrujemy go raz, nawet jeśli mapa GROTY powstaje wielokrotnie.
  let zarejestrowany = false;
  function rejestruj(maplibregl) {
    if (zarejestrowany) return;
    maplibregl.addProtocol("grota", (params) => zrodlo(params.url));
    zarejestrowany = true;
  }

  /* ---------- stan ---------- */

  async function stan() {
    const d = await otworz();
    const ile = await new Promise((res) => {
      const r = d.transaction(SKLEP, "readonly").objectStore(SKLEP).count();
      r.onsuccess = () => res(r.result); r.onerror = () => res(0);
    });
    let miejsce = null;
    try { if (navigator.storage?.estimate) miejsce = await navigator.storage.estimate(); } catch { /* brak dostępu */ }
    return { kafelkow: ile, paczki: paczki(), miejsce };
  }

  async function maKafelek(z, x, y) { return !!(await czytaj(SKLEP, `${z}/${x}/${y}`)); }

  // Co dokładnie mamy w telefonie — bez tego nie widać, czy brakuje kafelków, ikon czy czcionek.
  async function stanZasobow() {
    const klucze = await wszystkieKlucze();
    return {
      styl: { jasny: !!(await czytaj(SKLEP_META, "styl:jasny")), ciemny: !!(await czytaj(SKLEP_META, "styl:ciemny")) },
      ikony: klucze.filter((k) => String(k).startsWith("sprite:")).length,
      czcionki: klucze.filter((k) => String(k).startsWith("glyph:")).length,
      trasy: klucze.filter((k) => String(k).startsWith("grf:")).length,
    };
  }

  global.GrotaOffline = {
    rejestruj, stan, paczki, pobierzStyl, stylZPamieci, anuluj, usunPaczke, zakoncz,
    maKafelek, wyczysc, ustawZrodloOFM, ustawUdawanie, udaje,
    grafDlaKorytarza, maGraf, stanZasobow,
    spis, planuj, pobierzPlan, komorkiPromien,
    zapiszMeta: (k, v) => zapisz("meta", k, v),
    xT, yT, MAXZOOM, PACZKI_URL,
  };
})(window);

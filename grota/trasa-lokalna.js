/* Trasa liczona w telefonie. Dwa źródła siatki dróg, w tej kolejności:

   1. Paczka drogowa pobrana razem z mapą — pełna siatka z OpenStreetMap, z chodnikami i przejściami.
      Tylko ona daje sensowne trasy poza miastem.
   2. Kafelki rysunkowe — zapas, gdy paczki drogowej nie ma. Mają około jednej trzeciej odcinków
      (zmierzone pod Gąsawą: 96 w OSM wobec 29 w kafelku z14), a przy oddaleniu jeszcze mniej,
      więc przy nich obowiązują ostre progi rozsądku.

   Gdy sieć działa, pierwszeństwo ma serwer tras FOSSGIS — to jest zapas, nie zamiennik.

   Dwie rzeczy, bez których nic nie wychodzi:
   - kafelek i komórka grafu tną drogę na swojej granicy, a końcówki mają minimalnie inne współrzędne,
     więc węzły sklejamy z tolerancją kilku metrów;
   - najbliższy węzeł bywa odciętym fragmentem (ścieżka w podwórku), więc oba końce startują
     z wielu kandydatów naraz. */
(function (global) {
  "use strict";

  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  function metry(a, b) {
    const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  const ZAKAZ_PIESZO = new Set(["motorway", "trunk", "ferry", "rail", "transit"]);
  const ZAKAZ_AUTO = new Set(["path", "steps", "ferry", "rail", "transit"]);
  const pojazd = (mode) => mode === "driving";
  const wolnoZKafelka = (klasa, podklasa, mode) => {
    if (!klasa || klasa.endsWith("_construction")) return false;
    if (pojazd(mode)) return !ZAKAZ_AUTO.has(klasa) && podklasa !== "steps";
    return !ZAKAZ_PIESZO.has(klasa);
  };

  const KOMORKA = 20000;          // ~5 m siatka pomocnicza do sklejania węzłów
  const TOLERANCJA = 4;           // metry
  const MIN_ZOOM_KAFELKA = 12.5;  // niżej kafelki mają przerzedzoną siatkę i trasa bywa zmyślona
  const MAX_DLUGOSC = 30000;

  /* ---------- graf ---------- */

  const nowyGraf = () => ({ wezly: new Map(), graf: new Map(), siatka: new Map(), nastepne: 0 });

  function wezel(g, xy) {
    const cx = Math.round(xy[0] * KOMORKA), cy = Math.round(xy[1] * KOMORKA);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const lista = g.siatka.get(`${cx + dx},${cy + dy}`);
      if (lista) for (const id of lista) if (metry(g.wezly.get(id), xy) <= TOLERANCJA) return id;
    }
    const id = g.nastepne++;
    g.wezly.set(id, xy); g.graf.set(id, []);
    const kk = `${cx},${cy}`;
    if (!g.siatka.has(kk)) g.siatka.set(kk, []);
    g.siatka.get(kk).push(id);
    return id;
  }

  function dodajLinie(g, punkty) {
    let poprzedni = null;
    for (const xy of punkty) {
      const id = wezel(g, xy);
      if (poprzedni != null && poprzedni !== id) {
        const m = metry(g.wezly.get(poprzedni), xy);
        g.graf.get(poprzedni).push({ do: id, m });
        g.graf.get(id).push({ do: poprzedni, m });
      }
      poprzedni = id;
    }
  }

  // Paczka drogowa: "GRF1", uint32 odcinków, potem [uint8 flagi][uint16 n][n × (int32 lat, int32 lon)]
  function zPaczki(g, bufor, mode, box) {
    const dv = new DataView(bufor);
    if (dv.byteLength < 8) return 0;
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== "GRF1") return 0;
    // licznik w nagłówku traktujemy informacyjnie — czytamy do końca pliku, więc plik dopisany
    // w trakcie generowania albo obcięty w transmisji nadal da tyle odcinków, ile faktycznie zawiera
    const maska = pojazd(mode) ? 2 : 1;
    let p = 8, dodane = 0;
    while (p + 3 <= dv.byteLength) {
      const flagi = dv.getUint8(p), n = dv.getUint16(p + 1, true);
      p += 3;
      const koniec = p + n * 8;
      if (koniec > dv.byteLength) break;
      if (flagi & maska) {
        /* Komórka miasta ma i kilkadziesiąt tysięcy odcinków, a do trasy z punktu A do B potrzeba
           tylko tych w pobliżu. Bez tego filtra budowanie grafu w Warszawie trwało ponad dwie sekundy. */
        let wKorytarzu = !box;
        if (box) for (let k = 0; k < n && !wKorytarzu; k++) {
          const lon = dv.getInt32(p + k * 8 + 4, true) / 1e7, lat = dv.getInt32(p + k * 8, true) / 1e7;
          if (lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3]) wKorytarzu = true;
        }
        if (wKorytarzu) {
          const punkty = new Array(n);
          for (let k = 0; k < n; k++) punkty[k] = [dv.getInt32(p + k * 8 + 4, true) / 1e7, dv.getInt32(p + k * 8, true) / 1e7];
          dodajLinie(g, punkty);
          dodane++;
        }
      }
      p = koniec;
    }
    return dodane;
  }

  function zKafelkow(g, map, mode) {
    const features = map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" });
    let dodane = 0;
    for (const f of features) {
      if (!wolnoZKafelka(f.properties?.class, f.properties?.subclass, mode)) continue;
      const geo = f.geometry;
      const linie = geo.type === "LineString" ? [geo.coordinates] : geo.type === "MultiLineString" ? geo.coordinates : [];
      for (const linia of linie) { dodajLinie(g, linia); dodane++; }
    }
    return dodane;
  }

  /* ---------- szukanie ---------- */

  function kandydaci(wezly, punkt, ile, maxM) {
    const bliskie = [];
    for (const [id, xy] of wezly) {
      const m = metry(punkt, xy);
      if (m <= maxM) bliskie.push({ id, m });
    }
    bliskie.sort((a, b) => a.m - b.m);
    return bliskie.slice(0, ile);
  }

  class Kopiec {
    constructor() { this.t = []; }
    get rozmiar() { return this.t.length; }
    dodaj(el) { const t = this.t; t.push(el); let i = t.length - 1;
      while (i > 0) { const r = (i - 1) >> 1; if (t[r].f <= t[i].f) break; [t[r], t[i]] = [t[i], t[r]]; i = r; } }
    zdejmij() { const t = this.t, gora = t[0], ost = t.pop();
      if (t.length) { t[0] = ost; let i = 0;
        for (;;) { const l = 2 * i + 1, p = l + 1; let n = i;
          if (l < t.length && t[l].f < t[n].f) n = l;
          if (p < t.length && t[p].f < t[n].f) n = p;
          if (n === i) break; [t[n], t[i]] = [t[i], t[n]]; i = n; } }
      return gora; }
  }

  function szukaj(g, starty, cele, celXY) {
    const koszt = new Map(), skad = new Map(), zamkniete = new Set();
    const doCelu = new Set(cele.map((c) => c.id));
    const kopiec = new Kopiec();
    for (const s of starty) { koszt.set(s.id, s.m); kopiec.dodaj({ id: s.id, f: s.m + metry(g.wezly.get(s.id), celXY) }); }
    let osiagniety = null, krokow = 0;
    while (kopiec.rozmiar) {
      const { id } = kopiec.zdejmij();
      if (doCelu.has(id)) { osiagniety = id; break; }
      if (zamkniete.has(id)) continue;
      zamkniete.add(id);
      if (++krokow > 400000) break;               // bezpiecznik dla słabszego telefonu
      for (const kraw of g.graf.get(id) || []) {
        const nowy = koszt.get(id) + kraw.m;
        if (koszt.has(kraw.do) && koszt.get(kraw.do) <= nowy) continue;
        koszt.set(kraw.do, nowy); skad.set(kraw.do, id);
        kopiec.dodaj({ id: kraw.do, f: nowy + metry(g.wezly.get(kraw.do), celXY) });
      }
    }
    if (osiagniety == null) return null;
    const sciezka = [osiagniety];
    while (skad.has(sciezka[0])) sciezka.unshift(skad.get(sciezka[0]));
    return { coords: sciezka.map((id) => g.wezly.get(id)), distM: koszt.get(osiagniety) };
  }

  /* ---------- wejście ----------
     `paczkaDrogowa(A, B)` ma zwrócić bufory komórek grafu obejmujących korytarz albo pustą listę. */
  async function lokalna(map, from, to, mode, estimateMin, paczkaDrogowa) {
    try {
      const A = [from.lon, from.lat], B = [to.lon, to.lat];
      const prosta = metry(A, B);
      const g = nowyGraf();
      let zrodlo = null;

      const korytarz = (zapas) => [Math.min(A[0], B[0]) - zapas, Math.min(A[1], B[1]) - zapas,
                                   Math.max(A[0], B[0]) + zapas, Math.max(A[1], B[1]) + zapas];
      let bufory = null, w = null, uzyty = g;

      if (paczkaDrogowa) {
        bufory = await paczkaDrogowa(A, B);
        const zapas = Math.max(0.006, Math.min(0.05, (prosta / 111000) * 0.6));
        let odcinkow = 0;
        for (const bufor of bufory) odcinkow += zPaczki(g, bufor, mode, korytarz(zapas));
        if (odcinkow) zrodlo = "paczka";
      }
      if (!zrodlo) {
        if (!map.getSource("openmaptiles") || map.getZoom() < MIN_ZOOM_KAFELKA) return null;
        if (zKafelkow(g, map, mode)) zrodlo = "kafelki";
      }
      if (!zrodlo || !g.wezly.size) return null;

      const probuj = (gg) => {
        const st = kandydaci(gg.wezly, A, 40, 250), ce = kandydaci(gg.wezly, B, 40, 250);
        return st.length && ce.length ? szukaj(gg, st, ce, B) : null;
      };
      w = probuj(g);

      /* Wąski korytarz jest szybki, ale gdy trzeba obejść rzekę albo tory, trasa wychodzi poza niego.
         Wtedy jedno podejście szerzej — wolniejsze, za to nie gubimy prawdziwych objazdów. */
      if (!w && zrodlo === "paczka" && bufory?.length) {
        const g2 = nowyGraf();
        const box = korytarz(Math.max(0.03, Math.min(0.12, (prosta / 111000) * 3)));
        for (const bufor of bufory) zPaczki(g2, bufor, mode, box);
        if (g2.wezly.size) { const w2 = probuj(g2); if (w2) { w = w2; uzyty = g2; } }
      }
      if (!w) return null;

      const coords = [A, ...w.coords, B];
      const distM = Math.round(w.distM + metry(B, w.coords[w.coords.length - 1]));
      if (distM > MAX_DLUGOSC) return null;
      /* Przy siatce z kafelków trasa bywa zmyślona, bo brakuje ulic — odrzucamy podejrzanie okrężne.
         Paczka drogowa ma komplet dróg, więc tam objazd zwykle jest prawdziwy: rzeka, tory, ekspresówka. */
      const prog = zrodlo === "kafelki" ? 3 : 12;
      if (prosta > 100 && distM > prog * prosta && distM - prosta > 400) return null;
      return { coords, distM, durMin: estimateMin(distM, mode), lokalna: true, zrodlo };
    } catch (e) {
      console.warn("Grota: trasa z pamięci nie wyszła —", e);
      return null;
    }
  }

  global.GrotaTrasa = { lokalna };
})(window);

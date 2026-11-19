/* Powiat zapisanego miejsca — liczony WYŁĄCZNIE na telefonie (etap 3 alarmów powiatowych,
   19.11.2026). Do Firebase idzie tylko numer powiatu (temat pow_<TERYT>), nigdy
   współrzędne ani adres.

   Granice: PRG GUGiK, uproszczone o `uproszczenie_m` (scripts/build_powiaty_telefon.py).
   Uproszczony obrys różni się od prawdziwego najwyżej o tę tolerancję, więc miejsce
   dostaje KAŻDY powiat, w którym leży albo od którego obrysu jest bliżej niż
   `margines_m`. Przy samej granicy wychodzą dwa powiaty — zapis do sąsiedniego kosztuje
   najwyżej powiadomienie za dużo (telefon łączy je po kluczu zdarzenia), pomyłka
   kosztowałaby alarm za mało. Pilnuje tego scripts/test_powiaty_telefon.cjs na punktach
   z nieuproszczonych granic.

   Miejsce bez dokładnej lokalizacji (wybrane samo województwo) obserwuje wszystkie
   powiaty województwa — tak jak dotąd całe województwo. */
(function (root) {
  'use strict';
  const M_NA_STOPIEN = 111320;
  const ZASIEG_BRZEGU_M = 5000;   // miejsce tuż za obrysem (plaża, zalew) — najbliższy powiat

  /* Pierścienie z różnic na bezwzględne liczby całkowite — raz, przy pierwszym użyciu. */
  function przygotuj(dane) {
    if (!dane || !dane.pow) return null;
    if (dane._gotowe) return dane;
    for (const p of Object.values(dane.pow)) {
      p._r = (p.r || []).map(flat => {
        const out = new Float64Array(flat.length);
        let x = 0, y = 0;
        for (let i = 0; i < flat.length; i += 2) {
          x = i ? x + flat[i] : flat[i]; y = i ? y + flat[i + 1] : flat[i + 1];
          out[i] = x; out[i + 1] = y;
        }
        return out;
      });
    }
    Object.defineProperty(dane, '_gotowe', { value: true, enumerable: false });
    return dane;
  }

  /* Parzystość przecięć po wszystkich pierścieniach (dziury: powiat ziemski wokół miasta)
     i najmniejsza odległość od obrysu w metrach. */
  function badaj(p, x, y, kx, ky) {
    let wewnatrz = false, best = Infinity;
    for (const r of p._r) {
      // pierścień zamknięty (ostatni punkt = pierwszy), odcinek i → i+2
      for (let i = 0; i + 3 < r.length; i += 2) {
        const ax = r[i], ay = r[i + 1], bx = r[i + 2], by = r[i + 3];
        if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) wewnatrz = !wewnatrz;
        const dx = (bx - ax) * kx, dy = (by - ay) * ky, px = (x - ax) * kx, py = (y - ay) * ky;
        const L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, (px * dx + py * dy) / L)) : 0;
        const qx = px - t * dx, qy = py - t * dy, d = qx * qx + qy * qy;
        if (d < best) best = d;
      }
    }
    return { wewnatrz, odl: Math.sqrt(best) };
  }

  /* Powiaty miejsca: { powiaty: [TERYT…], pewny: bool }. `pewny` = dokładnie jeden powiat
     i miejsce dalej od granicy niż margines. Poza Polską (dalej niż ZASIEG_BRZEGU_M od
     każdego powiatu) — pusta lista. */
  function znajdz(dane, lat, lon) {
    dane = przygotuj(dane);
    if (!dane || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return { powiaty: [], pewny: false };
    const S = dane.skala, M = dane.margines_m;
    const x = lon * S, y = lat * S;
    const ky = M_NA_STOPIEN / S, kx = M_NA_STOPIEN * Math.cos(lat * Math.PI / 180) / S;
    const mx = M / kx, my = M / ky, zx = ZASIEG_BRZEGU_M / kx, zy = ZASIEG_BRZEGU_M / ky;
    const wynik = [];
    let wewnatrz = 0, najblizszy = null;
    for (const [terc, p] of Object.entries(dane.pow)) {
      const b = p.b;
      if (x < b[0] - zx || x > b[2] + zx || y < b[1] - zy || y > b[3] + zy) continue;
      const blisko = !(x < b[0] - mx || x > b[2] + mx || y < b[1] - my || y > b[3] + my);
      const r = badaj(p, x, y, kx, ky);
      if (r.wewnatrz) { wynik.push(terc); wewnatrz++; continue; }
      if (blisko && r.odl <= M) { wynik.push(terc); continue; }
      if (r.odl <= ZASIEG_BRZEGU_M && (!najblizszy || r.odl < najblizszy.odl)) najblizszy = { terc, odl: r.odl };
    }
    if (!wynik.length && najblizszy) return { powiaty: [najblizszy.terc], pewny: false };
    wynik.sort();
    return { powiaty: wynik, pewny: wynik.length === 1 && wewnatrz === 1 };
  }

  /* Powiaty wszystkich miejsc z włączonymi alarmami. Miejsce z lokalizacją — jego powiat
     (przy granicy dwa); miejsce bez lokalizacji albo poza Polską — wszystkie powiaty
     wybranego województwa. Zwraca posortowaną listę bez powtórzeń. */
  function powiatyMiejsc(dane, places) {
    dane = przygotuj(dane);
    if (!dane) return [];
    const out = new Set();
    for (const pl of places || []) {
      if (!pl || !pl.alerts) continue;
      const z = pl.precision === 'gps' && pl.gps ? znajdz(dane, pl.gps.lat, pl.gps.lon).powiaty : [];
      if (z.length) { z.forEach(t => out.add(t)); continue; }
      for (const [terc, p] of Object.entries(dane.pow)) if (p.w === pl.region) out.add(terc);
    }
    return [...out].sort();
  }

  /* Powiat jednego miejsca do opisu w ustawieniach: nazwy krótkie („lubelski”, „Lublin”). */
  function opisMiejsca(dane, place) {
    dane = przygotuj(dane);
    if (!dane || !place) return null;
    if (place.precision !== 'gps' || !place.gps) return { caleWojewodztwo: true, powiaty: [] };
    const z = znajdz(dane, place.gps.lat, place.gps.lon);
    if (!z.powiaty.length) return { caleWojewodztwo: true, powiaty: [] };
    return { caleWojewodztwo: false, powiaty: z.powiaty.map(t => nazwaKrotka(dane, t)) };
  }

  /* „lubelski” albo „Lublin” (miasto na prawach powiatu). */
  function nazwaKrotka(dane, terc) {
    const n = dane?.pow?.[terc]?.n || terc;
    return n.startsWith('powiat ') ? n.slice(7) : n;
  }
  /* „powiat lubelski” albo „Lublin”. */
  function nazwa(dane, terc) {
    const k = nazwaKrotka(dane, terc);
    return /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(k) ? k : 'powiat ' + k;
  }

  const api = { przygotuj, znajdz, powiatyMiejsc, opisMiejsca, nazwa, nazwaKrotka };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StraznikPowiaty = api;
})(globalThis);

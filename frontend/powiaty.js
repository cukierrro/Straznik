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

   Miejsce BEZ dokładnej lokalizacji (zakres „Województwo”, miejsce przeniesione ze starszej
   wersji, pozycja zbyt przybliżona) nie dostaje żadnego powiatu — powiatu nie zgadujemy
   i nie podpinamy całego województwa (decyzja usera 19.11.2026). Dopóki choć jedno miejsce
   z alarmami nie ma powiatu, telefon zostaje na tematach WOJEWÓDZTW (powiatyMiejsc zwraca
   pustą listę, warstwa natywna przy pustej liście nie przechodzi na powiaty). */
(function (root) {
  'use strict';
  const M_NA_STOPIEN = 111320;
  const ZASIEG_BRZEGU_M = 5000;   // miejsce tuż za obrysem (plaża, zalew) — najbliższy powiat
  /* Pozycja przybliżona: dokładność (promień z GPS) jest marginesem — miejsce dostaje każdy
     powiat w tym promieniu, czyli prawdziwy na pewno. Powyżej tego promienia (np. lokalizacja
     „przybliżona” Androida/iOS, kilka km) traktujemy miejsce jak bez dokładnej lokalizacji. */
  const DOKLADNOSC_MAX_M = 2000;

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
  function znajdz(dane, lat, lon, dokladnoscM = 0) {
    dane = przygotuj(dane);
    if (!dane || !Number.isFinite(+lat) || !Number.isFinite(+lon)) return { powiaty: [], pewny: false };
    const S = dane.skala, M = Math.max(dane.margines_m, +dokladnoscM || 0);
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

  /* Powiat(y) jednego miejsca albo powód, dla którego go nie ma:
       { powiaty: [TERYT…] }                       — miejsce z dokładną lokalizacją;
       { powiaty: [], powod: "bez_lokalizacji" }   — zakres „Województwo” (także migracja);
       { powiaty: [], powod: "przyblizona" }       — pozycja mniej dokładna niż DOKLADNOSC_MAX_M;
       { powiaty: [], powod: "poza_polska" }       — punkt dalej niż ZASIEG_BRZEGU_M od powiatów. */
  function powiatMiejsca(dane, pl) {
    dane = przygotuj(dane);
    if (!dane || !pl) return { powiaty: [], powod: "bez_granic" };
    if (pl.precision !== 'gps' || !pl.gps) return { powiaty: [], powod: 'bez_lokalizacji' };
    const dokl = +pl.gps.accuracy || 0;
    if (dokl > DOKLADNOSC_MAX_M) return { powiaty: [], powod: 'przyblizona' };
    const z = znajdz(dane, pl.gps.lat, pl.gps.lon, dokl).powiaty;
    return z.length ? { powiaty: z } : { powiaty: [], powod: 'poza_polska' };
  }

  /* Plan tematów: powiaty miejsc z alarmami i miejsca, którym powiatu przypisać się nie da. */
  function planPowiatow(dane, places) {
    const powiaty = new Set(), bezPowiatu = [];
    for (const pl of places || []) {
      if (!pl || !pl.alerts) continue;
      const w = powiatMiejsca(dane, pl);
      if (w.powiaty.length) w.powiaty.forEach(t => powiaty.add(t));
      else bezPowiatu.push({ name: pl.name, region: pl.region, powod: w.powod });
    }
    return { powiaty: [...powiaty].sort(), bezPowiatu };
  }

  /* Powiaty do tematów FCM. PUSTA lista, gdy choć jedno miejsce z alarmami nie ma powiatu
     (albo nie ma granic) — telefon zostaje wtedy przy województwach, zamiast przegapić
     alarm dla tego miejsca albo zgadywać jego powiat. */
  function powiatyMiejsc(dane, places) {
    if (!przygotuj(dane)) return [];
    const p = planPowiatow(dane, places);
    return p.bezPowiatu.length ? [] : p.powiaty;
  }

  /* Powiat jednego miejsca do opisu w ustawieniach: nazwy krótkie („lubelski”, „Lublin”). */
  function opisMiejsca(dane, place) {
    dane = przygotuj(dane);
    if (!dane || !place) return null;
    const w = powiatMiejsca(dane, place);
    return { powiaty: w.powiaty.map(t => nazwaKrotka(dane, t)), powod: w.powod || null };
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

  const api = { przygotuj, znajdz, powiatMiejsca, planPowiatow, powiatyMiejsc, opisMiejsca, nazwa, nazwaKrotka, DOKLADNOSC_MAX_M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StraznikPowiaty = api;
})(globalThis);

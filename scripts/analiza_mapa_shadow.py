# -*- coding: utf-8 -*-
"""Podsumowanie okna pomiarowego mapa.ua (tryb cienia, 18–21.09.2026).

Czyta dziennik obserwacji (`obserwacje.db`, rodzaje `mapa_report` i `mapa_tick`)
i odpowiada na pytania, dla których w ogóle zbieraliśmy dane:

  1. ile obiektów pokazują obie strony i jak bardzo się pokrywają,
  2. kto melduje wcześniej — mapa.ua czy NEPTUN,
  3. ile razy mapa.ua miała obiekt przy polskiej granicy, którego NEPTUN nie miał
     (czyli ile fałszywek dostalibyśmy, gdyby wpiąć ich dane w punktację),
  4. ile ich obiektów to pojedyncze zgłoszenie i ile ląduje na centroidzie miasta.

Uruchomienie na serwerze:  python3 scripts/analiza_mapa_shadow.py
Na kopii bazy:             py scripts/analiza_mapa_shadow.py sciezka/obserwacje.db
"""
import json
import math
import sqlite3
import statistics as st
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DOMYSLNA = Path("/opt/straznik/dane/obserwacje.db")
sciezka = Path(sys.argv[1]) if len(sys.argv) > 1 else DOMYSLNA
if not sciezka.exists():
    for kandydat in (Path("dane/obserwacje.db"), Path("backend/dane/obserwacje.db")):
        if kandydat.exists():
            sciezka = kandydat
            break
if not sciezka.exists():
    sys.exit(f"nie znalazłem dziennika obserwacji: {sciezka}")

conn = sqlite3.connect(f"file:{sciezka}?mode=ro", uri=True)


def wiersze(kind):
    return [{"ts": ts, "key": key, **json.loads(data)} for ts, key, data in
            conn.execute("SELECT ts, key, data FROM obs WHERE kind=? ORDER BY ts", (kind,))]


ticks = wiersze("mapa_tick")
rap = wiersze("mapa_report")
if not ticks:
    sys.exit("brak zrzutów mapa_tick — kolektor nie zdążył nic zapisać")

print(f"Dziennik: {sciezka}")
print(f"Okno: {ticks[0]['ts']} → {ticks[-1]['ts']}  ({len(ticks)} zrzutów, {len(rap)} meldunków)")
udane = [t for t in ticks if t.get("neptun_connected")]
print(f"Zrzuty z działającym NEPTUN-em: {len(udane)}/{len(ticks)}")

print("\n1. SKALA — ile obiektów widzi każda strona")
for pole, opis in (("mapa_total", "wszystkie obiekty u nich"),
                   ("mapa_active", "ich „aktywne”"),
                   ("mapa_fresh", "ich meldunki ≤15 min"),
                   ("neptun_total", "tracki NEPTUN-a")):
    v = [t[pole] for t in ticks if t.get(pole) is not None]
    if v:
        print(f"  {opis:26} mediana {st.median(v):6.0f}   maks {max(v):6.0f}")

print("\n2. POKRYCIE (na świeżych obiektach, próg 25 km)")
wsp = sum(t["wspolne"] for t in ticks)
tm = sum(t["tylko_mapa"] for t in ticks)
tn = sum(t["tylko_neptun"] for t in ticks)
suma = wsp + tm + tn
if suma:
    print(f"  wspólne:      {wsp:6} ({wsp / suma:5.1%})")
    print(f"  tylko mapa.ua:{tm:6} ({tm / suma:5.1%})")
    print(f"  tylko NEPTUN: {tn:6} ({tn / suma:5.1%})")

print("\n3. KTO MELDUJE WCZEŚNIEJ (sparowane obiekty)")
roz = [r["nep_age_min"] - r["age_min"] for r in rap
       if r.get("nep_km") is not None and r["nep_km"] <= 25
       and r.get("nep_age_min") is not None and r.get("age_min") is not None]
if roz:
    roz.sort()
    wcz_nep = sum(1 for x in roz if x > 1)
    wcz_mapa = sum(1 for x in roz if x < -1)
    print(f"  par: {len(roz)}   mediana różnicy {st.median(roz):+.1f} min "
          f"(dodatnia = NEPTUN miał to wcześniej)")
    print(f"  NEPTUN wcześniej: {wcz_nep} ({wcz_nep / len(roz):.0%}) | "
          f"mapa.ua wcześniej: {wcz_mapa} ({wcz_mapa / len(roz):.0%})")
else:
    print("  brak par do porównania")

print("\n4. PRZY GRANICY PL (≤300 km) — najważniejsze dla punktacji")
bez_pary = [r for r in rap if (r.get("dist_pl_km") or 9999) <= 300
            and (r.get("nep_km") or 999) > 25]
z_para = [r for r in rap if (r.get("dist_pl_km") or 9999) <= 300
          and (r.get("nep_km") or 999) <= 25]
print(f"  ich meldunki przy granicy: {len(bez_pary) + len(z_para)}")
print(f"    z potwierdzeniem w NEPTUN-ie: {len(z_para)}")
print(f"    BEZ potwierdzenia:            {len(bez_pary)}")
if bez_pary:
    print("    najbliższe granicy:")
    for r in sorted(bez_pary, key=lambda x: x["dist_pl_km"])[:12]:
        print(f"      {r['ts'][11:16]} {r['dist_pl_km']:4} km  {r.get('kind', '?'):14} "
              f"{'1 meldunek' if r.get('reports') == 1 else 'kilka'}  {r.get('title', '')[:70]}")
nep_blisko = [t["neptun_blisko_pl"] for t in ticks]
print(f"  tracki NEPTUN-a przy granicy: mediana {st.median(nep_blisko):.0f}, maks {max(nep_blisko)}")

print("\n5. JAKOŚĆ ICH OBIEKTÓW")
raz = sum(1 for r in rap if r.get("reports") == 1)
if rap:
    print(f"  meldunki o obiektach widzianych tylko raz: {raz}/{len(rap)} ({raz / len(rap):.0%})")
    print("  typy:", ", ".join(f"{k} {v}" for k, v in Counter(r.get("kind") for r in rap).most_common(6)))
    print("  strefy startu:", ", ".join(f"{k} {v}" for k, v in
                                        Counter(r.get("from_zone") for r in rap).most_common(6)))

MIASTA = {"Lwów": (49.8397, 24.0297), "Kijów": (50.4501, 30.5234), "Odessa": (46.4825, 30.7233),
          "Charków": (49.9935, 36.2304), "Dniepr": (48.4647, 35.0462), "Winnica": (49.2331, 28.4682),
          "Łuck": (50.7472, 25.3254), "Równe": (50.6199, 26.2516), "Tarnopol": (49.5535, 25.5948),
          "Użhorod": (48.6208, 22.2879), "Iwano-Frankiwsk": (48.9226, 24.7111)}


def km(a, b, c, d):
    p = math.pi / 180
    x = (math.sin(a * p) * math.sin(c * p)
         + math.cos(a * p) * math.cos(c * p) * math.cos((b - d) * p))
    return 6371 * math.acos(max(-1, min(1, x)))


centroidy = Counter()
for r in rap:
    if r.get("lat") is None:
        continue
    for nazwa, (la, lo) in MIASTA.items():
        if km(r["lat"], r["lon"], la, lo) < 1.5:
            centroidy[nazwa] += 1
            break
if centroidy:
    print("  meldunki postawione dokładnie na centroidzie miasta:",
          ", ".join(f"{k} {v}" for k, v in centroidy.most_common()))

print("\n6. WNIOSEK DO DECYZJI")
if suma:
    print(f"  Zgodność świeżych obiektów: {wsp / suma:.0%}. "
          f"Niepotwierdzonych meldunków przy granicy: {len(bez_pary)}.")
print("  Reguła progu z 18.09: wpinamy ich dane tylko jako sygnał pomocniczy i tylko wtedy,")
print("  gdy niepotwierdzonych meldunków przy granicy jest tyle, ile realnie akceptujemy")
print("  fałszywych alarmów — inaczej zostaje przy samym dzienniku obserwacji.")
zaczete = datetime.fromisoformat(ticks[0]["ts"].replace("Z", "+00:00"))
print(f"\n  (dane zbierane od {zaczete:%d.%m %H:%M} UTC, bez wpływu na punktację i powiadomienia)")

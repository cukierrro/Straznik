# -*- coding: utf-8 -*-
"""Północ: PAŻP i Bałtyk muszą tam liczyć, ale nadal nie alarmować w pojedynkę.

Powód zmiany: NEPTUN pokrywa Ukrainę, więc dla Pomorza i sąsiedztwa Kaliningradu
warstwa dająca na wschodzie 0–8 pkt daje zero. Test pilnuje trzech rzeczy:
  1. strefa PAŻP nad północą waży 1,0, a nad ścianą wschodnią 0,5,
  2. żaden pojedynczy sygnał północny nie przekracza progu żółtego (2,0),
  3. dwa niezależne sygnały północne próg osiągają — inaczej zmiana byłaby pozorna.

Uruchomienie:  py scripts/test_polnoc.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config                                            # noqa: E402
from app.collectors import pansa                                  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


PN = config.NORTH_VOIVODESHIPS
WSCH = config.PRIORITY_VOIVODESHIPS
zolty = config.THRESHOLD_ELEVATED
pkt_pn = config.POINTS["pansa_zone_north"]
pkt_wsch = config.POINTS["pansa_zone"]

print("1. waga strefy PAZP")
sprawdz(pkt_pn > pkt_wsch, f"polnoc {pkt_pn} > wschod {pkt_wsch}")
sprawdz("pomorskie" in PN and "zachodniopomorskie" in PN,
        "pomorskie i zachodniopomorskie sa w zbiorze polnocy")
sprawdz("lubelskie" not in PN, "lubelskie NIE jest liczone jako polnoc")

print("2. pojedynczy sygnal nie alarmuje")
for nazwa, wartosc in (("strefa PAZP", pkt_pn),
                       ("incydent baltycki", config.POINTS["baltic_context"]),
                       ("ruch ADS-B", config.POINTS["adsb_spike"]),
                       ("strefa u sasiada", config.POINTS["neighbour_zone"])):
    sprawdz(wartosc < zolty, f"{nazwa} {wartosc} < prog zolty {zolty}")

print("3. dwa niezalezne sygnaly osiagaja prog")
for a, b, opis in ((pkt_pn, config.POINTS["adsb_spike"], "strefa + ADS-B"),
                   (pkt_pn, config.POINTS["baltic_context"], "strefa + Baltyk")):
    sprawdz(a + b >= zolty, f"{opis} = {a + b} >= {zolty}")

print("4. limit klasy nie pozwala zsumowac kilku stref")
sprawdz(config.SOURCE_CAPS["pansa"] <= pkt_pn,
        f"cap pansa {config.SOURCE_CAPS['pansa']} <= jedna strefa polnocna {pkt_pn}")

print("5. wagi celow baltyckich")
w = config.BALTIC_TARGET_WEIGHTS
sprawdz(w.get("pomorskie") == 1.0, "pomorskie dostaje pelna wage")
sprawdz(0 < w.get("zachodniopomorskie", 0) < 1.0,
        "zachodniopomorskie slabiej (Estonia ~900 km)")
sprawdz(list(w) == config.BALTIC_TARGET_VOIVS, "lista celow pochodzi z wag")

print("6. brama wojewodztw w kolektorze PAZP")
zrodlo = (Path(__file__).resolve().parents[1]
          / "backend/app/collectors/pansa.py").read_text(encoding="utf-8")
sprawdz("NORTH_VOIVODESHIPS" in zrodlo, "kolektor zna zbior polnocy")
sprawdz('"pansa_zone_north" if polnoc else "pansa_zone"' in zrodlo,
        "kolektor wybiera wage wedlug polozenia")

print("7. klasyfikacja stref pokazywanych nie zmienila punktacji")
sprawdz(pansa._SCORING_TYPES == {"ADHOC", "R", "NPZ", "D"},
        "punktuja nadal tylko ADHOC/R/NPZ/D")
sprawdz("TSA" in pansa._SHOW_TYPES and "TSA" not in pansa._SCORING_TYPES,
        "TSA jest pokazywana, ale nie punktowana")

if bledy:
    print("\nBLEDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("\nOK - polnoc liczy sie inaczej, ale zaden pojedynczy sygnal nie alarmuje")

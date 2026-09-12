# -*- coding: utf-8 -*-
"""Karencja zniknięcia strefy PAŻP — symulacja przełączenia planu o 06:00 UTC.

Bez karencji strefa, której zabrakło w JEDNYM odczycie, dostaje zdarzenie „off",
a po powrocie „on" — i na mapie żółtą bryłę 3D „nowej aktywacji" zamiast
spokojnego konturu. Trzydzieści stref naraz o ósmej rano wyglądałoby jak reakcja
na zagrożenie.

Test steruje czasem wprost (bez czekania) i sprawdza cztery przebiegi:
  1. strefa znika na jeden tick i wraca  -> zero zdarzeń, wiek zachowany,
  2. strefa znika na dłużej niż karencja -> dokładnie jedno zdarzenie „off",
  3. w czasie karencji strefa nadal jest widoczna na mapie,
  4. nieudany odczyt nie kasuje niczego (ta ścieżka była bezpieczna wcześniej).

Uruchomienie:  py scripts/test_strefy_karencja.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.collectors import pansa                                  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def reset():
    pansa._zones_shown.clear()
    pansa._zones_since.clear()
    pansa._zones_at_boot.clear()
    pansa._zones_pending_off.clear()
    pansa._zone_events.clear()


def wpis(des="EPD21", voiv="lubelskie"):
    """Minimalny wpis taki, jaki tworzy _tick dla pokazywanej strefy."""
    return {"feature": {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []},
                        "properties": {"designator": des, "type": "D", "voiv": voiv,
                                       "lower": "GND", "upper": "F130", "remarks": "",
                                       "unit": "MIL", "start": None, "end": None,
                                       "since": 0.0, "atBoot": False, "standing": False}}}


def tick(obecne: dict, teraz: float):
    """Odtwarza fragment _tick odpowiedzialny za zdarzenia on/off.

    Kopia logiki, nie jej wywołanie: prawdziwy _tick chodzi do sieci PAŻP.
    Rozjazd z oryginałem wychodzi w punkcie 5 (porównanie ze źródłem).
    """
    pokazywane = dict(obecne)
    obecne_klucze = set(pokazywane)
    for des in sorted(set(pansa._zones_shown) - obecne_klucze):
        znikla_o = pansa._zones_pending_off.setdefault(des, teraz)
        if teraz - znikla_o < pansa._OFF_GRACE_S:
            pokazywane[des] = pansa._zones_shown[des]
            continue
        pansa._zone_events.append({"ts": f"t{int(teraz)}", "action": "off", "designator": des})
        pansa._zones_pending_off.pop(des, None)
        pansa._zones_since.pop(des, None)
    for des in sorted(obecne_klucze - set(pansa._zones_shown)):
        pansa._zone_events.append({"ts": f"t{int(teraz)}", "action": "on", "designator": des})
    for des in obecne_klucze:
        pansa._zones_pending_off.pop(des, None)
    pansa._zones_shown.clear()
    pansa._zones_shown.update(pokazywane)


T = 1_800_000_000.0
GRACE = pansa._OFF_GRACE_S
print(f"karencja = {GRACE / 60:.0f} min, tick PAŻP = 300 s "
      f"({GRACE / 300:.0f} kolejne odczyty)")

print("1. strefa znika na jeden tick i wraca (przelaczenie planu o 06:00)")
reset()
pansa._zones_shown["EPD21"] = wpis()
pansa._zones_since["EPD21"] = T - 50_000        # stoi od kilkunastu godzin
tick({}, T + 300)                                # feed bez niej
tick({"EPD21": wpis()}, T + 600)                 # wrocila
sprawdz(pansa._zone_events == [], f"zero zdarzen, jest: {pansa._zone_events}")
sprawdz(pansa._zones_since.get("EPD21") == T - 50_000,
        "wiek strefy zachowany (nie zresetowal sie na 'nowa aktywacje')")

print("2. strefa znika na dluzej niz karencja")
reset()
pansa._zones_shown["EPD21"] = wpis()
pansa._zones_since["EPD21"] = T
for krok in range(1, 8):                         # 7 tickow po 300 s = 35 min
    tick({}, T + krok * 300)
akcje = [e["action"] for e in pansa._zone_events]
sprawdz(akcje == ["off"], f"dokladnie jedno 'off', jest: {akcje}")
sprawdz("EPD21" not in pansa._zones_shown, "po zniesieniu znika z mapy")
sprawdz("EPD21" not in pansa._zones_since, "wiek strefy wyczyszczony")

print("3. w czasie karencji strefa nadal jest na mapie")
reset()
pansa._zones_shown["EPD21"] = wpis()
pansa._zones_since["EPD21"] = T
tick({}, T + 300)
sprawdz("EPD21" in pansa._zones_shown, "widoczna mimo braku w odczycie")
sprawdz(pansa._zone_events == [], "i bez zdarzenia")

print("4. powrot po dwoch brakujacych tickach tez nie generuje zdarzen")
reset()
pansa._zones_shown["EPD21"] = wpis()
pansa._zones_since["EPD21"] = T
tick({}, T + 300)
tick({}, T + 600)
tick({"EPD21": wpis()}, T + 900)
sprawdz(pansa._zone_events == [], f"zero zdarzen, jest: {pansa._zone_events}")

print("5. logika testu zgadza sie ze zrodlem")
zrodlo = (Path(__file__).resolve().parents[1]
          / "backend/app/collectors/pansa.py").read_text(encoding="utf-8")
for fragment in ("_zones_pending_off.setdefault(des, now_epoch)",
                 "if now_epoch - znikla_o < _OFF_GRACE_S:",
                 "pokazywane[des] = _zones_shown[des]",
                 "for des in obecne:"):
    sprawdz(fragment in zrodlo, f"kolektor zawiera: {fragment}")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("\nOK - przerwa krotsza niz karencja nie jest zniesieniem strefy")

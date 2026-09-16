# -*- coding: utf-8 -*-
"""Migotanie poziomów: podtrzymanie czasowe zamiast marginesu punktowego.

16.09.2026 podkarpackie (godziny PL): żółty 07:12 → brak 07:16 → czerwony 07:19 →
żółty 07:21 → czerwony 07:29 → żółty 07:36 → czerwony 07:38 → brak 07:42 (odwołanie
RSO 07:41). Poziom wyliczony z punktów w tych chwilach przepuszczamy przez
fusion.hold_level i sprawdzamy, że:
  - nie spada w ciągu LEVEL_HOLD_MIN od ostatniego przekroczenia progu,
  - odwołanie RCB/RSO zdejmuje podtrzymanie od razu,
  - po LEVEL_HOLD_MIN bez przekroczenia poziom wraca do punktów (13.09: margines
    punktowy trzymał żółty przy 1,7 pkt bez końca — tego nie chcemy).

Uruchomienie: py scripts/test_migotanie.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def t(hhmm: str) -> float:
    h, m = hhmm.split(":")
    return int(h) * 3600 + int(m) * 60


print("1. poranek 16.09 w podkarpackim")
CLEAR = t("07:41")
seq = [("07:12", "elevated", None), ("07:16", "none", None), ("07:19", "high", None),
       ("07:21", "elevated", None), ("07:29", "high", None), ("07:36", "elevated", None),
       ("07:38", "high", None), ("07:42", "none", CLEAR)]
wynik = [(hh, fusion.hold_level("test:podkarpackie", lvl, t(hh), clr)) for hh, lvl, clr in seq]
print("    ", wynik)
zmiany = sum(1 for a, b in zip(wynik, wynik[1:]) if a[1] != b[1])
sprawdz([w for _, w in wynik] == ["elevated", "elevated", "high", "high", "high", "high", "high", "none"],
        "żółty trzyma się do czerwonego, czerwony do odwołania RSO")
sprawdz(zmiany == 2, f"2 zmiany zamiast 7 ({zmiany})")

print("2. bez odwołania poziom wraca do punktów po podtrzymaniu")
k = "test:lubelskie"
fusion.hold_level(k, "elevated", t("10:00"))
sprawdz(fusion.hold_level(k, "none", t("10:05")) == "elevated", "5 min po progu — nadal żółty")
sprawdz(fusion.hold_level(k, "none", t("10:00") + config.LEVEL_HOLD_MIN * 60 + 1) == "none",
        f"po {config.LEVEL_HOLD_MIN} min bez przekroczenia — brak (koniec „1,7 pkt na żółtym”)")

print("3. wzrost zawsze natychmiast")
k = "test:podlaskie"
sprawdz(fusion.hold_level(k, "none", t("12:00")) == "none", "start bez poziomu")
sprawdz(fusion.hold_level(k, "high", t("12:01")) == "high", "od razu czerwony")

print("4. stare odwołanie nie zdejmuje podtrzymania nowego zdarzenia")
k = "test:mazowieckie"
fusion.hold_level(k, "high", t("15:00"))
sprawdz(fusion.hold_level(k, "elevated", t("15:03"), clear_at=t("12:00")) == "high",
        "odwołanie sprzed 3 h nie gasi czerwonego z 15:00")

print("5. odtwarzanie historii bez podtrzymania")
src = (ROOT / "backend" / "app" / "fusion.py").read_text(encoding="utf-8")
sprawdz("live = signals is None and ref is None" in src and 'new_level = st["alert_level"]' in src,
        "compute_state trzyma poziom tylko na żywo, reevaluate używa wyniku z compute_state")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - poziom nie migocze, odwołanie RSO i czas zdejmują podtrzymanie")

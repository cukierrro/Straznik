# -*- coding: utf-8 -*-
"""Etap alertu RCB po treści (tryb obserwacji, bez punktów) — teksty z 20.08–16.09.2026.

Źródła: gov.pl/web/rcb i cytaty SMS w mediach (zestawienie 16.09.2026). Etap 2
wystąpił tylko 13.09 04:15–05:00 w 6 powiatach lubelskiego.

Uruchomienie: py scripts/test_rso_etap.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app.collectors import rso  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


PRZYPADKI = [
    ("UWAGA! UWAGA! UWAGA! Na obszarze zachodniej Ukrainy trwa zmasowany atak powietrzny. Śledź komunikaty.", "monitor"),
    ("UWAGA! UWAGA! UWAGA! Trwa zmasowany rosyjski atak powietrzny na Ukrainę. Zachowaj czujność. Śledź komunikaty. Reaguj na syreny alarmowe.", "monitor"),
    ("UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo. Śledź komunikaty.", "monitor"),
    ("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.", "monitor"),
    ("UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Udaj się w bezpieczne miejsce. Stosuj się do poleceń lokalnych służb. Oczekuj dalszych komunikatów.", "action"),
    ("UWAGA! UWAGA! UWAGA! Odwołano zagrożenie atakiem z powietrza. Śledź komunikaty.", "clear"),
    ("UWAGA! UWAGA! UWAGA! Zakończył się atak na obszarze Ukrainy. Brak zagrożenia na terytorium RP. Śledź komunikaty.", "clear"),
    ("UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.", "clear"),
    ("ALERT RCB / SPO-13 ROSYJSKI ATAK POWIETRZNY NA TERENIE UKRAINY (RAKIETY/LOTNICTWO)", "unknown"),
]
for tekst, oczek in PRZYPADKI:
    wynik = rso.alert_stage(tekst)
    sprawdz(wynik == oczek, f"{oczek:8} ← {tekst[:80]} ({wynik})")
sprawdz(rso.alert_stage("Rosyjski atak powietrzny na terenie Ukrainy.", rso_alarm="2") == "clear",
        "rso_alarm=2 to odwołanie niezależnie od treści")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - etap alertu RCB rozpoznawany na tekstach z miesiąca (tylko obserwacja)")

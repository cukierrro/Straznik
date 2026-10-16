# -*- coding: utf-8 -*-
"""Ćwiczenia, testy i informacje wyborcze z Bałtyku to nie alarm (16.10.2026).

W październiku 3 z 4 punktowanych „alarmów” z mediów LT/LV/EE nie były alarmami.
Tytuły poniżej to prawdziwe wpisy z bazy sygnałów.

Uruchomienie:  py scripts/test_baltyk_cwiczenia.py
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app.collectors import rss_media  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


NIE_ALARM = [
    ("LV", "Gaisa telpas apdraudējuma gadījumā šūnu apraidē informēs arī par vēlēšanu iecirkņu darbību"),
    ("EE", "Päästeamet testib taas ohuteavitust"),
    ("LV", "Jēkabpils skolā pirmoreiz izmēģina rīcību gaisa telpas apdraudējuma gadījumā"),
    ("LT", "Tartu mokyklas oro pavojui ruošia praktiškai: ko trūksta Lietuvos mokyklų pasirengimui?"),
    ("LT", "Gaižauskas: nesutinku su nė vienu žodžiu, kad esame pasiruošę atremti oro pavojų"),
]
ALARM = [
    ("LV", "Izsludināts iespējamais gaisa telpas apdraudējums Krāslavas novadā"),
    ("LT", "Lietuvoje skelbiamas oro pavojus dėl drono grėsmės"),
]

for kraj, tytul in NIE_ALARM:
    ok(not rss_media._is_baltic_alert(tytul, kraj), f"{kraj} odrzucone: {tytul[:70]}")
for kraj, tytul in ALARM:
    ok(bool(rss_media._is_baltic_alert(tytul, kraj)), f"{kraj} prawdziwy alarm przechodzi: {tytul[:70]}")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - weto bałtyckie: ćwiczenia, testy, wybory")

# -*- coding: utf-8 -*-
"""Kolizje nazw miejscowości i powiatów w słowniku województw (21.10.2026).

Artykuły Radia Lublin o alercie dla lubelskiego wymieniały w opisie powiaty, w tym
„opolski” (powiat wokół Opola Lubelskiego), a rdzeń „opolsk” dawał województwo
opolskie — 21.09–15.10 opolskie dostało te same artykuły dziewięć razy. Przy okazji
przejrzane podobne pułapki: Janów i Międzyrzec Podlaski (lubelskie, nie podlaskie),
Rawa Mazowiecka (łódzkie, nie mazowieckie), „medyk/medyków” (lekarze, nie Medyka),
Chełmek (małopolskie, nie Chełm), Śląsk Opolski (opolskie, nie śląskie).
Ten sam zestaw sprawdza scripts/test_voiv_match.cjs dla engine.js.

Uruchomienie: py scripts/test_slownik_kolizje.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app.collectors.rss_media import _match_voivs  # noqa: E402

PRZYPADKI = [
    ("Alert RCB dla województwa lubelskiego. Alert trafił do powiatów: lubelskiego, puławskiego, "
     "opolskiego, kraśnickiego.", ["lubelskie"]),
    ("Pożar w Opolu Lubelskim", ["lubelskie"]),
    ("Syreny w okolicy Opola Lubelskiego", ["lubelskie"]),
    ("Janów Podlaski: syreny", ["lubelskie"]),
    ("Alarm w Międzyrzecu Podlaskim", ["lubelskie"]),
    ("Zderzenie w Rawie Mazowieckiej", ["łódzkie"]),
    ("Brak medyków w szpitalu", []),
    ("Kolejka w Medyce", ["podkarpackie"]),
    ("Chełmek: pożar", ["małopolskie"]),
    ("Na Śląsku Opolskim syreny", ["opolskie"]),
    # kontrola: prawdziwe opolskie dalej opolskie
    ("Alert dla województwa opolskiego", ["opolskie"]),
    ("Opole: syreny", ["opolskie"]),
    ("Biała Podlaska: syreny", ["lubelskie"]),
]
bledy = []
for tekst, oczekiwane in PRZYPADKI:
    wynik = _match_voivs(tekst)
    ok = wynik == oczekiwane
    print(("  OK   " if ok else "  BŁĄD ") + f"{tekst[:60]} → {wynik}")
    if not ok:
        bledy.append(tekst)
if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - nazwy powiatów i miejscowości nie mylą województw")

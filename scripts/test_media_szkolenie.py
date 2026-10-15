"""Zapowiedź szkolenia to nie meldunek o zagrożeniu (15.10.2026).

„Jak reagować w sytuacji zagrożenia? Specjalne szkolenie w Lublinie” dało lubelskiemu
0,8 pkt i razem z alarmem obwodu wołyńskiego oraz dronami 250 km od granicy wysłało
żółty alarm. Fusion odrzuca takie tytuły także w rekordach zapisanych wcześniej.

Uruchomienie: py scripts/test_media_szkolenie.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import fusion  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def media(tytul):
    return {"source": "media", "event_type": "media_keywords", "title": tytul}


sprawdz(fusion._media_retrospective(media("Media: „Jak reagować w sytuacji zagrożenia? Specjalne szkolenie w Lublinie”")),
        "zapowiedź szkolenia odrzucona (przypadek z 15.10)")
sprawdz(fusion._media_retrospective(media("Szkolenia z ewakuacji dla mieszkańców Chełma")),
        "szkolenia odrzucone")
sprawdz(not fusion._media_retrospective(media("Dron spadł na warsztat samochodowy pod Hrubieszowem")),
        "dron na warsztat dalej liczony")
# kontrola ujemna: relacja z trwającego alarmu z poradą nadal się liczy
sprawdz(not fusion._media_retrospective(media("Syreny w Lublinie. Jak reagować w sytuacji zagrożenia?")),
        "relacja z alarmu z „jak reagować” dalej liczona")
sprawdz(not fusion._media_retrospective(media("Drony nad Lubelszczyzną, poderwano myśliwce")),
        "zwykła relacja dalej liczona")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - zapowiedzi szkoleń nie dają punktów")

# -*- coding: utf-8 -*-
"""Rumunia w trybie cienia: klasyfikacja tytułów i godziny z komunikatów MApN.

Tytuły z prawdziwych artykułów (wrzesień 2026). Faza „start” to doniesienie o
alarmie teraz, „retro” — relacja po fakcie, „clear” — koniec alarmu.

Uruchomienie: py scripts/test_ro_shadow.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app.collectors import ro_shadow  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def faza(title, summary=""):
    c = ro_shadow.classify(title, summary)
    return c and c["phase"]


print("1. Doniesienia o alarmie teraz")
for t in ["Mesaj RO-Alert în Tulcea: posibile obiecte în cădere din spațiul aerian",
          "MApN: Drone detectate în apropierea graniţei cu România. Două avioane F-16 au fost trimise să monitorizeze zona",
          "RO-Alert în Tulcea. Populația este sfătuită să se adăpostească",
          "Alertă de drone în județul Tulcea. Autoritățile au emis două mesaje Ro-Alert"]:
    sprawdz(faza(t) == "start", f"start: {t[:70]} ({faza(t)})")

print("2. Po fakcie i koniec alarmu")
for t in ["Alertă în Tulcea azi-noapte: MApN a detectat drone în apropierea graniței / Mesaje RO-Alert transmise populației",
          "Mai multe drone au fost detectate în apropierea graniței României în cursul nopții, anunță MApN",
          "Numărul alertelor RO-Alert din cauza dronelor a explodat în Tulcea. Câte mesaje au fost emise"]:
    sprawdz(faza(t) == "retro", f"retro: {t[:70]} ({faza(t)})")
sprawdz(faza("Alerta aeriană a încetat în nordul județului Tulcea") == "clear", "koniec alarmu")
sprawdz(faza("Mesaj RO-Alert în Tulcea", "Un dron a fost detectat în cursul nopții") == "retro",
        "relacja po fakcie rozpoznana także z opisu RSS")

print("3. Nie o alarmie w Rumunii")
for t in ["Școlile din România primesc recomandări speciale în cazul alertelor de drone",
          "Avioane NATO au doborât o dronă deasupra Lituaniei",
          "Un startup american a dezvăluit drona „low-cost” care să înlocuiască MQ-9 Reaper",
          "Baze devastate, drone distruse și tot mai puține rachete",
          "Recomandările DSU pentru școli în cazul incidentelor cu drone"]:
    sprawdz(faza(t) is None, f"pominięte: {t[:70]} ({faza(t)})")

print("4. Godziny z komunikatu MApN (15.09.2026)")
TEXT = ("Centrul Național Militar de Comandă a notificat Inspectoratul General pentru Situații de "
        "Urgență cu privire la instituirea măsurilor de alertare a populației din nordul județului "
        "Tulcea, iar la ora 03.18 a fost transmis un mesaj RO-Alert. Alte două ținte au fost "
        "detectate în jurul orei 04.20, la 30 de kilometri nord de Periprava, un nou mesaj RO-Alert "
        "fiind trimis populației din nordul județului Tulcea la ora 04.51. Alerta aeriană a încetat "
        "la ora 5.18.")
t = ro_shadow.mapn_times(TEXT)
sprawdz(t == {"ro_alert_at": ["03.18", "04.51"], "end_at": "5.18"},
        f"RO-ALERT i koniec, bez godziny wykrycia „în jurul orei 04.20” ({t})")
sprawdz(ro_shadow.mapn_times("Exercițiul de mobilizare MOBEX NT-SV-BT-26") is None,
        "komunikat bez RO-ALERT pominięty")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - Rumunia w trybie cienia: start / retro / clear i godziny MApN")

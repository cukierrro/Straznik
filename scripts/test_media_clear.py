# -*- coding: utf-8 -*-
"""Media: granica słowa przy województwach i odwołanie zagrożenia.

Oba błędy złapane na jednym żywym sygnale (12.09.2026): ogólnopolski komunikat
„DORSZ: zakończono operowanie lotnictwa" dostał +1,0 pkt w WIELKOPOLSKIM, bo
„rozpoznania" zawiera „poznan" — i dostał punkty w ogóle, mimo że mówił, że
zagrożenie się skończyło.

Uruchomienie:  py scripts/test_media_clear.py
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config, fusion                                    # noqa: E402
from app.collectors import rss_media                              # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. trafienie tylko na granicy slowa")
for tekst, oczek in [
    # to jest dokladny fragment komunikatu DORSZ z 12.09.2026
    ("naziemne systemy obrony powietrznej i rozpoznania radiolokacyjnego", []),
    ("dzialania rozpoznawcze i rozpoznanie obrazowe", []),
    ("belkot w eterze zaglusza komunikaty", []),
    ("topole przy drodze krajowej", []),
    ("nad Poznaniem zauwazono drona", ["wielkopolskie"]),
    ("w Opolu slychac bylo syreny", ["opolskie"]),
    ("w Elku ogloszono alarm", ["warmińsko-mazurskie"]),
]:
    got = rss_media._match_voivs(tekst.lower())
    sprawdz(got == oczek, f"{tekst[:52]:<54} -> {got}")

print("2. kolizje nazw miedzy wojewodztwami")
for tekst, oczek in [
    ("w Bialej Podlaskiej slychac bylo syreny", ["lubelskie"]),
    ("nad Biala Podlaska przelecial dron", ["lubelskie"]),
    ("w Bielsku Podlaskim ogloszono alarm", ["podlaskie"]),
    ("wybuch w Chelmnie", ["kujawsko-pomorskie"]),
    ("wybuch w Chelmie", ["lubelskie"]),
    ("najwieksza armia na swiecie", []),
    ("alarm w Swieciu nad Wisla", ["kujawsko-pomorskie"]),
]:
    got = rss_media._match_voivs(tekst.lower())
    sprawdz(got == oczek, f"{tekst[:52]:<54} -> {got}")

print("3. rozpoznanie odwolania zagrozenia")
for tekst, oczek in [
    ("DORSZ: zakonczono operowanie lotnictwa w polskiej przestrzeni", True),
    ("Systemy powrocily do standardowej dzialalnosci operacyjnej", True),
    ("Odwolano alarm dla powiatu bialskiego", True),
    ("Zagrozenie minelo, mieszkancy moga wrocic do domow", True),
    ("Wznowiono ruch lotniczy na lotnisku w Lublinie", True),
    ("Poderwano mysliwce nad wschodnia Polska", False),
    ("Zestrzelono drona nad Lublinem", False),
    ("Alarm powietrzny w obwodzie wolynskim", False),
]:
    got = rss_media._is_media_clear(tekst.lower())
    sprawdz(got == oczek, f"{tekst[:56]:<58} -> {got}")

print("4. odwolanie wygasza wczesniejsze media w tym wojewodztwie")
teraz = datetime.now(timezone.utc)


def sygnal(event, minut_temu, pkt, voiv="lubelskie", source="media"):
    return {"id": f"{event}-{minut_temu}", "source": source, "event_type": event,
            "voivodeship": voiv, "points": pkt, "title": event, "details": {},
            "ts": (teraz - timedelta(minutes=minut_temu)).isoformat(timespec="seconds")}


# artykul alarmowy sprzed 10 minut, odwolanie 2 minuty temu
wynik = fusion.accumulate([sygnal("media_keywords", 10, 1.5),
                           sygnal("media_clear", 2, 0.0)], ref=teraz)
sprawdz(wynik["lubelskie"]["score"] == 0.0,
        f"media 1,5 sprzed 10 min + odwolanie -> {wynik['lubelskie']['score']}")

# odwolanie STARSZE niz artykul nie moze go wygasic
wynik = fusion.accumulate([sygnal("media_clear", 20, 0.0),
                           sygnal("media_keywords", 5, 1.5)], ref=teraz)
sprawdz(wynik["lubelskie"]["score"] == 1.5,
        f"odwolanie sprzed 20 min + swiezy artykul -> {wynik['lubelskie']['score']}")

# odwolanie w jednym wojewodztwie nie dotyka innego
wynik = fusion.accumulate([sygnal("media_keywords", 10, 1.5, "podkarpackie"),
                           sygnal("media_clear", 2, 0.0, "lubelskie")], ref=teraz)
sprawdz(wynik["podkarpackie"]["score"] == 1.5,
        f"odwolanie w lubelskim nie rusza podkarpackiego -> {wynik['podkarpackie']['score']}")

# odwolanie w mediach NIE wycisza oficjalnego alertu RCB
wynik = fusion.accumulate([sygnal("rcb_alert", 10, 2.0, "lubelskie", "rcb"),
                           sygnal("media_clear", 2, 0.0)], ref=teraz)
sprawdz(wynik["lubelskie"]["score"] == 2.0,
        f"odwolanie w mediach nie rusza RCB -> {wynik['lubelskie']['score']}")

print("5. slowniki maja te same hasla po obu stronach")
engine = (Path(__file__).resolve().parents[1] / "frontend/engine.js").read_text(encoding="utf-8")
sprawdz(all(k in engine for k in config.MEDIA_CLEAR_KEYWORDS),
        "wszystkie hasla odwolania sa tez w engine.js")

if bledy:
    print("\nBLEDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("\nOK - artykul o koncu zagrozenia nie punktuje, a nazwy nie lapia sie w srodku slow")

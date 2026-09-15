# -*- coding: utf-8 -*-
"""Zgłoszenie 14.09.2026: artykuł o oszuście z Radia Lublin dał 0,5 pkt w lubelskim i wielkopolskim.

Dwie przyczyny:
1. W opisie RSS był odnośnik „CZYTAJ: Wzmożona czujność na granicy po ataku dronów”,
   więc klasyfikator zobaczył „dron” i „atak” z INNEGO artykułu.
2. „na początku września” trafiło w hasło miasta Września (wielkopolskie).

Uruchomienie: py scripts/test_media_odnosniki.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app.collectors import rss_media  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


TITLE = "Podawał się za lekarza. Oszust w rękach policji"
SUMMARY = ("Kryminalni z Kraśnika zatrzymali oszusta, który podawał się za lekarza i oszukał troje seniorów "
           "na łączną kwotę 230 tysięcy złotych.  CZYTAJ: Wzmożona czujność na granicy po ataku dronów. "
           "„Polska jest przygotowana” &#8211; Schemat działania był za każdym razem podobny &#8211; mówi "
           "aspirant Marzena Sałata z Komendy Powiatowej Policji w Kraśniku. &#8211; Na początku września "
           "w terenie powiatu kraśnickiego [&#8230;]")

text = f"{TITLE} {rss_media._strip_teasers(SUMMARY)}"
level, hits = rss_media._classify(text)
sprawdz(level is None, f"artykuł o oszuście nie jest alarmem ({level}, {hits})")
voivs = rss_media._match_voivs(rss_media._neutralize_places(text))
sprawdz("wielkopolskie" not in voivs, f"„września” to miesiąc, nie Września ({voivs})")
sprawdz("lubelskie" in voivs, "Kraśnik nadal wskazuje lubelskie")

print("Prawdziwe przypadki muszą dalej działać")
alarm = f"Drony nad Lubelszczyzną {rss_media._strip_teasers('Alarm powietrzny i atak dronów w nocy. CZYTAJ: Oszust w rękach policji')}"
lvl, _ = rss_media._classify(alarm)
sprawdz(lvl is not None, f"treść przed odnośnikiem zostaje ({lvl})")
sprawdz(rss_media._match_voivs(rss_media._neutralize_places("Pożar we Wrześni, strażacy z Wrześni")) == ["wielkopolskie"],
        "miasto Września w formie „Wrześni” dalej wskazuje wielkopolskie")
sprawdz("wielkopolskie" not in rss_media._match_voivs(rss_media._neutralize_places("14 września we wrześniu 2026")),
        "daty z września nie wskazują województwa")

print("Relacja i publicystyka po nocnym alercie RCB (15.09.2026) nie dają punktów")
from app import fusion  # noqa: E402
for t in ["Nocny alert RCB na wschodzie Polski. Wojsko poderwało lotnictwo, przestrzeń powietrzna nie została naruszona",
          "Alert RCB zamiast ostrzegać, usypia czujność? Co nie działa w systemie alarmowym?",
          "Poderwane myśliwce i pilny alert RCB nad Polską. Wojsko zakończyło operację. Znamy szczegóły nocnego incydentu"]:
    lvl, _ = rss_media._classify(t)
    retro = fusion._media_retrospective({"source": "media", "event_type": "media_keywords", "title": f"Media: „{t}”"})
    sprawdz(lvl is None and retro, f"bez punktów: {t[:60]} (klasyfikacja={lvl}, retro={retro})")
live = fusion._media_retrospective({"source": "media", "event_type": "media_keywords",
                                     "title": "Media: „Atak Rosji na Ukrainę. Poderwano polskie lotnictwo”"})
sprawdz(not live, "relacja na żywo „Poderwano polskie lotnictwo” (01:00) nie jest relacją po fakcie")

if bledy:
    print(f"\nBŁĘDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - odnośniki „CZYTAJ:” i miesiąc „września” nie tworzą sygnałów")

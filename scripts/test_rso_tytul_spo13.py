# -*- coding: utf-8 -*-
"""Tytuł alertu RCB w nowym formacie RSO z 23.10.2026 („ALERT RCB / SPO-13”).

Wpis 23442123 (lubelskie, 12:04) miał `title` „ALERT RCB / SPO-13”, `shortcut`
„Lubelskie:ALERT RCB / SPO-13”, a komunikat stał w `content` dopiero po liście
18 powiatów i słowach „o treści:”. Panel i powody powiadomienia pokazywały
„Alert RCB (RSO): „Lubelskie:ALERT RCB / SPO-13”” — bez tego, co się dzieje.
Odwołanie 23442125 miało w `shortcut` prefiks „Lubelskie: ”.

Teksty poniżej to dosłowne treści z RSO z 23.10.2026 (dziennik obserwacji).

Uruchomienie: py scripts/test_rso_tytul_spo13.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.collectors import rso              # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

bledy = 0


def sprawdz(ok, opis):
    global bledy
    print(("  OK   " if ok else "  BŁĄD") + "  " + opis)
    if not ok:
        bledy += 1


POWIATY = ("LUBELSKIEGO: włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski, "
           "hrubieszowski, Zamość, zamojski, tomaszowski, biłgorajski, łukowski, Biała Podlaska, "
           "bialski, rycki, radzyński, parczewski, lubartowski")
MONITOR = ("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
           "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.")
KONIEC = "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski."

SPO13 = {  # 23442123, 12:04
    "title": "ALERT RCB / SPO-13", "shortcut": "Lubelskie:ALERT RCB / SPO-13",
    "content": "ALERT RCB / SPO-13 Zgodnie z decyzją dyrektora RCB, do użytkowników sieci "
               "telefonii komórkowych w powiatach na terenie województw(a):\r\n" + POWIATY
               + " wysłano Alert RCB o treści: " + MONITOR,
}
ODWOLANIE = {  # 23442125, 12:39
    "title": "ALERT RCB-odwołanie", "shortcut": "Lubelskie: " + KONIEC,
    "content": "Zgodnie z decyzją dyrektora RCB, do użytkowników sieci telefonii komórkowych "
               "w powiatach na terenie województw(a): " + POWIATY + " wysłano Alert RCB o treści: " + KONIEC,
}
PIERWSZY = {  # 23440870, 03:54 — stary kształt: komunikat w `shortcut`
    "title": "ALERT RCB", "shortcut": MONITOR,
    "content": MONITOR + " Dotyczy powiatów: hrubieszowski, Zamość, zamojski, tomaszowski, biłgorajski",
}


def tytul(it):
    """Dokładnie ten rachunek, który robi kolektor przy wystawianiu sygnału."""
    return rso.tytul_alertu(it.get("shortcut") or it.get("title") or "", it.get("content") or "")


print("Nagłówki puste:")
for n in ("ALERT RCB / SPO-13", "Lubelskie:ALERT RCB / SPO-13", "Alert RCB", "ALERT RCB/SPO 13",
          "Podkarpackie: Alert RCB", "Ostrzeżenie alarmowe"):
    sprawdz(rso._naglowek_pusty(n), f"„{n}” to nagłówek bez treści")
for n in ("ALERT RCB-ZAGROŻENIE Z POWIETRZA", MONITOR, "Lubelskie: " + KONIEC):
    sprawdz(not rso._naglowek_pusty(n), f"„{n[:45]}…” niesie treść")

print("Tytuły z dzisiejszych wpisów:")
sprawdz(tytul(SPO13) == MONITOR, "SPO-13: tytuł to komunikat po „o treści:”, bez listy powiatów")
sprawdz("SPO-13" not in tytul(SPO13) and "Lubelskie" not in tytul(SPO13), "SPO-13: bez nagłówka i prefiksu")
sprawdz(tytul(ODWOLANIE) == KONIEC, "odwołanie: bez prefiksu „Lubelskie: ”")
sprawdz(tytul(PIERWSZY) == MONITOR, "stary kształt (komunikat w `shortcut`) bez zmian")
WIECZOR = {  # 23442826, 17:56 — nagłówek doklejony do komunikatu w `shortcut`
    "title": "ALERT RCB / SPO-13",
    "shortcut": "ALERT RCB / SPO-13: UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo.",
    "content": "ALERT RCB / SPO-13: Zgodnie z decyzją dyrektora RCB, … wysłano Alert RCB o treści: " + MONITOR,
}
sprawdz(tytul(WIECZOR).startswith("UWAGA! Rosyjski atak powietrzny"), "17:56: bez doklejonego „ALERT RCB / SPO-13:”")
sprawdz(rso.tytul_alertu("ALERT RCB-ZAGROŻENIE Z POWIETRZA", "x") == "ALERT RCB-ZAGROŻENIE Z POWIETRZA",
        "nagłówek z treścią po myślniku zostaje")
sprawdz(rso.tytul_alertu("Alert RCB", "") == "Alert RCB", "pusta treść → zostaje nagłówek „Alert RCB” (jak dotąd)")
sprawdz(rso.tytul_alertu("ALERT RCB / SPO-13", "ALERT RCB / SPO-13 " + MONITOR) == MONITOR,
        "bez „o treści:” zdejmujemy sam nagłówek z początku treści")
sprawdz(rso.tytul_alertu("Mazowsze: coś", "x") == "Mazowsze: coś",
        "dwukropek po słowie, które nie jest województwem, zostaje")

print("Punkty i odwołanie bez zmian:")
sprawdz(rso.rcb_level(f"{SPO13['title']} {SPO13['shortcut']} {SPO13['content']}") == 1,
        "SPO-13 „sytuacja monitorowana” → poziom 1")
sprawdz(rso._is_rcb_air_cancellation(ODWOLANIE), "odwołanie rozpoznane")
sprawdz(not rso._is_rcb_air_cancellation(SPO13), "SPO-13 to nie odwołanie")

print()
print(f"BŁĘDY: {bledy}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)

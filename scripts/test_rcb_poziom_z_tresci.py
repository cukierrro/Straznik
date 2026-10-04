# -*- coding: utf-8 -*-
"""Poziom alertu RCB musi być liczony z CAŁEJ treści wpisu RSO.

Powód jest konkretny, nie teoretyczny. 04.10.2026 RSO przysłało dla woj.
lubelskiego wpis 23389161, w którym `title` i `shortcut` brzmiały dosłownie
„Alert RCB", a cały komunikat siedział w `content`. Kod liczył wtedy poziom
ze wzoru `title + description`, a pole `description` W OGÓLE NIE ISTNIEJE
w schemacie RSO (wpisy mają title, shortcut, content, rso_alarm, provinces,
valid_from, valid_to). Poziom powstawał więc z samego nagłówka.

Skutek przy takim kształcie wpisu: alert poziomu 3 — ten, w którym państwo
mówi „znajdź bezpieczne miejsce" — dostałby 1,5 pkt zamiast 4,5, czyli
NIE PODNIÓSŁBY czerwonego alarmu. Ten test pilnuje, żeby to nie wróciło.

Uruchomienie: py scripts/test_rcb_poziom_z_tresci.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import config                      # noqa: E402
from app.collectors import rso              # noqa: E402

bledy = 0


def sprawdz(ok, opis):
    global bledy
    print(("  OK   " if ok else "  BŁĄD") + "  " + opis)
    if not ok:
        bledy += 1


def poziom_wpisu(it):
    """Dokładnie ten rachunek, który robi kolektor przy wystawianiu sygnału."""
    naglowek = it.get("shortcut") or it.get("title") or ""
    tresc = it.get("content") or ""
    return rso.rcb_level(f"{it.get('title','')} {naglowek} {tresc}")


print("1. Kształt wpisu z 04.10.2026: nagłówek „Alert RCB”, komunikat w content")
WPIS = {"title": "Alert RCB", "shortcut": "Alert RCB"}

trzeci = dict(WPIS, content="UWAGA! Znajdź bezpieczne miejsce. Trwa atak.")
p = poziom_wpisu(trzeci)
sprawdz(p == 3, f"„znajdź bezpieczne miejsce” w content daje poziom 3 (wyszło {p})")
# UWAGA: suma punktow NIE zapala czerwonego. `fusion.red_key` wymaga klucza,
# a bez niego poziom spada z „high" na „elevated" NIEZALEZNIE od punktow —
# 6 czy 10 pkt bez klucza zostaje zolte. Poziom 3 alertu RCB JEST jednym
# z dwoch kluczy, wiec zgubienie go nie kosztuje punktow, tylko zabiera
# sam wyzwalacz czerwonego.
from app import fusion                       # noqa: E402
sygnal = {"event_type": "rso_alert", "ts": "2026-10-04T13:33:38+00:00",
          "counted_points": 4.5, "details": {"rcb_level": p}}
klucz = fusion.red_key([sygnal])
sprawdz(klucz is not None and klucz.get("powod") == "rcb3",
        "poziom 3 jest KLUCZEM czerwonego alarmu (fusion.red_key -> rcb3)")
sygnal1 = dict(sygnal, details={"rcb_level": 1})
sprawdz(fusion.red_key([sygnal1]) is None,
        "poziom 1 klucza NIE daje — i zadna liczba punktow go nie zastapi")

atak = dict(WPIS, content="UWAGA! Zagrożenie atakiem z powietrza.")
sprawdz(poziom_wpisu(atak) == 3, "„zagrożenie atakiem z powietrza” w content daje poziom 3")

drugi = dict(WPIS, content="UWAGA! Zmasowany atak na infrastrukturę.")
sprawdz(poziom_wpisu(drugi) == 2, "„zmasowany” w content daje poziom 2")

print("2. Prawdziwa treść z 04.10 zostaje poziomem 1 — nic nie zawyżamy")
dzis = dict(WPIS, content="UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. "
                          "Sytuacja jest monitorowana. W przestrzeni RP operuje "
                          "polskie lotnictwo. Oczekuj dalszych komunikatów.")
sprawdz(poziom_wpisu(dzis) == 1, "komunikat „sytuacja jest monitorowana” to nadal poziom 1")
potencjalne = dict(WPIS, content="UWAGA. POTENCJALNE ZAGROŻENIE Z POWIETRZA.")
sprawdz(poziom_wpisu(potencjalne) == 1,
        "„potencjalne zagrożenie z powietrza” to poziom 1 — brak słowa „atakiem”")

print("3. Pole `description` nie istnieje — stary wzór nie może wrócić")
zrodlo = (Path(__file__).resolve().parents[1]
          / "backend/app/collectors/rso.py").read_text(encoding="utf-8")
# Komentarze odcinamy, inaczej test liczy wlasna proze: w kodzie opisujemy
# przeciez, dlaczego `description` nie wolno czytac.
kod_linie = [l for l in zrodlo.splitlines() if not l.lstrip().startswith('#')]
import re as _re
kod = _re.sub(r'"""[\s\S]*?"""', '', chr(10).join(kod_linie))
sprawdz("it.get('description')" not in kod and 'it.get("description")' not in kod,
        "kolektor nie czyta nieistniejącego pola `description`")
sprawdz('rcb_level(f"{it.get(\'title\',\'\')} {naglowek} {tresc}")' in zrodlo,
        "poziom liczony z tytułu, skrótu i treści razem")

print("4. Tytuł dla człowieka: gdy nagłówek nic nie mówi, bierzemy treść")
sprawdz(rso._naglowek_pusty("Alert RCB"), "„Alert RCB” uznane za nagłówek pusty")
sprawdz(rso._naglowek_pusty("Ostrzeżenie alarmowe"), "„Ostrzeżenie alarmowe” też")
sprawdz(not rso._naglowek_pusty("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy"),
        "prawdziwy komunikat NIE jest uznany za pusty nagłówek")


print("5. Etapy komunikatów — dziennik ma je rozpoznawać, nie chować pod „unknown”")
# 04.10.2026 RSO przysłało „UWAGA. POTENCJALNE ZAGROŻENIE Z POWIETRZA." i etap
# wyszedł „unknown”, bo nie znaliśmy tego sformułowania. To nie jest ani
# „sytuacja monitorowana” (zagrożenie nad Ukrainą), ani wezwanie do działania.
ETAPY = [
    ("UWAGA. POTENCJALNE ZAGROŻENIE Z POWIETRZA.", "ostrzezenie"),
    ("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.", "monitor"),
    ("UWAGA! Znajdź bezpieczne miejsce. Zagrożenie atakiem z powietrza.", "action"),
    ("UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.", "clear"),
]
for tekst, oczekiwany in ETAPY:
    wynik = rso.alert_stage(tekst)
    sprawdz(wynik == oczekiwany,
            f"„{tekst[:46]}…” -> {wynik} (oczekiwano {oczekiwany})")
sprawdz(rso.alert_stage("zupełnie inny komunikat o niczym") == "unknown",
        "nieznana treść nadal daje „unknown” — nie zgadujemy")

# Etap NIE może przeciekać do punktacji: to dwie osobne listy znaczników.
sprawdz(rso.rcb_level("UWAGA. POTENCJALNE ZAGROŻENIE Z POWIETRZA.") == 1,
        "nowy etap NIE zmienia poziomu — „potencjalne zagrożenie” zostaje poziomem 1")


print("6. Odwolanie NIE moze przejsc sciezka alertu")
# Pulapka sprzezenia: odwolanie „Odwolano zagrozenie atakiem z powietrza" ZAWIERA
# zwrot z poziomu 3. Po zmianie liczenia poziomu z calej tresci wyszloby z niego
# 4,5 pkt i KLUCZ CZERWONEGO — czyli odwolanie zapalaloby alarm. Nie dzieje sie
# tak tylko dlatego, ze `_is_rcb_air_cancellation` jest sprawdzane WCZESNIEJ
# i konczy obieg. Gdyby ktos odwrocil kolejnosc, zrobiloby sie cicho i zle.
ODWOLANIA = [
    "Odwołano zagrożenie atakiem z powietrza.",
    "UWAGA! Odwołano zagrożenie atakiem z powietrza. Brak zagrożenia na terenie Polski.",
    "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.",
]
for tekst in ODWOLANIA:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    sprawdz(rso._is_rcb_air_cancellation(it),
            f"odwołanie rozpoznane przed punktacją: „{tekst[:48]}…”")
# ...i odwrotnie: prawdziwy alert nie moze zostac wziety za odwolanie
for tekst in ["UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Udaj się w bezpieczne miejsce.",
              "UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana."]:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    sprawdz(not rso._is_rcb_air_cancellation(it),
            f"alert NIE wzięty za odwołanie: „{tekst[:48]}…”")
# Dowod, ze sprzezenie jest realne: sama tresc odwolania daje poziom 3.
sprawdz(rso.rcb_level("Odwołano zagrożenie atakiem z powietrza.") == 3,
        "treść odwołania SAMA W SOBIE daje poziom 3 — dlatego kolejność sprawdzeń ma znaczenie")


print("7. TRZY OFICJALNE PROGI RCB (wprowadzone 17.09.2026) — tresci doslowne")
# Zrodlo: opis trzech wariantow alertu opublikowany 17.09.2026 (portalobronny.se.pl,
# potwierdzony przez polskieradio24 i wnp.pl; data zgadza sie z komentarzem przy
# RCB_LEVEL_MARKERS). To sa wzorcowe tresci — jesli RCB je zmieni, ten test padnie
# i bedzie to WLASCIWY sygnal, zeby zaktualizowac znaczniki, a nie usuwac asercje.
OFICJALNE = [
    (1, "UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
        "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów"),
    (2, "UWAGA! Trwa zmasowany rosyjski atak powietrzny na Zachodnią Ukrainę. "
        "Oczekuj dalszych komunikatów. Reaguj na sygnały alarmowe"),
    (3, "UWAGA! UWAGA! UWAGA! Zagrożenie atakiem z powietrza. Znajdź bezpieczne miejsce. "
        "Stosuj się do poleceń służb. Oczekuj dalszych komunikatów"),
]
for oczekiwany, tekst in OFICJALNE:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    sprawdz(not rso._is_rcb_air_cancellation(it),
            f"próg {oczekiwany} nie jest brany za odwołanie")
    wynik = poziom_wpisu(it)
    sprawdz(wynik == oczekiwany,
            f"próg {oczekiwany}: wyszedł {wynik} ({config.RCB_LEVEL_POINTS[wynik]} pkt) "
            f"— „{tekst[:44]}…”")

# Trzeci prog MUSI dawac klucz czerwonego: to jedyny komunikat, w ktorym panstwo
# kaze szukac bezpiecznego miejsca.
from app import fusion                                           # noqa: E402
it3 = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": OFICJALNE[2][1]}
sygnal3 = {"event_type": "rso_alert", "ts": "2026-10-04T13:33:38+00:00",
           "counted_points": 4.5, "details": {"rcb_level": poziom_wpisu(it3)}}
sprawdz((fusion.red_key([sygnal3]) or {}).get("powod") == "rcb3",
        "trzeci próg daje KLUCZ czerwonego alarmu")
# ...a drugi i pierwszy NIE daja, choc drugi to juz 3 pkt.
for oczekiwany, tekst in OFICJALNE[:2]:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    syg = {"event_type": "rso_alert", "ts": "2026-10-04T13:33:38+00:00",
           "counted_points": 3.0, "details": {"rcb_level": poziom_wpisu(it)}}
    sprawdz(fusion.red_key([syg]) is None,
            f"próg {oczekiwany} NIE daje klucza czerwonego")


print("8. Odwolania trzech progow — wykrywane, a alerty NIE wyciszane")
# Potwierdzone tresci odwolan RCB (dwie) plus formy, ktorych RCB dotad nie uzylo,
# ale ktore przeciekaly: „Koniec zagrozenia…" i „…ustapilo" nie pasowaly do zadnej
# formy w RSO_END i przeszlyby jako NOWY alert, trzymajac punkty zamiast je zdjac.
ODWOLANIA_ROZSZERZONE = [
    "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski",
    "Odwołano zagrożenie atakiem z powietrza",
    "UWAGA! Zakończył się zmasowany rosyjski atak powietrzny na Zachodnią Ukrainę",
    "UWAGA! Koniec zagrożenia atakiem z powietrza",
    "UWAGA! Ustąpiło zagrożenie atakiem z powietrza",
    "UWAGA! Zagrożenie atakiem z powietrza ustąpiło",
]
for tekst in ODWOLANIA_ROZSZERZONE:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    sprawdz(rso._is_rcb_air_cancellation(it), f"odwołanie wykryte: „{tekst[:52]}…”")

# NAJWAZNIEJSZE: rozszerzenie listy odwolan dziala w strone NIEBEZPIECZNA (falszywe
# odwolanie wycisza zywy alert), wiec kazdy znany ALERT musi przejsc nietkniety.
ALERTY_ZYWE = [t for _, t in OFICJALNE] + [
    "UWAGA. POTENCJALNE ZAGROŻENIE Z POWIETRZA.",
    "UWAGA! UWAGA! UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
    "W przestrzeni RP operuje polskie lotnictwo. Śledź komunikaty.",
    "Na obszarze zachodniej Ukrainy trwa zmasowany atak powietrzny.",
]
for tekst in ALERTY_ZYWE:
    it = {"title": "Alert RCB", "shortcut": "Alert RCB", "content": tekst}
    sprawdz(not rso._is_rcb_air_cancellation(it),
            f"alert NIE wyciszony przez listę odwołań: „{tekst[:48]}…”")

print("\nBŁĘDY: %d" % bledy)
sys.exit(1 if bledy else 0)

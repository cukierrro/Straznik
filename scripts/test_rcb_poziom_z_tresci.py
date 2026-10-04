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

print("\nBŁĘDY: %d" % bledy)
sys.exit(1 if bledy else 0)

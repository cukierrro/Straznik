# -*- coding: utf-8 -*-
"""Ponowienie czerwonego i spóźniony alarm (decyzje usera 2.11.2026, 1.8.06).

Przypadki pochodzą z przeliczenia na historii 2.08-2.11. Moduł produkcyjny puszczony na tych
danych dał 5 ponowień od obiektów (28.09, 16.10, 19.10, 20.10, 23.10) i 2 od RCB (28.09,
08.10), a noc 1.11 bez ponowienia. Ten test pilnuje reguły i jej wpięcia.

Uruchomienie:  py scripts/test_ponowienie.py
"""
import asyncio
import re
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

KORZEN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KORZEN / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion, ponowienie as P  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


T0 = datetime(2026, 11, 1, 2, 6, tzinfo=timezone.utc)
V = "lubelskie"


def obiekt(tor, km, jakosc="high", zgl=2, rejon=False, wsp=None):
    return {"tor": tor, "km": km, "rejon": rejon, "jakosc": jakosc, "zgloszenia": zgl,
            "wsp": wsp if wsp is not None else (50.5 + (km or 0) / 111.2, 24.0)}


BRAK_RCB = (0, None)


def po(minut):
    return T0 + timedelta(minutes=minut)


def sesja(*start):
    P.zakoncz(V)
    P.rozpocznij(V, list(start), BRAK_RCB, T0)


print("1. nic nowego: cisza, jak noc 1.11")
sesja(obiekt("t1", 42.0, zgl=3))
ok(P.krok(V, [obiekt("t1", 42.0, zgl=3)], BRAK_RCB, po(16)) is None, "ten sam obiekt po 15 min nie budzi")
ok(P.krok(V, [obiekt("t2", 37.7, zgl=6)], BRAK_RCB, po(20)) is None, "nowy tor 37,7 km: dalej niż 30 km, nie budzi")

print("\n2. nowa bliska pozycja budzi, także tor sprzed chwili, jak 28.09")
sesja(obiekt("a", 18.5))
P.krok(V, [obiekt("a", 13.1)], BRAK_RCB, po(8))
ok(P.krok(V, [obiekt("b", 2.5, zgl=5)], BRAK_RCB, po(10)) is None, "w czasie syreny: pochłonięte, bez ponowienia")
sesja(obiekt("a", 18.5))
P.krok(V, [obiekt("a", 13.1)], BRAK_RCB, po(8))
w = P.krok(V, [obiekt("b", 2.5, zgl=5)], BRAK_RCB, po(15))
ok(bool(w) and w["rodzaj"] == "obiekt" and w["km"] == 2.5, "po 15 min: dron 2,5 km budzi")

print("\n3. warunki jakości i pozycji")
sesja(obiekt("a", 40.0))
ok(P.krok(V, [obiekt("c", 15.1, jakosc="medium", zgl=1)], BRAK_RCB, po(30)) is None, "21.10: pojedynczy meldunek nie budzi")
ok(P.krok(V, [obiekt("c", 15.1, jakosc="medium", zgl=5)], BRAK_RCB, po(30)) is None, "średnia wiarygodność nie budzi")
ok(P.krok(V, [obiekt("c", 15.1, zgl=1)], BRAK_RCB, po(30)) is None, "wysoka, ale 1 zgłoszenie nie budzi")
ok(P.krok(V, [obiekt("c", 15.0, rejon=True)], BRAK_RCB, po(30)) is None, "pozycja rejonowa nie budzi")
ok(P.krok(V, [obiekt("c", 30.1)], BRAK_RCB, po(30)) is None, "30,1 km nie budzi")
ok(bool(P.krok(V, [obiekt("c", 30.0)], BRAK_RCB, po(30))), "równo 30 km budzi")

print("\n4. ten sam punkt pod nowym numerem toru nie budzi drugi raz")
wsp = (50.6, 24.0)
sesja()
ok(bool(P.krok(V, [obiekt("x1", 14.3, wsp=wsp)], BRAK_RCB, po(27))), "pierwszy raz budzi")
ok(P.krok(V, [obiekt("x2", 14.3, wsp=wsp)], BRAK_RCB, po(68)) is None, "16.10: ta sama pinezka 41 min później nie budzi")
ok(P.krok(V, [obiekt("x3", 14.3, wsp=(50.62, 24.02))], BRAK_RCB, po(90)) is None, "punkt ok. 3 km obok też nie")

print("\n5. bliżej o co najmniej 10 km przy znanym punkcie")
sesja(obiekt("a", 25.0, wsp=wsp))
ok(P.krok(V, [obiekt("a", 16.0, wsp=wsp)], BRAK_RCB, po(20)) is None, "9 km bliżej nie budzi")
ok(bool(P.krok(V, [obiekt("a", 15.0, wsp=wsp)], BRAK_RCB, po(21))), "10 km bliżej budzi")

print("\n6. odstęp i limit")
sesja()
a = P.krok(V, [obiekt("p1", 29.0, wsp=(50.0, 24.0))], BRAK_RCB, po(1))
ok(a is None, "syrena gra: pierwsze 15 min bez ponowienia")
sesja()
ok(bool(P.krok(V, [obiekt("p1", 29.0, wsp=(50.0, 24.0))], BRAK_RCB, po(15))), "1. ponowienie")
ok(P.krok(V, [obiekt("p2", 28.0, wsp=(51.0, 24.0))], BRAK_RCB, po(29)) is None, "14 min po ponowieniu: za wcześnie")
sesja()
P.krok(V, [obiekt("p1", 29.0, wsp=(50.0, 24.0))], BRAK_RCB, po(15))
ok(bool(P.krok(V, [obiekt("p2", 28.0, wsp=(51.0, 24.0))], BRAK_RCB, po(30))), "2. ponowienie")
ok(P.krok(V, [obiekt("p3", 27.0, wsp=(52.0, 24.0))], BRAK_RCB, po(45)) is None, "limit 2")

print("\n7. RCB co najmniej 2. stopnia zawsze, ale raz")
sesja()
w = P.krok(V, [], (3, 77), po(5))
ok(bool(w) and w["rodzaj"] == "rcb", "w czasie syreny, poza odstępem")
ok(P.krok(V, [], (3, 77), po(6)) is None, "ten sam alert nie budzi drugi raz")
ok(P.krok(V, [], (1, 78), po(40)) is None, "1. stopień nie budzi")
sesja()
P.krok(V, [obiekt("p1", 29.0, wsp=(50.0, 24.0))], BRAK_RCB, po(15))
P.krok(V, [obiekt("p2", 28.0, wsp=(51.0, 24.0))], BRAK_RCB, po(30))
ok(bool(P.krok(V, [], (2, 80), po(31))), "także po wyczerpaniu limitu")

print("\n8. restart procesu nie wywołuje alarmu")
P.zakoncz(V)
ok(P.krok(V, [obiekt("r", 5.0, zgl=9)], (3, 90), po(100)) is None, "brak sesji: bieżące punkty uznane za znane")
ok(P.krok(V, [obiekt("r", 5.0, zgl=9)], (3, 90), po(120)) is None, "i dalej nie budzą")

print("\n9. wpięcie w fusion")


def sygnal(id_, ts, **d):
    det = {"type": "uav", "dist_km": 12.5, "eta_border_min": 4, "course": "known", "confidence": "high",
           "source_count": 2, "uncertainty_km": 4, "position_approximate": False, "track_id": f"t{id_}",
           "lat": 50.6, "lon": 24.0}
    det.update(d)
    return {"id": id_, "ts": ts.isoformat(), "source": "neptun", "event_type": "neptun_threat",
            "voivodeship": V, "points": 1.0, "title": "Dron", "details": det}


teraz = datetime.now(timezone.utc)
ob, rcb = fusion._dane_ponowienia({"signals": [
    sygnal(1, teraz),
    sygnal(2, teraz - timedelta(minutes=config.RED_GATE_MAX_AGE_MIN + 1)),
    {"id": 3, "ts": teraz.isoformat(), "source": "neptun", "event_type": "neptun_wave", "details": {}},
    {"id": 4, "ts": teraz.isoformat(), "source": "rcb", "event_type": "rso_alert", "details": {"rcb_level": 2}, "title": "x"},
]})
ok([o["tor"] for o in ob] == ["t1"], "tylko świeże obiekty z kluczem, bez fali")
ok(rcb == (2, 4), "bieżący alert RCB")
ok(ob[0]["wsp"] == (50.6, 24.0) and ob[0]["jakosc"] == "high" and ob[0]["zgloszenia"] == 2, "pola obiektu")

wyslane = []


async def odbior(voiv, level, score, signals, log_id=None, ponowienie=None):
    wyslane.append((voiv, level, ponowienie))


async def przez_fusion():
    stary = fusion.on_level_change, config.RED_PONOWIENIE_WLACZONE, fusion.alert_log if hasattr(fusion, "alert_log") else None
    fusion.on_level_change = odbior
    from app import alert_log
    zapis = alert_log.record_transition
    alert_log.record_transition = lambda *a, **k: 123
    try:
        st = {"signals": [sygnal(9, datetime.now(timezone.utc))], "score": 6.0}
        P.zakoncz(V)
        P.rozpocznij(V, [], BRAK_RCB, datetime.now(timezone.utc) - timedelta(minutes=20))
        fusion._sprawdz_ponowienie(V, st)
        await asyncio.sleep(0)
        config.RED_PONOWIENIE_WLACZONE = False
        P.zakoncz(V)
        P.rozpocznij(V, [], BRAK_RCB, datetime.now(timezone.utc) - timedelta(minutes=20))
        fusion._sprawdz_ponowienie(V, st)
        await asyncio.sleep(0)
    finally:
        fusion.on_level_change, config.RED_PONOWIENIE_WLACZONE = stary[0], stary[1]
        alert_log.record_transition = zapis


asyncio.run(przez_fusion())
ok(len(wyslane) == 1 and wyslane[0][2]["km"] == 12.5, "ponowienie idzie przez on_level_change; wyłącznik działa")

zrodlo = (KORZEN / "backend/app/fusion.py").read_text(encoding="utf-8")
ok('_sprawdz_ponowienie(voiv, st)' in zrodlo and 'ponowienie.rozpocznij(voiv' in zrodlo and 'ponowienie.zakoncz(voiv)' in zrodlo,
   "reevaluate: start, krok, koniec")
notify = (KORZEN / "backend/app/notify.py").read_text(encoding="utf-8")
ok("if last and not ponowienie:" in notify, "ponowienie omija zwykły cooldown (alert RCB ma przejść)")
ok("PONOWNY ALARM" in notify, "nagłówek mówi, że to ponowny alarm")

print("\n10. spóźniony alarm nie jest cichy")
A = (KORZEN / "android-app/android/app/src/main/java/pl/straznik/app/Alarms.java").read_text(encoding="utf-8").replace("\r\n", "\n")
ok(not re.search(r"if \(stale\) \{\s*Notification\.Builder b = builder\(ctx, CH_QUIET\)", A), "brak cichej ścieżki dla spóźnionego")
ok("SPOZNIONY_OD_MS = 3 * 60 * 1000L" in A and "STALE_AFTER_MS = 10 * 60 * 1000L" in A, "progi 3 i 10 min")
m = A[A.index("static String notkaOpoznienia"):]
m = m[:m.index("\n    }\n")]
for tekst in ("Alarm dotarł z opóźnieniem", "SPÓŹNIONY ALARM. Zagrożenie z godz.", "Spóźnione o ", "Sytuacja"):
    ok(tekst in m, f"tekst: {tekst}")
ok(".putExtra(AlarmActivity.EXTRA_NOTKA, notka)" in A, "ekran alarmu dostaje tekst")
Z = (KORZEN / "android-app/android/app/src/main/java/pl/straznik/app/AlarmActivity.java").read_text(encoding="utf-8")
ok("getStringExtra(EXTRA_NOTKA)" in Z, "ekran alarmu pokazuje tekst")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK: ponowienie tylko przy realnym zbliżeniu, spóźniony alarm gra i mówi, że jest spóźniony")

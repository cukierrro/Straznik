# -*- coding: utf-8 -*-
"""Audyt G3 i G6: kurs domniemany nie uruchamia alarmu ETA, dron odrzutowy leci szybciej.

G3: NEPTUN oznacza kurs „kursem na X” polem presumptiveCourse. Taki kurs różnił
się od faktycznego ruchu o medianę 90°. Punkty liczymy po staremu, ale alarm ETA
wymaga kursu podanego wprost albo potwierdzonego ruchem.
G6: „Реактивний БпЛА” (Geran-3) — do czasu dolotu 600 km/h zamiast 180 km/h.

Uruchomienie: py scripts/test_kurs_domniemany.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, fusion, geo  # noqa: E402
from app.collectors import neptun  # noqa: E402

ingested = []


async def fake_ingest(**kw):
    ingested.append(kw)
    return True

fusion.ingest = fake_ingest
fusion.on_state_change = None
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def run(*batches):
    for batch in batches:
        asyncio.run(neptun._handle_threats([dict(t) for t in batch], replace=False))


def last_signal(tid):
    got = [s for s in ingested if s["details"]["track_id"] == tid]
    return got[-1] if got else None


# Rakieta manewrująca ok. 40 km od granicy nad Wołyniem, kurs na zachód (na PL).
LAT, LON = 51.0, 24.75
a = geo.assess_for_scoring(LAT, LON, 270, config.NEPTUN_HEADING_TOLERANCE, config.NEPTUN_HEADING_SOFT_DEG,
                           config.NEPTUN_UNKNOWN_HEADING_MULT, config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
print(f"punkt testowy: {a['dist_km']} km od granicy, kurs na PL={a['toward_pl']}")
BASE = {"type": "cruise", "lat": LAT, "lon": LON, "heading": 270, "confidenceLevel": "high",
        "sourceCount": 3, "positionQuality": "confirmed", "lifecycle": "confirmed", "status": "active"}

print("1. G3: kurs podany wprost — alarm ETA jak dotąd")
run([{**BASE, "id": "trk_g3_reported"}])
s = last_signal("trk_g3_reported")
sprawdz(s and s["details"]["eta_alarm"] in ("high", "elevated") and s["details"]["heading_source"] == "reported",
        f"alarm ETA przy kursie podanym ({s and s['details']['eta_alarm']})")

print("2. G3: kurs domniemany bez ruchu — punkty są, alarmu ETA brak")
run([{**BASE, "id": "trk_g3_presumed", "presumptiveCourse": True, "destination": True}])
s = last_signal("trk_g3_presumed")
sprawdz(s is not None and s["points"] > 0, f"obiekt nadal punktuje ({s and s['points']})")
sprawdz(s and s["details"]["eta_alarm"] is None and s["details"]["course"] == "presumptive",
        f"bez alarmu ETA, course=presumptive ({s and s['details']['eta_alarm']}, {s and s['details']['course']})")
sprawdz(s and s["points"] < config.THRESHOLD_HIGH,
        f"punkty z samego obiektu, bez podniesienia do czerwonego przez ETA ({s and s['points']})")

print("3. G3: kurs domniemany potwierdzony ruchem na zachód — alarm ETA wraca")
first = {**BASE, "id": "trk_g3_moving", "presumptiveCourse": True, "lon": LON + 0.06}
run([first], [{**first, "lon": LON}])
s = last_signal("trk_g3_moving")
sprawdz(s and s["details"]["eta_alarm"] in ("high", "elevated"),
        f"ruch ≥2 km na zachód potwierdza kurs ({s and s['details']['eta_alarm']})")

print("4. G3: kurs domniemany, ale ruch w przeciwną stronę — bez alarmu ETA")
first = {**BASE, "id": "trk_g3_away", "presumptiveCourse": True, "lon": LON - 0.06}
run([first], [{**first, "lon": LON}])
s = last_signal("trk_g3_away")
sprawdz(s is None or s["details"]["eta_alarm"] is None,
        f"ruch od granicy nie potwierdza kursu ({s and s['details']['eta_alarm']})")

print("5. G6: dron odrzutowy")
drone = {"type": "uav", "lat": 51.0, "lon": 25.6, "heading": 270, "confidenceLevel": "high",
         "sourceCount": 3, "positionQuality": "confirmed", "lifecycle": "confirmed", "status": "active"}
jet = {**drone, "id": "trk_g6_jet", "title": "Реактивний БпЛА",
       "explanationShort": "Реактивний БпЛА курсом на Луцьк."}
slow = {**drone, "id": "trk_g6_slow", "title": "БпЛА"}
sprawdz(neptun.is_jet(jet) and not neptun.is_jet(slow), "rozpoznanie „реактивн” w opisie")
sprawdz(neptun._speed_of(jet) == 450 and neptun._speed_of(slow) == 180,
        f"prędkość bez pomiaru: odrzutowy {neptun._speed_of(jet)}, zwykły {neptun._speed_of(slow)}")
# 1,5° długości na 51°N ≈ 105 km w 10 min ≈ 630 km/h — dron przyspieszył
fast = {**jet, "straznik_trail": [{"lat": 51.0, "lon": 26.5, "t": 0}, {"lat": 51.0, "lon": 25.0, "t": 600}]}
crawl = {**jet, "straznik_trail": [{"lat": 51.0, "lon": 26.0, "t": 0}, {"lat": 51.0, "lon": 25.95, "t": 600}]}
sprawdz(600 < neptun._speed_of(fast) < 660,
        f"zmierzona szybka prędkość ma pierwszeństwo ({round(neptun._speed_of(fast))} km/h)")
sprawdz(neptun._speed_of(crawl) == config.NEPTUN_JET_CRUISE_KMH,
        f"wolny pomiar nie schodzi poniżej przelotowej ({neptun._speed_of(crawl)})")
run([jet, slow])
sj, ss = last_signal("trk_g6_jet"), last_signal("trk_g6_slow")
sprawdz(sj and ss and sj["details"]["eta_border_min"] < ss["details"]["eta_border_min"],
        f"czas dolotu odrzutowego krótszy ({sj and sj['details']['eta_border_min']} < "
        f"{ss and ss['details']['eta_border_min']} min)")
sprawdz(sj and sj["details"]["jet"] is True, "sygnał oznaczony jako dron odrzutowy")

if bledy:
    print(f"\nBŁĘDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - kurs domniemany bez alarmu ETA, drony odrzutowe 450 km/h lub zmierzona")

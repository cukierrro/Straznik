# -*- coding: utf-8 -*-
"""A5: kurs z ruchu przy małych krokach i cień ETA z jednego zgłoszenia.

Uruchomienie:  py scripts/test_kurs_kotwica.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, stealth                                     # noqa: E402

_tmp = tempfile.TemporaryDirectory()
stealth.DB_PATH = Path(_tmp.name) / "obs.db"
stealth._conn = None
from app.collectors import neptun                                   # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. kurs z ruchu przy krokach po ~1,1 km")
neptun._last_pos.clear()
neptun._last_est.clear()
lat, lon = 50.40, 25.00          # obiekt leci na zachód, po 0,016° (~1,1 km) na odczyt
kursy = []
for i in range(4):
    t = {"id": "r1", "type": "shahed", "lat": lat, "lon": lon - 0.016 * i}
    neptun._evaluate(t)
    kursy.append(t.get("heading_estimated"))
sprawdz(kursy[0] is None and kursy[1] is None, f"pierwsze kroki < 2 km bez kursu ({kursy})")
sprawdz(kursy[2] is not None and 260 <= kursy[2] <= 280,
        f"po łącznym przesunięciu ≥ 2 km kurs ok. 270° ({kursy[2]})")
sprawdz(neptun._last_pos["r1"][1] == lon - 0.016 * 2, "kotwica przesunięta dopiero po ruchu ≥ 2 km")
sprawdz(kursy[3] is not None and 260 <= kursy[3] <= 280, f"kolejny mały krok zachowuje kurs ({kursy[3]})")

print("2. cień ETA dla rakiety z jednym zgłoszeniem")
a = {"dist_km": 40, "border_voiv": "lubelskie", "heading_known": False}
t = {"id": "k1", "type": "cruise", "lat": 51.0, "lon": 24.5}
neptun._eta_single_source_shadow(t, a, 1, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k2"}, a, 2, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k3", "type": "shahed"}, a, 1, "medium", 2.0, False, None)
neptun._eta_single_source_shadow({**t, "id": "k4"}, a, 1, "low", 2.0, False, None)
rows = stealth.query("eta_single_source_shadow", 60)
sprawdz([r["track_id"] for r in rows] == ["k1"] and rows[0]["would_be"] == "high",
        f"zapis tylko dla rakiety, 1 zgłoszenie, pewność ≥ średnia ({[r['track_id'] for r in rows]})")

print("3. A4/A10 w trybie cienia: odnowienie i zawrócenie")
neptun._signalled.clear(); neptun._away_streak.clear()
t0 = 1_800_000_000.0
tr = {"id": "s1", "type": "shahed", "lat": 50.9, "lon": 24.9}
a = {"border_voiv": "lubelskie", "dist_km": 40, "toward_pl": True}
neptun._remember_signal(tr, a, 1.9, now=t0)
neptun._renewal_shadow({**tr, "lat": 50.9, "lon": 24.7}, a, 1.9, False, now=t0 + 600)
neptun._renewal_shadow({**tr, "lat": 50.9, "lon": 24.9}, a, 1.9, False, now=t0 + 2000)
neptun._renewal_shadow({**tr, "lat": 50.9, "lon": 24.7}, a, 1.9, True, now=t0 + 2000)
neptun._renewal_shadow({**tr, "lat": 50.9, "lon": 24.7}, a, 1.9, False, now=t0 + 2000)
ren = stealth.query("neptun_renew_shadow", 10**8)
sprawdz(len(ren) == 1 and ren[0]["moved_km"] >= 2,
        f"odnowienie tylko po 30 min, z ruchem ≥ 2 km i pozycją nierejonową ({len(ren)})")
# 10.10.2026: zawrócenie liczy się z RUCHU (heading_movement + pomiar w _last_est),
# a kierunek względem Polski z tego ruchu — nie z kursu NEPTUN-a ani pl_assessment.
# Dotąd mechanizm patrzył na heading_estimated, który istnieje tylko bez kursu
# NEPTUN-a (20–30% obserwacji), więc od 11.09 nie zapisał ani jednego wpisu.
# s1 stoi na wschód od Polski (50,9 N 24,9 E); ruch na wschód = od Polski.
def ruch(kurs, kiedy, **reszta):
    neptun._last_est["s1"] = (kurs, kiedy)        # świeży pomiar ruchu
    return {**tr, "heading_movement": kurs, **reszta}

neptun._turnaway_shadow(ruch(90.0, t0 + 700), now=t0 + 700)
sprawdz(not stealth.query("neptun_turnaway_shadow", 10**8), "jeden odczyt od Polski to jeszcze nie zawrócenie")
neptun._turnaway_shadow({**tr, "heading_movement": 90.0}, now=t0 + 750)   # ten sam pomiar
sprawdz(neptun._away_streak["s1"] == 1, "powtórzony stary pomiar ruchu nie liczy się drugi raz")
# NEPTUN uparcie mówi „kursem na cel w Polsce” (270°), a obiekt odlatuje na wschód
neptun._turnaway_shadow(ruch(90.0, t0 + 800, heading=270.0, heading_source="presumptive",
                             pl_assessment={"toward_pl": True}), now=t0 + 800)
neptun._turnaway_shadow(ruch(85.0, t0 + 900), now=t0 + 900)
tw = stealth.query("neptun_turnaway_shadow", 10**8)
sprawdz(len(tw) == 1 and tw[0]["points_held"] == 1.9,
        f"dwa kolejne pomiary ruchu od Polski = jeden zapis, MIMO kursu NEPTUN-a „na PL” ({len(tw)})")
sprawdz(tw and tw[0].get("heading_neptun") == 270.0 and tw[0].get("heading_movement") == 90.0,
        "wpis mówi, że NEPTUN twierdził co innego niż ruch")
neptun._turnaway_shadow(ruch(270.0, t0 + 950, heading=90.0), now=t0 + 950)
sprawdz(neptun._away_streak["s1"] == 0,
        "ruch z powrotem na Polskę zeruje serię, choć NEPTUN podaje kurs od Polski")

stealth._conn and stealth._conn.close()
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - kotwica kursu i cień ETA")

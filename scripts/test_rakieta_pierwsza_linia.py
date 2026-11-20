# -*- coding: utf-8 -*-
"""Klucz czerwonego dla rakiet: „pierwsza linia” (decyzja usera 20.11.2026).

20.11.2026 05:54 małopolskie i świętokrzyskie dostały WYSOKI PRIORYTET od rakiet
manewrujących nad obwodem lwowskim, ~190 km od tych województw, z nieznanym kursem
i bez alertu RCB. 15 min dolotu przy 800 km/h to ~230 km, a klucz nie patrzył,
dokąd rakieta leci. Teraz poza Polską i bez kursu na województwo klucz dostają tylko
województwa pierwszej linii (odległość do woj. ≤ odległość do granicy PL + 60 km).

Uruchomienie:  py scripts/test_rakieta_pierwsza_linia.py
"""
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion, geo  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


REF = datetime(2026, 11, 20, 4, 55, tzinfo=timezone.utc)
LWOW = (49.836, 24.032)          # 3× rakieta manewrująca, 20.11 05:55 PL (trk_00378152)
DO_PL = geo.nearest_outline_point(*LWOW)[0]


def rakieta(voiv, km, eta, lat=LWOW[0], lon=LWOW[1], typ="missile", course="unknown", heading=None):
    return {"source": "neptun", "event_type": "neptun_threat", "voivodeship": voiv,
            "ts": (REF - timedelta(minutes=1)).isoformat(), "points": 0.8, "title": "test",
            "details": {"type": typ, "lat": lat, "lon": lon, "dist_km": km, "eta_border_min": eta,
                        "course": course, "heading": heading, "confidence": "high",
                        "source_count": 20, "uncertainty_km": 4}}


print(f"1. Konfiguracja (punkt pod Lwowem → granica PL: {DO_PL:.1f} km)")
ok(config.RED_GATE_RAKIETY_MARGINES_KM == 60.0, "margines 60 km (decyzja usera 20.11.2026)")
ok(set(config.RED_GATE_RAKIETY_TYPES) <= set(config.RED_GATE_TYPES), "typy rakietowe są podzbiorem typów klucza")
ok("uav" not in config.RED_GATE_RAKIETY_TYPES and "shahed" not in config.RED_GATE_RAKIETY_TYPES,
   "drony bez zmian (mają własną regułę B')")

print("\n2. Poranek 20.11: te same rakiety, różne województwa")
k = fusion.red_key([rakieta("lubelskie", 57.7, 1)], REF)
ok(k is not None and k["powod"] == "eta", "lubelskie (57,7 km, pierwsza linia) — czerwony jak dotąd")
ok(fusion.red_key([rakieta("podkarpackie", 57.8, 1)], REF) is not None, "podkarpackie (57,8 km) — jak dotąd")
ok(fusion.red_key([rakieta("małopolskie", 192.5, 11)], REF) is None,
   "małopolskie (192,5 km, ETA 11 min, kurs nieznany) — BEZ klucza")
ok(fusion.red_key([rakieta("świętokrzyskie", 187.8, 11)], REF) is None, "świętokrzyskie (187,8 km) — BEZ klucza")
ok(fusion.red_key([rakieta("małopolskie", DO_PL + 59, 7)], REF) is not None,
   "granica marginesu: do granicy PL + 59 km jeszcze daje klucz")
ok(fusion.red_key([rakieta("małopolskie", DO_PL + 61, 8)], REF) is None, "…a + 61 km już nie")

print("\n3. Wyjątki: nad Polską, kurs na województwo, inne typy, brak pozycji")
ok(fusion.red_key([rakieta("małopolskie", 90, 7, lat=50.04, lon=22.0)], REF) is not None,
   "rakieta nad Polską (okolice Rzeszowa) — pełne 15 min, także dla małopolskiego")
brg = geo.bearing_deg(LWOW[0], LWOW[1], 50.06, 19.94)          # na Kraków
ok(fusion.red_key([rakieta("małopolskie", 192.5, 11, course="known", heading=brg)], REF) is not None,
   f"znany kurs na małopolskie ({brg:.0f}°) — klucz z czasu dolotu jak dotąd")
ok(fusion.red_key([rakieta("małopolskie", 192.5, 11, course="known", heading=(brg + 120) % 360)], REF) is None,
   "znany kurs obok województwa — bez klucza")
ok(fusion.red_key([rakieta("małopolskie", 40, 13, typ="uav")], REF) is not None,
   "dron 40 km — reguła rakiet go nie dotyczy")
bez_poz = rakieta("małopolskie", 192.5, 11)
bez_poz["details"].pop("lat")
ok(fusion.red_key([bez_poz], REF) is not None, "sygnał bez pozycji — zachowanie jak dotąd")
ok(fusion.red_key([rakieta("małopolskie", 192.5, 11, typ="ballistic")], REF) is None,
   "balistyczna bez kursu daleko od granicy też tylko w pierwszej linii")

print("\n4. Powiat (region „P<TERYT>”): dist_km do powiatu, ta sama reguła")
ok(fusion.red_key([rakieta("P1863", 60.0, 1)], REF) is not None, "powiat przy granicy (Przemyśl ~60 km) — klucz")
ok(fusion.red_key([rakieta("P1261", 240.0, 14)], REF) is None, "Kraków 240 km — bez klucza")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - rakieta poza Polską otwiera czerwony tylko w pierwszej linii")

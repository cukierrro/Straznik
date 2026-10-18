# -*- coding: utf-8 -*-
"""Klucz czerwonego a punkt „na cel” (wariant V3, decyzja usera 18.10.2026).

18.10.2026 09:20: czerwony w lubelskim otworzył trk_00277892 „kursem na Kulików”
(obw. lwowski, cel po stronie ukraińskiej): kurs DOMNIEMANY 246°, pozycja rejonowa
±25 km, 48,9 km od granicy, „13 min od granicy”. Taki punkt wyznacza źródło z celu
i kursu — to nie obserwacja. Przeliczenie 2.08–18.10: V3 zdejmuje 4 z 19 czerwonych,
28.09 (dron 2,5 km od granicy, kurs domniemany, ale pozycja punktowa) zostaje.

Uruchomienie:  py scripts/test_czerwony_domniemany.py
"""
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


REF = datetime(2026, 10, 18, 7, 20, 19, tzinfo=timezone.utc)
# prawdziwe pola sygnału 8821 z 18.10.2026 07:17:43 UTC
KULIKOW = {"id": 8821, "ts": "2026-10-18T07:17:43+00:00", "source": "neptun",
           "event_type": "neptun_threat", "voivodeship": "lubelskie", "points": 0.38,
           "title": "Dron / BpSP kursem na granicę PL, około 50 km [pozycja rejonowa] [kurs domniemany — na cel]",
           "details": {"track_id": "trk_00277892", "type": "uav", "lat": 50.0884, "lon": 24.4626,
                       "heading": 246.352, "course": "presumptive", "heading_source": "presumptive",
                       "position_approximate": True, "position_reason": "source_approx",
                       "uncertainty_km": 25, "area_only": None, "dist_km": 48.9,
                       "speed_kmh": 180, "eta_border_min": 13, "source_count": 2,
                       "confidence": "medium"}}


def wariant(**zmiany):
    return {**KULIKOW, "details": {**KULIKOW["details"], **zmiany}}


print("1. punkt „na cel” z 18.10 nie daje klucza")
ok(fusion.red_key([KULIKOW], REF) is None, "kurs domniemany + pozycja rejonowa → bez klucza")

print("\n2. co nadal daje klucz")
ok((fusion.red_key([wariant(position_approximate=False, position_reason="source_point")], REF)
    or {}).get("powod") == "eta",
   "kurs domniemany przy pozycji PUNKTOWEJ (jak 28.09, dron 2,5 km od granicy)")
ok((fusion.red_key([wariant(course="known", heading_source="source")], REF) or {}).get("powod") == "eta",
   "kurs znany przy pozycji rejonowej ±25 km (reguła 15.10 blokuje dopiero >30 km area_only)")
ok((fusion.red_key([wariant(course="estimated", heading_source="measured")], REF) or {}).get("powod") == "eta",
   "kurs z ruchu przy pozycji rejonowej")

print("\n3. stary sygnał bez pola course, z samym heading_source")
stary = wariant(course=None)
ok(fusion.red_key([stary], REF) is None, "heading_source = presumptive też rozpoznany")

print("\n4. wezwanie RCB do schronienia działa niezależnie")
rcb3 = {"id": 9, "ts": "2026-10-18T07:19:00+00:00", "source": "rcb", "event_type": "rso_alert",
        "voivodeship": "lubelskie", "points": 4.5, "title": "Alert RCB",
        "details": {"rcb_level": 3}}
ok((fusion.red_key([KULIKOW, rcb3], REF) or {}).get("powod") == "rcb3", "rcb3 + punkt „na cel” → klucz z RCB")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - punkt „na cel” nie otwiera czerwonego (V3)")

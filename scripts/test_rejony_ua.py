# -*- coding: utf-8 -*-
"""Alarmy w całej Ukrainie do podświetlenia na mapie — bez punktów (15.09.2026).

1. Serwer przepisuje wszystkie aktywne rejony i obwody z ramki `alerts` do
   `neptun.alert_areas`, pomija poziomy „off”, a punkty dalej liczy tylko dla
   obwodów z config.UA_ALERT_OBLASTS.
2. Frontend dopasowuje ukraińską nazwę każdego z 136 rejonów do granic w
   frontend/assets/rejony-ua-v1.geojson (scripts/rejony_ua_check.js).

Uruchomienie: py scripts/test_rejony_ua.py
"""
import asyncio
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import fusion  # noqa: E402
from app.collectors import neptun  # noqa: E402

ingested = []


async def fake_ingest(**kw):
    ingested.append(kw)
    return True

fusion.ingest = fake_ingest
fusion.on_state_change = None

# Ramka z NEPTUN-a 15.09.2026 ~18:31 UTC (skrócona) + rejon z wyłączonym alarmem.
FRAME = {
    "raions": [
        {"key": "бахмутський", "name": "Бахмутський район", "oblast": "Донецька область",
         "since": "2026-09-15T16:42:56.141911Z", "level": "red",
         "reasons": ["Ракетна загроза (червоний рівень)"]},
        {"key": "сумський", "name": "Сумський район", "oblast": "Сумська область",
         "since": "2026-09-15T17:10:00Z", "level": "yellow", "reasons": []},
        {"key": "луцький", "name": "Луцький район", "oblast": "Волинська область",
         "since": "2026-09-15T17:00:00Z", "level": "none"},
    ],
    "oblasts": [
        {"key": "луганська", "name": "Луганська область", "oblast": "Луганська область",
         "since": "2022-04-04T16:45:00Z", "level": "red"},
    ],
}

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


asyncio.run(neptun._handle_alerts(FRAME, now=1_800_000_000))
areas = neptun.alert_areas
sprawdz(len(areas) == 3, f"3 aktywne wpisy, rejon z level=none pominięty ({len(areas)})")
bah = next((a for a in areas if a["k"] == "бахмутський"), {})
sprawdz(bah.get("w") == "raion" and bah.get("l") == "red" and bah.get("o") == "Донецька область"
        and bah.get("r", "").startswith("Ракетна"), f"rejon bachmucki z poziomem i powodem ({bah})")
lug = next((a for a in areas if a["w"] == "oblast"), {})
sprawdz(lug.get("n") == "Луганська область", f"obwód okupowany jako całość ({lug})")
sprawdz("alert_areas" in neptun.public_state(), "alert_areas w stanie dla aplikacji")
sprawdz(not any(s.get("event_type") == "ua_alert_border" for s in ingested),
        "alarmy daleko od Polski nie dają punktów")
sprawdz("alert_areas: alertAreas" in (ROOT / "frontend" / "engine.js").read_text(encoding="utf-8"),
        "tryb awaryjny (engine.js) podaje alert_areas")

r = subprocess.run(["node", str(ROOT / "scripts" / "rejony_ua_check.js")],
                   capture_output=True, text=True, encoding="utf-8")
print(r.stdout.strip())
sprawdz(r.returncode == 0, "wszystkie 136 rejonów NEPTUN-a mają granice na mapie")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - alarmy w całej Ukrainie tylko do podświetlenia, bez punktów")

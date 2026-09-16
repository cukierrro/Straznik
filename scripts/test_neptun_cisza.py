# -*- coding: utf-8 -*-
"""Cisza na gnieździe NEPTUN-a: brak zdarzeń czy zawieszone połączenie?

15.09.2026 21:29–22:10 UTC NEPTUN nie wysłał żadnej ramki (także heartbeatu), choć
połączenie było otwarte. Monitoring uznał źródło za martwe, UptimeRobot i Healthchecks
słały na zmianę „down” i „up”. Teraz po 120 s ciszy pytamy REST:
  - REST zna nowe id albo świeższe updatedAt → gniazdo wisi, łączymy od nowa,
  - REST ma to samo → źródło żyje (last_alive) i /api/health/critical zostaje 200.

Uruchomienie: py scripts/test_neptun_cisza.py
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, monitoring  # noqa: E402
from app.collectors import neptun  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


known = {"trk_1": {"id": "trk_1", "updatedAt": "2026-09-15T21:29:10Z"}}
print("1. porównanie REST z tym, co dało gniazdo")
sprawdz(not neptun.ws_stale([{"id": "trk_1", "updatedAt": "2026-09-15T21:29:10Z"}], known),
        "te same dane — cisza, nie zawieszenie")
sprawdz(not neptun.ws_stale([{"id": "trk_1", "updatedAt": "2026-09-15T21:29:25Z"}], known),
        "różnica 15 s mieści się w tolerancji")
sprawdz(neptun.ws_stale([{"id": "trk_1", "updatedAt": "2026-09-15T21:40:00Z"}], known),
        "świeższy updatedAt w REST — gniazdo nieaktualne")
sprawdz(neptun.ws_stale([{"id": "trk_2", "updatedAt": "2026-09-15T21:40:00Z"}], known),
        "nowe zagrożenie tylko w REST — gniazdo nieaktualne")
sprawdz(not neptun.ws_stale([], {}), "pusto tu i tu — cisza")

print("2. monitoring liczy potwierdzoną ciszę jako działające źródło")
now = time.time()
neptun.status.update(last_msg=now - 40 * 60, last_alive=now - 60)
chk = monitoring.critical_check(now)["checks"]["neptun"]
sprawdz(chk["ok"], f"40 min bez ramki, ale REST potwierdził 60 s temu ({chk})")
neptun.status.update(last_msg=now - 40 * 60, last_alive=now - 10 * 60)
chk = monitoring.critical_check(now)["checks"]["neptun"]
sprawdz(not chk["ok"], "bez ramki i bez potwierdzenia przez 10 min — awaria")
sprawdz(config.NEPTUN_SILENCE_PROBE_S < monitoring.NEPTUN_SILENCE_S,
        "sonda REST rusza przed progiem awarii monitoringu")

if bledy:
    print(f"\n{len(bledy)} błędów")
    sys.exit(1)
print("\nOK - cisza NEPTUN-a sprawdzana przez REST, bez fałszywych awarii")

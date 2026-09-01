#!/usr/bin/env python3
"""Regresje po 3-dniowym pomiarze: PAŻP, ETA i reconnect Neptuna."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import config, geo
from app.collectors import neptun, pansa


def pansa_info(zone_type, designator="X", lower="GND", upper="F315"):
    return {"type": zone_type, "designator": designator,
            "lower": lower, "upper": upper}


now = 1_000_000.0
assert not pansa._should_score(pansa_info("TRA"), {}, now)
assert not pansa._should_score(pansa_info("TSA"), {}, now)
assert not pansa._should_score(pansa_info("MRT"), {}, now)
assert not pansa._should_score(pansa_info("ATZ"), {}, now)
assert not pansa._should_score(pansa_info("ADHOC", lower="GND", upper="A055"), {}, now)
assert pansa._should_score(pansa_info("ADHOC"), {}, now)
assert pansa._should_score(pansa_info("R"), {}, now)
assert pansa._should_score(pansa_info("NPZ"), {}, now)
assert pansa._should_score(pansa_info("D"), {}, now)
assert not pansa._should_score(pansa_info("D", "EPD29"), {"EPD29": now - 6*86400}, now)
assert pansa._should_score(pansa_info("D", "EPD29"), {"EPD29": now - 8*86400}, now)

# 100 km przy 800 km/h = 7,5 min surowo, 5 min konserwatywnie → czerwony.
assert geo.eta_minutes(100, 800, config.NEPTUN_ETA_BUFFER_MIN) == 5
a_known = {"heading_known": True}
assert neptun._eta_alarm_level(a_known, 2, "high", 5) == "high"
assert neptun._eta_alarm_level(a_known, 2, "medium", 10) == "elevated"
assert neptun._eta_alarm_level(a_known, 2, "high", 5.1) == "elevated"
assert neptun._eta_alarm_level(a_known, 2, "high", 11) is None
assert neptun._eta_alarm_level({"heading_known": False}, 5, "high", 2) is None
assert neptun._eta_alarm_level(a_known, 1, "high", 2) is None
assert neptun._eta_alarm_level(a_known, 5, "low", 2) is None

# Każdy typ, który może wnieść punkty, musi mieć polską nazwę. Chroni to panel
# przed powrotem źródłowych etykiet typu „БпЛА” przy nowych klasach obiektów.
for threat_type in config.NEPTUN_TYPE_WEIGHTS:
    assert threat_type in neptun.THREAT_LABELS_PL, threat_type
    assert not any("а" <= ch.lower() <= "я" for ch in neptun.threat_label_pl(threat_type))
assert neptun.threat_label_pl("nowy-nieznany-typ") == "Obiekt powietrzny"


class Full(Exception):
    code = 1013


wait, nxt = neptun._reconnect_wait(Full("server full"), 1)
assert 15 <= wait <= 30 and nxt == 30
assert neptun._reconnect_wait(Exception("offline"), 4) == (4, 8)

print("OK — filtry PAŻP, bufor/alarmy ETA i backoff Neptuna")

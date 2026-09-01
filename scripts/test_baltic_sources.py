"""Regresje: odwołanie alertu bałtyckiego i geograficzne ADS-B."""
from datetime import datetime, timezone

from app import fusion
from app.collectors import adsb, official_alerts, rss_media


def signal(event, ts, points, incident="lv:a661158"):
    return {
        "source": "media", "event_type": event, "voivodeship": "podlaskie",
        "points": points, "title": event, "ts": ts,
        "details": {"incident_key": incident},
    }


def main():
    start_url = "https://eng.lsm.lv/article/society/defense/01.09.2026-alert.a661158/"
    end_url = "https://eng.lsm.lv/article/society/defense/01.09.2026-airspace-alert-over.a661158/"
    assert rss_media._baltic_incident_key(start_url, "start", "LV") == \
           rss_media._baltic_incident_key(end_url, "end", "LV")
    assert rss_media._is_baltic_clear("Airspace alert over in Latvia")

    signals = [
        signal("baltic_context", "2026-09-01T01:10:00+00:00", 1.0),
        signal("baltic_clear", "2026-09-01T01:40:00+00:00", 0.0),
    ]
    state = fusion.accumulate(signals, datetime(2026, 9, 1, 1, 45,
                                                tzinfo=timezone.utc))
    assert state["podlaskie"]["score"] == 0
    assert state["podlaskie"]["signals"][0]["cleared"] is True

    assert adsb._looks_military({"dbFlags": 1})
    assert adsb._looks_military({"flight": "KAPLAN01"})
    assert adsb._looks_military({"t": "F16"})
    assert not adsb._looks_military({"flight": "RYR123", "t": "B738",
                                     "ownOp": "Ryanair"})

    fixture = '<a href="/lv/zinas/apdraudejums-latvijas-gaisa-telpa-nosledzies-5">' \
              'Apdraudējums Latvijas gaisa telpā noslēdzies</a>'
    entries = official_alerts._extract(fixture)
    assert len(entries) == 1 and official_alerts._phase(entries[0][1]) == "clear"
    print("OK: Baltic clear + official LV + geographic ADS-B")


if __name__ == "__main__":
    main()

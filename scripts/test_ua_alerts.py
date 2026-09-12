#!/usr/bin/env python3
"""Alarmy w obwodach UA: waga maleje z odległością, a tytuł nie kłamie.

Do 1.7.25 każdy obwód z listy dawał 1,0 pkt i tytuł „graniczy z woj. lubelskie",
także obwód rówieński (70 km) i żytomierski (220 km), które z Polską wspólnej
granicy nie mają. Ten test pilnuje jednego i drugiego.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import config
from app.collectors.neptun import _alert_title

# Polska graniczy z Ukrainą wyłącznie tymi obwodami — reszta musi mieć km > 0.
BORDER = {"Львівська", "Волинська", "Закарпатська"}


def main() -> None:
    for oblast, voivs in config.UA_ALERT_OBLASTS.items():
        assert voivs, f"{oblast}: pusta lista województw"
        for voiv, km in voivs.items():
            assert voiv in ("lubelskie", "podkarpackie"), f"{oblast}: obce woj. {voiv}"
            assert km >= 0, f"{oblast}/{voiv}: ujemna odległość"
            if km == 0:
                assert oblast in BORDER, f"{oblast} nie graniczy z Polską, a ma 0 km"
        if oblast not in BORDER:
            assert min(voivs.values()) > 0, f"{oblast}: fałszywe sąsiedztwo"
        assert oblast in config.UA_OBLAST_PL, f"{oblast}: brak nazwy po polsku"

    # waga maleje monotonicznie z odległością i nigdy nie rośnie powyżej 1,0
    w = config.ua_alert_weight
    assert w(0) == 1.0 and w(0) >= w(70) >= w(160) >= w(280) > 0
    assert w(500) == 0.0, "obwód 500 km od Polski nie może wnosić punktów"
    prev = 1.01
    for km in range(0, 340, 10):
        assert w(km) <= prev, f"waga rośnie przy {km} km"
        prev = w(km)

    # obwód przy granicy musi ważyć wyraźnie więcej niż drugi i trzeci pas
    lublin = config.UA_ALERT_OBLASTS
    assert w(lublin["Волинська"]["lubelskie"]) == 1.0
    assert w(lublin["Рівненська"]["lubelskie"]) == 0.6
    assert w(lublin["Житомирська"]["lubelskie"]) == 0.35
    # ten sam obwód może ważyć różnie dla dwóch województw (reakcja krzyżowa)
    assert w(lublin["Закарпатська"]["podkarpackie"]) > w(lublin["Закарпатська"]["lubelskie"])
    assert w(lublin["Волинська"]["lubelskie"]) > w(lublin["Волинська"]["podkarpackie"])

    # nawet wszystkie obwody naraz nie zastąpią obiektu na mapie
    for voiv in ("lubelskie", "podkarpackie"):
        total = sum(config.POINTS["ua_alert_border"] * w(d[voiv])
                    for d in config.UA_ALERT_OBLASTS.values() if voiv in d)
        assert total > config.SOURCE_CAPS["ua_alert"], "limit klasy przestał cokolwiek robić"
    assert config.SOURCE_CAPS["ua_alert"] < config.THRESHOLD_ELEVATED, \
        "sama klasa alarmów UA nie może osiągnąć progu żółtego"

    # tytuł: „graniczy" wyłącznie przy wspólnej granicy
    assert _alert_title("Волинська", "lubelskie", 0) == \
        "Alarm powietrzny w obwodzie wołyńskim (woj. lubelskie — przy granicy)"
    assert _alert_title("Рівненська", "lubelskie", 70) == \
        "Alarm powietrzny w obwodzie rówieńskim (woj. lubelskie — 70 km)"
    assert "granic" not in _alert_title("Житомирська", "lubelskie", 220)

    print(f"OK: {len(config.UA_ALERT_OBLASTS)} obwodów UA, wagi malejące z odległością, "
          "limit klasy nadal poniżej progu żółtego")


if __name__ == "__main__":
    main()

"""Pozycja z MLAT nie może podawać się w aplikacji za ADS-B.

25.09.2026, zgłoszenie użytkownika („czy ten samolot nad Białorusią to artefakt?”):
algierski C-130H 7T-WHL (hex 0a401c) miał w api.adsb.lol rekord `type: "mlat"`,
`mlat: ["lat","lon","nic","rc"]`, `nic: 0`, `rc: 0` — czyli pozycję policzoną przez
odbiorniki naziemne, bez zadeklarowanej dokładności. W zapisanych migawkach dostał
dwie kolejne pozycje odchylone o 82 i 71 km od faktycznej trasy (skoki 87 i 67 km
w 60 s), obie w woj. podlaskim. Punktacji to nie ruszyło (`adsb_spike` = 0 pkt),
ale karta maszyny pisała „sygnał: ADS-B”, bo `_classify()` w ogóle nie przekazywało
rodzaju pozycji — w trybie bez serwera `frontend/engine.js` liczył to poprawnie,
w trybie serwerowym pole nie istniało i front spadał na literał „ADS-B”.

Czego pilnuje ten test:
  * `_position_source()` rozpoznaje MLAT, TIS-B i ADS-B,
  * `_classify()` NIESIE to pole dalej (stamtąd idzie i do /api/state, i do migawek),
  * obie implementacje — serwerowa i ta bez serwera — używają tych samych nazw,
  * karta maszyny ostrzega przy MLAT i nie zmyśla „ADS-B”, gdy pola brakuje
    (stare migawki sprzed wdrożenia nie mają go i nie da się go odtworzyć).

Uruchomienie: py -3 scripts/test_zrodlo_pozycji.py
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.collectors.adsb import _classify, _position_source

# Rekord jak z api.adsb.lol 25.09.2026, 17:26 — ta sama maszyna i ta sama pozycja
# nad Białorusią, o którą poszło zgłoszenie.
MLAT = {"hex": "0a401c", "flight": "KJD202  ", "r": "7T-WHL", "t": "C130",
        "type": "mlat", "mlat": ["lat", "lon", "nic", "rc"], "tisb": [],
        "lat": 53.1316, "lon": 26.1699, "alt_baro": 22000, "gs": 284.0,
        "track": 235.02, "nic": 0, "rc": 0, "dbFlags": 1}
TISB = {**MLAT, "hex": "0a401d", "mlat": [], "tisb": ["lat", "lon"]}
ADSB = {**MLAT, "hex": "0a401e", "type": "adsb_icao", "mlat": [], "tisb": [],
        "nic": 8, "rc": 186}
# Starsze źródła potrafią nie podać tych list w ogóle — wtedy nie ma podstaw,
# żeby podejrzewać MLAT, i zostaje ADS-B.
BEZ_POL = {"hex": "0a401f", "lat": 53.1316, "lon": 26.1699, "alt_baro": 22000}

assert _position_source(MLAT) == "MLAT"
assert _position_source(TISB) == "TIS-B"
assert _position_source(ADSB) == "ADS-B"
assert _position_source(BEZ_POL) == "ADS-B"

for rekord, oczekiwane in ((MLAT, "MLAT"), (TISB, "TIS-B"), (ADSB, "ADS-B")):
    sklasyfikowany = _classify(rekord)
    assert sklasyfikowany is not None, f"{rekord['hex']}: pozycja nad Białorusią ma zostać w obszarze obserwacji"
    assert sklasyfikowany.get("source") == oczekiwane, (
        f"{rekord['hex']}: _classify oddało source={sklasyfikowany.get('source')!r}, "
        f"a rekord źródłowy mówi {oczekiwane}")

# Pole musi przetrwać drogę do klienta: /api/state i migawki historii biorą
# `adsb.current_aircraft` w całości, bez białej listy pól.
MAIN = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
assert '"aircraft": adsb.current_aircraft' in MAIN, "/api/state nie podaje już listy maszyn wprost"
assert re.search(r'aircraft = adsb\.current_aircraft', MAIN), "migawka nie bierze już maszyn wprost"
assert not re.search(r'for\s+\w+\s+in\s+aircraft', MAIN), (
    "ktoś przefiltrował maszyny przed zapisem migawki — sprawdź, czy `source` przechodzi")

# Tryb bez serwera liczy to samo w JS — nazwy muszą się zgadzać, inaczej karta
# pokaże co innego po przełączeniu na tryb awaryjny.
ENGINE = (ROOT / "frontend/engine.js").read_text(encoding="utf-8")
wiersz = next((w for w in ENGINE.splitlines() if "source:" in w and "MLAT" in w), None)
assert wiersz, "nie znalazłem wyliczenia source w frontend/engine.js"
for etykieta in ('"MLAT"', '"TIS-B"', '"ADS-B"'):
    assert etykieta in wiersz, f"engine.js nie używa już etykiety {etykieta}: {wiersz.strip()}"
assert "a.mlat" in wiersz and "a.tisb" in wiersz, f"engine.js patrzy na inne pola: {wiersz.strip()}"

# Karta maszyny: ostrzeżenie przy MLAT i brak zmyślonego „ADS-B” bez danych.
APP = (ROOT / "frontend/app.js").read_text(encoding="utf-8")
assert 'p.source === "MLAT"' in APP, "karta maszyny nie ostrzega już przy pozycji z MLAT"
ostrzezenie = next((w for w in APP.splitlines() if 'p.source === "MLAT"' in w), "")
for slowo in ("MLAT", "Білорус", "Belarus", "Białorusią"):
    assert slowo in ostrzezenie, f"ostrzeżenie o MLAT zgubiło wariant językowy albo treść: brak {slowo!r}"
assert 'p.source || "ADS-B"' not in APP, (
    "brak pola `source` (stare migawki) nie może być pokazywany jako pewne ADS-B")

print("OK: MLAT/TIS-B/ADS-B rozpoznane, pole niesione do klienta, karta ostrzega.")

"""Niemożliwy skok pozycji nie może trafić ani na mapę, ani do trasy.

25.09.2026, zgłoszenie użytkownika: algierski C-130H 7T-WHL (hex 0a401c, pozycja
z MLAT-u, nic=0) dostał dwie kolejne pozycje odchylone o 82 i 71 km od faktycznej
trasy. Między migawkami dawało to skoki 87 i 67 km w 60 sekund, czyli 5232
i 4016 km/h. Ikona przeskakiwała z Polesia w woj. podlaskie i wracała, a oba
odcinki trafiały do „Przebytej trasy” jako prawdziwy przelot.

Poprawka trzyma ostatnią przyjętą pozycję, dopóki nowa jest niemożliwa — i robi to
PRZED klasyfikacją, więc ikona, województwo, trasa i migawka historii mówią to samo.
Kotwicy nie odświeżamy w trakcie trzymania, więc dopuszczalny dystans rośnie z czasem
i realny przelot po dłuższej przerwie przechodzi bez pytania; twardy bezpiecznik
`JUMP_HOLD_MAX_S` chroni przed zamarznięciem maszyny, gdy to kotwica jest nieaktualna.

Czego pilnuje ten test (na prawdziwych współrzędnych z tamtego lotu):
  * normalny przelot ~9 km/min przechodzi nietknięty,
  * oba skoki z incydentu są trzymane, ze znacznikiem `held` i BEZ podlaskiego,
  * powrót na trasę po trzymaniu jest przyjmowany,
  * po JUMP_HOLD_MAX_S maszyna nie zostaje zamrożona,
  * kotwice się nie kumulują,
  * tryb bez serwera (frontend/engine.js) ma tę samą regułę i te same progi.

Uruchomienie: py -3 scripts/test_skok_pozycji.py
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app import geo
from app.collectors.adsb import (_classify, _hold_impossible_jump, _last_pos,
                                 JUMP_MAX_KMH, JUMP_HOLD_MAX_S, TRAIL_MAX_AGE_S)

HEX = "0a401c"
# Migawki z 25.09.2026 (czas lokalny) — 17:40 i 17:41 to pozycje fałszywe.
PRZELOT = {
    "17:38": (52.5520, 24.8477),
    "17:39": (52.5032, 24.7361),
    "17:40": (52.7290, 23.4991),   # 87 km w 60 s = 5232 km/h, wpada w podlaskie
    "17:41": (52.6558, 23.5543),   # nadal obok trasy
    "17:42": (52.3593, 24.4149),   # powrót na trasę, zgodny z kursem 233°
}


def rekord(lat, lon):
    return {"hex": HEX, "flight": "KJD202  ", "r": "7T-WHL", "t": "C130",
            "mlat": ["lat", "lon", "nic", "rc"], "tisb": [], "lat": lat, "lon": lon,
            "alt_baro": 22000, "gs": 294.0, "track": 233.0, "dbFlags": 1}


def przepusc(punkty, start=1_000_000.0, krok=60.0):
    """Tak jak _tick: strażnik skoku, potem klasyfikacja. Zwraca karty maszyny."""
    _last_pos.clear()
    wynik = []
    for i, (lat, lon) in enumerate(punkty):
        teraz = start + i * krok
        wynik.append(_classify(_hold_impossible_jump(rekord(lat, lon), teraz)))
    return wynik


# ── 1. Spokojny przelot nie jest ruszany ────────────────────────────────────
spokojny = przepusc([PRZELOT["17:38"], PRZELOT["17:39"], PRZELOT["17:42"]], krok=60.0)
assert all(k is not None for k in spokojny)
assert not any(k.get("held") for k in spokojny[:2]), "normalne 9 km/min nie jest skokiem"
assert (spokojny[1]["lat"], spokojny[1]["lon"]) == PRZELOT["17:39"]

# ── 2. Incydent: oba fałszywe meldunki trzymane, powrót przyjęty ────────────
karty = przepusc(list(PRZELOT.values()))
etykiety = list(PRZELOT.keys())
stan = dict(zip(etykiety, karty))

for t in ("17:38", "17:39"):
    assert not stan[t].get("held"), f"{t}: prawdziwa pozycja nie może być trzymana"

for t in ("17:40", "17:41"):
    k = stan[t]
    assert k is not None, f"{t}: maszyna nie może zniknąć z mapy"
    assert k.get("held") is True, f"{t}: niemożliwy skok miał zostać odrzucony"
    assert (k["lat"], k["lon"]) == PRZELOT["17:39"], (
        f"{t}: trzymamy ostatnią przyjętą pozycję, a dostałem {k['lat']}, {k['lon']}")
    assert k["voivodeship"] != "podlaskie", (
        f"{t}: fałszywa pozycja wciągnęła maszynę do podlaskiego — województwo liczy się "
        "z pozycji PO strażniku, inaczej trasa rozjedzie się z ikoną")

powrot = stan["17:42"]
assert not powrot.get("held"), "powrót na trasę jest wiarygodny i ma być przyjęty"
assert (powrot["lat"], powrot["lon"]) == PRZELOT["17:42"]

# ── 3. Strażnik jest naprawdę wpięty, i to PRZED klasyfikacją ───────────────
zrodlo = (ROOT / "backend/app/collectors/adsb.py").read_text(encoding="utf-8")
assert re.search(r"_classify\(_hold_impossible_jump\(ac, now\)\)", zrodlo), (
    "_tick musi puszczać rekord przez strażnika PRZED _classify — inaczej województwo, "
    "obszar obserwacji i trasa policzą się z fałszywej pozycji")

# ── 4. Próg jest o prędkości, nie o kilometrach ─────────────────────────────
_last_pos.clear()
_hold_impossible_jump(rekord(*PRZELOT["17:39"]), 1_000_000.0)
spokojnie = _hold_impossible_jump(rekord(*PRZELOT["17:40"]), 1_000_000.0 + 240)
assert not spokojnie.get("_straznik_position_held"), (
    "87 km w 4 minuty to 1300 km/h — to mieści się w locie, nie w błędzie MLAT")

# ── 5. Bezpiecznik: maszyna nie zamarza, choćby skok wciąż był niemożliwy ────
# Odległość dobrana tak, by przekraczała próg NAWET po JUMP_HOLD_MAX_S — inaczej
# test sprawdzałby samo łagodnienie progu w czasie, a nie twardy bezpiecznik.
DALEKO = (52.5032, 39.0)
km_daleko = geo.haversine_km(*PRZELOT["17:39"], *DALEKO)
assert km_daleko > JUMP_MAX_KMH * JUMP_HOLD_MAX_S / 3600, (
    f"{km_daleko:.0f} km to za blisko, żeby sprawdzić bezpiecznik")
for odstep, oczekiwane_trzymanie in ((60, True), (JUMP_HOLD_MAX_S - 1, True),
                                     (JUMP_HOLD_MAX_S + 1, False)):
    _last_pos.clear()
    _hold_impossible_jump(rekord(*PRZELOT["17:39"]), 1_000_000.0)
    wynik = _hold_impossible_jump(rekord(*DALEKO), 1_000_000.0 + odstep)
    trzymane = bool(wynik.get("_straznik_position_held"))
    assert trzymane is oczekiwane_trzymanie, (
        f"skok {km_daleko:.0f} km po {odstep} s: trzymane={trzymane}, "
        f"a ma być {oczekiwane_trzymanie} (po {JUMP_HOLD_MAX_S} s podejrzana jest już "
        "nasza kotwica, nie meldunek)")

# ── 6. Kotwice nie zostają na zawsze ────────────────────────────────────────
assert TRAIL_MAX_AGE_S >= JUMP_HOLD_MAX_S, "kotwica musi żyć dłużej niż trzymanie"
assert re.search(r"_last_pos\.pop\(hexid, None\)", zrodlo), (
    "brak sprzątania kotwic w _tick — słownik rósłby bez końca")

# ── 7. Brak kotwicy i brak hexa nie wywracają strażnika ─────────────────────
_last_pos.clear()
pierwszy = _hold_impossible_jump(rekord(*PRZELOT["17:40"]), 1_000_000.0)
assert not pierwszy.get("_straznik_position_held"), "pierwsza pozycja nie ma się do czego odnieść"
bez_hexa = _hold_impossible_jump({"lat": 52.0, "lon": 23.0}, 1_000_000.0)
assert "_straznik_position_held" not in bez_hexa
bez_pozycji = _hold_impossible_jump({"hex": HEX, "lat": None, "lon": None}, 1_000_000.0)
assert "_straznik_position_held" not in bez_pozycji

# ── 8. Tryb bez serwera liczy to samo ───────────────────────────────────────
ENGINE = (ROOT / "frontend/engine.js").read_text(encoding="utf-8")
assert "function adsbHoldJump(" in ENGINE, "tryb bez serwera nie ma strażnika skoków"
progi = re.search(r"ADSB_JUMP_MAX_KMH = (\d+), ADSB_JUMP_HOLD_MAX_S = (\d+)", ENGINE)
assert progi, "nie znalazłem progów w engine.js"
assert int(progi.group(1)) == JUMP_MAX_KMH, (
    f"engine.js ma próg {progi.group(1)} km/h, backend {JUMP_MAX_KMH} — tryby pokażą co innego")
assert int(progi.group(2)) == JUMP_HOLD_MAX_S, (
    f"engine.js trzyma {progi.group(2)} s, backend {JUMP_HOLD_MAX_S} s")
assert "adsbHoldJump(surowy, teraz)" in ENGINE, "strażnik nie jest wpięty w pętlę maszyn"
assert re.search(r"const v = voivForPoint\(a\.lat, a\.lon\)", ENGINE), (
    "województwo w engine.js musi się liczyć z pozycji PO strażniku")

# ── 9. Karta mówi, że pozycja jest wstrzymana ───────────────────────────────
APP = (ROOT / "frontend/app.js").read_text(encoding="utf-8")
assert "p.held ?" in APP, "karta maszyny nie uprzedza, że pozycja jest wstrzymana"
wiersz = next((w for w in APP.splitlines() if "p.held ?" in w), "")
for slowo in ("wstrzymana", "Position held", "утримано"):
    assert slowo in wiersz, f"ostrzeżenie o wstrzymanej pozycji nie ma wariantu: {slowo!r}"

print("OK: niemożliwe skoki trzymane, powrót przyjęty, bezpiecznik działa, tryby zgodne.")

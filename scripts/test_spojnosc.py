#!/usr/bin/env python3
"""Spójność dwóch silników fuzji: backend (Python, config.py) i aplikacja (engine.js).

Ta sama logika punktacji żyje w DWÓCH miejscach: na serwerze (domyślnie liczy
fuzję i wysyła push) oraz we wbudowanym silniku aplikacji (fallback, gdy serwer
jest niedostępny). Muszą liczyć identycznie — inaczej to samo zdarzenie dałoby
inny wynik na serwerze i w apce po przełączeniu na tryb wbudowany. KAŻDA różnica
progów, okna, wygaszania, kaskady, limitów źródeł czy punktów je rozjedzie.

Wcześniej test obejmował też natywną usługę pierwszoplanową w tle (Java:
Fusion.java/Sources.java) — WYCOFANĄ w 1.5.0 (alarmy przy zamkniętej aplikacji
dostarcza teraz push FCM, bez własnej fuzji po stronie natywnej).

Uruchomienie:  python scripts/test_spojnosc.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = (ROOT / "frontend/engine.js").read_text(encoding="utf-8")
CONFIG = (ROOT / "backend/app/config.py").read_text(encoding="utf-8")

bledy: list[str] = []


def sprawdz(nazwa: str, a, b) -> None:
    if a != b:
        bledy.append(f"{nazwa}: engine.js={a!r} ≠ config.py={b!r}")


def num(wzorzec: str, tekst: str, nazwa: str) -> float | None:
    m = re.search(wzorzec, tekst)
    if not m:
        bledy.append(f"nie znaleziono {nazwa} (wzorzec {wzorzec!r})")
        return None
    return float(m.group(1))


def slownik(wzorzec: str, tekst: str, nazwa: str) -> dict:
    m = re.search(wzorzec, tekst, re.S)
    if not m:
        bledy.append(f"nie znaleziono {nazwa}")
        return {}
    # klucz (z cudzysłowem lub bez) : liczba — pomija komentarze po wartości
    return {k: float(v) for k, v in re.findall(r'"?(\w+)"?\s*:\s*([\d.]+)', m.group(1))}


def lista(wzorzec: str, tekst: str, nazwa: str) -> list:
    m = re.search(wzorzec, tekst, re.S)
    if not m:
        bledy.append(f"nie znaleziono {nazwa}")
        return []
    return re.findall(r'"([^"]+)"', m.group(1))


# ── progi, okno, wygaszanie, kaskada ─────────────────────────────────────────
sprawdz("WINDOW", num(r"\bWINDOW_MIN\s*=\s*(\d+)", ENGINE, "WINDOW js"),
        num(r"FUSION_WINDOW_MIN\s*=\s*(\d+)", CONFIG, "WINDOW py"))
sprawdz("FULL_MIN", num(r"\bFULL_MIN\s*=\s*(\d+)", ENGINE, "FULL js"),
        num(r"FUSION_FULL_MIN\s*=\s*(\d+)", CONFIG, "FULL py"))
sprawdz("TH_ELEVATED", num(r"TH_ELEVATED\s*=\s*([\d.]+)", ENGINE, "elev js"),
        num(r"THRESHOLD_ELEVATED\s*=\s*([\d.]+)", CONFIG, "elev py"))
sprawdz("TH_HIGH", num(r"TH_HIGH\s*=\s*([\d.]+)", ENGINE, "high js"),
        num(r"THRESHOLD_HIGH\s*=\s*([\d.]+)", CONFIG, "high py"))
sprawdz("SPILLOVER_FACTOR", num(r"SPILLOVER_FACTOR\s*=\s*([\d.]+)", ENGINE, "spill js"),
        num(r"SPILLOVER_FACTOR\s*=\s*([\d.]+)", CONFIG, "spill py"))
sprawdz("SPILLOVER_MIN", num(r"SPILLOVER_MIN\s*=\s*([\d.]+)", ENGINE, "spillmin js"),
        num(r"SPILLOVER_MIN_SOURCE_SCORE\s*=\s*([\d.]+)", CONFIG, "spillmin py"))
sprawdz("SPILLOVER_MIN_CONTRIB",
        num(r"SPILLOVER_MIN_CONTRIB\s*=\s*([\d.]+)", ENGINE, "spillc js"),
        num(r"SPILLOVER_MIN_CONTRIBUTION\s*=\s*([\d.]+)", CONFIG, "spillc py"))
sprawdz("SPILLOVER_MAX_DEPTH", num(r"SPILLOVER_MAX_DEPTH\s*=\s*(\d+)", ENGINE, "depth js"),
        num(r"SPILLOVER_MAX_DEPTH\s*=\s*(\d+)", CONFIG, "depth py"))

# Źródła wyłącznie backendowe (brak kolektora w standalone/engine.js) — nie
# porównujemy ich w synchronie backend↔engine.
_BACKEND_ONLY_CAPS = {"neighbours"}
_BACKEND_ONLY_POINTS = {"neighbour_zone"}

# ── limity wkładu jednej klasy źródła (kluczowe: bez tego historia i fuzja
#    sumowałyby surowe punkty, np. 4 rutynowe strefy PAŻP = fałszywe 4.0) ──────
sprawdz("SOURCE_CAPS", slownik(r"SOURCE_CAPS = \{(.*?)\}", ENGINE, "SOURCE_CAPS js"),
        {k: v for k, v in slownik(r"SOURCE_CAPS = \{(.*?)\}", CONFIG, "SOURCE_CAPS py").items()
         if k not in _BACKEND_ONLY_CAPS})

# ── punkty za sygnał ─────────────────────────────────────────────────────────
sprawdz("POINTS", slownik(r"const POINTS = \{(.*?)\}", ENGINE, "POINTS js"),
        {k: v for k, v in slownik(r"POINTS = \{(.*?)\}", CONFIG, "POINTS py").items()
         if k not in _BACKEND_ONLY_POINTS})

# ── kolejność województw (kaskada i indeksowanie zależą od kolejności) ────────
sprawdz("VOIVODESHIPS", lista(r"const VOIVODESHIPS = \[(.*?)\];", ENGINE, "voivs js"),
        lista(r"VOIVODESHIPS\s*=\s*\[(.*?)\]", CONFIG, "voivs py"))

# ── ściana wschodnia jako domyślny cel ───────────────────────────────────────
sprawdz("PRIORITY", sorted(lista(r"const PRIORITY_VOIVS = \[(.*?)\]", ENGINE, "prio js")),
        sorted(lista(r"PRIORITY_VOIVODESHIPS\s*=\s*\[(.*?)\]", CONFIG, "prio py")))

# ── korroboracja: samotne medium NIE może samo przekroczyć progu ─────────────
# (żeby pojedynczy/retrospektywny artykuł nie alarmował; próg pada dopiero z
#  drugim niezależnym sygnałem — 2. medium do cap albo inna klasa źródła)
_th = num(r"THRESHOLD_ELEVATED\s*=\s*([\d.]+)", CONFIG, "próg elevated")
_media_pts = slownik(r"POINTS = \{(.*?)\}", CONFIG, "POINTS py").get("media_keywords")
_media_cap = slownik(r"SOURCE_CAPS = \{(.*?)\}", CONFIG, "SOURCE_CAPS py").get("media")
if _th is not None and _media_pts is not None and _media_pts >= _th:
    bledy.append(f"media_keywords={_media_pts} ≥ próg {_th}: samotny artykuł "
                 "zaalarmuje (brak korroboracji)")
if _th is not None and _media_cap is not None and _media_cap < _th:
    bledy.append(f"cap media={_media_cap} < próg {_th}: dwa media nie dobiją do progu")

# ── wynik ────────────────────────────────────────────────────────────────────
if bledy:
    print("ROZJAZD MIĘDZY SILNIKAMI (backend ↔ engine.js):")
    for b in bledy:
        print("  ✕", b)
    sys.exit(1)
print("OK — config.py (backend) i engine.js są spójne")
print("     (progi, okno, wygaszanie, kaskada, limity źródeł, punkty,")
print("      kolejność województw, ściana wschodnia)")

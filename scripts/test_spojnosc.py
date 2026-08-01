#!/usr/bin/env python3
"""Spójność trzech silników fuzji: backend (Python), aplikacja (engine.js), usługa (Java).

Punkty na pasku powiadomień i punkty w aplikacji liczyły dotąd dwa niezależne
silniki. Rozjeżdżały się po cichu — użytkownik widział „1.0 pkt" na pasku i
„0 pkt, brak sygnałów" w aplikacji. Odkąd oba zbiory są scalane po kluczu
deduplikacji, KAŻDA różnica w stałych albo w formacie klucza znowu je rozjedzie,
tyle że trudniej to zauważyć. Ten test pilnuje, żeby się nie rozjechały.

Uruchomienie:  python scripts/test_spojnosc.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = (ROOT / "frontend/engine.js").read_text(encoding="utf-8")
SOURCES = (ROOT / "android-app/android/app/src/main/java/pl/straznik/app/Sources.java").read_text(encoding="utf-8")
FUSION = (ROOT / "android-app/android/app/src/main/java/pl/straznik/app/Fusion.java").read_text(encoding="utf-8")
CONFIG = (ROOT / "backend/app/config.py").read_text(encoding="utf-8")

bledy: list[str] = []


def sprawdz(nazwa: str, oczekiwane, otrzymane) -> None:
    if oczekiwane != otrzymane:
        bledy.append(f"{nazwa}: engine.js={oczekiwane!r} ≠ Java={otrzymane!r}")


def licz(wzorzec: str, tekst: str, nazwa: str) -> float | None:
    m = re.search(wzorzec, tekst)
    if not m:
        bledy.append(f"nie znaleziono {nazwa} (wzorzec {wzorzec!r})")
        return None
    return float(m.group(1))


# ── progi, okno, wygaszanie ──────────────────────────────────────────────────
sprawdz("WINDOW_MIN", licz(r"WINDOW_MIN\s*=\s*(\d+)", ENGINE, "WINDOW_MIN js"),
        licz(r"WINDOW_MIN\s*=\s*(\d+)", FUSION, "WINDOW_MIN java"))
sprawdz("FULL_MIN", licz(r"FULL_MIN\s*=\s*(\d+)", ENGINE, "FULL_MIN js"),
        licz(r"FULL_MIN\s*=\s*(\d+)", FUSION, "FULL_MIN java"))
sprawdz("TH_ELEVATED", licz(r"TH_ELEVATED\s*=\s*([\d.]+)", ENGINE, "TH_ELEVATED js"),
        licz(r"TH_ELEVATED\s*=\s*([\d.]+)", FUSION, "TH_ELEVATED java"))
sprawdz("TH_HIGH", licz(r"TH_HIGH\s*=\s*([\d.]+)", ENGINE, "TH_HIGH js"),
        licz(r"TH_HIGH\s*=\s*([\d.]+)", FUSION, "TH_HIGH java"))
sprawdz("SPILLOVER_FACTOR", licz(r"SPILLOVER_FACTOR\s*=\s*([\d.]+)", ENGINE, "spill js"),
        licz(r"SPILLOVER_FACTOR\s*=\s*([\d.]+)", FUSION, "spill java"))
sprawdz("SPILLOVER_MIN", licz(r"SPILLOVER_MIN\s*=\s*([\d.]+)", ENGINE, "spillmin js"),
        licz(r"SPILLOVER_MIN\s*=\s*([\d.]+)", FUSION, "spillmin java"))
sprawdz("SPILLOVER_MAX_DEPTH", licz(r"SPILLOVER_MAX_DEPTH\s*=\s*(\d+)", ENGINE, "depth js"),
        licz(r"SPILLOVER_MAX_DEPTH\s*=\s*(\d+)", FUSION, "depth java"))

# ── kolejność województw: stan w tle trzymamy po INDEKSACH ───────────────────
js_voivs = re.search(r"const VOIVODESHIPS = \[(.*?)\];", ENGINE, re.S)
java_voivs = re.search(r"static final String\[\] VOIVS = \{(.*?)\};", SOURCES, re.S)
py_voivs = re.search(r"VOIVODESHIPS\s*=\s*\[(.*?)\]", CONFIG, re.S)
listy = {}
for nazwa, m in (("engine.js", js_voivs), ("Sources.java", java_voivs), ("config.py", py_voivs)):
    if not m:
        bledy.append(f"nie znaleziono listy województw w {nazwa}")
        continue
    listy[nazwa] = re.findall(r'"([^"]+)"', m.group(1))
if len(listy) == 3 and len(set(map(tuple, listy.values()))) != 1:
    bledy.append("kolejność województw różna: " + "; ".join(
        f"{k}={v[:3]}…" for k, v in listy.items()))

# ── limity wkładu jednego źródła ─────────────────────────────────────────────
js_caps = dict(re.findall(r"(\w+):\s*([\d.]+)", re.search(
    r"SOURCE_CAPS = \{(.*?)\}", ENGINE, re.S).group(1)))
java_cap_blok = re.search(r"double cap = (.*?);", FUSION, re.S).group(1)
for src, cap in js_caps.items():
    wzorzec = rf'"{src}"\.equals\(src\).*?([\d.]+)'
    if not re.search(rf'"{src}"', java_cap_blok):
        bledy.append(f"limit źródła '{src}' ({cap}) jest w engine.js, brak w Fusion.java")
    elif f"{float(cap):g}" not in re.sub(r"\s+", " ", java_cap_blok):
        bledy.append(f"limit źródła '{src}': engine.js={cap}, w Fusion.java innej wartości")

# ── punkty za sygnał ─────────────────────────────────────────────────────────
js_points = dict(re.findall(r"(\w+):\s*([\d.]+)", re.search(
    r"const POINTS = \{(.*?)\}", ENGINE, re.S).group(1)))
oczek_java = {
    "media_keywords": r'Fusion\.Signal\("media", voiv, ([\d.]+)',
    "baltic_context": r'Fusion\.Signal\("media", v, ([\d.]+)',
    "rcb_alert": r'Fusion\.Signal\("rcb", i, ([\d.]+)',
    "pansa_zone": r'Fusion\.Signal\("pansa", voiv, ([\d.]+)',
    "adsb_spike": r'Fusion\.Signal\("adsb", v, ([\d.]+)',
}
for nazwa, wzorzec in oczek_java.items():
    m = re.search(wzorzec, SOURCES)
    if not m:
        bledy.append(f"punkty '{nazwa}': nie znaleziono odpowiednika w Sources.java")
    elif float(m.group(1)) != float(js_points[nazwa]):
        bledy.append(f"punkty '{nazwa}': engine.js={js_points[nazwa]}, Java={m.group(1)}")

# ── format klucza deduplikacji ───────────────────────────────────────────────
# Klucz jest jedynym spoiwem scalania: gdy formaty się rozjadą, ten sam sygnał
# policzy się DWA razy — raz z aplikacji, raz z usługi.
KLUCZE = [
    ("neptun", r"`neptun:\$\{t\.id\}:t\$\{tier\}`", r'"neptun:" \+ t\.optString\("id"\) \+ ":t" \+ tier'),
    ("media", r'"media:" \+ \(it\.link \|\| it\.title\)', r'"media:" \+ link'),
    ("baltic", r"`baltic:\$\{it\.link\|\|it\.title\}:\$\{v\}`", r'"baltic:" \+ link \+ ":" \+ VOIVS\[v\]'),
    ("rcb", r"`rcb:\$\{href\}:\$\{v\}`", r'"rcb:" \+ href \+ ":" \+ VOIVS\[i\]'),
    ("pansa", r"`pansa:\$\{dz\}:\$\{info\.end\}`", r'"pansa:" \+ dz \+ ":" \+ activeRes\.optString\("endDate"\)'),
    ("adsb", r"`adsb:\$\{v\}:\$\{new Date\(\)\.toISOString\(\)\.slice\(0,13\)\}`",
     r'"adsb:" \+ VOIVS\[v\] \+ ":" \+ hourKeyUtc\(now\)'),
]
for nazwa, wz_js, wz_java in KLUCZE:
    if not re.search(wz_js, ENGINE):
        bledy.append(f"klucz '{nazwa}': zmienił się format w engine.js")
    if not re.search(wz_java, SOURCES):
        bledy.append(f"klucz '{nazwa}': zmienił się format w Sources.java")

# ── ściana wschodnia jako domyślny cel ───────────────────────────────────────
js_prio = re.findall(r'"([^"]+)"', re.search(
    r"const PRIORITY_VOIVS = \[(.*?)\]", ENGINE, re.S).group(1))
py_prio = re.findall(r'"([^"]+)"', re.search(
    r"PRIORITY_VOIVODESHIPS\s*=\s*\[(.*?)\]", CONFIG, re.S).group(1))
java_prio_idx = [int(x) for x in re.findall(r"\d+", re.search(
    r"int\[\] PRIORITY_VOIVS = \{(.*?)\}", SOURCES, re.S).group(1))]
java_prio = [listy["Sources.java"][i] for i in java_prio_idx] if "Sources.java" in listy else []
if sorted(js_prio) != sorted(py_prio):
    bledy.append(f"PRIORITY: engine.js={js_prio} ≠ config.py={py_prio}")
if sorted(js_prio) != sorted(java_prio):
    bledy.append(f"PRIORITY: engine.js={js_prio} ≠ Sources.java={java_prio}")

# ── komplet źródeł po obu stronach ───────────────────────────────────────────
js_zrodla = {"neptun", "media", "rcb", "pansa", "adsb"}
java_zrodla = set(re.findall(r'new Fusion\.Signal\(\s*"(\w+)"', SOURCES))
brak = js_zrodla - java_zrodla
if brak:
    bledy.append(f"usługa w tle nie zbiera źródeł: {sorted(brak)} "
                 f"— aplikacja pokaże punkty, których nie ma na pasku")

# ── wynik ────────────────────────────────────────────────────────────────────
if bledy:
    print("ROZJAZD MIĘDZY SILNIKAMI:")
    for b in bledy:
        print("  ✕", b)
    sys.exit(1)
print("OK — engine.js, Sources.java, Fusion.java i config.py są spójne")
print("     (progi, okno, kaskada, kolejność województw, limity, punkty,")
print("      format kluczy deduplikacji, ściana wschodnia, komplet źródeł)")

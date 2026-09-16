# -*- coding: utf-8 -*-
"""Płynne przejście ikon między meldunkami NEPTUN-a (1.7.53).

Od 1.7.48 ikony bez zmierzonej prędkości i kursu stały w miejscu ostatniego
meldunku i przeskakiwały przy następnym. Teraz ikona przez 45 s przesuwa się
ze starej pozycji do nowej — nigdy przed źródło, bez prognozy do przodu;
skoki ponad 80 km bez przejazdu (scripts/plynny_ruch_check.js).

Uruchomienie: py scripts/test_plynny_ruch.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding="utf-8")

r = subprocess.run(["node", str(ROOT / "scripts" / "plynny_ruch_check.js")],
                   capture_output=True, text=True, encoding="utf-8")
print(r.stdout.strip())
if r.returncode != 0:
    print(r.stderr.strip())
    print("\nBŁĄD - płynne przejście ikon")
    sys.exit(1)
print("\nOK - ikony przechodzą płynnie między meldunkami i nie wyprzedzają źródła")

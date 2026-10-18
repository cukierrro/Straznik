# -*- coding: utf-8 -*-
"""Generuje frontend/voiv-outline.js z backend/app/voiv_points.py (VOIV_OUTLINE).

Silnik aplikacji (tryb bez serwera) przypisuje obiekt NEPTUN do KAŻDEGO
województwa w zasięgu, z wagą od odległości do tego województwa — tak jak
serwer (`neptun._signal_sasiednie`, od 1.7.91). Do tego potrzebuje tych samych
obrysów co serwer. Zgodność pilnuje scripts/test_spojnosc.py.

Uruchomienie: py scripts/build_voiv_outline.py
"""
import json
import sys
from pathlib import Path

KORZEN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KORZEN / "backend"))
from app.voiv_points import VOIV_OUTLINE  # noqa: E402

dane = {v: [[lat, lon] for lat, lon in ring] for v, ring in VOIV_OUTLINE.items()}
tekst = ("/* Uproszczone obrysy województw [lat, lon] — GENEROWANE przez\n"
         "   scripts/build_voiv_outline.py (lustro backend/app/voiv_points.py). Nie edytować. */\n"
         "const VOIV_OUTLINE = " + json.dumps(dane, ensure_ascii=False, separators=(",", ":")) + ";\n")
(KORZEN / "frontend" / "voiv-outline.js").write_text(tekst, encoding="utf-8", newline="\n")
print(f"frontend/voiv-outline.js: {len(dane)} województw, {len(tekst)} B")

# -*- coding: utf-8 -*-
"""Wyłączniki funkcji z serwera: brak pliku = wszystko włączone, tylko znane klucze.

Uruchomienie: py scripts/test_wylaczniki.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
from app import config, main  # noqa: E402

bledy = 0


def sprawdz(warunek, opis):
    global bledy
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    bledy += not warunek


with tempfile.TemporaryDirectory() as d:
    config.DATA_DIR = Path(d)
    sprawdz(main._load_switches() == {}, "brak pliku — nic nie wyłączone")
    (Path(d) / "wylaczniki.json").write_text('{"grota": false, "obce": true, "x": 1}', encoding="utf-8")
    sprawdz(main._load_switches() == {"grota": False}, "tylko znane klucze")
    (Path(d) / "wylaczniki.json").write_text('{"grota": "nie"}', encoding="utf-8")
    sprawdz(main._load_switches() == {}, "wartość nielogiczna ignorowana")
    (Path(d) / "wylaczniki.json").write_text('{zepsuty', encoding="utf-8")
    sprawdz(main._load_switches() == {}, "zepsuty plik nie psuje stanu")
    sprawdz('"wylaczniki": _load_switches()' in Path(main.__file__).read_text(encoding="utf-8"),
            "stan niesie wyłączniki")

if bledy:
    sys.exit(1)
print("OK: wyłączniki")

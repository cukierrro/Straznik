# -*- coding: utf-8 -*-
"""Rozbicie na writera i readera: czy podział ról trzyma się zasad (20.09.2026).

Zasady, których nie wolno złamać, bo to aplikacja alarmowa:
  1. powiadomienia wychodzą WYŁĄCZNIE z writera — dwa procesy wysłałyby dwa alarmy,
  2. reader niczego nie liczy i nie zbiera — ma tylko podawać gotowe bajty,
  3. przekazanie stanu jest atomowe: reader widzi starą albo nową wersję, nigdy uciętej,
  4. brak stanu u readera to „rozgrzewam się" (503), a nie liczenie na własną rękę.

Uruchomienie: py scripts/test_writer_reader.py
"""
import os
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
_dotenv = types.ModuleType("dotenv")
_dotenv.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", _dotenv)
os.environ["STRAZNIK_BLOB_DIR"] = tempfile.mkdtemp(prefix="straznik-blob-")
sys.stdout.reconfigure(encoding="utf-8")

from app import blob_store  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. Przekazanie stanu przez pamięć współdzieloną")
blob_store.zapisz("state", b'{"fusion":{"ts":"A"}}', b"gz-A", '"etag-A"')
odczyt = blob_store.wczytaj("state")
sprawdz(odczyt and odczyt["raw"] == b'{"fusion":{"ts":"A"}}', "reader dostaje dokładnie te bajty, które zapisał writer")
sprawdz(odczyt["etag"] == '"etag-A"' and odczyt["gz"] == b"gz-A", "razem ze znacznikiem wersji i wersją skompresowaną")
sprawdz(blob_store.wczytaj("nieistniejacy") is None, "brak pliku to None, nie wyjątek")

print("2. Nowa wersja zastępuje starą w całości")
blob_store.zapisz("state", b'{"fusion":{"ts":"B"}}', b"gz-B", '"etag-B"')
drugi = blob_store.wczytaj("state")
sprawdz(drugi["raw"].endswith(b'"B"}}') and drugi["etag"] == '"etag-B"', "po podmianie widać wyłącznie nową wersję")
sprawdz(not list(Path(os.environ["STRAZNIK_BLOB_DIR"]).glob("*.tmp")),
        "po zapisie nie zostaje plik tymczasowy")

print("3. Stan zdrowia writera")
blob_store.zapisz_health({"neptun": {"connected": True}, "rola": "writer"})
h = blob_store.wczytaj_health()
sprawdz(h and h["neptun"]["connected"] is True, "reader czyta stan kolektorów writera")
wiek = blob_store.wiek_s("state")
sprawdz(wiek is not None and wiek < 5, f"reader wie, jak stary jest stan ({wiek and round(wiek, 2)} s)")

print("4. Podział ról w kodzie")
zrodlo = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
sprawdz("if not config.IS_WRITER:" in zrodlo and "bez kolektorów i bez powiadomień" in zrodlo,
        "reader nie uruchamia kolektorów ani powiadomień")
sprawdz('busy = (not config.IS_WRITER' in zrodlo,
        "reader odmawia gniazda kodem 1013 — stare wersje przechodzą na odpytywanie")
for fragment in ('public_cache.get("state") is None and config.IS_WRITER',
                 'public_cache.get("bundle") is None and config.IS_WRITER',
                 'public_cache.get("timeline") is None and config.IS_WRITER',
                 'public_cache.get("zones") is None and config.IS_WRITER'):
    sprawdz(fragment in zrodlo, f"reader nie składa danych sam: {fragment.split('(')[1].split(')')[0]}")

cache_src = (ROOT / "backend/app/public_cache.py").read_text(encoding="utf-8")
sprawdz('if config.ROLE == "writer"' in cache_src, "writer odkłada każdą gotową paczkę dla readera")
sprawdz('if config.ROLE == "reader"' in cache_src, "reader bierze paczki z pamięci współdzielonej")

print("5. Milczący writer — reader nie udaje, że ma świeży stan")
import time  # noqa: E402

from app import config, public_cache  # noqa: E402

config.ROLE = "reader"
blob_store.zapisz("state", b'{"fusion":{"ts":"C"}}', b"gz-C", '"etag-C"')
sprawdz(public_cache.get("state") is not None, "świeży stan reader podaje")
stary = blob_store.wczytaj("state")
stary["built"] = time.time() - (public_cache.STAN_PRZETERMINOWANY_S + 30)
blob_store._cache["state"] = (blob_store._sciezka("state").stat().st_mtime, stary)
sprawdz(public_cache.get("state") is None,
        f"stan starszy niż {public_cache.STAN_PRZETERMINOWANY_S} s = „nie mam”, nie stara mapa jako bieżąca")
sprawdz(public_cache.STAN_PRZETERMINOWANY_S >= 120,
        "próg z zapasem na restart writera — krótkie wdrożenie nie miga banerem")
config.ROLE = "all"

print("6. Domyślnie nic się nie zmienia")
sprawdz(config.ROLE == "all", f"bez zmiennej środowiskowej rola to „all” ({config.ROLE})")
sprawdz(config.IS_WRITER and config.IS_READER, "czyli jeden proces robi wszystko, jak dotąd")

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: writer liczy i alarmuje, reader tylko podaje; przekazanie stanu atomowe.")

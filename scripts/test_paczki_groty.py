# -*- coding: utf-8 -*-
"""Paczki map Groty: czy brzeg je zapamięta, zanim ktokolwiek zacznie pobierać (20.09.2026).

Paczki to ~20 plików po 100 MB, razem ~2 GB. Jeśli Cloudflare ich nie zapamięta,
każdy telefon ciągnie je z naszego serwera — przy kilkuset urządzeniach to gigabajty
przez tunel, który obsługuje też alarm. Dlatego dwa zabezpieczenia naraz:
rozszerzenie `.bin` (darmowy plan Cloudflare łapie je po rozszerzeniu) oraz własny
nagłówek `immutable` na ścieżce `/grota/paczki/`.

Sprawdzamy nagłówki, bo to jedyna część, na którą mamy wpływ z kodu.

Uruchomienie: py scripts/test_paczki_groty.py
"""
import asyncio
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
_dotenv = types.ModuleType("dotenv")
_dotenv.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", _dotenv)
sys.stdout.reconfigure(encoding="utf-8")

from app.public_cache import StaticCacheHeaders  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def naglowek(sciezka: str, query: bytes = b"") -> str:
    """Jaki Cache-Control dostanie odpowiedź spod tego adresu."""
    zebrane = {}

    async def aplikacja(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": [(b"x", b"1")]})

    async def send(message):
        if message["type"] == "http.response.start":
            for k, v in message["headers"]:
                if k.lower() == b"cache-control":
                    zebrane["cc"] = v.decode()

    async def biegnij():
        mw = StaticCacheHeaders(aplikacja)
        await mw({"type": "http", "path": sciezka, "query_string": query}, None, send)

    asyncio.run(biegnij())
    return zebrane.get("cc", "")


print("1. Paczki Groty mają leżeć w telefonie i na brzegu jak najdłużej")
cc = naglowek("/grota/paczki/mazowieckie-1.bin")
sprawdz("immutable" in cc and "31536000" in cc, f"paczka województwa: {cc or 'BRAK NAGŁÓWKA'}")
sprawdz("immutable" in naglowek("/grota/paczki/spis.bin"), "spis części też")
sprawdz("immutable" in naglowek("/grota/paczki/opolskie-1.bin", b"cokolwiek=1"),
        "również, gdy ktoś dopisze cokolwiek do adresu")

print("2. Reszta serwisu bez zmian")
sprawdz(naglowek("/app.js", b"v=1.7.63") == "public, max-age=31536000, immutable",
        "plik z wersją w adresie nadal na rok")
sprawdz("86400" in naglowek("/ikona.png"), "plik bez wersji nadal na dobę")
sprawdz(naglowek("/sw.js") == "no-cache",
        "sw.js nadal bez cache — to on decyduje o aktualizacji reszty")
sprawdz(naglowek("/api/state") == "", "API nietknięte — ma własne nagłówki")
sprawdz(naglowek("/grota/index.html") == "",
        "sam widok Groty NIE jest wieczny — inaczej poprawka nie dotarłaby do ludzi")

print()
if bledy:
    print("BŁĘDY:", len(bledy))
    for b in bledy:
        print(" -", b)
    sys.exit(1)
print("OK: paczki map są wieczne, reszta serwisu bez zmian.")

# -*- coding: utf-8 -*-
"""Limit rozmiaru i czasu przy pobieraniu kanałów RSS (audyt bezpieczeństwa 26.10.2026).

Dawniej `client.get` wczytywał całą odpowiedź do pamięci writera, bez górnej granicy, a timeout
httpx liczy się na pojedynczą operację, nie na całość. Od września doszło 18 kanałów zagranicznych.
Pomiar 26.10 (35 kanałów): mediana 45 KB, największy 134 KB — limit 2 MB nie dotyka żadnego.

Uruchomienie: py scripts/test_rss_limit.py
"""
import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from app.collectors import rss_media as rm  # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


def odpowiedz(request):
    sciezka = request.url.path
    if sciezka == "/maly":
        return httpx.Response(200, content=b"<rss>" + b"x" * 130_000 + b"</rss>")
    if sciezka == "/duzy-bez-naglowka":
        async def strumien():
            for _ in range(40):
                yield b"y" * 65536                      # 2,5 MB w kawałkach, bez Content-Length
        return httpx.Response(200, content=strumien())
    if sciezka == "/duzy-z-naglowkiem":
        return httpx.Response(200, headers={"content-length": "50000000"}, content=b"z")
    if sciezka == "/przekierowanie":
        return httpx.Response(302, headers={"location": "https://kanal.test/maly"})
    if sciezka == "/blad":
        return httpx.Response(503)
    return httpx.Response(404)


async def main():
    async with httpx.AsyncClient(transport=httpx.MockTransport(odpowiedz)) as k:
        r, err = await rm._get_with_retry(k, "https://kanal.test/maly", tries=1)
        sprawdz(r is not None and len(r.content) > 130_000, "kanał 130 KB (jak największy prawdziwy) przechodzi w całości")
        r, err = await rm._get_with_retry(k, "https://kanal.test/duzy-bez-naglowka", tries=1)
        sprawdz(r is None and "przekroczył" in (err or ""), f"2,5 MB bez nagłówka — przerwane w trakcie: {err}")
        r, err = await rm._get_with_retry(k, "https://kanal.test/duzy-z-naglowkiem", tries=1)
        sprawdz(r is None and "za duży" in (err or ""), f"Content-Length 50 MB — odrzucone przed pobraniem: {err}")
        r, err = await rm._get_with_retry(k, "https://kanal.test/przekierowanie", tries=1)
        sprawdz(r is not None and r.content.startswith(b"<rss>"), "przekierowanie https → https działa")
        r, err = await rm._get_with_retry(k, "https://kanal.test/blad", tries=1)
        sprawdz(r is None and err, f"503 — błąd zgłoszony: {err[:60] if err else err}")
    sprawdz(rm.RSS_MAX_BAJTOW == 2 * 1024 * 1024 and rm.RSS_MAX_CZAS_S <= 60, "limity: 2 MB, czas łączny ≤ 60 s")


asyncio.run(main())
print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)

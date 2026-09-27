# -*- coding: utf-8 -*-
"""Pobieranie artykułów nie daje się skierować do środka serwera (audyt 26.09.2026).

Adresy artykułów podaje obca strona (kanał RSS, Google News). Test sprawdza:
- odrzucanie adresów nie-publicznych i nie-http, także ukrytych za przekierowaniem,
- limit rozmiaru liczony W TRAKCIE pobierania, a nie po nim,
- że zwykły artykuł (także spakowany gzipem) dalej się czyta.

Bez sieci: publiczne adresy są literałami IP (bez zapytań DNS), a serwer to atrapa
httpx.MockTransport, która zapisuje, dokąd naprawdę próbowano się połączyć.
"""
import asyncio
import gzip
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import article_reader as ar  # noqa: E402

bledy = 0


def sprawdz(warunek, opis):
    global bledy
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy += 1


PUBLICZNY = "93.184.216.34"          # literał IP — zero zapytań DNS w teście


async def main():
    print("1. Adresy, których nie wolno pobrać")
    for url in ["http://127.0.0.1:40141/api/health", "http://localhost/", "http://10.0.0.5/",
                "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/",
                "http://[::1]/", "http://0.0.0.0/", "file:///etc/passwd", "ftp://example.org/",
                f"http://uzytkownik:haslo@{PUBLICZNY}/", "javascript:alert(1)", "http:///brak-hosta"]:
        sprawdz(not await ar._adres_dozwolony(url), f"odrzucony: {url}")
    sprawdz(await ar._adres_dozwolony(f"https://{PUBLICZNY}/artykul"), "publiczny adres przechodzi")

    proby = []

    def serwer(req: httpx.Request) -> httpx.Response:
        proby.append(str(req.url))
        p = req.url.path
        if p == "/artykul":
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"},
                                  content="<p>Syreny w Lublinie — żółta faza</p>".encode())
        if p == "/gzip":
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8",
                                                "content-encoding": "gzip"},
                                  content=gzip.compress("<p>Dron nad Hrubieszowem</p>".encode()))
        if p == "/do-srodka":
            return httpx.Response(302, headers={"location": "http://127.0.0.1:40141/api/health"})
        if p == "/metadane":
            return httpx.Response(301, headers={"location": "http://169.254.169.254/"})
        if p == "/wzgledne":
            return httpx.Response(302, headers={"location": "/artykul"})
        if p == "/petla":
            return httpx.Response(302, headers={"location": "/petla"})
        if p == "/ogromny-deklarowany":
            return httpx.Response(200, headers={"content-length": str(ar.MAX_BYTES + 1)}, content=b"x")
        if p == "/ogromny-bez-dlugosci":
            def strumien():
                for _ in range(ar.MAX_BYTES // 65536 + 5):
                    yield b"x" * 65536
            return httpx.Response(200, content=strumien())
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(serwer)) as klient:
        print("\n2. Zwykły artykuł dalej się czyta")
        r = await ar._get(klient, f"http://{PUBLICZNY}/artykul")
        sprawdz(r is not None and "żółta faza" in r.text, "treść odczytana z polskimi znakami")
        r = await ar._get(klient, f"http://{PUBLICZNY}/gzip")
        sprawdz(r is not None and "Hrubieszowem" in r.text, "odpowiedź gzip rozpakowana raz, nie dwa razy")
        r = await ar._get(klient, f"http://{PUBLICZNY}/wzgledne")
        sprawdz(r is not None and "żółta faza" in r.text, "przekierowanie względne działa")

        print("\n3. Przekierowanie do środka jest zatrzymane PRZED połączeniem")
        proby.clear()
        r = await ar._get(klient, f"http://{PUBLICZNY}/do-srodka")
        sprawdz(r is None, "przekierowanie na 127.0.0.1 → brak odpowiedzi")
        sprawdz(not any("127.0.0.1" in p for p in proby), "do 127.0.0.1 nie było nawet próby połączenia")
        proby.clear()
        r = await ar._get(klient, f"http://{PUBLICZNY}/metadane")
        sprawdz(r is None and not any("169.254" in p for p in proby), "przekierowanie na metadane chmury zatrzymane")
        r = await ar._get(klient, f"http://{PUBLICZNY}/petla")
        sprawdz(r is None, f"pętla przekierowań kończy się po {ar.MAX_PRZEKIEROWAN}")

        print("\n4. Limit rozmiaru")
        r = await ar._get(klient, f"http://{PUBLICZNY}/ogromny-deklarowany")
        sprawdz(r is None, "odrzucone po nagłówku content-length, bez pobierania")
        r = await ar._get(klient, f"http://{PUBLICZNY}/ogromny-bez-dlugosci")
        sprawdz(r is None, "strumień bez długości przerwany po przekroczeniu limitu")


asyncio.run(main())
print(f"\n{'WSZYSTKO OK' if not bledy else f'BŁĘDÓW: {bledy}'}")
sys.exit(1 if bledy else 0)

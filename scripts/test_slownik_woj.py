# -*- coding: utf-8 -*-
"""Rozpoznawanie województw po pełnych formach (app/slownik_woj.py, 23.10.2026).

Przypadki w scripts/slownik_woj_przypadki.json — te same sprawdza lustro w engine.js
(test_slownik_woj.cjs). Biorą się z prawdziwych błędów starego słownika rdzeni:
„Biała Podlaska” w alercie RCB dla lubelskiego dała fałszywe żółte w podlaskim (23.10),
„powiat opolski” wokół Opola Lubelskiego punktował opolskie (21.09–15.10), Gdańsk i Gdynia
brakowały w spisie GROTY. Dodatkowo: rss_media i rcb korzystają z tego modułu,
a plik słownika ma oczekiwany układ.

Uruchomienie:  py scripts/test_slownik_woj.py
"""
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from app import config, slownik_woj                  # noqa: E402
from app.collectors import rcb, rss_media           # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1. przypadki wspólne z engine.js")
for tekst, oczekiwane in json.loads((ROOT / "scripts" / "slownik_woj_przypadki.json")
                                    .read_text(encoding="utf-8"))["przypadki"]:
    got = rss_media._match_voivs(rss_media._neutralize_places(tekst))
    sprawdz(got == oczekiwane, f"{tekst[:70]} → {got} (oczekiwano {oczekiwane})")

print("2. regiony wprost (regions_only) — bez miast")
sprawdz(rss_media._match_voivs("Syreny w Lublinie i Rzeszowie", regions_only=True) == [],
        "same miasta → nic")
sprawdz(rss_media._match_voivs("Alert także dla podkarpackiego", regions_only=True) == ["podkarpackie"],
        "przymiotnik województwa → województwo")

print("3. tytuł wpisu RCB (gov.pl)")
sprawdz(rcb._match_voivs("Alert RCB - Biała Podlaska") == ["lubelskie"], "Biała Podlaska → lubelskie")
sprawdz(rcb._match_voivs("Komunikat RCB") == list(config.PRIORITY_VOIVODESHIPS),
        "bez województwa → priorytetowe")

print("4. plik słownika")
frazy, maxn = slownik_woj._slownik()
sprawdz(len(frazy) > 30000, f"fraz: {len(frazy)}")
sprawdz({r for _v, r in frazy.values()} == {"r", "m", "p", "x"}, "rodzaje r/m/p/x")
sprawdz({v for v, _r in frazy.values()} - {None} == set(config.VOIVODESHIPS), "16 województw i neutralne")
sprawdz(all(k == " ".join(slownik_woj.TOK.findall(k)) for k in frazy), "klucze złożone i rozdzielone spacją")
sprawdz(frazy.get("biala podlaska") == ("lubelskie", "m"), "biala podlaska → lubelskie")
sprawdz(maxn <= 8, f"najdłuższa fraza: {maxn} słów")

print("5. Długi tekst (audyt 26.10.2026): czas liniowy i bezpiecznik długości")
import time  # noqa: E402
dlugi = ("Drony nad Lublinem, Chełmem i Zamościem, potem Rzeszów oraz Przemyśl. " * 4000)  # ~280 KB
t0 = time.time()
wynik = slownik_woj.wojewodztwa(dlugi)
sprawdz(time.time() - t0 < 1.0, f"280 KB w {time.time() - t0:.2f} s (dawniej ok. 30 s)")
sprawdz(wynik == ["lubelskie", "podkarpackie"], f"wynik bez zmian: {wynik}")
sprawdz(slownik_woj.wojewodztwa("x" * slownik_woj.MAX_ZNAKOW + " Alarm w Rzeszowie") == [],
        "tekst po 8000. znaku nie jest czytany (bezpiecznik)")
sprawdz(slownik_woj.wojewodztwa("Alert. W powiatach: puławski, opolski. Syreny w Opolu.") == ["opolskie"],
        "reguła powiatu działa w obrębie zdania, nie dalej (granice liczone raz)")

print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)

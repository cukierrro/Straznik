# -*- coding: utf-8 -*-
"""Ścisły odczyt odbiorców alertu RCB z gov.pl (app/rcb_odbiorcy.py) — na razie tylko test,
moduł nie jest podłączony do kolektora (decyzja usera 23.10.2026).

Zasada: najpierw województwo z nagłówka, potem powiaty wyłącznie z tego województwa
(TERYT TERC). Każdy nieznany układ zdania albo powiat spoza województwa → None, bez zgadywania.

Uruchomienie:  py scripts/test_rcb_odbiorcy.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from app.rcb_odbiorcy import _powiaty, odbiorcy      # noqa: E402

bledy = []


def ok(got, oczekiwane, opis):
    dobrze = got == oczekiwane
    print(("  OK   " if dobrze else "  BŁĄD ") + f"{opis}: {got}")
    if not dobrze:
        bledy.append(opis)


# prawdziwy blok z wpisu „Alert RCB - zagrożenie z powietrza (23.10)”, aktualizacja 17:57
LUB_1757 = ("Aktualizacja! — 17:57 „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest "
            "monitorowana. W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.” "
            "Alert RCB został wysłany do odbiorców na terenie części województwa: - lubelskiego - powiaty: "
            "włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski, hrubieszowski, Zamość, "
            "zamojski, tomaszowski, biłgorajski.")
# aktualizacja 9:33 tego samego dnia — dwa województwa w jednym zdaniu
DWA_0933 = ("Alert RCB został wysłany do odbiorców na terenie części województwa: - lubelskiego - powiaty: "
            "włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski, hrubieszowski, Zamość, "
            "zamojski, tomaszowski, biłgorajski - podkarpackiego - powiaty: dębicki, ropczycko-sędziszowski, "
            "Rzeszów, rzeszowski, łańcucki, przeworski, jarosławski, lubaczowski, jasielski, strzyżowski, "
            "brzozowski, Przemyśl, przemyski, sanocki, leski, Krosno, krośnieński, bieszczadzki.")

print("1. układ z powiatami (od 23.10.2026)")
ok(odbiorcy(LUB_1757), {"lubelskie": ["wlodawski", "leczynski", "swidnicki", "chelm", "chelmski",
                                      "krasnostawski", "hrubieszowski", "zamosc", "zamojski",
                                      "tomaszowski", "bilgorajski"]}, "lubelskie, 11 powiatów")
d = odbiorcy(DWA_0933)
ok(sorted(d) if d else d, ["lubelskie", "podkarpackie"], "dwa województwa")
ok(len(d["podkarpackie"]) if d else None, 18, "podkarpackie: 18 powiatów")
ok(odbiorcy("na terenie części województwa: - lubelskiego - powiaty: Biała Podlaska, bialski."),
   {"lubelskie": ["biala podlaska", "bialski"]}, "Biała Podlaska to lubelskie, nie podlaskie")
ok(odbiorcy("na terenie części województwa: - lubelskiego - powiaty: włodawski, dębicki."),
   None, "powiat z innego województwa → nie zgadujemy")
ok(odbiorcy("na terenie części województwa: - lubelskiego - powiaty: opolski."),
   {"lubelskie": ["opolski"]}, "„opolski” pod lubelskim to powiat, nie województwo opolskie")

print("2. układy bez powiatów (do 22.10.2026)")
ok(odbiorcy("Alert RCB został wysłany do odbiorców na terenie woj. podkarpackiego i lubelskiego."),
   {"podkarpackie": None, "lubelskie": None}, "woj. X i Y")
ok(odbiorcy("Alert RCB o tej treści został wysłany do odbiorców na terenie województwa lubelskiego."),
   {"lubelskie": None}, "województwa X")
ok(odbiorcy("zostały wysłane na terenie województw: lubelskiego, podkarpackiego oraz mazowieckiego."),
   {"lubelskie": None, "podkarpackie": None, "mazowieckie": None}, "województw X, Y oraz Z")
ok(odbiorcy("wysłany do odbiorców na terenie województwa: - opolskiego"), {"opolskie": None},
   "jedno województwo w układzie z myślnikami, bez powiatów")

print("2b. dawne układy z powiatami (prawdziwe zdania z gov.pl)")
ok(odbiorcy("Alert RCB został wysłany do odbiorców na terenie powiatów: włodawskiego, łęczyńskiego, "
            "świdnickiego, Chełm, chełmskiego, krasnostawskiego, Woj. lubelskie. "),
   {"lubelskie": ["wlodawski", "leczynski", "swidnicki", "chelm", "chelmski", "krasnostawski"]},
   "powiaty w dopełniaczu, województwo na końcu (16.10)")
ok(odbiorcy("wysłany do odbiorców na terenie powiatów: : jasielski, strzyżowski, Przemyśl, przemyski, "
            "woj. podkarpackie. "), {"podkarpackie": ["jasielski", "strzyzowski", "przemysl", "przemyski"]},
   "powiaty w mianowniku, podwójny dwukropek (20.10)")
ok(odbiorcy("został wysłany do odbiorców na terenie województwa\xa0lubelskiego (powiaty: puławski, opolski, "
            "Lublin, lubelski)."), {"lubelskie": ["pulawski", "opolski", "lublin", "lubelski"]},
   "powiaty w nawiasie (21.09)")
ok(odbiorcy("na terenie województwa: - pomorskiego - powiaty: lęborski, pucki, Słupsk, słupski i wejherowski "
            "- zachodniopomorskiego - powiaty: gryficki, Koszalin i Świnoujście \xa0 Z szacunkiem, RCB"),
   {"pomorskie": ["leborski", "pucki", "slupsk", "slupski", "wejherowski"],
    "zachodniopomorskie": ["gryficki", "koszalin", "swinoujscie"]}, "„i” w liście, podpis zamiast kropki")
ok(odbiorcy("na terenie części województwa: - lubelskiego - powiaty: ubieszowski, Zamość, zamojski."),
   None, "literówka na gov.pl (23.10 rano: „ubieszowski”) → nie zgadujemy")

print("3. nierozpoznane → None")
ok(odbiorcy("Alert RCB został wysłany do odbiorców na terenie Polski wschodniej."), None, "obszar opisowy")
ok(odbiorcy("na terenie woj. lubelskiego i Ukrainy."), None, "obcy człon listy")
ok(odbiorcy("UWAGA! Rosyjski atak powietrzny na terenie Ukrainy."), None, "treść alertu, nie odbiorcy")

print("4. wykaz powiatów TERC")
p = _powiaty()
ok(len(p), 16, "16 województw")
ok(sum(len(v) for v in p.values()), 380, "380 powiatów i miast na prawach powiatu")
ok(("chelm" in p["lubelskie"], "biala podlaska" in p["lubelskie"], "biala podlaska" in p["podlaskie"]),
   (True, True, False), "Chełm i Biała Podlaska w lubelskim, Białej Podlaskiej nie ma w podlaskim")
ok(("opolski" in p["lubelskie"], "opolski" in p["opolskie"]), (True, True),
   "powiat opolski jest w dwóch województwach — rozstrzyga nagłówek")

print()
print(f"BŁĘDY: {len(bledy)}" if bledy else "Wszystko OK")
sys.exit(1 if bledy else 0)

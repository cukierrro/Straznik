# -*- coding: utf-8 -*-
"""E3 (13.09.2026): luki w klasyfikacji mediów, fala QRA, gov.pl RCB i dziennik stealth.

Uruchomienie:  py scripts/test_e3_media.py
"""
import asyncio
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config, fusion, stealth                            # noqa: E402

# dziennik stealth do katalogu tymczasowego, zanim ktokolwiek go otworzy
_tmp = tempfile.TemporaryDirectory()
stealth.DB_PATH = Path(_tmp.name) / "obserwacje.db"
stealth._conn = None

from app.collectors import rcb, rss_media                          # noqa: E402

bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def poziom(tekst):
    return rss_media._classify(tekst)[0]


print("1. A: poderwanie w stronie czynnej, DORSZ, treść alertu RCB")
for tekst in [
    "Polska poderwała myśliwce. Rosja atakuje Ukrainę",
    "Wojsko poderwało lotnictwo w nocy",
    "DORSZ: operuje lotnictwo wojskowe",
    "Rozpoczęło się operowanie polskiego i sojuszniczego lotnictwa",
    "Mieszkańcy dostali powiadomienie o zagrożeniu atakiem z powietrza",
]:
    sprawdz(poziom(tekst) == "critical", f"critical: {tekst}")

print("2. B/C: słabe frazy, odmiany i nagłówek „alert RCB”")
for tekst, oczek in [
    ("W Zamościu syreny wyły przez kilka minut", "weak"),
    ("Mieszkańcy usłyszeli syreny w nocy", "weak"),
    ("Zgłoszenia o wybuchach pod Hrubieszowem", "weak"),
    ("Lotnisko w Rzeszowie wstrzymało operacje", "weak"),
    ("Dron eksplodował na polu", "weak"),
    ("Alert RCB dla Lubelszczyzny. Zagrożenie dronami", "weak"),
    ("Alert RCB: woda niezdatna do spożycia", None),
    ("Syreny w gminie działają poprawnie", None),
]:
    sprawdz(poziom(tekst) == oczek, f"{oczek}: {tekst} -> {poziom(tekst)}")

print("3. D: zaprzeczenia, pomyłki, testy, czas przyszły")
for tekst in [
    "Syreny nie zawyły, choć drony leciały nad granicą",
    "Fałszywy alarm powietrzny w Chełmie",
    "Prokuratura umorzyła śledztwo w sprawie drona. Umorzono postępowanie",
    "Radar wykrył ptaki zamiast dronów",
    "Testy syren alarmowych w Lublinie",
    "Jutro zawyją syreny w całym województwie",
    "Myśliwce będą latać nad Rzeszowem, wojsko uprzedza",
    "Mieszkańcy dostaną alert RCB o atakach dronów",
]:
    sprawdz(poziom(tekst) is None, f"weto: {tekst} -> {poziom(tekst)}")

print("4. E: „niespokojna noc” to już nie weto")
sprawdz(poziom("Niespokojna noc na Lubelszczyźnie. Zawyły syreny") == "critical",
        "podsumowanie z frazą krytyczną zostaje krytyczne")

print("5. F: miejsca, które nie umiejscawiają zdarzenia")
for tekst, oczek in [
    ("Pociąg Kijów–Warszawa opóźniony po ataku dronów", []),
    ("Loty do Warszawy wstrzymane, rakiety nad Lwowem", []),
    ("Samolot z Warszawy zawrócił, alarm powietrzny", []),
    ("Dron nad Warszawą, wojsko poderwało myśliwce", ["mazowieckie"]),
    ("Syreny w Chełmie i w Warszawie", ["lubelskie", "mazowieckie"]),
]:
    got = rss_media._match_voivs(rss_media._neutralize_places(tekst))
    sprawdz(got == oczek, f"{tekst} -> {got}")
sprawdz(rss_media._title_publisher("Zawyły syreny - Kurier Lubelski") == "Kurier Lubelski",
        "redakcja z dopisku tytułu Google News")
sprawdz(rss_media._match_voivs(rss_media._strip_publisher(
    "Rumunia: dron spadł - Radio Szczecin", "Radio Szczecin")) == [],
        "nazwa redakcji nie daje regionu")

print("6. odwołanie bez frazy alarmowej")
sprawdz(rss_media._clear_in_context("DORSZ: zakończono operowanie lotnictwa"),
        "„zakończono operowanie lotnictwa” wygasza")
sprawdz(rss_media._clear_in_context("Odwołano alert RCB dla Podkarpacia"),
        "„odwołano alert RCB” wygasza")
sprawdz(not rss_media._clear_in_context("Koniec objazdu na DK17. Zakończono działania drogowców"),
        "odwołanie bez kontekstu powietrznego nie wygasza")

print("7. fala QRA: grupy")
for tekst, oczek in [
    ("Polska poderwała myśliwce po ataku na Ukrainie", "east"),
    ("Rosyjski samolot 30 km od Łeby. Poderwano myśliwce", "north"),
    ("Myśliwce poderwane nad Bałtykiem koło Kaliningradu", "north"),
    ("Węgry poderwały myśliwce", "foreign"),
    ("NATO poderwało myśliwce nad Litwą. Polskie F-35 w akcji", "foreign"),
    ("Korea Południowa poderwała myśliwce", "foreign"),
    ("Poderwano myśliwce w Rumunii", "foreign"),
    # 15.09.2026: bez słowa o kraju, a chodziło o Litwę
    ("Pilne. NATO poderwało myśliwce i otworzyło ogień. Myśliwce zestrzeliły obcą maszynę", "foreign"),
    ("Atak Rosji na Ukrainę. Poderwano polskie lotnictwo", "east"),
    ("NATO i polskie myśliwce poderwane w nocy nad Lubelszczyzną", "east"),
]:
    sprawdz(rss_media._qra_group(tekst) == oczek, f"{oczek}: {tekst} -> {rss_media._qra_group(tekst)}")

wywolania = []


_klucze = set()


async def _ingest(**kw):
    if kw["dedup_key"] in _klucze:
        return False
    _klucze.add(kw["dedup_key"])
    wywolania.append(kw)
    return True

fusion.ingest = _ingest


def reset():
    rss_media._qra_articles.clear()
    rss_media._qra_last_wave.clear()
    rss_media._qra_restored = True
    wywolania.clear()


def art(title, publisher, minutes_ago, now, link=None):
    rss_media._qra_observe(title, title, publisher, link or f"https://x/{publisher}/{title}",
                           "feed", now - minutes_ago * 60, now)


def fala(now):
    return asyncio.run(rss_media._qra_evaluate(now))


print("8. fala QRA: decyzje")
now = time.time()
reset()
art("Polska poderwała myśliwce", "Onet", 10, now)
sprawdz(fala(now) == [] and not wywolania, "jedna redakcja = nic")
art("Wojsko poderwało myśliwce, operuje lotnictwo", "Onet Wiadomości", 5, now)
sprawdz(fala(now) == [], "ta sama redakcja pod dwoma adresami to nadal jedna")
art("DORSZ: poderwano myśliwce", "Interia", 3, now)
waves = fala(now)
sprawdz(len(waves) == 1 and waves[0]["group"] == "east", "dwie redakcje w 30 min = fala wschodnia")
sprawdz(sorted(w["voivodeship"] for w in wywolania) == ["lubelskie", "podkarpackie"],
        f"punkty dla lubelskiego i podkarpackiego ({[w['voivodeship'] for w in wywolania]})")
sprawdz(all(w["points"] == 1.0 and w["event_type"] == "media_qra_wave" for w in wywolania),
        "sygnał mediów 1,0")
sprawdz("potwierdziły 2 redakcje" in (wywolania[0]["title"] if wywolania else ""),
        "tytuł z liczbą redakcji")
art("Kolejne myśliwce poderwane", "RMF FM", 1, now + 600)
wywolania.clear()
sprawdz(fala(now + 600) == [] and not wywolania, "karencja 3 h: kolejne artykuły nie dają drugiej fali")

reset()
art("Polska poderwała myśliwce", "Onet", 40, now)
art("Wojsko poderwało myśliwce", "Interia", 35, now)
sprawdz(fala(now) == [], "artykuły starsze niż 30 min nie tworzą fali")

reset()
art("Polska poderwała myśliwce", "Onet", 20, now)
art("Wojsko poderwało myśliwce", "Interia", 15, now)
art("DORSZ: zakończono operowanie lotnictwa, poderwane myśliwce wróciły", "TVN24", 5, now)
sprawdz(fala(now) == [], "odwołanie nowsze niż fala blokuje ją")

reset()
art("Węgry poderwały myśliwce", "Onet", 10, now)
art("Węgry poderwały myśliwce nad Balatonem", "Interia", 8, now)
waves = fala(now)
sprawdz(len(waves) == 1 and waves[0]["group"] == "foreign" and not wywolania,
        "fala zagraniczna tylko w dzienniku, bez punktów")

reset()
art("Rosyjski samolot przy Łebie, poderwano myśliwce", "Onet", 10, now)
art("Poderwane myśliwce nad Bałtykiem", "Trojmiasto.pl", 8, now)
waves = fala(now)
sprawdz(sorted(w["voivodeship"] for w in wywolania) ==
        sorted(config.QRA_WAVE_TARGETS["north"]), "Bałtyk = sygnał dla północy")

reset()
art("Ćwiczenia: poderwano myśliwce", "Onet", 10, now)
art("Ćwiczenia NATO, poderwały myśliwce", "Interia", 8, now)
sprawdz(fala(now) == [], "ćwiczenia (twarde weto) nie tworzą fali")

print("9. dziennik stealth")
sprawdz(len(stealth.query("qra_article", 600)) >= 10, "artykuły QRA zapisane (także zagraniczne)")
sprawdz(any(w.get("group") == "foreign" for w in stealth.query("qra_wave", 600)),
        "fala zagraniczna zapisana")
rss_media._qra_last_wave.clear()
rss_media._qra_restored = False
rss_media._qra_restore()
sprawdz("east" in rss_media._qra_last_wave, "karencja odtworzona z dziennika po restarcie")

samoloty = [
    {"hex": "ae01ce", "t": "K35R", "flight": "QID21", "lat": 51.0, "lon": 20.0},
    {"hex": "43c6f1", "t": "A332", "flight": "RRR9961", "lat": 54.0, "lon": 18.0},
    {"hex": "4d03d1", "t": "E3TF", "flight": "NATO01", "lat": 52.0, "lon": 14.0},
    {"hex": "ae1234", "t": "K35R", "flight": "QID99", "lat": 36.0, "lon": -80.0},   # USA
    {"hex": "3c1111", "t": "F16", "flight": "VIPER1", "lat": 51.0, "lon": 22.0},    # myśliwiec
]
t0 = time.time()
sprawdz(stealth.observe_air_support(samoloty, t0) == 3, "tankowce/AWACS w regionie, bez USA i myśliwców")
sprawdz(stealth.observe_air_support(samoloty, t0 + 60) == 0, "próbka co 5 min na maszynę")
sprawdz(stealth.observe_air_support(samoloty, t0 + 301) == 3, "po 5 min kolejna próbka trasy")
podsum = stealth.air_support_summary(90)
sprawdz(podsum.get("tanker") == 2 and podsum.get("awacs") == 1, f"podsumowanie ról {podsum}")

print("10. G: gov.pl RCB czyta wszystkie linki i nie punktuje")
menu = "".join(f'<a href="/web/rcb/pozycja-menu-{i:02d}">Pozycja menu numer {i}</a>' for i in range(30))
alert = '<a href="/web/rcb/alert-rcb---zagrozenie-atakiem-z-powietrza-13010">Alert RCB - zagrożenie atakiem z powietrza (13.09)</a>'
trening = '<a href="/web/rcb/alert-rcb---trening-systemu-alarmowania">Alert RCB - trening systemu alarmowania z wykorzystaniem syren</a>'


class _Resp:
    text = menu + alert + trening

    def raise_for_status(self):
        pass


class _Client:
    async def get(self, *a, **k):
        return _Resp()


zapisy, odniesienia = [], []
def _add_signal(*a, **k):
    # ta sama tabela co fusion.ingest: klucz deduplikacji wspólny
    zapisy.append(a)
    if a[-1] in _klucze:
        return False
    _klucze.add(a[-1])
    return True


rcb.fusion.db.add_signal = _add_signal
rcb.rcb_reference.capture = lambda **k: odniesienia.append(k)
wywolania.clear()
rcb._seen_bootstrap = False
asyncio.run(rcb._check(_Client()))
sprawdz(len(odniesienia) == 1 and "atakiem" in odniesienia[0]["title"],
        "alert z pozycji 31+ zauważony przy starcie, trening pominięty")
asyncio.run(rcb._check(_Client()))
sprawdz(not wywolania, "istniejący wpis nie daje sygnału drugi raz po starcie")
_Resp.text = menu + alert.replace("13010", "14010").replace("(13.09)", "(14.09)")
asyncio.run(rcb._check(_Client()))
sprawdz(wywolania and all(w["points"] == 0.0 and w["event_type"] == "rcb_govpl" for w in wywolania),
        f"nowy alert gov.pl = 0 pkt, punkt odniesienia ({[(w['event_type'], w['points']) for w in wywolania]})")

stealth._conn and stealth._conn.close()
if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - E3: media, fala QRA, gov.pl RCB i dziennik stealth")

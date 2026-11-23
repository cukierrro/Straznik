# -*- coding: utf-8 -*-
"""Czytanie całego artykułu przed przyznaniem punktów za media (13.09.2026).

Przypadki pochodzą z dzisiejszych artykułów: tytuły wyglądały na bieżące
meldunki, a pierwszy akapit mówił o syrenach „przed godziną 4 rano".

Uruchomienie:  py scripts/test_article_reader.py
"""
import asyncio
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import article_reader as ar, fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


W = ar.WARSAW

print("1. treść i data ze strony")
STRONA = """<html><head>
<script type="application/ld+json">{"@type":"Organization","datePublished":"2013-02-09"}</script>
<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-13T09:46:16+02:00"}</script>
</head><body><nav><p>Menu portalu z długą listą działów, która nie jest treścią artykułu.</p></nav>
<p>You are using an outdated browser. Please upgrade your browser to improve your experience.</p>
<div class="entry-content">
<p>Przed świtem mieszkańców Lubelszczyzny postawiły na nogi syreny alarmowe i alert RCB.</p>
<p>Przed godziną 4 rano mieszkańcy województw lubelskiego i podkarpackiego otrzymali alert RCB.</p>
<p>Tymczasem tym razem zagrożenie istniało i zostało wcześniej wykryte przez wojsko.</p>
</div><footer><p>Wszelkie prawa zastrzeżone. Kopiowanie treści bez zgody zabronione.</p></footer></body></html>"""
paras, pub = ar.extract(STRONA)
ok(len(paras) >= 3 and paras[0].startswith("Przed świtem"), f"akapity z treści ({len(paras)})")
ok(pub == "2026-09-13T09:46:16+02:00", f"data z godziną, nie data założenia portalu ({pub})")
ok(not any("Wszelkie prawa" in p for p in paras), "stopka odrzucona")

print("2. ocena: świeże czy relacja z wcześniejszego zdarzenia")
o9 = datetime(2026, 9, 13, 9, 46, tzinfo=W)
PRZYPADKI = [
    (["Przed godziną 4 rano mieszkańcy otrzymali alert RCB."], o9, "past"),
    (["O godz. 4.19 Dowództwo Operacyjne poinformowało o operowaniu lotnictwa."],
     datetime(2026, 9, 13, 7, 1, tzinfo=W), "past"),
    (["Zagrożenie atakiem z powietrza – w środku nocy zawyły syreny w powiecie."], o9, "past"),
    (["Wczoraj wieczorem nad powiatem przeleciał dron."], o9, "past"),
    (["W sobotę rano zawyły syreny."], o9, "past"),                       # 13.09 to niedziela
    (["Około 5:00 zawyły syreny, trwa sprawdzanie."], datetime(2026, 9, 13, 5, 46, tzinfo=W), "fresh"),
    (["Trwa alarm powietrzny, syreny właśnie zawyły."], o9, "fresh"),
    (["Rosyjski dron uderzył w lokomotywę pociągu 2 km od granicy."], o9, "fresh"),
    (["W niedzielę o 9:30 zawyły syreny w Chełmie."], o9, "fresh"),
    (["Dron spadł 13.09.2026 pod Hrubieszowem."], o9, "fresh"),           # data nie jest godziną
]
for tekst, kiedy, oczek in PRZYPADKI:
    got, why = ar.assess(tekst, kiedy)
    ok(got == oczek, f"{tekst[0][:58]:58} → {got} ({why})")

print("2a. daty, „ubiegły / zeszły / ostatni” i zapowiedzi (zgłoszenie usera 23.11.2026)")
pn = datetime(2026, 11, 23, 7, 45, tzinfo=W)          # poniedziałek, godzina artykułu Radia Lublin
pn9 = datetime(2026, 11, 23, 9, 0, tzinfo=W)
sob = datetime(2026, 11, 21, 10, 0, tzinfo=W)
DACHOWICZ = ["Gościem Radia Lublin będzie polski wojskowy, były żołnierz wojsk specjalnych oraz autor "
             "analiz i komentarzy dotyczących bezpieczeństwa i wojskowości pułkownik dr Dariusz "
             "Dachowicz, z którym Wojciech Brakowiecki porozmawia na temat wojny, wybuchów rosyjskich "
             "dronów i rakiet na terenie Polski.", "Zapraszamy po godz. 8:15."]
PRZYPADKI_2A = [
    # zapowiedź audycji — artykuł z 23.11.2026, bez daty i bez godziny w przeszłości
    (DACHOWICZ, pn, "past"),
    (["Zapraszamy po godz. 9:10 na rozmowę o bezpieczeństwie i dronach."], pn, "past"),
    # data w treści inna niż dzień publikacji
    (["21 listopada nad powiatem hrubieszowskim przeleciał rosyjski dron."], pn, "past"),
    (["Szczątki drona znaleziono 21.11.2026 pod Chełmem."], pn, "past"),
    (["Dron spadł 23 listopada pod Hrubieszowem, trwa sprawdzanie."], pn, "fresh"),
    (["Od 24 lutego 2022 roku Rosja atakuje Ukrainę. Rosyjski dron spadł pod Hrubieszowem."], pn, "fresh"),
    (["Szkolenie zaplanowano na 30 listopada. Rosyjski dron spadł pod Hrubieszowem."], pn, "fresh"),
    # przymiotniki dni tygodnia
    (["Po piątkowym ataku dronów służby przeszukują pola."], pn, "past"),
    (["Sobotni alarm: wojsko podsumowuje działania."], pn, "past"),
    (["Niedzielnym wieczorem nad Lubelszczyzną krążył dron."], pn, "past"),
    (["Sobotni alarm w Chełmie: dron nad miastem."], sob, "fresh"),          # ten sam dzień
    (["Dron spadł przy obszarze cennym dla środowiska, służby na miejscu."], pn, "fresh"),
    # „ubiegły / zeszły / miniony / ostatni / poprzedni” przy dniu, tygodniu, dobie
    (["W ubiegły piątek nad powiatem przeleciał dron."], pn, "past"),
    (["W zeszłą sobotę zawyły syreny w Zamościu."], pn, "past"),
    (["W ostatni weekend nad Lubelszczyzną krążyły drony."], pn, "past"),
    (["W minionym tygodniu odnotowano trzy naruszenia przestrzeni."], pn, "past"),
    (["W ciągu ostatniej doby Straż Graniczna odnotowała drony przy granicy."], pn, "past"),
    (["Poprzedniego dnia nad powiatem krążył dron."], pn, "past"),
    (["Przedwczoraj nad Chełmem przeleciał dron."], pn, "past"),
    (["Trzy dni temu dron spadł w polu pod Hrubieszowem."], pn, "past"),
    (["Ubiegłej nocy nad Lubelszczyzną operowało lotnictwo."], pn9, "past"),
    (["Ubiegłej nocy nad Lubelszczyzną operowało lotnictwo."], pn, "fresh"),   # 7:45 — noc przed chwilą
    (["Poprzedniej nocy nad Lubelszczyzną operowało lotnictwo."], pn, "past"),
    # kontrola: bieżące meldunki dalej świeże
    (["Lotnisko w Rzeszowie zamknięte do godz. 10:00, poderwano myśliwce."], pn, "fresh"),
    (["Rosyjski dron spadł pod Hrubieszowem. Ostatnie informacje: służby na miejscu."], pn, "fresh"),
]
for tekst, kiedy, oczek in PRZYPADKI_2A:
    got, why = ar.assess(tekst, kiedy)
    ok(got == oczek, f"{tekst[0][:58]:58} → {got} ({why})")

print("3. dopasowanie tytułu Google News do kanału redakcji")
ok(ar._similar(ar._title_key("Niespokojny poranek na Lubelszczyźnie. Syreny, alerty - Dziennik Wschodni",
                             "Dziennik Wschodni"),
               ar._title_key("Niespokojny poranek na Lubelszczyźnie. Syreny, alerty")),
   "ten sam tytuł bez dopisku redakcji")
ok(not ar._similar(ar._title_key("Dron spadł pod Chełmem", ""), ar._title_key("Nowy basen w Chełmie")),
   "różne tytuły się nie łączą")

print("4. Google News bez kanału redakcji: nieczytelny, bez punktów")


class Pusty:
    async def get(self, *_a, **_k):
        return types.SimpleNamespace(status_code=404, content=b"", text="")


ar._cache.clear()
wynik = asyncio.run(ar.read_article(Pusty(), "https://news.google.com/rss/articles/XYZ?oc=5",
                                    "Alarm powietrzny - Kurier Lubelski", "Kurier Lubelski",
                                    "https://kurierlubelski.pl", datetime.now(timezone.utc)))
ok(wynik["status"] == "unreadable", f"status {wynik['status']}: {wynik['reason']}")

print("5. fuzja")
REF = datetime(2026, 9, 13, 8, 0, tzinfo=timezone.utc)


def media(sid, article=None):
    d = {"link": f"https://example.test/{sid}"}
    if article:
        d["article"] = article
    return {"id": sid, "ts": "2026-09-13T07:50:00+00:00", "source": "media",
            "event_type": "media_keywords", "voivodeship": "lubelskie", "points": 1.0,
            "title": f"Media: artykuł {sid}", "details": d}


for art, oczek, opis in (
        ({"status": "fresh"}, 1.0, "przeczytany i świeży → punkty"),
        ({"status": "past", "reason": "zdarzenie ok. godz. 4:00"}, 0.0, "relacja z wcześniejszego zdarzenia → 0"),
        ({"status": "unreadable"}, 0.0, "nieprzeczytany → 0"),
        (None, 1.0, "wpis sprzed czytnika (bez pola article) liczy się jak dotąd")):
    st = fusion.accumulate([media(1, art)], REF)["lubelskie"]
    ok(st["score"] == oczek, f"{opis} ({st['score']})")
st = fusion.accumulate([media(2, {"status": "unreadable"})], REF)["lubelskie"]
ok(st["signals"][0].get("article_status") == "unreadable" and st["signals"][0]["counted_points"] == 0,
   "wpis zostaje w panelu z oznaczeniem")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - czytanie artykułów przed przyznaniem punktów")

# -*- coding: utf-8 -*-
"""Alarmy powietrzne na Litwie, Łotwie i w Estonii (13.09.2026).

Tego dnia ok. 13:08 czasu litewskiego ogłoszono „tikėtinas oro pavojus” dla
Wilna, Trok i Elektrėnai, odwołany o 13:43. Strażnik nie zanotował nic, bo
kanał delfi.lt zwracał same nazwy działów. Scenariusz poniżej odtwarza to, co
podały LRT i 15min: LRT zmienia tytuł TEGO SAMEGO artykułu na „(balta)”.

Uruchomienie:  py scripts/test_baltic_alerts.py
Z --live pobiera prawdziwe kanały i pokazuje, co kolektor by z nich wziął.
"""
import asyncio
import calendar
import sys
import time
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import config, fusion  # noqa: E402
from app.collectors import rss_media as rm  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


zapis = []


async def fake_ingest(**kw):
    zapis.append(kw)


fusion.ingest = fake_ingest
T0 = calendar.timegm((2026, 9, 13, 10, 8, 0, 0, 0, 0))   # 13:08 w Wilnie


def wpis(tytul, link, minut_po=0):
    return {"title": tytul, "summary": "", "link": link,
            "published_parsed": time.gmtime(T0 + minut_po * 60)}


def reset():
    zapis.clear()
    rm._baltic_active.clear()
    rm._baltic_clears_seen.clear()
    rm._baltic_alerted.clear()


LRT = "https://www.lrt.lt/naujienos/lietuvoje/2/2936222/"
M15 = "https://www.15min.lt/naujiena/aktualu/lietuva/oro-pavojus-56-2412345"

print("1. ogłoszenie w LRT")
reset()
asyncio.run(rm._baltic_entries([wpis("Vilniaus, Trakų, Elektrėnų rajonuose paskelbtas tikėtinas oro pavojus (geltona)",
                                     LRT + "vilniaus-paskelbtas-oro-pavojus")], "lrt", "LT", T0 + 120))
pkt = {z["voivodeship"]: z["points"] for z in zapis if z["event_type"] == "baltic_alert"}
ok(pkt.get("podlaskie") == 0.3, f"podlaskie 0,3 pkt ({pkt.get('podlaskie')})")
ok(pkt.get("zachodniopomorskie") == 0.15, f"zachodniopomorskie połowa ({pkt.get('zachodniopomorskie')})")
ok(not any(z["event_type"] == "baltic_context" for z in zapis), "to alarm, nie incydent za 1,0")
ok(zapis[0]["title"].startswith("Alarm powietrzny — Litwa"), zapis[0]["title"][:60])

print("2. to samo z 15min nie dubluje")
n = len(zapis)
asyncio.run(rm._baltic_entries([wpis("Vilniaus apskrityje skelbiamas oro pavojus", M15, 4)], "15min", "LT", T0 + 300))
ok(len(zapis) == n, "druga redakcja pominięta")

print("3. odwołanie w 15min gasi alarm z LRT")
asyncio.run(rm._baltic_entries([wpis("Oro pavojus atšauktas", M15 + "-atsauktas", 7)], "15min", "LT", T0 + 600))
klucze = {z["details"]["incident_key"] for z in zapis if z["event_type"] == "baltic_clear"}
ok(any("2936222" in k for k in klucze), f"odwołanie niesie klucz LRT ({sorted(klucze)})")
sygnaly = [{"source": "media", "event_type": z["event_type"], "voivodeship": z["voivodeship"],
            "points": z["points"], "title": z["title"], "details": z["details"],
            "ts": "2026-09-13T10:10:00+00:00" if z["event_type"] == "baltic_alert" else "2026-09-13T10:18:00+00:00"}
           for z in zapis]
from datetime import datetime, timezone  # noqa: E402
st = fusion.accumulate(sygnaly, datetime(2026, 9, 13, 10, 20, tzinfo=timezone.utc))
ok(st["podlaskie"]["score"] == 0, f"po odwołaniu podlaskie 0 ({st['podlaskie']['score']})")

print("4. stare „(balta)” nie gasi nowego alarmu godzinę później")
reset()
stary = wpis("Lietuvoje oro pavojaus nebėra (balta)", LRT + "oro-pavojaus-nebera")
asyncio.run(rm._baltic_entries([stary], "lrt", "LT", T0 + 2100))
NOWY = "https://www.lrt.lt/naujienos/lietuvoje/2/2940000/"
asyncio.run(rm._baltic_entries([stary, wpis("Kaune paskelbtas oro pavojus (geltona)", NOWY + "kaune", 70)],
                               "lrt", "LT", T0 + 4300))
asyncio.run(rm._baltic_entries([stary], "lrt", "LT", T0 + 4400))
ok("LT" in rm._baltic_active and "2940000" in rm._baltic_active["LT"]["incident_key"],
   "nowy alarm nadal aktywny")

print("5. Estonia i Łotwa ważą mniej")
reset()
asyncio.run(rm._baltic_entries([wpis("Kagu-Eestis anti õhuohu hoiatus", "https://www.err.ee/1610124752/x")],
                               "err", "EE", T0 + 60))
asyncio.run(rm._baltic_entries([wpis("Izsludināts iespējamais gaisa telpas apdraudējums Ludzas novadā",
                                     "https://www.lsm.lv/raksts/x.a661155/")], "lsm", "LV", T0 + 60))
pkt = {(z["details"]["country"], z["voivodeship"]): z["points"] for z in zapis}
ok(pkt.get(("EE", "podlaskie")) == 0.12, f"Estonia 0,12 ({pkt.get(('EE', 'podlaskie'))})")
ok(pkt.get(("LV", "podlaskie")) == 0.18, f"Łotwa 0,18 ({pkt.get(('LV', 'podlaskie'))})")

print("6. odwołanie musi dotyczyć powietrza")
ok(not rm._is_baltic_clear("second round of latvia's affordable housing programme cancelled"),
   "program mieszkaniowy odwołany — nie odwołanie alarmu")
ok(rm._is_baltic_clear("airspace alert over in latvia's alūksne district"), "alarm LV zakończony")
ok(rm._is_baltic_clear("lietuvoje oro pavojaus nebėra (balta)"), "LT (balta)")

print("6b. relacja po fakcie i odwołanie bez alarmu nie zostawiają śladu")
reset()
asyncio.run(rm._baltic_entries([
    wpis("Dėl paskelbto geltono oro pavojaus buvo stabdomi skrydžiai Vilniaus oro uoste", M15 + "-skrydziai", 27),
    wpis("Lietuvoje oro pavojaus nebėra (balta)", LRT + "oro-pavojaus-nebera")], "15min", "LT", T0 + 1800))
ok(not zapis, f"„buvo stabdomi” to nie alarm, a odwołanie bez alarmu nie dodaje wierszy ({len(zapis)})")

print("7. incydent nadal za 1,0 (strefa PAŻP + Bałtyk = żółty na wybrzeżu)")
reset()
asyncio.run(rm._baltic_entries([wpis("Drone that was shot down in Latvia entered from Belarus",
                                     "https://eng.lsm.lv/article/x.a650000/")], "lsm", "LV", T0 + 60))
ok(any(z["event_type"] == "baltic_context" and z["points"] == 1.0 for z in zapis), "incydent 1,0")


class Odp:
    def __init__(self, tresc):
        self.content = tresc


print("8. kanał bez artykułów to nie „ok”")
rm._get_with_retry = lambda *_a, **_k: asyncio.sleep(0, result=(Odp(b"<rss><channel><item><title>Dienos naujienos</title></item></channel></rss>"), None))
asyncio.run(rm._check_baltic_feed(None, "https://dead.example/rss", "LT"))
ok(rm.status["feeds"]["https://dead.example/rss"]["ok"] is False, "delfi-podobny kanał = nie działa")

if "--live" in sys.argv:
    import httpx
    import feedparser
    print("\nNA ŻYWO (okno 6 h wstecz):")
    for url, c in config.BALTIC_FEEDS:
        r = httpx.get(url, headers={"User-Agent": rm.UA}, follow_redirects=True, timeout=20)
        f = feedparser.parse(r.content)
        print(f"  {c} {url}: HTTP {r.status_code}, {len(f.entries)} wpisów")
        for e in f.entries[:60]:
            t = (e.get("title", "") + " " + e.get("summary", "")).lower()
            kind = "ODWOŁANIE" if rm._is_baltic_clear(t) else ("ALARM" if rm._is_baltic_alert(t) else None)
            p = e.get("published_parsed")
            if kind and p and time.time() - calendar.timegm(p) < 6 * 3600:
                print(f"    {kind:10} {time.strftime('%H:%M', p)} UTC  {e.get('title', '')[:90]}")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - alarmy powietrzne LT/LV/EE")

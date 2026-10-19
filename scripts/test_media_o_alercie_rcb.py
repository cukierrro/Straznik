# -*- coding: utf-8 -*-
"""Artykuł O ALERCIE RCB nie daje drugich punktów (19.10.2026, decyzja usera).

Sugestia czytelnika: gdy pojawia się alert RCB, media mówiące o tym samym alercie
sztucznie podbijają punktację — alert jest już policzony. Reguła z 21–23.09 łapała
tylko tytuł z „alert RCB” w tej kolejności i podobieństwo słów, więc przechodziły:
„RCB: alert dla województwa lubelskiego i podkarpackiego” (19.10, po 1,0 pkt
w obu), „„Atak powietrzny na terenie Ukrainy”. Alert dla Lubelkiego”, „„Sytuacja
jest monitorowana”. Alert dla mieszkańców…” — także w INNYCH województwach
(relacja o lubelskim trafiała do podkarpackiego i opolskiego).

Reguła:
1. Artykuł, który mówi o alercie RCB (nazywa RCB, „alert dla…”, cytuje alert),
   dostaje 0 pkt, jeśli alert RCB/RSO był w DOWOLNYM województwie do 240 min przed
   nim albo do 30 min po nim.
2. Artykuł o końcu zagrożenia („brak zagrożenia”, „zakończono poszukiwania”) — 0 pkt zawsze.
3. Punkty zostają artykułom z informacją ponad alert: dron nad Polską, naruszenie,
   wleciał, zestrzelony, eksplozja, spadł, szczątki, syreny, poszukiwania, niezidentyfikowany obiekt.
Tytuły poniżej to prawdziwe tytuły z bazy (11–19.10.2026). Lustro: test_media_o_alercie_rcb.cjs.

Uruchomienie: python scripts/test_media_o_alercie_rcb.py
"""
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
_dotenv = types.ModuleType("dotenv"); _dotenv.load_dotenv = lambda *a, **k: None
sys.modules.setdefault("dotenv", _dotenv)
from app import fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

ALERT_T = datetime(2026, 10, 19, 4, 31, tzinfo=timezone.utc)
ALERT = {"id": 1, "ts": ALERT_T.isoformat(), "source": "rcb", "event_type": "rso_alert",
         "voivodeship": "lubelskie", "points": 1.5,
         "title": "Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.”",
         "details": {"rso_id": "23430000"}}

ECHA = [   # o alercie, bez informacji ponad niego → 0 pkt
    "RCB: alert dla województwa lubelskiego i podkarpackiego",
    "„Atak powietrzny na terenie Ukrainy”. Alert dla Lubelkiego",
    "„Sytuacja jest monitorowana”. Alert dla mieszkańców województwa lubelskiego",
    "Alert RCB dla województwa lubelskiego",
    "Rosyjski atak na Ukrainę. Alert RCB i ograniczenia na lotniskach w Polsce",
    "Alert RCB na Podkarpaciu. Lotniska w Rzeszowie i Lublinie wstrzymują operacje",
]
NOWE = [   # informacja ponad alert albo bez związku z RCB → liczy się
    "Niezidentyfikowany obiekt na południe od Lublina. Sprawę bada wojsko",
    "Podejrzenie naruszenia przestrzeni powietrznej. Żołnierze i policjanci prowadzą poszukiwania pod Lublinem",
    "Syreny w Lublinie. Alert RCB",
    "Drony nad Polską? Alert RCB dla lubelskiego",
    "Dowództwo Operacyjne: poderwano samoloty po atakach na zachodnią Ukrainę",
]
KONIEC = [   # o końcu zagrożenia → 0 pkt zawsze, także bez alertu
    "Wojsko zakończyło kolejne działania po ataku na Ukrainę. RCB: brak zagrożenia w Polsce",
    "Zakończono poszukiwania pod Lublinem. Wojsko przekazało wyniki działań",
]

bledy: list[str] = []


def ok(warunek: bool, opis: str) -> None:
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def art(tytul: str, voiv: str, minut_po_alercie: float, sid: int = 100) -> dict:
    return {"id": sid, "ts": (ALERT_T + timedelta(minutes=minut_po_alercie)).isoformat(),
            "source": "media", "event_type": "media_keywords", "voivodeship": voiv,
            "points": 1.0, "title": f"Media: „{tytul}”", "details": {"link": f"https://x.test/{sid}"}}


def punkty(sygnaly, voiv, ref_min, extra=None):
    ref = ALERT_T + timedelta(minutes=ref_min)
    st = fusion.accumulate(sygnaly, ref, officials_extra=extra)[voiv]
    return sum(s["counted_points"] for s in st["signals"] if s["source"] == "media")


print("1. Echa alertu — 0 pkt, także w innym województwie niż alert")
for i, t in enumerate(ECHA):
    ok(punkty([ALERT, art(t, "lubelskie", 20, 100 + i)], "lubelskie", 25) == 0, f"lubelskie: {t}")
    ok(punkty([ALERT, art(t, "opolskie", 20, 200 + i)], "opolskie", 25) == 0, f"opolskie: {t}")

print("\n2. Informacja ponad alert — liczy się")
for i, t in enumerate(NOWE):
    ok(punkty([ALERT, art(t, "lubelskie", 20, 300 + i)], "lubelskie", 25) > 0, t)

print("\n3. Koniec zagrożenia — 0 pkt także bez żadnego alertu")
for i, t in enumerate(KONIEC):
    ok(punkty([art(t, "lubelskie", 20, 400 + i)], "lubelskie", 25) == 0, t)

print("\n4. Okno czasu: 240 min przed artykułem, 30 min po nim")
echo = ECHA[0]
# alert sprzed okna fuzji podajemy jak serwer — jako officials_extra
ok(punkty([art(echo, "lubelskie", 200, 500)], "lubelskie", 205, [ALERT]) == 0,
   "alert 200 min wcześniej (spoza okna fuzji) — artykuł to echo")
ok(punkty([art(echo, "lubelskie", 245, 501)], "lubelskie", 250, [ALERT]) > 0,
   "alert 245 min wcześniej — za stary, artykuł liczy się")
ok(punkty([ALERT, art(echo, "lubelskie", -20, 502)], "lubelskie", 5) == 0,
   "artykuł 20 min PRZED odczytem alertu z RSO — echo")
ok(punkty([ALERT, art(echo, "lubelskie", -40, 503)], "lubelskie", 5) > 0,
   "artykuł 40 min przed alertem — nie jest echem")
ok(punkty([art(echo, "lubelskie", 20, 504)], "lubelskie", 25) > 0,
   "bez żadnego alertu RCB/RSO artykuł o alercie się liczy (RSO mogło nie zadziałać)")
przyszly = dict(ALERT, ts=(ALERT_T + timedelta(minutes=60)).isoformat())
ok(punkty([art(echo, "lubelskie", 40, 505)], "lubelskie", 45, [przyszly]) > 0,
   "alert z przyszłości względem chwili odtwarzania nie zeruje artykułu")

print("\n5. Echo jest widoczne w rozbiciu jako powtórzenie oficjalnego alertu")
st = fusion.accumulate([ALERT, art(ECHA[0], "lubelskie", 20, 600)], ALERT_T + timedelta(minutes=25))["lubelskie"]
m = next(s for s in st["signals"] if s["source"] == "media")
ok(m.get("duplicate_of_official") == "23430000", f"duplicate_of_official = {m.get('duplicate_of_official')}")
ok("powtórzenie oficjalnego alertu" in fusion.breakdown_text(st["signals"]), "opis w rozbiciu")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK — artykuł o alercie RCB bez nowej informacji nie daje drugich punktów")

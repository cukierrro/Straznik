# -*- coding: utf-8 -*-
"""Przeniesienia od sąsiadów i to, kiedy budzą telefon (13.09.2026).

Rano 13.09 lubelskie i podkarpackie podbijały się nawzajem: artykuł i alarm
obwodu rówieńskiego przypisane do OBU województw liczyły się w każdym w pełni
i jeszcze raz jako 40% przeniesienia od drugiego. Lubelskie dostało przez to
żółty i czerwony, a podkarpackie drugi czerwony po chwilowym spadku do 3,87.

Uruchomienie:  py scripts/test_przeniesienia.py
"""
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_a, **_k: None
sys.modules.setdefault("dotenv", dotenv_stub)
from app import fusion  # noqa: E402
sys.stdout.reconfigure(encoding="utf-8")

REF = datetime(2026, 9, 13, 5, 20, tzinfo=timezone.utc)


def sig(sid, voiv, source, points, details=None, ts="2026-09-13T05:10:00+00:00",
        event_type=None):
    return {"id": sid, "ts": ts, "source": source,
            "event_type": event_type or {"media": "media_keywords", "neptun": "neptun_threat",
                                         "ua_alert": "ua_alert_border", "rcb": "rso_alert"}[source],
            "voivodeship": voiv, "points": points, "title": f"sygnał {sid}",
            "details": details or {}}


def spill(state, target, src):
    return sum(s["counted_points"] for s in state[target]["signals"]
               if s["source"] == "spillover" and s["details"]["from"] == src)


bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


# ── 1. wspólne zdarzenie nie wraca przez przeniesienie ─────────────────────
link = {"link": "https://example.test/rcb-wyslalo-alerty"}
obwod = {"oblast": "Рівненська", "distance_km": 70}
wspolne = [
    sig(1, "lubelskie", "media", 1.0, link), sig(2, "podkarpackie", "media", 1.0, link),
    sig(3, "lubelskie", "ua_alert", 0.6, obwod), sig(4, "podkarpackie", "ua_alert", 0.6, obwod),
    sig(5, "podkarpackie", "neptun", 1.0, {"track_id": "a"}),
    sig(6, "lubelskie", "neptun", 0.5, {"track_id": "b"}),
]
st = fusion.compute_state(wspolne, REF)["voivodeships"]
# podkarpackie: 1,0 + 0,6 + 1,0 = 2,6; wspólne z lubelskim 1,6 → zostaje 1,0 < 2,0
ok(spill(st, "lubelskie", "podkarpackie") == 0,
   "artykuł i alarm obwodu obecne w obu województwach nie przechodzą drugi raz")
# świętokrzyskie nie ma tych zdarzeń, więc dostaje przeniesienie w całości
ok(spill(st, "świętokrzyskie", "podkarpackie") == 1.0,
   "województwo bez wspólnych zdarzeń dostaje pełne przeniesienie (2,6 × 0,4)")
ok(st["lubelskie"]["own_score"] == 2.1, "punkty własne bez zmian")

niezalezne = [sig(10, "podkarpackie", "neptun", 3.0, {"track_id": "c"}),
              sig(11, "lubelskie", "neptun", 0.5, {"track_id": "d"})]
st = fusion.compute_state(niezalezne, REF)["voivodeships"]
ok(spill(st, "lubelskie", "podkarpackie") == 1.2,
   "niezależne zdarzenie u sąsiada nadal się przenosi")
tytul = next(s["title"] for s in st["lubelskie"]["signals"] if s["source"] == "spillover")
ok("3.0 pkt" in tytul, f"tytuł przeniesienia z zaokrągleniem: {tytul}")

# ── 2. kiedy przeniesienie może budzić telefon ─────────────────────────────
A = fusion.alert_level
ok(A(0.0, 2.0) == "none", "świętokrzyskie 13.09: 0 własnych + 2,0 od dwóch sąsiadów → cisza")
ok(A(0.05, 2.5) == "none", "drobny własny sygnał nie otwiera już bramki")
ok(A(1.2, 4.5) == "elevated", "własne ≥ 1,0 + sąsiad → najwyżej żółty")
ok(A(2.1, 4.0) == "high", "własny żółty + sąsiad → może być czerwony")
ok(A(4.5, 4.5) == "high", "własny czerwony zawsze czerwony")
ok(A(2.0, 2.0) == "elevated", "sam alert RCB (2,0) nadal daje żółty")
ok(A(1.97, 1.97) == "elevated", "zaokrąglenie jak w wyniku: 1,97 → 2,0")

# ── 3. bez marginesu: poziom zawsze odpowiada punktom ───────────────────────
ok(A(3.87, 3.87, "high") == "elevated", "3,87 po czerwonym to żółty (powtórkę czerwonego wstrzyma cisza)")
ok(A(1.7, 1.7, "elevated") == "none", "lubelskie 13.09 11:30: 1,7 pkt po żółtym to już brak alarmu")

# ── 4. cicha powtórka i nowe mocne źródło ──────────────────────────────────
ostatnie = "2026-09-13T04:44:14+00:00"
artykul = [{"source": "media", "ts": "2026-09-13T05:02:22+00:00", "counted_points": 1.0, "points": 1.0}]
ok(not fusion._fresh_strong_signal(artykul, ostatnie),
   "artykuł o tym samym alercie nie przełamuje ciszy")
rcb = [{"source": "rcb", "ts": "2026-09-13T05:02:22+00:00", "counted_points": 2.0, "points": 2.0}]
ok(fusion._fresh_strong_signal(rcb, ostatnie), "nowy alert RCB przełamuje ciszę")
dron = [{"source": "neptun", "ts": "2026-09-13T05:02:22+00:00", "counted_points": 0.7, "points": 0.7}]
ok(not fusion._fresh_strong_signal(dron, ostatnie), "nowy obiekt NEPTUN nie przełamuje ciszy (atak = drony co minutę)")
stary = [{"source": "rcb", "ts": "2026-09-13T04:44:13+00:00", "counted_points": 2.0, "points": 2.0}]
ok(not fusion._fresh_strong_signal(stary, ostatnie), "alert sprzed powiadomienia się nie liczy")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - przeniesienia i bramka powiadomień")

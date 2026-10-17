# -*- coding: utf-8 -*-
"""Bułgaria, Finlandia, Norwegia: same media, tylko dziennik (16.10.2026).

Te trzy kraje wchodzą o krok ostrożniej niż szóstka z 03.10.2026: decyzja
filtra trafia do dziennika obserwacji, ale NIC nie idzie do fuzji — ani karta,
ani wpis w panelu, ani zero w historii. Aplikacja tych krajów jeszcze nie zna.

Pilnujemy tu czterech rzeczy:
1. nic z BG/FI/NO nie trafia do fuzji, nawet prawdziwe zdarzenie;
2. prawdziwe zdarzenie trafia do dziennika jako sygnał, a cudza przestrzeń
   i dyskusja po fakcie — nie;
3. słownictwo nowych języków NIE przecieka do Litwy, Łotwy i Estonii, które
   punktują (fińskie „drooni” to estoński dopełniacz od „droon”);
4. „norsk” ze wspólnej listy zagranicy nie wycina NRK piszącego o sobie.

Nagłówki oznaczone [prawdziwy] pochodzą z kanałów i komunikatów z podaną datą.
Oznaczone [ułożony] są złożone na wzór prawdziwych, bo zdarzenia danego typu
w tych krajach jeszcze nie było w kanałach, które czytamy.

Uruchomienie: python scripts/test_sasiedzi_dziennik.py
"""
from __future__ import annotations

import asyncio
import pathlib
import sys
import time
import types

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None))

from app import config                                   # noqa: E402
from app.collectors import rss_media as r                 # noqa: E402

fuzja: list[dict] = []
dziennik: list[dict] = []


async def _ingest(**kw):
    fuzja.append(kw)


def _record(kind, key, data, ts=None):
    dziennik.append(data)
    return True


r.fusion = types.SimpleNamespace(ingest=_ingest)
r.stealth = types.SimpleNamespace(record=_record)

bledy: list[str] = []


def sprawdz(opis: str, warunek: bool, szczegol: str = "") -> None:
    print(("OK   " if warunek else "ZLE  ") + opis + (" | " + szczegol if szczegol else ""))
    if not warunek:
        bledy.append(opis)


def przepusc(tytul: str, kraj: str, link: str) -> tuple[list[dict], list[dict]]:
    """Jeden świeży wpis przez kolektor; zwraca (fuzja, dziennik)."""
    fuzja.clear()
    dziennik.clear()
    r._baltic_active.clear()
    r._baltic_clears_seen.clear()
    r._baltic_alerted.clear()
    wpis = {"title": tytul, "summary": "", "link": link,
            "published_parsed": time.gmtime(time.time() - 300)}
    asyncio.run(r._baltic_entries([wpis], "test://kanal", kraj, time.time()))
    return list(fuzja), list(dziennik)


def sygnal(dz: list[dict]) -> bool:
    return any(d["decision"] == "signal" for d in dz)


# ── 1. Prawdziwe zdarzenie: do dziennika jako sygnał, do fuzji nic ───────────
ZDARZENIA = [
    # [prawdziwy] armymedia.bg, 08.08.2026 — bez nazwy kraju, „nasza przestrzeń”
    ("Дрон навлезе във въздушното ни пространство край Кардам", "BG"),
    # [prawdziwy] defmin.fi, 03.05.2026
    ("Epäilty ilmatilaloukkaus Virolahdella", "FI"),
    # [prawdziwy] defmin.fi, 03.05.2026 (zajawka)
    ("Miehittämättömän lennokin epäillään loukanneen Suomen ilmatilaa Itä-Suomessa", "FI"),
    # [ułożony] — sprawdza, że „norsk” nie jest dla NRK zagranicą
    ("Russisk drone krenket norsk luftrom ved Kirkenes", "NO"),
]
for i, (tytul, kraj) in enumerate(ZDARZENIA):
    fz, dz = przepusc(tytul, kraj, f"https://przyklad.test/zdarzenie-{i}")
    sprawdz(f"[{kraj}] zdarzenie jest sygnalem w dzienniku: {tytul[:50]}…", sygnal(dz),
            str([(d["decision"], d["reason"]) for d in dz]))
    sprawdz(f"[{kraj}] zdarzenie NIE idzie do fuzji", fz == [], f"wpisow: {len(fz)}")
    sprawdz(f"[{kraj}] dziennik zapisuje kraj", {d["country"] for d in dz} == {kraj},
            str({d["country"] for d in dz}))

# ── 2. Cudza przestrzeń, dyskusja, test systemu: nie sygnał ─────────────────
NIE_SYGNAL = [
    # [prawdziwy] 24chasa.bg, 16.10.2026 — ten sam błąd, co Rijad→Litwa 19.09
    ("Саудитска Арабия прехвана ракети и дронове над Рияд", "BG"),
    # [prawdziwy] bntnews.bg, 16.10.2026 — Konstanca to Rumunia
    ("Кой е виновен – Русия, кой друг? – хората в Констанца за ударите с дронове "
     "в Черно море", "BG"),
    # [prawdziwy] dnevnik.bg, 16.10.2026 — śledztwo po fakcie
    ("Военната прокуратура ще разследва удара с дронове по кораба \"Челси 3\"", "BG"),
    # [prawdziwy] bntnews.bg, 01.06.2026 — zapowiedź testu systemu
    ("Тестват системата BG-ALERT на 2 юни", "BG"),
    # [prawdziwy] aftenposten.no, 16.10.2026
    ("Hundretusener av ukrainere har mistet strømmen etter russiske droneangrep", "NO"),
    # [prawdziwy] nrk.no, 16.10.2026
    ("Houtiene tar på seg ansvar for rakettangrep", "NO"),
    # [ułożony] — vaaratiedote o dymie to nie alarm powietrzny
    ("Vaaratiedote: savua Porvoossa, pidä ovet ja ikkunat kiinni", "FI"),
    # [ułożony] — zdarzenie w Danii opisane po fińsku
    ("Droonit sulkivat lentoaseman Tanskassa", "FI"),
]
for i, (tytul, kraj) in enumerate(NIE_SYGNAL):
    fz, dz = przepusc(tytul, kraj, f"https://przyklad.test/nie-{i}")
    sprawdz(f"[{kraj}] nie sygnal: {tytul[:50]}…", not sygnal(dz) and fz == [],
            str([(d["decision"], d["reason"]) for d in dz]))

# ── 3. Słownictwo nowych języków nie przecieka do pozostałych krajów ─────────
for kraj in ("LT", "LV", "EE", "RO", "MD", "SK", "CZ", "SE", "HU"):
    nietkniete = all(
        r._vocab(kraj, k, baza) is baza
        for k, baza in (("alert", config.BALTIC_ALERT_KEYWORDS),
                        ("air", config.BALTIC_AIR_KEYWORDS),
                        ("event", config.BALTIC_EVENT_KEYWORDS),
                        ("critical", config.BALTIC_CRITICAL_KEYWORDS),
                        ("exclude", config.BALTIC_EXCLUDE_KEYWORDS),
                        ("past", config.BALTIC_PAST_TIME_WORDS),
                        ("discussion", config.BALTIC_DISCUSSION_MARKERS)))
    sprawdz(f"{kraj}: listy slow bez zmian", nietkniete)
    sprawdz(f"{kraj}: lista zagranicy bez zmian",
            r._foreign_markers(kraj) == config.BALTIC_FOREIGN_MARKERS)
# Fińskie słowo, którego NIE ma we wspólnych listach, nie może działać dla
# estońskiego kanału — inaczej słownik kanału fińskiego przeciekłby do Estonii.
sprawdz("'ilmatilaloukkau' nie jest slowem estonskiego kanalu",
        "ilmatilaloukkau" not in r._vocab("EE", "critical", config.BALTIC_CRITICAL_KEYWORDS)
        and "ilmatilaloukkau" in r._vocab("FI", "critical", config.BALTIC_CRITICAL_KEYWORDS))

# Estoński tytuł z dopełniaczem „drooni” (= fińskie „drooni”) zachowuje się
# jak przed 16.10.2026: punktuje dalej z listy wspólnej, nie z fińskiej.
fz, _ = przepusc("Eesti õhuruumi rikkus Vene drooni lend Narva kohal", "EE",
                 "https://przyklad.test/ee-1")
sprawdz("Estonia nadal punktuje (lista wspolna)", bool(fz) and all(w["points"] > 0 for w in fz),
        str(sorted({w["points"] for w in fz})))

# ── 4. /api/state bez zmian ─────────────────────────────────────────────────
# `rss_media.baltic` trafia do sekcji `health` stanu, którą pobiera każdy klient.
sprawdz("stan publiczny nie zna krajow 'tylko dziennik'",
        not set(r.baltic) & config.NEIGHBOUR_JOURNAL_ONLY, str(sorted(r.baltic)))
sprawdz("stan publiczny ma te same 9 krajow co przed 16.10.2026",
        set(r.baltic) == {"LT", "LV", "EE", "MD", "RO", "SK", "CZ", "SE", "HU"},
        str(sorted(r.baltic)))
glowny = (pathlib.Path(__file__).resolve().parent.parent / "backend" / "app" / "main.py"
          ).read_text(encoding="utf-8")
sprawdz("sekcja health.rss w stanie pomija kanaly 'tylko dziennik'",
        "NEIGHBOUR_JOURNAL_ONLY" in glowny.split('"rss":', 1)[1].split('"baltic":', 1)[0])

# ── 5. Konfiguracja ──────────────────────────────────────────────────────────
for kraj in sorted(config.NEIGHBOUR_JOURNAL_ONLY):
    sprawdz(f"{kraj}: tylko dziennik jest tez w cieniu (gdyby zniknal z dziennika — 0 pkt)",
            kraj in config.NEIGHBOUR_SHADOW)
    sprawdz(f"{kraj}: wymaga miejsca w kraju i slowa o powietrzu przy alarmie",
            kraj in config.NEIGHBOUR_REQUIRE_LOCAL and kraj in config.NEIGHBOUR_ALERT_NEEDS_AIR)
    sprawdz(f"{kraj}: ma slownictwo i miejsca",
            bool(config.NEIGHBOUR_VOCAB.get(kraj)) and bool(config.BALTIC_LOCAL_MARKERS.get(kraj)))
    kanaly = [u for u, c in config.NEIGHBOUR_FEEDS if c == kraj]
    sprawdz(f"{kraj}: dwa kanaly https", len(kanaly) == 2
            and all(u.startswith("https://") for u in kanaly), str(kanaly))

print()
print("ZLE: " + ", ".join(bledy) if bledy else "WSZYSTKO OK")
sys.exit(1 if bledy else 0)

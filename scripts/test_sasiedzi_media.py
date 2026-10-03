# -*- coding: utf-8 -*-
"""Sąsiedzi poza Bałtykiem: MD, RO, SK, CZ, SE, HU (03.10.2026).

Czeskie i słowackie media piszą o CUDZEJ przestrzeni powietrznej częściej niż
o własnej. Pierwsze cztery wyniki wyszukiwania 03.10.2026 to kolejno zdarzenia
w Danii, na Litwie, w Polsce i w Rumunii — opisane po czesku i po słowacku,
słowo w słowo tym samym słownictwem, którego sami szukamy. Przy Bałtyku
wystarczała zasada „brak zagranicy w tytule ⇒ u siebie", bo LRT pisze głównie
o Litwie. Tutaj jest odwrotnie, więc zasada też jest odwrócona: tytuł MUSI
nazwać miejsce w tym kraju.

Drugi haczyk: RO-Alert to jeden system na burze, powodzie, pożary i drony.
„Mesaj RO-Alert, cod roșu de furtună" nie jest alarmem powietrznym.

Trzeci: rumuńskie media piszą o Mołdawii TYM SAMYM językiem, więc kraj
rozstrzyga tytuł, nie kanał — i rozstrzyga PRZED bramą „miejsce w kraju",
inaczej mołdawski tytuł wypadałby na braku markerów rumuńskich.

Wszystkie nagłówki poniżej są prawdziwe (wyszukiwanie 03.10.2026), nie
wymyślone pod test.

Uruchomienie: python scripts/test_sasiedzi_media.py
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

zebrane: list[dict] = []


async def _ingest(**kw):
    zebrane.append(kw)


r.fusion = types.SimpleNamespace(ingest=_ingest)
r.stealth = types.SimpleNamespace(record=lambda *a, **k: None)


def wpis(tytul: str, link: str, wiek_s: int = 300) -> dict:
    """Wpis RSS taki, jaki zwraca feedparser: świeży, z datą."""
    return {"title": tytul, "summary": "", "link": link,
            "published_parsed": time.gmtime(time.time() - wiek_s)}


def przepusc(tytul: str, kanal_kraj: str, link: str) -> list[dict]:
    """Jeden wpis przez kolektor; zwraca to, co poszło do fusion."""
    zebrane.clear()
    r._baltic_active.clear()
    r._baltic_clears_seen.clear()
    r._baltic_alerted.clear()
    asyncio.run(r._baltic_entries([wpis(tytul, link)], "test://kanal",
                                  kanal_kraj, time.time()))
    return list(zebrane)


bledy: list[str] = []


def sprawdz(opis: str, warunek: bool, szczegol: str = "") -> None:
    print(("OK   " if warunek else "ZLE  ") + opis + (" | " + szczegol if szczegol else ""))
    if not warunek:
        bledy.append(opis)


# ── 1. Cudza przestrzeń powietrzna nie jest naszym sygnałem ──────────────────
CUDZE = [
    ("Drony opět narušily dánský vzdušný prostor. Tentokrát nad vojenskou základnou", "CZ"),
    ("V Litvě krátce platil vzdušný poplach kvůli dronu", "CZ"),
    ("Ruské drony narušili poľský vzdušný priestor. Armáda ich zostrelila", "SK"),
    ("Rumunsko oznámilo narušenie vzdušného priestoru možným ruským dronom", "SK"),
]
for i, (tytul, kraj) in enumerate(CUDZE):
    out = przepusc(tytul, kraj, f"https://przyklad.test/cudze-{i}")
    sprawdz(f"zagranica nie daje sygnalu [{kraj}] {tytul[:46]}…",
            out == [], f"wpisow: {len(out)}")

# ── 2. Zdarzenie u siebie przechodzi ─────────────────────────────────────────
out = przepusc("Letecký provoz v Praze dnes narušil dron v bezletové zóně "
               "ruzyňského letiště", "CZ", "https://przyklad.test/praha-1")
sprawdz("incydent w Pradze daje sygnal", bool(out), f"wpisow: {len(out)}")
if out:
    kraje = {w["details"]["country"] for w in out}
    woj = {w["voivodeship"] for w in out}
    sprawdz("incydent czeski przypisany do CZ", kraje == {"CZ"}, str(kraje))
    sprawdz("incydent czeski idzie na zachod, nie na polnoc",
            woj == set(config.NEIGHBOUR_TARGET_WEIGHTS["CZ"]), str(sorted(woj)))
    sprawdz("tryb cienia: zero punktow",
            all(w["points"] == 0.0 for w in out),
            str(sorted({w["points"] for w in out})))
    sprawdz("tryb cienia zapisuje, ile BY bylo",
            all(w["details"].get("shadow") and w["details"].get("would_be")
                for w in out),
            str(sorted({w["details"].get("would_be") for w in out})))

# ── 3. RO-Alert tylko razem ze słowem o powietrzu ────────────────────────────
out = przepusc("Nou mesaj RO-Alert în Tulcea, ținte aeriene identificate la "
               "granița cu Ucraina", "RO", "https://przyklad.test/tulcea-1")
alerty = [w for w in out if w["event_type"] == "baltic_alert"]
sprawdz("RO-Alert o celach powietrznych to alarm", bool(alerty), f"wpisow: {len(out)}")
if alerty:
    sprawdz("alarm rumunski przypisany do RO",
            {w["details"]["country"] for w in alerty} == {"RO"})
    sprawdz("alarm rumunski idzie na poludniowy wschod",
            {w["voivodeship"] for w in alerty} == set(config.NEIGHBOUR_TARGET_WEIGHTS["RO"]),
            str(sorted({w["voivodeship"] for w in alerty})))

out = przepusc("Mesaj RO-Alert în judeţul Galaţi: cod roşu de furtună şi "
               "vijelii puternice", "RO", "https://przyklad.test/galati-1")
sprawdz("RO-Alert o burzy to NIE alarm powietrzny",
        [w for w in out if w["event_type"] == "baltic_alert"] == [],
        f"wpisow: {len(out)}")

# ── 4. Rumuński kanał o Mołdawii ⇒ Mołdawia ─────────────────────────────────
out = przepusc("O dronă a intrat în spațiul aerian al Republicii Moldova și "
               "s-a prăbușit", "RO", "https://przyklad.test/moldova-1")
sprawdz("rumunski kanal o Moldawii daje sygnal", bool(out), f"wpisow: {len(out)}")
if out:
    kraje = {w["details"]["country"] for w in out}
    sprawdz("zdarzenie przypisane do MD, nie do RO", kraje == {"MD"}, str(kraje))
    sprawdz("zapisany tez kanal zrodlowy",
            {w["details"].get("feed_country") for w in out} == {"RO"})

# ── 5. Bałtyk nie zmienił zachowania ────────────────────────────────────────
out = przepusc("Lietuvoje paskelbtas oro pavojus", "LT", "https://przyklad.test/lt-1")
alerty = [w for w in out if w["event_type"] == "baltic_alert"]
sprawdz("alarm litewski nadal PUNKTUJE", bool(alerty) and all(w["points"] > 0 for w in alerty),
        str(sorted({w["points"] for w in alerty})))
sprawdz("alarm litewski nadal idzie na cztery wojewodztwa polnocne",
        {w["voivodeship"] for w in alerty} == set(config.BALTIC_TARGET_WEIGHTS),
        str(sorted({w["voivodeship"] for w in alerty})))

# ── 6. Konfiguracja: każdy kraj ma kanały, wagę i cele ──────────────────────
for kraj in sorted(config.NEIGHBOUR_COUNTRY_NAMES):
    ma_kanaly = sum(1 for _, c in config.NEIGHBOUR_FEEDS if c == kraj)
    sprawdz(f"{kraj}: co najmniej dwa kanaly", ma_kanaly >= 2, f"{ma_kanaly}")
    sprawdz(f"{kraj}: waga kraju i cele",
            kraj in config.NEIGHBOUR_ALERT_COUNTRY_WEIGHTS
            and bool(config.NEIGHBOUR_TARGET_WEIGHTS.get(kraj))
            and bool(config.BALTIC_LOCAL_MARKERS.get(kraj)))

print()
print("ZLE: " + ", ".join(bledy) if bledy else "WSZYSTKO OK")
sys.exit(1 if bledy else 0)

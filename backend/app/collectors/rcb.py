"""Warstwa 2d — komunikaty RCB (gov.pl/web/rcb): lista wpisów i treść alertu.

gov.pl nie wystawia działającego RSS dla RCB (przekierowanie na portal główny),
więc parsujemy HTML listy wpisów. Przypisanie województwa: po słowach
kluczowych w tytule; jeśli brak — województwa priorytetowe.

Sama LISTA wpisów to od E3 (13.09.2026) punkt odniesienia czasowego (0 pkt):
alerty RCB przychodzą szybciej i z regionem przez RSO (rso.py). Wcześniej
kolektor czytał tylko pierwsze 20 linków — a to samo menu nawigacji, więc
komunikaty „Alert RCB - zagrożenie atakiem z powietrza" (pozycje 36+) nigdy nie
były widziane.

Od 24.09.2026 czytamy dodatkowo TREŚĆ artykułu z bieżącego dnia i z niej bierzemy
województwa. Powód: RSO/TVP niesie czasem tylko część odbiorców alertu. 24.09
komunikat poszedł „do odbiorców na terenie woj. podkarpackiego i lubelskiego",
a punktowało się samo lubelskie; 17.09 tak samo przepadło podkarpackie przy
alercie 3. poziomu („znajdź bezpieczne miejsce"). Odtworzenie 31 artykułów
z 1–24.09.2026 (11 powietrznych) nie dało ani jednego fałszywego dodania —
różnica była wyłącznie tam, gdzie RSO gubiło województwo.
"""
import asyncio
import hashlib
import html as html_mod
import logging
import re
import time
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from .. import config, fusion, rcb_reference
from ..textmatch import match_keywords
from .rso import RSO_AIR, RSO_CONTINUES, RSO_END, rcb_level

log = logging.getLogger("rcb")
status = {"ok": False, "last": None, "error": None}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# linki artykułów RCB: <a href="/web/rcb/tytul-wpisu">...>tytuł<...</a>
LINK_RE = re.compile(
    r'href="(/web/rcb/[a-z0-9-]{8,})"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")

_seen_bootstrap = False
# artykuły przeczytane w tym procesie: href → data wpisu („2026-09-24" albo "")
_artykuly: dict[str, str] = {}
# meldunki, które już obsłużyliśmy (klucz z treści i listy województw)
_meldunki: set[str] = set()
# …i te, które zastaliśmy w artykule przy pierwszym otwarciu: mogą być sprzed
# godzin, więc punktują tylko przy żywym alercie RSO, a odwołania z nich nie biorą
_zastane: set[str] = set()


def _fold(s: str) -> str:
    """Bez diakrytyków i wielkości liter. „ł" nie ma rozkładu NFD, więc osobno —
    bez tego „odwołano" nie pasowało do rdzenia „odwol" i odwołanie alertu
    wychodziło z artykułu jako nowy alert."""
    s = unicodedata.normalize("NFD", (s or "").lower().replace("ł", "l"))
    return "".join(c for c in s if not unicodedata.combining(c))


def _match_voivs(text: str) -> list[str]:
    tl = text.lower()
    out = [v for v, keys in config.VOIV_KEYWORDS.items() if any(k in tl for k in keys)]
    return out or list(config.PRIORITY_VOIVODESHIPS)


# ── Treść artykułu: województwa i poziom prosto z komunikatu ─────────────────
# Artykuł ma blok na każdą wysyłkę, oddzielone linią myślników, NAJNOWSZY NA GÓRZE:
#   „UWAGA! Rosyjski atak powietrzny…”  ← treść alertu w cudzysłowie
#   Alert RCB został wysłany do odbiorców na terenie woj. podkarpackiego i lubelskiego.
BLOK_SEP = re.compile(r"-{5,}")
CYTAT_RE = re.compile(r"[„\"]([^”\"]{25,600})[”\"]")
NAWIAS_RE = re.compile(r"\([^)]*\)")
DATA_RE = re.compile(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b")
# Kotwica listy odbiorców. Samo „wysłany" NIE wystarczało: RCB pisze też
# „zostały wysłane" i „wysłano", a liczby mnogiej używa właśnie wtedy, gdy alert
# idzie do KILKU województw. Wtedy nie znajdowaliśmy ani jednego województwa
# i cały blok przepadał — alert bez punktów, po cichu. Dlatego rdzeń „wyslan"
# i zapasowo „odbiorc" („do odbiorców na terenie …"), niezależne od czasownika.
WYSYLKA_RE = re.compile(r"wyslan|odbiorc")
# 16 nazw w dopełniaczu to ~290 znaków — przy 260 ostatnie województwo z listy
# wypadało. Blok opisuje JEDNĄ wysyłkę, więc szerszy zakres nie wciąga cudzych
# odbiorców; artykuł jest wcześniej dzielony na bloki po linii myślników.
ZAKRES_ZNAKOW = 600
ARTYKULY_NA_CYKL = 2         # ile artykułów z bieżącego dnia otwieramy w jednym obiegu

AIR_FOLD = tuple(_fold(a) for a in RSO_AIR)
END_FOLD = tuple(_fold(a) for a in RSO_END)
CONT_FOLD = tuple(_fold(a) for a in RSO_CONTINUES)


def _rdzenie_wojewodztw() -> list[tuple[str, tuple[str, ...]]]:
    """Rdzenie nazw do dopasowania w odmianie („lubelskiego", „podkarpackiego").
    Od najdłuższych, żeby „dolnośląskiego" nie wpadło jako „śląskie"."""
    out = []
    for v in config.VOIVODESHIPS:
        r = _fold(v)
        r = r[:-2] if r.endswith("ie") else r
        out.append((v, (r, r.replace("-", " ")) if "-" in r else (r,)))
    return sorted(out, key=lambda x: -len(x[1][0]))


VOIV_RDZENIE = _rdzenie_wojewodztw()


def wojewodztwa_alertu(blok: str) -> list[str]:
    """Odbiorcy z jednego bloku artykułu.

    Nawiasy wycinamy, bo RCB wylicza w nich POWIATY: „województwa lubelskiego
    (powiaty: puławski, opolski, …)" dokładało woj. opolskie (21.09.2026)."""
    t = NAWIAS_RE.sub(" ", _fold(blok))
    m = WYSYLKA_RE.search(t)
    if not m:
        return []
    zakres = t[m.start():m.start() + ZAKRES_ZNAKOW]
    out = []
    for nazwa, warianty in VOIV_RDZENIE:
        for r in warianty:
            if r in zakres:
                out.append(nazwa)
                zakres = zakres.replace(r, "·")
                break
    return out


def _czy_odwolanie(tresc: str) -> bool:
    t = _fold(tresc)
    for cont in CONT_FOLD:          # „obowiązuje do odwołania" to trwający alert
        t = t.replace(cont, " ")
    return any(w in t for w in END_FOLD)


def meldunki(tresc_artykulu: str) -> list[dict]:
    """Bloki artykułu od najnowszego: treść komunikatu, odbiorcy, poziom."""
    out = []
    for blok in BLOK_SEP.split(tresc_artykulu):
        cytaty = CYTAT_RE.findall(blok)
        if not cytaty:
            continue
        tresc = max(cytaty, key=len)          # w bloku bywa też krótki cytat z nagłówka
        if not any(a in _fold(tresc) for a in AIR_FOLD):
            continue
        out.append({"tresc": tresc.strip(), "wojewodztwa": wojewodztwa_alertu(blok),
                    "odwolanie": _czy_odwolanie(tresc), "poziom": rcb_level(tresc)})
    return out


def najnowszy_meldunek(lista: list[dict]) -> dict | None:
    """Pierwszy blok artykułu z odbiorcami — pod warunkiem, że niesie tę samą
    treść co lead. Lead bywa samym cytatem (10.09, 12.09.2026), a zdanie
    „Alert RCB został wysłany…" stoi dopiero przy jego powtórzeniu niżej.
    Gdy treść się różni, blok jest starszy i nie wolno go brać za bieżący."""
    if not lista:
        return None
    lead = lista[0]
    if lead["wojewodztwa"]:
        return lead
    for m in lista[1:]:
        if m["wojewodztwa"] and _fold(m["tresc"]) == _fold(lead["tresc"]):
            return m
    return None


def tresc_artykulu(strona: str, tytul: str) -> str:
    """Sam wpis: od tytułu do bloku danych strony. Bez tego cudzysłowy z teaserów
    innych komunikatów i daty z menu trafiałyby do parsera jako treść alertu."""
    czysty = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", strona, flags=re.S | re.I)
    czysty = html_mod.unescape(re.sub(r"\s+", " ", TAG_RE.sub(" ", czysty)))
    i = czysty.find(tytul)
    j = czysty.find('{"register"')
    return czysty[max(i, 0):j if j > i else len(czysty)][:8000]


def _data_artykulu(tekst: str) -> str:
    """Data wpisu spod tytułu („24.09.2026") jako „2026-09-24"."""
    m = DATA_RE.search(tekst)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""


def _dzis() -> str:
    return datetime.now(ZoneInfo("Europe/Warsaw")).strftime("%Y-%m-%d")


def _rso_pokrycie(okno_min: int) -> dict[str, int]:
    """Województwa z żywym alertem RSO i najwyższym jego poziomem. Dla nich
    artykuł nie dokłada nic — ten sam komunikat mamy już z szybszego źródła."""
    out: dict[str, int] = {}
    for s in fusion.db.signals_since(okno_min):
        if (s.get("source") != "rcb" or s.get("event_type") != "rso_alert"
                or (s.get("points") or 0) <= 0 or not s.get("voivodeship")):
            continue
        lvl = (s.get("details") or {}).get("rcb_level")
        lvl = lvl if isinstance(lvl, int) else 1
        out[s["voivodeship"]] = max(out.get(s["voivodeship"], 0), lvl)
    return out


async def _czytaj_artykul(client: httpx.AsyncClient, href: str, tytul: str):
    """Otwiera artykuł z bieżącego dnia i punktuje województwa spoza RSO."""
    url = f"https://www.gov.pl{href}"
    znany = href in _artykuly          # czytaliśmy go już w tym procesie
    try:
        r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
        r.raise_for_status()
        tekst = tresc_artykulu(r.text, tytul)
    except Exception as e:                       # noqa: BLE001
        log.warning("RCB: nie udało się przeczytać %s: %s", url, e)
        return
    dzien = _data_artykulu(tekst)
    _artykuly[href] = dzien
    if dzien != _dzis():
        return                                   # historia: sama lista, bez punktów
    m = najnowszy_meldunek(meldunki(tekst))      # najnowsza wysyłka jest na górze
    if m is None:
        return
    klucz = "rcb-art:" + hashlib.sha1(
        f"{href}|{m['tresc']}|{','.join(m['wojewodztwa'])}|{m['odwolanie']}".encode()
    ).hexdigest()[:16]
    if klucz in _meldunki:
        return
    if not znany:
        _zastane.add(klucz)
    zastany = klucz in _zastane
    pokrycie = _rso_pokrycie(config.FUSION_WINDOW_MIN)

    if m["odwolanie"]:
        # Odwołanie gasi alert, więc bierzemy je tylko wtedy, gdy POJAWIŁO SIĘ przy
        # nas. Zastane przy pierwszym otwarciu może być starsze od trwającego
        # alertu — a wtedy wyciszyłoby żywe zagrożenie.
        if zastany:
            return
        _meldunki.add(klucz)
        for voiv in m["wojewodztwa"]:
            await fusion.ingest(
                source="rcb", event_type="rso_clear", voivodeship=voiv, points=0.0,
                title=f"RCB (gov.pl): odwołanie — „{m['tresc'][:110]}”",
                details={"url": url, "clear": True, "cleared_at": fusion.db.now_iso(),
                         "govpl": True},
                dedup_key=f"{klucz}:{voiv}")
        log.info("RCB: odwołanie z artykułu %s dla %s", url, ", ".join(m["wojewodztwa"]))
        return

    poziom = m["poziom"]
    brakujace = [v for v in m["wojewodztwa"] if pokrycie.get(v, 0) < poziom]
    # Meldunek zastany przy pierwszym otwarciu bywa sprzed godzin. Punktuje dopiero,
    # gdy RSO ma żywy alert — wtedy wiadomo, że komunikat trwa. Sprawdzamy to w
    # każdym obiegu, bo alert RSO może wejść chwilę po starcie.
    if zastany and not pokrycie:
        for voiv in brakujace:
            fusion.db.add_signal(
                "rcb", "rcb_art_seen", voiv, 0.0,
                f"RCB (gov.pl, bez żywego alertu RSO): „{m['tresc'][:110]}”",
                {"url": url, "rcb_level": poziom}, f"{klucz}:seen:{voiv}")
        return
    _meldunki.add(klucz)
    for voiv in brakujace:
        await fusion.ingest(
            source="rcb", event_type="rcb_alert", voivodeship=voiv,
            points=config.RCB_LEVEL_POINTS[poziom],
            title=f"Alert RCB (gov.pl): „{m['tresc'][:110]}”",
            details={"url": url, "rcb_level": poziom, "govpl": True,
                     "wojewodztwa": m["wojewodztwa"]},
            dedup_key=f"{klucz}:{voiv}")
    if brakujace:
        log.warning("RCB: alert %d. poziomu z artykułu dla %s (RSO ich nie niosło)",
                    poziom, ", ".join(brakujace))
        rcb_reference.capture(
            source="govpl-tresc", source_event_id=url, title=tytul,
            voivodeships=brakujace, source_time_raw=None, bootstrap=False)


async def _check(client: httpx.AsyncClient):
    global _seen_bootstrap
    try:
        r = await client.get(config.RCB_URL, headers={"User-Agent": UA},
                             follow_redirects=True)
        r.raise_for_status()
        status.update(ok=True, last=time.time(), error=None)
    except Exception as e:
        status.update(ok=False, error=str(e))
        return

    found = []
    seen_hrefs = set()
    for href, raw_title in LINK_RE.findall(r.text):
        title = TAG_RE.sub(" ", raw_title)
        title = re.sub(r"\s+", " ", title).strip()
        if not title or len(title) < 8 or href in seen_hrefs:
            continue
        seen_hrefs.add(href)
        found.append((href, title))

    do_przeczytania = []
    for href, title in found:
        # ta sama reguła co media: słowo krytyczne albo para obiekt+zdarzenie
        if not match_keywords(title, config.ALERT_CRITICAL_KEYWORDS,
                              config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                              config.EXCLUDE_KEYWORDS):
            continue
        # artykuły starsze niż dziś odpadają po pierwszym otwarciu (mamy ich datę)
        if _artykuly.get(href, _dzis()) == _dzis():
            do_przeczytania.append((href, title))
        dedup = "rcb:" + hashlib.sha1(href.encode()).hexdigest()[:16]
        voivodeships = _match_voivs(title)
        reference_new = False
        if _seen_bootstrap:
            for voiv in voivodeships:
                inserted = await fusion.ingest(
                    source="rcb", event_type="rcb_govpl", voivodeship=voiv,
                    points=0.0,
                    title=f"RCB (gov.pl, odniesienie): „{title[:120]}”",
                    details={"url": f"https://www.gov.pl{href}", "reference_only": True},
                    dedup_key=f"{dedup}:{voiv}",
                )
                reference_new = reference_new or inserted
        else:
            # pierwszy przebieg: zapisz istniejące wpisy bez punktów,
            # żeby stare komunikaty nie generowały fałszywego alarmu na starcie
            for voiv in voivodeships:
                inserted = fusion.db.add_signal(
                    "rcb", "rcb_alert_seen", voiv, 0.0,
                    f"RCB (istniejący przy starcie): „{title[:120]}”",
                    {"url": f"https://www.gov.pl{href}"}, f"{dedup}:{voiv}")
                reference_new = reference_new or inserted
        if reference_new:
            rcb_reference.capture(
                source="govpl", source_event_id=f"https://www.gov.pl{href}",
                title=title, voivodeships=voivodeships,
                source_time_raw=None, bootstrap=not _seen_bootstrap,
            )
    _seen_bootstrap = True
    for href, title in do_przeczytania[:ARTYKULY_NA_CYKL]:
        await _czytaj_artykul(client, href, title)


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await _check(client)
            await asyncio.sleep(config.RCB_INTERVAL)

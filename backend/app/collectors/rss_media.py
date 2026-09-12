"""Warstwa 2c — media regionalne (RSS) per województwo.

RSS jest źródłem pomocniczym: 1 pkt za obiekt+zdarzenie albo 1,5 pkt za
jednoznaczną relację operacyjną. Limit całej klasy 1,5 pkt sprawia, że same
artykuły nie osiągają żółtego progu. Wykluczamy m.in. ćwiczenia, historię i
następstwa prawne.
"""
import asyncio
import calendar
import hashlib
import logging
import re
import time
import unicodedata
from urllib.parse import urlparse

import feedparser
import httpx

from .. import config, fusion
from ..textmatch import classify_level, match_keywords


async def _get_with_retry(client: httpx.AsyncClient, url: str, tries: int = 2):
    """GET z jednym ponowieniem — feedy CDN (Google News, portale) bywają
    chwilowo niedostępne; pojedyncza próba za często dawała `ok:false`. Błąd
    zapisujemy przez repr(), bo część wyjątków httpx ma pusty str() (stąd
    wcześniej „error: ''" bez wskazówki, co pada)."""
    last = None
    for i in range(tries):
        try:
            r = await client.get(url, headers={"User-Agent": UA}, follow_redirects=True)
            r.raise_for_status()
            return r, None
        except Exception as e:
            last = repr(e) or e.__class__.__name__
            if i + 1 < tries:
                await asyncio.sleep(1.5)
    return None, last

log = logging.getLogger("rss")

status = {"feeds": {}}  # url -> {"ok": bool, "last": ts, "error": str}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

MAX_AGE_S = 45 * 60   # ignoruj wpisy starsze niż 45 min (stare newsy ≠ sygnał "teraz")


def _is_baltic_clear(text: str) -> bool:
    tl = text.lower()
    return any(word in tl for word in config.BALTIC_CLEAR_KEYWORDS)


def _baltic_incident_key(link: str, title: str, country: str) -> str:
    """Stabilny identyfikator rozwijanego artykułu/zdarzenia.

    LSM zmienia slug przy przejściu „alarm” → „alarm zakończony”, ale zostawia
    końcowe ``a661158``. ERR analogicznie zachowuje numer artykułu. Dzięki temu
    odwołanie wygasza właściwy sygnał, a nie wszystkie równoległe alerty kraju.
    """
    for pattern in (r"(?:^|[./-])(a\d{5,})(?:[/?#.-]|$)",
                    r"(?:^|[./-])(\d{7,})(?:[/?#.-]|$)"):
        m = re.search(pattern, link, re.I)
        if m:
            return f"{country}:{m.group(1).lower()}"
    path = urlparse(link).path.rstrip("/").lower()
    basis = path.rsplit("/", 1)[-1] if path else title.lower()
    # Fallback służy tylko deduplikacji. Nie próbujemy agresywnie łączyć różnych
    # regionów jednego kraju, bo odwołanie jednego alarmu mogłoby skasować drugi.
    return f"{country}:fallback:{hashlib.sha1(basis.encode()).hexdigest()[:12]}"


def _match_keywords(text: str) -> list[str]:
    return match_keywords(text, config.ALERT_CRITICAL_KEYWORDS,
                          config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                          config.EXCLUDE_KEYWORDS)


def _fold(s: str) -> str:
    """Małe litery bez znaków diakrytycznych — część źródeł pisze „Chelm", nie „Chełm"."""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # ł/Ł nie rozkładają się w NFD, trzeba je podmienić osobno
    return s.replace("ł", "l").replace("Ł", "l")


def _match_voivs(text: str) -> list[str]:
    """WSZYSTKIE województwa wymienione w tekście, w kolejności wystąpienia.

    Do 1.7.28 zwracaliśmy jedno — to z najdłuższym trafionym hasłem. Reguła
    powstała przeciwko kolizjom nazw ("Chełmno" zawiera "chełm", "Radomsko"
    zawiera "radom"), ale po cichu rozstrzygała też przypadki, w których artykuł
    mówi o kilku regionach naraz. Alert RCB rozesłany "do osób na terenie
    województw lubelskiego i podkarpackiego" trafiał WYŁĄCZNIE do podkarpackiego,
    bo "podkarpack" jest dłuższe niż "lubelski" — a lubelskie, wymienione w tytule
    i pierwsze w zdaniu, nie dostawało nic (zgłoszone 12.09.2026).

    Teraz zbieramy każde trafienie i odrzucamy tylko te, które mieszczą się
    w DŁUŻSZYM trafieniu innego województwa w tym samym miejscu tekstu — czyli
    dokładnie kolizje nazw: "Biała Podlaska" to lubelskie, nie podlaskie.
    """
    tl = _fold(text)
    hits: list[tuple[int, int, str]] = []
    for voiv, keys in config.VOIV_KEYWORDS.items():
        for k in keys:
            kf = _fold(k)
            start = tl.find(kf)
            while start != -1:
                hits.append((start, start + len(kf), voiv))
                start = tl.find(kf, start + 1)
    out: list[str] = []
    for start, end, voiv in sorted(hits):
        covered = any(other != voiv and o_start <= start and end <= o_end
                      and (o_end - o_start) > (end - start)
                      for o_start, o_end, other in hits)
        if not covered and voiv not in out:
            out.append(voiv)
    return out


async def _check_feed(client: httpx.AsyncClient, url: str, default_voiv: str | None):
    st = status["feeds"].setdefault(url, {})
    r, err = await _get_with_retry(client, url)
    if err is not None:
        st.update(ok=False, error=err)
        return
    parsed = feedparser.parse(r.content)
    st.update(ok=True, last=time.time(), error=None)

    now = time.time()
    for entry in parsed.entries[:30]:
        title = entry.get("title", "")
        summary = entry.get("summary", "") or entry.get("description", "")
        text = f"{title} {summary}"
        # wiek wpisu
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        if t and now - calendar.timegm(t) > MAX_AGE_S:
            continue
        # SIŁA trafienia decyduje o wadze: relacja operacyjna = 1,5, a słabsze
        # obiekt+zdarzenie = 1,0. Obie wartości wymagają innej klasy źródła.
        level, hits = classify_level(text, config.ALERT_CRITICAL_KEYWORDS,
                                     config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                                     config.EXCLUDE_KEYWORDS)
        if not level:
            continue
        pts = config.POINTS["media_critical"] if level == "critical" else config.POINTS["media_keywords"]
        voivs = _match_voivs(text) or ([default_voiv] if default_voiv else [])
        if not voivs:
            continue
        link = entry.get("link", "")
        dedup = "media:" + hashlib.sha1((link or title).encode()).hexdigest()[:16]
        # Województwo w kluczu deduplikacji: jeden artykuł o dwóch regionach ma
        # dać sygnał w każdym z nich, a nie zniknąć po pierwszym zapisie.
        for voiv in voivs:
            await fusion.ingest(
                source="media", event_type="media_keywords", voivodeship=voiv,
                points=pts,
                title=f"Media: „{title[:120]}”",
                details={"link": link, "keywords": hits, "feed": url, "level": level,
                         "voivodeships": voivs},
                dedup_key=f"{dedup}:{voiv}",
            )


async def _check_baltic_feed(client: httpx.AsyncClient, url: str, country: str):
    """Media LT/LV/EE: incydent powietrzny u bałtyckich sąsiadów ⇒ +1 pkt
    dla podlaskiego i warmińsko-mazurskiego (kontekst, nie potwierdzenie)."""
    st = status["feeds"].setdefault(url, {})
    r, err = await _get_with_retry(client, url)
    if err is not None:
        st.update(ok=False, error=err)
        return
    parsed = feedparser.parse(r.content)
    st.update(ok=True, last=time.time(), error=None)
    now = time.time()
    for entry in parsed.entries[:30]:
        title = entry.get("title", "")
        text = f"{title} {entry.get('summary', '')}".lower()
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        if t and now - calendar.timegm(t) > MAX_AGE_S:
            continue
        link = entry.get("link", "")
        incident_key = _baltic_incident_key(link, title, country)
        if _is_baltic_clear(text):
            # Punkty 0 są celowe: wpis zostaje w historii i natychmiast wymusza
            # reevaluację, a fusion.accumulate wygasza wcześniejszy kontekst o
            # tym samym incident_key. Nigdy nie może podbić wyniku.
            for voiv in config.BALTIC_TARGET_VOIVS:
                await fusion.ingest(
                    source="media", event_type="baltic_clear", voivodeship=voiv,
                    points=0.0, title=f"Media {country}: odwołanie — „{title[:100]}”",
                    details={"link": link, "country": country,
                             "incident_key": incident_key, "clear": True},
                    dedup_key=f"baltic-clear:{incident_key}:{voiv}",
                )
            continue
        hits = match_keywords(text, config.BALTIC_CRITICAL_KEYWORDS,
                              config.BALTIC_AIR_KEYWORDS, config.BALTIC_EVENT_KEYWORDS,
                              config.BALTIC_EXCLUDE_KEYWORDS)
        if not hits:
            continue
        h = hashlib.sha1((link or title).encode()).hexdigest()[:16]
        for voiv in config.BALTIC_TARGET_VOIVS:
            await fusion.ingest(
                source="media", event_type="baltic_context", voivodeship=voiv,
                points=config.POINTS["baltic_context"],
                title=f"Media {country}: „{title[:110]}”",
                details={"link": link, "keywords": hits, "country": country,
                         "incident_key": incident_key},
                dedup_key=f"baltic:{h}:{voiv}",
            )


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.gather(
                *[_check_feed(client, url, voiv) for url, voiv in config.RSS_FEEDS],
                *[_check_baltic_feed(client, url, c) for url, c in config.BALTIC_FEEDS],
                return_exceptions=True,
            )
            await asyncio.sleep(config.RSS_INTERVAL)

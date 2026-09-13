"""Warstwa 2c — media regionalne (RSS) per województwo.

RSS jest źródłem pomocniczym: 0,5 pkt za obiekt+zdarzenie albo 1 pkt za
jednoznaczną relację operacyjną, limit klasy 1 pkt. Punkty dostaje wyłącznie
artykuł przeczytany w całości, który opisuje coś świeżego (article_reader).
Wykluczamy m.in. ćwiczenia, historię i następstwa prawne.
"""
import asyncio
import calendar
import hashlib
import logging
import re
import time
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlparse

import feedparser
import httpx

from .. import article_reader, config, fusion
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
    return (any(word in tl for word in config.BALTIC_CLEAR_KEYWORDS)
            and any(word in tl for word in config.BALTIC_CLEAR_CONTEXT))


def _is_baltic_alert(text: str) -> list[str]:
    tl = text.lower()
    if any(word in tl for word in config.BALTIC_EXCLUDE_KEYWORDS):
        return []
    words = set(re.findall(r"\w+", tl))
    if words & set(config.BALTIC_ALERT_PAST_MARKERS):
        return []
    return [word for word in config.BALTIC_ALERT_KEYWORDS if word in tl]


# Stan per kraj do okna „Źródła” w aplikacji i do łączenia doniesień z kilku
# redakcji: ten sam alarm w LRT i 15min to jedno zdarzenie, nie dwa.
baltic = {c: {"feeds_ok": 0, "feeds": 0, "newest_item": None, "last_alert": None}
          for c in config.BALTIC_COUNTRY_NAMES}
_baltic_active: dict[str, dict] = {}     # kraj -> {"incident_key", "at"}
_baltic_clears_seen: set[str] = set()
_baltic_alerted: set[str] = set()        # incident_key, za które coś przyznano
BALTIC_ACTIVE_S = 3 * 3600


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
                          config.EXCLUDE_KEYWORDS, config.SOFT_EXCLUDE_KEYWORDS)


def _fold(s: str) -> str:
    """Małe litery bez znaków diakrytycznych — część źródeł pisze „Chelm", nie „Chełm"."""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # ł/Ł nie rozkładają się w NFD, trzeba je podmienić osobno
    return s.replace("ł", "l").replace("Ł", "l")


def _mentions_abroad(text: str) -> bool:
    """Czy tekst umiejscawia zdarzenie poza Polską."""
    tl = _fold(text)
    return any(_fold(k) in tl for k in config.FOREIGN_PLACE_MARKERS)


def _is_media_clear(text: str) -> bool:
    """Czy artykuł ogłasza koniec zagrożenia, a nie zagrożenie."""
    tl = _fold(text)
    return any(_fold(k) in tl for k in config.MEDIA_CLEAR_KEYWORDS)


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
                # Trafienie MUSI zaczynać się na granicy słowa. Bez tego
                # „rozpoznania" zawierało „poznan" i ogólnopolski komunikat
                # wojskowy wpadał do wielkopolskiego (złapane na żywo 12.09.2026);
                # tak samo „bełkot"→Ełk i „topole"→Opole. Hasła są rdzeniami
                # odmian („podlask", „chełm"), więc obcinamy tylko lewą stronę.
                if start == 0 or not (tl[start - 1].isalnum() or tl[start - 1] == "-"):
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


def _strip_publisher(text: str, publisher: str) -> str:
    """Usuwa nazwę redakcji z tekstu poddawanego dopasowaniu.

    Wydawca mówi, KTO napisał, a nie GDZIE się stało. „Radio Szczecin" czy
    „MiastoKolobrzeg.pl" przypisywały artykuł o Rumunii do zachodniopomorskiego.
    Wyświetlany tytuł zostaje nietknięty — tam nazwa źródła jest przydatna.
    """
    p = (publisher or "").strip()
    if len(p) < 3:
        return text
    out = text.replace(" - " + p, " ").replace(p, " ")
    return out if out.strip() else text


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
        publisher = ((entry.get("source") or {}) or {}).get("title") or ""
        text = _strip_publisher(f"{title} {summary}", publisher)
        # wiek wpisu
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        if t and now - calendar.timegm(t) > MAX_AGE_S:
            continue
        # SIŁA trafienia decyduje o wadze: relacja operacyjna = 1,5, a słabsze
        # obiekt+zdarzenie = 1,0. Obie wartości wymagają innej klasy źródła.
        level, hits = classify_level(text, config.ALERT_CRITICAL_KEYWORDS,
                                     config.ALERT_AIR_KEYWORDS, config.ALERT_EVENT_KEYWORDS,
                                     config.EXCLUDE_KEYWORDS,
                                     config.SOFT_EXCLUDE_KEYWORDS)
        if not level:
            continue
        pts = config.POINTS["media_critical"] if level == "critical" else config.POINTS["media_keywords"]
        voivs = _match_voivs(text)
        if not voivs and default_voiv and not _mentions_abroad(text):
            # Domyślny region kanału jest DOMNIEMANIEM, nie faktem: stosujemy go
            # tylko wtedy, gdy tekst nie umiejscawia zdarzenia za granicą.
            voivs = [default_voiv]
        if not voivs:
            continue
        link = entry.get("link", "")
        dedup = "media:" + hashlib.sha1((link or title).encode()).hexdigest()[:16]
        # Tekst mówiący, że jest PO wszystkim, nie jest dowodem zagrożenia.
        # Punkty 0 są celowe: wpis zostaje w historii i wygasza wcześniejsze
        # doniesienia medialne w tym województwie (patrz fusion.accumulate).
        if _is_media_clear(text):
            for voiv in voivs:
                await fusion.ingest(
                    source="media", event_type="media_clear", voivodeship=voiv,
                    points=0.0, title=f"Media: odwołanie — „{title[:110]}”",
                    details={"link": link, "clear": True},
                    dedup_key=f"media-clear:{dedup}:{voiv}",
                )
            continue
        # Punkty tylko za artykuł PRZECZYTANY w całości i opisujący coś świeżego
        # (article_reader). Relacja z wcześniejszego zdarzenia albo artykuł, którego
        # nie da się przeczytać, zostaje w panelu z linkiem — fuzja liczy go za 0.
        source = entry.get("source") or {}
        published = (datetime.fromtimestamp(calendar.timegm(t), timezone.utc) if t else None)
        article = await article_reader.read_article(
            client, link, title, source.get("title", "") or publisher,
            source.get("href", ""), published)
        # Województwo w kluczu deduplikacji: jeden artykuł o dwóch regionach ma
        # dać sygnał w każdym z nich, a nie zniknąć po pierwszym zapisie.
        for voiv in voivs:
            await fusion.ingest(
                source="media", event_type="media_keywords", voivodeship=voiv,
                points=pts,
                title=f"Media: „{title[:120]}”",
                details={"link": link, "keywords": hits, "feed": url, "level": level,
                         "voivodeships": voivs, "article": article},
                dedup_key=f"{dedup}:{voiv}",
            )


async def _check_baltic_feed(client: httpx.AsyncClient, url: str, country: str):
    """Media LT/LV/EE: incydent powietrzny u bałtyckich sąsiadów ⇒ +1 pkt
    dla podlaskiego i warmińsko-mazurskiego (kontekst, nie potwierdzenie)."""
    st = status["feeds"].setdefault(url, {})
    st["country"] = country
    r, err = await _get_with_retry(client, url)
    if err is not None:
        st.update(ok=False, error=err)
        return
    parsed = feedparser.parse(r.content)
    dated = [e for e in parsed.entries
             if e.get("published_parsed") or e.get("updated_parsed")]
    if not dated:
        # Odpowiedź 200 bez artykułów to nie działający kanał — tak wyglądał
        # delfi.lt po zmianie adresu (same nazwy działów).
        st.update(ok=False, error="kanał nie zawiera artykułów z datą")
        return
    newest = max(calendar.timegm(e.get("published_parsed") or e.get("updated_parsed"))
                 for e in dated)
    now = time.time()
    st.update(ok=True, last=now, error=None, newest_item=newest)
    await _baltic_entries(parsed.entries[:40], url, country, now)


async def _baltic_entries(entries, url: str, country: str, now: float):
    for entry in entries:
        title = entry.get("title", "")
        text = f"{title} {entry.get('summary', '')}".lower()
        t = entry.get("published_parsed") or entry.get("updated_parsed")
        age = now - calendar.timegm(t) if t else 0
        if age > config.BALTIC_CLEAR_MAX_AGE_MIN * 60:
            continue
        link = entry.get("link", "")
        incident_key = _baltic_incident_key(link, title, country)
        if _is_baltic_clear(text):
            # Punkty 0 są celowe: wpis zostaje w historii i natychmiast wymusza
            # reevaluację, a fusion.accumulate wygasza wcześniejszy kontekst o
            # tym samym incident_key. Nigdy nie może podbić wyniku. Odwołanie
            # z innej redakcji niż ogłoszenie gasi też aktywny alarm kraju.
            # Aktywny alarm kraju gasi tylko PIERWSZE zobaczenie odwołania. Kanał
            # trzyma stare „(balta)” godzinami, a bez tego gasiłoby ono co minutę
            # każdy późniejszy, nowy alarm.
            # Wpis odwołania powstaje tylko wtedy, gdy jest co odwołać: aktywny
            # alarm kraju albo wcześniejszy sygnał o tym samym artykule. Inaczej
            # każdy artykuł „oro pavojaus nebėra” dawał 4 puste wiersze w panelu.
            first_seen = incident_key not in _baltic_clears_seen
            _baltic_clears_seen.add(incident_key)
            if not first_seen:
                continue
            keys = {incident_key} & _baltic_alerted
            active = _baltic_active.pop(country, None)
            if active and now - active["at"] < BALTIC_ACTIVE_S:
                keys.add(active["incident_key"])
                baltic[country]["last_alert"] = {
                    **(baltic[country]["last_alert"] or {}), "cleared": True,
                    "cleared_title": title[:160], "cleared_at": now}
            for key in sorted(keys):
                for voiv in config.BALTIC_TARGET_VOIVS:
                    await fusion.ingest(
                        source="media", event_type="baltic_clear", voivodeship=voiv,
                        points=0.0, title=f"Media {country}: odwołanie — „{title[:100]}”",
                        details={"link": link, "country": country,
                                 "incident_key": key, "clear": True},
                        dedup_key=f"baltic-clear:{key}:{voiv}",
                    )
            continue
        if age > MAX_AGE_S:
            continue
        alert_hits = _is_baltic_alert(text)
        if alert_hits:
            active = _baltic_active.get(country)
            if (active and now - active["at"] < BALTIC_ACTIVE_S
                    and active["incident_key"] != incident_key):
                continue          # to samo ogłoszenie z drugiej redakcji
            if not active:
                _baltic_active[country] = {"incident_key": incident_key, "at": now}
                baltic[country]["last_alert"] = {"title": title[:160], "at": now,
                                                 "link": link, "incident_key": incident_key}
            weight = config.BALTIC_ALERT_COUNTRY_WEIGHTS.get(country, 0.4)
            name = config.BALTIC_COUNTRY_NAMES.get(country, country)
            for voiv in config.BALTIC_TARGET_VOIVS:
                await fusion.ingest(
                    source="media", event_type="baltic_alert", voivodeship=voiv,
                    points=round(config.POINTS["baltic_alert"] * weight
                                 * config.BALTIC_TARGET_WEIGHTS.get(voiv, 1.0), 2),
                    title=f"Alarm powietrzny — {name}: „{title[:110]}”",
                    details={"link": link, "keywords": alert_hits, "country": country,
                             "incident_key": incident_key, "feed": url},
                    dedup_key=f"baltic-alert:{incident_key}:{voiv}",
                )
            _baltic_alerted.add(incident_key)
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
                points=config.POINTS["baltic_context"]
                       * config.BALTIC_TARGET_WEIGHTS.get(voiv, 1.0),
                title=f"Media {country}: „{title[:110]}”",
                details={"link": link, "keywords": hits, "country": country,
                         "incident_key": incident_key},
                dedup_key=f"baltic:{h}:{voiv}",
            )
        _baltic_alerted.add(incident_key)


def _baltic_summary() -> None:
    for country, st in baltic.items():
        feeds = [f for f in status["feeds"].values() if f.get("country") == country]
        st["feeds"] = len(feeds)
        st["feeds_ok"] = sum(1 for f in feeds if f.get("ok"))
        newest = [f["newest_item"] for f in feeds if f.get("ok") and f.get("newest_item")]
        st["newest_item"] = max(newest) if newest else None


async def run():
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.gather(
                *[_check_feed(client, url, voiv) for url, voiv in config.RSS_FEEDS],
                *[_check_baltic_feed(client, url, c) for url, c in config.BALTIC_FEEDS],
                return_exceptions=True,
            )
            _baltic_summary()
            await asyncio.sleep(config.RSS_INTERVAL)

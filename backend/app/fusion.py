"""Silnik fuzji sygnałów — przejrzysty system punktowy per województwo.

Zasada: żaden pojedynczy sygnał nie jest rozstrzygający; suma punktów z okna
ostatnich FUSION_WINDOW_MIN minut wyznacza poziom. Zawsze zwracamy pełne
rozbicie, żeby użytkownik widział DLACZEGO wynik jest taki, a nie inny.
"""
import asyncio
import logging
import math
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone

from . import config, db

log = logging.getLogger("fusion")


def round1(x: float) -> float:
    """Zaokrąglenie do 0,1 identyczne jak w engine.js (Math.round(x*10)/10).

    Wbudowane round() zaokrąglało 1,95 do 1,9 („brak”), a aplikacja offline do
    2,0 („uwaga”) — przy samym progu silniki dawały inny poziom (audyt C14)."""
    return math.floor(x * 10 + 0.5) / 10

# callbacki: notyfikacje i broadcast do frontendów (ustawiane w main)
on_level_change = None   # async def (voiv, level, score, breakdown, *, log_id)
on_state_change = None   # async def ()

_last_levels: dict[str, str] = {}
_levels_loaded = False


def _levels() -> dict[str, str]:
    """Ostatnio zgłoszone poziomy, wczytane z bazy przy pierwszym użyciu.

    Stan tylko w pamięci gubił się przy restarcie (trwający alarm szedł drugi raz),
    a bez okresowej reewaluacji nie widział też spadku wyniku z wiekiem — wtedy
    kolejny wzrost do tego samego poziomu nie wysyłał już nic.
    """
    global _levels_loaded
    if not _levels_loaded:
        try:
            _last_levels.update(db.load_levels())
        except Exception:
            pass                     # brak tabeli/bazy nie może blokować fuzji
        _levels_loaded = True
    return _last_levels

_RCB_RELAY_WINDOW_MIN = 45
_RELAY_STOP_WORDS = {
    "alert", "rcb", "uwaga", "media", "woj", "wojewodztwo", "sytuacja",
    "monitorowana", "terenie", "teren", "oraz", "jest", "przez", "dla",
    "polskie", "polski", "polska", "ktory", "ktora", "ktore", "przed",
}

# Druga bariera dla rekordów zapisanych przed poprawą klasyfikatora RSS.
# Jednoznaczny materiał historyczny lub o następstwach zostaje w historii,
# ale nie podnosi bieżącego wyniku zagrożenia.
_MEDIA_RETROSPECTIVE_TITLE_MARKERS = (
    "rok temu", "lata temu", "lat temu", "sledztwo ws",
    "odbudow", "ma byc gotow",
)


def _fold_text(value: str) -> str:
    value = unicodedata.normalize("NFD", (value or "").lower()).replace("ł", "l")
    return "".join(c for c in value if not unicodedata.combining(c))


# Ta sama polityka obowiązuje rekordy zapisane przed poprawą kolektora. Fusion
# widzi tylko zachowany tytuł, dlatego normalizuje wspólną listę z config.py.
_MEDIA_RETROSPECTIVE_TITLE_MARKERS += tuple(
    _fold_text(marker) for marker in config.MEDIA_NONCURRENT_KEYWORDS
)


def _relay_tokens(value: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", _fold_text(value))
            if len(w) >= 4 and w not in _RELAY_STOP_WORDS}


def _minutes_apart(a: dict, b: dict) -> float:
    try:
        return abs((datetime.fromisoformat(a["ts"]) -
                    datetime.fromisoformat(b["ts"])).total_seconds()) / 60
    except Exception:
        return float("inf")


# Artykuł, który mówi o czymś PONAD treść alertu — liczy się zawsze (21.09.2026).
_RELAY_ESCALATION_MARKERS = (
    "dron nad", "drony nad", "dronow nad", "nad polsk", "nad lubel", "nad podkarp",
    "narusz", "wlecia", "zestrzel", "eksploz", "wybuch", "spadl", "spadly", "szczatk",
    "syren",
)


def _relay_stems(value: str) -> set[str]:
    """Rdzenie słów (5 liter): „Ukrainę”/„Ukrainy”, „powietrzny”/„powietrzna” to jedno."""
    return {w[:5] for w in _relay_tokens(value)}


def _media_relay_of_official(media: dict, officials: list[dict]) -> dict | None:
    """Wykrywa artykuł, który tylko relacjonuje świeży Alert RCB.

    Sama wzmianka o RCB nie wystarcza: wymagamy tego samego województwa,
    bliskiego czasu oraz wyraźnego podobieństwa treści. Artykuł zostaje w
    rozbiciu, ale nie udaje niezależnego potwierdzenia.

    21.09.2026: przy aktywnym alercie dla lubelskiego (2 pkt) media dały drugie
    1,0 pkt za tę samą treść — „Rosyjski atak powietrzny na Ukrainę. Polskie
    lotnictwo rozpoczęło działania…” i „wojsko poderwało lotnictwo”, choć alert
    mówi wprost „W przestrzeni RP operuje polskie lotnictwo”. Wynik 3,8 przy pustej
    mapie. Dlatego powtórzeniem jest też artykuł BEZ słów „alert RCB”, jeśli ma
    prawie tę samą treść (rdzenie słów) i nie mówi o niczym ponad alert, a fala QRA
    — gdy alert sam mówi o lotnictwie.
    """
    if media.get("source") != "media":
        return None
    kind = media.get("event_type")
    if kind not in ("media_keywords", "media_qra_wave"):
        return None
    folded = _fold_text(media.get("title", ""))
    close = [o for o in officials
             if o.get("voivodeship") == media.get("voivodeship")
             and _minutes_apart(media, o) <= _RCB_RELAY_WINDOW_MIN]
    if kind == "media_qra_wave":
        return next((o for o in close if "lotnict" in _fold_text(o.get("title", ""))), None)
    if "alert rcb" in folded:
        # 23.09.2026: „Alert RCB w województwie lubelskim. Polskie lotnictwo operuje
        # w przestrzeni powietrznej" dało 1,0 pkt obok alertu (2,0) — porównanie
        # słów znalazło tylko dwa wspólne („operuje", „przestrzeni"), bo alert pisze
        # „polskie lotnictwo", a artykuł „lotnictwo operuje". Od teraz sam tytuł
        # z „Alert RCB", ten sam region i 45 minut wystarczą; artykuł mówiący
        # o czymś WIĘCEJ niż alert zostaje niezależnym sygnałem (markery niżej).
        if any(m in folded for m in _RELAY_ESCALATION_MARKERS):
            return None
        ms = _relay_stems(media.get("title", ""))
        for official in close:
            os_ = _relay_stems(official.get("title", ""))
            shared = ms & os_
            if len(shared) >= 3 and len(shared) / max(1, min(len(ms), len(os_))) >= 0.3:
                return official
        return None
    if any(m in folded for m in _RELAY_ESCALATION_MARKERS):
        return None
    ms = _relay_stems(media.get("title", ""))
    for official in close:
        os_ = _relay_stems(official.get("title", ""))
        shared = ms & os_
        if len(shared) >= 4 and len(shared) / max(1, min(len(ms), len(os_))) >= 0.5:
            return official
    return None


def _media_article_status(media: dict) -> str | None:
    """Wynik czytania artykułu, gdy odbiera punkty: "past" albo "unreadable".

    Starsze wpisy (sprzed czytnika) nie mają pola `article` i liczą się jak
    dotąd — zmiana nie przepisuje historii."""
    if media.get("source") != "media" or media.get("event_type") != "media_keywords":
        return None
    st = ((media.get("details") or {}).get("article") or {}).get("status")
    return st if st in ("past", "unreadable") else None


def _media_retrospective(media: dict) -> bool:
    if media.get("source") != "media" or media.get("event_type") != "media_keywords":
        return False
    title = _fold_text(media.get("title", ""))
    return any(marker in title for marker in _MEDIA_RETROSPECTIVE_TITLE_MARKERS)


def level_for(score: float) -> str:
    if score >= config.THRESHOLD_HIGH:
        return "high"
    if score >= config.THRESHOLD_ELEVATED:
        return "elevated"
    return "none"


_ORDER = ["none", "elevated", "high"]


def alert_level(own: float, total: float, prev: str = "none") -> str:
    """Poziom, który BUDZI TELEFON. Mapa nadal pokazuje `level` z wyniku łącznego.

    1. Przeniesienie od sąsiadów może domknąć próg, ale tylko o jeden stopień
       ponad poziom z punktów własnych: własny żółty + sąsiad → może być
       czerwony; własne poniżej progu żółtego + sąsiad → najwyżej żółty.
    2. Bez co najmniej ALERT_OWN_MIN punktów własnych przeniesienie nie wysyła
       nic. Wcześniej wystarczało 0,05 pkt (dron 240 km od granicy), żeby
       sąsiad dopchnął województwo do powiadomienia.
    Poziom nie ma marginesu przy zejściu — zawsze odpowiada bieżącym punktom.
    Powtórki przy wahaniu wokół progu zatrzymuje reevaluate (ALERT_REPEAT_QUIET_MIN).
    `prev` zostaje w sygnaturze dla zgodności wywołań.
    """
    own, total = round1(own), round1(total)
    if own < config.ALERT_OWN_MIN:
        return "none"
    cap = min(len(_ORDER) - 1, _ORDER.index(level_for(own)) + 1)
    return _ORDER[min(_ORDER.index(level_for(total)), cap)]


# (klucz, poziom) → ostatnia chwila, gdy punkty sięgały progu tego poziomu
_qualified_at: dict[tuple[str, str], float] = {}


def hold_level(key: str, computed: str, now: float, clear_at: float | None = None) -> str:
    """Poziom nie spada przez LEVEL_HOLD_MIN od chwili, gdy ostatnio sięgał progu.

    16.09.2026 podkarpackie skakało co kilka minut: żółty 07:12 → brak 07:16 →
    czerwony 07:19 → żółty 07:21 → czerwony 07:29 → żółty 07:36 → czerwony 07:38,
    bo wynik wahał się wokół 2,0 i 4,0. Margines punktowy (0,5) wycofano 13.09, bo
    trzymał żółty przy 1,7 pkt bez końca — tu trzymamy CZASOWO, więc po 10 min
    poziom znów odpowiada punktom. Odwołanie RCB/RSO po ostatnim przekroczeniu
    zdejmuje podtrzymanie od razu. Wzrost zawsze natychmiast."""
    idx = _ORDER.index(computed)
    for lvl in ("elevated", "high"):
        if _ORDER.index(lvl) <= idx:
            _qualified_at[(key, lvl)] = now
    for lvl in ("high", "elevated"):
        if _ORDER.index(lvl) <= idx:
            break
        q = _qualified_at.get((key, lvl))
        if q and now - q < config.LEVEL_HOLD_MIN * 60 and not (clear_at and clear_at >= q):
            return lvl
    return computed


def _last_clear_ts(signals: list[dict]) -> float | None:
    ts = [_parse_ts(s.get("ts")) for s in signals if s.get("event_type") == "rso_clear"]
    ts = [t for t in ts if t]
    return max(ts).timestamp() if ts else None


def rcb_nieodwolane(zdarzenia: list[dict], ref: datetime | None = None) -> dict[str, dict]:
    """Województwa, w których alert RCB trwa, bo nikt go nie odwołał.

    Alert RCB obowiązuje DO ODWOŁANIA, a odwołanie potrafi przyjść po wielu
    godzinach — 24/25.09.2026 alert dla podkarpackiego wyszedł o 22:01, a RCB
    odwołało go dopiero około 05:00. Nasze sygnały wygasają po oknie fuzji, więc
    przez te kilka godzin mapa wyglądała spokojnie, choć oficjalnie alert stał.
    Zwracamy więc czas ostatniego nieodwołanego alertu, żeby powiedzieć to wprost.

    To informacja, nie punkty: Strażnik punktuje to, co widzi, a tutaj nie widzi
    nic nowego — wie tylko, że odwołanie nie przyszło.
    """
    r = ref or datetime.now(timezone.utc)
    alerty: dict[str, datetime] = {}
    odwolania: dict[str, datetime] = {}
    for z in zdarzenia:
        voiv, ts = z.get("voivodeship"), _parse_ts(z.get("ts"))
        if not voiv or not ts or ts > r:
            continue
        typ = z.get("event_type")
        if typ in ("rso_alert", "rcb_alert") and (z.get("points") or 0) > 0:
            if ts > alerty.get(voiv, ts - timedelta(seconds=1)):
                alerty[voiv] = ts
        elif typ == "rso_clear":
            # Odwołanie ogólnokrajowe liczy się dla KAŻDEGO województwa — inaczej
            # mówilibyśmy „nie odwołano" tam, gdzie RCB wysłało SMS o końcu
            # zagrożenia, a RSO wpisało tylko jedno województwo.
            for w in (config.VOIVODESHIPS if _clear_krajowe(z) else (voiv,)):
                if ts > odwolania.get(w, ts - timedelta(seconds=1)):
                    odwolania[w] = ts
    out: dict[str, dict] = {}
    for voiv, ts in alerty.items():
        if voiv in odwolania and odwolania[voiv] >= ts:
            continue
        out[voiv] = {"od": ts, "minut": int((r - ts).total_seconds() // 60)}
    return out


def _fresh_strong_signal(signals: list[dict], since_iso: str) -> bool:
    """Czy od ostatniego powiadomienia przyszedł NOWY alert RCB/RSO.

    Nowe obiekty NEPTUN już nie przełamują ciszy: w trakcie ataku pojawiają się
    co minutę i przepuszczały powtórki co kilka minut (podkarpackie 13.09.2026:
    czerwony o 06:44 i znów o 06:47)."""
    return any(s.get("ts", "") > since_iso and s.get("counted_points", 0) > 0
               and s.get("source") == "rcb" for s in signals)


LEVEL_LABELS = {
    "none": "BRAK SYGNAŁÓW",
    "elevated": "PODWYŻSZONA UWAGA",
    "high": "WYSOKI PRIORYTET",
}


def _cascade_targets(src: str) -> list[tuple[str, int]]:
    """Województwa osiągalne z `src`, z odległością w krokach sąsiedztwa (BFS).

    Zwraca każdy region raz, po najkrótszej drodze — to ona decyduje o tym,
    jak mocno słabnie sygnał, zanim tam dotrze.
    """
    seen = {src}
    frontier = [src]
    out: list[tuple[str, int]] = []
    for depth in range(1, config.SPILLOVER_MAX_DEPTH + 1):
        nxt = []
        for node in frontier:
            for nb in config.VOIV_NEIGHBORS.get(node, []):
                if nb in seen:
                    continue
                seen.add(nb)
                nxt.append(nb)
                out.append((nb, depth))
        if not nxt:
            break
        frontier = nxt
    return out


def _event_key(s: dict) -> tuple:
    """Tożsamość zdarzenia NIEZALEŻNA od województwa.

    Ten sam artykuł (link), alarm obwodu UA (oblast), kontekst bałtycki
    (incident_key) czy strefa sąsiada (ident) trafia jako osobny wpis do każdego
    województwa, którego dotyczy. Klucz pozwala rozpoznać, że to jedno zdarzenie.
    """
    d = s.get("details") or {}
    for field in ("link", "incident_key", "oblast", "designator"):
        if d.get(field):
            return (s.get("source"), field, str(d[field]))
    if d.get("ident"):
        return (s.get("source"), "ident", f"{d.get('country')}:{d['ident']}")
    return (s.get("source"), "id", str(s.get("id")))


def _age_weight(ts: str, ref: datetime | None = None) -> float:
    """1.0 do FUSION_FULL_MIN, potem liniowy zjazd do 0 na końcu okna.

    `ref` to moment odniesienia (domyślnie teraz; dla rekonstrukcji historii —
    czas wybranej migawki), żeby wygaszanie liczyło się względem tamtej chwili.
    """
    try:
        r = ref or datetime.now(timezone.utc)
        age_min = (r - datetime.fromisoformat(ts)).total_seconds() / 60
    except Exception:
        return 1.0
    if age_min <= config.FUSION_FULL_MIN:
        return 1.0
    span = max(config.FUSION_WINDOW_MIN - config.FUSION_FULL_MIN, 1)
    return max(0.0, 1.0 - (age_min - config.FUSION_FULL_MIN) / span)


def _parse_ts(value) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def ua_alert_ends(signals: list[dict]) -> dict[tuple, datetime]:
    """(województwo, obwód, epizod) → chwila końca alarmu (sygnał ua_alert_end)."""
    ends: dict[tuple, datetime] = {}
    for s in signals:
        if s.get("event_type") != "ua_alert_end":
            continue
        d = s.get("details") or {}
        at = _parse_ts(d.get("ended_at") or s.get("ts"))
        key = (s.get("voivodeship"), d.get("oblast"), d.get("episode"))
        if at and (key not in ends or at < ends[key]):
            ends[key] = at
    return ends


def ua_alert_factor(s: dict, ends: dict, ref: datetime | None = None) -> tuple[float, datetime | None]:
    """Waga alarmu obwodu UA w chwili `ref` (wariant B2) i ewentualny koniec.

    Sygnały sprzed 13.09.2026 nie mają `episode` ani końca — liczą się po staremu
    (wygaszanie wiekiem), inaczej każdy dawny alarm „trwałby” 12 godzin."""
    d = s.get("details") or {}
    episode = d.get("episode")
    if not episode:
        return _age_weight(s["ts"], ref), None
    r = ref or datetime.now(timezone.utc)
    end = ends.get((s.get("voivodeship"), d.get("oblast"), episode))
    if end and end <= r:
        return 0.0, end
    start = _parse_ts(episode) or _parse_ts(s.get("ts")) or r
    age_min = max(0.0, (r - start).total_seconds() / 60)
    if age_min <= config.FUSION_FULL_MIN:
        return 1.0, None
    if age_min <= config.UA_ALERT_MAX_MIN:
        return config.UA_ALERT_LONG_FACTOR, None
    return 0.0, None


def active_ua_alerts(candidates: list[dict], ref: datetime | None = None) -> list[dict]:
    """Starty alarmów STARSZE niż okno fuzji, które w chwili `ref` wciąż trwają.

    Okno fuzji ma 60 min, a alarm może trwać godzinami — bez tego trwający alarm
    wypadałby z punktów i z mapy po godzinie."""
    r = ref or datetime.now(timezone.utc)
    window_start = r - timedelta(minutes=config.FUSION_WINDOW_MIN)
    ends = ua_alert_ends([s for s in candidates if (_parse_ts(s.get("ts")) or r) <= r])
    out = []
    for s in candidates:
        if s.get("event_type") != "ua_alert_border" or not (s.get("details") or {}).get("episode"):
            continue
        ts = _parse_ts(s.get("ts"))
        if not ts or ts >= window_start or ts > r:
            continue
        w, end = ua_alert_factor(s, ends, r)
        if w > 0 and end is None:
            out.append(s)
    return out


def _is_official(s: dict) -> bool:
    return (s.get("source") == "rcb" and s.get("event_type") in {"rso_alert", "rcb_alert"}
            and s.get("points", 0) > 0)


def _pl_local_to_utc(value) -> str | None:
    """Czas RSO (lokalny PL, bez strefy) → ISO UTC w formacie znaczników sygnałów."""
    try:
        from zoneinfo import ZoneInfo
        local = datetime.strptime(str(value)[:19], "%Y-%m-%d %H:%M:%S")
        return (local.replace(tzinfo=ZoneInfo("Europe/Warsaw"))
                .astimezone(timezone.utc).isoformat(timespec="seconds"))
    except Exception:
        return None


def _issued_at(s: dict) -> str:
    """Kiedy RCB wydało alert: `valid_from` z RSO, a bez niego chwila zapisu."""
    return _pl_local_to_utc((s.get("details") or {}).get("valid_from")) or s.get("ts", "")


def _clear_krajowe(s: dict) -> bool:
    """Czy to odwołanie mówi o CAŁEJ POLSCE, a nie o jednym województwie.

    RSO tagguje taki komunikat jednym województwem, choć RCB rozsyła go do
    wszystkich, które dostały alert. 24/25.09.2026 czytelniczka z Podkarpacia
    pokazała SMS-y: alert o 21:45 i odwołanie o 05:35 — a RSO w obu wpisach
    podało wyłącznie lubelskie. Bez tego alert wisiałby w województwie, w którym
    RCB już ogłosiło koniec zagrożenia.
    """
    if s.get("event_type") != "rso_clear":
        return False
    d = s.get("details") or {}
    t = _fold_text(f"{s.get('title', '')} {d.get('tresc', '')} {d.get('content', '')}")
    return any(m in t for m in config.RSO_CLEAR_KRAJOWE)


def _official_cleared(s: dict, rso_clears: dict[str, list[dict]]) -> bool:
    """Alert jest odwołany, gdy RSO odwołało TEN wpis (edycja w miejscu) albo
    województwo dostało odwołanie wydane po nim. Nowszy alert zostaje w mocy."""
    rso_id = str((s.get("details") or {}).get("rso_id") or "")
    issued = _issued_at(s)
    return any((rso_id and c["rso_id"] == rso_id) or issued <= c["at"]
               for c in rso_clears.get(s.get("voivodeship"), []))


def _media_after_official_clear(media: dict, clears: list[dict],
                                active_issued: list[str]) -> str | None:
    """Artykuł o alarmie w województwie, w którym RCB alarm odwołało.

    Wcześniejsze doniesienia gasną razem z odwołaniem. Późniejsze, przez
    RSO_CLEAR_MEDIA_ECHO_MIN, uznajemy za relację z tego, co się skończyło
    (13.09.2026: „W sześciu powiatach zawyły syreny" o 07:39 po odwołaniu
    o 04:58 dało 1,5 pkt) — chyba że w międzyczasie RCB wydało nowy alert.
    """
    ts = media.get("ts", "")
    if any(c["at"] >= ts for c in clears):
        return "before_clear"
    last = max(c["at"] for c in clears)
    try:
        gap = (datetime.fromisoformat(ts) - datetime.fromisoformat(last)).total_seconds() / 60
    except Exception:
        return None
    if gap > config.RSO_CLEAR_MEDIA_ECHO_MIN or any(i > last for i in active_issued):
        return None
    title = _fold_text(media.get("title", ""))
    if any(m in title for m in config.RSO_CLEAR_NOT_ECHO_MARKERS):
        return None
    if any(m in title for m in config.RSO_CLEAR_ECHO_MARKERS):
        return "after_clear"
    return None


def accumulate(signals: list[dict], ref: datetime | None = None) -> dict:
    """Per województwo {score, signals[]} z limitem klasy źródła (config.SOURCE_CAPS)
    i wygaszaniem wiekiem względem `ref`.

    Wspólne dla fuzji na żywo (compute_state) i rekonstrukcji historii. Bez tego
    historia sumowała SUROWE punkty bez limitu — np. 4 rutynowe strefy PAŻP
    (każda 1 pkt, cap klasy = 1) dawały fałszywe 4.0 „WYSOKI PRIORYTET”, choć na
    żywo dawały 1.0. NIE stosuje kaskady sąsiedzkiej — tę dokłada compute_state.
    """
    per_voiv: dict[str, dict] = {
        v: {"score": 0.0, "signals": [], "_spillover_score": 0.0, "_spill_parts": {}}
        for v in config.VOIVODESHIPS
    }
    per_source: dict[tuple, float] = {}
    officials = [s for s in signals if _is_official(s)]
    ua_ends = ua_alert_ends(signals)

    # Odwołanie alertu u sąsiada wygasza tylko wcześniejszy wpis tego samego
    # zdarzenia (stabilny incident_key z numeru artykułu). Sygnału nie kasujemy
    # z bazy — historia nadal pokazuje, że alarm istniał przed odwołaniem.
    baltic_clears: dict[tuple, str] = {}
    for s in signals:
        if s.get("event_type") != "baltic_clear":
            continue
        incident = (s.get("details") or {}).get("incident_key")
        if not incident:
            continue
        key = (s.get("voivodeship"), incident)
        baltic_clears[key] = max(baltic_clears.get(key, ""), s.get("ts", ""))

    # Kolejny tier tego samego track_id jest aktualizacją jednego fizycznego
    # obiektu, nie nowym obiektem. Dla pozycji rejonowej korzystamy z
    # `physical_key`, więc także nowe ID w identycznym punkcie miejscowości nie
    # udaje automatycznie kolejnego drona. Do wyniku wybieramy najmocniejszy wpis.
    # Alerty RCB w jednym województwie NIE sumują się (23.09.2026 — trzy poziomy treści).
    # Bieżącą ocenę państwa opisuje NAJNOWSZY alert i to on wyznacza poziom. Gdy poprzedni
    # był mocniejszy, jego nadwyżka gaśnie przez RCB_DOWNGRADE_FADE_MIN: punktacja schodzi
    # płynnie do poziomu nowego komunikatu, zamiast spadać do zera albo trzymać się starego.
    rcb_winners: dict[str, dict] = {}
    for s in signals:
        if s.get("event_type") not in ("rso_alert", "rcb_alert") or not s.get("voivodeship"):
            continue
        prev = rcb_winners.get(s["voivodeship"])
        if prev is None or (s.get("ts") or "") > (prev.get("ts") or ""):
            rcb_winners[s["voivodeship"]] = s

    neptun_winners: dict[tuple, dict] = {}
    for s in signals:
        if s.get("source") != "neptun":
            continue
        details = s.get("details") or {}
        track_id = details.get("track_id")
        physical_id = details.get("physical_key") or track_id
        if not physical_id:
            continue
        winner_key = (s.get("voivodeship"), physical_id)
        prev = neptun_winners.get(winner_key)
        if (prev is None
                or (s.get("points", 0), s.get("ts", ""))
                > (prev.get("points", 0), prev.get("ts", ""))):
            neptun_winners[winner_key] = s

    # Limit klasy źródła przydzielamy PO wygaszeniu wiekiem i od NAJMOCNIEJSZEGO
    # wkładu, nie od najstarszego sygnału. Wcześniej limit liczył się na surowych
    # punktach w kolejności czasu, więc w ataku dłuższym niż FUSION_FULL_MIN stare,
    # już wygaszone wpisy wypełniały limit klasy, a świeży obiekt tuż przy granicy
    # wnosił 0 pkt (audyt 11.09.2026: 4 tory sprzed 55 min + świeży alarm ETA dawały
    # 1,33 zamiast 4,0; nowy alert RSO obok starego — 0,67 zamiast 2,0).
    media_clears: dict[str, str] = {}
    for s in signals:
        if s.get("event_type") != "media_clear":
            continue
        v = s.get("voivodeship")
        if v and s.get("ts", "") > media_clears.get(v, ""):
            media_clears[v] = s["ts"]

    # Odwołania alertów RCB/RSO. Wpis RSO bywa edytowany W MIEJSCU: 13.09.2026
    # alert 23329799 dla lubelskiego o 04:58 zmienił treść na „Odwołano
    # zagrożenie atakiem z powietrza", a Strażnik liczył go dalej jako alert.
    rso_clears: dict[str, list[dict]] = {}
    for s in signals:
        if s.get("event_type") != "rso_clear" or not s.get("voivodeship"):
            continue
        d = s.get("details") or {}
        wpis = {"at": d.get("cleared_at") or s.get("ts", ""), "rso_id": str(d.get("rso_id") or "")}
        # Odwołanie ogólnokrajowe gasi alert wszędzie, nie tylko tam, gdzie RSO je wpisało.
        gdzie = config.VOIVODESHIPS if _clear_krajowe(s) else (s["voivodeship"],)
        for voiv in gdzie:
            rso_clears.setdefault(voiv, []).append(dict(wpis))
    uncleared_officials: dict[str, list[str]] = {}
    for s in officials:
        if not _official_cleared(s, rso_clears):
            uncleared_officials.setdefault(s.get("voivodeship"), []).append(_issued_at(s))

    # Nadwyżka po obniżeniu stopnia: starszy, MOCNIEJSZY alert dopłaca różnicę, która
    # gaśnie liniowo przez RCB_DOWNGRADE_FADE_MIN. Po tym czasie zostaje sam nowy poziom.
    rcb_residual: dict[str, dict] = {}
    for voiv, nowy in rcb_winners.items():
        nowy_ts = _parse_ts(nowy.get("ts"))
        mocniejsze = [x for x in signals
                      if x.get("event_type") in ("rso_alert", "rcb_alert")
                      and x.get("voivodeship") == voiv and x is not nowy
                      and x["points"] > nowy["points"]
                      and (x.get("ts") or "") < (nowy.get("ts") or "")]
        if mocniejsze and nowy_ts is not None:
            rcb_residual[voiv] = {"od": nowy_ts, "nowe_pkt": nowy["points"],
                                  "stary": max(mocniejsze, key=lambda x: x["points"])}

    prepared: list[dict] = []
    for s in sorted(signals, key=lambda x: x["ts"]):
        voiv = s.get("voivodeship")
        if voiv not in per_voiv or s["points"] <= 0:
            continue
        details = s.get("details") or {}
        track_id = details.get("track_id") if s.get("source") == "neptun" else None
        physical_id = ((details.get("physical_key") or track_id) if track_id else None)
        superseded = bool(physical_id
                          and neptun_winners.get((voiv, physical_id)) is not s)
        if s.get("event_type") in ("rso_alert", "rcb_alert"):
            superseded = superseded or rcb_winners.get(voiv) is not s
        incident = (details.get("incident_key")
                    if s.get("event_type") in ("baltic_context", "baltic_alert") else None)
        clear_ts = baltic_clears.get((voiv, incident)) if incident else None
        cleared = bool(clear_ts and clear_ts >= s.get("ts", ""))
        # Odwołanie w mediach polskich nie ma wspólnego klucza zdarzenia z
        # artykułem alarmowym (to zwykle inny adres), więc wygasza WSZYSTKIE
        # wcześniejsze doniesienia medialne w tym województwie. Świadomie
        # asymetryczne: media i tak nigdy nie alarmują same, a błąd w tę stronę
        # daje ciszę zamiast fałszywego alarmu.
        if not cleared and s.get("source") == "media":
            mc = media_clears.get(voiv)
            cleared = bool(mc and mc >= s.get("ts", ""))
        official_clear = None
        if _is_official(s) and _official_cleared(s, rso_clears):
            official_clear = "alert"
        elif s.get("event_type") == "media_keywords" and rso_clears.get(voiv):
            official_clear = _media_after_official_clear(
                s, rso_clears[voiv], uncleared_officials.get(voiv, []))
        cleared = cleared or bool(official_clear)
        relay_of = _media_relay_of_official(s, officials)
        retrospective = _media_retrospective(s)
        article_status = _media_article_status(s)
        ua_end = None
        if s.get("event_type") == "ua_alert_border":
            w, ua_end = ua_alert_factor(s, ua_ends, ref)
        else:
            w = _age_weight(s["ts"], ref)
        if s.get("event_type") in ("rso_alert", "rcb_alert"):
            res = rcb_residual.get(voiv)
            if res and res["stary"] is s:
                minely = ((ref or datetime.now(timezone.utc)) - res["od"]).total_seconds() / 60
                zanik = max(0.0, 1.0 - minely / config.RCB_DOWNGRADE_FADE_MIN)
                nadwyzka = max(0.0, s["points"] * zanik - res["nowe_pkt"])
                w = min(w, nadwyzka / s["points"] if s["points"] else 0.0)
                superseded = False
        zeroed = bool(superseded or cleared or relay_of or retrospective or article_status)
        prepared.append({
            "s": s, "voiv": voiv, "w": w, "counted": 0.0,
            "weighted": 0.0 if zeroed else s["points"] * w,
            "cleared": cleared, "relay_of": relay_of, "retrospective": retrospective,
            "official_clear": official_clear, "article_status": article_status,
            "ua_end": ua_end,
        })

    for e in sorted(prepared, key=lambda x: (-x["weighted"], x["s"]["ts"])):
        cap = config.SOURCE_CAPS.get(e["s"]["source"])
        key = (e["voiv"], e["s"]["source"])
        already = per_source.get(key, 0.0)
        e["counted"] = (e["weighted"] if cap is None
                        else max(0.0, min(cap - already, e["weighted"])))
        per_source[key] = already + e["counted"]

    # Fala obiektów (23.09.2026): kilka różnych obiektów kursem na Polskę w krótkim
    # oknie. Liczymy TORY, nie meldunki, żeby powtórzenia tego samego obiektu nie
    # robiły fali. Sygnał jest syntetyczny — widać go w panelu i w historii.
    teraz = ref or datetime.now(timezone.utc)
    fale: dict[str, list] = {}
    for e in prepared:
        s_ = e["s"]
        if s_.get("source") != "neptun" or e["weighted"] <= 0:
            continue
        d = s_.get("details") or {}
        km = d.get("dist_km")
        ts = _parse_ts(s_.get("ts"))
        if km is None or km > config.NEPTUN_WAVE_KM or ts is None:
            continue
        if (teraz - ts).total_seconds() > config.NEPTUN_WAVE_WINDOW_MIN * 60:
            continue
        fale.setdefault(e["voiv"], []).append((d.get("physical_key") or d.get("track_id") or s_.get("id"), ts))
    for voiv, obiekty in fale.items():
        ile = len({k for k, _ in obiekty})
        if ile < config.NEPTUN_WAVE_MIN:
            continue
        ostatni = max(ts for _, ts in obiekty)
        per_voiv[voiv]["score"] += config.NEPTUN_WAVE_POINTS
        per_voiv[voiv]["_spillover_score"] += config.NEPTUN_WAVE_POINTS
        per_voiv[voiv]["signals"].append({
            "source": "neptun", "event_type": "neptun_wave", "voivodeship": voiv,
            "ts": ostatni.isoformat(timespec="seconds"),
            "points": config.NEPTUN_WAVE_POINTS,
            "counted_points": config.NEPTUN_WAVE_POINTS, "weight": 1.0,
            "title": f"Fala obiektów: {ile} obiekty kursem na Polskę w {config.NEPTUN_WAVE_WINDOW_MIN} min "
                     f"(bliżej niż {int(config.NEPTUN_WAVE_KM)} km)",
            "details": {"count": ile, "wave": True},
        })

    for e in prepared:          # do wyniku i rozbicia — w kolejności czasu
        s, voiv, counted, relay_of = e["s"], e["voiv"], e["counted"], e["relay_of"]
        per_voiv[voiv]["score"] += counted
        # Oficjalny alert jest już przypisany do województwa przez RCB/RSO.
        # Nie przelewamy go ponownie do sąsiadów, zwłaszcza gdy ten sam komunikat
        # został wydany osobno dla kilku regionów.
        if s.get("source") != "rcb":
            per_voiv[voiv]["_spillover_score"] += counted
            if counted > 0:
                parts = per_voiv[voiv]["_spill_parts"]
                key = _event_key(s)
                parts[key] = parts.get(key, 0.0) + counted
        per_voiv[voiv]["signals"].append(
            {**s, "counted_points": round1(counted), "weight": round(e["w"], 2),
             **({"cleared": True} if e["cleared"] else {}),
             **({"duplicate_of_official":
                 (relay_of.get("details") or {}).get("rso_id") or relay_of.get("id")}
                if relay_of else {}),
             **({"retrospective": True} if e["retrospective"] else {}),
             **({"official_clear": e["official_clear"]} if e["official_clear"] else {}),
             **({"article_status": e["article_status"]} if e["article_status"] else {}),
             **({"alert_ended": e["ua_end"].isoformat(timespec="seconds")} if e["ua_end"] else {})})
    return per_voiv


def apply_spillover(per_voiv: dict, ref: datetime | None = None) -> dict:
    """Dokłada do wyniku `accumulate` przeniesienia od sąsiadów (w miejscu).

    Propagacja kaskadowa: zdarzenie podnosi czujność najpierw u sąsiadów,
    potem — słabiej — u ich sąsiadów, aż wkład zejdzie poniżej progu. Region
    dostaje wkład po najkrótszej drodze od źródła, a podstawą przeniesienia jest
    wynik WŁASNY źródła, więc przeniesienie nigdy nie przenosi przeniesienia.

    Wspólne dla fuzji na żywo i audytu referencji RCB — wcześniej audyt miał
    własną kopię tej pętli, która rozjechałaby się przy pierwszej zmianie.
    """
    base = {v: st.pop("_spillover_score", 0.0) for v, st in per_voiv.items()}
    parts = {v: st.pop("_spill_parts", {}) for v, st in per_voiv.items()}
    # Zdarzenia, które województwo ma już BEZPOŚREDNIO. Jeden artykuł albo jeden
    # alarm obwodu UA bywa przypisany do dwóch sąsiadów naraz; przed 13.09.2026
    # liczył się wtedy w każdym z nich w całości i JESZCZE RAZ jako 40% przeniesienia
    # od drugiego. Lubelskie i podkarpackie podbijały się tak wzajemnie tym samym
    # materiałem (artykuł o alercie RCB 07:02 dawał lubelskiemu 1,0 + część z 1,0).
    own_keys = {v: set(p) for v, p in parts.items()}
    # Wynik WŁASNY — przed przeniesieniem od sąsiadów. Tylko on decyduje o tym,
    # czy budzimy telefon: przeniesienie pokazujemy na mapie i w panelu, ale nie
    # wysyłamy z niego powiadomienia. Bez tego jedno zdarzenie mnożyło się w kilka
    # pushy (audyt 11.09.2026: mazowieckie 5,2 = czerwony z dwóch sąsiadów).
    for st in per_voiv.values():
        st["own_score"] = round1(st["score"])
        st["own_level"] = level_for(st["own_score"])
    now_iso = (ref or datetime.now(timezone.utc)).isoformat(timespec="seconds")
    for src, score in base.items():
        if score < config.SPILLOVER_MIN_SOURCE_SCORE:
            continue
        for target, depth in _cascade_targets(src):
            shared = sum(pts for key, pts in parts[src].items() if key in own_keys[target])
            effective = score - shared
            if effective < config.SPILLOVER_MIN_SOURCE_SCORE:
                continue
            spill = round1(effective * config.SPILLOVER_FACTOR ** depth)
            if spill < config.SPILLOVER_MIN_CONTRIBUTION:
                continue
            hop = "sąsiad" if depth == 1 else f"{depth}. krąg"
            eff = round1(effective)
            per_voiv[target]["score"] += spill
            per_voiv[target]["signals"].append({
                "id": f"spill-{src}-{target}", "ts": now_iso,
                "source": "spillover", "event_type": "neighbour_spillover",
                "voivodeship": target, "points": spill, "counted_points": spill,
                "title": (f"Przeniesienie z woj. {src} ({eff} pkt × "
                          f"{config.SPILLOVER_FACTOR}^{depth}, {hop}"
                          + (", bez zdarzeń wspólnych" if shared > 0 else "") + ")"),
                "details": {"from": src, "from_score": eff, "depth": depth,
                            **({"shared_excluded": round(shared, 2)} if shared > 0 else {})},
            })
    for st in per_voiv.values():
        st["score"] = round1(st["score"])
        st["level"] = level_for(st["score"])
    return per_voiv


def rcb_level_of(s: dict) -> int:
    """Poziom alertu RCB: z zapisanego pola, a dla starszych wpisów z treści."""
    lvl = (s.get("details") or {}).get("rcb_level")
    if isinstance(lvl, int):
        return lvl
    t = (s.get("title") or "").lower()
    for poziom in (3, 2):
        if any(m in t for m in config.RCB_LEVEL_MARKERS[poziom]):
            return poziom
    return 1


def red_key(signals: list[dict], ref: datetime | None = None) -> dict | None:
    """Czy wolno zapalić czerwony — i dlaczego (decyzja usera 23.09.2026).

    Suma punktów nie wystarcza, bo pośrednie sygnały (alert RCB o monitorowaniu,
    alarmy obwodów UA, media, strefy) potrafią zsumować się do 5 pkt przy pustej
    mapie — tak powstało wszystkie siedem czerwonych alarmów do 23.09.2026.
    Czerwony wymaga jednego z dwóch: oficjalnego wezwania do schronienia albo
    obiektu uderzeniowego, który leci na Polskę i jest blisko.
    """
    teraz = ref or datetime.now(timezone.utc)
    najnowszy = None
    for s in signals:
        if s.get("event_type") in ("rso_alert", "rcb_alert") and s.get("counted_points", 1) is not None:
            if najnowszy is None or (s.get("ts") or "") > (najnowszy.get("ts") or ""):
                najnowszy = s
    # Liczy się BIEŻĄCA ocena państwa: gdy RCB obniżyło stopień, stary alert 3. poziomu
    # dopłaca jeszcze zanikającą nadwyżkę punktów, ale nie trzyma już czerwonego.
    if najnowszy is not None and rcb_level_of(najnowszy) == 3:
        return {"powod": "rcb3", "opis": "Alert RCB: znajdź bezpieczne miejsce"}
    for s in signals:
        if s.get("source") != "neptun":
            continue
        ts = _parse_ts(s.get("ts"))
        if ts is None or (teraz - ts).total_seconds() > config.RED_GATE_MAX_AGE_MIN * 60:
            continue
        d = s.get("details") or {}
        if (d.get("type") or "").lower() not in config.RED_GATE_TYPES:
            continue
        eta, km = d.get("eta_border_min"), d.get("dist_km")
        if eta is not None and eta <= config.RED_GATE_ETA_MIN:
            return {"powod": "eta", "opis": f"obiekt {int(eta)} min od granicy", "eta_min": eta, "km": km}
        if km is not None and km <= config.RED_GATE_KM:
            return {"powod": "blisko", "opis": f"obiekt {round(km)} km od granicy", "eta_min": eta, "km": km}
    return None


def compute_state(signals: list[dict] | None = None, ref: datetime | None = None) -> dict:
    """Stan fuzji: per województwo suma punktów + lista sygnałów składowych.

    `level` (z wyniku łącznego) jest do wyświetlania, `own_level` (bez
    przeniesień) — do powiadomień. `signals`/`ref` służą odtwarzaniu przeszłej
    chwili w testach; na żywo oba zostają puste.
    """
    live = signals is None and ref is None     # podtrzymanie poziomu tylko na żywo
    if signals is None:
        signals = db.signals_since(config.FUSION_WINDOW_MIN)
    if getattr(db, "_conn", None) is not None:
        # Odwołania RCB z dłuższego okresu: gaszą też artykuły, które opisują
        # odwołany alarm godzinami później.
        try:
            seen = {s.get("id") for s in signals}
            signals = signals + [s for s in db.events_since(
                config.RSO_CLEAR_MEDIA_ECHO_MIN + config.FUSION_WINDOW_MIN, ("rso_clear",))
                if s.get("id") not in seen]
        except Exception as e:
            log.warning("odwołania RSO spoza okna: %s", e)
        # Alarmy obwodów UA trwające dłużej niż okno fuzji (wariant B2).
        try:
            seen = {s.get("id") for s in signals}
            signals = signals + [s for s in active_ua_alerts(db.events_since(
                config.UA_ALERT_MAX_MIN + config.FUSION_WINDOW_MIN,
                ("ua_alert_border", "ua_alert_end")), ref) if s.get("id") not in seen]
        except Exception as e:
            log.warning("trwające alarmy obwodów spoza okna: %s", e)
    # limit klasy źródła + wygaszanie wiekiem — wspólne z rekonstrukcją historii
    per_voiv = apply_spillover(accumulate(signals, ref), ref)
    levels = _levels()
    now = time.time()
    for voiv, st in per_voiv.items():
        # Kolor mapy podniesiony WYŁĄCZNIE przez sąsiadów (telefon w tym
        # województwie nie dzwoni) — aplikacja rysuje go inaczej niż własny alarm,
        # żeby żółte świętokrzyskie z samych przeniesień nie wyglądało jak alarm.
        st["alert_level"] = alert_level(st["own_score"], st["score"], levels.get(voiv, "none"))
        # Czerwony tylko z kluczem: oficjalne wezwanie do schronienia albo bliski obiekt.
        klucz = red_key(st["signals"], ref) if "high" in (st["level"], st["alert_level"]) else None
        st["red_key"] = klucz
        if not klucz:
            if st["level"] == "high":
                st["level"] = "elevated"
            if st["alert_level"] == "high":
                st["alert_level"] = "elevated"
        if live:
            clear_at = _last_clear_ts([s for s in signals
                                       if s.get("voivodeship") == voiv or _clear_krajowe(s)])
            st["alert_level"] = hold_level(f"alert:{voiv}", st["alert_level"], now, clear_at)
            st["level"] = hold_level(f"map:{voiv}", st["level"], now, clear_at)
            if _ORDER.index(st["alert_level"]) > _ORDER.index(st["level"]):
                st["level"] = st["alert_level"]
        st["spill_raised"] = _ORDER.index(st["level"]) > _ORDER.index(st["alert_level"])

    # Alert RCB bez odwołania — dopisywany PO całej punktacji i po ustaleniu
    # poziomów, żeby nie mógł na nie wpłynąć. Zero punktów: Strażnik punktuje to,
    # co widzi, a tutaj tylko przypomina, że oficjalny alert nadal obowiązuje.
    if getattr(db, "_conn", None) is not None:
        try:
            trwajace = rcb_nieodwolane(db.events_since(
                config.RCB_NIEODWOLANY_MAX_MIN,
                ("rso_alert", "rcb_alert", "rso_clear")), ref)
            for voiv, info in trwajace.items():
                st = per_voiv.get(voiv)
                if st is None:
                    continue
                st["rcb_nieodwolany"] = {"od": info["od"].isoformat(timespec="seconds"),
                                         "minut": info["minut"]}
                st["signals"].append({
                    "source": "rcb", "event_type": "rcb_bez_odwolania", "voivodeship": voiv,
                    "ts": info["od"].isoformat(timespec="seconds"),
                    "points": 0.0, "counted_points": 0.0, "weight": 0.0,
                    "title": "Alert RCB nie został jeszcze odwołany",
                    "details": {"od": info["od"].isoformat(timespec="seconds"),
                                "minut": info["minut"], "informacyjny": True},
                })
        except Exception as e:
            log.warning("nieodwołane alerty RCB: %s", e)

    return {
        "ts": (ref or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "window_min": config.FUSION_WINDOW_MIN,
        "thresholds": {"elevated": config.THRESHOLD_ELEVATED, "high": config.THRESHOLD_HIGH},
        "voivodeships": per_voiv,
    }


async def ingest(source: str, event_type: str, voivodeship: str | None, points: float,
                 title: str, details: dict, dedup_key: str):
    """Dodaje sygnał (z deduplikacją) i odpala reewaluację progów."""
    is_new = db.add_signal(source, event_type, voivodeship, points, title, details, dedup_key)
    if is_new:
        await reevaluate()
    return is_new


async def reevaluate():
    """Sprawdź przekroczenia progów (rising edge).

    Wołane po nowym sygnale ORAZ okresowo z `main.level_loop`, bo wynik spada
    z wiekiem sam, bez żadnego nowego sygnału.
    """
    state = compute_state()
    levels = _levels()
    for voiv, st in state["voivodeships"].items():
        old_level = levels.get(voiv, "none")
        # Zapamiętany poziom to poziom POWIADOMIEŃ (alert_level), nie kolor mapy —
        # z compute_state, razem z podtrzymaniem (hold_level), a nie liczony od nowa.
        new_level = st["alert_level"]
        if new_level == old_level:
            if st["level"] != new_level and _ORDER.index(st["level"]) > _ORDER.index(new_level):
                log.debug("woj. %s: na mapie %s (%s pkt, własne %s) — bez powiadomienia",
                          voiv, st["level"], st["score"], st["own_score"])
            continue
        rising = _ORDER.index(new_level) > _ORDER.index(old_level)
        levels[voiv] = new_level
        try:
            db.save_level(voiv, new_level)
        except Exception as e:
            log.warning("zapis poziomu %s: %s", voiv, e)
        from . import alert_log
        if not (rising and on_level_change):
            alert_log.record_transition(voiv, old_level, new_level, st,
                                        "falling" if not rising else "no_channel")
            continue
        # Powrót na ten sam poziom krótko po powiadomieniu to zwykle to samo
        # zdarzenie po chwilowym spadku — aktualizujemy mapę, telefon milczy.
        # Nowy alert RCB/RSO albo nowy obiekt NEPTUN przełamuje tę ciszę.
        try:
            last = db.last_notif(voiv, new_level)
        except Exception:
            last = None
        if last:
            age_min = (datetime.now(timezone.utc)
                       - datetime.fromisoformat(last)).total_seconds() / 60
            if (age_min < config.ALERT_REPEAT_QUIET_MIN
                    and not _fresh_strong_signal(st["signals"], last)):
                log.info("woj. %s: ponownie %s po %.0f min bez nowego mocnego źródła — "
                         "bez powiadomienia", voiv, new_level, age_min)
                alert_log.record_transition(voiv, old_level, new_level, st, "quiet_repeat")
                continue
        log_id = alert_log.record_transition(voiv, old_level, new_level, st, "pending")
        asyncio.create_task(on_level_change(voiv, new_level, st["score"], st["signals"],
                                            log_id=log_id))
    if on_state_change:
        asyncio.create_task(on_state_change())


def breakdown_text(signals: list[dict]) -> str:
    """Czytelne rozbicie punktacji do powiadomienia."""
    parts = []
    for s in signals:
        points = s.get("counted_points", s["points"])
        note = " — powtórzenie oficjalnego alertu" if s.get("duplicate_of_official") else ""
        if s.get("retrospective"):
            note = " — materiał historyczny/następstwa, bez punktów"
        parts.append(f"• [{s['source']}] {s['title']} (+{points} pkt{note})")
    return "\n".join(parts[:8])

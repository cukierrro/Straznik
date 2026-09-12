"""Silnik fuzji sygnałów — przejrzysty system punktowy per województwo.

Zasada: żaden pojedynczy sygnał nie jest rozstrzygający; suma punktów z okna
ostatnich FUSION_WINDOW_MIN minut wyznacza poziom. Zawsze zwracamy pełne
rozbicie, żeby użytkownik widział DLACZEGO wynik jest taki, a nie inny.
"""
import asyncio
import logging
import re
import unicodedata
from datetime import datetime, timezone

from . import config, db

log = logging.getLogger("fusion")

# callbacki: notyfikacje i broadcast do frontendów (ustawiane w main)
on_level_change = None   # async def (voiv, level, score, breakdown)
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


def _media_relay_of_official(media: dict, officials: list[dict]) -> dict | None:
    """Wykrywa artykuł, który tylko relacjonuje świeży Alert RCB.

    Sama wzmianka o RCB nie wystarcza: wymagamy tego samego województwa,
    bliskiego czasu oraz wyraźnego podobieństwa treści. Artykuł zostaje w
    rozbiciu, ale nie udaje niezależnego potwierdzenia.
    """
    if media.get("source") != "media" or media.get("event_type") != "media_keywords":
        return None
    folded = _fold_text(media.get("title", ""))
    if "alert rcb" not in folded:
        return None
    mt = _relay_tokens(media.get("title", ""))
    for official in officials:
        if official.get("voivodeship") != media.get("voivodeship"):
            continue
        if _minutes_apart(media, official) > _RCB_RELAY_WINDOW_MIN:
            continue
        ot = _relay_tokens(official.get("title", ""))
        shared = mt & ot
        if len(shared) >= 4 and len(shared) / max(1, min(len(mt), len(ot))) >= 0.45:
            return official
    return None


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


def accumulate(signals: list[dict], ref: datetime | None = None) -> dict:
    """Per województwo {score, signals[]} z limitem klasy źródła (config.SOURCE_CAPS)
    i wygaszaniem wiekiem względem `ref`.

    Wspólne dla fuzji na żywo (compute_state) i rekonstrukcji historii. Bez tego
    historia sumowała SUROWE punkty bez limitu — np. 4 rutynowe strefy PAŻP
    (każda 1 pkt, cap klasy = 1) dawały fałszywe 4.0 „WYSOKI PRIORYTET”, choć na
    żywo dawały 1.0. NIE stosuje kaskady sąsiedzkiej — tę dokłada compute_state.
    """
    per_voiv: dict[str, dict] = {
        v: {"score": 0.0, "signals": [], "_spillover_score": 0.0}
        for v in config.VOIVODESHIPS
    }
    per_source: dict[tuple, float] = {}
    officials = [s for s in signals if s.get("source") == "rcb"
                 and s.get("event_type") in {"rso_alert", "rcb_alert"}
                 and s.get("points", 0) > 0]

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
        incident = (details.get("incident_key")
                    if s.get("event_type") == "baltic_context" else None)
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
        relay_of = _media_relay_of_official(s, officials)
        retrospective = _media_retrospective(s)
        w = _age_weight(s["ts"], ref)
        zeroed = bool(superseded or cleared or relay_of or retrospective)
        prepared.append({
            "s": s, "voiv": voiv, "w": w, "counted": 0.0,
            "weighted": 0.0 if zeroed else s["points"] * w,
            "cleared": cleared, "relay_of": relay_of, "retrospective": retrospective,
        })

    for e in sorted(prepared, key=lambda x: (-x["weighted"], x["s"]["ts"])):
        cap = config.SOURCE_CAPS.get(e["s"]["source"])
        key = (e["voiv"], e["s"]["source"])
        already = per_source.get(key, 0.0)
        e["counted"] = (e["weighted"] if cap is None
                        else max(0.0, min(cap - already, e["weighted"])))
        per_source[key] = already + e["counted"]

    for e in prepared:          # do wyniku i rozbicia — w kolejności czasu
        s, voiv, counted, relay_of = e["s"], e["voiv"], e["counted"], e["relay_of"]
        per_voiv[voiv]["score"] += counted
        # Oficjalny alert jest już przypisany do województwa przez RCB/RSO.
        # Nie przelewamy go ponownie do sąsiadów, zwłaszcza gdy ten sam komunikat
        # został wydany osobno dla kilku regionów.
        if s.get("source") != "rcb":
            per_voiv[voiv]["_spillover_score"] += counted
        per_voiv[voiv]["signals"].append(
            {**s, "counted_points": round(counted, 1), "weight": round(e["w"], 2),
             **({"cleared": True} if e["cleared"] else {}),
             **({"duplicate_of_official":
                 (relay_of.get("details") or {}).get("rso_id") or relay_of.get("id")}
                if relay_of else {}),
             **({"retrospective": True} if e["retrospective"] else {})})
    return per_voiv


def compute_state() -> dict:
    """Stan fuzji: per województwo suma punktów + lista sygnałów składowych."""
    signals = db.signals_since(config.FUSION_WINDOW_MIN)
    # limit klasy źródła + wygaszanie wiekiem — wspólne z rekonstrukcją historii
    per_voiv = accumulate(signals)
    # Propagacja kaskadowa: zdarzenie podnosi czujność najpierw u sąsiadów,
    # potem — słabiej — u ich sąsiadów, aż wkład zejdzie poniżej progu. Region
    # dostaje wkład po najkrótszej drodze od źródła, więc każde źródło liczy się
    # tylko raz i kaskada nie może się zapętlić.
    base = {v: st.pop("_spillover_score", 0.0) for v, st in per_voiv.items()}
    # Wynik WŁASNY — przed przeniesieniem od sąsiadów. Decyduje o tym, czy budzimy
    # telefon: samo przeniesienie pokazujemy na mapie i w panelu, ale nie wysyłamy
    # z niego powiadomienia. Bez tego jedno zdarzenie mnożyło się w kilka pushy,
    # a 10.09.2026 trzy województwa bez ani jednego własnego sygnału dostały żółty
    # (audyt 11.09.2026: mazowieckie miało nawet 5,2 = czerwony z dwóch sąsiadów).
    for st in per_voiv.values():
        st["own_score"] = round(st["score"], 1)
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for src, score in base.items():
        if score < config.SPILLOVER_MIN_SOURCE_SCORE:
            continue
        for target, depth in _cascade_targets(src):
            spill = round(score * config.SPILLOVER_FACTOR ** depth, 1)
            if spill < config.SPILLOVER_MIN_CONTRIBUTION:
                continue
            hop = "sąsiad" if depth == 1 else f"{depth}. krąg"
            per_voiv[target]["score"] += spill
            per_voiv[target]["signals"].append({
                "id": f"spill-{src}-{target}", "ts": now_iso,
                "source": "spillover", "event_type": "neighbour_spillover",
                "voivodeship": target, "points": spill, "counted_points": spill,
                "title": (f"Przeniesienie z woj. {src} ({score} pkt × "
                          f"{config.SPILLOVER_FACTOR}^{depth}, {hop})"),
                "details": {"from": src, "from_score": score, "depth": depth},
            })
    for v, st in per_voiv.items():
        st["score"] = round(st["score"], 1)
        st["level"] = level_for(st["score"])
    return {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
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
    order = ["none", "elevated", "high"]
    for voiv, st in state["voivodeships"].items():
        new_level = st["level"]
        old_level = levels.get(voiv, "none")
        if new_level == old_level:
            continue
        rising = order.index(new_level) > order.index(old_level)
        if rising and st.get("own_score", 0.0) <= 0:
            # Poziom zbudowany WYŁĄCZNIE przeniesieniem od sąsiadów: zostaje widoczny
            # w aplikacji, ale nie budzi telefonu. Poziomu też NIE zapisujemy, żeby
            # późniejszy własny sygnał w tym województwie nadal wywołał alarm.
            log.info("woj. %s: poziom %s (%s pkt) wyłącznie z przeniesienia — "
                     "bez powiadomienia", voiv, new_level, st["score"])
            continue
        levels[voiv] = new_level
        try:
            db.save_level(voiv, new_level)
        except Exception as e:
            log.warning("zapis poziomu %s: %s", voiv, e)
        if rising and on_level_change:
            asyncio.create_task(on_level_change(voiv, new_level, st["score"], st["signals"]))
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

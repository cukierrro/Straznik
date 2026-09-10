"""Silnik fuzji sygnałów — przejrzysty system punktowy per województwo.

Zasada: żaden pojedynczy sygnał nie jest rozstrzygający; suma punktów z okna
ostatnich FUSION_WINDOW_MIN minut wyznacza poziom. Zawsze zwracamy pełne
rozbicie, żeby użytkownik widział DLACZEGO wynik jest taki, a nie inny.
"""
import asyncio
import re
import unicodedata
from datetime import datetime, timezone

from . import config, db

# callbacki: notyfikacje i broadcast do frontendów (ustawiane w main)
on_level_change = None   # async def (voiv, level, score, breakdown)
on_state_change = None   # async def ()

_last_levels: dict[str, str] = {}

_RCB_RELAY_WINDOW_MIN = 45
_RELAY_STOP_WORDS = {
    "alert", "rcb", "uwaga", "media", "woj", "wojewodztwo", "sytuacja",
    "monitorowana", "terenie", "teren", "oraz", "jest", "przez", "dla",
    "polskie", "polski", "polska", "ktory", "ktora", "ktore", "przed",
}


def _fold_text(value: str) -> str:
    value = unicodedata.normalize("NFD", (value or "").lower()).replace("ł", "l")
    return "".join(c for c in value if not unicodedata.combining(c))


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
    # obiektu, nie nowym obiektem. Do wyniku wybieramy najmocniejszy wpis toru;
    # starsze zostają widoczne w historii, ale z counted_points=0.
    neptun_winners: dict[tuple, dict] = {}
    for s in signals:
        if s.get("source") != "neptun":
            continue
        track_id = (s.get("details") or {}).get("track_id")
        if not track_id:
            continue
        winner_key = (s.get("voivodeship"), track_id)
        prev = neptun_winners.get(winner_key)
        if (prev is None
                or (s.get("points", 0), s.get("ts", ""))
                > (prev.get("points", 0), prev.get("ts", ""))):
            neptun_winners[winner_key] = s

    for s in sorted(signals, key=lambda x: x["ts"]):
        voiv = s.get("voivodeship")
        if voiv not in per_voiv or s["points"] <= 0:
            continue
        track_id = ((s.get("details") or {}).get("track_id")
                    if s.get("source") == "neptun" else None)
        superseded = bool(track_id and neptun_winners.get((voiv, track_id)) is not s)
        incident = ((s.get("details") or {}).get("incident_key")
                    if s.get("event_type") == "baltic_context" else None)
        clear_ts = baltic_clears.get((voiv, incident)) if incident else None
        cleared = bool(clear_ts and clear_ts >= s.get("ts", ""))
        relay_of = _media_relay_of_official(s, officials)
        key = (voiv, s["source"])
        cap = config.SOURCE_CAPS.get(s["source"])
        already = per_source.get(key, 0.0)
        counted = (0.0 if superseded or cleared or relay_of else
                   s["points"] if cap is None else
                   max(0.0, min(cap - already, s["points"])))
        if not superseded and not cleared and not relay_of:
            per_source[key] = already + s["points"]
        w = _age_weight(s["ts"], ref)
        counted *= w
        per_voiv[voiv]["score"] += counted
        # Oficjalny alert jest już przypisany do województwa przez RCB/RSO.
        # Nie przelewamy go ponownie do sąsiadów, zwłaszcza gdy ten sam komunikat
        # został wydany osobno dla kilku regionów.
        if s.get("source") != "rcb":
            per_voiv[voiv]["_spillover_score"] += counted
        per_voiv[voiv]["signals"].append(
            {**s, "counted_points": round(counted, 1), "weight": round(w, 2),
             **({"cleared": True} if cleared else {}),
             **({"duplicate_of_official":
                 (relay_of.get("details") or {}).get("rso_id") or relay_of.get("id")}
                if relay_of else {})})
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
    """Po każdym nowym sygnale: sprawdź przekroczenia progów (rising edge)."""
    state = compute_state()
    for voiv, st in state["voivodeships"].items():
        new_level = st["level"]
        old_level = _last_levels.get(voiv, "none")
        if new_level != old_level:
            _last_levels[voiv] = new_level
            rising = (["none", "elevated", "high"].index(new_level)
                      > ["none", "elevated", "high"].index(old_level))
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
        parts.append(f"• [{s['source']}] {s['title']} (+{points} pkt{note})")
    return "\n".join(parts[:8])

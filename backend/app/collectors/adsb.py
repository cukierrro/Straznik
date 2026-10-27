"""Warstwa 2b — ADS-B: aktywność lotnictwa wojskowego nad wschodnią Polską.

To publiczne dane z transponderów (samoloty, które CHCĄ być widoczne) — nie
namierzanie obiektów wroga. Sygnał = statystyczna anomalia: liczba maszyn
wojskowych nad województwem > 2x baseline z ostatnich 7 dni.

Domyślnie darmowe, bezkluczowe API adsb.lol (endpoint /v2/mil — wszystkie
maszyny wojskowe globalnie, filtrujemy bboxem). Dane adsb.lol są na licencji
ODbL 1.0 (opis ich API) — podpis „© adsb.lol, ODbL” w okienku źródeł i w NOTICE.

Zapasu NIE MA od 26.10.2026: opendata.adsb.fi pozwala tylko na „personal,
non-commercial use” i zakazuje licencjonowania danych (README ich API), a to
kłóci się z publicznym serwisem i z ODbL adsb.lol, bo listy były mieszane.
Opcja ADSBexchange przez RapidAPI (domyślnie wyłączona, warunków nikt nie
czytał) usunięta tego samego dnia — decyzja usera.
Gdy adsb.lol nie odpowiada, warstwa ADS-B jest pusta, a status mówi o błędzie —
warstwa i tak nie daje punktów.
"""
import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx

from .. import config, db, fusion, geo, stealth

log = logging.getLogger("adsb")
status = {"ok": False, "last": None, "error": None, "provider": config.ADSB_PROVIDER,
          "counts": {}, "baselines": {},
          "baltic_geo": {"ok": False, "provider": None, "candidates": 0}}

# aktualne maszyny wojskowe nad PL-wschód (dla frontendu)
current_aircraft: list[dict] = []
# krótka historia pozycji per maszyna — opcja „trasy” na mapie; osobno od
# current_aircraft, bo ta lista trafia do migawek historii (12 h)
trails: dict[str, list] = {}
TRAIL_MIN_KM, TRAIL_MAX_PTS, TRAIL_MAX_AGE_S = 0.5, 30, 30 * 60
# Ostatnia przyjęta pozycja per maszyna — do odrzucania niemożliwych skoków MLAT.
_last_pos: dict[str, dict] = {}
# Nic, co widzimy w ADS-B, nie leci 1800 km/h. Skok powyżej tego progu to błąd
# multilateracji, nie lot. Kotwicy nie odświeżamy w trakcie trzymania, więc
# dopuszczalny dystans rośnie z czasem i po chwili każdy realny przelot przechodzi;
# JUMP_HOLD_MAX_S jest twardym bezpiecznikiem, żeby maszyna nie zamarzła, gdy to
# nasza kotwica jest nieaktualna.
JUMP_MAX_KMH, JUMP_HOLD_MAX_S = 1800, 300
_watch_prev: dict[str, dict] | None = None


def _is_foreign_hex(value: str | None) -> bool:
    """Rosja 100000–1FFFFF, Białoruś 510000–5103FF — jak w frontendzie."""
    try:
        n = int(str(value or "").strip().lower(), 16)
    except ValueError:
        return False
    return 0x100000 <= n <= 0x1FFFFF or 0x510000 <= n <= 0x5103FF


def _watch_transitions(previous: dict[str, dict] | None,
                       current: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    """Zwraca wejścia i wyjścia; None oznacza pierwszy obieg bez zdarzeń."""
    if previous is None:
        return [], []
    return ([current[h] for h in current.keys() - previous.keys()],
            [previous[h] for h in previous.keys() - current.keys()])

MIL_CALLSIGN_PREFIXES = ("NATO", "MMF", "REDEYE", "BART", "OSY", "PLF", "HKY",
                         "VIPER", "WOLF", "FENIX", "DUKE", "TIGER", "KAPLAN",
                         "TUAF", "TURAF", "SOLOTURK")

# Jedno koło 250 NM (największy promień, jaki przyjmuje adsb.lol) nad LT/LV/EE i najbliższym
# Bałtykiem: od ~52,1° do ~60,6° N, czyli od Suwalszczyzny po Zatokę Fińską. Do 26.10.2026 były
# dwa koła po 220 NM — jedno zapytanie zamiast dwóch to więcej zapytań o listę w limicie 500/dobę.
# Sprawdzone 26.10 na serwerze: 200, 49 maszyn, ~30 KB.
BALTIC_GEO_POINTS = ((56.4, 24.5, 250),)
MIL_TYPES = {"F16", "F15", "F18", "FA18", "F35", "EUFI", "RFAL", "JAS39",
             "MIR2", "M2K", "SU27", "SU30", "SU35", "MIG29", "MIG31",
             "A10", "B1", "B2", "B52", "E3CF", "E3TF", "A400", "C130",
             "C17", "KC135", "ATLA"}
MIL_OPERATOR_WORDS = ("air force", "airforce", "army", "navy", "military",
                      "nato", "force aérienne", "luftwaffe", "Türk Hava",
                      "turkish af", "polish af")

# Nagłówek jak z przeglądarki — bez niego adsb.lol odrzuca żądanie (403).
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Darmowe, bezkluczowe źródło maszyn wojskowych (globalnie, filtrujemy bboxem).
# Jedyne od 26.10.2026 — dlaczego bez zapasu, patrz opis modułu.
MIL_ENDPOINTS = {
    "adsb.lol": "https://api.adsb.lol/v2/mil",
}
# Tymczasowy zapas (config.ADSB_ZAPAS): pytany TYLKO, gdy adsb.lol nie ma dla nas puli albo
# odmawia, i nie liczony do budżetu adsb.lol. adsb.fi ma inną ścieżkę geograficzną
# (/lat/{lat}/lon/{lon}/dist/{r}, lista pod „aircraft”) — sprawdzone 16.10.2026.
ZAPAS_ENDPOINTS = {
    "adsb.fi": "https://opendata.adsb.fi/api/v2",
}


async def _fetch_mil(client: httpx.AsyncClient) -> list[dict] | None:
    """Lista maszyn wojskowych od wybranego dostawcy.

    UWAGA (20.08.2026): adsb.lol zaczął odrzucać domyślny User-Agent bibliotek
    (`python-httpx/...`) z kodem 403 — dokładnie ten sam adres z nagłówkiem
    przeglądarki zwraca 200. Dlatego KAŻDE żądanie idzie z UA jak z przeglądarki.
    Nieznana nazwa w ADSB_PROVIDER (np. dawne „adsb.fi” albo „adsbx” w .env) spada
    na adsb.lol.
    """
    prov = config.ADSB_PROVIDER
    # wybrany dostawca pierwszy; nieznana nazwa nie ma adresu i zostaje pominięta
    order = [prov] + [p for p in MIL_ENDPOINTS if p != prov]
    last_err = None
    for name in order:
        url = MIL_ENDPOINTS.get(name)
        if not url:
            continue
        try:
            r = await _get(client, url)
            if r.status_code == 429:
                _zapamietaj_limit(r)
                # limit to nie awaria: status źródła ocenia świeżość ostatniego sukcesu
                # (monitoring.fresh), więc nie gasimy `ok` po jednym odrzuceniu
                status.update(error=f"{name}: limit zapytań, następna próba za {_przerwa_s():.0f} s")
                log.warning("ADS-B %s: limit zapytań (429), przerwa %.0f s", name, _przerwa_s())
                return None
            r.raise_for_status()
            status.update(ok=True, error=None,
                          provider=name if name == prov else f"{name}(fallback)")
            return r.json().get("ac") or []
        except Exception as e:
            last_err = f"{name}: {e}"
            log.warning("ADS-B %s nie odpowiada: %s", name, e)
    status.update(ok=False, error=last_err)
    _zapamietaj_awarie()
    return None


def _looks_military(ac: dict) -> bool:
    """Konserwatywna klasyfikacja rekordu z zapytania geograficznego."""
    try:
        if int(ac.get("dbFlags") or 0) & 1:  # tar1090: bit 0 = military
            return True
    except (TypeError, ValueError):
        pass
    callsign = (ac.get("flight") or "").strip().upper()
    if callsign.startswith(MIL_CALLSIGN_PREFIXES):
        return True
    ac_type = re.sub(r"[^A-Z0-9]", "", str(ac.get("t") or "").upper())
    if ac_type in MIL_TYPES:
        return True
    operator = str(ac.get("ownOp") or "").lower()
    return any(word.lower() in operator for word in MIL_OPERATOR_WORDS)


def _geo_url(provider: str, lat: float, lon: float, radius: int) -> str:
    """Adres zapytania geograficznego u danego dostawcy: `/v2/point/{lat}/{lon}/{r}`."""
    base = MIL_ENDPOINTS[provider].rsplit("/mil", 1)[0]
    return f"{base}/point/{lat}/{lon}/{radius}"


def _geo_aircraft(data: dict) -> list[dict]:
    """adsb.lol oddaje listę pod `ac`."""
    return data.get("ac") or []


# Przerwa po 429: adsb.lol podaje, po ilu sekundach okno się zwalnia (Retry-After albo
# x-ratelimit-reset). Do tego czasu nie pytamy wcale — każde kolejne 429 i tak liczy się do limitu
# (w logu 23–25.10: ~1100 odrzuceń dziennie, a sukcesów tylko tyle, ile zostało z 500).
_przerwa_do = 0.0


def _pierwsza_kwota(h) -> int | None:
    """Kwota polityki, która właśnie ogranicza: pierwsza liczba x-ratelimit-limit
    („500, 4;w=1, 60;w=60, 500;w=86400” → 500, „4, 4;w=1, …” → 4)."""
    try:
        return int(str(h.get("x-ratelimit-limit") or "").split(",")[0].split(";")[0])
    except ValueError:
        return None


def _zapamietaj_limit(r) -> None:
    global _przerwa_do
    h = r.headers
    try:
        s = float(h.get("retry-after") or h.get("x-ratelimit-reset") or 0)
    except ValueError:
        s = 0
    teraz = time.time()
    if _pierwsza_kwota(h) == config.ADSB_LIMIT_DOBA:
        # Dobowa pula wyczerpana: czekamy do resetu, który podał adsb.lol (do 26.10 przerwa
        # była ucięta do godziny — i co godzinę szło kolejne, zbędne 429).
        _budzet_aktualny(teraz)["uzyte"] = config.ADSB_LIMIT_DOBA
        _budzet_zapisz()
        _przerwa_do = teraz + min(max(s, 1.0), _do_polnocy_utc(teraz) + 60)
    else:
        # limit na sekundę albo minutę (albo bez nagłówków): krótka przerwa wg adsb.lol
        _przerwa_do = teraz + min(max(s, 1.0), 3600)


def _przerwa_s() -> float:
    return max(0.0, _przerwa_do - time.time())


# ── Dobowy budżet zapytań (patrz config.ADSB_ZAPAS_DOBA) ────────────────────
# Licznik zapytań tej doby UTC leży w pliku, bo restart serwera zerowałby plan i dokładał
# zapytanie od razu po starcie. Liczymy KAŻDE wysłane zapytanie, także zakończone 429.
_budzet = {"dzien": None, "uzyte": 0}
_odstep = float(config.ADSB_INTERVAL)       # ostatnio policzony odstęp (do pamięci koła)


def _budzet_plik():
    return config.DATA_DIR / "adsb_budzet.json"


def _dzien_utc(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d")


def _do_polnocy_utc(t: float) -> float:
    return 86400 - (t % 86400)


def _budzet_wczytaj() -> None:
    try:
        dane = json.loads(_budzet_plik().read_text(encoding="utf-8"))
        _budzet.update(dzien=str(dane["dzien"]), uzyte=int(dane["uzyte"]))
    except (OSError, ValueError, KeyError, TypeError):
        pass


def _budzet_zapisz() -> None:
    try:
        _budzet_plik().write_text(json.dumps(_budzet), encoding="utf-8")
    except OSError as e:
        log.warning("ADS-B: nie zapisałem budżetu zapytań: %s", e)


def _budzet_aktualny(t: float) -> dict:
    if _budzet["dzien"] != _dzien_utc(t):          # nowa doba UTC — adsb.lol zeruje pulę
        _budzet.update(dzien=_dzien_utc(t), uzyte=0)
    return _budzet


def _policz_zapytanie(r=None) -> None:
    """Jedno wysłane zapytanie. Gdy adsb.lol pokazuje stan puli dobowej (ogranicza właśnie
    ona), bierzemy jego liczbę — liczy też zapytania spoza tego procesu (curl, restart)."""
    b = _budzet_aktualny(time.time())
    b["uzyte"] += 1
    h = getattr(r, "headers", None) or {}
    if _pierwsza_kwota(h) == config.ADSB_LIMIT_DOBA:
        try:
            b["uzyte"] = max(b["uzyte"], config.ADSB_LIMIT_DOBA - int(h.get("x-ratelimit-remaining")))
        except (TypeError, ValueError):
            pass
    _budzet_zapisz()


def _zostalo(t: float) -> int:
    return (config.ADSB_LIMIT_DOBA - config.ADSB_ZAPAS_DOBA) - _budzet_aktualny(t)["uzyte"]


def _policz_odstep(t: float) -> float:
    """Ile czekać do następnego zapytania: pula, która została, rozłożona równo do północy UTC,
    nie gęściej niż co ADSB_INTERVAL. Pusta pula → czekamy do północy UTC."""
    zostalo = _zostalo(t)
    if zostalo <= 0:
        return _do_polnocy_utc(t) + 5
    return max(float(config.ADSB_INTERVAL), _do_polnocy_utc(t) / zostalo)


async def _get(client: httpx.AsyncClient, url: str):
    """Każde zapytanie do adsb.lol idzie tędy, żeby budżet liczył wszystkie."""
    naglowki = {"User-Agent": UA}
    if config.ADSBLOL_API_KEY:
        naglowki["x-api-key"] = config.ADSBLOL_API_KEY
    try:
        r = await client.get(url, headers=naglowki)
    except Exception:
        _policz_zapytanie()                      # mogło dojść do serwera — liczymy ostrożnie
        raise
    _policz_zapytanie(r)
    return r


# Każde koło bałtyckie ma swój krok w ADSB_PLAN; między krokami pokazujemy wynik jego ostatniego
# zapytania, ale nie dłużej niż przez jeden pełny obieg planu (~9 min) — starsza pozycja wojskowej
# maszyny myli bardziej, niż pomaga.
_geo_cache: dict[int, dict] = {}
_cykl = 0


def _geo_max_wiek_s() -> float:
    # odstęp bywa dłuższy niż ADSB_INTERVAL (budżet po restarcie), więc liczymy z bieżącego
    return len(config.ADSB_PLAN) * max(_odstep, config.ADSB_INTERVAL) + 60


def _geo_z_pamieci(now: float) -> list[dict]:
    return [ac for c in _geo_cache.values() if now - c["t"] <= _geo_max_wiek_s() for ac in c["lista"]]


async def _fetch_baltic_geo(client: httpx.AsyncClient, provider: str,
                            indeksy: tuple[int, ...] | None = None) -> list[dict]:
    """Wszystkie rekordy w dwóch kołach, potem lokalny filtr wojskowy.

    `/v2/mil` ominął nocne tureckie F-16, choć według użytkownika były widoczne
    w FR24. Zapytanie geograficzne usuwa zależność od flagi „military” dostawcy.
    Zapasowego hosta nie ma (opis modułu): gdy adsb.lol nie odpowiada, koła
    zostają puste, a status kół mówi o błędzie.
    """
    indeksy = tuple(range(len(BALTIC_GEO_POINTS))) if indeksy is None else indeksy
    order = [provider] + [p for p in MIL_ENDPOINTS if p != provider]
    last_error = None
    for name in order:
        if name not in MIL_ENDPOINTS:
            continue
        try:
            responses = await asyncio.gather(*[
                _get(client, _geo_url(name, *BALTIC_GEO_POINTS[i]))
                for i in indeksy
            ])
            merged = {}
            for i, response in zip(indeksy, responses):
                if response.status_code == 429:
                    _zapamietaj_limit(response)
                response.raise_for_status()
                w_kole = [{**ac, "_straznik_detection": "baltic_geo"}
                          for ac in _geo_aircraft(response.json()) if _looks_military(ac)]
                _geo_cache[i] = {"t": time.time(), "lista": w_kole}
                for ac in w_kole:
                    key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
                    merged[key] = ac
            candidates = list(merged.values())
            status["baltic_geo"] = {"ok": True, "provider": name,
                                    "candidates": len(candidates), "error": None}
            return candidates
        except Exception as exc:
            last_error = f"{name}: {exc!r}"
    status["baltic_geo"] = {"ok": False, "provider": None, "candidates": 0,
                            "error": last_error}
    return []


def _hold_impossible_jump(ac: dict, now: float) -> dict:
    """Skok niemożliwy dla maszyny = trzymamy ostatnią przyjętą pozycję.

    25.09.2026, zgłoszenie użytkownika: algierski C-130 (MLAT, nic=0) dostał dwie
    kolejne pozycje 82 i 71 km od faktycznej trasy — skoki 87 i 67 km w 60 s, czyli
    5232 i 4016 km/h. Ikona przeskakiwała wtedy w podlaskie i wracała, a odcinki
    trafiały do trasy jako prawdziwy przelot. Podmieniamy pozycję ZANIM policzy ją
    _classify, więc to samo trzyma ikonę, województwo, trasę i migawkę historii —
    inaczej trasa rozjechałaby się z ikoną.
    """
    hexid = ac.get("hex")
    lat, lon = ac.get("lat"), ac.get("lon")
    if not hexid or lat is None or lon is None:
        return ac
    prev = _last_pos.get(hexid)
    if prev:
        dt = now - prev["t"]
        # Kotwica starsza niż ślad i tak nic nie mówi o bieżącej pozycji.
        if 0 < dt <= TRAIL_MAX_AGE_S:
            kmh = geo.haversine_km(prev["lat"], prev["lon"], lat, lon) / dt * 3600
            if kmh > JUMP_MAX_KMH and dt < JUMP_HOLD_MAX_S:
                log.info("ADS-B %s: skok %.0f km/h odrzucony, trzymam pozycję", hexid, kmh)
                return {**ac, "lat": prev["lat"], "lon": prev["lon"],
                        "_straznik_position_held": True}
    _last_pos[hexid] = {"lat": lat, "lon": lon, "t": now}
    return ac


def _position_source(ac: dict) -> str:
    """MLAT / TIS-B / ADS-B — czym naprawdę jest ta pozycja.

    MLAT liczą odbiorniki z różnic czasu dotarcia sygnału; maszyna nie podaje
    wtedy swojego położenia i przy słabej geometrii błąd sięga dziesiątek
    kilometrów (25.09.2026: algierski C-130 dostał dwie kolejne pozycje 82 i
    71 km od faktycznej trasy, obie w podlaskiem). Bez tego pola karta maszyny
    w trybie serwerowym pisała „ADS-B" nad Białorusią, gdzie odbiorników nie ma.
    Reguła jest ta sama, co w trybie bez serwera (frontend/engine.js).
    """
    if ac.get("mlat"):
        return "MLAT"
    if ac.get("tisb"):
        return "TIS-B"
    return "ADS-B"


def _classify(ac: dict) -> dict | None:
    """Punktujemy tylko województwa priorytetowe, ale pokazujemy szerszą strefę
    (wschodnia flanka NATO), żeby było widać kontekst — np. tankowce nad Rumunią."""
    lat, lon = ac.get("lat"), ac.get("lon")
    if lat is None or lon is None:
        return None
    voiv = geo.voiv_for_point(lat, lon)
    if voiv is None and not geo.in_watch_area(lat, lon):
        return None
    callsign = (ac.get("flight") or "").strip()
    out = {
        "hex": ac.get("hex"), "callsign": callsign, "type": ac.get("t"),
        "lat": lat, "lon": lon, "alt": ac.get("alt_baro"),
        "gs": ac.get("gs"), "track": ac.get("track"), "voivodeship": voiv,
        "desc": ac.get("desc"),
        # wzbogacenie: rejestracja, operator, kategoria (A7=wiropłat),
        # prędkość pionowa [ft/min], rocznik — wszystko wprost z ADS-B/rejestru
        "reg": ac.get("r"), "op": ac.get("ownOp"), "cat": ac.get("category"),
        "vr": ac.get("baro_rate"), "year": ac.get("year"),
        "source": _position_source(ac),
        "detection": ac.get("_straznik_detection", "mil_registry"),
    }
    if ac.get("_straznik_position_held"):
        out["held"] = True
    return out


async def _pobierz_zapas(client: httpx.AsyncClient) -> tuple[list, list] | None:
    """Lista wojskowych i koło bałtyckie z zapasu — dwa zapytania na raz, co ADSB_ZAPAS_INTERVAL."""
    name = config.ADSB_ZAPAS
    base = ZAPAS_ENDPOINTS.get(name)
    if not base:
        return None
    try:
        r = await client.get(f"{base}/mil", headers={"User-Agent": UA})
        r.raise_for_status()
        ac_list = r.json().get("ac") or []
    except Exception as e:
        status.update(ok=False, error=f"{name}: {e}")
        log.warning("ADS-B zapas %s nie odpowiada: %s", name, e)
        return None
    geo_candidates = []
    try:
        for i, (lat, lon, radius) in enumerate(BALTIC_GEO_POINTS):
            g = await client.get(f"{base}/lat/{lat}/lon/{lon}/dist/{radius}", headers={"User-Agent": UA})
            g.raise_for_status()
            dane = g.json()
            w_kole = [{**ac, "_straznik_detection": "baltic_geo"}
                      for ac in (dane.get("aircraft") or dane.get("ac") or []) if _looks_military(ac)]
            _geo_cache[i] = {"t": time.time(), "lista": w_kole}
            geo_candidates += w_kole
        status["baltic_geo"] = {"ok": True, "provider": f"{name}(fallback)",
                                "candidates": len(geo_candidates), "error": None}
    except Exception as exc:
        status["baltic_geo"] = {"ok": False, "provider": None, "candidates": 0, "error": f"{name}: {exc!r}"}
    status.update(provider=f"{name}(fallback)")
    return ac_list, geo_candidates


# Awaria adsb.lol inna niż limit (27.10.2026 od 05:04 UTC: każde /v2/... → 400 z pustą treścią,
# także spoza naszego serwera). Zapas reagował tylko na pustą pulę i 429, więc mapa była pusta.
# Po takim błędzie przez ADSB_AWARIA_S bierzemy zapas, potem znów próbujemy adsb.lol.
_awaria_do = 0.0


def _zapamietaj_awarie() -> None:
    global _awaria_do
    _awaria_do = time.time() + config.ADSB_AWARIA_S


def _lol_dostepny(t: float) -> bool:
    return _zostalo(t) > 0 and _przerwa_s() == 0 and t >= _awaria_do


async def _tick(client: httpx.AsyncClient, zapas: bool = False):
    """Jeden krok planu ADSB_PLAN = dokładnie jedno zapytanie do adsb.lol.
    Z `zapas=True` (pula adsb.lol pusta albo przerwa po 429) dane idą z config.ADSB_ZAPAS."""
    global _watch_prev, _cykl
    if zapas:
        dane = await _pobierz_zapas(client)
        if dane is None:
            return
        ac_list, geo_candidates = dane
    else:
        if _przerwa_s() > 0:                  # po 429 czekamy, aż adsb.lol zwolni okno
            return
        krok = config.ADSB_PLAN[_cykl % len(config.ADSB_PLAN)]
        _cykl += 1
        selected = str(status.get("provider") or config.ADSB_PROVIDER).replace("(fallback)", "")
        if selected not in MIL_ENDPOINTS:
            selected = config.ADSB_PROVIDER
        if krok.startswith("kolo"):
            # krok koła tylko odświeża pamięć koła; mapę i próbki liczy krok listy
            await _fetch_baltic_geo(client, selected, (int(krok[4:]),))
            return
        ac_list = await _fetch_mil(client)
        if ac_list is None:
            return
        geo_candidates = _geo_z_pamieci(time.time())
    merged: dict[str, dict] = {}
    for ac in ac_list:
        key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
        merged[key] = {**ac, "_straznik_detection": "mil_registry"}
    for ac in geo_candidates:
        key = ac.get("hex") or f"{ac.get('lat')}:{ac.get('lon')}:{ac.get('flight')}"
        merged.setdefault(key, ac)
    ac_list = list(merged.values())
    status.update(ok=True, last=time.time(), error=None)
    # Tryb stealth: trasy tankowców/AWACS/rozpoznania do analizy wzorców (bez punktów).
    if config.SHADOW_AIR_SUPPORT:
        try:
            stealth.observe_air_support(ac_list)
        except Exception as exc:                  # noqa: BLE001
            log.warning("stealth air_support: %s", exc)

    per_voiv: dict[str, list] = {v: [] for v in geo.VOIV_BBOX}
    global current_aircraft
    current = []
    now = time.time()
    for ac in ac_list:
        c = _classify(_hold_impossible_jump(ac, now))
        if c:
            if c["voivodeship"] in per_voiv:
                per_voiv[c["voivodeship"]].append(c)
            current.append(c)
    current_aircraft = current
    for c in current:
        hexid = c.get("hex")
        if not hexid:
            continue
        pts = [p for p in trails.get(hexid, []) if now - p["t"] <= TRAIL_MAX_AGE_S]
        if not pts or geo.haversine_km(pts[-1]["lat"], pts[-1]["lon"], c["lat"], c["lon"]) >= TRAIL_MIN_KM:
            pts.append({"lat": round(c["lat"], 4), "lon": round(c["lon"], 4), "t": int(now)})
        trails[hexid] = pts[-TRAIL_MAX_PTS:]
    for hexid in [h for h, pts in trails.items() if not pts or now - pts[-1]["t"] > TRAIL_MAX_AGE_S]:
        trails.pop(hexid, None)
    for hexid in [h for h, q in _last_pos.items() if now - q["t"] > TRAIL_MAX_AGE_S]:
        _last_pos.pop(hexid, None)

    # Rejestrujemy przejścia co minutę, niezależnie od migawki mapy co 2 min.
    # Pierwszy obieg po restarcie tylko ustanawia bazę, żeby nie tworzyć lawiny
    # fałszywych „wejść”. Ostatnia znana pozycja jest zachowana także przy wyjściu.
    watch_now = {p["hex"]: p for p in current if p.get("hex") and _is_foreign_hex(p.get("hex"))}
    entered, exited = _watch_transitions(_watch_prev, watch_now)
    for plane in entered:
        db.add_adsb_watch_event("enter", plane)
    for plane in exited:
        db.add_adsb_watch_event("exit", plane)
    _watch_prev = watch_now

    hour_key = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
    # jeden zapis na wszystkie województwa zamiast szesnastu (audyt 20.09.2026)
    db.add_adsb_samples([(voiv, len(planes)) for voiv, planes in per_voiv.items()])
    for voiv, planes in per_voiv.items():
        n = len(planes)
        baseline = db.adsb_baseline(voiv, config.ADSB_BASELINE_DAYS)
        status["counts"][voiv] = n
        status["baselines"][voiv] = round(baseline, 2)
        spike = (baseline > 0 and n >= config.ADSB_MIN_COUNT
                 and n > config.ADSB_SPIKE_FACTOR * baseline)
        if spike:
            calls = ", ".join(p["callsign"] or p["hex"] for p in planes[:6])
            await fusion.ingest(
                source="adsb", event_type="adsb_spike", voivodeship=voiv,
                points=config.POINTS["adsb_spike"],
                title=(f"ADS-B: {n} maszyn wojskowych nad woj. {voiv} "
                       f"(baseline 7d: {baseline:.1f}) — {calls} · informacyjnie, bez punktów"),
                details={"count": n, "baseline": round(baseline, 2),
                         "aircraft": planes[:12]},
                # jeden sygnał na województwo na godzinę
                dedup_key=f"adsb:{voiv}:{hour_key}",
            )


async def run():
    global _odstep
    _budzet_wczytaj()
    # local_address="0.0.0.0" wymusza IPv4 (patrz config.ADSB_IPV4)
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0") if config.ADSB_IPV4 else None
    async with httpx.AsyncClient(timeout=25, transport=transport) as client:
        while True:
            lol = _lol_dostepny(time.time())       # pusta pula: adsb.lol nie pytamy do północy UTC
            if lol or config.ADSB_ZAPAS:
                try:
                    await _tick(client, zapas=not lol)
                except Exception as e:
                    log.warning("adsb tick błąd: %s", e)
            teraz = time.time()
            if config.ADSB_ZAPAS and not _lol_dostepny(teraz):
                # adsb.lol odmówił albo pula pusta — następny krok z zapasu, w jego rytmie
                _odstep = float(config.ADSB_ZAPAS_INTERVAL)
                b = _budzet_aktualny(teraz)
                status["budzet"] = {"dzien_utc": b["dzien"], "uzyte": b["uzyte"],
                                    "limit": config.ADSB_LIMIT_DOBA, "odstep_s": round(_odstep),
                                    "zapas": config.ADSB_ZAPAS}
                await asyncio.sleep(_odstep)
                continue
            _odstep = _policz_odstep(teraz)
            b = _budzet_aktualny(teraz)
            status["budzet"] = {"dzien_utc": b["dzien"], "uzyte": b["uzyte"],
                                "limit": config.ADSB_LIMIT_DOBA, "odstep_s": round(_odstep)}
            await asyncio.sleep(max(_odstep, _przerwa_s()))

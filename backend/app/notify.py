"""Kanały powiadomień: ntfy, Telegram, Web Push (VAPID). Wszystkie best-effort."""
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import json
import logging
from urllib.parse import urlparse

import httpx

from . import config, db
from .fusion import LEVEL_LABELS

log = logging.getLogger("notify")

_vapid: dict | None = None
_fcm_ready = False

# Widoczny w /api/health: bez tego cicha awaria wysyłki (błąd Google, wygasłe
# poświadczenia) nie dawała żadnego śladu — alarm po prostu nie docierał.
fcm_status = {"ready": False, "last_ok": None, "last_error": None, "sent": 0,
              "failed": 0, "last_ok_at": None, "last_error_at": None, "test_sent": 0,
              "crit_sent": 0, "crit_failed": 0}

# Alarm jest ważny minuty, nie tygodnie. Domyślny TTL w FCM to 4 tygodnie, więc
# telefon po nocy offline dostawał pełnoekranową syrenę o zdarzeniu sprzed godzin.
FCM_TTL_S = 900
# iOS: ładunek APNs ma twardy limit 4096 bajtów, a FCM wkłada do niego także całe
# `data`. Powiadomienie iPhone'a budujemy z zapasem i przycinamy powody.
APNS_PAYLOAD_BUDGET = 3700
# Ile czasu APNs ma próbować dostarczyć alarm. Tyle samo, ile Androidowy próg
# „spóźnione" (Alarms.STALE_AFTER_MS = 10 min): iPhone nie umie pokazać starej
# wiadomości ciszej, więc lepiej, żeby jej nie dostał wcale.
APNS_EXPIRATION_S = 600
FCM_RETRIES = 3
# Alarm krytyczny iPhone'a (Critical Alerts). Apple przyznało entitlement dla
# pl.straznik.app 28.09.2026. Dźwięk krytyczny przebija wyciszenie i tryb Nie
# przeszkadzać, ale wymaga naraz: entitlementu w aplikacji, `sound` jako SŁOWNIKA
# w ładunku i osobnej zgody użytkownika (UNNotificationSettings.criticalAlertSetting).
#
# Dlaczego osobny temat, a nie flaga na dotychczasowym: na `voiv_*` siedzą
# wszystkie telefony z Androidem i iPhone'y ze starszymi wydaniami, bez
# entitlementu. Zachowania Apple przy takim telefonie nie sprawdziliśmy na
# urządzeniu, a to jest alarm — nie wolno go zepsuć tym, którzy już go mają.
# Aplikacja iOS po uzyskaniu zgody PRZEPISUJE się z `voiv_X` na `voiv_X_krytyczne`,
# więc na krytyczny temat musi lecieć KAŻDY poziom (żółty też), inaczej ci ludzie
# przestaliby dostawać ostrzeżenia. Krytyczny jest wyłącznie DŹWIĘK czerwonego.
CRITICAL_TOPIC_SUFFIX = "_krytyczne"


def _temat_bazowy(topic: str) -> str:
    """Temat bez sufiksu krytycznego — do sklejania powiadomień na iPhonie.

    Zgłoszone przez sesję iOS 28.09.2026: przepisanie telefonu z `voiv_X` na
    `voiv_X_krytyczne` to dwie operacje w Firebase i bezpieczna kolejność
    (najpierw zapis, potem wypis) zostawia chwilę, w której telefon siedzi na
    obu tematach. Gdyby `apns-collapse-id` różnił się między wariantami, iPhone
    pokazałby wtedy DWA banery o tym samym zdarzeniu. Ten sam identyfikator
    sprawia, że system skleja je w jeden — a przy alarmie liczy się jedna
    jasna informacja, nie dwie takie same.
    """
    if topic.endswith(CRITICAL_TOPIC_SUFFIX):
        return topic[: -len(CRITICAL_TOPIC_SUFFIX)]
    return topic
# Audyt bezpieczeństwa 16.09.2026: FCM i Web Push dzieliły domyślną pulę wątków, więc
# zalew (fałszywych) subskrypcji Web Push kolejkował wysyłkę alarmu do aplikacji.
# FCM ma własną pulę, a Web Push idzie najwyżej po WEBPUSH_CONCURRENCY naraz.
_fcm_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="fcm")
# 10.10.2026: Web Push też ma własną pulę. Szedł przez asyncio.to_thread, czyli
# domyślną pulę min(32, rdzenie + 4) — na dwurdzeniowym VPS to 6 wątków, więc
# WEBPUSH_CONCURRENCY = 16 nic nie dawało. Każda wysyłka zestawiała przy tym nowe
# połączenie TLS i pytała DNS: stałe ~16/s (lubelskie, 2065 subskrypcji = 142 s
# do ostatniej osoby), a 08.10, gdy resolwery Hetznera nie odpowiadały, 1,2/s —
# 26 minut. Połączenie trzymane per wątek: pomiar na VPS (nieistniejące tokeny)
# 32 → 130/s dla FCM, 12 → 33/s dla Apple.
WEBPUSH_CONCURRENCY = 32
_webpush_pool = ThreadPoolExecutor(max_workers=WEBPUSH_CONCURRENCY,
                                   thread_name_prefix="webpush")
_webpush_local = threading.local()
# Wysyłka dłuższa niż to trafia do dziennika jako ostrzeżenie (zwykle ~30 s).
WEBPUSH_SLOW_S = 60

_WEBPUSH_HOSTS = {"fcm.googleapis.com", "web.push.apple.com"}
_WEBPUSH_HOST_SUFFIXES = (".push.services.mozilla.com", ".notify.windows.com")


def init_fcm():
    """Inicjalizuje Firebase Admin SDK (raz), jeśli jest plik konta serwisowego."""
    global _fcm_ready
    if not config.FCM_ENABLED:
        return
    import os
    if not os.path.exists(config.FCM_CREDENTIALS_PATH):
        log.warning("FCM: brak pliku poświadczeń %s — push do aplikacji wyłączony",
                    config.FCM_CREDENTIALS_PATH)
        return
    try:
        import firebase_admin
        from firebase_admin import credentials
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(config.FCM_CREDENTIALS_PATH))
        _fcm_ready = True
        fcm_status["ready"] = True
        log.info("FCM zainicjalizowany")
    except Exception as e:
        log.warning("FCM init błąd: %s", e)


def _godzina(sent_at) -> str:
    """„HH:MM · " z czasu wysyłki, w strefie warszawskiej. Pusto, gdy czasu nie ma
    albo nie da się go odczytać — powiadomienie ma wyjść nawet wtedy."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    try:
        dt = datetime.fromisoformat(str(sent_at))
    except (TypeError, ValueError):
        return ""
    try:
        return dt.astimezone(ZoneInfo("Europe/Warsaw")).strftime("%H:%M") + " · "
    except Exception:                                  # noqa: BLE001
        return ""


def _apns_config(topic: str, data: dict, critical: bool = False):
    """Powiadomienie dla iPhone'a — Android ten blok ignoruje.

    Android dostaje wiadomość data-only i sam buduje alarm (StraznikFcmService).
    Na iOS data-only przy zamkniętej aplikacji nie wyświetla niczego i nie budzi
    aplikacji, więc tytuł, treść i dźwięk musi podać serwer. Tekst jak w
    Alarms.postAlarm na Androidzie. Zwraca None, gdy `data` jest tak duże, że
    ładunek nie zmieściłby się w limicie — wtedy wysyłamy wiadomość bez bloku
    iOS, żeby nie stracić alarmu na Androidzie.
    """
    from firebase_admin import messaging

    def size(value) -> int:
        return len(json.dumps(value, ensure_ascii=False).encode())

    level = data.get("level", "")
    high = level == "high"
    # Krócej niż tytuł Androida: iPhone przycina go do jednej linii, a na zrzucie
    # z 19.09.2026 („TEST — WYSOKI PRIORYTET: woj. lubelski…”) ucięło się właśnie
    # województwo — czyli najważniejsze słowo. Bez „woj.” i bez punktów w tytule
    # nazwa regionu mieści się zawsze; punkty otwierają treść.
    title = (("TEST — " if topic.startswith(config.TEST_TOPIC_PREFIX) else "")
             + f"{LEVEL_LABELS.get(level, level)}: {data.get('voiv', '')}")
    tail = [("Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien i śledź komunikaty RCB."
             if high else "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB."),
            "NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO."]
    # ~400 bajtów na klucze aps, dźwięk, thread-id i identyfikatory dokładane przez FCM
    used = size(data) + size(title) + size("\n".join(tail)) + 400
    if used > APNS_PAYLOAD_BUDGET:
        log.warning("FCM %s: data %d B — pomijam blok iOS, żeby nie stracić wysyłki",
                    topic, size(data))
        return None
    lines = []
    reasons = [x.strip() for x in (data.get("reasons") or "").split("\n") if x.strip()][:4]
    # punkty otwierają treść, skoro zeszły z tytułu; przed nimi GODZINA WYSYŁKI
    # (prośba użytkownika 24.09.2026). iPhone pokazuje własny znacznik czasu dopiero
    # w Centrum powiadomień — na banerze nie widać go wcale, a przy spóźnionym pushu
    # liczy się moment, w którym serwer stwierdził zagrożenie, nie moment dotarcia.
    czolo = f"{_godzina(data.get('sent_at'))}{data.get('score', '')} pkt"
    if data.get("headline"):
        czolo += f" — {data['headline']}"
    for line in [czolo] + reasons:
        if used + size(line) > APNS_PAYLOAD_BUDGET:
            break
        lines.append(line)
        used += size(line)
    return messaging.APNSConfig(
        headers={
            "apns-priority": "10",                                 # natychmiast
            "apns-push-type": "alert",
            # Krócej niż ttl Androida (15 min) i równo z jego progiem „spóźnione".
            # Android spóźnioną wiadomość pokazuje cicho i dopisuje „— opóźnione o X min"
            # (Alarms.postAlarm), bo buduje powiadomienie sam. Na iOS baner rysuje system
            # z gotowego ładunku, więc wiadomość sprzed kwadransa zawyłaby syreną jak
            # świeża. Dlatego po dziesięciu minutach APNs ma ją po prostu skasować.
            "apns-expiration": str(int(time.time()) + APNS_EXPIRATION_S),
            # bez sufiksu krytycznego: w chwili przepisywania telefonu ten sam
            # alarm leci na oba tematy i ma się skleić w jeden baner
            "apns-collapse-id": _temat_bazowy(topic),              # jak collapse_key
        },
        payload=messaging.APNSPayload(aps=messaging.Aps(
            alert=messaging.ApsAlert(title=title, body="\n".join(lines + tail)),
            # dźwięki dołączone do aplikacji iOS (kopie res/raw z Androida).
            # Dźwięk krytyczny (przebija wyciszenie i Nie przeszkadzać) TYLKO dla
            # czerwonego i tylko na temacie dla telefonów ze zgodą — żółty nie ma
            # prawa budzić nikogo przy pełnej głośności.
            sound=(messaging.CriticalSound(name="alarm_syrena.wav", critical=True, volume=1.0)
                   if (critical and high) else
                   ("alarm_syrena.wav" if high else "alert_uwaga.wav")),
            thread_id=_temat_bazowy(topic),
            # firebase-admin 7.5 nie ma pola interruption_level — idzie przez custom_data.
            # Czerwony jako „time-sensitive" przebija tryb Skupienia, żółty jako
            # „active" nie budzi w nocy (decyzja 18.09.2026). Przy zgodzie na alarm
            # krytyczny czerwony idzie o poziom wyżej: „critical".
            custom_data={
                "interruption-level": ("critical" if (critical and high)
                                       else ("time-sensitive" if high else "active")),
                "relevance-score": 1.0 if high else 0.6,
            },
        )),
    )


def _apns_safe(topic: str, data: dict, critical: bool = False):
    """_apns_config, ale żaden jego błąd nie przewraca wysyłki na Androida."""
    try:
        return _apns_config(topic, data, critical)
    except Exception as exc:                      # noqa: BLE001
        log.warning("FCM %s: blok iOS pominięty (%r)", topic, exc)
        return None


def _send_fcm_sync(topic: str, data: dict, critical: bool = False) -> str:
    from datetime import timedelta
    from firebase_admin import messaging
    msg = messaging.Message(
        topic=topic,
        data=data,
        # wysoki priorytet: dociera od razu, przebija Doze; brak bloku `notification`,
        # bo powiadomienie (z pełnym ekranem dla czerwonego) buduje natywny
        # StraznikFcmService — wiadomości `data-only` trafiają do niego zawsze,
        # także przy zamkniętej aplikacji, i nie są przechwytywane przez system.
        # `ttl`: wiadomość nieaktualna ma przepaść, a nie wyć po powrocie zasięgu.
        # `direct_boot_ok`: telefon po nocnym restarcie, przed pierwszym
        # odblokowaniem, bez tego nie dostaje nic.
        # `collapse_key`: kolejny stan tego samego województwa zastępuje poprzedni.
        android=messaging.AndroidConfig(
            priority="high",
            ttl=timedelta(seconds=FCM_TTL_S),
            collapse_key=topic,
            direct_boot_ok=True,
        ),
        # tylko iPhone: FCM wysyła ten blok wyłącznie na iOS. Błąd w budowaniu
        # powiadomienia iOS nie może zabrać alarmu Androidowi — stąd osłona.
        apns=_apns_safe(topic, data, critical),
    )
    return messaging.send(msg)


def fcm_topic(voiv: str, test: bool = False) -> str:
    """Temat FCM. Prawdziwy (voiv_*) tylko na produkcji i nigdy dla testu (E4)."""
    topic = config.voiv_topic(voiv)
    if test or not config.PRODUCTION:
        return config.TEST_TOPIC_PREFIX + topic
    return topic


def fcm_topic_krytyczny(voiv: str, test: bool = False) -> str:
    """Temat dla iPhone'ów, którym użytkownik pozwolił na alarm krytyczny.

    Ten sam slug co zwykły temat plus sufiks — aplikacja iOS liczy go tak samo
    (pilnuje tego scripts/test_tematy_fcm.py)."""
    return fcm_topic(voiv, test) + CRITICAL_TOPIC_SUFFIX


def alarm_headline(signals: list[dict]) -> str:
    """Pierwsza linia alarmu: CO i GDZIE (audyt B10).

    Tytuł „PODWYŻSZONA UWAGA: woj. X (2.0 pkt)" z listą „[neptun] … (+x pkt)" nie
    mówił człowiekowi wybudzonemu o 3:00, co leci i ile ma czasu."""
    counted = [x for x in signals or [] if (x.get("counted_points") or 0) > 0]
    counted.sort(key=lambda x: x.get("counted_points") or 0, reverse=True)
    if any(x.get("event_type") in ("rso_alert", "rcb_alert") for x in counted):
        return "Oficjalny Alert RCB dla województwa"
    for x in counted:
        d = x.get("details") or {}
        if x.get("source") == "neptun":
            from .collectors.neptun import threat_label_pl
            dist = d.get("distance_display_km") or d.get("dist_km")
            line = f"{threat_label_pl(d.get('type'))} ok. {round(dist)} km od granicy" if dist else \
                threat_label_pl(d.get("type"))
            if d.get("eta_alarm") and d.get("eta_border_min") is not None:
                line += f", dolot do granicy ok. {d['eta_border_min']} min"
            return line
        if x.get("event_type") == "ua_alert_border" and d.get("oblast"):
            return f"Alarm powietrzny w obwodzie {d['oblast']} (Ukraina)"
        if x.get("source") == "media":
            return "Doniesienia mediów o zagrożeniu z powietrza"
    return "Kilka sygnałów pomocniczych naraz"


_TRUSTED_NORM: set[str] | None = None


def quotable_title(signal: dict) -> bool:
    """Czy tytuł sygnału można dosłownie wstawić do powiadomienia.

    Sygnały medialne z wyników Google News (dowolne strony) tylko od redakcji
    z config.MEDIA_PUSH_TRUSTED_PUBLISHERS; kanały RSS wpisane w konfiguracji
    bezpośrednio (redakcje lokalne, LRT/LSM/ERR) i tytuły budowane przez nas
    (fala QRA, alarmy UA, NEPTUN, RSO) — zawsze."""
    global _TRUSTED_NORM
    if signal.get("source") != "media" or signal.get("event_type") == "media_qra_wave":
        return True
    d = signal.get("details") or {}
    feed = d.get("feed") or ""
    if feed and "news.google." not in feed:
        return True
    if signal.get("event_type", "").startswith("baltic_"):
        return True
    from .collectors.rss_media import _norm_publisher
    if _TRUSTED_NORM is None:
        _TRUSTED_NORM = {_norm_publisher(p) for p in config.MEDIA_PUSH_TRUSTED_PUBLISHERS}
    return bool(d.get("publisher")) and _norm_publisher(d["publisher"]) in _TRUSTED_NORM


def reasons_split(signals: list[dict]) -> str:
    """„Oficjalnie" osobno od „Wskaźniki" — oficjalny alert rozstrzyga, reszta nie."""
    official, other = [], []
    for x in signals or []:
        pts = x.get("counted_points", x.get("points"))
        title = x.get("title", "") if quotable_title(x) else "Doniesienie medialne"
        line = f"• {title} (+{pts} pkt)"
        (official if x.get("event_type") in ("rso_alert", "rcb_alert") and (pts or 0) > 0
         else other).append(line)
    parts = []
    if official:
        parts.append("Oficjalnie:\n" + "\n".join(official[:3]))
    if other:
        parts.append("Wskaźniki (nieoficjalne):\n" + "\n".join(other[:6]))
    return "\n".join(parts)


async def send_fcm(voiv: str, level: str, score: float, reasons_text: str,
                   test: bool = False, headline: str = "") -> bool:
    """Zwraca True po udanej wysyłce. Ponawia, bo jedno chwilowe 503 od Google
    gubiło alarm bezpowrotnie — cooldown blokował kolejną próbę."""
    if not (config.FCM_ENABLED and _fcm_ready):
        return False
    from datetime import datetime, timezone
    topic = fcm_topic(voiv, test)
    sent_at = datetime.now(timezone.utc)
    data = {"voiv": voiv, "level": level, "score": str(score),
            "reasons": reasons_text or "",
            "headline": headline or "",
            # klient odrzuca/wycisza wiadomość starszą niż kilka minut i nie
            # pokazuje dwa razy tego samego zdarzenia
            "sent_at": sent_at.isoformat(timespec="seconds"),
            "event_id": f"{voiv}|{level}|{int(sent_at.timestamp())}"}

    async def wyslij(nazwa: str, critical: bool) -> bool:
        last_error = None
        for attempt in range(1, FCM_RETRIES + 1):
            try:
                mid = await asyncio.get_running_loop().run_in_executor(
                    _fcm_pool, _send_fcm_sync, nazwa, data, critical)
                log.info("FCM → %s (%s pkt, próba %d): %s", nazwa, score, attempt, mid)
                return True
            except Exception as e:
                last_error = e
                log.warning("FCM błąd (%s, próba %d/%d): %s", nazwa, attempt, FCM_RETRIES, e)
                if attempt < FCM_RETRIES:
                    await asyncio.sleep(2 * attempt)
        fcm_status.update(last_error=repr(last_error), last_error_at=time.time())
        return False

    ok = await wyslij(topic, False)
    if ok:
        fcm_status.update(last_ok=sent_at.isoformat(timespec="seconds"),
                          last_ok_at=time.time(), last_error=None,
                          sent=fcm_status["sent"] + 1)
    else:
        fcm_status.update(failed=fcm_status["failed"] + 1)

    # Temat krytyczny to JEDYNY kanał iPhone'ów, które zgodziły się na alarm
    # przebijający wyciszenie — one nie słuchają już `voiv_*`. Wysyłka musi więc
    # iść niezależnie od wyniku tej pierwszej i być osobno widoczna w /api/health,
    # bo jej cicha awaria oznacza ciszę u tych ludzi, a nie u nikogo.
    krytyczny = topic + CRITICAL_TOPIC_SUFFIX
    if await wyslij(krytyczny, True):
        fcm_status["crit_sent"] = fcm_status.get("crit_sent", 0) + 1
    else:
        fcm_status["crit_failed"] = fcm_status.get("crit_failed", 0) + 1
        log.error("FCM: alarm NIE poszedł na %s — iPhone'y ze zgodą na alarm "
                  "krytyczny nic nie dostały", krytyczny)
    return ok


def init_vapid():
    """Generuje (raz) i wczytuje klucze VAPID do Web Push."""
    global _vapid
    if not config.WEBPUSH_ENABLED:
        return
    if config.VAPID_PATH.exists():
        _vapid = json.loads(config.VAPID_PATH.read_text())
        return
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        import base64
        key = ec.generate_private_key(ec.SECP256R1())
        priv = key.private_numbers().private_value.to_bytes(32, "big")
        pub = key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        _vapid = {"private_key": b64(priv), "public_key": b64(pub)}
        config.VAPID_PATH.write_text(json.dumps(_vapid))
        log.info("Wygenerowano nowe klucze VAPID")
    except Exception as e:
        log.warning("Nie udało się wygenerować VAPID: %s", e)


def vapid_public_key() -> str | None:
    return _vapid["public_key"] if _vapid else None


def _decode_webpush_key(value: str) -> bytes:
    if not isinstance(value, str) or not value:
        raise ValueError("missing Web Push key")
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def validate_push_subscription(sub: dict) -> bool:
    """Accept only complete browser subscriptions before persisting them.

    Browsers use FCM, Mozilla, Apple and Windows push services.  Both the
    provider allow-list and structural key validation prevent arbitrary or
    corrupt public POSTs from poisoning the delivery queue or becoming SSRF
    targets during a later alarm.
    """
    if not isinstance(sub, dict):
        return False
    endpoint = sub.get("endpoint")
    if not isinstance(endpoint, str) or not endpoint.startswith("https://"):
        return False
    parsed = urlparse(endpoint)
    host = (parsed.hostname or "").lower()
    if (not host or len(endpoint) > 4096 or parsed.username or parsed.password
            or (host not in _WEBPUSH_HOSTS
                and not host.endswith(_WEBPUSH_HOST_SUFFIXES))):
        return False
    keys = sub.get("keys")
    if not isinstance(keys, dict):
        return False
    try:
        p256dh = _decode_webpush_key(keys.get("p256dh"))
        auth = _decode_webpush_key(keys.get("auth"))
    except (TypeError, ValueError, UnicodeError, base64.binascii.Error):
        return False
    return len(p256dh) == 65 and p256dh[:1] == b"\x04" and len(auth) == 16


def _push_ref(sub: dict) -> str:
    """Non-sensitive identifier suitable for logs."""
    endpoint = str(sub.get("endpoint") or "")
    host = urlparse(endpoint).hostname or "unknown"
    digest = hashlib.sha256(endpoint.encode()).hexdigest()[:12]
    return f"{host}#{digest}"


async def send_ntfy(title: str, body: str, priority: str):
    if not (config.NTFY_ENABLED and config.NTFY_TOPIC):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"{config.NTFY_SERVER.rstrip('/')}/{config.NTFY_TOPIC}",
                content=body.encode(),
                headers={
                    "Title": title.encode("ascii", "backslashreplace").decode(),
                    "Priority": priority,   # default | high | urgent
                    "Tags": "rotating_light" if priority == "urgent" else "warning",
                },
            )
    except Exception as e:
        log.warning("ntfy błąd: %s", e)


async def send_telegram(text: str):
    if not (config.TELEGRAM_ENABLED and config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(
                f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": config.TELEGRAM_CHAT_ID, "text": text,
                      "disable_web_page_preview": True},
            )
    except Exception as e:
        log.warning("telegram błąd: %s", e)


def _webpush_session():
    """Sesja HTTP tego wątku puli: DNS i TLS raz na usługę, nie przy każdej wysyłce."""
    session = getattr(_webpush_local, "session", None)
    if session is None:
        try:
            import requests
        except ImportError:        # testy offline bez requests: pywebpush zrobi własne
            return None
        session = _webpush_local.session = requests.Session()
    return session


def _zerwane_polaczenie(exc: Exception) -> bool:
    """Połączenie trzymane godzinami między alarmami bywa zamknięte przez drugą
    stronę. Takie zerwanie ponawiamy raz na świeżym połączeniu; przekroczenia
    czasu NIE — podwoiłyby czekanie przy wolnej usłudze."""
    try:
        import requests
    except ImportError:
        return False
    return (isinstance(exc, requests.exceptions.ConnectionError)
            and not isinstance(exc, requests.exceptions.Timeout))


def _send_webpush_sync(sub: dict, payload: str):
    from pywebpush import webpush, WebPushException
    ref = _push_ref(sub)
    for proba in (1, 2):
        try:
            response = webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=_vapid["private_key"],
                vapid_claims={"sub": config.VAPID_CONTACT},
                timeout=10,
                ttl=300,
                requests_session=_webpush_session(),
            )
            return {"status": "sent", "ref": ref,
                    "http": getattr(response, "status_code", None)}
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            # 404/410 explicitly mean an expired endpoint.  A 400 may concern one
            # corrupt subscription, but it can also expose a shared request/VAPID
            # fault.  Defer deletion until the batch proves that other endpoints
            # accepted the same notification.
            if status in (400, 404, 410):
                return {"status": "expired" if status in (404, 410) else "invalid",
                        "ref": ref, "http": status, "endpoint": sub.get("endpoint", "")}
            else:
                log.warning("WebPush błąd %s (HTTP %s): %s", ref, status, e)
                return {"status": "error", "ref": ref, "http": status}
        except Exception as e:
            if proba == 1 and _zerwane_polaczenie(e):
                _webpush_local.session = None      # następna próba: nowe połączenie
                continue
            log.warning("WebPush błąd %s: %s", ref, e)
            return {"status": "error", "ref": ref, "http": None}


async def send_webpush(voiv: str, title: str, body: str, level: str):
    if not (config.WEBPUSH_ENABLED and _vapid):
        return
    payload = json.dumps({"title": title, "body": body, "level": level}, ensure_ascii=False)
    subs = await asyncio.to_thread(db.all_push_subs, voiv)
    gate = asyncio.Semaphore(WEBPUSH_CONCURRENCY)
    loop = asyncio.get_running_loop()
    started = time.monotonic()

    async def one(sub):
        async with gate:
            return await loop.run_in_executor(_webpush_pool, _send_webpush_sync, sub, payload)

    results = await asyncio.gather(*[one(s) for s in subs], return_exceptions=True)
    took = time.monotonic() - started
    sent = sum(isinstance(r, dict) and r.get("status") == "sent" for r in results)
    removable = [r for r in results if isinstance(r, dict)
                 and (r.get("status") == "expired"
                      or (r.get("status") == "invalid" and sent > 0))]
    for result in removable:
        db.remove_push_sub(result.get("endpoint", ""))
        log.info("WebPush usunięto niedziałającą subskrypcję %s (HTTP %s)",
                 result.get("ref"), result.get("http"))
    removed = len(removable)
    errors = len(results) - sent - removed
    log.log(logging.WARNING if took > WEBPUSH_SLOW_S else logging.INFO,
            "WebPush %s: wysłano=%d, usunięto=%d, błędy=%d, razem=%d, czas=%.0f s",
            voiv, sent, removed, errors, len(results), took)
    return sent


_inflight: set[tuple] = set()


async def notify_level(voiv: str, level: str, score: float, signals: list[dict],
                       log_id: int | None = None):
    """Wysyłka po przekroczeniu progu (rising edge) z cooldownem per woj./poziom.

    Cooldown zapisujemy DOPIERO po udanej wysyłce. Wcześniej zapis szedł przed
    wysyłką, więc jeden błąd sieci gubił alarm na cały okres cooldownu.
    """
    from datetime import datetime, timedelta, timezone
    from . import alert_log
    last = db.last_notif(voiv, level)
    if last:
        last_dt = datetime.fromisoformat(last)
        if datetime.now(timezone.utc) - last_dt < timedelta(minutes=config.NOTIFY_COOLDOWN_MIN):
            alert_log.record_delivery(log_id, "cooldown", {"last_notif": last})
            return
    if is_test_alarm(signals) or not config.PRODUCTION:
        await _deliver_test(voiv, level, score, signals)
        alert_log.record_delivery(log_id, "test", {"topic": fcm_topic(voiv, True),
                                                   "production": config.PRODUCTION})
        return
    key = (voiv, level)
    if key in _inflight:          # okresowa reewaluacja nie może dublować wysyłki
        return
    _inflight.add(key)
    try:
        await _deliver_level(voiv, level, score, signals, log_id)
    finally:
        _inflight.discard(key)


def is_test_alarm(signals: list[dict]) -> bool:
    """Czy do poziomu dokłada się choćby jeden sygnał testowy (E4)."""
    return any(s.get("source") == "test" or (s.get("details") or {}).get("test")
               for s in signals or [])


async def _deliver_test(voiv: str, level: str, score: float, signals: list[dict]):
    """Test nigdy nie dotyka prawdziwych odbiorców: tylko temat test_voiv_*,
    bez Web Push, ntfy, Telegrama i bez zapisu cooldownu w dzienniku."""
    from .fusion import breakdown_text
    ok = await send_fcm(voiv, level, score, "[TEST] " + breakdown_text(signals), test=True)
    if ok:
        fcm_status["test_sent"] = fcm_status.get("test_sent", 0) + 1
    log.warning("TEST (bez prawdziwych odbiorców): woj. %s %s %s pkt → %s, wysłano=%s",
                voiv, level, score, fcm_topic(voiv, True), ok)


async def _deliver_level(voiv: str, level: str, score: float, signals: list[dict],
                         log_id: int | None = None):
    label = LEVEL_LABELS[level]
    headline = alarm_headline(signals)
    reasons = reasons_split(signals)
    eta_alarm = any((s.get("details") or {}).get("eta_alarm") for s in signals)
    eta_note = ("\nSzacunek czasu dolotu; dane źródłowe mogą być opóźnione o kilka minut."
                if eta_alarm else "")
    reasons_for_push = reasons + eta_note
    title = f"{label}: woj. {voiv} ({score} pkt)"
    todo = ("Co zrobić: przejdź do miejsca schronienia lub pomieszczenia bez okien i śledź komunikaty RCB."
            if level == "high" else "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB.")
    body = (f"{headline}\n"
            f"{reasons_for_push}\n{todo}\n"
            f"NIEOFICJALNE źródło dodatkowe — w razie realnego zagrożenia "
            f"kieruj się syrenami/RCB/RSO.")
    ntfy_prio = "urgent" if level == "high" else "default"
    from datetime import datetime, timezone
    from . import alert_log

    def teraz() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    # Web Push rusza razem z resztą, ale na niego NIE czekamy z zapisem: do 10.10
    # wiersz dziennika stał na „pending”, dopóki nie skończyła się najwolniejsza
    # wysyłka — 08.10 przez 26 minut, choć aplikacje miały alarm po sekundzie.
    started = time.monotonic()
    web_task = asyncio.create_task(send_webpush(voiv, title, body, level))
    results = await asyncio.gather(
        send_ntfy(title, body, ntfy_prio),
        send_telegram(f"{'🚨' if level == 'high' else '⚠️'} {title}\n{body}"),
        send_fcm(voiv, level, score, reasons_for_push, headline=headline),
        return_exceptions=True,
    )
    fcm_ok = results[2]
    delivery = {
        "at": teraz(),
        "fcm": fcm_ok if isinstance(fcm_ok, bool) else repr(fcm_ok)[:200],
        "fcm_topic": fcm_topic(voiv),
        "title": title,
    }
    if fcm_ok is True:
        # aplikacje mają sygnał: cooldown i dziennik od razu, Web Push dopiszemy
        alert_log.record_delivery(log_id, "sent", {**delivery, "webpush_sent": "w toku"})
        db.log_notif(voiv, level)
    try:
        web_sent = await web_task
    except Exception as exc:                   # noqa: BLE001
        web_sent = exc
    delivered = (fcm_ok is True) or (isinstance(web_sent, int) and web_sent > 0)
    channels_off = not (config.FCM_ENABLED or config.WEBPUSH_ENABLED)
    alert_log.record_delivery(log_id, "sent" if delivered else
                              ("channels_off" if channels_off else "undelivered"), {
        **delivery,
        "webpush_sent": web_sent if isinstance(web_sent, int) else repr(web_sent)[:200],
        "webpush_at": teraz(),
        "webpush_s": round(time.monotonic() - started, 1),
    })
    if delivered or channels_off:
        if fcm_ok is not True:                 # przy udanym FCM cooldown zapisany wyżej
            db.log_notif(voiv, level)
    else:
        # Bez zapisu cooldownu: kolejny wzrost poziomu pójdzie od razu, bez czekania
        # NOTIFY_COOLDOWN_MIN. Same ponowienia robi już send_fcm (FCM_RETRIES).
        log.error("ALARM NIEDOSTARCZONY: woj. %s, poziom %s (%s pkt) — FCM=%r, WebPush=%r",
                  voiv, level, score, fcm_ok, web_sent)

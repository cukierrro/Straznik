"""Czy serwer naprawdę działa — nadzorca zadań, świeżość źródeł, sygnał życia.

Audyt 11.09.2026 (D1, D2/C8): kolektory startowały jako zadania bez nadzoru,
więc jeden nieoczekiwany wyjątek zatrzymywał np. RSO na zawsze, a dioda świeciła
na zielono. Pad serwera w nocy wychodził na jaw dopiero rano.

  * start()           — każde zadanie w tle ma nadzorcę, który je wznawia;
  * fresh()           — „ok" tylko przy ostatnim sukcesie młodszym niż 3 cykle;
  * critical_check()  — to, bez czego alarm nie dojdzie (RSO, NEPTUN, FCM, tryb);
  * heartbeat_loop()  — ping do zewnętrznej usługi tylko, gdy wszystko działa.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from . import config, notify
from .collectors import neptun, rso

log = logging.getLogger("monitoring")

tasks: dict[str, asyncio.Task] = {}
supervisor: dict[str, dict] = {}
heartbeat = {"enabled": bool(config.HEALTHCHECK_PING_URL), "last_ok_ping": None,
             "last_fail_ping": None, "bad_since": None, "error": None}

NEPTUN_SILENCE_S = 180        # WebSocket NEPTUN-a ma heartbeat co 15 s
HEARTBEAT_INTERVAL_S = 60
FAIL_AFTER_S = 300            # krótkie potknięcie źródła nie budzi autora
FAIL_REPEAT_S = 600


# ── nadzorca zadań ──────────────────────────────────────────────────────────────
def start(name: str, factory) -> None:
    """`factory` zwraca NOWĄ korutynę przy każdym wywołaniu (np. lambda: rso.run())."""
    tasks[name] = asyncio.create_task(_supervise(name, factory), name=name)


async def _supervise(name: str, factory) -> None:
    delay = 5
    while True:
        started = time.monotonic()
        try:
            await factory()
            err = "zakończone bez błędu"
        except asyncio.CancelledError:
            raise
        except Exception as exc:                  # noqa: BLE001
            err = repr(exc)[:300]
            log.exception("zadanie %s padło", name)
        if time.monotonic() - started > 600:
            delay = 5                             # długo działało — to nie pętla awarii
        info = supervisor.setdefault(name, {"restarts": 0})
        info.update(restarts=info["restarts"] + 1, last_error=err, last_restart=time.time())
        log.error("zadanie %s zatrzymane (%s) — ponowne uruchomienie za %d s", name, err, delay)
        await asyncio.sleep(delay)
        delay = min(60, delay * 2)


# ── świeżość ────────────────────────────────────────────────────────────────────
def fresh(st: dict, interval_s: float, minimum_s: float = 180, now: float | None = None) -> bool:
    """Źródło jest „ok" tylko, gdy ostatni sukces był niedawno.

    Samo `ok` zostawało True, gdy pętla kolektora przestała się kręcić."""
    now = now or time.time()
    last = st.get("last")
    return bool(st.get("ok") and last and now - last <= max(minimum_s, 3 * interval_s))


RSO_FAIL_STREAK = 2


def rso_fresh(now: float | None = None) -> bool:
    """RSO działa, gdy ostatni sukces jest świeży i nie było 2 nieudanych cykli z rzędu.

    Pojedyncze potknięcie TVP (14.09.2026: 302 na stronę błędu, po minucie znów
    dobrze) dawało 503 w /api/health/critical i e-mail z UptimeRobot. Martwe RSO
    nadal wychodzi po ~2 min (dwa cykle), a zatrzymana pętla — po upływie świeżości."""
    now = now or time.time()
    st = rso.status
    last = st.get("last")
    return bool(last and now - last <= max(180, 3 * config.RSO_INTERVAL)
                and st.get("fail_streak", 0 if st.get("ok") else RSO_FAIL_STREAK) < RSO_FAIL_STREAK)


def _iso(ts: float | None) -> str | None:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds") if ts else None


def critical_check(now: float | None = None) -> dict:
    """Stan tego, bez czego alarm nie dotrze do ludzi."""
    now = now or time.time()
    checks = {}
    checks["rso"] = {"ok": rso_fresh(now), "last": _iso(rso.status.get("last")),
                     "error": rso.status.get("error")}
    last_msg = neptun.status.get("last_msg")
    # Cisza potwierdzona przez REST („nic nowego”) to działające źródło — 15.09.2026 nocą
    # NEPTUN milczał 40 min bez heartbeatu i monitoring zgłaszał fałszywą awarię.
    last_alive = max(last_msg or 0, neptun.status.get("last_alive") or 0) or None
    checks["neptun"] = {"ok": bool(last_alive and now - last_alive <= NEPTUN_SILENCE_S),
                        "connected": neptun.status.get("connected"), "last_msg": _iso(last_msg),
                        "last_alive": _iso(neptun.status.get("last_alive"))}
    if config.FCM_ENABLED:
        fs = notify.fcm_status
        failing = bool(fs.get("last_error_at") and
                       (not fs.get("last_ok_at") or fs["last_error_at"] > fs["last_ok_at"]))
        checks["fcm"] = {"ok": bool(fs.get("ready")) and not failing,
                         "ready": fs.get("ready"), "last_error": fs.get("last_error")}
    checks["production"] = {"ok": config.PRODUCTION, "env": config.STRAZNIK_ENV}
    return {"ok": all(c["ok"] for c in checks.values()), "checks": checks,
            "at": _iso(now)}


# ── sygnał życia ─────────────────────────────────────────────────────────────────
async def heartbeat_loop() -> None:
    """Ping co minutę, gdy wszystko działa. Awaria dłuższa niż 5 min → /fail.

    Brak pingu (pad usługi, VPS, sieci) zauważa usługa zewnętrzna sama. Adres
    zawiera sekret, więc nigdy nie trafia do logów ani do /api/health."""
    if not config.HEALTHCHECK_PING_URL:
        # bez adresu nie ma czego pingować; zadanie czeka, żeby nadzorca go nie wznawiał
        await asyncio.Event().wait()
    base = config.HEALTHCHECK_PING_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            now = time.time()
            try:
                result = critical_check(now)
                if result["ok"]:
                    heartbeat["bad_since"] = None
                    await client.get(base)
                    heartbeat.update(last_ok_ping=_iso(now), error=None)
                else:
                    heartbeat["bad_since"] = heartbeat["bad_since"] or now
                    last_fail = heartbeat.get("_last_fail_ts") or 0
                    if (now - heartbeat["bad_since"] >= FAIL_AFTER_S
                            and now - last_fail >= FAIL_REPEAT_S):
                        failed = ",".join(k for k, c in result["checks"].items() if not c["ok"])
                        await client.post(base + "/fail", content=f"nie działa: {failed}")
                        heartbeat.update(last_fail_ping=_iso(now), _last_fail_ts=now)
            except Exception as exc:              # noqa: BLE001
                heartbeat["error"] = exc.__class__.__name__   # bez adresu z sekretem
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)


def public_heartbeat() -> dict:
    return {k: v for k, v in heartbeat.items() if not k.startswith("_")}

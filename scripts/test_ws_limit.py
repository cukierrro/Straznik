# -*- coding: utf-8 -*-
"""Limit WebSocketów po syrenach w Lublinie (17.09.2026).

1. Ponad limitem serwer PRZYJMUJE połączenie i zamyka je kodem 1013 — wcześniej
   zamykał przed accept(), uvicorn odsyłał HTTP 403, a klient pokazywał
   „brak połączenia” i ponawiał (~230 prób/s przez 2 h).
2. Poniżej limitu klient dostaje stan od razu.
3. Opóźnienie pętli zdarzeń: odmowa nowych WebSocketów dopiero po 2 próbkach
   powyżej progu, powrót poniżej niższego progu (histereza).
4. Dziennik: otwarcia i odmowy WebSocketów nie trafiają do logu, ostrzeżenia tak.
5. RSO loguje początek awarii i powrót, bez linii co minutę.

Uruchomienie: py scripts/test_ws_limit.py
"""
import logging
import sys
import tempfile
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.stdout.reconfigure(encoding="utf-8")
warnings.filterwarnings("ignore")

from app import config, db  # noqa: E402

tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
config.DATA_DIR = Path(tmp.name)
config.DB_PATH = Path(tmp.name) / "straznik.db"
db.init()

from starlette.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402
from app import load_guard, main  # noqa: E402
from app.collectors import rso  # noqa: E402

client = TestClient(main.app)
bledy = []


def sprawdz(warunek, opis):
    print(("  OK   " if warunek else "  BŁĄD ") + opis)
    if not warunek:
        bledy.append(opis)


print("1–2. limit połączeń")
sprawdz(main.WS_MAX_CLIENTS == 10000, f"twardy limit 10 000 zamiast 3000 ({main.WS_MAX_CLIENTS})")
sprawdz(load_guard.SHED_SYS_PCT == 80 and load_guard.SHED_SYS_PCT_HARD == 90
        and load_guard.SHED_RSS_MB * 1.1 < 2900, "bezpiecznik: 80%/90% VPS, poziom 2 procesu poniżej MemoryHigh")
with client.websocket_connect("/ws") as ws:
    msg = ws.receive_text()
sprawdz(msg.startswith('{"type":"state"'), "poniżej limitu: stan od razu po połączeniu")

old_max = main.WS_MAX_CLIENTS
main.WS_MAX_CLIENTS = 0
refused_before = load_guard.status["ws_refused"]
code = None
try:
    with client.websocket_connect("/ws") as ws:
        ws.receive_text()
except WebSocketDisconnect as e:
    code = e.code
except Exception as e:                      # 403 przed accept() dawało inny wyjątek
    code = f"{type(e).__name__}: {e}"
main.WS_MAX_CLIENTS = old_max
sprawdz(code == 1013, f"ponad limitem: przyjęte i zamknięte kodem 1013, nie HTTP 403 ({code})")
sprawdz(load_guard.status["ws_refused"] == refused_before + 1, "odmowa policzona w /api/health")

load_guard.status["lag_high"] = True
code = None
try:
    with client.websocket_connect("/ws") as ws:
        ws.receive_text()
except WebSocketDisconnect as e:
    code = e.code
load_guard.status["lag_high"] = False
sprawdz(code == 1013, f"pętla nie nadąża: nowy WebSocket → 1013 ({code})")

print("3. opóźnienie pętli")
load_guard._lag_over = load_guard._lag_calm = 0
load_guard.status["lag_high"] = False
# 17.09.2026 na produkcji: zacięcia 0,5–1,3 s co kilka minut przy rozsyłaniu stanu
spikes = [0.55, 1.03, 0.0, 0.84, 0.84, 0.0, 1.30, 0.04, 0.0, 1.01, 0.02, 0.77, 0.0]
sprawdz(not any(load_guard.update_lag(x) for x in spikes),
        "pojedyncze i podwójne zacięcia 0,5–1,3 s (jak 17.09) NIE odcinają nowych WebSocketów")
sprawdz(load_guard.status["lag_spikes"] == 7 and load_guard.status["lag_max_ms"] == 1300,
        f"zacięcia policzone do obserwacji ({load_guard.status['lag_spikes']}, max {load_guard.status['lag_max_ms']} ms)")
sprawdz([load_guard.update_lag(1.2) for _ in range(4)] == [False, False, False, True],
        "4 próbki z rzędu ≥ 1 s (trwałe przeciążenie) → odmowa nowych WebSocketów")
sprawdz(load_guard.refuse_websocket(), "refuse_websocket widzi opóźnienie")
sprawdz([load_guard.update_lag(0.05), load_guard.update_lag(0.6), load_guard.update_lag(0.05),
         load_guard.update_lag(0.05)] == [True, True, True, True],
        "powrót dopiero po 3 spokojnych próbkach z rzędu (0,6 s zeruje licznik)")
sprawdz(load_guard.update_lag(0.05) is False, "trzecia spokojna próbka → znów przyjmujemy")
sprawdz(load_guard.status["loop_lag_ms"] == 50, f"opóźnienie w ms w statusie ({load_guard.status['loop_lag_ms']})")

print("4. dziennik bez szumu WebSocketów")
flt = next((f for f in logging.getLogger("uvicorn.error").filters
            if type(f).__name__ == "_QuietWebSocketLog"), None)
sprawdz(flt is not None, "filtr podpięty pod uvicorn.error")


def rec(msg, level=logging.INFO, args=()):
    return logging.LogRecord("uvicorn.error", level, __file__, 1, msg, args, None)


sprawdz(not flt.filter(rec('%s - "WebSocket %s" 403', args=("1.2.3.4:0", "/ws"))), "„WebSocket /ws” 403 wycięte")
sprawdz(not flt.filter(rec('%s - "WebSocket %s" [accepted]', args=("1.2.3.4:0", "/ws"))), "[accepted] wycięte")
sprawdz(not flt.filter(rec("connection open")) and not flt.filter(rec("connection closed")),
        "connection open/closed wycięte")
sprawdz(not flt.filter(rec("connection rejected (403 Forbidden)")), "connection rejected wycięte")
sprawdz(flt.filter(rec("Application startup complete.")), "zwykłe INFO uvicorna zostaje")
sprawdz(flt.filter(rec("connection open", logging.WARNING)), "ostrzeżenia zostają zawsze")

print("5. RSO w dzienniku")
records = []


class Grab(logging.Handler):
    def emit(self, record):
        records.append(record.getMessage())


h = Grab()
rso.log.addHandler(h)
rso.status.update(ok=True, fail_streak=0)
for _ in range(12):
    rso._fail("ConnectError('')")
rso._recovered()
rso.log.removeHandler(h)
fails = [m for m in records if "nieudany cykl" in m]
sprawdz(len(fails) == 3, f"12 nieudanych cykli → 3 wpisy (1., 2., 10.): {len(fails)}")
sprawdz(any("znów działa po 12" in m for m in records), "powrót RSO zapisany z liczbą cykli")

if bledy:
    print(f"\nBŁĘDY: {len(bledy)}")
    sys.exit(1)
print("\nOK - limit WebSocketów, opóźnienie pętli, cichy dziennik, awarie RSO")

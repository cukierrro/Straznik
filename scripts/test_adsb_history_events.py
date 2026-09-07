"""Regresje krótkotrwałych obcych maszyn pomiędzy migawkami historii."""
from pathlib import Path
import ast
import asyncio
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.collectors.adsb import _is_foreign_hex, _watch_transitions
from app import config, db

ru = {"hex": "14abcd", "callsign": "SUM9125", "lat": 43.9, "lon": 25.1}
by = {"hex": "510020", "callsign": "BYF001", "lat": 53.9, "lon": 27.5}
nato = {"hex": "4a1234", "callsign": "NATO01", "lat": 50.0, "lon": 20.0}

assert _is_foreign_hex(ru["hex"])
assert _is_foreign_hex(by["hex"])
assert not _is_foreign_hex(nato["hex"])
assert _watch_transitions(None, {ru["hex"]: ru}) == ([], [])
assert _watch_transitions({}, {ru["hex"]: ru}) == ([ru], [])
assert _watch_transitions({ru["hex"]: ru}, {}) == ([], [ru])
with tempfile.TemporaryDirectory() as tmp:
    config.DATA_DIR = Path(tmp)
    config.DB_PATH = Path(tmp) / "test.db"
    db.init()
    db.add_adsb_watch_event("enter", ru)
    saved = db.adsb_watch_events()
    assert len(saved) == 1 and saved[0]["callsign"] == "SUM9125"
    assert saved[0]["lat"] == 43.9 and saved[0]["kind"] == "enter"
    # Exercise the real endpoint body without starting production collectors.
    main = ast.parse((Path(__file__).resolve().parent.parent / "backend/app/main.py").read_text(encoding="utf-8"))
    endpoint = next(n for n in main.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "api_adsb_watch")
    endpoint.decorator_list = []
    scope = {"db": db}
    exec(compile(ast.Module(body=[endpoint], type_ignores=[]), "watch-endpoint", "exec"), scope)
    for hours in [-1, 1, 12, 999]:
        response = asyncio.run(scope["api_adsb_watch"](hours))
        assert len(response["events"]) == 1 and response["events"][0]["hex"] == ru["hex"]
    assert len(db.adsb_watch_events()) == 1, "Read-only endpoint must not create events"
    db._conn.close()
print("OK: obce ADS-B, pierwszy obieg bez lawiny, wejście i wyjście z pozycją")

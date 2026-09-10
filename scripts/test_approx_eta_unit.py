#!/usr/bin/env python3
"""Izolowany test filtra ETA bez uruchamiania kolektorów i sieci."""
import ast
from pathlib import Path
from types import SimpleNamespace

source = Path("backend/app/collectors/neptun.py").read_text(encoding="utf-8")
tree = ast.parse(source)
wanted = {"_is_approx_position", "_eta_alarm_level"}
defs = [node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in wanted]
assert {node.name for node in defs} == wanted

module = ast.Module(body=defs, type_ignores=[])
ns = {
    "config": SimpleNamespace(
        NEPTUN_ETA_MIN_SOURCES=2,
        NEPTUN_ETA_CONFIDENCE={"medium", "high"},
        NEPTUN_ETA_HIGH_MIN=5,
        NEPTUN_ETA_ELEVATED_MIN=10,
    )
}
exec(compile(module, "neptun.py", "exec"), ns)

is_approx = ns["_is_approx_position"]
eta_level = ns["_eta_alarm_level"]
assert is_approx({"positionQuality": "approx"})
assert is_approx({"source_metadata": {"source_fields": {"positionQuality": "approx"}}})
assert not is_approx({"positionQuality": "confirmed"})
assert eta_level({"heading_known": True}, 5, "high", 2, approximate=True) is None
assert eta_level({"heading_known": True}, 5, "high", 2) == "high"
assert eta_level({"heading_known": True}, 2, "medium", 8) == "elevated"

print("OK — przybliżona pozycja nie uruchamia progowego alarmu ETA")

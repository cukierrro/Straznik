"""Read-only inventory of aircraft models in exported Strażnik history.

Does not import the application, touch its database or send notifications.
Optional --url performs one public GET; all output is local.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen


def observations(data):
    for snap in data.get("snaps", []):
        for aircraft in snap.get("aircraft", []):
            yield snap.get("ts"), aircraft
    for event in data.get("adsb_watch_events", []):
        yield event.get("ts"), event
    for signal in data.get("signals", []):
        if signal.get("source") == "adsb":
            for aircraft in (signal.get("details") or {}).get("aircraft", []):
                yield signal.get("ts"), aircraft
    for aircraft in (data.get("adsb") or {}).get("aircraft", []):
        yield None, aircraft


def inventory(inputs):
    models = defaultdict(lambda: {"descriptions": set(), "aircraft": set(), "sources": set(), "times": set()})
    coverage = []
    unknown = 0
    for source, data in inputs:
        times = sorted({s["ts"] for s in data.get("snaps", []) if s.get("ts")})
        coverage.append({"source": source, "snapshots": len(data.get("snaps", [])),
                         "first": times[0] if times else None, "last": times[-1] if times else None})
        for ts, aircraft in observations(data):
            code = str(aircraft.get("type") or aircraft.get("t") or "").strip().upper()
            if not code:
                unknown += 1
                continue
            m = models[code]
            desc = str(aircraft.get("desc") or "").strip()
            if desc:
                m["descriptions"].add(desc)
            if aircraft.get("hex"):
                m["aircraft"].add(str(aircraft["hex"]).lower())
            m["sources"].add(source)
            if ts:
                m["times"].add(ts)
    rows = []
    for code, m in sorted(models.items()):
        times = sorted(m["times"])
        rows.append({"type": code, "descriptions": sorted(m["descriptions"]),
                     "distinct_hex": len(m["aircraft"]), "sources": sorted(m["sources"]),
                     "first": times[0] if times else None, "last": times[-1] if times else None})
    return {"scope": "Available exports only; not a complete all-time flight record. Type codes may cover multiple variants.",
            "coverage": coverage, "model_count": len(rows), "unknown_type_observations": unknown, "models": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*")
    parser.add_argument("--url", help="Optional public history bundle URL; one GET")
    parser.add_argument("--out", help="Local JSON inventory destination")
    args = parser.parse_args()
    inputs = [(name, json.loads(Path(name).read_text(encoding="utf-8-sig"))) for name in args.files]
    if args.url:
        request = Request(args.url, headers={"User-Agent": "Straznik-model-audit/1.0"})
        with urlopen(request, timeout=45) as response:
            inputs.append((args.url, json.load(response)))
    result = inventory(inputs)
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

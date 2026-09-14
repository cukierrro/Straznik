# -*- coding: utf-8 -*-
"""Audyt A2: przeliczenie historii — stara geometria (19 punktów) vs kontur Polski.

Nic nie zmienia na produkcji. Dla każdego obiektu z migawek archiwum i każdego
zapisanego sygnału NEPTUN liczy odległość, województwo, punkty i alarm ETA
na obu geometriach, z tym samym kursem (bez pamięci ruchu, więc porównanie jest
uczciwe). Wynik sumuje punkty NEPTUN per migawka i województwo (limit klasy 8)
i pokazuje, gdzie zmieniłby się poziom z samego NEPTUN-a.

Dane: JSON {"snaps": [{"ts", "threats": [...]}], "signals": [{"ts","voiv","points","details"}]}
wyeksportowany z VPS (archiwum.db + tabela signals).

Uruchomienie: py scripts/replay_granica_a2.py dane.json
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.stdout.reconfigure(encoding="utf-8")

from app import config, geo  # noqa: E402
from app.collectors import neptun  # noqa: E402

ARGS = (config.NEPTUN_HEADING_TOLERANCE, config.NEPTUN_HEADING_SOFT_DEG,
        config.NEPTUN_UNKNOWN_HEADING_MULT, config.NEPTUN_UNKNOWN_HEADING_MAX_KM)
CAP = config.SOURCE_CAPS.get("neptun", 8.0)


def level(x):
    return "high" if x >= config.THRESHOLD_HIGH else "elevated" if x >= config.THRESHOLD_ELEVATED else "none"


def evaluate(t):
    if t.get("lat") is None or t.get("lon") is None or neptun.is_national(t):
        return None
    t = dict(t)
    t["straznik_position"] = t.get("straznik_position") or neptun._position_info(t)
    out = {}
    for name, fn in (("old", geo.assess_threat), ("new", VARIANT)):
        a = fn(t["lat"], t["lon"], t.get("heading"), *ARGS)
        pts = neptun.score_threat(t, a["dist_km"], a["course_factor"]) if a["toward_pl"] else 0.0
        approx = neptun._is_approx_position(t)
        speed = None if approx else neptun._speed_of(t)
        raw = geo.eta_raw_minutes(a["dist_km"], speed)
        eta_c = max(0.0, raw - config.NEPTUN_ETA_BUFFER_MIN) if raw is not None else None
        sources = max(int(t.get("sourceCount") or 1), 1)
        conf = (t.get("confidenceLevel") or "low").lower()
        eta = (neptun._eta_alarm_level(a, sources, conf, eta_c, approximate=approx)
               if a["toward_pl"] and pts > 0 else None)
        if eta == "high":
            pts = max(pts, config.THRESHOLD_HIGH)
        elif eta == "elevated":
            pts = max(pts, config.THRESHOLD_ELEVATED)
        out[name] = {"dist": a["dist_km"], "voiv": a["border_voiv"], "pts": pts, "eta": eta,
                     "inside": a.get("inside_pl", False)}
    return out


def main(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    snaps, signals = data.get("snaps", []), data.get("signals", [])

    # ── migawki: wszystkie obiekty ──
    dist_diff, track_changes = [], []
    level_changes = Counter()
    examples = []
    inside_count = 0
    for sn in snaps:
        sums = {"old": defaultdict(float), "new": defaultdict(float)}
        for t in sn["threats"]:
            r = evaluate(t)
            if not r:
                continue
            if r["new"]["inside"]:
                inside_count += 1
            if r["old"]["dist"] < 300:
                dist_diff.append(r["new"]["dist"] - r["old"]["dist"])
            for k in ("old", "new"):
                if r[k]["pts"] > 0 and r[k]["voiv"]:
                    sums[k][r[k]["voiv"]] += r[k]["pts"]
            if abs(r["new"]["pts"] - r["old"]["pts"]) >= 0.3 or r["new"]["eta"] != r["old"]["eta"]:
                track_changes.append((sn["ts"], t.get("id"), t.get("type"), r))
        for v in set(sums["old"]) | set(sums["new"]):
            lo, ln = level(min(CAP, sums["old"][v])), level(min(CAP, sums["new"][v]))
            if lo != ln:
                level_changes[(v, lo, ln)] += 1
                if len(examples) < 12:
                    examples.append((sn["ts"], v, round(sums["old"][v], 2), round(sums["new"][v], 2)))

    print(f"== MIGAWKI ARCHIWUM: {len(snaps)} ({snaps[0]['ts'] if snaps else '-'} → {snaps[-1]['ts'] if snaps else '-'})")
    if dist_diff:
        dist_diff.sort()
        q = lambda p: round(dist_diff[int(p * (len(dist_diff) - 1))], 1)
        print(f"różnica odległości (nowa − stara) dla obiektów do 300 km: n={len(dist_diff)}, "
              f"p10 {q(.1)} km, mediana {q(.5)} km, p90 {q(.9)} km")
    print(f"wystąpień obiektów nad Polską (nowa odległość 0): {inside_count}")
    uniq = {}
    for ts, tid, typ, r in track_changes:
        uniq.setdefault(tid, (ts, typ, r))
    print(f"obiektów ze zmianą punktów ≥0,3 lub alarmu ETA: {len(uniq)} (wystąpień {len(track_changes)})")
    for tid, (ts, typ, r) in list(uniq.items())[:15]:
        print(f"  {ts[11:16]} {tid} {typ}: {r['old']['dist']} km {r['old']['voiv']} {r['old']['pts']} pkt "
              f"eta={r['old']['eta']}  →  {r['new']['dist']} km {r['new']['voiv']} {r['new']['pts']} pkt eta={r['new']['eta']}")
    print(f"zmiany poziomu z samego NEPTUN-a (migawka×województwo): {sum(level_changes.values())}")
    for (v, lo, ln), n in level_changes.most_common():
        print(f"  {v}: {lo} → {ln}: {n} migawek")
    for e in examples:
        print("   przykład", e)

    # ── sygnały zapisane od 04.08 ──
    print(f"\n== SYGNAŁY NEPTUN: {len(signals)} ({signals[0]['ts'] if signals else '-'} → {signals[-1]['ts'] if signals else '-'})")
    up, down, voiv_moves, eta_new, eta_lost = [], [], Counter(), [], []
    for s in signals:
        d = s["details"]
        t = {"id": d.get("track_id"), "type": d.get("type"), "lat": d.get("lat"), "lon": d.get("lon"),
             "heading": d.get("heading"), "confidenceLevel": d.get("confidence"),
             "sourceCount": d.get("source_count"), "count": d.get("count"), "lifecycle": d.get("lifecycle"),
             "uncertaintyKm": d.get("uncertainty_km"), "positionQuality": d.get("position_quality"),
             "areaOnly": d.get("area_only"), "region": d.get("region")}
        r = evaluate(t)
        if not r:
            continue
        diff = r["new"]["pts"] - r["old"]["pts"]
        row = (s["ts"][:16], t["id"], t["type"], r)
        (up if diff >= 0.3 else down if diff <= -0.3 else []).append(row)
        if r["old"]["voiv"] != r["new"]["voiv"]:
            voiv_moves[(r["old"]["voiv"], r["new"]["voiv"])] += 1
        if r["new"]["eta"] and not r["old"]["eta"]:
            eta_new.append(row)
        if r["old"]["eta"] and not r["new"]["eta"]:
            eta_lost.append(row)
    print(f"więcej punktów (≥0,3): {len(up)}, mniej: {len(down)}, nowy alarm ETA: {len(eta_new)}, utracony alarm ETA: {len(eta_lost)}")
    for label, rows in (("więcej", up), ("mniej", down), ("nowy ETA", eta_new), ("utracony ETA", eta_lost)):
        for ts, tid, typ, r in sorted(rows, key=lambda x: -abs(x[3]["new"]["pts"] - x[3]["old"]["pts"]))[:8]:
            print(f"  [{label}] {ts} {tid} {typ}: {r['old']['dist']} km {r['old']['pts']} pkt eta={r['old']['eta']} "
                  f"→ {r['new']['dist']} km {r['new']['pts']} pkt eta={r['new']['eta']} ({r['new']['voiv']})")
    for (a, b), n in voiv_moves.most_common():
        print(f"  zmiana województwa: {a} → {b}: {n}")


VARIANT = geo.assess_threat_outline

if __name__ == "__main__":
    variants = {"a": ("A2a: odległość do konturu, kurs do najbliższego punktu", geo.assess_threat_outline),
                "b": ("A2b: odległość do konturu, kurs do całego wycinka Polski", geo.assess_threat_outline_extent)}
    for key in (sys.argv[2:] or ["a", "b"]):
        title, VARIANT = variants[key]
        print(f"\n######## {title} ########")
        main(sys.argv[1])

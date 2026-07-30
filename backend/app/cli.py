"""CLI testowe: `py -m app.cli neptun` — podgląd na żywo strumienia Neptun
z oceną odległości/kursu względem granicy PL, bez uruchamiania serwera.

`py -m app.cli score` — jednorazowy odczyt REST + tabela oceny.
"""
import asyncio
import json
import sys

import httpx
import websockets

from . import config, geo


def fmt(t: dict) -> str:
    a = geo.assess_threat(t["lat"], t["lon"], t.get("heading"),
                          config.NEPTUN_HEADING_TOLERANCE) if t.get("lat") else None
    conf = t.get("confidenceLevel", "?")
    unc = t.get("uncertaintyKm", "?")
    base = (f"{t.get('id','?'):>13} {t.get('type','?'):<9} conf={conf:<6} ±{unc}km "
            f"({t.get('lat'):.2f},{t.get('lon'):.2f}) hdg={t.get('heading')}")
    if a:
        flag = ""
        if a["toward_pl"] and a["dist_km"] < config.NEPTUN_NEAR_KM:
            flag = "  <<< KURS NA PL, <100 km — SYGNAŁ" + (" +3" if conf == "high" else " +1.5")
        base += (f" | granica PL: {a['dist_km']:>6.1f} km ({a['border_voiv']}) "
                 f"toward={a['toward_pl']}{flag}")
    return base


async def cmd_score():
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(config.NEPTUN_REST_URL)
        r.raise_for_status()
        threats = r.json().get("threats", [])
    print(f"Aktywne obiekty: {len(threats)}  (Dane: NEPTUN, neptun.in.ua)")
    threats.sort(key=lambda t: geo.nearest_border_point(t["lat"], t["lon"])[0]
                 if t.get("lat") else 9999)
    for t in threats[:40]:
        if t.get("lat"):
            print(fmt(t))


async def cmd_stream():
    print(f"Łączenie z {config.NEPTUN_WS_URL} ... (Ctrl+C aby zakończyć)")
    print("Dane: NEPTUN (neptun.in.ua) — agregator OSINT, nie wojskowy radar\n")
    async for ws in websockets.connect(config.NEPTUN_WS_URL, ping_interval=25):
        try:
            async for raw in ws:
                env = json.loads(raw)
                et = env.get("type")
                if et == "snapshot":
                    threats = env["data"].get("threats", [])
                    print(f"── SNAPSHOT: {len(threats)} obiektów ──")
                    near = [t for t in threats if t.get("lat") and
                            geo.nearest_border_point(t["lat"], t["lon"])[0] < 250]
                    for t in near:
                        print(fmt(t))
                    print(f"(pokazano {len(near)} obiektów <250 km od granicy PL)")
                elif et == "upsert":
                    t = env["data"]
                    if t.get("lat") and geo.nearest_border_point(t["lat"], t["lon"])[0] < 250:
                        print("UPSERT", fmt(t))
                elif et == "remove":
                    print("REMOVE", env["data"].get("id"))
        except websockets.ConnectionClosed:
            print("Rozłączono — reconnect...")
            continue


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "neptun"
    if cmd == "score":
        asyncio.run(cmd_score())
    else:
        try:
            asyncio.run(cmd_stream())
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()

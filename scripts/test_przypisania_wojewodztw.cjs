// Przypisanie obiektu NEPTUN do województw: serwer i tryb bez serwera liczą TO SAMO.
//
// Serwer od 1.7.91 punktuje KAŻDE województwo w zasięgu 250 km od odległości do
// niego (neptun._signal_sasiednie), a od 18.10.2026 z podłogą przygraniczną dla
// drona. Tryb bez serwera (engine.js) robił tylko województwo przy najbliższej
// granicy — dodane w 1.7.97 (decyzja usera). Test liczy te same obiekty obiema
// drogami: Python na prawdziwym kodzie serwera, JS na prawdziwym silniku, i porównuje
// województwa, punkty, odległości, alarm ETA i podłogę.
//
// Uruchomienie: node scripts/test_przypisania_wojewodztw.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const KORZEN = path.resolve(__dirname, "..");
const OBIEKTY = [
  // Rawa Ruska: 17 km od lubelskiego i 29 km od podkarpackiego, bez kursu, 3 zgłoszenia
  { id: "trk_t_rawa", type: "uav", lat: 50.30, lon: 23.95, confidenceLevel: "high", sourceCount: 3,
    lifecycle: "created", positionQuality: "confirmed", uncertaintyKm: 4, region: "Львівська область" },
  // Rostań: 10 km od granicy, 2 zgłoszenia
  { id: "trk_t_rostan", type: "uav", lat: 51.59944, lon: 23.70936, confidenceLevel: "high", sourceCount: 2,
    lifecycle: "created", positionQuality: "confirmed", uncertaintyKm: 28, region: "Волинська область" },
  // Shahedy pod Kowlem, kurs na zachód, znany — alarm ETA i dalsze województwa
  { id: "trk_t_kowel", type: "shahed", count: 3, lat: 51.21, lon: 24.71, heading: 270, confidenceLevel: "high",
    sourceCount: 5, lifecycle: "confirmed", positionQuality: "confirmed", uncertaintyKm: 4, region: "Волинська область" },
  // rakieta manewrująca z pozycją rejonową
  { id: "trk_t_rakieta", type: "cruise", lat: 50.9, lon: 26.2, heading: 280, confidenceLevel: "medium",
    sourceCount: 2, lifecycle: "uncertain", positionQuality: "approx", areaOnly: true, uncertaintyKm: 25,
    region: "Рівненська область" },
];

function serwer() {
  const skrypt = `
import asyncio, json, sys, types
sys.path.insert(0, ${JSON.stringify(path.join(KORZEN, "backend"))})
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
d = types.ModuleType("dotenv"); d.load_dotenv = lambda *a, **k: None; sys.modules.setdefault("dotenv", d)
from app.collectors import neptun
wpisy = []
async def ingest(**k):
    wpisy.append(k); return True
neptun.fusion.ingest = ingest
for o in json.loads(sys.argv[1]):
    asyncio.run(neptun._maybe_signal(neptun._evaluate(dict(o))))
print(json.dumps([{"track": w["details"]["track_id"], "voiv": w["voivodeship"], "pkt": w["points"],
  "km": w["details"].get("dist_km"), "eta": w["details"].get("eta_alarm"),
  "podloga": bool(w["details"].get("border_floor"))} for w in wpisy], ensure_ascii=False))
`;
  for (const py of ["py", "python3", "python"]) {
    try {
      return JSON.parse(execFileSync(py, ["-c", skrypt, JSON.stringify(OBIEKTY)],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } }));
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  throw new Error("brak Pythona — test porównuje z kodem serwera");
}

function silnik() {
  const storage = new Map();
  const ctx = vm.createContext({ console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
    window: {}, fetch: async () => ({ ok: true, text: async () => "{}" }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k) } });
  const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), "utf8");
  vm.runInContext(czytaj("frontend/pl-outline.js") + "\n" + czytaj("frontend/voiv-outline.js") + "\n"
    + czytaj("frontend/engine.js") + "\nthis.TestEngine = Engine;", ctx);
  const E = ctx.TestEngine;
  for (const o of OBIEKTY) E.podloga.neptunEval(JSON.parse(JSON.stringify(o)));
  return [...E.podloga.sygnaly()].filter(s => s.event_type === "neptun_threat").map(s => ({
    track: s.details.track_id, voiv: s.voivodeship, pkt: s.points, km: s.details.dist_km,
    eta: s.details.eta_alarm ?? null, podloga: !!s.details.border_floor }));
}

test("silnik przypisuje obiekty do tych samych województw, z tymi samymi punktami co serwer", () => {
  const klucz = (w) => `${w.track} ${w.voiv}`;
  const s = new Map(serwer().map(w => [klucz(w), w]));
  const e = new Map(silnik().map(w => [klucz(w), w]));
  assert.ok(s.size >= 10, `serwer dał tylko ${s.size} przypisań — zły przypadek testowy`);
  assert.deepEqual([...e.keys()].sort(), [...s.keys()].sort(), "te same pary obiekt–województwo");
  for (const [k, ws] of s) {
    const we = e.get(k);
    assert.ok(Math.abs(we.pkt - ws.pkt) <= 0.011, `${k}: punkty silnik ${we.pkt} ≠ serwer ${ws.pkt}`);
    assert.ok(Math.abs((we.km ?? 0) - (ws.km ?? 0)) <= 0.15, `${k}: odległość silnik ${we.km} ≠ serwer ${ws.km}`);
    assert.equal(we.eta, ws.eta, `${k}: alarm ETA`);
    assert.equal(we.podloga, ws.podloga, `${k}: podłoga przygraniczna`);
  }
});

test("Rawa Ruska: podłoga w obu województwach przy granicy, także w trybie bez serwera", () => {
  const e = silnik().filter(w => w.track === "trk_t_rawa");
  for (const v of ["lubelskie", "podkarpackie"]) {
    const w = e.find(x => x.voiv === v);
    assert.ok(w && w.pkt === 2 && w.podloga, `${v}: ${JSON.stringify(w)}`);
  }
});

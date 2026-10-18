// Polski tytuł sygnału NEPTUN: serwer i tryb bez serwera piszą go TAK SAMO i PO POLSKU.
//
// Przy zrzutach do 1.7.97 (18.10.2026) polski panel historii pokazywał
// „… 180.9 km … (woj. lubelskie, confidence: high, 3 potwierdzeń, ±10 km)”.
// Tytuł buduje serwer (neptun.py) i jego lustro w engine.js; aplikacja w PL wycina
// z niego fragment od „kursem na granicę PL”, a EN/UK składa tytuł sama z details.
// Test liczy te same obiekty obiema drogami (Python na prawdziwym kodzie serwera,
// JS na prawdziwym silniku) i sprawdza: wiarygodność po polsku, przecinek
// dziesiętny, odmianę „potwierdzenie/-a/-eń” i zgodność końcówki tytułu. Do tego
// spolszczenie starych tytułów z bazy w app.js (polskiTytulNeptun).
//
// Uruchomienie: node scripts/test_tytuly_neptun.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const KORZEN = path.resolve(__dirname, "..");
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), "utf8");
const OBIEKTY = [
  // Rawa Ruska: 17 km od lubelskiego i 29 km od podkarpackiego, 3 zgłoszenia
  { id: "trk_t_rawa", type: "uav", lat: 50.30, lon: 23.95, confidenceLevel: "high", sourceCount: 3,
    lifecycle: "created", positionQuality: "confirmed", uncertaintyKm: 4, region: "Львівська область" },
  // Shahedy pod Kowlem, kurs znany, 5 zgłoszeń, niepewność ułamkowa
  { id: "trk_t_kowel", type: "shahed", count: 3, lat: 51.21, lon: 24.71, heading: 270, confidenceLevel: "medium",
    sourceCount: 5, lifecycle: "confirmed", positionQuality: "confirmed", uncertaintyKm: 2.5,
    region: "Волинська область" },
  // jedno zgłoszenie, niska wiarygodność
  { id: "trk_t_jeden", type: "shahed", lat: 51.0, lon: 25.2, heading: 270, confidenceLevel: "low",
    sourceCount: 1, lifecycle: "created", positionQuality: "confirmed", uncertaintyKm: 10,
    region: "Волинська область" },
];

const PROBKI_N = [...Array(31).keys()].slice(1).concat([101, 102, 104, 105, 111, 112, 114, 122, 124]);
const PROBKI_KM = [180.9, 180, 10.2, 0.5, 4, 2.5, "?"];

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
dane = json.loads(sys.argv[1])
for o in dane["obiekty"]:
    asyncio.run(neptun._maybe_signal(neptun._evaluate(dict(o))))
print(json.dumps({
  "sygnaly": [{"track": w["details"]["track_id"], "voiv": w["voivodeship"], "title": w["title"],
               "zrodla": w["details"].get("source_count"), "conf": w["details"].get("confidence")}
              for w in wpisy],
  "potwierdzenia": [neptun._potwierdzenia_pl(n) for n in dane["n"]],
  "km": [neptun._km_pl(k) for k in dane["km"]],
  "conf": [neptun._conf_pl(c) for c in ("high", "medium", "low", "?")],
}, ensure_ascii=False))
`;
  const arg = JSON.stringify({ obiekty: OBIEKTY, n: PROBKI_N, km: PROBKI_KM });
  for (const py of ["py", "python3", "python"]) {
    try {
      return JSON.parse(execFileSync(py, ["-c", skrypt, arg],
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
  vm.runInContext(czytaj("frontend/pl-outline.js") + "\n" + czytaj("frontend/voiv-outline.js") + "\n"
    + czytaj("frontend/engine.js") + "\nthis.TestEngine = Engine;", ctx);
  const E = ctx.TestEngine;
  for (const o of OBIEKTY) E.podloga.neptunEval(JSON.parse(JSON.stringify(o)));
  return {
    sygnaly: [...E.podloga.sygnaly()].filter(s => s.event_type === "neptun_threat").map(s => ({
      track: s.details.track_id, voiv: s.voivodeship, title: s.title,
      zrodla: s.details.source_count, conf: s.details.confidence })),
    potwierdzenia: PROBKI_N.map(n => E.tytuly.potwierdzeniaPL(n)),
    km: PROBKI_KM.map(k => E.tytuly.kmPL(k)),
    conf: ["high", "medium", "low", "?"].map(c => E.tytuly.wiarygodnoscPL(c)),
  };
}

const S = serwer(), J = silnik();

function oczekiwanaOdmiana(n) {
  if (n === 1) return "1 potwierdzenie";
  const j = n % 10, d = n % 100;
  return (j >= 2 && j <= 4 && !(d >= 12 && d <= 14)) ? `${n} potwierdzenia` : `${n} potwierdzeń`;
}

test("pomocnicze: odmiana, przecinek i wiarygodność — serwer = silnik = polszczyzna", () => {
  assert.deepEqual(S.potwierdzenia, PROBKI_N.map(oczekiwanaOdmiana), "serwer: odmiana");
  assert.deepEqual(J.potwierdzenia, S.potwierdzenia, "silnik = serwer: odmiana");
  assert.equal(S.potwierdzenia[2], "3 potwierdzenia");
  assert.equal(S.potwierdzenia[11], "12 potwierdzeń");
  assert.equal(S.potwierdzenia[21], "22 potwierdzenia");
  assert.deepEqual(S.km, ["180,9", "180", "10,2", "0,5", "4", "2,5", "?"], "serwer: przecinek dziesiętny");
  assert.deepEqual(J.km, S.km, "silnik = serwer: odległości");
  assert.deepEqual(S.conf, ["wysoka", "średnia", "niska", "?"]);
  assert.deepEqual(J.conf, S.conf, "silnik = serwer: wiarygodność");
});

test("tytuły z prawdziwej ścieżki: po polsku, bez kropki dziesiętnej, z poprawną odmianą", () => {
  for (const [kto, w] of [["serwer", S], ["silnik", J]]) {
    assert.ok(w.sygnaly.length >= 6, `${kto}: tylko ${w.sygnaly.length} sygnałów — zły przypadek testowy`);
    for (const s of w.sygnaly) {
      const gdzie = `${kto} ${s.track} ${s.voiv}: ${s.title}`;
      assert.doesNotMatch(s.title, /confidence/i, gdzie);
      assert.doesNotMatch(s.title, /\d\.\d/, `${gdzie} — kropka dziesiętna`);
      assert.ok(s.title.includes(`wiarygodność: ${S.conf[["high", "medium", "low"].indexOf(s.conf)]}`), gdzie);
      assert.ok(s.title.includes(`${oczekiwanaOdmiana(s.zrodla)})`) || s.title.includes(`${oczekiwanaOdmiana(s.zrodla)},`),
        `${gdzie} — odmiana dla ${s.zrodla}`);
    }
  }
  // wszystkie trzy formy odmiany i wszystkie trzy poziomy wiarygodności wystąpiły
  const tytuly = S.sygnaly.map(s => s.title).join("\n");
  for (const f of ["1 potwierdzenie", "3 potwierdzenia", "5 potwierdzeń", "wysoka", "średnia", "niska", "±2,5 km"])
    assert.ok(tytuly.includes(f), `brak „${f}” w tytułach serwera`);
});

test("silnik pisze ten sam tytuł co serwer (poza opisem kursu, którego silnik nie ma)", () => {
  // Odległości liczą dwie różne geometrie (różnice ≤0,15 km pilnuje
  // test_przypisania_wojewodztw) — maskujemy samą liczbę odległości.
  const norm = (t) => t.replace(/ \[kurs [^\]]+\]/g, "")
    .replace(/(granicę PL, |w odległości )\d+(?:,\d+)?/, "$1N");
  const klucz = (w) => `${w.track} ${w.voiv}`;
  const s = new Map(S.sygnaly.map(w => [klucz(w), w]));
  const e = new Map(J.sygnaly.map(w => [klucz(w), w]));
  assert.deepEqual([...e.keys()].sort(), [...s.keys()].sort(), "te same pary obiekt–województwo");
  for (const [k, ws] of s) assert.equal(norm(e.get(k).title), norm(ws.title), k);
});

test("app.js spolszcza stare tytuły z bazy, a EN/UK dalej składa tytuł z details", () => {
  const app = czytaj("frontend/app.js");
  const fn = app.match(/function polskiTytulNeptun\(title\) \{[\s\S]*?\r?\n\}/);
  assert.ok(fn, "brak polskiTytulNeptun w app.js");
  const conf = app.match(/const CONF_PL = \{[^}]*\};/);
  assert.ok(conf, "brak CONF_PL w app.js");
  const f = vm.runInNewContext(`${conf[0]}\n${fn[0]}\npolskiTytulNeptun`);
  assert.equal(
    f("Dron / BpSP kursem na granicę PL, 180.9 km [kurs domniemany — na cel] (woj. lubelskie, confidence: high, 3 potwierdzeń, ±10 km)"),
    "Dron / BpSP kursem na granicę PL, 180,9 km [kurs domniemany — na cel] (woj. lubelskie, wiarygodność: wysoka, 3 potwierdzenia, ±10 km)");
  assert.equal(f("Shahed w odległości 29.1 km od woj. podkarpackie (confidence: medium, 1 potwierdzeń)"),
    "Shahed w odległości 29,1 km od woj. podkarpackie (wiarygodność: średnia, 1 potwierdzenie)");
  assert.equal(f("2× Shahed kursem na granicę PL, 34.5 km (woj. lubelskie, confidence: low, 12 potwierdzeń, ±2.5 km)"),
    "2× Shahed kursem na granicę PL, 34,5 km (woj. lubelskie, wiarygodność: niska, 12 potwierdzeń, ±2,5 km)");
  // nowe tytuły przechodzą bez zmian
  for (const s of S.sygnaly) assert.equal(f(s.title), s.title, `nowy tytuł zmieniony: ${s.title}`);
  // spolszczenie tylko w gałęzi polskiej; EN/UK nadal składane z details, nie z tytułu
  assert.match(app, /if \(!UI\.isEn && !UI\.isUk\) shownTitle = polskiTytulNeptun\(shownTitle\);\s*else \{/);
  assert.match(app, /` heading towards the Polish border, \$\{threatDistanceText\(signalPosition, d\.dist_km\)\}`/);
});

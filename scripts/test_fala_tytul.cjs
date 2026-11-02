// Tytuł fali mówi to, co wiadomo: fala NIE sprawdza kursu, więc nie pisze „kursem na Polskę”.
//
// 2.11.2026 panel pokazywał „Fala obiektów: 6 obiekty kursem na Polskę”, a wszystkie sześć
// miało kurs domniemany, czyli namiar źródła na miejscowość na Ukrainie („курсом на Луцьк”).
// Test liczy te same sygnały obiema drogami: Python na prawdziwym fusion.accumulate
// i JS na prawdziwym silniku, a panel w trzech językach na prawdziwym tytulFali z app.js.
//
// Uruchomienie: node scripts/test_fala_tytul.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const KORZEN = path.resolve(__dirname, "..");
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), "utf8");
const REF = "2026-11-02T21:12:00+00:00";

const sygnal = (id, km, course, heading, minuta = "05") => ({
  id, ts: `2026-11-02T21:${minuta}:00+00:00`, t: Date.parse(`2026-11-02T21:${minuta}:00+00:00`), source: "neptun", event_type: "neptun_threat",
  voivodeship: "lubelskie", points: 0.2, title: `Dron ${id}`,
  details: { track_id: `trk_${id}`, type: "uav", count: 1, dist_km: km, course, heading },
});
const ZESTAWY = {
  "same domniemane": [1, 2, 3, 4, 5, 6].map(i => sygnal(i, 90 + i * 5, "presumptive", 252)),
  "wszystkie trzy": [sygnal(11, 90, "known", 270), sygnal(12, 100, "presumptive", 252), sygnal(13, 110, "unknown", null)],
  "stare bez pola course": [sygnal(21, 90, undefined, 270), sygnal(22, 100, undefined, null), sygnal(23, 110, undefined, 250)],
  "22 obiekty": Array.from({ length: 22 }, (_, i) => sygnal(100 + i, 100, "unknown", null)),
  "12 obiektów": Array.from({ length: 12 }, (_, i) => sygnal(200 + i, 100, "unknown", null)),
};

function serwer() {
  const skrypt = `
import json, os, sys, tempfile, types
from datetime import datetime
os.environ["STRAZNIK_DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, ${JSON.stringify(path.join(KORZEN, "backend"))})
sys.modules.setdefault("truststore", types.SimpleNamespace(inject_into_ssl=lambda: None))
d = types.ModuleType("dotenv"); d.load_dotenv = lambda *a, **k: None; sys.modules.setdefault("dotenv", d)
from app import fusion
ref = datetime.fromisoformat(${JSON.stringify(REF)})
wynik = {}
for nazwa, sygn in json.load(open(sys.argv[1], encoding="utf-8")).items():
    st = fusion.accumulate(sygn, ref)["lubelskie"]
    wynik[nazwa] = [{"title": s["title"], "kursy": s["details"]["kursy"], "count": s["details"]["count"], "points": s["points"]}
                    for s in st["signals"] if s["event_type"] == "neptun_wave"]
print(json.dumps(wynik, ensure_ascii=False))
`;
  const plik = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fala-")), "z.json");
  fs.writeFileSync(plik, JSON.stringify(ZESTAWY));
  for (const py of ["py", "python3", "python"]) {
    try {
      return JSON.parse(execFileSync(py, ["-c", skrypt, plik],
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
  const wynik = {};
  for (const [nazwa, sygn] of Object.entries(ZESTAWY)) {
    const st = ctx.TestEngine.stateFrom(JSON.parse(JSON.stringify(sygn)), Date.parse(REF)).voivodeships.lubelskie;
    wynik[nazwa] = st.signals.filter(s => s.event_type === "neptun_wave").map(s => ({
      title: s.title, kursy: { ...s.details.kursy }, count: s.details.count, points: s.points }));
  }
  return JSON.parse(JSON.stringify(wynik));
}

function panel(lang) {
  const app = czytaj("frontend/app.js");
  const start = app.indexOf("function tytulFali(s) {");
  assert.notEqual(start, -1, "brak tytulFali w app.js");
  let g = 0, kon = -1;
  for (let i = start; i < app.length; i++) {
    if (app[i] === "{") g++;
    else if (app[i] === "}" && --g === 0) { kon = i + 1; break; }
  }
  const VOIV = { en: { lubelskie: "Lublin" }, uk: { lubelskie: "Люблінське" } };
  const UI = { t: (pl, en, uk) => (lang === "en" ? en : lang === "uk" ? uk : pl), voiv: v => (VOIV[lang] || {})[v] || v };
  return vm.runInNewContext(`${app.slice(start, kon)}\ntytulFali`, { UI, Number });
}

const S = serwer(), J = silnik();

test("serwer i silnik piszą ten sam tytuł, punkty bez zmian", () => {
  assert.deepEqual(J, S);
  for (const w of Object.values(S)) { assert.equal(w.length, 1); assert.equal(w[0].points, 0.5); }
});

test("tytuł mówi, ile kursów znamy, i nigdy „kursem na Polskę”", () => {
  assert.equal(S["same domniemane"][0].title,
    "Fala obiektów: 6 obiektów w 15 min bliżej niż 150 km od woj. lubelskie (kurs domniemany: 6)");
  assert.equal(S["wszystkie trzy"][0].title,
    "Fala obiektów: 3 obiekty w 15 min bliżej niż 150 km od woj. lubelskie (kurs znany: 1, domniemany: 1, nieznany: 1)");
  assert.deepEqual(S["stare bez pola course"][0].kursy, { known: 2, unknown: 1 });
  assert.match(S["22 obiekty"][0].title, /: 22 obiekty /);
  assert.match(S["12 obiektów"][0].title, /: 12 obiektów /);
  for (const w of Object.values(S)) assert.doesNotMatch(w[0].title, /kursem|na Polskę/);
});

test("panel w trzech językach, także stare wpisy bez rozbicia", () => {
  const s = { voivodeship: "lubelskie", details: { count: 6, wave: true, kursy: { presumptive: 5, unknown: 1 } } };
  assert.equal(panel("pl")(s), "Fala obiektów: 6 obiektów w 15 min bliżej niż 150 km od woj. lubelskie (kurs domniemany: 5, nieznany: 1)");
  assert.equal(panel("en")(s), "Wave of objects: 6 objects within 150 km of Lublin province in 15 min (heading presumed: 5, unknown: 1)");
  assert.equal(panel("uk")(s), "Хвиля об’єктів: 6 об’єктів за 15 хв ближче ніж 150 км до воєв. Люблінське (курс припущений: 5, невідомий: 1)");
  const stary = { voivodeship: "lubelskie", details: { count: 3, wave: true } };
  assert.equal(panel("pl")(stary), "Fala obiektów: 3 obiekty w 15 min bliżej niż 150 km od woj. lubelskie");
  assert.equal(panel("uk")({ ...stary, details: { count: 21, wave: true } }), "Хвиля об’єктів: 21 об’єкт за 15 хв ближче ніж 150 км до воєв. Люблінське");
  assert.match(czytaj("frontend/app.js"), /s\.event_type === "neptun_wave" && d\.count\) \{\s*shownTitle = tytulFali\(s\)/);
});

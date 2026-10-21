// Lustro scripts/test_rcb_bez_odwolania.py dla silnika wbudowanego (tryb bez serwera):
// „Alert RCB nie został jeszcze odwołany” do odwołania albo końca ważności, a po końcu
// ważności przez godzinę „wygasł bez odwołania” (decyzja usera 21.10.2026).
// Przypadek z 18.10.2026: podkarpackie, alert RSO 09:28, ważny do 10:59, bez odwołania.
// Uruchomienie: node scripts/test_rcb_wygasl.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const ctx = vm.createContext({ console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) } });
const kod = fs.readFileSync("frontend/engine.js", "utf8");
vm.runInContext(kod + "\nthis.TestEngine = Engine;", ctx);
// obiekty z kontekstu vm mają inny prototyp — porównujemy klucze, nie deepEqual z {}
const { rcbNieodwolane, rcbWygasle } = ctx.TestEngine.rcbPrzypomnienia;

const ALERT_T = Date.parse("2026-10-18T07:30:39Z");
const rso = (validTo, t = ALERT_T, id = "23427180") => ({ t, ts: new Date(t).toISOString(), source: "rcb",
  event_type: "rso_alert", voivodeship: "podkarpackie", points: 1.5,
  details: { rso_id: id, valid_from: "2026-10-18 09:28:00", valid_to: validTo } });
const odw = (iso, title = "Odwołanie alertu") => ({ t: Date.parse(iso), ts: iso, source: "rcb",
  event_type: "rso_clear", voivodeship: "podkarpackie", points: 0, title, details: {} });
const KONIEC = Date.parse("2026-10-18T08:59:00Z");           // 10:59 CEST
const PRZED = Date.parse("2026-10-18T08:30:00Z"), PO = Date.parse("2026-10-18T09:00:00Z");

test("do końca ważności — nie odwołany", () => {
  const w = rcbNieodwolane([rso("2026-10-18 10:59:00")], PRZED);
  assert.ok(w.podkarpackie, JSON.stringify(w));
  assert.equal(Object.keys(rcbWygasle([rso("2026-10-18 10:59:00")], PRZED)).length, 0);
});

test("po końcu ważności — wygasł, a nie „nie odwołany” (czas polski)", () => {
  assert.equal(Object.keys(rcbNieodwolane([rso("2026-10-18 10:59:00")], PO)).length, 0);
  const w = rcbWygasle([rso("2026-10-18 10:59:00")], PO);
  assert.equal(w.podkarpackie?.koniec, KONIEC);
  assert.equal(w.podkarpackie?.od, ALERT_T);
});

test("po godzinie „wygasł” znika", () => {
  assert.equal(Object.keys(rcbWygasle([rso("2026-10-18 10:59:00")], KONIEC + 61 * 60000)).length, 0);
});

test("odwołany przed końcem ważności nie jest „wygasły”", () => {
  assert.equal(Object.keys(rcbWygasle([rso("2026-10-18 10:59:00"), odw("2026-10-18T08:30:00Z")], PO)).length, 0);
});

test("odwołanie ogólnokrajowe z innego województwa też gasi", () => {
  const c = { ...odw("2026-10-18T08:30:00Z", "Brak zagrożenia na terenie Polski"), voivodeship: "lubelskie" };
  assert.equal(Object.keys(rcbNieodwolane([rso("2026-10-18 10:59:00"), c], PRZED + 60000)).length, 0);
});

test("bez valid_to — czeka na odwołanie, bez „wygasł”", () => {
  assert.ok(rcbNieodwolane([rso(null)], PO).podkarpackie);
  assert.equal(Object.keys(rcbWygasle([rso(null)], PO)).length, 0);
});

test("computeState dopisuje oba przypomnienia z zerem punktów", () => {
  assert.match(kod, /dopiszPrzypomnieniaRcb\(state, now\);\r?\n  return state;/);
  assert.match(kod, /event_type: "rcb_wygasl",\s*voivodeship: v, points: 0, counted_points: 0/);
  assert.match(kod, /event_type: "rcb_bez_odwolania",\s*voivodeship: v, points: 0, counted_points: 0/);
});

test("stałe zgodne z config.py", () => {
  const cfg = fs.readFileSync("backend/app/config.py", "utf8");
  const z = (n) => Number((cfg.match(new RegExp(`${n} = int\\(os.getenv\\("${n}", "(\\d+)"\\)\\)`)) || [])[1]);
  assert.equal(z("RCB_WYGASL_POKAZ_MIN"), 60);
  assert.equal(z("RCB_NIEODWOLANY_MAX_MIN"), 720);
  assert.match(kod, /const RCB_NIEODWOLANY_MAX_MIN = 720, RCB_WYGASL_POKAZ_MIN = 60;/);
});

test("panel pisze „wygasł” w trzech językach", () => {
  const app = fs.readFileSync("frontend/app.js", "utf8");
  assert.match(app, /s\.event_type === "rcb_wygasl"/);
  assert.match(app, /wygasł o \$\{koniec\} \(bez odwołania\)/);
  assert.match(app, /expired at \$\{koniec\} \(not cancelled\)/);
  assert.match(app, /завершилася о \$\{koniec\} \(без скасування\)/);
});

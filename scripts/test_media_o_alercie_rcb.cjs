// Lustro scripts/test_media_o_alercie_rcb.py dla silnika wbudowanego (tryb bez serwera
// i historia w aplikacji): artykuł O ALERCIE RCB bez informacji ponad alert nie daje
// drugich punktów (19.10.2026, decyzja usera). Te same prawdziwe tytuły z 11–19.10.
// Uruchomienie: node scripts/test_media_o_alercie_rcb.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const ctx = vm.createContext({ console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) } });
vm.runInContext(fs.readFileSync("frontend/engine.js", "utf8") + "\nthis.TestEngine = Engine;", ctx);
const E = ctx.TestEngine;

const ALERT_T = Date.parse("2026-10-19T04:31:00Z");
const ALERT = { id: 1, t: ALERT_T, ts: new Date(ALERT_T).toISOString(), source: "rcb", event_type: "rso_alert",
  voivodeship: "lubelskie", points: 1.5, details: { rso_id: "23430000" },
  title: "Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.”" };
const ECHA = [
  "RCB: alert dla województwa lubelskiego i podkarpackiego",
  "„Atak powietrzny na terenie Ukrainy”. Alert dla Lubelkiego",
  "„Sytuacja jest monitorowana”. Alert dla mieszkańców województwa lubelskiego",
  "Alert RCB dla województwa lubelskiego",
  "Rosyjski atak na Ukrainę. Alert RCB i ograniczenia na lotniskach w Polsce",
  "Alert RCB na Podkarpaciu. Lotniska w Rzeszowie i Lublinie wstrzymują operacje",
];
const NOWE = [
  "Niezidentyfikowany obiekt na południe od Lublina. Sprawę bada wojsko",
  "Podejrzenie naruszenia przestrzeni powietrznej. Żołnierze i policjanci prowadzą poszukiwania pod Lublinem",
  "Syreny w Lublinie. Alert RCB",
  "Drony nad Polską? Alert RCB dla lubelskiego",
  "Dowództwo Operacyjne: poderwano samoloty po atakach na zachodnią Ukrainę",
];
const KONIEC = [
  "Wojsko zakończyło kolejne działania po ataku na Ukrainę. RCB: brak zagrożenia w Polsce",
  "Zakończono poszukiwania pod Lublinem. Wojsko przekazało wyniki działań",
];
const art = (tytul, voiv, minPo, id) => {
  const t = ALERT_T + minPo * 60000;
  return { id, t, ts: new Date(t).toISOString(), source: "media", event_type: "media_keywords",
    voivodeship: voiv, points: 1.0, title: `Media: „${tytul}”`, details: { link: `https://x.test/${id}` } };
};
const punkty = (sygnaly, voiv, refMin, extra = null) => {
  const per = E.accumulate(sygnaly, ALERT_T + refMin * 60000, null, extra);
  return per[voiv].signals.filter(s => s.source === "media").reduce((a, s) => a + s.counted_points, 0);
};

test("echa alertu — 0 pkt, także w innym województwie niż alert", () => {
  ECHA.forEach((t, i) => {
    assert.equal(punkty([ALERT, art(t, "lubelskie", 20, 100 + i)], "lubelskie", 25), 0, `lubelskie: ${t}`);
    assert.equal(punkty([ALERT, art(t, "opolskie", 20, 200 + i)], "opolskie", 25), 0, `opolskie: ${t}`);
  });
});

test("informacja ponad alert — liczy się", () => {
  NOWE.forEach((t, i) => assert.ok(punkty([ALERT, art(t, "lubelskie", 20, 300 + i)], "lubelskie", 25) > 0, t));
});

test("koniec zagrożenia — 0 pkt także bez alertu", () => {
  KONIEC.forEach((t, i) => assert.equal(punkty([art(t, "lubelskie", 20, 400 + i)], "lubelskie", 25), 0, t));
});

test("okno czasu: 240 min przed artykułem, 30 min po nim", () => {
  const echo = ECHA[0];
  assert.equal(punkty([art(echo, "lubelskie", 200, 500)], "lubelskie", 205, [ALERT]), 0, "200 min — echo");
  assert.ok(punkty([art(echo, "lubelskie", 245, 501)], "lubelskie", 250, [ALERT]) > 0, "245 min — za stary");
  assert.equal(punkty([ALERT, art(echo, "lubelskie", -20, 502)], "lubelskie", 5), 0, "20 min przed odczytem RSO");
  assert.ok(punkty([ALERT, art(echo, "lubelskie", -40, 503)], "lubelskie", 5) > 0, "40 min przed alertem");
  assert.ok(punkty([art(echo, "lubelskie", 20, 504)], "lubelskie", 25) > 0, "bez alertu liczy się");
  const przyszly = { ...ALERT, t: ALERT_T + 60 * 60000, ts: new Date(ALERT_T + 60 * 60000).toISOString() };
  assert.ok(punkty([art(echo, "lubelskie", 40, 505)], "lubelskie", 45, [przyszly]) > 0, "alert z przyszłości");
});

test("echo oznaczone jako powtórzenie oficjalnego alertu", () => {
  const per = E.accumulate([ALERT, art(ECHA[0], "lubelskie", 20, 600)], ALERT_T + 25 * 60000);
  const m = per.lubelskie.signals.find(s => s.source === "media");
  assert.equal(m.duplicate_of_official, "23430000");
});

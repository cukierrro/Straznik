// Lustro scripts/test_rso_tytul_spo13.py dla silnika wbudowanego (tryb bez serwera):
// tytuł alertu RCB w nowym formacie RSO z 23.10.2026 („ALERT RCB / SPO-13”,
// prefiks „Lubelskie:”, komunikat po „o treści:” za listą powiatów).
// Uruchomienie: node scripts/test_rso_tytul_spo13.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const storage = new Map();
const ctx = vm.createContext({ console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) } });
vm.runInContext(fs.readFileSync("frontend/engine.js", "utf8") + "\nthis.TestEngine = Engine;", ctx);
const { rsoTytul } = ctx.TestEngine;

const POWIATY = "LUBELSKIEGO: włodawski, łęczyński, świdnicki, Chełm, chełmski, krasnostawski, "
  + "hrubieszowski, Zamość, zamojski, tomaszowski, biłgorajski, łukowski, Biała Podlaska, "
  + "bialski, rycki, radzyński, parczewski, lubartowski";
const MONITOR = "UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. "
  + "W przestrzeni RP operuje polskie lotnictwo. Oczekuj dalszych komunikatów.";
const KONIEC = "UWAGA! Zakończył się atak powietrzny na Ukrainę. Brak zagrożenia na terenie Polski.";

test("SPO-13 (23442123): tytuł to komunikat po „o treści:”", () => {
  const tresc = "ALERT RCB / SPO-13 Zgodnie z decyzją dyrektora RCB, do użytkowników sieci telefonii "
    + "komórkowych w powiatach na terenie województw(a):\r\n" + POWIATY + " wysłano Alert RCB o treści: " + MONITOR;
  assert.equal(rsoTytul("Lubelskie:ALERT RCB / SPO-13", tresc), MONITOR);
});

test("odwołanie (23442125): bez prefiksu województwa", () => {
  assert.equal(rsoTytul("Lubelskie: " + KONIEC, "… wysłano Alert RCB o treści: " + KONIEC), KONIEC);
});

test("stary kształt (komunikat w shortcut) bez zmian", () => {
  assert.equal(rsoTytul(MONITOR, MONITOR + " Dotyczy powiatów: hrubieszowski"), MONITOR);
});

test("nagłówek „Alert RCB” bez „o treści:” — treść bez nagłówka", () => {
  assert.equal(rsoTytul("Alert RCB", "ALERT RCB / SPO-13 " + MONITOR), MONITOR);
  assert.equal(rsoTytul("Alert RCB", ""), "Alert RCB");
});

test("17:56 (23442826): bez doklejonego „ALERT RCB / SPO-13:”", () => {
  const s = "ALERT RCB / SPO-13: UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana.";
  assert.ok(rsoTytul(s, "x o treści: " + MONITOR).startsWith("UWAGA! Rosyjski atak powietrzny"));
  assert.equal(rsoTytul("ALERT RCB-ZAGROŻENIE Z POWIETRZA", "x"), "ALERT RCB-ZAGROŻENIE Z POWIETRZA");
});

test("dwukropek po słowie, które nie jest województwem, zostaje", () => {
  assert.equal(rsoTytul("Mazowsze: coś", "x"), "Mazowsze: coś");
});

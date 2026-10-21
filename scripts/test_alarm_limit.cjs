// Czerwony alarm: przyciski na górze, krótsza treść i limit 15 minut (decyzja usera 21.10.2026).
//
// User: „lista na czerwonej syrenie jest tak długa, że trzeba przewijać do najważniejszych
// guzików” oraz „ograniczyć czas migania pełnoekranowego i syreny do 15 min max — bateria,
// grzanie się telefonu i ekranu”. Do 1.7.99 nic nie ograniczało czasu: syrena, wibracja
// i miganie trwały do potwierdzenia, a powiadomienie miało FLAG_INSISTENT bez końca.
// Pilnujemy trzech warstw naraz: ekranu w aplikacji (app.js), natywnego Androida
// (AlarmActivity, Alarms) i treści powiadomień z serwera (notify.py).
//
// Uruchomienie: node scripts/test_alarm_limit.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const czytaj = (p) => fs.readFileSync(p, "utf8");
const app = czytaj("frontend/app.js"), html = czytaj("frontend/index.html"), css = czytaj("frontend/style.css");
const JAVA = "android-app/android/app/src/main/java/pl/straznik/app/";
const alarms = czytaj(JAVA + "Alarms.java"), activity = czytaj(JAVA + "AlarmActivity.java");
const receiver = czytaj(JAVA + "AlarmActionReceiver.java"), notify = czytaj("backend/app/notify.py");

test("aplikacja: przyciski przed listą sygnałów, najwyżej 3 powody", () => {
  const box = html.slice(html.indexOf('<div class="alarm-box"'), html.indexOf('id="alarm-time"'));
  const poz = (id) => box.indexOf(`id="${id}"`);
  for (const inf of ["alarm-signals", "alarm-todo", "alarm-nearest"]) {
    assert.ok(poz("alarm-ack") > 0 && poz("alarm-ack") < poz(inf), `POTWIERDZAM przed ${inf}`);
    assert.ok(poz("alarm-choices") < poz(inf), `wybory przed ${inf}`);
  }
  assert.ok(box.indexOf('class="alarm-note"') > poz("alarm-signals"), "notka o źródle na dole");
  assert.match(app, /const ALARM_MAX_MIN = 15, ALARM_POWODY_MAX = 3;/);
  assert.match(app, /sigList\(st\.signals, ALARM_POWODY_MAX\)/);
  assert.match(html, /id="alarm-wiecej" hidden/);
});

test("aplikacja: po 15 min syrena gaśnie, ekran przestaje migać i mówi o tym", () => {
  const a = app.indexOf("const ALARM_MAX_MIN = 15"), b = app.indexOf("/* Po potwierdzeniu alarmu", a);
  assert.ok(a > 0 && b > a);
  const klasy = new Set(["hidden"]);
  const auto = { hidden: true, textContent: "" };
  let zatrzymano = 0, zlecone = null;
  const ctx = vm.createContext({
    alarmOverlay: { classList: { add: (c) => klasy.add(c), remove: (c) => klasy.delete(c), contains: (c) => klasy.has(c) } },
    document: { getElementById: (id) => (id === "alarm-auto" ? auto : null) },
    stopSiren: () => { zatrzymano++; },
    UI: { t: (pl) => pl },
    setTimeout: (f, ms) => { zlecone = { f, ms }; return 1; }, clearTimeout: () => { zlecone = null; },
  });
  vm.runInContext(app.slice(a, b), ctx);
  klasy.delete("hidden");
  ctx.ustawLimitAlarmu();
  assert.equal(zlecone?.ms, 15 * 60000, "zlecenie po 15 min");
  zlecone.f();
  assert.equal(zatrzymano, 1, "syrena i wibracja zatrzymane");
  assert.ok(klasy.has("wyciszony"), "ekran przestaje migać");
  assert.equal(auto.hidden, false);
  assert.match(auto.textContent, /Wyciszono automatycznie po 15 min/);
  // ekran zamknięty wcześniej — zlecenie niczego nie robi
  klasy.add("hidden"); zatrzymano = 0;
  ctx.ustawLimitAlarmu(); zlecone.f();
  assert.equal(zatrzymano, 0, "zamknięty alarm nie jest ruszany");
  assert.match(css, /#alarm-overlay\.wyciszony \{ animation: none; \}/);
  assert.match(app, /airRaidSiren\(true\);[^\n]*\n\s*ustawLimitAlarmu\(\);/, "limit startuje z syreną");
  assert.match(app, /alarmAck\.onclick = \(\) => \{\s*stopSiren\(\);\s*zdejmijLimitAlarmu\(\);\s*alarmOverlay\.classList\.add\("wyciszony"\)/,
    "potwierdzenie też wyłącza miganie");
});

test("Android: limit 15 min w ekranie alarmu i w powiadomieniu", () => {
  assert.match(alarms, /static final long ALARM_MAX_MS = 15 \* 60 \* 1000L;/);
  assert.match(alarms, /b\.setTimeoutAfter\(ALARM_MAX_MS \+ 60_000L\)/, "bezpiecznik systemowy");
  assert.match(alarms, /if \(pelnyAlarm && !test\) zaplanujAutoWyciszenie\(ctx, voiv, postedAt\);/);
  assert.match(alarms, /if \(postedAt <= 0 \|\| zapisany != postedAt\) return;/, "stare zlecenie nie gasi nowszego alarmu");
  assert.match(alarms, /prefs\(ctx\)\.edit\(\)\.remove\(KEY_POSTED_PREFIX \+ voiv\)/, "wyciszenie kasuje zlecenie");
  assert.match(receiver, /if \(auto > 0\) Alarms\.autoSilence\(context, voiv, auto\);/);
  assert.match(activity, /long zostalo = posted \+ Alarms\.ALARM_MAX_MS - System\.currentTimeMillis\(\);/,
    "ekran otwarty później liczy od wystawienia alarmu");
  assert.match(activity, /private void wyciszPoLimicie\(\) \{\s*stopAlarmSignals\(\);/);
  assert.ok(activity.indexOf('ack.setText("POTWIERDZAM') < activity.indexOf("new ScrollView(this)"),
    "przyciski nad przewijaną częścią");
});

test("Android i serwer: najwyżej 3 powody i jedna linia „co zrobić · źródło”", () => {
  assert.match(alarms, /static final int POWODY_MAX = 3;/);
  assert.match(notify, /POWODY_W_POWIADOMIENIU = 3/);
  const ogonPy = (notify.match(/OGON_CZERWONY = "([^"]+)"/) || [])[1];
  assert.ok(ogonPy && alarms.includes(`"${ogonPy}"`), "ten sam ogon czerwonego w Androidzie i na serwerze");
  assert.match(ogonPy, /przejdź do miejsca schronienia/);
  assert.doesNotMatch(notify, /NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO\./);
  assert.doesNotMatch(alarms, /Math\.min\(reasons\.size\(\), [46]\)/, "bez dawnych 4 i 6 powodów");
  assert.match(notify, /reasons = krotkie_powody\(data\.get\("reasons"\) or ""\)/, "iPhone: 3 powody");
});

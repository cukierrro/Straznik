// Alarmy tylko dla obserwowanych województw (zgłoszenie #15, 20.10.2026).
//
// Telefon z jednym miejscem w mazowieckim dostawał żółte i CZERWONE alarmy dla
// lubelskiego i podkarpackiego, choć ustawienia pokazywały „mazowieckie”. Mazowieckie
// od 13.10 nie miało ani jednego czerwonego (alert_log na serwerze), więc to nie było
// przeniesienie od sąsiadów, tylko tematy FCM, które zostały na serwerach Google:
// synchronizacja wypisywała wyłącznie z tematów z własnej listy aplikacji, a ta bywała
// niepełna (domyślna ściana wschodnia przy pierwszym starcie, wyścig dwóch synchronizacji).
// Pilnujemy: (1) wypisania ze WSZYSTKICH tematów województw spoza celu, (2) odrzucenia
// alarmu spoza obserwowanych w natywnej usłudze FCM — zanim cokolwiek zawyje albo trafi
// do aplikacji, (3) tego samego w otwartej aplikacji.
//
// Uruchomienie: node scripts/test_obserwowane_wojewodztwa.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const JAVA = "android-app/android/app/src/main/java/pl/straznik/app/";
const plugin = fs.readFileSync(JAVA + "BackgroundPlugin.java", "utf8");
const fcm = fs.readFileSync(JAVA + "StraznikFcmService.java", "utf8");
const app = fs.readFileSync("frontend/app.js", "utf8");

test("synchronizacja wypisuje ze wszystkich tematów województw spoza celu", () => {
  assert.match(plugin, /for \(String v : Alarms\.VOIVS\) doWypisania\.add\(voivTopic\(v\)\);/);
  assert.match(plugin, /for \(String t : doWypisania\) if \(!target\.contains\(t\)\) fm\.unsubscribeFromTopic\(t\);/);
  assert.doesNotMatch(plugin, /for \(String t : current\) if \(!target\.contains\(t\)\) fm\.unsubscribeFromTopic\(t\);/,
    "dawne wypisywanie tylko z własnej listy");
});

test("usługa FCM odrzuca województwo spoza obserwowanych, zanim zawyje", () => {
  const filtr = fcm.indexOf("BackgroundPlugin.obserwowane(this, Alarms.VOIVS[voiv])");
  assert.ok(filtr > 0, "filtr jest");
  assert.ok(filtr < fcm.indexOf("BackgroundPlugin.forwardAlarm(data)"), "przed przekazaniem do aplikacji");
  assert.ok(filtr < fcm.indexOf("Alarms.postAlarm("), "przed alarmem natywnym");
  assert.ok(filtr > fcm.indexOf("KEY_ALERTS_OFF"), "po sprawdzeniu wyłączonych alarmów");
  // nieczytelne ustawienia (przed odblokowaniem) przepuszczają — cisza byłaby gorsza
  assert.match(plugin, /static boolean obserwowane\(Context c, String voiv\) \{[\s\S]*?catch \(Exception e\) \{\s*return true;/);
  assert.match(plugin, /if \(bg\.contains\(KEY_REGIONS\)\)\s*return bg\.getStringSet\(KEY_REGIONS/);
});

test("otwarta aplikacja też nie alarmuje dla cudzego województwa", () => {
  const f = app.slice(app.indexOf("function onForegroundPush(d) {"), app.indexOf("fcmSeen.add(id);"));
  assert.match(f, /const obserwowane = Places\?\.observedVoivodeships\?\.\(savedPlaces\) \|\| \[\];/);
  assert.match(f, /if \(obserwowane\.length && !obserwowane\.includes\(d\.voiv\)\) return;/);
});

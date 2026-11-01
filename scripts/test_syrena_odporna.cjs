// Czerwony alarm odporny na to, co dzieje się z telefonem (noc 1.11.2026, wydanie 1.8.05).
//
// O 3:06 przyszedł czerwony, a rano dwie osoby mówiły, że go nie słyszały. Na emulatorach
// (Android 14 i 9, prawdziwa ścieżka FCM) zmierzone: syrenę grało samo powiadomienie, więc
// gasiły ją na stałe panel powiadomień, przyciski głośności, SMS, żółty dla innego
// województwa; czerwony po żółtym nie dostawał pełnego ekranu; poniżej Androida 14 aplikacja
// sama zapalała ekran i tym zabierała sobie pełny ekran. Do tego telefon pamiętał tylko
// ostatni push, więc nie dało się sprawdzić, czy alarm w ogóle dotarł.
//
// Ten test pilnuje kodu. Samo zachowanie sprawdzono na emulatorach (zastrzyk prawdziwej ścieżki FCM
// przez adb); przycisk testu w aplikacji nie planuje wyciszenia po limicie, więc tego nie zastąpi.
//
// Uruchomienie: node scripts/test_syrena_odporna.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const czytaj = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const JAVA = "android-app/android/app/src/main/java/pl/straznik/app/";
const alarms = czytaj(JAVA + "Alarms.java"), activity = czytaj(JAVA + "AlarmActivity.java");
const fcm = czytaj(JAVA + "StraznikFcmService.java"), plugin = czytaj(JAVA + "BackgroundPlugin.java");
const app = czytaj("frontend/app.js"), html = czytaj("frontend/index.html"), i18n = czytaj("frontend/i18n.js");

// treść metody od nagłówka do następnej metody na tym samym wcięciu
const metoda = (kod, naglowek) => {
  const a = kod.indexOf(naglowek);
  assert.ok(a >= 0, "brak: " + naglowek);
  const b = kod.indexOf("\n    }\n", a);
  return kod.slice(a, b);
};

test("ekran alarmu gra własną syrenę, nie tylko gdy kanał milczy", () => {
  const start = metoda(activity, "protected void onCreate(Bundle saved)");
  assert.match(start, /wlaczSyrene\(\);/);
  assert.doesNotMatch(activity, /if \(!Alarms\.highChannelPlaysSound\(this\)\) startSiren\(\)/,
    "własny odtwarzacz zależny od kanału to dokładnie ten błąd");
  const nowy = metoda(activity, "protected void onNewIntent(Intent intent)");
  assert.match(nowy, /wlaczSyrene\(\);/, "drugi alarm przy otwartym ekranie też");
});

test("powiadomienie oddaje dźwięk dopiero, gdy własny odtwarzacz gra", () => {
  const w = metoda(activity, "private void wlaczSyrene()");
  assert.match(w, /if \(Alarms\.redSilent\(this\)\) return;/, "„tylko wibracja” nadal nie gra");
  assert.ok(w.indexOf("startSiren()") < w.indexOf("przejmijDzwiek"));
  assert.match(w, /if \(player == null\) return;/, "gdy odtwarzacz nie ruszy, syrena z kanału zostaje");
  assert.match(metoda(alarms, "static void przejmijDzwiek"), /CH_HIGH_SILENT, true/);
});

test("zamknięcie ekranu bez potwierdzenia oddaje syrenę powiadomieniu", () => {
  const d = metoda(activity, "protected void onDestroy()");
  assert.match(d, /!zakonczone && !isChangingConfigurations\(\)/);
  assert.match(d, /Alarms\.oddajDzwiek/);
  assert.match(metoda(activity, "private void finishAlarm()"), /zakonczone = true;/);
  assert.match(metoda(alarms, "static void oddajDzwiek"), /highChannel\(ctx\), false/);
});

test("wyciszenie spoza ekranu gasi też jego syrenę", () => {
  const s = metoda(alarms, "static void silence(Context ctx, int voiv, boolean auto)");
  assert.match(s, /AlarmActivity\.wyciszono\(voiv, auto\);/);
  const w = metoda(activity, "static void wyciszono(int voiv, boolean auto)");
  assert.match(w, /EXTRA_VOIV_INDEX, -1\) != voiv\) return;/, "inne województwo nie gasi tego alarmu");
  assert.match(metoda(activity, "private void wyciszPoLimicie()"), /if \(zakonczone\) return;/, "limit bez pętli przez silence");
});

test("przyciski głośności nie zmieniają głośności grającego alarmu", () => {
  for (const nazwa of ["public boolean onKeyDown", "public boolean onKeyUp"])
    assert.match(metoda(activity, nazwa), /czyPrzyciskGlosnosci\(keyCode\) && player != null\) return true/);
  for (const klawisz of ["KEYCODE_VOLUME_UP", "KEYCODE_VOLUME_DOWN", "KEYCODE_VOLUME_MUTE"])
    assert.ok(metoda(activity, "private static boolean czyPrzyciskGlosnosci").includes(klawisz));
});

test("czerwony po żółtym jest nowym powiadomieniem, więc dostaje pełny ekran", () => {
  const p = metoda(alarms, "static void postAlarm(Context ctx, int voiv, String level, double score, List<String> reasons,\n");
  const anuluj = p.indexOf("if (pelnyAlarm && nm != null) nm.cancel(notifId(voiv));");
  assert.ok(anuluj > 0);
  assert.ok(anuluj < p.indexOf("nm.notify(notifId(voiv), n);"));
});

test("zapalanie ekranu czeka na pełny ekran, gdy zgoda jest", () => {
  const m = metoda(alarms, "static void ensureAlarmIsSeen(Context ctx, NotificationManager nm)");
  assert.match(m, /Build\.VERSION\.SDK_INT < 34 \|\| \(nm != null && nm\.canUseFullScreenIntent\(\)\)/);
  assert.match(m, /postDelayed\(\(\) -> zapalEkran\(ctx\), 3_000L\)/);
  // przy włączonym ekranie Android pomija pełny ekran, więc opóźnienie nie może zniknąć
  assert.ok(m.indexOf("postDelayed") < m.lastIndexOf("zapalEkran(ctx);"));
  assert.match(metoda(alarms, "private static void zapalEkran"), /pm == null \|\| pm\.isInteractive\(\)/);
});

test("dziennik: każda droga alarmu zostawia ślad", () => {
  assert.match(fcm, /dziennik\(this, "odebrano"/);
  assert.ok(fcm.indexOf('dziennik(this, "odebrano"') < fcm.indexOf("KEY_ALERTS_OFF"), "przed odrzuceniem");
  for (const e of ["pominiety_wylaczone", "pominiety_region", "w_aplikacji"])
    assert.ok(fcm.includes(`"${e}"`), e);
  for (const e of ["spozniony", "pokazano"]) assert.ok(alarms.includes(`"${e}"`), e);
  assert.match(alarms, /auto \? "limit" : "wyciszono"/);
  assert.match(activity, /dziennik\(this, "ekran"/);
  assert.match(activity, /dziennik\(this, "syrena_blad"/);
  assert.match(alarms, /DZIENNIK_MAX = 40/);
  assert.match(plugin, /ret\.put\("alarmLog"/);
});

test("dziennik: alarm testowy go nie zaśmieca", () => {
  const p = metoda(alarms, "static void postAlarm(Context ctx, int voiv, String level, double score, List<String> reasons,\n");
  assert.match(p, /if \(!test\) dziennik\(ctx, "pokazano"/);
  assert.match(p, /if \(!test\) dziennik\(ctx, "spozniony"/);
});

test("dziennik w ustawieniach: tylko Android, trzy języki, opis każdego zdarzenia", () => {
  assert.match(html, /<details class="jak app-only android-only"><summary id="jak-dziennik">/);
  assert.match(html, /id="dziennik-alarmow"/);
  assert.match(i18n, /button\("jak-dziennik"/);
  assert.match(i18n, /set\("#jak-dziennik"/);
  assert.match(i18n, /"Alert log on this phone": "/);
  const f = app.slice(app.indexOf("function renderDziennikAlarmow"), app.indexOf("async function refreshBgStatus"));
  for (const e of ["odebrano", "pokazano", "ekran", "syrena_blad", "wyciszono", "limit", "spozniony",
                   "w_aplikacji", "pominiety_wylaczone", "pominiety_region"])
    assert.ok(f.includes(`case "${e}"`), "brak opisu: " + e);
  assert.match(f, /esc\(opis\(w\)\)/, "tekst przechodzi przez esc");
  assert.match(app, /renderDziennikAlarmow\(s\.alarmLog, previewLang\)/);
});

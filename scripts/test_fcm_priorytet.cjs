// Priorytet FCM i widoczne powiadomienie (11.10.2026).
//
// Alarm wysłany 09:50:56 dotarł na telefon usera 09:52:16 — 80 s. Google obniża
// priorytet pilnym wiadomościom, które nie kończą się WIDOCZNYM powiadomieniem
// (ocena z 7 dni, osobno dla każdego telefonu; dokumentacja Firebase „Deprioritization
// of high priority FCM on Android”). Alarm przekazany do otwartej aplikacji nie
// zostawiał nic w systemie, więc kto często ma Strażnika na ekranie, dostawał potem
// alarmy przy zgaszonym ekranie z opóźnieniem.
//
// Czego pilnuje ten test (kodu natywnego nie da się tu uruchomić, więc czytamy go):
//   * dowód dostarczenia z priorytetem i drogą zapisuje się PRZED każdym wyjściem
//     z onMessageReceived (także przy wyłączonych alarmach i nieznanym województwie),
//   * otwarta aplikacja nadal dostaje alarm, ALE system dostaje ciche powiadomienie
//     (kanał bez dźwięku, ten sam identyfikator co alarm),
//   * ustawienia pokazują drogę i obniżony priorytet we wszystkich językach.
//
// Uruchomienie: node scripts/test_fcm_priorytet.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const DIR = 'android-app/android/app/src/main/java/pl/straznik/app/';
const FCM = czytaj(DIR + 'StraznikFcmService.java');
const ALARMS = czytaj(DIR + 'Alarms.java');
const PLUGIN = czytaj(DIR + 'BackgroundPlugin.java');
const APP = czytaj('frontend/app.js');
const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function cialo(src, naglowek) {
  const start = src.indexOf(naglowek);
  assert.notEqual(start, -1, `brak: ${naglowek}`);
  let g = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') g++;
    else if (src[i] === '}' && --g === 0) return src.slice(start, i + 1);
  }
  throw new Error('niedomknięte: ' + naglowek);
}

test('dowód dostarczenia z priorytetem przed każdym wyjściem', () => {
  const odbior = bezKomentarzy(cialo(FCM, 'public void onMessageReceived('));
  const zapis = odbior.indexOf('.putLong("last_push_at"');
  const pierwszyReturn = odbior.indexOf('return');
  assert.ok(zapis > 0 && zapis < pierwszyReturn, 'zapis musi stać przed pierwszym return');
  assert.match(odbior, /getOriginalPriority\(\) == RemoteMessage\.PRIORITY_HIGH\s*&& remoteMessage\.getPriority\(\) != RemoteMessage\.PRIORITY_HIGH/,
    'obniżony = wysłany jako HIGH, dostarczony nie jako HIGH');
  assert.match(odbior, /putLong\("last_push_delay_ms"/);
  assert.match(odbior, /putBoolean\("last_push_deprioritized"/);
});

test('otwarta aplikacja: alarm w aplikacji i ciche powiadomienie w systemie', () => {
  const odbior = bezKomentarzy(cialo(FCM, 'public void onMessageReceived('));
  assert.match(odbior,
    /BackgroundPlugin\.forwardAlarm\(data\)\) \{\s*Alarms\.createChannels\(this\);\s*Alarms\.postShownInApp\(this, voiv, level, score, data\.get\("headline"\), sentAtMs\);\s*return;/,
    'po przekazaniu do aplikacji musi zostać powiadomienie systemowe');
  const ciche = bezKomentarzy(cialo(ALARMS, 'static void postShownInApp('));
  assert.match(ciche, /builder\(ctx, CH_QUIET\)/, 'kanał bez dźwięku i wibracji — alarm gra aplikacja');
  assert.match(ciche, /nm\.notify\(notifId\(voiv\)/, 'ten sam identyfikator co alarm natywny');
  assert.ok(!/setOngoing|setLocalOnly/.test(ciche), 'ma być widoczne i przekazywane dalej');
});

test('ustawienia pokazują drogę i obniżony priorytet', () => {
  for (const pole of ['lastPushDelayMs', 'lastPushDeprioritized', 'deprioritizedCount'])
    assert.match(PLUGIN, new RegExp(`ret\\.put\\("${pole}"`), `status: ${pole}`);
  for (const zwrot of [/Google obniżył mu priorytet/, /Google lowered its priority/, /Google знизив йому пріоритет/])
    assert.match(APP, zwrot);
  assert.match(APP, /\+ droga/, 'wiersz „Ostatni sygnał…” dostaje opis drogi');
});

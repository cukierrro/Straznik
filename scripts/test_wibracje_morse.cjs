// Wibracja alfabetem Morse'a i czerwony alarm na zegarku (10.10.2026).
//
// Decyzja usera: żółty to „U” (· · —) — Uwaga / Увага / Urgent, czerwony to
// „A” (· —) — Alarm / Атака. Dawny żółty (dwa krótkie) był prawie identyczny
// z domyślną wibracją Androida, a strona i aplikacja wibrowały różnie.
// Przy okazji (uwaga usera o osobach głuchych): czerwony miał setOngoing(true),
// a Wear OS NIE przekazuje powiadomień stałych na zegarek — czerwony nie
// docierał na rękę.
//
// Czego pilnuje ten test:
//   * te same wzory w Alarms.java, app.js i sw.js (kanał, otwarta aplikacja,
//     strona) — rozjazd znaczyłby, że ta sama rzecz wibruje różnie,
//   * wzory naprawdę dekodują się do „UU” i „AAA” przy proporcjach Morse'a,
//   * żaden alarm nie jest stały, tylko lokalny ani nieusuwalny (mostkowanie),
//   * kanały ze zmienionym wzorem mają NOWE identyfikatory, stare są w
//     CH_LEGACY i przekazują ustawienia przez utworz(),
//   * tryb „zwykle” wyłącza pełny ekran, syrenę w pętli, głośność i wybudzanie,
//   * ustawienia mają trzy tryby czerwonego z tłumaczeniami EN/UK.
//
// Uruchomienie: node scripts/test_wibracje_morse.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JAVA_DIR = 'android-app/android/app/src/main/java/pl/straznik/app/';
const ALARMS = czytaj(JAVA_DIR + 'Alarms.java');
const ACTIVITY = czytaj(JAVA_DIR + 'AlarmActivity.java');
const PLUGIN = czytaj(JAVA_DIR + 'BackgroundPlugin.java');
const APP = czytaj('frontend/app.js');
const SW = czytaj('frontend/sw.js');
const HTML = czytaj('frontend/index.html');
const I18N = czytaj('frontend/i18n.js');

const bezKomentarzy = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const liczby = (txt) => txt.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));

function tablicaJava(nazwa) {
  const m = ALARMS.match(new RegExp(`static final long\\[\\] ${nazwa} = \\{([^}]*)\\}`));
  assert.ok(m, `brak ${nazwa} w Alarms.java`);
  return liczby(m[1]);
}
function tablicaJs(src, nazwa) {
  const m = src.match(new RegExp(`const ${nazwa} = \\[([^\\]]*)\\]`));
  assert.ok(m, `brak ${nazwa} w app.js`);
  return liczby(m[1]);
}

/* Dekoder: [wibracja, przerwa, wibracja, …] → litery. Kreska ≥ 2 jednostki,
   przerwa ≥ 2 jednostki kończy literę. Jednostka = najkrótsza wibracja. */
function dekoduj(wzor) {
  const jedn = Math.min(...wzor.filter((_, i) => i % 2 === 0));
  const MORSE = { '..-': 'U', '.-': 'A', '...': 'S', '---': 'O' };
  let litera = '', wynik = '';
  wzor.forEach((ms, i) => {
    if (i % 2 === 0) litera += ms >= 2 * jedn ? '-' : '.';
    else if (ms >= 2 * jedn) { wynik += MORSE[litera] || '?'; litera = ''; }
  });
  if (litera) wynik += MORSE[litera] || '?';
  return wynik;
}

test('te same wzory w Javie, aplikacji i na stronie', () => {
  const javaU = tablicaJava('WZOR_U'), javaA = tablicaJava('WZOR_A');
  assert.equal(javaU[0], 0, 'Android zaczyna od opóźnienia 0');
  assert.deepEqual(tablicaJs(APP, 'WIBRACJA_U'), javaU.slice(1));
  assert.deepEqual(tablicaJs(APP, 'WIBRACJA_A'), javaA.slice(1));
  const sw = SW.match(/vibrate: data\.level === "high"\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/);
  assert.ok(sw, 'sw.js: brak wibracji per poziom');
  assert.deepEqual(liczby(sw[1]), javaA.slice(1), 'sw.js czerwony');
  assert.deepEqual(liczby(sw[2]), javaU.slice(1), 'sw.js żółty');
  const petla = tablicaJava('WZOR_A_PETLA');
  assert.deepEqual(petla.slice(0, javaA.length), javaA, 'pętla to „A A A” + przerwa');
  assert.ok(petla.at(-1) >= 7 * 200, 'przerwa słowa ≥ 7 jednostek');
  assert.match(ACTIVITY, /pattern = Alarms\.WZOR_A_PETLA/, 'ekran alarmu używa wzoru z Alarms');
});

test('wzory dekodują się do U i A, nie do SOS', () => {
  assert.equal(dekoduj(tablicaJs(APP, 'WIBRACJA_U')), 'UU');
  assert.equal(dekoduj(tablicaJs(APP, 'WIBRACJA_A')), 'AAA');
  assert.ok(!/SOS/.test(dekoduj(tablicaJs(APP, 'WIBRACJA_A'))));
});

test('każdy kanał z wibracją używa wzoru Morse’a, nie własnych liczb', () => {
  const kod = bezKomentarzy(ALARMS);
  const wzory = [...kod.matchAll(/setVibrationPattern\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.ok(wzory.length >= 6, `za mało kanałów z wibracją (${wzory.length})`);
  for (const w of wzory) assert.match(w, /^WZOR_[UA]$/, `kanał z własnym wzorem: ${w}`);
});

test('alarm trafia na zegarek: nic stałego, lokalnego ani nieusuwalnego', () => {
  const kod = bezKomentarzy(ALARMS);
  assert.ok(!/setOngoing\s*\(\s*true/.test(kod), 'setOngoing(true) blokuje zegarki Wear OS');
  assert.ok(!/setLocalOnly\s*\(\s*true/.test(kod), 'setLocalOnly(true) blokuje każdy zegarek');
  assert.ok(!/FLAG_NO_CLEAR|FLAG_ONGOING_EVENT/.test(kod), 'flagi nieusuwalności blokują mostkowanie');
});

test('nowe kanały, stare w sprzątaniu, ustawienia przenoszone', () => {
  const id = (nazwa) => ALARMS.match(new RegExp(`static final String ${nazwa} = "([^"]+)"`))[1];
  const legacy = ALARMS.match(/CH_LEGACY = \{([\s\S]*?)\};/)[1];
  const stare = [...legacy.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const n of ['CH_HIGH', 'CH_INFO', 'CH_INFO_QUIET', 'CH_INFO_SILENT', 'CH_HIGH_SILENT', 'CH_HIGH_NORMAL'])
    assert.ok(!stare.includes(id(n)), `${n} (${id(n)}) nie może być na liście do skasowania`);
  const przenosiny = [...bezKomentarzy(ALARMS).matchAll(/utworz\(nm, \w+, "([^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(przenosiny.length, 5, 'pięć kanałów ze zmienionym wzorem przenosi ustawienia');
  for (const s of przenosiny) assert.ok(stare.includes(s), `${s} musi być w CH_LEGACY`);
  // sprzątanie DOPIERO po utworzeniu — inaczej nie ma z czego przenieść
  const kod = bezKomentarzy(ALARMS);
  assert.ok(kod.indexOf('deleteNotificationChannel') > kod.lastIndexOf('utworz(nm,'),
    'stare kanały kasowane po przeniesieniu ustawień');
  assert.match(kod, /IMPORTANCE_NONE\)\s*\n?\s*nowy\.setImportance\(NotificationManager\.IMPORTANCE_NONE\)/);
  assert.match(kod, /if \(!s\.shouldVibrate\(\)\) nowy\.enableVibration\(false\)/);
});

test('tryb „zwykle” wyłącza pełny ekran, pętlę syreny, głośność i wybudzanie', () => {
  const kod = bezKomentarzy(ALARMS);
  assert.match(kod, /boolean pelnyAlarm = high && !redNormal\(ctx\)/);
  for (const wzor of [/if \(pelnyAlarm\) \{[\s\S]*?setFullScreenIntent/, /if \(pelnyAlarm\) n\.flags \|= Notification\.FLAG_INSISTENT/,
                      /if \(pelnyAlarm\) raiseAlarmVolume/, /if \(pelnyAlarm\) ensureAlarmIsSeen/])
    assert.match(kod, wzor);
  assert.match(kod, /case RED_NORMAL:\s*return CH_HIGH_NORMAL/);
  // kanał zwykły nie obchodzi trybu Nie przeszkadzać
  const zwykly = kod.slice(kod.indexOf('new NotificationChannel(CH_HIGH_NORMAL'), kod.indexOf('createNotificationChannel(highNormal)'));
  assert.ok(!/setBypassDnd/.test(zwykly), 'zwykłe powiadomienie nie przebija Nie przeszkadzać');
  assert.match(PLUGIN, /public void setRedMode\(PluginCall call\)/);
  assert.match(PLUGIN, /ret\.put\("redMode", Alarms\.redMode\(c\)\)/);
});

test('ustawienia: trzy tryby czerwonego z tłumaczeniami', () => {
  const tryby = [...HTML.matchAll(/id="rm-(\w+)" class="chip" data-tryb="(\w+)"/g)].map((m) => m[2]);
  assert.deepEqual(tryby, ['syrena', 'wibracja', 'zwykle']);
  assert.match(APP, /const TRYBY_CZERWONEGO = \["syrena", "wibracja", "zwykle"\]/);
  assert.ok(!/set-red-silent/.test(HTML + APP + I18N), 'stary przełącznik usunięty wszędzie');
  for (const id of ['rm-head', 'rm-syrena', 'rm-wibracja', 'rm-zwykle', 'btn-vib-u', 'btn-vib-a']) {
    assert.match(I18N, new RegExp(`button\\("${id}", `), `${id}: brak w podglądzie ustawień`);
    assert.match(I18N, new RegExp(`set\\("#${id}", `), `${id}: brak w wersji angielskiej`);
  }
  for (const en of ['Red alert', 'Siren', 'Vibration only', 'Regular notification'])
    assert.match(I18N, new RegExp(`"${en}": "`), `brak ukraińskiego dla „${en}”`);
  assert.ok(!/zawibruje tak samo|vibrates just the same|завібрує так само/.test(I18N + HTML),
    'nie obiecujemy, że zegarek wibruje tak samo');
});

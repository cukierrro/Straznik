// Godziny ciszy (13.10.2026, prośba czytelnika po nocnym alarmie o 4:00):
// „w dzień chcę słyszeć, w nocy w domu wystarczy wibracja”.
//
// W ustawionych godzinach żółty idzie bez dźwięku, a czerwony z syreną — tylko
// wibracją (albo z syreną, jeśli użytkownik tak wybierze). Zapisany wybór się nie
// zmienia; decyduje wariant „teraz” — w Alarms.java (redModeNow / yellowLevelNow,
// dla powiadomień przy zamkniętej aplikacji) i w app.js (godzinyCiszyTeraz, dla
// sygnałów w otwartej aplikacji). Test sprawdza zachowanie JS i to, że Java liczy
// okno tak samo i że każda decyzja o dźwięku pyta o wariant „teraz”.
//
// Uruchomienie: node scripts/test_godziny_ciszy.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
const HTML = fs.readFileSync('frontend/index.html', 'utf8');
const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
const J = 'android-app/android/app/src/main/java/pl/straznik/app/';
const ALARMS = fs.readFileSync(J + 'Alarms.java', 'utf8');
const PLUGIN = fs.readFileSync(J + 'BackgroundPlugin.java', 'utf8');

// koniec funkcji/bloku = pierwsza klamra w kolumnie 0 (CRLF na Windows, LF w repo)
const wytnij = (od) => APP.slice(APP.indexOf(od)).match(/^[\s\S]*?\r?\n\}/)[0];
const kod = [
  wytnij('function czerwonyBezSyreny()'),
  APP.match(/^const CISZA_KLUCZ = .*$/m)[0],
  APP.match(/^const CISZA_DOMYSLNIE = .*$/m)[0],
  wytnij('function ciszaUstawienia()'),
  wytnij('function wOknieCiszy('),
  wytnij('function godzinyCiszyTeraz('),
  wytnij('function czerwonyTrybTeraz()'),
].join('\n');

function swiat({ ustaw = null, tryb = 'syrena', ios = false, app = true, teraz = '23:30' } = {}) {
  const pamiec = new Map();
  if (ustaw) pamiec.set('straznik_godziny_ciszy', JSON.stringify(ustaw));
  const [h, m] = teraz.split(':').map(Number);
  class D extends Date { constructor(...a) { if (a.length) super(...a); else { super(2026, 9, 13, h, m); } } }
  const ctx = vm.createContext({
    IS_APP: app, IS_IOS: ios, czerwonyTryb: () => tryb, JSON, Number, Date: D,
    localStorage: { getItem: (k) => pamiec.has(k) ? pamiec.get(k) : null },
  });
  vm.runInContext(kod + '\nthis.f = { czerwonyBezSyreny, ciszaUstawienia, wOknieCiszy, godzinyCiszyTeraz, czerwonyTrybTeraz };', ctx);
  return ctx.f;
}
const NOC = { on: true, od: 22 * 60, do: 7 * 60, czerwony: 'wibracja' };

test('okno przez północ: 22:00–07:00', () => {
  const { wOknieCiszy } = swiat();
  const t = (s) => { const [h, m] = s.split(':').map(Number); return wOknieCiszy(22 * 60, 7 * 60, h * 60 + m); };
  assert.equal(t('22:00'), true); assert.equal(t('23:59'), true); assert.equal(t('00:00'), true);
  assert.equal(t('04:00'), true, 'pobudka o 4:00 z prośby czytelnika');
  assert.equal(t('06:59'), true); assert.equal(t('07:00'), false); assert.equal(t('21:59'), false);
  assert.equal(t('12:00'), false);
});

test('okno w ciągu dnia i od == do', () => {
  const { wOknieCiszy } = swiat();
  assert.equal(wOknieCiszy(13 * 60, 15 * 60, 14 * 60), true);
  assert.equal(wOknieCiszy(13 * 60, 15 * 60, 15 * 60), false);
  assert.equal(wOknieCiszy(8 * 60, 8 * 60, 8 * 60), false, 'od == do znaczy „nigdy”, nie „całą dobę”');
});

test('w nocy czerwony z syreną idzie tylko wibracją, w dzień jak zwykle', () => {
  assert.equal(swiat({ ustaw: NOC, teraz: '04:00' }).czerwonyTrybTeraz(), 'wibracja');
  assert.equal(swiat({ ustaw: NOC, teraz: '04:00' }).czerwonyBezSyreny(), true);
  assert.equal(swiat({ ustaw: NOC, teraz: '15:00' }).czerwonyTrybTeraz(), 'syrena');
  assert.equal(swiat({ ustaw: { ...NOC, on: false }, teraz: '04:00' }).czerwonyTrybTeraz(), 'syrena', 'wyłączone = bez zmian');
});

test('„syrena jak w dzień” zostawia syrenę; cisza nigdy nie robi alarmu głośniejszym', () => {
  assert.equal(swiat({ ustaw: { ...NOC, czerwony: 'syrena' }, teraz: '04:00' }).czerwonyTrybTeraz(), 'syrena');
  assert.equal(swiat({ ustaw: NOC, tryb: 'zwykle', teraz: '04:00' }).czerwonyTrybTeraz(), 'zwykle');
  assert.equal(swiat({ ustaw: NOC, tryb: 'wibracja', teraz: '15:00' }).czerwonyTrybTeraz(), 'wibracja');
  assert.equal(swiat({ ustaw: { ...NOC, czerwony: 'syrena' }, tryb: 'wibracja', teraz: '04:00' }).czerwonyTrybTeraz(), 'wibracja');
});

test('iPhone i strona: bez zmian (dźwięk powiadomienia na iOS ustala serwer)', () => {
  assert.equal(swiat({ ustaw: NOC, ios: true, teraz: '04:00' }).godzinyCiszyTeraz(), false);
  assert.equal(swiat({ ustaw: NOC, app: false, teraz: '04:00' }).godzinyCiszyTeraz(), false);
});

test('uszkodzony zapis — bezpieczne wartości domyślne (wyłączone)', () => {
  const f = swiat({ ustaw: { on: 'tak', od: 99999, do: -5, czerwony: 'x' }, teraz: '04:00' });
  assert.deepEqual({ ...f.ciszaUstawienia() }, { on: false, od: 1320, do: 420, czerwony: 'wibracja' });
  assert.equal(f.godzinyCiszyTeraz(), false);
});

test('żółty w otwartej aplikacji: w godzinach ciszy bez dźwięku', () => {
  assert.match(APP, /const mnoznik = CHIME_LEVELS\[godzinyCiszyTeraz\(\) \? "silent" : chimeLevel\(\)\];/);
});

test('Java: to samo okno i każda decyzja o dźwięku pyta o wariant „teraz”', () => {
  const okno = ALARMS.slice(ALARMS.indexOf('static boolean inWindow('), ALARMS.indexOf('static boolean quietNow('));
  assert.match(okno, /if \(od == doo\) return false;/);
  assert.match(okno, /od < doo \? \(teraz >= od && teraz < doo\) : \(teraz >= od \|\| teraz < doo\)/);
  assert.match(ALARMS, /static String highChannel\(Context ctx\) \{\s+switch \(redModeNow\(ctx\)\)/);
  assert.match(ALARMS, /static String infoChannel\(Context ctx\) \{\s+switch \(yellowLevelNow\(ctx\)\)/);
  assert.match(ALARMS, /static boolean redSilent\(Context ctx\) \{\s+return !RED_SIREN\.equals\(redModeNow\(ctx\)\);/);
  assert.match(ALARMS, /static boolean redNormal\(Context ctx\) \{\s+return RED_NORMAL\.equals\(redModeNow\(ctx\)\);/);
  assert.match(ALARMS, /if \(RED_SIREN\.equals\(m\) && quietNow\(ctx\) && RED_VIBRATION\.equals\(quietRed\(ctx\)\)\) return RED_VIBRATION;/);
  assert.match(ALARMS, /return quietNow\(ctx\) \? "silent" : yellowLevel\(ctx\);/);
  // domyślnie wyłączone; domyślnie 22:00–07:00 i czerwony tylko wibracją
  assert.match(ALARMS, /getBoolean\(KEY_QUIET_ON, false\)/);
  assert.match(ALARMS, /QUIET_FROM_DEFAULT = 22 \* 60, QUIET_TO_DEFAULT = 7 \* 60/);
});

test('wtyczka: zapis, status i ZAPISANY tryb czerwonego w statusie', () => {
  assert.match(PLUGIN, /@PluginMethod\s+public void setQuietHours\(PluginCall call\)/);
  const status = PLUGIN.slice(PLUGIN.indexOf('ret.put("redChannelSound"'), PLUGIN.indexOf('call.resolve(ret);', PLUGIN.indexOf('ret.put("redChannelSound"')));
  assert.match(status, /putQuiet\(ret, c\);/);
  assert.match(status, /ret\.put\("redSilent", !Alarms\.RED_SIREN\.equals\(Alarms\.redMode\(c\)\)\);/,
    'w nocy ustawienia nie mogą pisać „masz tylko wibrację”, gdy wybrano syrenę');
  assert.doesNotMatch(PLUGIN, /Alarms\.redSilent\(c\)/);
  // JS zapisuje kopię dopiero po potwierdzeniu z warstwy natywnej
  const zapis = wytnij('async function zapiszGodzinyCiszy(');
  assert.ok(zapis.includes('setQuietHours') && zapis.includes('localStorage.setItem(CISZA_KLUCZ'));
  assert.ok(zapis.indexOf('setQuietHours') < zapis.indexOf('localStorage.setItem(CISZA_KLUCZ'));
});

test('ustawienia: blok tylko na Androidzie, w trzech językach', () => {
  assert.match(HTML, /<div id="quiet-hours" class="android-only">/);
  for (const id of ['set-quiet-on', 'qh-od', 'qh-do', 'qh-red-wibracja', 'qh-red-syrena', 'qh-note'])
    assert.ok(HTML.includes(`id="${id}"`), id);
  assert.match(I18N, /"Quiet hours": "Години тиші"/);
  assert.match(I18N, /"Siren as in the daytime": "Сирена, як удень"/);
  assert.match(I18N, /button\("qh-note", "W tych godzinach żółty przychodzi bez dźwięku/);
});

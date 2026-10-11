// Przyciski „Poczuj” (11.10.2026, zgłoszenie usera): w aplikacji nic nie wibrowało.
//
// Wibracja ze strony (navigator.vibrate) idzie w Androidzie jako „dotyk” — na
// emulatorze Pixel 7 w trybie cichym nie dała ani jednej wibracji, w normalnym
// dokładnie wzór U. Prawdziwy alarm idzie kanałem powiadomień, więc przycisk
// mógł milczeć, choć alarm zawibruje. Teraz w aplikacji na Androidzie wzór idzie
// natywnie (Alarms.poczuj): żółty jak powiadomienie, czerwony jak alarm, a gdy
// użytkownik wyłączył wibrację kanału — komunikat zamiast fałszywego „działa”.
// Do tego przyciski nie wyglądają już na wybór jednej z dwóch opcji.
//
// Uruchomienie: node scripts/test_poczuj_wibracja.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
const HTML = fs.readFileSync('frontend/index.html', 'utf8');
const CSS = fs.readFileSync('frontend/style.css', 'utf8');
const I18N = fs.readFileSync('frontend/i18n.js', 'utf8');
const J = 'android-app/android/app/src/main/java/pl/straznik/app/';
const ALARMS = fs.readFileSync(J + 'Alarms.java', 'utf8');
const PLUGIN = fs.readFileSync(J + 'BackgroundPlugin.java', 'utf8');

const kod = APP.match(/^const BG = .*$/m)[0] + '\n'
  + APP.slice(APP.indexOf('async function poczuj('), APP.indexOf('\nif (navigator.vibrate || (IS_APP'));
function uruchom({ app = true, ios = false, natywny }) {
  const zdarzenia = { wibracje: [], toasty: [], wywolania: [] };
  const ctx = vm.createContext({
    IS_APP: app, IS_IOS: ios,
    WIBRACJA_U: [150, 150, 150], WIBRACJA_A: [200, 200, 600],
    zawibruj: (w) => zdarzenia.wibracje.push(w),
    toast: (m) => zdarzenia.toasty.push(m),
    UI: { t: (pl) => pl },
    // nazwa wtyczki z prawdziwej definicji BG w app.js — zaślepka z inną nazwą
    // przepuściła błąd (`Plugins.Background` zamiast `StraznikBackground`)
    window: { Capacitor: natywny === undefined ? undefined : { Plugins: { StraznikBackground: {
      poczuj: async (o) => { zdarzenia.wywolania.push(o); return natywny(o); } } } } },
  });
  vm.runInContext(kod + '\nthis.poczuj = poczuj;', ctx);
  return { poczuj: ctx.poczuj, zdarzenia };
}

test('aplikacja na Androidzie: wzór idzie natywnie, bez wibracji ze strony', async () => {
  const { poczuj, zdarzenia } = uruchom({ natywny: () => ({ wynik: 'ok' }) });
  await poczuj('elevated'); await poczuj('high');
  assert.deepEqual(zdarzenia.wywolania.map(o => o.level), ['elevated', 'high']);
  assert.equal(zdarzenia.wibracje.length, 0, 'navigator.vibrate milczy w trybie cichym — nie używamy go');
});

test('wyłączona wibracja kanału: komunikat, a nie udawane „działa”', async () => {
  const { poczuj, zdarzenia } = uruchom({ natywny: () => ({ wynik: 'kanal_bez_wibracji' }) });
  await poczuj('elevated');
  assert.equal(zdarzenia.toasty.length, 1);
  assert.match(zdarzenia.toasty[0], /prawdziwy sygnał też nie zawibruje/);
  assert.equal(zdarzenia.wibracje.length, 0);
});

test('tryb cichy: żółty powiadomienie milczy jak prawdziwe — komunikat zamiast ciszy', async () => {
  const { poczuj, zdarzenia } = uruchom({ natywny: () => ({ wynik: 'tryb_cichy' }) });
  await poczuj('elevated');
  assert.equal(zdarzenia.toasty.length, 1);
  assert.match(zdarzenia.toasty[0], /trybie cichym/);
  assert.equal(zdarzenia.wibracje.length, 0, 'bez zastępczej wibracji ze strony');
  const ciało = ALARMS.slice(ALARMS.indexOf('static String poczuj('), ALARMS.indexOf('/** Kanał czerwonego'));
  assert.match(ciało, /!alarm && am != null && am\.getRingerMode\(\) == AudioManager\.RINGER_MODE_SILENT\) return "tryb_cichy"/,
    'tylko gdy NIE alarm — czerwony w trybie syreny/wibracji wibruje w trybie cichym');
});

test('starsze APK bez metody (Capacitor odrzuca) i strona: wibracja ze strony', async () => {
  const stare = uruchom({ natywny: () => { throw new Error('not implemented'); } });
  await stare.poczuj('high');
  assert.deepEqual(stare.zdarzenia.wibracje, [[200, 200, 600]], 'czerwony = wzór A');
  const strona = uruchom({ app: false });
  await strona.poczuj('elevated');
  assert.deepEqual(strona.zdarzenia.wibracje, [[150, 150, 150]], 'żółty = wzór U');
  const iphone = uruchom({ ios: true, natywny: () => ({ wynik: 'ok' }) });
  await iphone.poczuj('high');
  assert.equal(iphone.zdarzenia.wywolania.length, 0, 'iOS nie woła metody, której nie ma');
});

test('natywnie: żółty jak powiadomienie, czerwony jak alarm (albo powiadomienie w trybie „zwykłe”)', () => {
  const ciało = ALARMS.slice(ALARMS.indexOf('static String poczuj('), ALARMS.indexOf('/** Kanał czerwonego'));
  assert.match(ciało, /boolean alarm = czerwony && !redNormal\(ctx\)/);
  assert.match(ciało, /alarm \? AudioAttributes\.USAGE_ALARM : AudioAttributes\.USAGE_NOTIFICATION/);
  assert.match(ciało, /czerwony \? WZOR_A : WZOR_U/);
  assert.match(ciało, /czerwony \? highChannel\(ctx\) : infoChannel\(ctx\)/, 'kanał wybrany jak dla prawdziwego sygnału');
  assert.match(ciało, /!ch\.shouldVibrate\(\)/);
  assert.match(ciało, /createWaveform\(wzor, -1\)/, 'jeden raz, bez pętli');
  assert.match(PLUGIN, /@PluginMethod\s+public void poczuj\(PluginCall call\)/);
});

test('przyciski nie wyglądają na wybór', () => {
  assert.match(HTML, /id="btn-vib-u" class="chip">▶ Poczuj: żółty/);
  assert.match(HTML, /id="vib-note" hidden>Wzorów wibracji się nie wybiera/);
  assert.match(APP, /getElementById\("vib-note"\)[\s\S]{0,40}hidden = false/);
  assert.match(I18N, /"The vibration patterns are not a choice[^"]*": "Ритм вібрації не обирається/, 'ukraiński');
  assert.match(CSS, /@media \(hover: hover\) \{ \.chip:hover \{ border-color: var\(--accent\); \} \}/,
    'na dotyku obwódka nie zostaje po stuknięciu');
  assert.doesNotMatch(CSS, /^\.chip:hover \{/m);
});

test('komunikat jest widoczny nad otwartym oknem (showModal)', () => {
  // koniec funkcji = pierwsza klamra w kolumnie 0 (CRLF na Windows, LF w repo)
  const kodToast = APP.slice(APP.indexOf('function toast(')).match(/^[\s\S]*?\r?\n\}/)[0];
  const body = { children: [], appendChild(e) { e.parentElement = this; } };
  const dlg = { appendChild(e) { e.parentElement = this; } };
  const el = { parentElement: body, classList: { remove() {}, add() {} }, textContent: '' };
  let otwarte = [dlg];
  const ctx = vm.createContext({ document: { body, getElementById: () => el,
    querySelectorAll: (q) => q === 'dialog[open]' ? otwarte : [] },
    powiedz() {}, a11yInfo: null, toastTimer: null, setTimeout, clearTimeout });
  vm.runInContext(kodToast + '\nthis.toast = toast;', ctx);
  ctx.toast('x');
  assert.equal(el.parentElement, dlg, 'przy otwartym oknie pasek trafia do okna');
  otwarte = [];
  ctx.toast('y');
  assert.equal(el.parentElement, body, 'bez okna wraca do strony');
});

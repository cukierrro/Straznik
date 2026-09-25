// Wydanie dla Google Play nie może aktualizować się samo ani prowadzić do zbiórki.
//
// Regulamin Play zabrania aktualizowania aplikacji z pominięciem sklepu, a samo
// zadeklarowanie REQUEST_INSTALL_PACKAGES wystarcza, żeby paczkę odrzucono.
// Złamanie tego kończy się zdjęciem aplikacji, czyli utratą kanału ostrzegania
// dla ludzi, którzy nie mogą instalować z pliku (telefony służbowe, a od 2027
// także zwykli użytkownicy bez „trybu zaawansowanego").
//
// Dlatego różnica między kanałami NIE jest ręczną edycją przed wysyłką, tylko
// wariantem Gradle. Ten test pilnuje, żeby nikt tego nie obszedł ani nie cofnął:
//   * `frontend/wariant.js` (kanał github) ma zostać przy „github",
//   * wariant `play` ma go przykrywać plikiem ustawiającym „play",
//   * `UPDATE_CHECK` ma wynikać z kanału, a nie być wpisane na sztywno,
//   * każdy odnośnik do zbiórki ma klasę `no-sklep`, a CSS ma ją ukrywać,
//   * manifest wariantu `play` ma usuwać REQUEST_INSTALL_PACKAGES,
//   * build.gradle ma oba kanały.
//
// Uruchomienie: node scripts/test_wariant_sklepowy.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const WARIANT_GITHUB = 'frontend/wariant.js';
const WARIANT_PLAY = 'android-app/android/app/src/play/assets/public/wariant.js';
const MANIFEST_PLAY = 'android-app/android/app/src/play/AndroidManifest.xml';
const INDEX = czytaj('frontend/index.html');
const APP = czytaj('frontend/app.js');

test('kanał domyślny to github — strona i iPhone biorą ten plik bez zmian', () => {
  const s = czytaj(WARIANT_GITHUB);
  assert.match(s, /window\.STRAZNIK_KANAL\s*=\s*"github"/,
    'frontend/wariant.js musi zostać przy „github" — to jest wydanie z GitHuba');
  assert.doesNotMatch(s, /STRAZNIK_KANAL\s*=\s*"play"/, 'kanału play nie ustawia się tutaj');
});

test('wariant play przykrywa go własnym plikiem', () => {
  const s = czytaj(WARIANT_PLAY);
  assert.match(s, /window\.STRAZNIK_KANAL\s*=\s*"play"/);
  assert.match(s, /classList\.add\("sklep-app"\)/,
    'klasa musi być ustawiona przed pierwszym renderem, inaczej odnośnik do zbiórki mrugnie');
});

test('index.html wczytuje wariant przed resztą kodu', () => {
  const w = INDEX.indexOf('wariant.js?v=');
  const a = INDEX.indexOf('app.js?v=');
  assert.notEqual(w, -1, 'brak <script src="wariant.js"> w index.html');
  assert.ok(w < a, 'wariant.js musi być wczytany przed app.js');
  assert.ok(w < INDEX.indexOf('classList.add("ios-app")'),
    'wariant.js ma się wykonać przed pierwszym renderem, czyli przed blokiem ustawiającym klasy');
});

test('sprawdzanie aktualizacji wynika z kanału, nie jest wpisane na sztywno', () => {
  assert.match(APP, /const SKLEP = window\.STRAZNIK_KANAL === "play";/);
  assert.match(APP, /const UPDATE_CHECK = !SKLEP;/,
    'UPDATE_CHECK ma zależeć od kanału — wpisanie `true` wróciłoby z aktualizatorem do Play');
});

test('każdy odnośnik do zbiórki ma klasę no-sklep', () => {
  // liczymy znaczniki <a>, a nie wszystkie wystąpienia adresu (jest też w title=)
  const linki = [...INDEX.matchAll(/<a\b[^>]*buycoffee\.to[^>]*>/g)].map(m => m[0]);
  assert.ok(linki.length >= 4, `spodziewam się co najmniej 4 odnośników, jest ${linki.length}`);
  for (const l of linki)
    assert.match(l, /class="[^"]*\bno-sklep\b/, `odnośnik bez klasy no-sklep: ${l.slice(0, 90)}`);
});

test('CSS ukrywa no-sklep w wersji sklepowej', () => {
  assert.match(czytaj('frontend/style.css'), /\.sklep-app\s+\.no-sklep\s*\{[^}]*display:\s*none/);
});

test('manifest wariantu play usuwa REQUEST_INSTALL_PACKAGES', () => {
  const m = czytaj(MANIFEST_PLAY);
  assert.match(m, /REQUEST_INSTALL_PACKAGES[^>]*tools:node="remove"/,
    'bez tools:node="remove" uprawnienie zostanie w scalonym manifeście');
  assert.match(m, /xmlns:tools=/, 'brak przestrzeni nazw tools — scalanie nie zadziała');
  // a w głównym manifeście ma zostać: wydanie z GitHuba musi umieć się zaktualizować
  assert.match(czytaj('android-app/android/app/src/main/AndroidManifest.xml'),
    /<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES" \/>/);
});

test('build.gradle ma oba kanały', () => {
  const g = czytaj('android-app/android/app/build.gradle');
  assert.ok(g.includes('flavorDimensions "kanal"'), 'brak flavorDimensions w build.gradle');
  const zwarty = g.replace(/\s+/g, '');      // formatowanie bywa różne, treść nie
  for (const k of ['github', 'play'])
    assert.ok(zwarty.includes(k + '{dimension"kanal"}'), `brak kanału ${k} w productFlavors`);
});

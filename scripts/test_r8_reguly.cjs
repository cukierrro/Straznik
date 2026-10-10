// R8 nie może po cichu wyciąć niczego ze ścieżki alarmu.
//
// Od włączenia minifikacji (gałąź r8-proba, 10.10.2026) wydanie przechodzi przez
// R8, który usuwa „nieużywany” kod i zasoby. „Nieużywany” znaczy: nie widać
// wywołania w Javie. Tymczasem nasze klasy uruchamia system po nazwie z manifestu,
// metody wtyczki woła JavaScript przez refleksję Capacitora, a dźwięki kanałów
// powiadomień siedzą w ustawieniach Androida jako numer zasobu. Błąd nie wychodzi
// przy budowie ani przy starcie — dopiero przy prawdziwym alarmie.
//
// Ten test pilnuje, żeby zabezpieczenia nie zniknęły i żeby nowe rzeczy nie
// wypadły spod nich:
//   * reguły keep obejmują cały nasz pakiet, Capacitora i wtyczki,
//   * adnotacje przeżywają razem z wartościami domyślnymi (@PluginMethod),
//   * każda klasa natywna jest w pakiecie pl.straznik.app (inny pakiet = bez ochrony),
//   * każdy plik z res/raw jest wpisany w keep.xml (shrinkResources),
//   * reguły dla testów instrumentacyjnych nie trafiają do zwykłego wydania.
//
// Sama obecność reguł nie dowodzi, że alarm działa — to sprawdza się na
// urządzeniu (emulator, FcmPathReleaseTest). Test łapie regres w konfiguracji.
//
// Uruchomienie: node scripts/test_r8_reguly.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'android-app/android/app');
const czytaj = (p) => fs.readFileSync(path.join(APP, p), 'utf8');
// reguły bez komentarzy i z ujednoliconymi odstępami — formatowanie bywa różne
const reguly = (p) => czytaj(p).split('\n').filter(l => !l.trim().startsWith('#'))
  .join('\n').replace(/\s+/g, ' ');

const GRADLE = czytaj('build.gradle');

// blok buildTypes { release { … } } — liczymy nawiasy, bo w środku są kolejne bloki
function blokRelease(g) {
  const start = g.indexOf('release {', g.indexOf('buildTypes'));
  assert.ok(start >= 0, 'brak bloku buildTypes.release w build.gradle');
  let glebokosc = 0;
  for (let i = g.indexOf('{', start); i < g.length; i++) {
    if (g[i] === '{') glebokosc++;
    if (g[i] === '}' && --glebokosc === 0) return g.slice(start, i + 1);
  }
  throw new Error('niedomknięty blok release');
}
const RELEASE = blokRelease(GRADLE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('wydanie przechodzi przez R8 z naszymi regułami', () => {
  assert.match(RELEASE, /minifyEnabled\s+true/, 'release bez minifyEnabled true');
  assert.match(RELEASE, /shrinkResources\s+true/, 'release bez shrinkResources true');
  assert.match(RELEASE, /proguardFiles[^\n]*'proguard-rules\.pro'/,
    'proguard-rules.pro nie jest podpięty do wydania — R8 działałby bez naszych keep');
});

test('reguły dla testów instrumentacyjnych tylko przy -PsecurityTests', () => {
  const linie = RELEASE.split('\n');
  const i = linie.findIndex(l => l.includes('proguard-instrumentacja.pro'));
  if (i < 0) return;                                   // nie ma — nic nie przecieka
  const przed = linie.slice(Math.max(0, i - 3), i).join('\n');
  assert.match(przed, /project\.hasProperty\('securityTests'\)/,
    'proguard-instrumentacja.pro musi być dołączany wyłącznie przy -PsecurityTests');
  assert.doesNotMatch(linie.find(l => /proguardFiles getDefaultProguardFile/.test(l)) || '',
    /instrumentacja/, 'reguły testowe w głównej liście proguardFiles');
});

test('keep obejmuje nasz pakiet, Capacitora i wtyczki', () => {
  const r = reguly('proguard-rules.pro');
  for (const k of [
    '-keep class pl.straznik.app.** { *; }',
    '-keep class com.getcapacitor.** { *; }',
    '-keep class com.capacitorjs.plugins.** { *; }',
  ]) assert.ok(r.includes(k), `brak reguły: ${k}`);
});

test('adnotacje przeżywają razem z wartościami domyślnymi', () => {
  const r = reguly('proguard-rules.pro');
  const attr = (r.match(/-keepattributes ([^-]+)/g) || []).join(',');
  for (const a of ['RuntimeVisibleAnnotations', 'AnnotationDefault'])
    assert.ok(attr.includes(a), `brak -keepattributes ${a} — @PluginMethod straci returnType`);
});

test('cały kod natywny siedzi w pakiecie objętym keep', () => {
  const korzen = path.join(APP, 'src/main/java');
  const pliki = [];
  (function chodz(d) {
    for (const w of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, w.name);
      if (w.isDirectory()) chodz(p);
      else if (/\.(java|kt)$/.test(w.name)) pliki.push(p);
    }
  })(korzen);
  assert.ok(pliki.length >= 5, `za mało plików natywnych (${pliki.length}) — zła ścieżka?`);
  for (const p of pliki) {
    const pakiet = (fs.readFileSync(p, 'utf8').match(/^\s*package\s+([\w.]+)/m) || [])[1];
    assert.ok(pakiet && (pakiet === 'pl.straznik.app' || pakiet.startsWith('pl.straznik.app.')),
      `${path.relative(ROOT, p)}: pakiet ${pakiet} nie jest objęty -keep pl.straznik.app.**`);
  }
});

test('komponenty z manifestu są w naszym pakiecie albo w bibliotece', () => {
  const m = czytaj('src/main/AndroidManifest.xml');
  const nazwy = [...m.matchAll(/<(activity|service|receiver|provider)[^>]*android:name="([^"]+)"/g)]
    .map(x => x[2]);
  assert.ok(nazwy.length >= 4, 'nie znaleziono komponentów w manifeście');
  for (const n of nazwy)
    assert.ok(n.startsWith('.') || n.startsWith('pl.straznik.app.') || n.startsWith('androidx.'),
      `komponent ${n} spoza pakietu pl.straznik.app — dopisz dla niego regułę keep`);
});

test('każdy plik z res/raw jest chroniony przed shrinkResources', () => {
  const raw = path.join(APP, 'src/main/res/raw');
  const zasoby = fs.readdirSync(raw).filter(f => f !== 'keep.xml').map(f => f.replace(/\.[^.]+$/, ''));
  assert.ok(zasoby.includes('alarm_syrena'), 'brak syreny w res/raw — zła ścieżka?');
  const keep = fs.readFileSync(path.join(raw, 'keep.xml'), 'utf8');
  const chronione = ((keep.match(/tools:keep="([^"]*)"/) || [])[1] || '')
    .split(',').map(s => s.trim().replace('@raw/', ''));
  for (const z of zasoby)
    assert.ok(chronione.includes(z), `res/raw/${z} nie jest w keep.xml — nowy dźwięk może wypaść z wydania`);
  assert.doesNotMatch(keep, /tools:discard=/, 'keep.xml nie powinien niczego wyrzucać');
});

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
//   * reguły dla testów instrumentacyjnych nie trafiają do zwykłego wydania,
//   * skrypt budowy archiwizuje mapping, a skrypt wydania bez niego nie publikuje.
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

test('mapping każdego wydania jest archiwizowany i sprawdzany przed publikacją', () => {
  // bez mapping.txt z tego samego buildu stos błędu z wydania jest nieczytelny
  const buduj = fs.readFileSync(path.join(ROOT, '1_buduj_i_testuj.bat'), 'utf8');
  const wydaj = fs.readFileSync(path.join(ROOT, '4_wydaj.bat'), 'utf8');
  assert.ok(buduj.includes(String.raw`copy /y "%MAPOUT%\githubRelease\mapping.txt" "%MAPDIR%\mapping-githubRelease.txt"`),
    '1_buduj_i_testuj.bat nie kopiuje mapping.txt do archiwum');
  assert.ok(buduj.includes(String.raw`set "MAPDIR=%MAT%\Straznik-play\mapping\%VER%-%CODE%"`),
    'archiwum mapping musi być per wersja i versionCode, poza repozytorium');
  // folder z „ż” w nazwie: cmd.exe go nie zniesie wpisanego wprost (patrz PRZEKAZANIE §5),
  // więc oba skrypty szukają go wzorcem i biorą nazwę 8.3 — i przerywają, gdy go nie ma
  for (const [nazwa, tresc] of [['1_buduj_i_testuj.bat', buduj], ['4_wydaj.bat', wydaj]]) {
    assert.ok(tresc.includes(String.raw`for /d %%D in ("%USERPROFILE%\Desktop\Stra?nik") do if exist "%%D\_materialy\" set "MAT=%%~sD\_materialy"`),
      `${nazwa}: archiwum mapping musi być w Pulpit\\Strażnik\\_materialy, szukanym wzorcem`);
    assert.match(tresc, /if not defined MAT \([\s\S]*?goto :koniec/, `${nazwa}: brak folderu musi przerwać skrypt`);
    assert.doesNotMatch(tresc, /Desktop\\Straznik-play/, `${nazwa}: stara ścieżka Pulpit\\Straznik-play nie istnieje od 18.10.2026`);
  }
  const start = wydaj.indexOf('Plik mapping zarchiwizowany');
  assert.ok(start >= 0, '4_wydaj.bat nie ma kroku sprawdzającego mapping');
  const krok = wydaj.slice(start);
  assert.ok(krok.includes(String.raw`\mapping\githubRelease\mapping.txt" "!MAPDIR!\mapping-githubRelease.txt"`)
    && /^fc \/b /m.test(krok), '4_wydaj.bat nie porównuje archiwum z buildem');
  assert.match(krok.slice(0, krok.indexOf('Podpis APK')), /if errorlevel 1 \([\s\S]*?goto :koniec/,
    '4_wydaj.bat musi przerwać, gdy mapping się nie zgadza');
  assert.ok(wydaj.indexOf('Plik mapping zarchiwizowany') < wydaj.indexOf('Wypchniecie na GitHuba'),
    'sprawdzenie mapping musi być PRZED wypchnięciem i utworzeniem wydania');
});

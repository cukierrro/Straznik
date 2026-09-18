// Wspólny kod dla iPhone'a (18.09.2026): co ma zniknąć na iOS i co ma zostać.
// Zmiany zgłosiła sesja iOS w ios-app/POTRZEBNE_ZMIANY_WSPOLNE.md; tu pilnujemy,
// żeby nie wróciły przy kolejnej edycji frontendu.
// Uruchomienie: node scripts/test_ios_wspolne.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('frontend/index.html');
const css = R('frontend/style.css');
const app = R('frontend/app.js');

const bledy = [];
function sprawdz(warunek, opis) {
  console.log((warunek ? '  OK   ' : '  BŁĄD ') + opis);
  if (!warunek) bledy.push(opis);
}

console.log('1. Rozpoznanie iPhone’a');
sprawdz(/getPlatform\(\)\s*===\s*"ios"[\s\S]{0,80}classList\.add\("ios-app"\)/.test(html),
  'index.html ustawia klasę ios-app przed pierwszym renderem');
sprawdz(/const IS_IOS = IS_APP && window\.Capacitor\?\.getPlatform\?\.\(\) === "ios"/.test(app),
  'app.js zna IS_IOS');
sprawdz(/\.ios-app \.no-ios[^}]*display: none/.test(css) && /\.ios-app \.android-only|\.ios-app \.no-ios, \.ios-app \.android-only/.test(css),
  'style.css ukrywa .no-ios i .android-only na iOS');

console.log('2. Wsparcie autora poza aplikacją na iOS (App Store 3.1.1a)');
const kawy = [...html.matchAll(/<a[^>]*buycoffee[^>]*>/g)].map(m => m[0]);
sprawdz(kawy.length === 4, `wszystkie linki do kawy odnalezione (${kawy.length})`);
sprawdz(kawy.every(a => /class="[^"]*no-ios/.test(a)), 'każdy link do kawy ma klasę no-ios');
sprawdz(!/no-ios[^>]*>\s*Instrukcja użytkownika/.test(html),
  'neutralny link do instrukcji zostaje w aplikacji');

console.log('3. Rzeczy, których iOS nie potrafi');
for (const id of ['fs-check', 'btn-fullscreen', 'btn-battery', 'ns-volume', 'ns-note', 'btn-sound-settings']) {
  const re = new RegExp(`<[^>]*id="${id}"[^>]*>`);
  const tag = (html.match(re) || [''])[0];
  sprawdz(/class="[^"]*android-only/.test(tag), `#${id} ukryty na iOS`);
}
sprawdz(/<label class="set-switch android-only" for="set-force-volume">/.test(html),
  'przełącznik pełnej głośności ukryty na iOS (plugin zgłasza supported: false)');
for (const id of ['btn-native-test', 'btn-native-test-yellow']) {
  const tag = (html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`)) || [''])[0];
  sprawdz(tag && !/android-only/.test(tag), `#${id} zostaje — na iOS działa`);
}

sprawdz(/@supports \(-webkit-touch-callout: none\)[^}]*\{[\s\S]{0,200}input, select, textarea \{ font-size: 16px/.test(css),
  'pola formularzy mają 16 px na iOS — mniejsze pole przybliża cały ekran i nie da się tego cofnąć');
sprawdz(!/maximum-scale|user-scalable=no/.test(html),
  'nie blokujemy powiększania strony — to psuje dostępność');

console.log('4. Wersja, aktualizacje i ostrzeżenia');
sprawdz(/s\.appVersion \|\| s\.iosAppVersion/.test(app), 'wersja iOS brana z iosAppVersion');
sprawdz(/updBtn\.style\.display = UPDATE_CHECK && !IS_IOS/.test(app),
  'przycisk aktualizacji APK ukryty na iOS');
sprawdz(/timeSensitiveAllowed === false/.test(app) && /czasowo zależne/.test(app),
  'ostrzeżenie o powiadomieniach czasowo zależnych (tryb Sen, potwierdzone na urządzeniu)');
sprawdz(/s\.platform === "ios" \? `iOS \$\{esc\(s\.osVersion/.test(app),
  'stopka stanu pokazuje iOS zamiast wersji Androida');
sprawdz(/r\.scheduled === false/.test(app),
  'test natywny nie obiecuje alarmu, gdy powiadomienia są zablokowane');

console.log('5. Instrukcja bez zachęty do zapłaty');
for (const p of ['docs/index.html', 'docs/en.html', 'docs/zmiany.html', 'docs/zmiany-en.html']) {
  sprawdz(!R(p).includes('buycoffee'), `${p} bez linku do kawy`);
}
sprawdz(!R('scripts/build_changelog.py').includes('buycoffee'),
  'generator historii zmian też go nie wstawia');
sprawdz(R('docs/index.html').includes('prywatnosc.html'),
  'instrukcja linkuje politykę prywatności (adres wymagany przez App Store)');

console.log('6. Android bez zmian');
sprawdz(/direct_boot_ok=True/.test(R('backend/app/notify.py')),
  'wiadomość dla Androida nadal data-only z direct_boot_ok');
sprawdz(/apns=_apns_safe\(topic, data\)/.test(R('backend/app/notify.py')),
  'blok apns dołączony do wiadomości FCM przez osłonę, która nie zabierze alarmu Androidowi');
sprawdz(R('1_buduj_i_testuj.bat').includes('pl-outline.js"'),
  'build APK kopiuje kontur Polski');

console.log();
if (bledy.length) {
  console.log('BŁĘDY:', bledy.length);
  bledy.forEach(b => console.log(' -', b));
  process.exit(1);
}
console.log('OK: iOS bez elementów Androida i bez linków do płatności, Android nietknięty.');

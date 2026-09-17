// Przygotowanie builda iOS: kopiuje wspólne pliki do ios-app, nic w nich nie zmieniając.
//   1. frontend/            → ios-app/www            (warstwa webowa, jak android-app/www)
//   2. dźwięki alarmu        → ios-app/ios/App/App     (powiadomienie iOS musi mieć plik w paczce aplikacji)
//   3. sprawdza, czy jest GoogleService-Info.plist (w chmurze wpisuje go workflow z GitHub Secrets)
// Działa tak samo na Windows i na macOS (runner GitHub Actions). Uruchom: npm run www
//
// Lista plików webowych odpowiada 1_buduj_i_testuj.bat, plus pl-outline.js
// i manifest.json, które index.html też wczytuje. Pomijamy pliki tylko dla strony WWW.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const iosApp = resolve(here, "..");
const repo = resolve(iosApp, "..");
const frontend = join(repo, "frontend");
const www = join(iosApp, "www");
const appDir = join(iosApp, "ios", "App", "App");

const WEB_ONLY = new Set(["sw.js", "robots.txt", "sitemap.xml"]);
// Te same pliki co kanały alarmowe Androida (scripts/build_sounds.py). WAV PCM
// działa jako dźwięk powiadomienia iOS, limit Apple to 30 s.
const SOUNDS = ["alarm_syrena.wav", "alert_uwaga.wav"];
const soundsSrc = join(repo, "android-app", "android", "app", "src", "main", "res", "raw");

function fail(msg) {
  console.error("BŁĄD: " + msg);
  process.exit(1);
}

if (!existsSync(join(frontend, "index.html"))) fail(`brak ${join(frontend, "index.html")}`);

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
let n = 0;
for (const name of readdirSync(frontend)) {
  if (WEB_ONLY.has(name)) continue;
  cpSync(join(frontend, name), join(www, name), { recursive: true });
  n++;
}
console.log(`www: skopiowano ${n} pozycji z frontend/`);

for (const sound of SOUNDS) {
  const src = join(soundsSrc, sound);
  if (!existsSync(src)) fail(`brak dźwięku ${src}`);
  copyFileSync(src, join(appDir, sound));
}
console.log(`dźwięki: ${SOUNDS.join(", ")} → ios/App/App`);

if (!existsSync(join(appDir, "GoogleService-Info.plist"))) {
  console.warn("UWAGA: brak ios/App/App/GoogleService-Info.plist — build się nie uda. "
    + "W chmurze wpisuje go workflow z sekretu IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64.");
}

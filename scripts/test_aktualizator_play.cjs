// Aktualizator 1.8.04 — telefon z Google Play odsyła do sklepu (31.10.2026).
// 28.10.2026 samoaktualizacja z pliku dostała od Play Protect czerwone „Zablokowano
// szkodliwą aplikację”, gdy instalatorem był aktualizator Strażnika; ten sam plik
// z Dysku przechodził czysto. Pilnujemy:
//   * telefon z Play i wersja zatwierdzona w Play (`play` z serwera) → przycisk do sklepu,
//   * telefon z Play, wersji jeszcze nie ma w Play → bez okna (chyba że wydanie pilne),
//   * telefon bez Play (Huawei) → dotychczasowa instalacja z pliku,
//   * plik w pamięci aplikacji, nie w cache, i sprawdzenie miejsca przed pobraniem.
// Uruchomienie: node scripts/test_aktualizator_play.cjs
const fs = require("fs"), path = require("path"), vm = require("vm");
const R = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const APP = R("frontend", "app.js");
const JAVA = R("android-app", "android", "app", "src", "main", "java", "pl", "straznik", "app", "BackgroundPlugin.java");
const MANIFEST = R("android-app", "android", "app", "src", "main", "AndroidManifest.xml");
const PATHS = R("android-app", "android", "app", "src", "main", "res", "xml", "file_paths.xml");
let bledy = 0;
const sprawdz = (w, opis) => { console.log((w ? "  OK   " : "  BŁĄD ") + opis); if (!w) bledy++; };

/** Cała funkcja z app.js po nazwie (dopasowanie nawiasów, z pominięciem napisów). */
function funkcja(nazwa) {
  const m = new RegExp(`(?:async\\s+)?function ${nazwa}\\s*\\(`).exec(APP);
  if (!m) throw new Error("brak funkcji " + nazwa);
  let i = APP.indexOf("{", APP.indexOf(")", m.index)), gl = 0, nap = null;
  // parametry z domyślnymi obiektami mają własne klamry — szukamy klamry ciała po „) {”
  const cialo = APP.slice(m.index).search(/\)\s*\{\n/);
  i = m.index + cialo + APP.slice(m.index + cialo).indexOf("{");
  for (let j = i; j < APP.length; j++) {
    const c = APP[j];
    if (nap) { if (c === "\\") { j++; continue; } if (c === nap) nap = null; continue; }
    if (c === '"' || c === "'" || c === "`") { nap = c; continue; }
    if (c === "{") gl++;
    else if (c === "}" && --gl === 0) return APP.slice(m.index, j + 1);
  }
  throw new Error("niedomknięta funkcja " + nazwa);
}

async function scenariusz({ sklep, play, critical = false, force = false, plugin = true }) {
  const banery = [], statusy = [];
  const BGobj = {
    status: async () => ({ appVersion: "1.8.03" }),
    ...(plugin ? { playStore: async () => ({ available: sklep }) } : {}),
  };
  const ctx = {
    UPDATE_CHECK: true, IS_APP: true, UPDATE_API: "x", UPDATE_EVERY_MS: 1, sessionSkippedUpdates: new Set(),
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ version: "1.8.04", play, critical }) }),
    BG: () => BGobj, UI: { t: (pl) => pl }, updStatus: (m) => statusy.push(m),
    showUpdateBanner: (rel, local, opcje) => banery.push(opcje || {}),
    console,
  };
  vm.createContext(ctx);
  vm.runInContext([funkcja("isNewer"), "let _sklepPlay = null;", funkcja("sklepPlay"), funkcja("checkForUpdate")].join("\n"), ctx);
  await vm.runInContext(`checkForUpdate(${force})`, ctx);
  return { banery, statusy };
}

(async () => {
  let r = await scenariusz({ sklep: true, play: true });
  sprawdz(r.banery.length === 1 && r.banery[0].tryb === "play", "Play + wersja w Play → okno z przyciskiem do sklepu");
  r = await scenariusz({ sklep: true, play: false });
  sprawdz(r.banery.length === 0, "Play, wersji jeszcze nie ma w Play → bez okna (czekamy na sklep)");
  r = await scenariusz({ sklep: true, play: false, force: true });
  sprawdz(r.banery.length === 1 && r.banery[0].tryb === "plik" && r.banery[0].sklep === true && /Google Play/.test(r.statusy.join(" ")),
    "sprawdzenie z ustawień, wersji brak w Play → okno z plikiem i ostrzeżeniem, status mówi o sklepie");
  r = await scenariusz({ sklep: true, play: false, critical: true });
  sprawdz(r.banery.length === 1 && r.banery[0].tryb === "plik", "wydanie pilne nie czeka na sklep");
  r = await scenariusz({ sklep: false, play: true });
  sprawdz(r.banery.length === 1 && r.banery[0].tryb === "plik" && !r.banery[0].sklep, "telefon bez Play (Huawei) → instalacja z pliku");
  r = await scenariusz({ sklep: true, play: false, plugin: false });
  sprawdz(r.banery.length === 1 && r.banery[0].tryb === "plik", "stara warstwa natywna bez playStore → jak dotąd, z pliku");

  const baner = funkcja("showUpdateBanner");
  sprawdz(/id="upd-play"/.test(baner) && /openPlayStore\(\)/.test(baner), "okno ma przycisk „Otwórz Google Play”");
  sprawdz(/id="upd-install"/.test(baner.split("upd-z-pliku")[1] || ""), "zapasowa instalacja z pliku pod przyciskiem sklepu");
  sprawdz(/error\?\.code === "NO_SPACE"/.test(baner) && /needMb/.test(baner), "komunikat o braku miejsca z liczbą MB");

  sprawdz(/<queries>\s*<package android:name="com\.android\.vending" \/>\s*<\/queries>/.test(MANIFEST),
    "manifest deklaruje widoczność Sklepu Play (Android 11+)");
  sprawdz(/public void playStore\(PluginCall call\)/.test(JAVA) && /public void openPlayStore\(PluginCall call\)/.test(JAVA),
    "natywne playStore i openPlayStore");
  const inst = JAVA.slice(JAVA.indexOf("public void installUpdate"), JAVA.indexOf("static final String RELEASE_PATH"));
  sprawdz(/new File\(getContext\(\)\.getFilesDir\(\), "aktualizacja"\)/.test(inst) && !/new File\(getContext\(\)\.getCacheDir\(\), "Straznik-update\.apk"\);\s*\n\s*try/.test(inst),
    "APK w pamięci aplikacji (filesDir/aktualizacja), nie w cache");
  sprawdz(/getUsableSpace\(\)/.test(inst) && /"NO_SPACE"/.test(inst) && inst.indexOf("getUsableSpace") < inst.indexOf("FileOutputStream out"),
    "miejsce sprawdzane przed zapisem pliku");
  sprawdz(/<files-path name="aktualizacja" path="aktualizacja\/" \/>/.test(PATHS), "FileProvider udostępnia katalog aktualizacji instalatorowi");
  // Opis mówi o pliku APK i przejściu do Google Play — nie dotyczy iPhone'a ani wersji ze sklepu
  // (do 1.8.04 wisiał tam z tekstem „Aplikacja nie pochodzi ze sklepu”).
  const opis = (R("frontend/index.html").match(/<details[^>]*>\s*<summary id="jak-aktualizacje"/) || [""])[0];
  sprawdz(/\bno-ios\b/.test(opis) && /\bno-sklep\b/.test(opis), "„Skąd biorą się aktualizacje” ukryte na iOS i w wersji z Google Play");
  // Przycisk znika tam w app.js; jego rząd i linia statusu zostawały pustym pudełkiem.
  const html = R("frontend/index.html");
  const rzad = (html.match(/<div class="[^"]*"[^>]*>\s*<button[^>]*id="btn-update"/) || [""])[0];
  const status = (html.match(/<p class="[^"]*" id="upd-status">/) || [""])[0];
  sprawdz([rzad, status].every(t => /\bno-ios\b/.test(t) && /\bno-sklep\b/.test(t)),
    "rząd przycisku aktualizacji i status ukryte tam, gdzie przycisku nie ma");

  if (bledy) { console.log(`\nBŁĘDY: ${bledy}`); process.exit(1); }
  console.log("\nOK — aktualizator 1.8.04");
})().catch(e => { console.error(e); process.exit(1); });

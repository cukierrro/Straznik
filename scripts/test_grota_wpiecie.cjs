// Wpięcie GROTY w Strażnika — czy trzyma się decyzji usera (21.09.2026).
//
// Pilnujemy rzeczy, które łatwo „poprawić" przy okazji i które user rozstrzygnął wprost:
//   1. alarm NIGDY sam nie otwiera Groty — po potwierdzeniu człowiek wybiera,
//   2. przycisk Groty ma tę samą tarczę (shield-alert) co zakładka TERAZ w Grocie,
//   3. Groty nie ma na stronie WWW — ani przycisku, ani plików w frontend/,
//   4. moduł wczytuje się dopiero przy pierwszym wejściu, przez uzgodniony `window.Grota`.
//
// Uruchomienie: node scripts/test_grota_wpiecie.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "frontend/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "frontend/style.css"), "utf8");

let bledy = 0;
function sprawdz(warunek, opis) {
  console.log((warunek ? "  OK   " : "  BŁĄD ") + opis);
  if (!warunek) bledy++;
}
const element = (id) => (html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`)) || [""])[0];
const TARCZA = "M20 13c0 5-3.5 7.5-7.66 8.95";   // ścieżka shield-alert z ikony Groty

console.log("1. Alarm nie przejmuje ekranu");
const pokazAlarm = js.slice(js.indexOf("airRaidSiren(true);") - 400, js.indexOf("airRaidSiren(true);") + 60);
sprawdz(!/otworzGrote\(/.test(pokazAlarm), "pokazanie alarmu nie otwiera Groty");
const wywolania = [...js.matchAll(/(?<!function )otworzGrote\(/g)].length;   // bez samej definicji
const wKliknieciach = [...js.matchAll(/addEventListener\("click",\s*\(\) => otworzGrote\(\)\)|zamknijAlarm\(\);\s*\n\s*otworzGrote\(\{ zakladka: "teraz" \}\);/g)].length;
sprawdz(wywolania === 2 && wKliknieciach === 2,
  "Grota otwiera się tylko z kliknięcia człowieka (przycisk w alarmie lub w „Więcej”)");
sprawdz(/airRaidSiren\(true\);[^\n]*\n\s*przygotujGrote\(\);/.test(js) &&
        /function przygotujGrote\(\) \{\s*\n\s*if \(!document\.documentElement\.classList\.contains\("native-app"\)\) return;/.test(js),
  "przy alarmie Grota tylko wczytuje się w tle (i tylko w aplikacji)");
sprawdz(/alarmAck\.hidden = true;\s*\n\s*alarmWybor\.hidden = false;/.test(js),
  "potwierdzenie alarmu pokazuje wybór zamiast zamykać ekran");
for (const id of ["alarm-grota", "alarm-map", "alarm-safe"]) {
  sprawdz(element(id) !== "", `jest przycisk ${id}`);
}
sprawdz(/function alarmWyborReset[\s\S]{0,120}alarmAck\.hidden = false/.test(js) &&
        /alarmWyborReset\(\);\s*\n\s*alarmOverlay\.classList\.remove\("hidden"\)/.test(js),
  "każdy nowy alarm zaczyna od przycisku potwierdzenia, nie od wyboru z poprzedniego");

console.log("2. Ta sama tarcza co zakładka TERAZ w Grocie");
const btnGrota = html.slice(html.indexOf('id="btn-grota"'), html.indexOf('id="btn-grota"') + 700);
const alarmGrota = html.slice(html.indexOf('id="alarm-grota"'), html.indexOf('id="alarm-grota"') + 700);
sprawdz(btnGrota.includes(TARCZA), "wpis w „Więcej” ma ikonę shield-alert");
sprawdz(alarmGrota.includes(TARCZA), "przycisk w alarmie ma ikonę shield-alert");

console.log("3. Groty nie ma na stronie WWW");
sprawdz(/class="[^"]*\bapp-only\b/.test(element("btn-grota")), "wpis w „Więcej” tylko w aplikacji");
sprawdz(/class="[^"]*\bapp-only\b/.test(element("alarm-grota")), "przycisk w alarmie tylko w aplikacji");
sprawdz(/class="[^"]*\bapp-only\b/.test(element("grota-widok")), "pojemnik widoku tylko w aplikacji");
sprawdz(/\.web-app \.app-only\s*\{\s*display:\s*none/.test(css), "strona ukrywa .app-only");
sprawdz(/classList\.add\(\s*\n?\s*location\.protocol === "capacitor:"[\s\S]{0,160}"native-app" : "web-app"/.test(html),
  "klasa strony nadawana przed pierwszym renderem");
sprawdz(!fs.existsSync(path.join(root, "frontend/grota")),
  "brak frontend/grota/ — strona straznik.eu podaje frontend/, więc 11 MB punktów nie może tam leżeć");

console.log("4. Ładowanie na żądanie przez window.Grota");
sprawdz(!/GrotaWidok/.test(js), "żadnych odwołań do starej nazwy GrotaWidok");
sprawdz(/s\.src = "grota\/widok\.js"/.test(js), "jeden punkt wejścia: grota/widok.js");
sprawdz(!/<script[^>]+grota\//.test(html), "index.html nie wczytuje Groty przy starcie");
sprawdz(/grotaLadowanie = null; throw e;/.test(js), "nieudane wczytanie można ponowić");
sprawdz(/toast\(UI\.isEn \? "Shelter finder is not available/.test(js),
  "brak modułu = komunikat, a nie pusty ekran");

console.log("5. Systemowe „wstecz” (uzgodnione 21.09.2026)");
const wstecz = js.slice(js.indexOf("window.straznikBack = function"), js.indexOf("window.straznikBack = function") + 1600);
const poz = (s) => wstecz.indexOf(s);
sprawdz(poz("alarm-overlay") >= 0 && poz("dialog[open]") > poz("alarm-overlay") &&
        poz("window.Grota?.widoczny") > poz("dialog[open]") && poz("ac-card") > poz("window.Grota?.widoczny"),
  "kolejność: alarm → okna Strażnika → Grota → karta/historia/panel");
sprawdz(/if \(!window\.Grota\.wstecz\?\.\(\)\) ukryjGrote\(\);\s*\n\s*return true;/.test(wstecz),
  "Grota najpierw cofa sama, przy false wracamy do Strażnika; starszy moduł bez wstecz() też się zamyka");

console.log();
if (bledy) { console.log("BŁĘDY:", bledy); process.exit(1); }
console.log("OK: Grota tylko z kliknięcia, ta sama tarcza, tylko w aplikacji, ładowana na żądanie.");

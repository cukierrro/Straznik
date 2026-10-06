/* Uśpienie aplikacji przez nakładkę producenta i dowód dostarczenia pusha.

   Powstał 06.10.2026 po dwóch zgłoszeniach tego samego dnia (Galaxy S24 Ultra
   i S25+): „wszystkie uprawnienia włączone, transmisja danych OK, a alarm rusza
   dopiero po wejściu do aplikacji".

   Warstwa natywna zgłaszała `batteryUnrestricted` od zawsze — to aplikacja
   NIGDY tego pola nie czytała. refreshBgWarning ostrzegało wyłącznie o braku
   zgody na powiadomienia i o wygasłej zgodzie na pełny ekran, więc człowiek
   z uśpioną aplikacją widział dokładnie to samo co człowiek, u którego wszystko
   działa. Co gorsza, nasz własny tekst twierdził, że ta zgoda „nie jest wymagana,
   bo push i tak dociera".

   Test pilnuje trzech rzeczy, które to naprawiły, i jednej, która nie ma prawa
   wrócić: tamtego zdania. */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const i18n = czytaj("frontend/i18n.js");
const html = czytaj("frontend/index.html");
const fcm = czytaj("android-app/android/app/src/main/java/pl/straznik/app/StraznikFcmService.java");
const plug = czytaj("android-app/android/app/src/main/java/pl/straznik/app/BackgroundPlugin.java");

console.log("1. Aplikacja CZYTA batteryUnrestricted i ostrzega");
sprawdz(/const usypiaAplikacje = /.test(app), "jest jedno wejscie: usypiaAplikacje()");
// Warunek musi mieć OBA człony. Samo `batteryUnrestricted === false` ostrzegałoby
// każdego na czystym Androidzie (tam optymalizacja jest domyślnie włączona dla
// wszystkich, a push o wysokim priorytecie i tak przechodzi przez Doze).
sprawdz(/usypiaAplikacje = \(s\) =>\s*\n?\s*s\?\.batteryUnrestricted === false &&/.test(app),
  "warunek wymaga batteryUnrestricted === false");
sprawdz(/NAKLADKI_USYPIAJACE\s*=\s*\n?\s*\/[^/]*samsung/i.test(app),
  "lista nakladek zawiera samsunga — od niego wyszly oba zgloszenia");
for (const m of ["xiaomi", "huawei", "oppo", "vivo", "realme", "honor"])
  sprawdz(new RegExp("NAKLADKI_USYPIAJACE[\\s\\S]{0,200}" + m, "i").test(app), `lista zawiera ${m}`);

sprawdz(/fix = "battery"/.test(app), "refreshBgWarning ma galaz baterii");
sprawdz(/fix === "battery" \? "battery"/.test(app), "baner baterii ma wlasny klucz ukrycia");
// Klucze "fullscreen" i "notifications" zapisali sobie ludzie, ktorzy raz zamkneli
// baner. Zmiana nazwy odslonilaby go im wszystkim naraz.
sprawdz(/\? "fullscreen" : fix === "battery" \? "battery" : "notifications"/.test(app),
  "dotychczasowe klucze ukrycia nietkniete");
sprawdz(/fix === "battery"\s*\n?\s*\? \(\) => \{ BG\(\)\?\.requestBatteryExemption\(\)/.test(app),
  "przycisk Napraw wola requestBatteryExemption");
sprawdz(/if \(usypiaAplikacje\(s\)\)\s*\n\s*warn\.push/.test(app),
  "diagnostyka w ustawieniach tez o tym mowi");
sprawdz(/batBtn\.textContent = s\.batteryUnrestricted/.test(app),
  "przycisk baterii pokazuje stan, a nie samo wezwanie");

console.log("2. Tekst nie twierdzi juz, ze zgoda jest zbedna");
// To zdanie stalo w aplikacji do 1.7.90 i bylo wprost sprzeczne ze zgloszeniami.
for (const [nazwa, t] of [["frontend/index.html", html], ["frontend/i18n.js", i18n]])
  sprawdz(!/oszczędzania baterii nie jest wymagana/.test(t),
    `${nazwa}: brak zdania o zbednej zgodzie na baterie`);
sprawdz(/id="alarmy-bateria-note"/.test(html), "index.html ma akapit o baterii");

// Kontrakt i18n od 1.7.89: KAZDY napis musi byc w OBU sciezkach, inaczej zostaje
// po polsku w wersji angielskiej (i po angielsku w ukrainskiej).
const en = i18n.match(/button\("alarmy-bateria-note",\s*\n\s*"[^"]+",\s*\n\s*"([^"]+)"/);
sprawdz(!!en, "i18n: button(\"alarmy-bateria-note\", pl, en)");
sprawdz(i18n.includes('set("#alarmy-bateria-note"'), "i18n: set(\"#alarmy-bateria-note\", en)");
if (en) {
  sprawdz(i18n.includes('set("#alarmy-bateria-note", "' + en[1] + '"'),
    "i18n: tekst w set() jest DOKLADNIE tym z button()");
  sprawdz(i18n.includes('"' + en[1] + '":'), "i18n: EN2UK ma klucz dla tego zdania");
}

console.log("3. Dowod dostarczenia: godzina ostatniego pusha");
const zapis = fcm.indexOf('putLong("last_push_at"');
const odrzut = fcm.indexOf("KEY_ALERTS_OFF");
sprawdz(zapis > 0, "StraznikFcmService zapisuje last_push_at");
// Gdyby zapis stal ZA ktorymkolwiek `return`, telefon z wylaczonymi alarmami albo
// nieznanym wojewodztwem wygladalby identycznie jak telefon, do ktorego nic nie
// dociera — czyli dokladnie w tym przypadku, dla ktorego to powstalo.
sprawdz(zapis > 0 && odrzut > 0 && zapis < odrzut,
  "zapis jest PRZED jakimkolwiek odrzuceniem wiadomosci");
sprawdz(zapis > 0 && zapis < fcm.indexOf("if (data.isEmpty()) return;"),
  "zapis jest przed odrzuceniem pustej wiadomosci");
sprawdz(/ret\.put\("lastPushAt", fcm\.getLong\("last_push_at", 0\)\)/.test(plug),
  "status() wystawia lastPushAt");
sprawdz(/s\.lastPushAt/.test(app), "aplikacja pokazuje te godzine w ustawieniach");
// Zero znaczy „nic nie przyszlo" i tez jest informacja; undefined (iPhone, strona)
// znaczy „nie wiemy" i wtedy nie piszemy nic.
sprawdz(/s\.lastPushAt === 0/.test(app),
  "brak pusha odrozniony od braku pomiaru (iPhone, strona)");

console.log("\nBLEDY: " + bledy);
process.exit(bledy ? 1 : 0);

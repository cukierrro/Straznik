// Ekran czerwonego alarmu ma być NA WIERZCHU i mówić w języku użytkownika.
//
// Przegląd UI z 14.10.2026 znalazł trzy rzeczy naraz:
// 1. Alarm przy otwartym oknie (Ustawienia, Moje miejsca…) lądował POD oknem:
//    showModal() kładzie okno w warstwie nad całą stroną, a ekran alarmu to
//    zwykły <div>. Syrena grała, „POTWIERDZAM” było nie do dotknięcia.
// 2. Otwarta karta obiektu (z-index 1200) zasłaniała ekran alarmu (z-index 90).
// 3. Po ukraińsku przycisk „Jestem bezpieczny” mówił „I am safe” — w wywołaniu
//    UI.t zabrakło trzeciego argumentu.
// Do tego po „POTWIERDZAM” fokus spadał na <body>.
//
// Uruchomienie: node scripts/test_alarm_na_wierzchu.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "frontend/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
const i18n = fs.readFileSync(path.join(root, "frontend/i18n.js"), "utf8");

let bledy = 0;
function sprawdz(warunek, opis) {
  console.log(`${warunek ? "OK  " : "BŁĄD"} ${opis}`);
  if (!warunek) bledy++;
}
// Ciało funkcji od nagłówka do pierwszego „\n}” na początku linii.
function cialo(nazwa) {
  const i = js.indexOf(`function ${nazwa}(`);
  if (i < 0) return "";
  const k = js.indexOf("\n}", i);
  return js.slice(i, k < 0 ? undefined : k + 2);
}

console.log("1. Alarm zdejmuje to, co mogłoby go zasłonić");
const zaslona = cialo("zdejmijZasloneAlarmu");
sprawdz(/dialog\[open\]/.test(zaslona) && /\.close\(\)/.test(zaslona), "zamyka otwarte okna <dialog>");
sprawdz(/hideCard\(\)/.test(zaslona), "chowa kartę obiektu");
const pokaz = cialo("showAlarm");
const iZaslona = pokaz.indexOf("zdejmijZasloneAlarmu()");
const iPokaz = pokaz.indexOf('alarmOverlay.classList.remove("hidden")');
sprawdz(iZaslona > 0 && iPokaz > 0 && iZaslona < iPokaz, "showAlarm robi to PRZED pokazaniem ekranu");

console.log("2. Żadne okno nie wchodzi nad trwający alarm");
sprawdz(/HTMLDialogElement\.prototype\.showModal\s*=\s*function/.test(js), "showModal jest owinięte");
// W app.js są DWA owinięcia showModal (pierwsze zeruje przewinięcie okna);
// szukamy tego, które pilnuje alarmu.
const iStraz = js.indexOf("const pokazOknoModalnie = HTMLDialogElement.prototype.showModal;");
const straz = iStraz < 0 ? "" : js.slice(iStraz, iStraz + 300);
sprawdz(/alarmOverlay\.classList\.contains\("hidden"\)\)\s*return;/.test(straz),
  "przy widocznym alarmie okno się nie otwiera");
// Owinięcie musi stać przed jakimkolwiek automatycznym otwieraniem okien przy starcie
// (powitanie, prośba o województwo) — te ruszają z setTimeout na końcu pliku.
sprawdz(iStraz > 0 && iStraz < js.indexOf("function runOnboarding"),
  "owinięcie jest wcześniej niż ciąg okien powitania");

console.log("3. Teksty alarmu w trzech językach");
const reset = cialo("alarmWyborReset");
const wywolania = [...reset.matchAll(/\bt\("alarm-[a-z]+",([^\n]*)\);/g)];
sprawdz(wywolania.length === 3, "trzy przyciski wyboru dostają tekst przy każdym alarmie");
for (const w of wywolania) {
  const arg = w[1].match(/"(?:[^"\\]|\\.)*"/g) || [];
  sprawdz(arg.length === 3, `${w[0].slice(0, 22)}… ma tekst PL, EN i UK`);
}
sprawdz(!/I am safe|Jestem bezpieczny/.test(js + html + i18n), "nie ma już „Jestem bezpieczny” / „I am safe”");
sprawdz(!/wycisz syrenę/.test(html + i18n), "przycisk mówi „wycisz alarm” — przy wibracji i w godzinach ciszy syreny nie ma");
const kluczAck = html.match(/id="alarm-ack"[^>]*>([^<]+)</);
sprawdz(!!kluczAck && i18n.split(`"${kluczAck[1]}"`).length - 1 >= 2,
  "napis przycisku potwierdzenia ma wpis w słowniku EN i UK");

console.log("4. Fokus po potwierdzeniu");
const ack = js.slice(js.indexOf("alarmAck.onclick"), js.indexOf("alarmAck.onclick") + 600);
sprawdz(/alarmWybor\.hidden = false;[\s\S]{0,300}\.focus\(\)/.test(ack),
  "po „POTWIERDZAM” fokus przechodzi na pierwszy widoczny wybór");
// 15.10.2026, decyzja usera: „miejsce schronienia”, nie „schron” (wykaz PSP to miejsca schronienia)
sprawdz(!/przejdź do schronu/.test(js + html) && /przejdź do miejsca schronienia/.test(js) && /przejdź do miejsca schronienia/.test(html),
  "ekran alarmu mówi „miejsce schronienia”, nie „schron”");
sprawdz(!/go to a shelter or/.test(js + i18n) && /go to a place of shelter/.test(i18n),
  "EN: „a place of shelter” w app.js i i18n.js");

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko w porządku");
process.exit(bledy ? 1 : 0);

// Ustawienia v4 (przegląd UI 14.10.2026): arkusz o stałej wysokości z ekranem
// startowym i sekcjami.
//
// Dlaczego: okno wyśrodkowane w pionie zmieniało wysokość z każdą zakładką.
// Następna zakładka uciekała spod palca, dotknięcie trafiało w przyciemnione tło
// i okno się zamykało — dwa razy z rzędu przy przeglądzie. Do tego wspólne
// „Zapisz/Anuluj” sugerowało, że zmiany czekają na zapis, a prawie wszystko
// działało od razu i „Anuluj” niczego nie cofało.
//
// Pilnujemy:
// - okno ma stałą wysokość (nic nie skacze między ekranem startowym a sekcją),
// - wiersze sekcji to .set-tab z data-pane (inne miejsca w kodzie otwierają sekcję
//   kliknięciem w nie — zmiana nazwy klasy po cichu by je zepsuła),
// - z sekcji „wstecz”/Esc wraca do ekranu startowego, a nie zamyka okna,
// - nie ma wspólnego „Zapisz/Anuluj”; język i serwer mają własne przyciski,
// - każdy napis ekranu startowego jest tłumaczony w OBU ścieżkach językowych.
//
// Uruchomienie: node scripts/test_ustawienia_v4.cjs
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "frontend/app.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "frontend/i18n.js"), "utf8");
const css = fs.readFileSync(path.join(root, "frontend/style.css"), "utf8");

let bledy = 0;
function sprawdz(warunek, opis) {
  console.log(`${warunek ? "OK  " : "BŁĄD"} ${opis}`);
  if (!warunek) bledy++;
}
const okno = html.slice(html.indexOf('<dialog id="settings"'), html.indexOf("</dialog>", html.indexOf('<dialog id="settings"')));

console.log("1. Stała wysokość, ekran startowy i sekcje");
sprawdz(/dialog\.ustawienia \{[^}]*height:\s*var\(--dlg-max\)/.test(css), "okno ustawień ma stałą wysokość");
sprawdz(/<dialog id="settings" class="[^"]*\bna-starcie\b/.test(html), "okno startuje od ekranu startowego");
for (const pane of ["alarmy", "miejsca", "dzwiek", "mapa", "aplikacja"]) {
  sprawdz(new RegExp(`class="set-tab[^"]*" data-pane="${pane}"`).test(okno), `wiersz sekcji „${pane}” to .set-tab z data-pane`);
  sprawdz(new RegExp(`<section class="set-pane" data-pane="${pane}"[^>]*hidden`).test(okno), `sekcja „${pane}” schowana na starcie`);
}
sprawdz(/function pokazStartUstawien\(/.test(js) && /openSettings\(\)[\s\S]{0,900}pokazStartUstawien\(\);\s*\r?\n\s*dlg\.showModal\(\)/.test(js),
  "otwarcie okna zawsze zaczyna od ekranu startowego");

console.log("2. Wstecz i Esc");
const cancel = js.slice(js.indexOf('dlg.addEventListener("cancel"'), js.indexOf('dlg.addEventListener("cancel"') + 300);
sprawdz(/w-sekcji/.test(cancel) && /preventDefault\(\)/.test(cancel), "z sekcji „cancel” (Esc, systemowe wstecz) wraca, zamiast zamykać");
sprawdz(/id="set-wstecz"/.test(okno), "jest przycisk „‹ Ustawienia”");

console.log("3. Bez wspólnego Zapisz/Anuluj");
sprawdz(!/id="set-save"/.test(html) && !/value="cancel"/.test(okno), "nie ma „Zapisz” ani „Anuluj” w stopce");
sprawdz(/id="set-lang-zastosuj"/.test(okno) && /id="set-api-zapisz"/.test(okno), "język i adres serwera mają własne przyciski");
sprawdz(/dlg\.addEventListener\("close"/.test(js), "po zamknięciu mapa i panel widzą zmiany (dawna praca „Zapisz”)");

console.log("4. Tłumaczenia ekranu startowego w obu ścieżkach");
const podglad = i18n.slice(i18n.indexOf("// v4 (14.10.2026): ekran startowy ustawień"), i18n.indexOf("// v4 (14.10.2026): ekran startowy ustawień") + 1500);
const globalnie = i18n.slice(i18n.indexOf("// v4: wiersze sekcji ustawień po identyfikatorach"), i18n.indexOf("// v4: wiersze sekcji ustawień po identyfikatorach") + 900);
for (const id of ["set-tytul", "set-x-t", "st-alarmy", "st-miejsca", "st-dzwiek", "st-dzwiek-cisza", "st-mapa", "st-aplikacja", "set-wstecz-t", "set-lang-zastosuj", "set-api-zapisz"]) {
  sprawdz(okno.includes(`id="${id}"`), `#${id} jest w oknie`);
  sprawdz(podglad.includes(`"${id}"`), `#${id} tłumaczony w podglądzie języka w oknie`);
  sprawdz(globalnie.includes(`#${id}"`), `#${id} tłumaczony przy przełączeniu całej aplikacji`);
}
sprawdz(!/many\(":scope \.set-tab"/.test(i18n) && !/setMany\("#settings \.set-tab"/.test(i18n),
  "wiersze sekcji nie są tłumaczone po kolejności");
// 15.10.2026: wiersz z przyciskiem głównym („Otwórz Moje miejsca”) dostawał tło zwykłego
// wiersza przy ciemnym tekście przycisku głównego — wyglądał na wyłączony.
sprawdz(/\.set-rows > \.chip\.primary \{[^}]*background: var\(--przycisk-glowny\)/.test(css),
  "wiersz z przyciskiem głównym ma tło przycisku głównego (czytelny tekst)");

console.log("7. Godziny ciszy tylko tam, gdzie są (Android)");
// 1.7.96: na iPhonie wiersz mówił „Dźwięk i godziny ciszy”, a #quiet-hours jest android-only
// (zgłoszenie testera z TestFlight). Dopisek o ciszy ma tę samą klasę co sama funkcja.
sprawdz(/id="quiet-hours" class="android-only"/.test(html), "#quiet-hours jest tylko na Androidzie");
sprawdz(/<span id="st-dzwiek">Dźwięk<\/span>/.test(html), "wiersz sekcji: samo „Dźwięk”");
sprawdz(/<span id="st-dzwiek-cisza" class="android-only">i godziny ciszy<\/span>/.test(html),
  "„i godziny ciszy” w wierszu tylko na Androidzie");
sprawdz(!/tx\("st-dzwiek", "[^"]*cisz/.test(i18n) && !/set\("#st-dzwiek", "[^"]*quiet/.test(i18n),
  "tłumaczenie #st-dzwiek nie dokleja godzin ciszy (PL/EN)");
{
  // Każda wzmianka o godzinach ciszy w widocznym tekście aplikacji siedzi w elemencie android-only
  // albo wewnątrz #quiet-hours. Sprawdzamy index.html i napisy innerHTML w i18n.js.
  const bezCiszy = (txt) => txt
    .replace(/<div id="quiet-hours" class="android-only">[\s\S]*?<\/details>\s*<\/div>/g, "")
    .replace(/<([a-z]+)[^>]*class=["'][^"']*android-only[^"']*["'][^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const wolne = [...bezCiszy(html).matchAll(/[^<>]{0,40}godzin(y|ach) ciszy[^<>]{0,20}/gi)].map(m => m[0].trim());
  sprawdz(wolne.length === 0, `w index.html o godzinach ciszy tylko w android-only (poza: ${wolne.join(" | ") || "brak"})`);
  const gdzie5 = [...i18n.matchAll(/getElementById\("ab-gdzie-5"\); if \(el\) el\.innerHTML = "([^"]*)"/g)].map(m => m[1]);
  sprawdz(gdzie5.length === 2 && gdzie5.every(t => /android-only'>, (quiet hours|години тиші)<\/span>/.test(t)),
    "„O aplikacji” EN/UK: godziny ciszy w android-only");
}

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko w porządku");
process.exit(bledy ? 1 : 0);

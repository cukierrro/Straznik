/* Linki z zewnętrznych źródeł nie prowadzą do naszego własnego originu.

   Powstał 10.10.2026 po alarmie OSV: GHSA-rvm3-566m-v7fv. Capacitor do 8.4.2
   po kliknięciu w `http://localhost/_capacitor_http_interceptor_?u=<obcy adres>`
   ładował cudzą stronę w originie aplikacji — z dostępem do localStorage
   i naszych wtyczek natywnych. Nasz origin w aplikacji to `http://localhost`,
   a `safeUrl` przepuszczał każdy `http:`, więc wystarczył przejęty kanał RSS.

   Test pilnuje trzech rzeczy:
   1. `safeUrl` (WYKONANY, nie wyszukany w tekście) odrzuca własny origin,
   2. każde miejsce, które wstawia link z danych zewnętrznych, idzie przez `safeUrl`,
   3. Capacitor w locku ma poprawkę (>= 8.4.3). */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");

const m = app.match(/const safeUrl = \(u\) => \{[\s\S]*?\n\};\n/);
sprawdz(!!m, "w app.js jest safeUrl");
if (!m) { console.log("BLEDY: " + bledy); process.exit(1); }

const zbuduj = (kod, origin) => new Function("location", kod + "\nreturn safeUrl;")(
  { href: origin + "/index.html", origin });

console.log("1. Aplikacja (origin http://localhost)");
const app_ = zbuduj(m[0], "http://localhost");
sprawdz(app_("http://localhost/_capacitor_http_interceptor_?u=https%3A%2F%2Fzly.example%2Fx") === "",
  "odrzuca ścieżkę proxy Capacitora");
sprawdz(app_("/_capacitor_http_interceptor_?u=https://zly.example/x") === "", "odrzuca ścieżkę względną (rozwija się do własnego originu)");
sprawdz(app_("HTTP://LOCALHOST/cokolwiek") === "", "odrzuca własny origin niezależnie od wielkości liter");
sprawdz(app_("http://localhost:80/x") === "", "odrzuca własny origin z jawnym portem 80");
sprawdz(app_("javascript:alert(1)") === "", "nadal odrzuca javascript:");
sprawdz(app_("data:text/html,<b>x</b>") === "", "nadal odrzuca data:");
sprawdz(app_("https://www.rmf24.pl/artykul") === "https://www.rmf24.pl/artykul", "przepuszcza zwykły link https");
sprawdz(app_("http://example.org/a") === "http://example.org/a", "przepuszcza obcy http");
sprawdz(app_("http://localhost.zly.example/") === "http://localhost.zly.example/", "obca domena zaczynająca się od localhost to nie nasz origin");
sprawdz(app_("") === "" && app_(undefined) === "", "pusty adres → pusto, bez wyjątku");

console.log("2. Strona (origin https://straznik.eu)");
const www = zbuduj(m[0], "https://straznik.eu");
sprawdz(www("https://straznik.eu/api/state") === "", "odrzuca własny origin strony");
sprawdz(www("https://www.rmf24.pl/x") === "https://www.rmf24.pl/x", "przepuszcza zewnętrzny link");

console.log("3. Każdy link z danych zewnętrznych idzie przez safeUrl");
sprawdz(/const link = safeUrl\(e\.sig\.details\?\.link\)/.test(app), "cytat z mediów (karta zdarzenia)");
sprawdz(/const link = safeUrl\(s\.details\?\.article\?\.url/.test(app), "artykuł w karcie sygnału");
sprawdz(/const bezp = safeUrl\(url\); if \(!bezp\) continue;[\s\S]{0,200}a\.href = bezp/.test(app),
  "źródło i licencja zdjęcia samolotu");
sprawdz(!/a\.href = url;/.test(app), "nie wróciło surowe a.href = url");

console.log("4. Capacitor z poprawką GHSA-rvm3-566m-v7fv");
const lock = JSON.parse(czytaj("android-app/package-lock.json")).packages;
const wersja = (p) => (lock["node_modules/" + p]?.version || "0.0.0").split(".").map(Number);
const conajmniej = (v, w) => v[0] !== w[0] ? v[0] > w[0] : v[1] !== w[1] ? v[1] > w[1] : v[2] >= w[2];
for (const p of ["@capacitor/android", "@capacitor/core"]) {
  const v = wersja(p);
  // 8.5.0 też jest dziurawe (poprawka 8.5.1) — dopuszczamy 8.4.3+ w linii 8.4 i 8.5.1+.
  const ok = (v[0] === 8 && v[1] === 4 && v[2] >= 3) || (v[0] === 8 && v[1] === 5 && v[2] >= 1) || conajmniej(v, [8, 6, 0]);
  sprawdz(ok, `${p} ${v.join(".")} ma poprawkę`);
}

console.log("5. Kontrola dodatnia: dawny safeUrl przepuszczał ścieżkę proxy");
const dawny = `const safeUrl = (u) => {
  const raw = String(u ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, location.href);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.href : "";
  } catch { return ""; }
};
`;
sprawdz(zbuduj(dawny, "http://localhost")("http://localhost/_capacitor_http_interceptor_?u=x") !== "",
  "stary filtr nie łapał ataku — test naprawdę coś sprawdza");

console.log("BLEDY: " + bledy);
process.exit(bledy ? 1 : 0);

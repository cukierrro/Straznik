/* Zrzuty do App Store z PRAWDZIWEJ paczki aplikacji (ios-app/www).
   Nie rysujemy makiet: strona jest tą samą warstwą webową, która leci do IPA,
   renderowaną w Chromium w wymiarach iPhone'a 16 Pro Max (440x956 @3x = 1320x2868).
   Czego to NIE zastąpi: krój pisma i rysowanie tekstu są z Chromium, nie z WebKita,
   i nie ma paska stanu iOS. Zrzut z iPhone'a testera jest lepszy — patrz
   APP_STORE_ZGLOSZENIE.md §7.

   Uruchomienie:  node ios-app/skrypty/zrzuty.mjs [nazwa-ujecia ...]
*/
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";

const KORZEN = resolve(".");   // uruchamiać z korzenia repo
const WWW = join(KORZEN, "ios-app", "www");
const WYJSCIE = join(KORZEN, "ios-app", "zrzuty");
const PORT = 8731;
const SZER = 440, WYS = 956, DPR = 3;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
         + "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
                "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
                "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
               .find(p => existsSync(p));
if (!CHROME) { console.error("Nie znalazłem Chrome ani Edge."); process.exit(1); }
if (!existsSync(join(WWW, "app.js"))) {
  console.error(`Brak ${WWW}/app.js — najpierw: node ios-app/skrypty/przygotuj.mjs`); process.exit(1);
}

const TYPY = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml",
  ".wav":"audio/wav", ".mp3":"audio/mpeg", ".woff2":"font/woff2", ".bin":"application/octet-stream" };

const serwer = createServer(async (req, res) => {
  const sciezka = decodeURIComponent(req.url.split("?")[0]);
  const plik = join(WWW, sciezka === "/" ? "index.html" : sciezka.replace(/^\/+/, ""));
  if (!plik.startsWith(WWW)) { res.writeHead(403).end(); return; }
  try {
    const dane = await readFile(plik);
    res.writeHead(200, { "Content-Type": TYPY[extname(plik).toLowerCase()] || "application/octet-stream",
                         "Access-Control-Allow-Origin": "*" });
    res.end(dane);
  } catch { res.writeHead(404).end("brak"); }
});
await new Promise(ok => serwer.listen(PORT, "127.0.0.1", ok));

const profil = join(tmpdir(), "straznik-zrzuty-profil");
await rm(profil, { recursive: true, force: true });
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333",
  `--user-data-dir=${profil}`, "--no-first-run", "--no-default-browser-check",
  "--hide-scrollbars", "--mute-audio", "--disable-lcd-text",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--force-color-profile=srgb",
  "--disable-features=Translate,BackForwardCache", "about:blank"], { stdio: "ignore" });

const czekaj = ms => new Promise(ok => setTimeout(ok, ms));
let ws, nast = 1;
const czekajace = new Map(), sluchacze = [];
for (let i = 0; i < 40 && !ws; i++) {
  await czekaj(250);
  try {
    const lista = await (await fetch("http://127.0.0.1:9333/json/list")).json();
    const karta = lista.find(t => t.type === "page");
    if (!karta) continue;
    ws = new WebSocket(karta.webSocketDebuggerUrl);
    await new Promise((ok, zle) => { ws.onopen = ok; ws.onerror = zle; });
  } catch { ws = null; }
}
if (!ws) { console.error("Chrome nie wystartował."); process.exit(1); }
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && czekajace.has(m.id)) {
    const { ok, zle } = czekajace.get(m.id); czekajace.delete(m.id);
    m.error ? zle(new Error(m.error.message)) : ok(m.result);
  } else if (m.method) sluchacze.forEach(f => f(m));
};
const cdp = (method, params = {}) => new Promise((ok, zle) => {
  const id = nast++; czekajace.set(id, { ok, zle }); ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr, awaitPromise = false) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || expr);
  return r.result.value;
};
const azDo = async (expr, opis, limit = 25000) => {
  const koniec = Date.now() + limit;
  while (Date.now() < koniec) { if (await js(expr)) return true; await czekaj(400); }
  console.warn(`  ! nie doczekałem: ${opis}`);
  return false;
};

await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride",
  { width: SZER, height: WYS, deviceScaleFactor: DPR, mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 } });
await cdp("Emulation.setUserAgentOverride", { userAgent: UA, platform: "iPhone" });
// iPhone w trybie ciemnym (tak wygląda reszta zrzutów) i lokalizacja w Lublinie,
// bo bez niej GROTA nie ma od czego liczyć najbliższych schronień.
await cdp("Emulation.setEmulatedMedia",
  { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await cdp("Emulation.setGeolocationOverride", { latitude: 51.2465, longitude: 22.5684, accuracy: 20 });
await cdp("Browser.grantPermissions", { origin: `http://127.0.0.1:${PORT}`, permissions: ["geolocation"] });
/* To samo, co robi prawdziwy kontener: Capacitor na iOS. Dzięki temu index.html
   dokłada klasę ios-app (ukrywa rzeczy androidowe i linki do wsparcia autora),
   a app.js bierze serwer z DEFAULT_BACKEND zamiast z adresu strony. */
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.Capacitor = { getPlatform: () => "ios", isNativePlatform: () => true, Plugins: {} };
  try {
    localStorage.setItem("straznik_onboarded", "1");
    localStorage.setItem("straznik_places_v1", JSON.stringify(
      [{id:"dom", name:"Dom", precision:"region", region:"lubelskie", alerts:true}]));
    localStorage.setItem("straznik_voiv", "lubelskie");
    localStorage.setItem("straznik_lang", "pl");
  } catch (e) {}
` });

const UJECIA = [
  { nazwa: "1-mapa", opis: "Mapa z sygnałami",
    przed: "true", gotowe: "true", pauza: 6000,
    // kadr na Polskę — to samo, co robi palec użytkownika, tylko powtarzalnie;
    // dopiero PO pierwszym stanie z serwera, bo aplikacja sama ustawia wtedy widok
    po: `return (map.jumpTo({center:[19.6,52.15], zoom:4.85, pitch:0, bearing:0}), "ok")`,
    poPauza: 3000 },
  /* Spokojny dzień = puste listy, więc panel i historię pokazujemy na OSTATNIM
     prawdziwym alarmie z zapisu (przycisk „alarm" w pasku historii). To dane
     z naszego archiwum, nie wymyślone — ekran jest wtedy opisany „PODGLĄD HISTORII". */
  { nazwa: "2-sygnaly", opis: "Panel sygnałów (ostatni alarm z historii)",
    przed: `document.getElementById("btn-history").click(); true`,
    gotowe: `!!document.querySelector('#tb-controls [data-act="prev-alarm"]')`, pauza: 4000,
    po: `const a = document.querySelector('#tb-controls [data-act="prev-alarm"]');
         const stan = a.disabled ? "BRAK ALARMU W HISTORII" : (a.click(), "ok");
         setTimeout(() => document.getElementById("btn-panel").click(), 1500); return stan`,
    poPauza: 5000 },
  { nazwa: "3-historia", opis: "Suwak historii (ostatni alarm)",
    przed: `document.getElementById("btn-history").click(); true`,
    gotowe: `!!document.querySelector('#tb-controls [data-act="prev-alarm"]')`, pauza: 4000,
    po: `const a = document.querySelector('#tb-controls [data-act="prev-alarm"]');
         const stan = a.disabled ? "BRAK ALARMU W HISTORII" : (a.click(), "ok");
         // chowamy kafelki mapy (ten sam przycisk, co pod palcem), żeby
         // województwo z alarmem nie siedziało za nimi
         setTimeout(() => { document.getElementById("btn-tiles").click();
           map.jumpTo({center:[19.9,52.0], zoom:5.0, pitch:0, bearing:0}); }, 2000); return stan`,
    poPauza: 9000 },
  { nazwa: "4-schronienie", opis: "GROTA — schronienie",
    przed: `document.getElementById("tab-more").click();
            setTimeout(() => document.getElementById("btn-grota").click(), 400); true`,
    gotowe: `!document.getElementById("grota-widok").hidden`, pauza: 25000,
    po: `document.querySelector('[data-act="info-off"]')?.click();
         document.getElementById("btn-locate")?.click();
         setTimeout(() => document.querySelector('[data-act="lista-toggle"]')?.click(), 3000);
         return "ok"`,
    poPauza: 7000 },
  { nazwa: "5-miejsca", opis: "Moje miejsca",
    przed: `document.getElementById("btn-settings").click();
            setTimeout(() => document.querySelector('.set-tab[data-pane="miejsca"]').click(), 500);
            setTimeout(() => document.getElementById("btn-places").click(), 1200); true`,
    gotowe: `document.getElementById("places-dialog")?.open === true`, pauza: 2500 },
  /* Zamiast ekranu „Alarmy": on w przeglądarce pokazuje treść dla Safari
     („dodaj do ekranu początkowego"), a nie to, co widzi człowiek w aplikacji
     z App Store — nie wolno nim ilustrować sklepu. „O aplikacji i punktacja"
     wygląda wszędzie tak samo i odpowiada na pytanie, skąd biorą się punkty. */
  { nazwa: "6-punktacja", opis: "O aplikacji i punktacja",
    przed: `document.getElementById("tab-more").click();
            setTimeout(() => document.getElementById("btn-about").click(), 500); true`,
    gotowe: `document.getElementById("about")?.open === true
             || !!document.querySelector("dialog[open] .about-sec")`, pauza: 2500 },
];

const chce = process.argv.slice(2).filter(a => !a.startsWith("-"));
await mkdir(WYJSCIE, { recursive: true });
for (const u of UJECIA) {
  if (chce.length && !chce.includes(u.nazwa)) continue;
  console.log(`→ ${u.nazwa} (${u.opis})`);
  await cdp("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
  await czekaj(1500);
  await azDo(`!!document.getElementById("tabbar")`, "wczytanie strony");
  await czekaj(3500);                               // mapa i pierwszy stan z serwera
  await js(u.przed);
  await azDo(u.gotowe, u.opis);
  await czekaj(u.pauza);
  if (u.po) { const r = await js(`(() => { ${u.po} })()`); if (r && r !== "ok") console.warn(`  ! ${r}`); await czekaj(u.poPauza ?? 1500); }
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(WYJSCIE, `${u.nazwa}.png`), Buffer.from(data, "base64"));
  console.log(`  zapisane: ios-app/zrzuty/${u.nazwa}.png`);
}

ws.close(); chrome.kill(); serwer.close();
console.log("Gotowe: ios-app/zrzuty/*.png — 1320x2868, bez kanału alfa.");
process.exit(0);

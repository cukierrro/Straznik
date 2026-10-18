// Stały test responsywności (18.10.2026, przed 1.7.97).
//
// Po co: zgłoszenia userów wracały pojedynczo — karta obiektu nad ekranem bez
// przycisku zamknięcia, tytuł wykresu łamany w słupek, godzina historii za
// krawędzią, okno zgody ściśnięte do kolumny — a każda łatka mogła psuć inny
// ekran. Analiza na emulatorze (Pixel 7, 320/360/411 dp, czcionka 100–200 %,
// PL/EN/UK) potwierdziła je wszystkie. Ten test robi to samo w przeglądarce
// przy każdym uruchomieniu zestawu: przegląda 15 widoków na kilku szerokościach,
// w trzech językach i przy dużym tekście i pada, gdy coś wyjdzie za ekran,
// z ramki albo złamie się w słupek (scripts/responsywnosc/przeglad.js).
//
// Dane są syntetyczne (scripts/responsywnosc/dane.cjs) i podawane przez lokalny
// serwer na losowym porcie. Kafelki tła mapy nie są potrzebne.
// Przeglądarka: Edge albo Chrome (STRAZNIK_PRZEGLADARKA = ścieżka, żeby wskazać
// inną). Bez przeglądarki test PADA — chyba że ustawisz STRAZNIK_BEZ_PRZEGLADARKI=1
// (np. na serwerze), wtedy wypisuje POMINIĘTO.
//
// Uruchomienie: node scripts/test_responsywnosc.cjs [--szybko]
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const KORZEN = path.resolve(__dirname, "..");
const PRZEGLAD = fs.readFileSync(path.join(__dirname, "responsywnosc", "przeglad.js"), "utf8");

// Szerokość × język × wielkość tekstu. 1,6 to obciążenie zbliżone do czcionki
// systemowej 200 % (w przeglądarce nie da się jej ustawić — zmieniamy mnożnik
// --skala-tekstu, tak jak robi to powiększenie w aplikacji).
const KONFIGURACJE = [
  { nazwa: "320 pl", w: 320, h: 646, jezyk: "pl", skala: "1" },
  { nazwa: "360 pl", w: 360, h: 730, jezyk: "pl", skala: "1" },
  { nazwa: "360 uk", w: 360, h: 730, jezyk: "uk", skala: "1" },
  { nazwa: "360 en", w: 360, h: 730, jezyk: "en", skala: "1" },
  { nazwa: "411 pl", w: 411, h: 838, jezyk: "pl", skala: "1" },
  { nazwa: "320 uk ×1,3", w: 320, h: 646, jezyk: "uk", skala: "1.3" },
  { nazwa: "360 pl ×1,6", w: 360, h: 730, jezyk: "pl", skala: "1.6" },
];
const SZYBKO = process.argv.includes("--szybko");

// Znane i ŚWIADOME wyjątki — każdy z uzasadnieniem. Nowy wpis wymaga powodu.
const DOZWOLONE = [
  // kolumna punktów w tabeli „O aplikacji” łamie się celowo (<br> między stopniami RCB)
  { t: /^E /, el: /ab-tab-punkty > td\.pts/ },
  // przy obciążeniu ×1,6 wiersze ustawień i nagłówki łamią się w 3 linie — czytelnie,
  // w ramce; zakazane jest tylko wychodzenie poza ekran (A/B/C/D/F)
  { t: /^E /, konf: /×1,6/ },
];
const dozwolony = (p, konf) => DOZWOLONE.some(d => d.t.test(p.t) && (!d.el || d.el.test(p.el))
  && (!d.konf || d.konf.test(konf)));

const { serwer } = require("./responsywnosc/serwer.cjs");

// ── przeglądarka i DevTools ───────────────────────────────────────────────────
function znajdzPrzegladarke() {
  const kandydaci = [process.env.STRAZNIK_PRZEGLADARKA,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  return kandydaci.find(p => fs.existsSync(p));
}
const czekaj = (ms) => new Promise(r => setTimeout(r, ms));

async function uruchomPrzegladarke(exe) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "straznik-resp-"));
  const proc = spawn(exe, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profil}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
    "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  const plikPortu = path.join(profil, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(plikPortu); i++) await czekaj(100);
  if (!fs.existsSync(plikPortu)) throw new Error("przeglądarka nie wystawiła portu DevTools");
  const port = fs.readFileSync(plikPortu, "utf8").split("\n")[0].trim();
  let strona;
  for (let i = 0; i < 50 && !strona; i++) {
    try { strona = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); }
    catch { await czekaj(100); }
  }
  return { proc, profil, ws: strona.webSocketDebuggerUrl };
}

function polacz(url) {
  return new Promise((ok, zle) => {
    const ws = new WebSocket(url);
    let id = 0; const czeka = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); const c = czeka.get(d.id);
      if (c) { czeka.delete(d.id); d.error ? c.zle(new Error(d.error.message)) : c.ok(d.result); } };
    ws.onerror = () => zle(new Error("WebSocket DevTools"));
    ws.onopen = () => ok({
      wyslij: (method, params = {}) => new Promise((o, z) => { const n = ++id; czeka.set(n, { ok: o, zle: z });
        ws.send(JSON.stringify({ id: n, method, params })); }),
      zamknij: () => ws.close(),
    });
  });
}

async function ocen(cdp, wyrazenie, limitMs = 120000) {
  const r = await Promise.race([
    cdp.wyslij("Runtime.evaluate", { expression: wyrazenie, awaitPromise: true, returnByValue: true }),
    czekaj(limitMs).then(() => { throw new Error("przekroczony czas"); })]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const GOTOWE = `(async () => {
  for (let i = 0; i < 90; i++) {
    // Kafelki tła (OpenFreeMap) nie są potrzebne: detektor sprawdza panele i okna.
    // Wystarczy stan z serwera i obiekty w warstwie mapy (z nich otwiera się karta).
    try { if (typeof state !== "undefined" && state && state.fusion
          && (map.getSource("threats")?._data?.features || []).length) { await new Promise(r => setTimeout(r, 1500)); return "ok"; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  // przyczyna zamiast ogólnika — żeby było wiadomo, czy brak WebGL, kafelków czy danych
  const c = document.createElement("canvas");
  const d = { webgl: !!(c.getContext("webgl2") || c.getContext("webgl")),
    stan: typeof state !== "undefined" && !!(state && state.fusion) };
  try { d.mapa = typeof map; d.zaladowana = map.loaded(); d.styl = map.isStyleLoaded();
        d.obiekty = (map.getSource("threats")?._data?.features || []).length; } catch (e) { d.blad = String(e).slice(0, 80); }
  return "brak mapy albo danych " + JSON.stringify(d);
})()`;

// ── przebieg ─────────────────────────────────────────────────────────────────
(async () => {
  const exe = znajdzPrzegladarke();
  if (!exe) {
    if (process.env.STRAZNIK_BEZ_PRZEGLADARKI === "1") { console.log("POMINIĘTO: brak przeglądarki"); return; }
    console.error("BŁĄD: nie znaleziono Edge ani Chrome (ustaw STRAZNIK_PRZEGLADARKA)"); process.exit(1);
  }
  const srv = await serwer();
  const adres = `http://127.0.0.1:${srv.address().port}/`;
  const { proc, profil, ws } = await uruchomPrzegladarke(exe);
  const cdp = await polacz(ws);
  const bledy = [];
  try {
    await cdp.wyslij("Page.enable");
    await cdp.wyslij("Runtime.enable");
    for (const k of (SZYBKO ? KONFIGURACJE.slice(0, 2) : KONFIGURACJE)) {
      await cdp.wyslij("Emulation.setDeviceMetricsOverride", { width: k.w, height: k.h, deviceScaleFactor: 2.625, mobile: true });
      await cdp.wyslij("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      // ustawienia przed pierwszym odmalowaniem: język, wielkość tekstu, bez okna powitalnego
      const skalaZapis = ["1", "1.15", "1.3"].includes(k.skala) ? k.skala : "1";
      const { identifier } = await cdp.wyslij("Page.addScriptToEvaluateOnNewDocument", { source:
        `try { localStorage.setItem("straznik_lang", ${JSON.stringify(k.jezyk)});
               localStorage.setItem("straznik_skala_tekstu", ${JSON.stringify(skalaZapis)}); } catch {}` });
      await cdp.wyslij("Page.navigate", { url: adres });
      const gotowe = await ocen(cdp, GOTOWE, 60000).catch(e => String(e.message));
      if (gotowe !== "ok") { bledy.push(`${k.nazwa}: nie udało się sprawdzić — ${gotowe}`); continue; }
      if (!["1", "1.15", "1.3"].includes(k.skala))
        await ocen(cdp, `document.documentElement.style.setProperty("--skala-tekstu", ${JSON.stringify(k.skala)});
          try { zmierzPowiekszenieSystemu(); } catch {} ; "ok"`);
      const wynik = JSON.parse(await ocen(cdp, "window.__przegladTempo = 0.4; " + PRZEGLAD));
      let ile = 0;
      for (const w of wynik.wyniki) {
        if (w.blad) { bledy.push(`${k.nazwa} · ${w.widok}: widok się nie otworzył — ${w.blad}`); continue; }
        for (const p of w.problemy) {
          if (dozwolony(p, k.nazwa)) continue;
          ile++;
          bledy.push(`${k.nazwa} · ${w.widok}: ${p.t} | ${p.el}${p.txt ? " «" + p.txt + "»" : ""}`
            + `${p.o ? " +" + p.o + " px" : ""}${p.x ? " x " + p.x : ""}${p.y ? " y " + p.y : ""}${p.linie ? " " + p.linie + " linii" : ""}`);
        }
      }
      console.log(`${ile ? "BŁĄD" : "OK  "} ${k.nazwa} (${wynik.W}×${wynik.H}): ${wynik.wyniki.length} widoków, problemów: ${ile}`);
      await cdp.wyslij("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  } finally {
    cdp.zamknij(); proc.kill(); srv.close();
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  }
  if (bledy.length) {
    console.log("\nPROBLEMY:"); for (const b of bledy) console.log("  " + b);
    process.exit(1);
  }
  console.log("\nOK - układ mieści się na ekranach 320–411 px w PL/EN/UK i przy dużym tekście");
})().catch(e => { console.error("BŁĄD:", e.message); process.exit(1); });

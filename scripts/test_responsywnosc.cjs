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
// Do tego sprawdza, że mapa przesuwa się nad otwarty panel Sygnały (od 1.7.97)
// i że okna z Menu i sekcje Ustawień mają na górze działający przycisk powrotu (1.7.98).
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

const MAPA_NAD_PANELEM = `(async () => {
  const pauza = (ms) => new Promise(r => setTimeout(r, ms));
  try { exitHistory(); } catch {}
  try { hideCard(); } catch {}
  setPanel(false);
  document.getElementById("disclaimer")?.classList.remove("hidden");
  await pauza(1200);
  const baza = zaslonietyDol();
  setPanel(true);
  await pauza(1500);
  const panel = zaslonietyDol();
  const pasekPrzyPanelu = !!document.getElementById("disclaimer")?.offsetHeight;
  setPanel(false);
  // pasek widoczny PRZY otwartym panelu — na ekranach niższych niż 780 px CSS go
  // wtedy chowa i usterki nie widać; dlatego w zestawie jest ekran 411×838
  return JSON.stringify({ baza, panel, pasek: pasekPrzyPanelu });
})()`;

/* Przyciski powrotu (1.7.98, zgłoszenie usera 18.10.2026: „nie na wszystkich kartach
   pojawia się ten guzik, powinien być na górze”). Każde okno otwarte z Menu ma NA GÓRZE
   „‹ Menu” (w rzędzie z „Zamknij”), każda sekcja Ustawień i Moje miejsca — „‹ Ustawienia”;
   przycisk naprawdę wraca, a etykieta jest w języku interfejsu. Zwraca listę problemów. */
const POWROTY = `(async () => {
  const P = (ms) => new Promise(r => setTimeout(r, ms));
  const lang = UI.lang || "pl";
  const MENU = { pl: "Menu", en: "Menu", uk: "Меню" }[lang];
  const USTAW = { pl: "Ustawienia", en: "Settings", uk: "Налаштування" }[lang];
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none";
  const menu = document.getElementById("more-sheet"), set = document.getElementById("settings");
  const zle = [];
  const zamknijWszystko = () => { document.querySelectorAll("dialog[open]").forEach(d => d.close());
    document.getElementById("legend").classList.add("hidden"); };
  // przycisk powrotu: jeden widoczny, z etykietą, na górze okna, nie niżej niż „Zamknij”
  const sprawdz = (gdzie, root, etykieta, zamknij) => {
    const b = [...root.querySelectorAll(".set-wstecz")].filter(vis);
    if (b.length !== 1) { zle.push(gdzie + ": widocznych przycisków powrotu " + b.length); return null; }
    const txt = b[0].innerText.trim();
    if (txt !== etykieta) zle.push(gdzie + ": etykieta «" + txt + "», oczekiwano «" + etykieta + "»");
    const r = b[0].getBoundingClientRect(), rr = root.getBoundingClientRect();
    // w rzędzie z „Zamknij” albo — gdy przy dużym tekście oba się nie mieszczą — tuż pod nim
    const zb = zamknij && vis(zamknij) ? zamknij.getBoundingClientRect() : null;
    const wRzedzie = zb && Math.abs(zb.top - r.top) <= 12;
    const podSpodem = zb && r.top >= zb.bottom - 4 && r.top - zb.bottom <= 16;
    if (r.top - rr.top > 30 && !podSpodem)
      zle.push(gdzie + ": przycisk nie na górze (" + Math.round(r.top - rr.top) + " px od góry)");
    if (zb && !wRzedzie && !podSpodem) zle.push(gdzie + ": przycisk ani w rzędzie z «Zamknij», ani tuż pod nim");
    return b[0];
  };
  const zMenu = async (id) => { zamknijWszystko(); document.getElementById("tab-more").click(); await P(350);
    document.getElementById(id).click(); await P(650); };
  // Ustawienia z Menu: start i pięć sekcji
  await zMenu("btn-settings");
  sprawdz("Ustawienia (start)", set, MENU, set.querySelector(".dlg-x"));
  for (const pane of ["alarmy", "miejsca", "dzwiek", "mapa", "aplikacja"]) {
    set.querySelector('.set-tab[data-pane="' + pane + '"]').click(); await P(200);
    const b = sprawdz("Ustawienia → " + pane, set, USTAW, set.querySelector(".dlg-x"));
    b?.click(); await P(200);
    if (!set.classList.contains("na-starcie")) zle.push("Ustawienia → " + pane + ": «‹ " + USTAW + "» nie wraca do startu");
  }
  document.getElementById("set-do-menu").click(); await P(350);
  if (!menu.open || set.open) zle.push("Ustawienia: «‹ " + MENU + "» nie otwiera Menu");
  // pozostałe okna z Menu
  for (const [btn, id] of [["btn-about", "about"], ["btn-watch", "watch"], ["btn-legend", "legend"]]) {
    await zMenu(btn);
    const o = document.getElementById(id);
    const b = sprawdz(id + " z Menu", o, MENU, id === "legend" ? document.getElementById("legend-x") : o.querySelector(".dlg-x"));
    if (b) { b.click(); await P(350);
      const nadal = id === "legend" ? !o.classList.contains("hidden") : o.open;
      if (!menu.open || nadal) zle.push(id + ": «‹ " + MENU + "» nie wraca do Menu"); }
  }
  // Moje miejsca: «‹ Ustawienia» wraca do sekcji, a Ustawienia zachowują «‹ Menu»
  await zMenu("btn-settings");
  set.querySelector('.set-tab[data-pane="miejsca"]').click(); await P(200);
  document.getElementById("btn-places").click(); await P(450);
  const pd = document.getElementById("places-dialog");
  sprawdz("Moje miejsca", pd, USTAW, null)?.click(); await P(450);
  if (!set.open || set.querySelector(".set-pane:not([hidden])")?.dataset.pane !== "miejsca")
    zle.push("Moje miejsca: «‹ " + USTAW + "» nie wraca do sekcji Moje miejsca");
  document.getElementById("set-wstecz").click(); await P(200);
  if (!vis(document.getElementById("set-do-menu"))) zle.push("Ustawienia po Moich miejscach: zniknęło «‹ " + MENU + "»");
  // okna otwarte NIE z Menu nie mają «‹ Menu»
  zamknijWszystko(); openSettings(); await P(300);
  if (vis(document.getElementById("set-do-menu"))) zle.push("Ustawienia nie z Menu: widać «‹ " + MENU + "»");
  zamknijWszystko(); showWatch(); await P(300);
  if ([...document.querySelectorAll("#watch .do-menu")].some(vis)) zle.push("Obce maszyny nie z Menu: widać «‹ " + MENU + "»");
  zamknijWszystko();
  return JSON.stringify(zle);
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
    for (const k of (SZYBKO ? KONFIGURACJE.filter(k => ["320 pl", "411 pl"].includes(k.nazwa)) : KONFIGURACJE)) {
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
      // Mapa przesuwa się nad otwarty panel Sygnały — także przy widocznym pasku
      // „NIEOFICJALNE źródło” (18.10.2026: z paskiem panel kończył się nad dołem mapy
      // i warunek „panel z dołu” nie łapał, więc mapa stała pod panelem).
      const mapa = JSON.parse(await ocen(cdp, MAPA_NAD_PANELEM));
      const powroty = JSON.parse(await ocen(cdp, POWROTY));
      for (const z of powroty) bledy.push(`${k.nazwa} · przyciski powrotu: ${z}`);
      const mapaZle = !(mapa.panel - mapa.baza > 150);
      if (mapaZle)
        bledy.push(`${k.nazwa} · mapa nad panelem: dolny margines mapy ${mapa.baza} → ${mapa.panel} px po otwarciu Sygnałów (pasek ostrzeżenia widoczny: ${mapa.pasek})`);
      console.log(`${ile || mapaZle || powroty.length ? "BŁĄD" : "OK  "} ${k.nazwa} (${wynik.W}×${wynik.H}): ${wynik.wyniki.length} widoków, problemów: ${ile}; `
        + `mapa nad panelem ${mapa.baza}→${mapa.panel} px${mapa.pasek ? " (z paskiem ostrzeżenia)" : ""}`);
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

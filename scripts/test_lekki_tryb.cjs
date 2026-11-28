// Lekki tryb strony (28.11.2026): rozpoznanie telewizora, wyłączenie w aplikacji
// i pomijanie powtórnych ustawień mapy. Uruchomienie: node scripts/test_lekki_tryb.cjs
"use strict";
const fs = require("node:fs"), path = require("node:path");
const KORZEN = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(KORZEN, "frontend/app.js"), "utf8");
const html = fs.readFileSync(path.join(KORZEN, "frontend/index.html"), "utf8");
const i18n = fs.readFileSync(path.join(KORZEN, "frontend/i18n.js"), "utf8");
let bledy = 0;
const ok = (w, opis) => { console.log((w ? "OK   " : "BLAD ") + opis); if (!w) bledy++; };

// 1. wzorzec identyfikatora telewizora wyciągnięty z app.js — ten sam, który działa w przeglądarce
const m = app.match(/const TV_UA = (\/.*\/[a-z]*);/);
ok(!!m, "TV_UA w app.js");
const TV_UA = m ? new Function(`return ${m[1]};`)() : /$^/;
const TELEWIZORY = {
  "Samsung Tizen": "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36",
  "LG webOS": "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager",
  "Sony Bravia (Android TV)": "Mozilla/5.0 (Linux; Android 10; BRAVIA 4K VH2 Build/QTG3.200305.006.S292) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
  "Amazon Fire TV": "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Silk/112.3.1 like Chrome/112.0.5615.213 Safari/537.36",
  "Chromecast z Google TV": "Mozilla/5.0 (Linux; Android 12.0; Build/STTL.240206.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CrKey/1.56.500000 DeviceType/AndroidTV",
  "Hisense VIDAA": "Mozilla/5.0 (Linux; VIDAA 6.0; 4K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36",
  "Philips (HbbTV)": "Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0 Safari/537.36 HbbTV/1.5.1 (+DRM; Philips; 2k20MTK; ; PhilipsTV; CE-HTML/1.0)",
};
const ZWYKLE = {
  "Chrome Windows": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Edge Windows": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  "Firefox Linux": "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Safari macOS": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Samsung Galaxy (Samsung Internet)": "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  "Pixel Chrome": "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  "Xiaomi MIUI": "Mozilla/5.0 (Linux; U; Android 13; pl-pl; 2107113SG Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.7.1",
  "iPhone Safari": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "iPad Safari": "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Tablet Lenovo": "Mozilla/5.0 (Linux; Android 13; TB350FU) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};
for (const [n, ua] of Object.entries(TELEWIZORY)) ok(TV_UA.test(ua), `telewizor rozpoznany: ${n}`);
for (const [n, ua] of Object.entries(ZWYKLE)) ok(!TV_UA.test(ua), `NIE telewizor: ${n}`);

// 2. aplikacja (Capacitor) nigdy nie wchodzi w lekki tryb, także z zapisanym wyborem
ok(/function lekkiAuto\(\) \{ return !IS_APP && /.test(app), "rozpoznanie tylko poza aplikacją");
ok(/const LEKKI = !IS_APP && \(/.test(app), "LEKKI zawsze false w aplikacji");
ok(/if \(!IS_APP && \(q === "1" \|\| q === "0"\)\)/.test(app), "parametr ?lekki zapisywany tylko poza aplikacją");
ok(/<h3 id="lekki-head" class="web-only">/.test(html) && /<label id="lekki-label" class="web-only">/.test(html)
   && /class="fineprint web-only" id="lekki-note"/.test(html), "ustawienie widoczne tylko na stronie (web-only)");

// 3. wybór użytkownika ma pierwszeństwo przed lekkim trybem
ok(/if \(v === "woj" \|\| v === "pow"\) return v;\s*\} catch \{\}\s*return LEKKI \? "woj" : "pow";/.test(app), "podział: zapisany wybór wygrywa");
ok(/if \(v === "2d" \|\| v === "3d"\) return v === "3d";[\s\S]{0,40}return !LEKKI;/.test(app), "widok 3D: zapisany wybór wygrywa");

// 4. co lekki tryb wyłącza
ok(/if \(LEKKI\) return \{ \.\.\.target, gliding: false \};/.test(app), "bez płynnego przejazdu ikon");
ok(/antialias: !LEKKI/.test(app) && /\.\.\.\(LEKKI \? \{ pixelRatio: Math\.min\(window\.devicePixelRatio \|\| 1, 1\) \} : \{\}\)/.test(app), "bez wygładzania, rozdzielczość 1×");
ok(/if \(LEKKI\) \{\s*if \(!lekkiPierscien/.test(app), "stały pierścień zamiast pulsu");

// 5. pomijanie powtórek (dla wszystkich, wygląd bez zmian)
ok(/function ustawDane\(id, fc\) \{[\s\S]{0,200}if \(byl && byl\.src === src && byl\.k === k\) return;/.test(app), "setData tylko przy zmianie treści");
ok(!/map\.getSource\("(threats|trails|course|uncertainty|adsb|adsb-course|adsb-trail)"\)\?\.setData\(/.test(app), "warstwy obiektów i samolotów tylko przez ustawDane");
ok(/\(map\.getLayoutProperty\(id, "visibility"\) \?\? "visible"\) !== v/.test(app), "widoczność warstw tylko przy zmianie");
ok(/JSON\.stringify\(map\.getFilter\(id\)\) !== JSON\.stringify\(filtr\)/.test(app), "filtr moich powiatów tylko przy zmianie");
ok(/function ustawStan\(zrodlo, id, v\)/.test(app) && (app.match(/map\.setFeatureState\(/g) || []).length === 3, "stan obszarów przez ustawStan (poza powiatami)");
ok(/stanyMapy\[ktore\]\.clear\(\);/.test(app), "nowe granice UA — stan nakładany od nowa");

// 6. tłumaczenia
for (const t of ["Light mode", "For weaker devices, e.g. a TV", "Легкий режим", "Для слабших пристроїв, напр. телевізора"])
  ok(i18n.includes(t), `tłumaczenie: ${t}`);

if (bledy) { console.log(`\nBLEDY: ${bledy}`); process.exit(1); }
console.log("\nOK: lekki tryb");

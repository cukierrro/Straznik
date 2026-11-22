// Panel Sygnały z powiatami (1.8.12, frontend/panel-powiaty.js + serwer `state_pow`).
// Decyzja usera 22.11.2026 po prototypie na emulatorze: strony „Powiaty” / „Województwa”
// (zakładki, strzałki, przesunięcie palcem), na szerokim ekranie dwie kolumny; rozbicie
// punktów powiatu pobierane DOPIERO po rozwinięciu powiatu.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const czytaj = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = czytaj('frontend', 'app.js');
const mod = czytaj('frontend', 'panel-powiaty.js');
const html = czytaj('frontend', 'index.html');
const css = czytaj('frontend', 'style.css');
let bledy = 0;
const ok = (w, opis) => { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; };

console.log('1. Wczytanie i podpięcie');
const iApp = html.indexOf('<script src="app.js?v='), iMod = html.indexOf('<script src="panel-powiaty.js?v=');
ok(iApp > 0 && iMod > iApp, 'panel-powiaty.js wczytywany po app.js, z kluczem wersji');
const rp = app.slice(app.indexOf('function renderPanel()'), app.indexOf('/* Zasięg obu list obiektów w panelu'));
ok(/renderObservationLists\(state\);\s*\n\s*\/\/[^\n]*\n\s*if \(typeof window\.rysujPanelPowiatow === "function"\) window\.rysujPanelPowiatow\(\);\s*\n\}/.test(rp),
  'renderPanel kończy się dorysowaniem strony „Powiaty”');
const rh = app.slice(app.indexOf('function renderHistoryPanel('), app.indexOf('document.getElementById("btn-history").onclick'));
ok(/window\.rysujPanelPowiatow\(\);\s*\n\}\s*$/.test(rh.trim() + '\n'), 'renderHistoryPanel też (powiaty z wybranej chwili)');
ok(/window\.rysujPanelPowiatow = rysujPanelPowiatow;/.test(mod), 'moduł wystawia rysujPanelPowiatow');
ok(!/window\.renderPanel\s*=/.test(mod), 'moduł nie podmienia renderPanel (jak prototyp) — app.js woła go wprost');

console.log('\n2. Dane i ruch sieciowy');
ok(/fetch\(base \+ "\/api\/state\?part=pow"/.test(mod), 'rozbicie z /api/state?part=pow (ścieżka objęta cache Cloudflare)');
const wywolania = [...mod.matchAll(/pobierzRozbicie\(\)/g)].length;
const def = mod.indexOf('function pobierzRozbicie()');
const syg = mod.slice(mod.indexOf('function sygnalyHTML('), mod.indexOf('const przyciskWoj'));
ok(def > 0 && wywolania === 2 && /pobierzRozbicie\(\);/.test(syg),
  'rozbicie pobierane tylko z rozwiniętego powiatu (sygnalyHTML), nie przy każdym rysowaniu');
ok(/if \(!v \|\| pobieranie \|\| \(rozbicie && rozbicieV === v\)\) return;/.test(mod), 'bez ponownego pobierania tej samej wersji (pow_v) i bez równoległych zapytań');
ok(/if \(histMode\) return `<p class="fineprint">/.test(syg), 'w historii bez rozbicia — tylko na żywo (serwer liczy je dla bieżącej chwili)');
ok(/const dostepne = \(\) => !\(typeof standalone !== "undefined" && standalone\);/.test(mod)
  && /if \(!dost\) \{ strona = 1; ustawStrone\(1\); return; \}/.test(mod), 'bez serwera (tryb wbudowany) panel zostaje przy województwach');
ok(/histMode \? \(powHistoria \|\| \{\}\) : \(state\?\.fusion\?\.powiaty \|\| \{\}\)/.test(mod), 'historia bierze powiaty z migawki, na żywo ze stanu');
ok(/score: histMode \? null : \(\+pkt\[t\] \|\| 0\)/.test(mod) && /p\.score == null \? "" :/.test(mod),
  'w historii powiat bez poziomu bez liczby punktów (migawka ich nie zapisuje — nie „0,0 pkt”)');

console.log('\n3. Strony, gest, dostępność');
ok(/podzialMapy\(\) === "woj" \? 1 : 0/.test(mod), 'strona startowa idzie za podziałem mapy');
ok(/\.pp-strony \{[^}]*touch-action: pan-y;/.test(css), 'pion przewija się natywnie, poziom obsługuje skrypt');
ok(/Math\.abs\(dx\) > strony\.clientWidth \* 0\.15 \|\| szybki/.test(mod) && /Math\.abs\(dx\) > 30 && Date\.now\(\) - t0 < 300/.test(mod),
  'przeskok po 15% szerokości albo po szybkim ruchu (na emulatorze natywne przewijanie łapało tylko wolny)');
ok(/poziomy = Math\.abs\(dx\) > Math\.abs\(dy\)/.test(mod), 'kierunek gestu rozstrzygany na początku — ruch w pionie nie przełącza strony');
ok(/if \(poziomy === null\) poziomy = Math\.abs\(dx\) > 8 && Math\.abs\(dx\) > Math\.abs\(dy\);/.test(mod),
  'gest bez touchmove (szybki ruch na wolnym urządzeniu) też przełącza — kierunek z końca gestu');
ok(/sPow\.toggleAttribute\("inert"/.test(mod) && /sWoj\.toggleAttribute\("inert"/.test(mod), 'niewidoczna strona poza klawiaturą i czytnikiem ekranu');
ok(/role="tablist"/.test(mod) && /role="tab"/.test(mod) && /role="tabpanel"/.test(mod) && /ArrowLeft/.test(mod), 'wzorzec zakładek: role i strzałki klawiatury');
for (const [sel, opis] of [['.pp-zakl', 'zakładka'], ['.pp-strz', 'strzałka'], ['.pp-grupa-head', 'grupa województwa']]) {
  const re = new RegExp(sel.replace('.', '\\.') + ' \\{[^}]*(?:min-)?height: (\\d+)px');
  const m = css.match(re);
  ok(m && +m[1] >= 44, `${opis}: pole dotyku ≥ 44 px (${m ? m[1] : '—'})`);
}
ok(/@media \(prefers-reduced-motion: reduce\) \{ \.pp-strony, \.pp-tor/.test(css), 'bez animacji przy ograniczonym ruchu');
ok(/#panel\.pp-szeroki \{ width: 720px; \}/.test(css) && /const SZEROKI_PX = 1100;/.test(mod), 'szeroki ekran (≥ 1100 px): dwie kolumny');
ok(/body\.panel-open:has\(#panel\.pp-szeroki\) #map-actions \{ right: calc\(720px \+ 22px\); \}/.test(css), 'przyciski mapy nie wchodzą pod szeroki panel');

console.log('\n4. Teksty');
const t3 = [...mod.matchAll(/t3\(((?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*,\s*(?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*,\s*(?:"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`))\)/g)].length;
const wszystkie = [...mod.matchAll(/\bt3\(/g)].length;   // definicja „const t3 = (” do wzorca nie pasuje
ok(t3 === wszystkie && t3 > 20, `każdy tekst w trzech językach (${t3}/${wszystkie})`);
ok(!/[ąćęłńóśźż]/i.test(mod.match(/"Previous panel page"[^)]*/)?.[0] || ''), 'angielski bez polskich znaków (próbka)');

console.log(bledy ? `\nBLEDY: ${bledy}` : '\nWszystko OK');
process.exit(bledy ? 1 : 0);

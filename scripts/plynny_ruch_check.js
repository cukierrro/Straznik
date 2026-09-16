/* Płynne przejście ikony między meldunkami NEPTUN-a (app.js glidePosition, 1.7.53).
   Wołane z scripts/test_plynny_ruch.py; kod wyjścia 1 przy błędzie. */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "frontend", "app.js"), "utf8");
const pick = (start, end) => { const a = src.indexOf(start), b = src.indexOf(end, a); if (a < 0 || b < 0) throw new Error("brak " + start); return src.slice(a, b); };
const km = src.slice(src.indexOf("const kmBetween"), src.indexOf(";", src.indexOf("const kmBetween")) + 1);
const glide = pick("const GLIDE_MS", "let lastAnim");
const ctx = {};
new Function("ctx", km.replace("const kmBetween", "var kmBetween") + "\n" +
  glide.replace(/^const /gm, "var ").replace("function glidePosition", "var glidePosition = function glidePosition") +
  "\nctx.glidePosition = glidePosition; ctx.GLIDE_MS = GLIDE_MS;")(ctx);

let bad = 0;
const ok = (c, m) => { console.log((c ? "  OK   " : "  BŁĄD ") + m); if (!c) bad++; };
const T0 = 1_000_000;
const t = { id: "trk_1", lat: 51.0, lon: 24.0 };
let p = ctx.glidePosition(t, { lat: 51.0, lon: 24.0 }, T0);
ok(p.lat === 51.0 && !p.gliding, "pierwsze pojawienie — od razu w miejscu meldunku");
t.lat = 51.1; t.lon = 23.8;                                   // nowy meldunek ~17 km dalej
p = ctx.glidePosition(t, { lat: 51.1, lon: 23.8 }, T0 + 200);
ok(Math.abs(p.lat - 51.0) < 0.001 && p.gliding, "tuż po meldunku ikona startuje ze starej pozycji");
p = ctx.glidePosition(t, { lat: 51.1, lon: 23.8 }, T0 + 200 + ctx.GLIDE_MS / 2);
ok(p.lat > 51.03 && p.lat < 51.07, `w połowie przejścia jest w połowie drogi (${p.lat.toFixed(3)})`);
p = ctx.glidePosition(t, { lat: 51.1, lon: 23.8 }, T0 + 200 + ctx.GLIDE_MS + 10);
ok(Math.abs(p.lat - 51.1) < 1e-9 && !p.gliding, "po przejściu dokładnie w miejscu meldunku");
const T1 = T0 + 200 + ctx.GLIDE_MS + 10;
t.lat = 50.0; t.lon = 30.0;                                   // skok ~450 km (inny obiekt pod tym id)
p = ctx.glidePosition(t, { lat: 50.0, lon: 30.0 }, T1 + 200);
ok(Math.abs(p.lat - 50.0) < 1e-9, "skok ponad 80 km bez przejazdu przez pół mapy");
t.lat = 50.1; t.lon = 30.1;                                   // aplikacja w tle 10 min, potem nowy meldunek
p = ctx.glidePosition(t, { lat: 50.1, lon: 30.1 }, T1 + 200 + 600000);
ok(Math.abs(p.lat - 50.1) < 1e-9 && !p.gliding, "po powrocie z tła od razu w miejscu meldunku, bez dojazdu");
process.exit(bad ? 1 : 0);

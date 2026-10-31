// Boczne marginesy bezpieczne (31.10.2026).
// Aplikacja rysuje się pod wycięciami (viewport-fit=cover), a do 1.8.03 odsuwała treść tylko
// od góry i dołu. W poziomie wyspa iPhone'a i wycięcie aparatu Androida stoją przy lewej albo
// prawej krawędzi, a na rozłożonym iPhone Duo pasek stanu jest z prawej — przyciski i karty
// przy krawędzi wchodziły pod wcięcie. Pilnujemy: każdy element `position: fixed` dosunięty
// do boku stałą liczbą pikseli doliczają --safe-l / --safe-r.
// Uruchomienie: node scripts/test_boczne_marginesy.cjs
const fs = require("fs"), path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "frontend", "style.css"), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
let bledy = 0;
const sprawdz = (w, opis) => { console.log((w ? "  OK   " : "  BŁĄD ") + opis); if (!w) bledy++; };

sprawdz(/--safe-l:\s*max\(env\(safe-area-inset-left, 0px\), var\(--safe-area-inset-left, 0px\)\)/.test(css),
  "--safe-l z env i ze zmiennej Capacitora (jak --safe-t)");
sprawdz(/--safe-r:\s*max\(env\(safe-area-inset-right, 0px\), var\(--safe-area-inset-right, 0px\)\)/.test(css),
  "--safe-r z env i ze zmiennej Capacitora");

const gole = [];
let fixedZBokiem = 0;
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim().split("\n").pop().trim(), body = m[2];
  if (!/position\s*:\s*fixed/.test(body)) continue;
  for (const [, strona, wart] of body.matchAll(/(?<![-\w])(left|right)\s*:\s*([^;]+)/g)) {
    const v = wart.trim();
    if (/^(0|0px|auto|50%|100%)$/.test(v)) continue;
    fixedZBokiem++;
    const zmienna = strona === "left" ? "var(--safe-l)" : "var(--safe-r)";
    if (/^-?\d+(\.\d+)?px$/.test(v) || !v.includes(zmienna)) gole.push(`${sel} { ${strona}: ${v} }`);
  }
}
sprawdz(fixedZBokiem >= 10, `znaleziono elementy przy bokach (${fixedZBokiem}) — test widzi reguły`);
sprawdz(gole.length === 0, "boki elementów fixed doliczają margines bezpieczny" + (gole.length ? ": " + gole.join(" · ") : ""));

// pasek górny i dolny pasek zakładek — pełna szerokość, odsuwane wewnętrznym odstępem
sprawdz(/#topbar\s*\{[^}]*padding:\s*calc\(8px \+ var\(--safe-t\)\) calc\(14px \+ var\(--safe-r\)\) 8px calc\(14px \+ var\(--safe-l\)\)/.test(css),
  "górny pasek odsunięty od obu boków");
sprawdz(/#alarm-overlay\s*\{[^}]*padding:\s*18px calc\(18px \+ var\(--safe-r\)\) 18px calc\(18px \+ var\(--safe-l\)\)/.test(css),
  "pełnoekranowy alarm odsunięty od obu boków");

if (bledy) { console.log(`\nBŁĘDY: ${bledy}`); process.exit(1); }
console.log("\nOK — boczne marginesy bezpieczne");

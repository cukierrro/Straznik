// Lokalny serwer z danymi syntetycznymi: frontend/ + /api/* z dane.cjs.
// Używa go scripts/test_responsywnosc.cjs; ręcznie (podgląd w przeglądarce):
//   node scripts/responsywnosc/serwer.cjs 8640
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const dane = require("./dane.cjs");
const FRONT = path.resolve(__dirname, "..", "..", "frontend");
const TYPY = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg", ".geojson": "application/json" };
function serwer(port = 0) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      const json = (o) => { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(o)); };
      const teraz = Date.now();
      if (u.pathname === "/api/state") return json(dane.stan(teraz));
      if (u.pathname === "/api/history/bundle") return json(dane.paczkaHistorii(teraz));
      if (u.pathname === "/api/zones") return json({ type: "FeatureCollection", features: [] });
      if (u.pathname.startsWith("/api/")) return json({});
      let plik = path.normalize(path.join(FRONT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname)));
      if (!plik.startsWith(FRONT) || !fs.existsSync(plik) || fs.statSync(plik).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { "content-type": TYPY[path.extname(plik)] || "application/octet-stream" });
      fs.createReadStream(plik).pipe(res);
    });
    s.listen(port, "127.0.0.1", () => ok(s));
  });
}

module.exports = { serwer };
if (require.main === module) {
  serwer(Number(process.argv[2]) || 8640).then(s => console.log(`http://127.0.0.1:${s.address().port}/`));
}

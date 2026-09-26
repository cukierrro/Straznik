#!/usr/bin/env node
/*
 * Kontury dla mapy na widżecie ekranu głównego.
 *
 * Widżet Androida nie ma WebView, więc mapy nie rysuje silnik z aplikacji —
 * warstwa natywna rysuje ją sama po Canvasie. Pełne pliki geojson z frontendu
 * mają ~2 MB i 115 tys. punktów; parsowanie ich przy każdym odświeżeniu byłoby
 * marnotrawstwem, a na kafelku wielkości znaczka i tak nic by z tej dokładności
 * nie zostało. Ten skrypt raz, przy budowaniu, upraszcza je algorytmem
 * Douglasa-Peuckera i zapisuje w zwartym pliku binarnym.
 *
 *   node scripts/gen_widget_map.js
 *
 * Wynik: android-app/android/app/src/main/assets/widget_map.bin
 * Format (little endian): "SWM1", u8 liczba warstw, potem dla każdej warstwy
 * nazwa (u8 długość + bajty UTF-8), u16 liczba kształtów, a dla kształtu klucz
 * (u8 + UTF-8), u16 liczba pierścieni i w każdym u16 liczba punktów oraz pary
 * u16: (lon-12)*2000 i (lat-44)*4000 — dokładność ~55 m, aż nadto dla widżetu.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'frontend', 'assets');
const OUT = path.join(ROOT, 'android-app', 'android', 'app', 'src', 'main', 'assets', 'widget_map.bin');

const LON_OFF = 12, LON_SCALE = 2000, LAT_OFF = 44, LAT_SCALE = 4000;

/** Warstwy: plik, nazwa w wyniku, pole z kluczem, tolerancja uproszczenia (stopnie). */
const LAYERS = [
  { file: 'kraje-v2', name: 'kraje', key: 'iso', tol: 0.035 },
  { file: 'obwody-ua', name: 'obwody', key: 'oblast', tol: 0.03 },
  { file: 'wojewodztwa', name: 'woj', key: 'nazwa', tol: 0.012 },
];

/** Douglas-Peucker — zostawia punkty, które naprawdę zmieniają kształt. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, dist = tol;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      let d;
      if (len2 === 0) {
        d = Math.hypot(x - ax, y - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      }
      if (d > dist) { dist = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const chunks = [];
const push = b => chunks.push(b);
const u8 = n => { const b = Buffer.alloc(1); b.writeUInt8(n); push(b); };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(Math.max(0, Math.min(65535, n))); push(b); };
const str = s => { const b = Buffer.from(s, 'utf8'); u8(b.length); push(b); };

push(Buffer.from('SWM1', 'ascii'));
u8(LAYERS.length);

let totalIn = 0, totalOut = 0;
for (const layer of LAYERS) {
  const geo = JSON.parse(fs.readFileSync(path.join(SRC, layer.file + '.geojson'), 'utf8'));
  str(layer.name);
  u16(geo.features.length);
  for (const f of geo.features) {
    str(String(f.properties[layer.key] || ''));
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = [];
    for (const poly of polys) for (const ring of poly) {
      totalIn += ring.length;
      // tylko obrys zewnętrzny; dziury na kafelku i tak są niewidoczne
      const s = simplify(ring, layer.tol);
      if (s.length >= 4) rings.push(s);
    }
    u16(rings.length);
    for (const ring of rings) {
      totalOut += ring.length;
      u16(ring.length);
      for (const [lon, lat] of ring) {
        u16(Math.round((lon - LON_OFF) * LON_SCALE));
        u16(Math.round((lat - LAT_OFF) * LAT_SCALE));
      }
    }
  }
}

const out = Buffer.concat(chunks);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('punkty: ' + totalIn + ' → ' + totalOut
  + ' (' + (100 * totalOut / totalIn).toFixed(1) + '%), plik: ' + (out.length / 1024).toFixed(1) + ' KB');
console.log(path.relative(ROOT, OUT));

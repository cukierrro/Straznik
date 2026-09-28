/* Mapa rysuje obiekt TAM, GDZIE GO ZGŁOSZONO — nigdzie indziej.
 *
 * 28.09.2026, dron trk_00224274 pod Dorohuskiem. Karta obiektu mówiła
 * „odległość od granicy PL: 0,2", backend liczył 0,22 km POZA Polską, żaden
 * z 720 meldunków dnia nie wypadł nad Polską — a ikona z okręgiem ±4 km stała
 * 3 km w głębi kraju, nad Turką i Łysobykami. Ludzie nagrali to z ekranu i
 * rozeszło się jako „dron wleciał nad Polskę".
 *
 * Winna była predykcja (dead-reckoning): znacznik jechał ZMIERZONYM kursem
 * i prędkością nawet 18 km przed ostatni meldunek, przez 7 minut. Kurs drona
 * wynosił 183° (na południe), a granica pod Dorohuskiem odbija na wschód —
 * więc prosta na południe wchodziła nad Polskę. Zmierzone na archiwum dnia:
 * po 60 s znacznik był już 0,65 km w głębi Polski, po 7 min — 2,4 km.
 * NEPTUN to zgłoszenia ludzi, nie radar; pozycji, której nikt nie zgłosił,
 * nie wolno dorysowywać, a już na pewno nie po polskiej stronie granicy.
 *
 * Płynność ruchu została: glide przejeżdża ikoną między DWOMA PRAWDZIWYMI
 * meldunkami. Ten test sprawdza jedno i drugie na produkcyjnym `glidePosition`
 * i na prawdziwym torze z 28.09, przyłożonym do tego samego konturu Polski,
 * który rysuje mapa.
 *
 * Uruchomienie: node scripts/test_rysowana_pozycja.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend/app.js'), 'utf8');

/* ── 1. w kodzie nie ma już czego ekstrapolować ───────────────────────────── */
assert.doesNotMatch(app, /function predict\(/, 'predict() ma nie wrócić');
assert.doesNotMatch(app, /PREDICT_MAX/, 'stałe zasięgu predykcji mają nie wrócić');
assert.match(app, /const p = glidePosition\(t, \{ lat: t\.lat, lon: t\.lon \}, now\);/,
  'celem przejazdu jest sam meldunek, bez wyliczanki po drodze');
/* okrąg niepewności i ślad muszą wisieć na tej samej pozycji co ikona */
assert.match(app, /circleCoords\(p\.lat, p\.lon, uncKm\)/,
  'okrąg niepewności rysowany wokół pozycji rysowanej ikony');
console.log('OK: pozycja rysowana bierze się wprost z meldunku');

/* ── 2. produkcyjny glidePosition, prawdziwy tor, nasz kontur Polski ──────── */
const wytnij = (od, doo) => {
  const a = app.indexOf(od), b = app.indexOf(doo, a + 1);
  assert.ok(a >= 0 && b > a, `nie znalazłem wycinka ${od}`);
  return app.slice(a, b);
};
const ctx = {};
vm.createContext(ctx);
/* jeden skrypt, bo `const` z vm.runInContext nie przechodzi do następnego */
vm.runInContext([
  wytnij('const kmBetween =', '\nconst '),
  wytnij('const GLIDE_MS =', '\nlet lastAnim'),
  'globalThis.glidePosition = glidePosition;',
  'globalThis.glides = glides;',
  'globalThis.GLIDE_MS = GLIDE_MS;',
  'globalThis.GLIDE_MAX_KM = GLIDE_MAX_KM;',
].join('\n'), ctx);
assert.equal(ctx.GLIDE_MAX_KM, 80, 'próg przejazdu bez zmian');

const PL = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/assets/polska.geojson'), 'utf8'));
const ringi = [];
for (const f of PL.features) {
  const g = f.geometry;
  if (g.type === 'Polygon') ringi.push(g.coordinates[0]);
  else for (const p of g.coordinates) ringi.push(p[0]);
}
function wPolsce(lon, lat) {
  let w = false;
  for (const r of ringi) {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins;
    }
    if (ins) w = !w;
  }
  return w;
}

/* meldunki trk_00224274 z 28.09.2026 — dokładnie tak, jak przyszły z NEPTUN-a */
const MELDUNKI = [
  { t: '14:53:48', lat: 51.48211, lon: 23.85904 },
  { t: '15:01:48', lat: 51.20168, lon: 23.83250 },
  { t: '15:05:48', lat: 51.16555, lon: 23.82908 },
];
for (const m of MELDUNKI)
  assert.ok(!wPolsce(m.lon, m.lat), `meldunek ${m.t} był poza Polską (dane wejściowe)`);

/* Odtwarzamy pętlę rysowania: co 200 ms, tak jak animate(). */
const KLATKA = 180000 / 900;            // 200 ms
let zegar = Date.UTC(2026, 8, 28, 14, 53, 48);
let ile = 0, najglebiej = 0, poza = 0;
for (let i = 0; i < MELDUNKI.length; i++) {
  const m = MELDUNKI[i];
  const obiekt = { id: 'trk_00224274', lat: m.lat, lon: m.lon };
  const trwanie = i === 0 ? 8 * 60000 : i === 1 ? 4 * 60000 : 7 * 60000;
  for (let dt = 0; dt < trwanie; dt += KLATKA) {
    const p = ctx.glidePosition(obiekt, { lat: m.lat, lon: m.lon }, zegar + dt);
    ile++;
    if (wPolsce(p.lon, p.lat)) najglebiej++;
    else poza++;
  }
  zegar += trwanie;
}
assert.equal(najglebiej, 0,
  `pozycja rysowana weszła nad Polskę w ${najglebiej} z ${ile} klatek — a żaden meldunek tam nie był`);
console.log(`OK: ${poza} klatek przejazdu, ani jedna nad Polską`);

/* ── 3. przejazd nie wychodzi poza odcinek między meldunkami ──────────────── */
const a = MELDUNKI[1], b = MELDUNKI[2];
ctx.glides.clear();
let zegar2 = Date.UTC(2026, 8, 28, 15, 1, 48);
ctx.glidePosition({ id: 'x', lat: a.lat, lon: a.lon }, { lat: a.lat, lon: a.lon }, zegar2);
let maxOdchylka = 0;
for (let dt = 0; dt <= ctx.GLIDE_MS + 1000; dt += KLATKA) {
  const p = ctx.glidePosition({ id: 'x', lat: b.lat, lon: b.lon }, { lat: b.lat, lon: b.lon }, zegar2 + dt);
  /* odległość punktu od odcinka a–b, w km */
  const k = Math.cos((b.lat * Math.PI) / 180);
  const [x, y] = [p.lon * k, p.lat];
  const [x1, y1, x2, y2] = [a.lon * k, a.lat, b.lon * k, b.lat];
  const [dx, dy] = [x2 - x1, y2 - y1];
  const u = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const d = Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy)) * 111.32;
  if (d > maxOdchylka) maxOdchylka = d;
}
assert.ok(maxOdchylka < 0.01,
  `przejazd trzyma się odcinka między meldunkami (największe odchylenie ${maxOdchylka.toFixed(4)} km)`);
console.log(`OK: przejazd nie zbacza z odcinka (maks. ${(maxOdchylka * 1000).toFixed(1)} m)`);

console.log('\nOK: mapa rysuje obiekt tam, gdzie go zgłoszono');

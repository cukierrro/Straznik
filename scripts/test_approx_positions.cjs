#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');

const app = fs.readFileSync('frontend/app.js', 'utf8');
const engine = fs.readFileSync('frontend/engine.js', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');

assert.match(app, /source_metadata\?\.source_fields\?\.positionQuality/);
assert.match(app, /NEPTUN_LOCALITY_ANCHORS[\s\S]*?50\.7472[\s\S]*?25\.3254/);
assert.match(app, /function geoDistanceKm/);
assert.match(app, /locality_center/);
assert.match(app, /threatDistanceText/);
assert.match(app, /function etaInfo\(t\) \{\s*if \(isApproxPosition\(t\)\) return null;/);
assert.match(app, /function predict\(t, nowMs\) \{[\s\S]*?if \(isApproxPosition\(t\)\) return \{ lat, lon \};/);
assert.match(app, /function cleanTrail\(t\) \{\s*if \(isApproxPosition\(t\)\) return \[\];/);
assert.match(app, /isApproxPosition\(t\) \|\| !Places\?\.exactPoint/);
assert.match(app, /positionQuality: d\.position_quality/);

assert.match(engine, /const etaEligible = !approx && \w+\.heading_known/);
assert.match(engine, /NEPTUN_POSITION_MULT/);
assert.match(engine, /physical_key: physicalKey\(t\)/);
// 23.09.2026 (decyzja usera): czas dolotu liczymy TAKŻE dla pozycji rejonowej — bez niego
// klucz czerwonego alarmu nie miałby danych (sześć z siedmiu obiektów 23.09 było rejonowych).
// Sam ALARM z ETA nadal wymaga pozycji dokładnej — pilnuje tego etaEligible wyżej.
assert.match(engine, /const speed = speedOf\(t\), etaRaw/);
assert.match(engine, /eta_approx: approx/);
assert.match(engine, /position_quality: t\.positionQuality/);
// Parametr cache musi rosnąć z każdym wydaniem (Cloudflare trzyma /app.js 4 h),
// ale test nie może przypinać się do konkretnego numeru — sprawdzamy sam wzorzec.
assert.match(html, /engine\.js\?v=\d+\.\d+\.\d+/);
assert.match(html, /app\.js\?v=\d+\.\d+\.\d+/);

console.log('OK — pozycje przybliżone bez ETA, predykcji i pozornej trasy');

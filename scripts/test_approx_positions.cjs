#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');

const app = fs.readFileSync('frontend/app.js', 'utf8');
const engine = fs.readFileSync('frontend/engine.js', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');

assert.match(app, /source_metadata\?\.source_fields\?\.positionQuality/);
assert.match(app, /function etaInfo\(t\) \{\s*if \(isApproxPosition\(t\)\) return null;/);
assert.match(app, /function predict\(t, nowMs\) \{[\s\S]*?if \(isApproxPosition\(t\)\) return \{ lat, lon \};/);
assert.match(app, /function cleanTrail\(t\) \{\s*if \(isApproxPosition\(t\)\) return \[\];/);
assert.match(app, /isApproxPosition\(t\) \|\| !Places\?\.exactPoint/);
assert.match(app, /positionQuality: d\.position_quality/);

assert.match(engine, /const etaEligible = !approx && a\.heading_known/);
assert.match(engine, /const speed = approx \? null : speedOf\(t\)/);
assert.match(engine, /position_quality: t\.positionQuality/);
assert.match(html, /engine\.js\?v=1\.7\.20/);
assert.match(html, /app\.js\?v=1\.7\.20/);

console.log('OK — pozycje przybliżone bez ETA, predykcji i pozornej trasy');

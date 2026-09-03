const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const config = JSON.parse(read('android-app/capacitor.config.json'));
assert.equal(config.server.androidScheme, 'http');
assert.equal(config.server.cleartext, false);
assert.equal(config.android.allowMixedContent, false);
const xml = read('android-app/android/app/src/main/res/xml/network_security_config.xml');
assert.match(xml, /base-config cleartextTrafficPermitted="false"/);
assert.doesNotMatch(xml, /src="user"/);
assert.equal((xml.match(/<domain /g) || []).length, 1);
assert.match(xml, /<domain includeSubdomains="false">localhost<\/domain>/);
const js = read('frontend/app.js');
const fn = js.slice(js.indexOf('function validBackendUrl'), js.indexOf('function apiBase'));
const context = vm.createContext({URL});
vm.runInContext(fn, context);
for (const url of ['https://straznik.eu', 'https://example.org:8443/api'])
  assert.equal(context.validBackendUrl(url), true, url);
for (const url of ['http://localhost', 'http://example.org', 'javascript:alert(1)',
  '//example.org', 'https://user:pass@example.org', 'https://example.org?q=1',
  'https://example.org#fragment', 'not a URL'])
  assert.equal(context.validBackendUrl(url), false, url);
const saved = new Map([['straznik_api', 'http://example.org'], ['straznik_voiv', 'lubelskie']]);
Object.assign(context, {
  localStorage: {getItem: k => saved.get(k) || null}, IS_APP: true,
  location: {search: '', protocol: 'http:', origin: 'http://localhost'},
  DEFAULT_BACKEND: 'https://straznik.eu'
});
vm.runInContext(js.slice(js.indexOf('function apiBase'), js.indexOf('const TYPE_META')), context);
assert.equal(context.apiBase(), null);
assert.equal(saved.get('straznik_api'), 'http://example.org');
assert.equal(saved.get('straznik_voiv'), 'lubelskie');
saved.set('straznik_api', 'https://example.org/');
assert.equal(context.apiBase(), 'https://example.org');
saved.delete('straznik_api');
assert.equal(context.apiBase(), 'https://straznik.eu');
console.log('OK: source network policy, backend validation, preserved settings and defaults');

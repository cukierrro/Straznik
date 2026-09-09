// Offline only: no app imports, credentials, network, database or notifications.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const dir = path.join(__dirname, '../docs/aircraft-library');
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'preview-catalog.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'regression-cases.json'), 'utf8'));
const {selectPhoto} = require(path.join(dir, 'model-photo-preview.js'));
test('019 collision cannot select Chinese J-6', () => {
  const p = selectPhoto(fixtures.cases[0], catalog);
  assert.equal(p.id, 'pzl130'); assert.equal(p.src, 'assets/pzl130.jpg');
});
test('0543 alone cannot choose a subtype or museum MiG', () => {
  assert.equal(selectPhoto(fixtures.cases[1], catalog), null);
});
test('verified Z-242L selects model example regardless of registration', () => {
  for (const registration of ['0543', 'unrelated', '']) {
    assert.equal(selectPhoto({type:'Z42', registration, verifiedModelId:'z242l'}, catalog).id, 'z242l');
  }
});
test('unsupported Zlin variant does not fall back to another variant', () => {
  assert.equal(selectPhoto({type:'Z42', verifiedModelId:'z142c'}, catalog), null);
});
test('model/code contradiction is rejected', () => {
  assert.equal(selectPhoto({type:'PZ3T', verifiedModelId:'z242l'}, catalog), null);
});
test('unknown, empty and missing inputs have no photo', () => {
  for (const a of [null, {}, {type:'SB39'}, {type:'XXXX'}, {registration:'019'}]) assert.equal(selectPhoto(a, catalog), null);
});
test('normalization does not use fuzzy model matching', () => {
  assert.equal(selectPhoto({type:' pz3t '}, catalog).id, 'pzl130');
  assert.equal(selectPhoto({type:'PZ3T', verifiedModelId:'pzl130tc2'}, catalog), null);
});
test('empty explicit identity fails closed', () => {
  assert.equal(selectPhoto({type:'PZ3T', verifiedModelId:null}, catalog), null);
});
test('caption is explicit in PL and EN', () => {
  assert.match(selectPhoto({type:'PZ3T'}, catalog).caption, /nie przedstawia/);
  assert.match(selectPhoto({type:'PZ3T'}, catalog, 'en').caption, /Not a photo of the tracked/);
});
test('unreviewed, remote image and incomplete credit are rejected', () => {
  for (const patch of [{status:'unreviewed_candidate'}, {src:'https://example.org/019.jpg'}, {author:''}]) {
    const c = structuredClone(catalog); Object.assign(c.photos[0], patch);
    assert.equal(selectPhoto({type:'PZ3T'}, c), null);
  }
});
test('assets exist and carry source and license', () => {
  for (const p of catalog.photos) {
    assert.ok(fs.existsSync(path.join(dir,p.src)));
    assert.ok(p.sourceUrl.startsWith('https://commons.wikimedia.org/'));
    assert.ok(p.licenseUrl.startsWith('https://creativecommons.org/'));
  }
});
test('alternating cards does not reuse registration cache', () => {
  const sequence = [{type:'PZ3T',registration:'019'}, {type:'Z42',registration:'019',verifiedModelId:'z242l'}, {type:'Z42',registration:'019'}];
  assert.deepEqual(sequence.map(a=>selectPhoto(a,catalog)?.id || null), ['pzl130','z242l',null]);
});

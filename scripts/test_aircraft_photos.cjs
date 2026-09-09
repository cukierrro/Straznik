const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../frontend/aircraft-photo-catalog.js');
const {select,caption} = require('../frontend/aircraft-photos.js');
const root = path.join(__dirname,'..');
test('all 61 inventoried codes have an explicit outcome',()=>{
  const inv=JSON.parse(fs.readFileSync(path.join(root,'docs/aircraft-library/inventory.json')));
  assert.deepEqual(new Set([...Object.keys(catalog.photos),...Object.keys(catalog.blocked)]),new Set(inv.models.map(m=>m.type)));
});
test('all 60 approved assets and credits are valid and pinned',()=>{
  assert.equal(Object.keys(catalog.photos).length,60);
  for(const [code,p] of Object.entries(catalog.photos)){
    const b=fs.readFileSync(path.join(root,'frontend',p.src));
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'),p.sha256,code);
    assert.equal(b.readUInt16BE(0),0xffd8,code);
    assert.ok(p.author && p.license && p.sourceUrl.startsWith('https://commons.wikimedia.org/'),code);
    assert.ok(p.licenseUrl.startsWith('https://'),code);
    assert.equal(select({type:code,desc:p.model},catalog).model,p.model,code);
  }
});
test('code defaults are explicit; ambiguous models fail closed',()=>{
  for(const [type,p] of Object.entries(catalog.photos)) assert.equal(Boolean(select({type},catalog)),p.mode==='code',type);
});
test('registration collision 019 never returns J-6',()=>{
  assert.match(select({type:'PZ3T',reg:'019'},catalog).model,/PZL-130/);
  assert.equal(select({reg:'019'},catalog),null);
});
test('0543 needs correct hex, type and no contradictory description',()=>{
  const a={type:'Z42',reg:'0543',hex:'4984f4'};
  assert.equal(select(a,catalog).model,'Zlín Z-242L');
  for(const patch of [{hex:'123456'},{reg:'0557'},{type:'PZ3T',desc:'ZLIN Z-242L'},{desc:'MIG-15SB'}]) assert.equal(select({...a,...patch},catalog),null);
  assert.equal(select({type:'Z42',reg:'0543'},catalog),null);
});
test('critical aircraft families are not conflated',()=>{
  for(const a of [{type:'H60',desc:'SH-60 SEAHAWK'},{type:'SUCO',desc:'AH-1Z'},{type:'C30J',desc:'AC-130J GHOSTRIDER'}, {type:'E3CF',desc:'BOEING E-3C SENTRY'},{type:'B737',desc:'BOEING 737-800'}, {type:'FA7X',desc:'DASSAULT FALCON 8X'}]) assert.equal(select(a,catalog),null);
});
test('unknown and prototype keys are rejected',()=>{
  for(const type of ['UNKNOWN','SB39','__proto__','constructor','']) assert.equal(select({type},catalog),null);
});
test('captions distinguish a model example in both languages',()=>{
  const p=select({type:'PZ3T'},catalog);
  assert.match(caption(p,'pl'),/Nie jest to śledzona/);
  assert.match(caption(p,'en'),/Not the tracked/);
});
test('selection is deterministic and does not cache by registration',()=>{
  const arr=[{type:'PZ3T',reg:'019'},{type:'B737',reg:'019'},{type:'H60',reg:'019'}];
  assert.deepEqual(arr.map(p=>select(p,catalog)?.model||null),['PZL-130 Orlik','Boeing 737-700',null]);
});
test('production popup uses local selector and no registration photo API',()=>{
  const app=fs.readFileSync(path.join(root,'frontend/app.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
  assert.ok(!app.includes('api.planespotters.net/pub/photos/'));
  assert.ok(app.includes('acPhoto(p).then'));
  assert.ok(app.includes('img.onerror'));
  assert.ok(html.indexOf('aircraft-photo-catalog.js')<html.indexOf('src="app.js'));
  assert.ok(html.indexOf('aircraft-photos.js')<html.indexOf('src="app.js'));
});

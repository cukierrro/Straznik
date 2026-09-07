const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const js = fs.readFileSync('frontend/app.js', 'utf8');
const start = js.indexOf('function historicalAdsbGhosts');
const end = js.indexOf('\n\n/* Kolorowanie osi czasu', start);
const ctx = vm.createContext({Date, Map, Set, Math});
vm.runInContext(js.slice(start, end), ctx);
const now = Date.parse('2026-09-05T08:00:00Z');
const event = {ts:'2026-09-05T07:59:10Z', kind:'exit', hex:'14abcd', callsign:'SUM9125', lat:43.9, lon:25.1};
let out = ctx.historicalAdsbGhosts([event], [], now);
assert.equal(out.length, 1);
assert.equal(out[0].callsign, 'SUM9125');
assert.equal(out[0].historicalOnly, true);
assert.equal(out[0].foreign, true);
assert.equal(ctx.historicalAdsbGhosts([event], [{hex:'14abcd'}], now).length, 0);
assert.equal(ctx.historicalAdsbGhosts([{...event, ts:'2026-09-05T07:50:00Z'}], [], now).length, 0);
console.log('OK: ślad ADS-B wypełnia lukę migawki bez duplikatu i bez starego obiektu');
// Regression: SUM9125 was absent at 17:52:01; an event at 17:54:18
// must never be projected backwards onto that snapshot.
const selected = Date.parse('2026-09-07T17:52:01+02:00');
const serbia = {ts:'2026-09-07T17:54:18+02:00', kind:'enter', hex:'152c29',
  reg:'RA-76841', type:'IL76', lat:44.659098, lon:21.145265};
assert.equal(ctx.historicalAdsbGhosts([serbia], [], selected).length, 0,
  'Future SUM9125 observation leaked into 17:52 snapshot');
assert.equal(ctx.historicalAdsbGhosts([serbia], [], Date.parse('2026-09-07T17:56:00+02:00')).length, 1);
assert.equal(ctx.historicalAdsbGhosts([{...serbia,ts:'invalid'}], [], selected).length, 0);
const stamp = minute => Date.parse(`2026-09-07T17:${minute}:00+02:00`);
const exitEvent = {...serbia,kind:'exit',ts:'2026-09-07T17:55:20+02:00'};
for (const [minute, count] of [[52,0],[54,0],[56,1],[54,0],[52,0],[58,0]]) {
  const events = ctx.mergedWatchEvents([serbia,exitEvent],[],stamp(minute));
  assert.ok(events.every(e => e.t <= stamp(minute)));
  const ghosts = ctx.historicalAdsbGhosts(events, [], stamp(minute));
  assert.equal(ghosts.length,count,`Scrub at 17:${minute}`);
  if (count) assert.equal(ghosts[0].observedAt,Date.parse(exitEvent.ts));
}
const localCopy = {...serbia,t:Date.parse(serbia.ts)+1000};
assert.equal(ctx.mergedWatchEvents([serbia,exitEvent],[localCopy],stamp(56)).length,2);
assert.equal(ctx.mergedWatchEvents([serbia,serbia],[],stamp(56)).length,1);
assert.equal(ctx.mergedWatchEvents([],[localCopy],stamp(56)).length,1);
assert.equal(ctx.mergedWatchEvents([{...serbia,ts:'invalid'}],[],stamp(56)).length,0);
assert.equal(ctx.mergedWatchEvents([serbia],[],stamp(56)+13*3600000).length,0);
assert.equal(ctx.historicalAdsbGhosts([serbia],[{hex:'152c29'}],stamp(56)).length,0);
assert.equal(ctx.historicalAdsbGhosts([serbia],[],Date.parse(serbia.ts)+150001).length,0);
assert.equal(ctx.historicalAdsbGhosts([serbia],[],Date.parse(serbia.ts)+150000).length,1);
const engine = fs.readFileSync('frontend/engine.js','utf8');
vm.runInContext('const HISTORY_H=12, WINDOW_MIN=60; function accumulate(){return {}};'+
  engine.slice(engine.indexOf('function historyFrom('),engine.indexOf('\nfunction history(atIso)')),ctx);
const snaps=[{ts:new Date(stamp(54)).toISOString(),t:stamp(54)},{ts:new Date(stamp(52)).toISOString(),t:stamp(52)}];
assert.equal(ctx.historyFrom(snaps,[],new Date(stamp(50)).toISOString()).snapshot,null);
assert.equal(ctx.historyFrom(snaps,[],new Date(stamp(56)).toISOString()).snapshot.t,stamp(54));
console.log('OK: forward/backward replay, timestamps, expiry, server/local dedup, fallback, unsorted snapshots, no future snapshot');

// Execute actual frontend functions against isolated mocks, no network or push.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app.js'), 'utf8');
const extract = (a,b) => src.slice(src.indexOf(a), src.indexOf(b));
async function main() {
  const calls = [];
  let tick, reachable = false, alarm = false;
  const c = vm.createContext({
    console, localStorage: {getItem: () => null},
    apiBase: () => 'https://straznik.eu', applyState: () => {},
    connBadge: {classList: {add(){}, remove(){}}, style: {}},
    Engine: {start: () => calls.push('start'), stop: () => calls.push('stop')},
    setTimeout: fn => { fn(); },
    setInterval: fn => {tick = fn; return 1;}, clearInterval: () => calls.push('clear'),
    probeBackend: async () => {calls.push('probe'); return reachable;},
    pingBackend: async () => reachable,
    openBackendWs: () => calls.push('ws'), pollOnce: () => calls.push('poll'),
    document: {getElementById: () => ({classList: {contains: () => !alarm}})},
    validBackendUrl: () => true
  });
  vm.runInContext('let standalone=false, srvSnaps=[], srvSigs=[], srvSeeded=false;\n' +
    extract('async function connect()', '/* Lekki ping serwera'), c);
  await c.connect();
  assert.equal(calls.filter(x=>x==='probe').length, 4);
  assert.equal(calls.filter(x=>x==='start').length, 1);
  await tick();
  assert.equal(calls.includes('stop'), false);
  reachable = true; alarm = true;
  await tick();
  assert.equal(calls.includes('stop'), false, 'Do not interrupt an alarm');
  alarm = false;
  await tick();
  assert.deepEqual(calls.slice(-4), ['clear', 'stop', 'ws', 'poll']);
  assert.equal(vm.runInContext('standalone', c), false);
  console.log('OK: four retries, fallback, offline retry, alarm guard, stop engine before reconnect');
}
main().catch(e => {console.error(e); process.exitCode=1;});

// Zrywany WebSocket (sieć firmowa, 17.09.2026): ile połączeń i odpytań w 10 min na kartę.
// Uruchomienie: node scripts/test_ws_zrywane.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app.js'), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

function simulate(lifetimeMs) {
  let now = 0, seq = 0;
  const timers = [];
  const counts = { ws: 0, poll: 0 };
  const ctx = {
    console, Math, Date: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const id = ++seq; const tick = () => { fn(); timers.push({ id, at: now + ms, fn: tick }); };
                               timers.push({ id, at: now + ms, fn: tick }); return id; },
    clearInterval: (id) => { for (let i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1); },
    connBadge: { textContent: '', classList: { add() {}, remove() {} } },
    UI: { isEn: false }, apiBase: () => 'https://straznik.eu', applyState() {},
    pollOnce: () => { counts.poll++; },
    WebSocket: class {
      constructor() {
        counts.ws++;
        ctx.setTimeout(() => {
          this.onopen && this.onopen();
          if (lifetimeMs != null) ctx.setTimeout(() => this.onclose && this.onclose({ code: 1006 }), lifetimeMs);
        }, 200);
      }
      close() {}
    },
  };
  vm.createContext(ctx);
  vm.runInContext(cut('let ws = null, wsRetry = 1;', 'let standalone = false;')
    + 'let standalone = false;\n'
    + cut('function openBackendWs(base)', '\nfunction scheduleReconnect()')
    + cut('function scheduleReconnect()', 'pollOnce();\n}') + 'pollOnce();\n}\nopenBackendWs("https://straznik.eu");', ctx);
  while (timers.length) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers.shift();
    if (t.at > 10 * 60000) break;
    now = t.at;
    t.fn();
  }
  return counts;
}

const broken = simulate(1000);        // proxy zrywa połączenie po 1 s
const stable = simulate(null);        // połączenie trwa
console.log('zrywane po 1 s, 10 min:', broken, '| stabilne:', stable);
assert.equal(stable.ws, 1, 'stabilne połączenie: jedno połączenie');
assert.ok(broken.ws <= 20, `zrywane: najwyżej ~20 prób WS w 10 min (było ${broken.ws}; przed poprawką kilkaset)`);
assert.ok(broken.poll <= 150, `zrywane: odpytywanie co kilka sekund, nie co sekundę (${broken.poll})`);
assert.ok(broken.poll >= 60, `zrywane: mapa dalej się odświeża (${broken.poll} odpytań)`);
console.log('OK: zrywany WebSocket przechodzi na odpytywanie, bez szturmu na serwer');

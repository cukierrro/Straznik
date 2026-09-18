// Zrywany WebSocket (sieć firmowa, 17.09.2026): ile połączeń i odpytań w 10 min na kartę.
// Uruchomienie: node scripts/test_ws_zrywane.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app.js'), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

function simulate(lifetimeMs, mode = 'open') {
  let now = 0, seq = 0;
  const timers = [];
  const counts = { ws: 0, poll: 0, badge: '' };
  const ctx = {
    console, Math, Date: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const id = ++seq; const tick = () => { fn(); timers.push({ id, at: now + ms, fn: tick }); };
                               timers.push({ id, at: now + ms, fn: tick }); return id; },
    clearInterval: (id) => { for (let i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1); },
    connBadge: { set textContent(v) { counts.badge = v; }, get textContent() { return counts.badge; },
                 hidden: true,
                 classList: { add() { ctx.connBadge.hidden = true; }, remove() { ctx.connBadge.hidden = false; },
                              contains: (c) => c === 'hidden' && ctx.connBadge.hidden } },
    UI: { isEn: false }, apiBase: () => 'https://straznik.eu', applyState() {},
    pollOnce: () => { counts.poll++; },
    WebSocket: class {
      constructor() {
        counts.ws++;
        ctx.setTimeout(() => {
          // serwer z pełnym limitem: dawniej 403 przed otwarciem, teraz otwarcie i 1013
          if (mode === 'reject') return this.onerror && this.onerror({});
          this.onopen && this.onopen();
          if (mode === '1013') return this.onclose && this.onclose({ code: 1013 });
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

// 17.09.2026, syreny w Lublinie: limit 3000 pełny, serwer odmawiał przed otwarciem (HTTP 403)
const rejected = simulate(null, 'reject');
const busy = simulate(null, '1013');
console.log('odmowa przed otwarciem:', rejected, '| 1013 po otwarciu:', busy);
assert.ok(rejected.ws <= 40, `odmowa przed otwarciem: bez szturmu (${rejected.ws} prób w 10 min; przed poprawką ~70)`);
assert.ok(rejected.poll >= 60, `odmowa przed otwarciem: mapa odświeżana odpytywaniem (${rejected.poll})`);
assert.ok(busy.ws <= 12, `1013: próba WebSocketu co 1–2 min (${busy.ws})`);
assert.ok(busy.poll >= 60, `1013: odpytywanie co kilka sekund (${busy.poll})`);
for (const [name, c] of [['odmowa', rejected], ['1013', busy]])
  assert.match(c.badge, /duży ruch/, `${name}: napis „duży ruch”, nie „brak połączenia” (${c.badge})`);
console.log('OK: zajęty serwer = odpytywanie i napis „duży ruch”, bez straszenia awarią');

// Pasek „NEPTUN nie odpowiada od …” (17.10.2026, decyzja usera).
// Tego dnia NEPTUN leżał 16 minut; mapa pokazywała obiekty sprzed awarii, a jedynym
// sygnałem była czerwona dioda. Obiekty zostają (pusta mapa = fałszywy spokój),
// pasek wyjaśnia, od kiedy dane stoją. Krótkie przerwy nie pokazują nic.
//
// Uruchomienie: node scripts/test_pasek_neptun.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const APP = fs.readFileSync('frontend/app.js', 'utf8');
const m = /const NEPTUN_DOWN_BADGE_MS[\s\S]*?\r?\nfunction renderNeptunBadge\(\) \{[\s\S]*?\r?\n\}\r?\n/.exec(APP);

function srodowisko(stan, { connVisible = false, teraz = Date.parse('2026-10-17T09:10:00Z') } = {}) {
  const klasy = (ukryty) => {
    const s = new Set(ukryty ? ['hidden'] : []);
    return { contains: c => s.has(c), add: c => s.add(c), remove: c => s.delete(c) };
  };
  const badge = { textContent: '', classList: klasy(true) };
  const ogloszenia = [];
  const ctx = vm.createContext({
    state: stan, histMode: false, Number, Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [teraz])); }
      static now() { return teraz; }
    },
    document: { getElementById: id => (id === 'src-badge' ? badge : null) },
    connBadge: { classList: klasy(!connVisible) },
    UI: { t: (pl) => pl }, a11yInfo: {}, powiedz: (_el, t) => ogloszenia.push(t),
  });
  vm.runInContext(m[0] + '\nthis.render = renderNeptunBadge;', ctx);
  return { ctx, badge, ogloszenia, setNow: (t) => { teraz = t; } };
}
const sek = (iso) => Date.parse(iso) / 1000;

test('funkcja paska jest w app.js', () => assert.ok(m, 'nie znalazłem renderNeptunBadge'));

test('NEPTUN leży od 11:00 (09:00 UTC) — po 10 min pasek z godziną', () => {
  const { ctx, badge, ogloszenia } = srodowisko({ health: { neptun: false },
    neptun: { status: { last_msg: sek('2026-10-17T09:00:17Z') } } });
  ctx.render();
  assert.equal(badge.classList.contains('hidden'), false);
  assert.match(badge.textContent, /NEPTUN nie odpowiada od \d\d:\d\d/);
  assert.equal(ogloszenia.length, 1, 'czytnik ekranu słyszy pasek raz');
  ctx.render();
  assert.equal(ogloszenia.length, 1, 'kolejne odświeżenie nie powtarza komunikatu');
});

test('krótka przerwa (60 s) — bez paska', () => {
  const { ctx, badge } = srodowisko({ health: { neptun: false },
    neptun: { status: { last_msg: sek('2026-10-17T09:09:00Z') } } });
  ctx.render();
  assert.equal(badge.classList.contains('hidden'), true);
});

test('NEPTUN działa — pasek znika', () => {
  const { ctx, badge } = srodowisko({ health: { neptun: false },
    neptun: { status: { last_msg: sek('2026-10-17T09:00:17Z') } } });
  ctx.render();
  assert.equal(badge.classList.contains('hidden'), false);
  ctx.state = { health: { neptun: true }, neptun: { status: { last_msg: sek('2026-10-17T09:09:59Z') } } };
  ctx.render();
  assert.equal(badge.classList.contains('hidden'), true);
});

test('brak połączenia z naszym serwerem — mówi plakietka połączenia, nie pasek', () => {
  const { ctx, badge } = srodowisko({ health: { neptun: false },
    neptun: { status: { last_msg: sek('2026-10-17T09:00:17Z') } } }, { connVisible: true });
  ctx.render();
  assert.equal(badge.classList.contains('hidden'), true);
});

test('tryb bez serwera (brak last_msg) — 2 min od zauważenia awarii', () => {
  const t0 = Date.parse('2026-10-17T09:10:00Z');
  const s = srodowisko({ health: { neptun: false }, neptun: { status: {} } }, { teraz: t0 });
  s.ctx.render();
  assert.equal(s.badge.classList.contains('hidden'), true, 'od razu nic');
  s.setNow(t0 + 121000);
  s.ctx.render();
  assert.equal(s.badge.classList.contains('hidden'), false, 'po 2 min pasek');
  assert.match(s.badge.textContent, /NEPTUN nie odpowiada/);
});

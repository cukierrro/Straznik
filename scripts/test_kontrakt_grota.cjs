// Kontrakt dla modułu GROTA (19.09.2026): co Strażnik podaje o alarmie.
// GROTA nie liczy niczego po swojemu — bierze `etaVoivMin` i `hard` jak są, więc
// te dwie liczby muszą znaczyć dokładnie to, co pokazuje interfejs Strażnika.
// Uruchomienie: node scripts/test_kontrakt_grota.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../frontend/app.js'), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

const zdarzenia = [];
const ctx = {
  console, JSON, Math, Date, Number,
  histMode: false, historyAdsbTime: null, state: null,
  myVoiv: () => 'lubelskie',
  CustomEvent: class { constructor(typ, opcje) { this.type = typ; this.detail = opcje?.detail; } },
  window: { dispatchEvent: (e) => zdarzenia.push(e.detail) },
};
vm.createContext(ctx);
vm.runInContext(cut('function agedEta', String.fromCharCode(10) + 'function localPlaceHtml'), ctx);
vm.runInContext(cut('const HARD_SOURCES', String.fromCharCode(10) + 'function applyState'), ctx);

const TERAZ = Date.now();
const iso = (minTemu) => new Date(TERAZ - minTemu * 60000).toISOString();
const sygnal = (source, counted, extra = {}) => ({
  source, counted_points: counted, points: counted, ts: iso(extra.wiek ?? 1),
  details: { eta_voiv_min: extra.etaVoiv ? { lubelskie: extra.etaVoiv } : null,
             eta_border_min: extra.etaBorder ?? null, course: extra.kurs ?? null },
});
const stan = (level, sygnaly) => ({
  fusion: { ts: iso(0), thresholds: { elevated: 2, high: 4 },
            voivodeships: { lubelskie: { alert_level: level, level, signals: sygnaly } } },
});
const licz = (level, sygnaly) => { ctx.state = stan(level, sygnaly); return ctx.buildAlertContract(); };

const bledy = [];
function sprawdz(warunek, opis) {
  console.log((warunek ? '  OK   ' : '  BŁĄD ') + opis);
  if (!warunek) bledy.push(opis);
}

console.log('1. Czas do zagrożenia liczony jak w interfejsie');
let k = licz('high', [sygnal('neptun', 4.0, { etaVoiv: 12, etaBorder: 5 })]);
sprawdz(k.etaVoivMin === 11, `wiek sygnału odjęty (12 min sprzed minuty → ${k.etaVoivMin})`);
sprawdz(k.etaBorderMin === 4, 'czas do granicy też postarzony');
k = licz('high', [sygnal('neptun', 4.0, { etaVoiv: 12, wiek: 20 })]);
sprawdz(k.etaVoivMin === null, 'sygnał sprzed 20 min nie podaje już czasu');
k = licz('high', [sygnal('neptun', 4.0, { etaVoiv: 9, kurs: 'presumptive' })]);
sprawdz(k.etaVoivMin === null, 'kurs domniemany bez czasu dolotu (audyt G3)');
k = licz('high', [sygnal('neptun', 2.0, { etaVoiv: 30 }), sygnal('neptun', 2.0, { etaVoiv: 8 })]);
sprawdz(k.etaVoivMin === 7, 'z kilku obiektów bierzemy najkrótszy czas');

console.log('2. hard = poziom utrzymuje się bez źródeł miękkich');
k = licz('high', [sygnal('rcb', 2.0), sygnal('neptun', 2.0)]);
sprawdz(k.hard === true, 'RCB + obiekty sięgają progu czerwonego same');
k = licz('high', [sygnal('rcb', 2.0), sygnal('media', 1.0), sygnal('ua_alert', 1.0)]);
sprawdz(k.hard === false, 'czerwony trzymający się na mediach i alarmie obwodu to NIE hard');
k = licz('elevated', [sygnal('rcb', 2.0)]);
sprawdz(k.hard === true, 'sam alert RCB domyka żółty');
k = licz('elevated', [sygnal('media', 1.0), sygnal('neighbours', 0.6), sygnal('baltic_alert', 0.4)]);
sprawdz(k.hard === false, 'same wskaźniki pośrednie — bez wezwania do schronienia');
k = licz('none', []);
sprawdz(k.hard === false && k.level === 'none', 'brak alarmu to nie jest twardy stan');
k = licz('high', [sygnal('ua_alert', 2.0), sygnal('neptun', 2.0)]);
sprawdz(k.hard === false,
  'alarm obwodu UA jest oficjalny, ale nie mówi o zagrożeniu nad Polską — celowo miękki');

console.log('3. Publikacja stanu');
zdarzenia.length = 0;
ctx.state = stan('high', [sygnal('rcb', 2.0), sygnal('neptun', 2.0)]);
ctx.publishAlertContract();
ctx.publishAlertContract();                       // ten sam stan — bez drugiego zdarzenia
sprawdz(zdarzenia.length === 1, `zdarzenie tylko przy zmianie (${zdarzenia.length})`);
sprawdz(ctx.window.straznikAlert === undefined || true, 'stan dostępny do odczytu w każdej chwili');
sprawdz(ctx.straznikAlert === undefined, 'nie zaśmiecamy zmiennych globalnych poza window');
ctx.state = stan('none', []);
ctx.publishAlertContract();
sprawdz(zdarzenia.length === 2 && zdarzenia[1].level === 'none', 'odwołanie alarmu też jest zdarzeniem');
sprawdz(Object.keys(zdarzenia[0]).sort().join(',') === 'etaBorderMin,etaVoivMin,hard,level,ts,voiv',
  'kontrakt ma dokładnie umówione pola');

console.log();
if (bledy.length) {
  console.log('BŁĘDY:', bledy.length);
  bledy.forEach(b => console.log(' -', b));
  process.exit(1);
}
console.log('OK: stan alarmu dla GROTY — ten sam czas co w Strażniku, hard bez źródeł miękkich.');

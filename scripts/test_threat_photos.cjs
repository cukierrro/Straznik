const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'frontend/app.js'), 'utf8');
const context = { esc2: value => String(value), CONF_PL: {}, compass: () => '',
  markSelected: () => {},            // podświetlenie na mapie — poza zakresem tego testu
  showCard: html => { context.html = html; } };
context.window = {};
vm.createContext(context);
vm.runInContext(code.slice(code.indexOf('const TYPE_META ='), code.indexOf('const threatLabelPL')) + '\nglobalThis.photos = THREAT_PHOTOS;', context);
vm.runInContext(code.slice(code.indexOf('function openThreatPopup('), code.indexOf('/* Karta samolotu')), context);
for (const type of ['uav', 'recon', 'shahed', 'missile', 'cruise', 'kab', 'ballistic', 'fpv', 'mig31k']) {
  const photo = context.photos[type];
  assert.ok(photo.file.endsWith('-ai.png'));
  const bytes = fs.readFileSync(path.join(root, 'frontend/assets/threats', photo.file));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${type}: valid PNG`);
  context.openThreatPopup(null, { type });
  assert.ok(context.html.includes('Ilustracja poglądowa wygenerowana przez AI'));
  assert.ok(context.html.includes('Nie przedstawia śledzonego obiektu'));
  assert.ok(!context.html.includes('commons.wikimedia.org'));
}
assert.equal(context.photos.unknown, undefined);

// Werdykt kursu w karcie obiektu musi mówić to samo co lista sygnałów: obiekt
// lecący w bok ma jawne „0 pkt" z powodem, a nie same stopnie kursu.
context.openThreatPopup(null, { type: 'uav', toward_pl: false, heading_known: true, course_off: 86 });
assert.ok(context.html.includes('0 pkt'), 'karta obiektu bez punktów musi pokazać 0 pkt');
assert.ok(context.html.includes('86° od kierunku na Polskę'), 'i podać, o ile kurs mija Polskę');
context.openThreatPopup(null, { type: 'uav', toward_pl: false, heading_known: false });
assert.ok(context.html.includes('kurs nieznany'), 'nieznany kurs ma być nazwany wprost');
context.openThreatPopup(null, { type: 'uav', toward_pl: true, course_off: 12 });
assert.ok(context.html.includes('kurs na Polskę'), 'obiekt kursem na PL ma to napisane');
assert.ok(!context.html.includes('0 pkt'), 'obiekt kursem na PL nie może się ogłaszać jako zerowy');

console.log('OK: 9 typów/aliasów, PNG AI, jawne oznaczenie ilustracji, werdykt kursu w karcie');

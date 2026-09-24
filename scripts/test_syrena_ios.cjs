// Na iPhonie syrenę odtwarza część NATYWNA — strona nie może tworzyć własnej.
//
// 24.09.2026: próba odblokowania wyciszenia przez ustawianie AVAudioSession z wtyczki
// nie działała. Zmierzone na urządzeniu: muzyka w innej aplikacji ścisza się przy OBU
// poziomach — także przy żółtym, który o zmianę sesji w ogóle nie prosi — więc sesją
// audio dla Web Audio w WKWebView steruje WebKit, nie aplikacja. Syrena gra teraz
// z AVAudioPlayer w kategorii `playback` (alarm_syrena.wav w pętli), a strona ma się
// na iOS powstrzymać: inaczej przy NIEwyciszonym telefonie grałyby dwie naraz.
//
// Czego pilnuje ten test:
//   * na iOS airRaidSiren() nie tworzy oscylatorów ani AudioContextu,
//   * na Androidzie tworzy je nadal,
//   * obie platformy proszą o sesję i ją zwalniają (to ona włącza i wyłącza syrenę
//     natywną), a stopSiren() zwalnia ją TAKŻE gdy nie ma węzłów Web Audio,
//   * tryb testowy sam się kończy na obu — na iOS ten timeout jest jedynym, co
//     zatrzymuje natywną pętlę, i musi trwać tyle samo co dotąd.
//
// Czego ten test NIE sprawdza i sprawdzić nie może: czy część natywna naprawdę
// ma metodę `dzwiekAlarmu`. Capacitor 8 podstawia pod `Plugins.X` proxy zwracające
// funkcję dla dowolnej nazwy, więc żaden warunek `typeof … === "function"` tego nie
// wykryje — próba takiego strażnika 24.09.2026 była martwym kodem i została
// wycofana. Build iOS bez metody natywnej dałby alarm BEZ DŹWIĘKU; to warunek do
// sprawdzenia po stronie sesji iOS przed zgłoszeniem, nie tutaj.
//
// Uruchomienie: node scripts/test_syrena_ios.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.resolve(__dirname, '..', 'frontend/app.js'), 'utf8');

/* Wycinamy funkcję z app.js po klamrach — bez uruchamiania całego pliku, który
   potrzebuje DOM-u i mapy. Dzięki temu test czyta PRODUKCYJNY kod, nie kopię. */
function funkcja(nazwa) {
  const start = APP.indexOf(`function ${nazwa}(`);
  assert.notEqual(start, -1, `nie znalazłem ${nazwa} w app.js`);
  let glebokosc = 0;
  for (let i = start; i < APP.length; i++) {
    if (APP[i] === '{') glebokosc++;
    else if (APP[i] === '}' && --glebokosc === 0) return APP.slice(start, i + 1);
  }
  throw new Error(`niedomknięta funkcja ${nazwa}`);
}

function uruchom({ ios, tryb }) {
  const log = [];
  const ctxKontekst = vm.createContext({
    IS_IOS: ios, console,
    SIREN_UP: 2.0, SIREN_DOWN: 2.0, SIREN_LO: 380, SIREN_HI: 860, SIREN_GAIN: 0.62,
    sirenNodes: null, sirenTimer: null, vibrateTimer: null,
    log,
    navigator: { vibrate: () => log.push('wibracja') },
    setInterval: () => { log.push('interval'); return 1; },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { log.push('timeout:' + ms); fn(); return 1; },
    ctx: () => {
      log.push('audiocontext');
      const brak = () => {};
      return {
        currentTime: 0, destination: {},
        createOscillator: () => (log.push('oscylator'), {
          type: '', frequency: { setValueAtTime: brak, exponentialRampToValueAtTime: brak },
          connect: brak, start: brak, stop: brak }),
        createGain: () => ({ connect: brak, gain: { value: 0, setValueAtTime: brak,
          exponentialRampToValueAtTime: brak, cancelScheduledValues: brak } }),
        createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect: brak }),
      };
    },
    sesjaAudioAlarmu: (w) => log.push('sesja:' + w),
    scheduleSirenSweeps: (_o, od, cykli) => od + cykli * 4,
    BG: () => ({ dzwiekAlarmu: () => {} }),
  });
  vm.runInContext(
    `${funkcja('airRaidSiren')}\n${funkcja('stopSiren')}`,
    ctxKontekst);
  vm.runInContext(`airRaidSiren(${tryb === 'ciagly'})`, ctxKontekst);
  return { log, stan: () => ctxKontekst.sirenNodes };
}

test('iOS: strona nie tworzy własnej syreny', () => {
  const { log } = uruchom({ ios: true, tryb: 'ciagly' });
  assert.ok(!log.includes('oscylator'), 'na iOS nie wolno tworzyć oscylatorów — grałyby dwie syreny');
  assert.ok(!log.includes('audiocontext'), 'na iOS nie ruszamy nawet AudioContextu');
  assert.ok(log.includes('sesja:true'), 'część natywna musi dostać polecenie włączenia');
});

test('Android: syrena nadal syntezowana w stronie', () => {
  const { log } = uruchom({ ios: false, tryb: 'ciagly' });
  assert.ok(log.includes('oscylator'), 'na Androidzie syrena zostaje w Web Audio');
  assert.ok(log.includes('interval'), 'i dokłada kolejne cykle');
});

test('wibracja zostaje na obu platformach', () => {
  for (const ios of [true, false])
    assert.ok(uruchom({ ios, tryb: 'ciagly' }).log.includes('wibracja'), `ios=${ios}`);
});

test('tryb testowy kończy się sam, tak samo długo na obu', () => {
  const oczekiwany = 'timeout:' + (3 * (2.0 + 2.0) * 1000 + 200);   // 12200 ms
  for (const ios of [true, false]) {
    const { log } = uruchom({ ios, tryb: 'test' });
    assert.ok(log.includes(oczekiwany), `ios=${ios}: brak ${oczekiwany} w ${log.join(', ')}`);
    // sesja:false po sesja:true — na iOS to JEDYNE, co zatrzymuje natywną pętlę
    assert.ok(log.lastIndexOf('sesja:false') > log.indexOf('sesja:true'),
      `ios=${ios}: test musi zwolnić sesję audio`);
  }
});

test('stopSiren zwalnia sesję także bez węzłów Web Audio', () => {
  // Tak wygląda iOS zawsze: sirenNodes nigdy nie powstaje, a mimo to trzeba
  // powiedzieć części natywnej „wyłącz".
  const log = [];
  const kontekst = vm.createContext({
    sirenNodes: null, sirenTimer: null, vibrateTimer: null,
    navigator: { vibrate: () => {} }, clearInterval: () => {},
    sesjaAudioAlarmu: (w) => log.push('sesja:' + w),
  });
  vm.runInContext(funkcja('stopSiren'), kontekst);
  vm.runInContext('stopSiren()', kontekst);
  assert.deepEqual(log, ['sesja:false']);
});

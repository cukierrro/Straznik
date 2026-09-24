// Sygnał uwagi (żółty) NIGDY nie może być głośniejszy od syreny alarmu (czerwony).
//
// 24.09.2026, zgłoszenia czytelników („żółty budzi w nocy”) i pomiar: przy wzmocnieniu
// 0,55 żółty gong miał −5,8 dBFS RMS, a syrena −10,1 — czyli sygnał uwagi był o 4 dB
// GŁOŚNIEJSZY od alarmu, choć w otwartej aplikacji oba grają na tym samym strumieniu
// multimediów. Wzięło się to z poprawki „czerwony jest za cichy”, która przestrzeliła
// w drugą stronę (0,40 → 0,55). Ten test pilnuje, żeby to się nie powtórzyło.
//
// Sprawdzamy DWA światy, bo mają różne poziomy i to jest zamierzone:
//   * otwarta aplikacja — synteza Web Audio ze stałych w frontend/app.js,
//   * zgaszony ekran — pliki WAV z res/raw (żółty na strumieniu powiadomień,
//     czerwony na strumieniu alarmów, więc tam wyrównane; patrz build_sounds.py).
//
// UWAGA: od 24.09.2026 iPhone wychodzi spod tej hierarchii — syrenę odtwarza tam
// część natywna (alarm_syrena.wav przez AVAudioPlayer), a nie Web Audio, żeby
// przebić przełącznik wyciszenia. Poniższe porównanie dotyczy Androida i strony.
// Żółty sygnał uwagi zostaje w Web Audio na wszystkich platformach.
//
// Uruchomienie: node scripts/test_glosnosc_alarmow.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'frontend/app.js'), 'utf8');
const RAW = path.join(ROOT, 'android-app/android/app/src/main/res/raw');

/* Stałe czytamy z kodu, a nie przepisujemy — inaczej test potwierdzałby sam siebie. */
function stala(nazwa) {
  const m = new RegExp(`\\b${nazwa}\\s*=\\s*([0-9]*\\.?[0-9]+)`).exec(APP);
  assert.ok(m, `nie znalazłem stałej ${nazwa} w frontend/app.js`);
  return parseFloat(m[1]);
}
const CHIME_GAIN = stala('CHIME_GAIN');
const CHIME_OCTAVE_MIX = stala('CHIME_OCTAVE_MIX');
const SIREN_GAIN = stala('SIREN_GAIN');

const SR = 48000;
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const dB = (a, b) => 20 * Math.log10(a / b);

/* Odwzorowanie attentionChime(): 6 tonów, fala prostokątna + sinus oktawę wyżej. */
function zolty(gain) {
  const SEQ = [740, 988, 740, 988, 740, 988], DUR = 0.34, GAP = 0.06, out = [];
  for (const f of SEQ) {
    const n = Math.round(DUR * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = t < 0.015 ? gain * (t / 0.015)
        : t > DUR - 0.08 ? gain * Math.max(0, (DUR - t) / 0.08) : gain;
      const sq = (f * t) % 1 < 0.5 ? 1 : -1;
      out.push(env * (sq + CHIME_OCTAVE_MIX * Math.sin(2 * Math.PI * 2 * f * t)));
    }
    for (let i = 0; i < Math.round(GAP * SR); i++) out.push(0);
  }
  return out;
}

/* Odwzorowanie airRaidSiren(): piła 380↔860 Hz przez dolnoprzepustowy 2200 Hz. */
function czerwony(sek = 8) {
  const LO = 380, HI = 860, UP = 2, DOWN = 2, n = Math.round(sek * SR), out = [];
  const a = Math.exp(-2 * Math.PI * 2200 / SR);
  let ph = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const u = (i / SR) % (UP + DOWN);
    const f = u < UP ? LO * Math.pow(HI / LO, u / UP) : HI * Math.pow(LO / HI, (u - UP) / DOWN);
    ph += f / SR;
    y = (1 - a) * (2 * (ph % 1) - 1) + a * y;
    out.push(SIREN_GAIN * y);
  }
  return out;
}

/* RMS liczony tylko po fragmentach, w których cokolwiek gra — przerwy między
   tonami gongu inaczej zaniżałyby jego poziom i test przepuściłby za głośny sygnał. */
function rmsGrania(x, prog = 0.01) {
  const nz = x.filter(v => Math.abs(v) > prog);
  return nz.length ? rms(nz) : 0;
}

function wav(nazwa) {
  const b = fs.readFileSync(path.join(RAW, nazwa + '.wav'));
  const out = [];
  for (let i = 44; i + 1 < b.length; i += 2) out.push(b.readInt16LE(i) / 32767);
  return out;
}

const MARGINES_DB = 3;   // minimalna, słyszalna różnica między uwagą a alarmem

test('w otwartej aplikacji żółty jest wyraźnie cichszy od czerwonego', () => {
  const z = rmsGrania(zolty(CHIME_GAIN)), c = rmsGrania(czerwony());
  const roznica = dB(z, c);
  assert.ok(roznica <= -MARGINES_DB,
    `sygnał uwagi ma być co najmniej ${MARGINES_DB} dB pod syreną, a jest ${roznica.toFixed(1)} dB `
    + `(żółty ${(20 * Math.log10(z)).toFixed(1)} dBFS, czerwony ${(20 * Math.log10(c)).toFixed(1)} dBFS)`);
});

test('żółty nadal jest słyszalny — nie zjechaliśmy do zera', () => {
  const z = 20 * Math.log10(rmsGrania(zolty(CHIME_GAIN)));
  assert.ok(z > -24, `sygnał uwagi zszedł do ${z.toFixed(1)} dBFS — za cicho, żeby go zauważyć`);
});

test('szczyt żółtego nie przekracza szczytu czerwonego', () => {
  // bez Math.max(...tab) — przy setkach tysięcy próbek przepełnia stos wywołań
  const szczyt = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const pz = szczyt(zolty(CHIME_GAIN)), pc = szczyt(czerwony(4));
  assert.ok(pz <= pc, `szczyt żółtego ${pz.toFixed(3)} > szczyt czerwonego ${pc.toFixed(3)}`);
});

test('stopnie głośności z ustawień schodzą w dół i kończą się ciszą', () => {
  const m = /CHIME_LEVELS\s*=\s*\{([^}]*)\}/.exec(APP);
  assert.ok(m, 'brak CHIME_LEVELS w app.js');
  const poziomy = Object.fromEntries([...m[1].matchAll(/(\w+)\s*:\s*([0-9.]+)/g)]
    .map(([, k, v]) => [k, parseFloat(v)]));
  assert.deepEqual(Object.keys(poziomy), ['normal', 'quiet', 'silent']);
  assert.equal(poziomy.normal, 1);
  assert.ok(poziomy.quiet > 0 && poziomy.quiet < 1, 'stopień „ciszej” ma być między ciszą a normalnym');
  assert.equal(poziomy.silent, 0);
});

test('pliki dla powiadomień: cichszy żółty faktycznie cichszy o około 10 dB', () => {
  const normalny = rmsGrania(wav('alert_uwaga')), cichy = rmsGrania(wav('alert_uwaga_cicho'));
  const roznica = dB(cichy, normalny);
  assert.ok(roznica < -8 && roznica > -13,
    `wariant „ciszej” ma być około 10 dB pod zwykłym, a jest ${roznica.toFixed(1)} dB`);
});

test('pliki dla powiadomień: żółty i czerwony wyrównane (grają na różnych strumieniach)', () => {
  // Tu NIE wymagamy hierarchii jak wyżej: żółty idzie na strumień powiadomień,
  // czerwony na strumień alarmów podbity do co najmniej połowy, więc nikt ich nie
  // porównuje bezpośrednio. Pilnujemy tylko, żeby nie rozjechały się przypadkiem.
  const roznica = dB(rmsGrania(wav('alert_uwaga')), rmsGrania(wav('alarm_syrena')));
  assert.ok(Math.abs(roznica) < 3,
    `pliki powiadomień rozjechały się o ${roznica.toFixed(1)} dB`);
});

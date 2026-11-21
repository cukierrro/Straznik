/* „Jak to działa” w Moich miejscach a tor alarmów (wydanie 1.8.10, 21.11.2026).

   Tekst mówił na sztywno „otrzymasz alert dla województwa”. Po przełączeniu serwera na
   powiaty telefon z powiatem dla każdego miejsca dostaje alert dla POWIATU — tekst ma to
   powiedzieć. Gdy choć jedno miejsce z alarmami nie ma powiatu, telefon zostaje przy
   województwach, więc i tekst zostaje przy województwach. Powrót serwera na „woj”
   (wyłącznik awaryjny) przywraca tekst województw.

   Wykonuje PRAWDZIWE funkcje z frontend/app.js (wycięte ze źródła) na atrapach.

   Uruchomienie:  node scripts/test_jak_to_dziala_powiaty.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');

let bledy = 0;
function ok(w, opis) { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; }

const od = app.indexOf('function powiatyAktywne(');
const doK = app.indexOf('function renderPlacePowiat(');
ok(od > 0 && doK > od, 'funkcje powiatyAktywne i renderPlacesAlertModel stoją przed renderPlacePowiat');
const zrodlo = app.slice(od, doK);
const wywolanie = app.slice(doK, app.indexOf('\n', app.indexOf('{', doK) + 1) + 200);
ok(/renderPlacesAlertModel\(\)/.test(wywolanie), 'renderPlacePowiat woła renderPlacesAlertModel (otwarcie okna, zmiana województwa i zakresu)');

const WOJ_HTML = '<b>Jak to działa:</b> przy zamkniętej aplikacji, w tle lub zablokowanym ekranie otrzymasz alert dla województwa. Po jego otrzymaniu otwórz Strażnika…';
function srodowisko({ tor, lang = 'pl', bezPowiatu = [], wylaczone = false, granice = true }) {
  const el = { innerHTML: WOJ_HTML, dataset: {} };
  const st = { tor, lang, bezPowiatu, wylaczone, granice };
  const UI = { t: (pl, en, uk) => st.lang === 'pl' ? pl : st.lang === 'uk' ? uk : en };
  const Powiaty = { planPowiatow: () => ({ bezPowiatu: st.bezPowiatu }) };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fn = new Function('placeEl', 'placeText', 'torTematow', 'alertsOff', 'Powiaty', 'esc', 'savedPlaces', 'granicePowiatowF',
    `${zrodlo.replace(/\bgranicePowiatow\b/g, 'granicePowiatowF()')}
     return { renderPlacesAlertModel, powiatyAktywne };`);
  const api = fn.call({}, id => id === 'places-alert-model' ? el : null, (pl, en, uk) => UI.t(pl, en, uk),
    () => st.tor, () => st.wylaczone, Powiaty, esc, [], () => st.granice ? {} : null);
  return { el, st, ...api };
}

console.log('1. Tor województw (dziś, przed przełączeniem serwera)');
let s = srodowisko({ tor: 'woj' });
s.renderPlacesAlertModel();
ok(s.el.innerHTML === WOJ_HTML, 'tekst bez zmian — telefon słucha województw');
ok(s.powiatyAktywne() === false, 'powiatyAktywne = false');

console.log('\n2. Tor powiatów, każde miejsce ma powiat');
for (const [lang, slowo, nie] of [['pl', 'alert dla powiatu tego miejsca', 'dla województwa'],
  ['en', "alert for this place's county", 'province-level'], ['uk', 'тривогу для повіту цього місця', 'рівня воєводства']]) {
  s = srodowisko({ tor: 'pow', lang });
  s.renderPlacesAlertModel();
  ok(s.el.innerHTML.includes(slowo) && !s.el.innerHTML.includes(nie), `${lang}: „${slowo}”, bez „${nie}”`);
  ok(/^<b>[^<]+<\/b> /.test(s.el.innerHTML), `${lang}: pogrubiony początek jak w oryginale`);
}
s = srodowisko({ tor: 'pow' });
s.renderPlacesAlertModel();
ok(s.el.innerHTML.includes('przy granicy powiatów — dla obu'), 'wzmianka o dwóch powiatach przy granicy');
ok(s.el.innerHTML.includes('orientacyjny czas dolotu'), 'druga połowa (co zrobić po alercie) zostaje');

console.log('\n3. Tor powiatów, ale telefon został przy województwach');
s = srodowisko({ tor: 'pow', bezPowiatu: [{ name: 'Działka' }] });
s.renderPlacesAlertModel();
ok(s.el.innerHTML === WOJ_HTML, 'miejsce z alarmami bez powiatu — tekst województw (tak naprawdę jest)');
s = srodowisko({ tor: 'pow', wylaczone: true });
s.renderPlacesAlertModel();
ok(s.el.innerHTML === WOJ_HTML, 'alarmy wyłączone na telefonie — bez obietnicy alertu dla powiatu');
s = srodowisko({ tor: 'pow', granice: false });
s.renderPlacesAlertModel();
ok(s.el.innerHTML === WOJ_HTML, 'granice powiatów jeszcze nie wczytane — bez zgadywania');

console.log('\n4. Powrót serwera na województwa (wyłącznik awaryjny)');
s = srodowisko({ tor: 'pow' });
s.renderPlacesAlertModel();
ok(s.el.innerHTML !== WOJ_HTML, 'najpierw tekst powiatów');
s.st.tor = 'woj';
s.renderPlacesAlertModel();
ok(s.el.innerHTML === WOJ_HTML, 'po powrocie na „woj” — z powrotem tekst województw');

if (bledy) { console.log(`\nBLEDY: ${bledy}`); process.exit(1); }
console.log('\nOK - „Jak to działa” mówi o tym torze alarmów, którego telefon naprawdę słucha');

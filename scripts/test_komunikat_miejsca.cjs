// Zapis miejsca: osobny komunikat dla każdego braku (zgłoszenie z Vivo Y33s, 22.11.2026).
// Wcześniej jeden tekst „Uzupełnij nazwę i wybraną lokalizację” pokrywał trzy przypadki,
// a przy wpisanej nazwie brakowało jednorazowej pozycji — użytkownik nie wiedział czego.
// Test WYKONUJE kod walidacji z app.js (nie porównuje tekstu źródła) i sprawdza, jaki
// komunikat i które pole dostaje użytkownik, w aplikacji i na stronie. Cytowane etykiety
// muszą być tymi z ekranu (PL z index.html, EN z i18n.js).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'frontend', 'index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'frontend', 'i18n.js'), 'utf8');
let bledy = 0;
const ok = (w, opis) => { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; };

const od = app.indexOf('placeEl("places-form").onsubmit=');
const pocz = app.indexOf('const clean=draftFromForm();', od);
const kon = app.indexOf('const idx=savedPlaces.findIndex', od);
ok(od > 0 && pocz > od && kon > pocz, 'obsługa zapisu miejsca stoi w app.js');
ok(!/Uzupełnij nazwę i wybraną lokalizację/.test(app), 'stary zbiorczy komunikat usunięty');
const walidacja = new Function('clean', 'IS_APP', 'Powiaty', 'placeFail', 'placeText',
  app.slice(pocz + 'const clean=draftFromForm();'.length, kon) + '\nreturn "przechodzi";');

function sprawdz(clean, wAplikacji) {
  let wynik = null;
  const r = walidacja(clean, wAplikacji, wAplikacji ? {} : null,
    (msg, pole) => { wynik = { msg, pole }; }, (pl, en, uk) => ({ pl, en, uk }));
  return r === 'przechodzi' ? null : wynik;
}
const pelne = { name: 'Dom', region: 'lubelskie', precision: 'region', gps: null };
ok(sprawdz(pelne, true) === null, 'kompletne miejsce przechodzi');
ok(sprawdz({ ...pelne, precision: 'gps', gps: { lat: 51, lon: 22 } }, true) === null, 'zakres z lokalizacją i pobraną pozycją przechodzi');
const bezNazwy = sprawdz({ ...pelne, name: '' }, true);
ok(bezNazwy?.pole === 'place-name' && /nazwę/.test(bezNazwy.msg.pl), 'bez nazwy — komunikat o nazwie, kursor w polu nazwy');
const bezWoj = sprawdz({ ...pelne, region: '' }, true);
ok(bezWoj?.pole === 'place-region' && /województwo/.test(bezWoj.msg.pl), 'bez województwa — komunikat o województwie');
const gpsApp = sprawdz({ ...pelne, precision: 'gps', gps: null }, true);
const gpsWeb = sprawdz({ ...pelne, precision: 'gps', gps: null }, false);
ok(gpsApp?.pole === 'place-gps' && gpsWeb?.pole === 'place-gps', 'zakres z lokalizacją bez pozycji — wskazuje przycisk pozycji');
for (const [n, w] of [['nazwa', bezNazwy], ['województwo', bezWoj], ['pozycja', gpsApp]])
  ok(w && w.msg.pl && w.msg.en && w.msg.uk, `komunikat „${n}” w trzech językach`);

ok(/wybierz powiat z listy\.$/.test(gpsApp.msg.pl) && /choose the county from the list\.$/.test(gpsApp.msg.en)
  && /виберіть повіт зі списку\.$/.test(gpsApp.msg.uk), 'w aplikacji odsyła do pola „Powiat”');
ok(!/powiat/.test(gpsWeb.msg.pl) && !/county/.test(gpsWeb.msg.en) && !/повіт/.test(gpsWeb.msg.uk)
  && /„Województwo”\.$/.test(gpsWeb.msg.pl), 'na stronie (bez pola „Powiat”) nie wspomina powiatu');

const przyciskPL = (html.match(/id="place-gps" class="chip">([^<]+)</) || [])[1];
const przyciskEN = (i18n.match(/set\("#place-gps", "([^"]+)"\)/) || [])[1];
const przyciskUK = (i18n.match(/"◎ Read location once": "([^"]+)"/) || [])[1];
ok(przyciskPL && gpsApp.msg.pl.includes(`„${przyciskPL}”`), `PL cytuje przycisk z ekranu: „${przyciskPL}”`);
ok(przyciskEN && gpsApp.msg.en.includes(`“${przyciskEN}”`), `EN cytuje przycisk z ekranu: “${przyciskEN}”`);
ok(przyciskUK && gpsApp.msg.uk.includes(`«${przyciskUK}»`), `UK cytuje przycisk z ekranu: «${przyciskUK}»`);
const opcjePL = [...(html.match(/<select id="place-precision">([\s\S]*?)<\/select>/) || [, ''])[1].matchAll(/>([^<]+)<\/option>/g)].map(x => x[1]);
ok(opcjePL.length === 2 && gpsApp.msg.pl.includes(`„${opcjePL[1]}”`) && gpsApp.msg.pl.includes(`„${opcjePL[0]}”`),
  `PL cytuje oba zakresy z listy: ${opcjePL.join(' / ')}`);
const opcjeEN = i18n.match(/precision\[0\]\.textContent="([^"]+)";precision\[1\]\.textContent="([^"]+)"/);
ok(opcjeEN && gpsApp.msg.en.includes(`“${opcjeEN[2]}”`) && gpsApp.msg.en.includes(`“${opcjeEN[1]}”`), 'EN cytuje oba zakresy tak jak lista');
ok(/placeText\("Zapisano jednorazowo","Saved once","Збережено одноразово"\)/.test(app)
  && gpsApp.msg.pl.includes('„Zapisano jednorazowo”') && gpsApp.msg.en.includes('“Saved once”')
  && gpsApp.msg.uk.includes('«Збережено одноразово»'), 'komunikat odsyła do napisu, który pojawia się po pobraniu pozycji');

console.log(bledy ? `\nBLEDY: ${bledy}` : '\nWszystko OK');
process.exit(bledy ? 1 : 0);

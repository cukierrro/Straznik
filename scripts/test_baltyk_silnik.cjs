// Media bałtyckie w TRYBIE WBUDOWANYM — lustro sekcji 9–11 scripts/test_baltic_alerts.py.
// Poranek 18.10.2026 (dron, który według 15min wleciał na Litwę z Polski):
//   * 15min zawęził alarm do Poniewieża, a opis mówił o odwołaniu w Szawlach —
//     to nie było odwołanie całej Litwy;
//   * angielski LSM opublikował „Possible air threat alert…” PRZED końcem alarmu,
//     a przeczytany po łotewskim odwołaniu otwierał alarm na nowo;
//   * ERR „Läti ja Leedu andsid öösel õhuohu hoiatuse” liczył się jako alarm w Estonii.
//
// Uruchomienie: node scripts/test_baltyk_silnik.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const vm = require('node:vm');

/* Zaślepka DOMParser: wystarczy na <item><title/><link/><description/><pubDate/></item>. */
class DOMParserZaslepka {
  parseFromString(xml) {
    const pola = (blok) => (sel) => {
      for (const nazwa of sel.split(',').map(x => x.trim())) {
        const m = new RegExp(`<${nazwa}>([\\s\\S]*?)</${nazwa}>`).exec(blok);
        if (m) return { textContent: m[1], getAttribute: () => null };
      }
      return null;
    };
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({ querySelector: pola(m[1]) }));
    return { querySelectorAll: () => items };
  }
}

function silnik() {
  const zegar = { teraz: Date.parse('2026-10-18T04:20:00Z') };
  const kanaly = new Map();
  const storage = new Map();
  const RealDate = Date;
  const context = vm.createContext({
    console, URL, Intl, setTimeout, clearTimeout, setInterval, clearInterval, window: {},
    DOMParser: DOMParserZaslepka,
    Date: class extends RealDate {
      constructor(...a) { super(...(a.length ? a : [zegar.teraz])); }
      static now() { return zegar.teraz; }
      static parse(s) { return RealDate.parse(s); }
    },
    fetch: async (url) => ({ ok: true, text: async () => kanaly.get(url) || '<rss></rss>' }),
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
  });
  vm.runInContext(fs.readFileSync('frontend/pl-outline.js', 'utf8') + '\n'
    + fs.readFileSync('frontend/engine.js', 'utf8') + '\nthis.TestEngine = Engine;', context);
  const E = context.TestEngine;
  const rss = (wpisy) => '<rss><channel>' + wpisy.map(w =>
    `<item><title>${w.tytul}</title><link>${w.link}</link><description>${w.opis || ''}</description>`
    + `<pubDate>${new RealDate(w.opublikowano).toUTCString()}</pubDate></item>`).join('') + '</channel></rss>';
  return {
    E, zegar,
    ustaw: (url, wpisy) => kanaly.set(url, rss(wpisy)),
    sygnaly: (typ) => [...E.baltyk.sygnaly()].filter(s => s.event_type === typ),
  };
}

const T = (hhmm) => Date.parse(`2026-10-18T${hhmm}:00Z`);   // czas UTC
const L15 = 'https://www.15min.lt/naujiena/aktualu/lietuva/panevezio-ir-siauliu-apskrityse-raudonas-oro-pavojus-56-2787174';

test('zawężenie alarmu na Litwie to nie odwołanie', async () => {
  const s = silnik();
  s.ustaw('https://www.15min.lt/rss', [{ tytul: 'Panevėžio ir Šiaulių apskrityse – raudonas oro pavojus, Kaune stabdomi skrydžiai',
    link: L15, opublikowano: T('04:19') }]);
  await s.E.baltyk.tickRss();
  assert.ok(s.sygnaly('baltic_alert').length > 0, 'alarm 07:19 czasu litewskiego wchodzi');
  s.zegar.teraz = T('04:59');
  s.ustaw('https://www.15min.lt/rss', [{ tytul: 'Panevėžio apskrityje – raudonas oro pavojus, Kaune stabdomi skrydžiai',
    link: L15, opis: 'Šiaulių apskrityje oro pavojus atšauktas.', opublikowano: T('04:19') }]);
  await s.E.baltyk.tickRss();
  assert.equal(s.sygnaly('baltic_clear').length, 0, 'tytuł nadal ogłasza alarm — to nie odwołanie');
});

test('artykuł opublikowany przed odwołaniem nie otwiera alarmu na nowo (LSM)', async () => {
  const s = silnik();
  s.zegar.teraz = T('04:52');
  s.ustaw('https://www.lsm.lv/rss/', [{ tytul: 'Izsludināts iespējamais gaisa telpas apdraudējums Bauskas, Aizkraukles un Ogres novados',
    link: 'https://www.lsm.lv/raksts/zinas/latvija/izsludinats.a668034/', opublikowano: T('04:48') }]);
  await s.E.baltyk.tickRss();
  assert.ok(s.sygnaly('baltic_alert').length > 0, 'łotewski alarm wchodzi');
  const przed = s.sygnaly('baltic_alert').length;
  s.zegar.teraz = T('05:21');
  s.ustaw('https://www.lsm.lv/rss/', [{ tytul: 'Beidzies iespējamais gaisa telpas apdraudējums Bauskas, Aizkraukles un Ogres novados',
    link: 'https://www.lsm.lv/raksts/zinas/latvija/beidzies.a668034/', opublikowano: T('04:48') }]);
  s.ustaw('https://eng.lsm.lv/rss/', [{ tytul: 'Possible air threat alert in Bauskas, Aizkraukles and Ogres municipalities of Latvia',
    link: 'https://eng.lsm.lv/article/society/defence/possible-air-threat.a664326/', opublikowano: T('04:53') }]);
  await s.E.baltyk.tickRss();
  assert.ok(s.sygnaly('baltic_clear').length > 0, 'odwołanie wchodzi');
  assert.equal(s.sygnaly('baltic_alert').length, przed, 'spóźniony angielski artykuł nie dokłada alarmu');
});

test('estońska relacja o Łotwie i Litwie to nie alarm w Estonii (ERR)', async () => {
  const s = silnik();
  s.zegar.teraz = T('06:43');
  s.ustaw('https://www.err.ee/rss', [{ tytul: 'Läti ja Leedu andsid öösel õhuohu hoiatuse',
    link: 'https://www.err.ee/1610169574/lati-ja-leedu', opublikowano: T('06:41') }]);
  await s.E.baltyk.tickRss();
  assert.equal(s.sygnaly('baltic_alert').length, 0);
});

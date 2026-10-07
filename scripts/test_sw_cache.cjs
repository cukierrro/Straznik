/* Pamięć podręczna service workera nie może rosnąć bez końca.

   Znalezione 07.10.2026 przy pytaniu użytkownika, czy aplikacja nie zapcha
   ludziom telefonów. Aplikacja (APK) workera nie rejestruje i jest czysta —
   ale STRONA tak, a jej cache nie kasował niczego nigdy: `activate` usuwał
   tylko cache o INNEJ NAZWIE, a nazwa jest wpisana na sztywno.

   Każde wydanie zmienia `?v=`, czyli ADRES, a cache trzyma wpisy po adresach.
   Nowa wersja dokładała się więc OBOK starej. Pomiar na historii repozytorium:
   165 różnych kluczy `app.js` (437 KB), 117 `i18n.js`, 138 `style.css`,
   132 `engine.js` — dla stałego gościa ~10–25 MB martwych kopii miesięcznie.

   Test URUCHAMIA prawdziwy kod sw.js w piaskownicy z atrapą Cache API. Sprawdza
   zachowanie, nie obecność napisów w pliku. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

function zaladujSW() {
  const handlery = {};
  const magazyny = new Map();            // nazwa cache -> Map(url -> 1)
  function fakeCache(nazwa) {
    if (!magazyny.has(nazwa)) magazyny.set(nazwa, new Map());
    const m = magazyny.get(nazwa);
    return {
      _m: m,
      async put(req, res) { m.set(typeof req === "string" ? req : req.url, res || 1); },
      async keys() { return [...m.keys()].map(url => ({ url })); },
      async delete(k) { return m.delete(typeof k === "string" ? k : k.url); },
      async addAll(lista) { for (const u of lista) m.set(new URL(u, BAZA).href, 1); },
      async match(req) { return m.get(typeof req === "string" ? req : req.url) ? {} : undefined; },
    };
  }
  const BAZA = "https://straznik.eu/";
  const sandbox = {
    URL, console, Promise, setTimeout,
    self: {
      addEventListener: (nazwa, fn) => { handlery[nazwa] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      registration: { showNotification: async () => {} },
      location: BAZA + "sw.js",
    },
    caches: {
      async open(n) { return fakeCache(n); },
      async keys() { return [...magazyny.keys()]; },
      async delete(n) { return magazyny.delete(n); },
      async match() { return undefined; },
    },
    clients: { matchAll: async () => [], openWindow: async () => {} },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "frontend", "sw.js"), "utf8"), sandbox);
  return { sandbox, handlery, magazyny, fakeCache, BAZA };
}

(async () => {
  const { sandbox, handlery, fakeCache, BAZA } = zaladujSW();

  console.log("1. odkurz(): po jednej kopii pliku na sciezke");
  sprawdz(typeof sandbox.odkurz === "function", "sw.js udostepnia odkurz()");
  const c = fakeCache("straznik-v1");
  const wpisy = [
    BAZA + "app.js?v=1.7.80", BAZA + "app.js?v=1.7.85", BAZA + "app.js?v=1.7.91",
    BAZA + "style.css?v=1.7.90", BAZA + "index.html", BAZA + "",
  ];
  for (const u of wpisy) await c.put({ url: u });
  await sandbox.odkurz(c, BAZA + "app.js?v=1.7.91");
  const po = [...c._m.keys()];
  sprawdz(po.filter(u => u.includes("app.js")).length === 1,
    `zostala JEDNA kopia app.js (bylo 3, jest ${po.filter(u => u.includes("app.js")).length})`);
  sprawdz(po.includes(BAZA + "app.js?v=1.7.91"), "zostala ta WLASCIWA kopia, nie przypadkowa");
  sprawdz(po.includes(BAZA + "style.css?v=1.7.90"), "inny plik nietkniety");
  sprawdz(po.includes(BAZA + "index.html"), "powloka bez wersji nietknieta");

  console.log("2. odkurz() nie rusza niczego dla adresu bez wersji");
  const c2 = fakeCache("test2");
  await c2.put({ url: BAZA + "index.html" });
  await c2.put({ url: BAZA + "app.js?v=1.7.91" });
  await sandbox.odkurz(c2, BAZA + "index.html");
  sprawdz(c2._m.size === 2, "adres bez `?` nie wywoluje kasowania");

  console.log("3. activate: jednorazowe sprzatniecie zaleglosci");
  const { sandbox: s3, handlery: h3, fakeCache: fc3 } = zaladujSW();
  const c3 = fc3("straznik-v1");
  for (const u of ["app.js?v=1.7.70", "app.js?v=1.7.80", "i18n.js?v=1.7.70",
                   "engine.js?v=1.7.60", "index.html", ""])
    await c3.put({ url: BAZA + u });
  const obcy = fc3("straznik-stary");
  await obcy.put({ url: BAZA + "cos" });
  let czekano = null;
  await h3.activate({ waitUntil: (p) => { czekano = p; } });
  await czekano;
  const zostalo = [...c3._m.keys()];
  sprawdz(zostalo.every(u => !new URL(u).search),
    `po activate nie ma zadnego wpisu z wersja (zostalo: ${zostalo.length})`);
  sprawdz(zostalo.includes(BAZA + "index.html"),
    "powloka przezyla — offline nie znika po aktualizacji workera");
  sprawdz(!(await s3.caches.keys()).includes("straznik-stary"),
    "cache o innej nazwie dalej jest kasowany (stare zachowanie zachowane)");

  console.log("4. Aplikacja (APK) workera NIE rejestruje");
  // Gdyby to sie zmienilo, caly powyzszy mechanizm zaczalby dotyczyc takze
  // telefonow — a tam o miejsce trzeba dbac inaczej niz w przegladarce.
  const app = fs.readFileSync(path.join(__dirname, "..", "frontend", "app.js"), "utf8");
  sprawdz(/if \("serviceWorker" in navigator && !IS_APP\)/.test(app),
    "rejestracja workera dalej wykluczona w aplikacji (!IS_APP)");

  console.log("\nBLEDY: " + bledy);
  process.exit(bledy ? 1 : 0);
})();

/* Prędkości typowe klas obiektów stoją w TRZECH miejscach:
     backend/app/config.py  → NEPTUN_TYPE_SPEED_KMH  (powiadomienia i progi alarmu)
     frontend/engine.js     → TYPE_SPEED_KMH         (tryb awaryjny na urządzeniu)
     frontend/app.js        → TYPE_SPEED_KMH         (karta obiektu, mapa)
   Muszą być IDENTYCZNE. Inaczej aplikacja pokaże inny czas dolotu niż ten
   w powiadomieniu, albo — gorzej — nie pokaże go wcale.

   Ten test powstał, bo tak właśnie było: 04.10.2026 w app.js brakowało klasy
   `recon` (dron rozpoznawczy — ma własny kolor i ikonę, więc jest pokazywany).
   Prędkość typowa wychodziła `undefined`, a czas dolotu znikał z karty BEZ
   ŻADNEGO BŁĘDU. Nikt tego nie zauważył, bo nic się nie wywracało.

   Testu NIE rozszerzać o prędkości dronów odrzutowych, dopóki nie zapadnie
   decyzja o ujednoliceniu backendu z kartą — dziś różnią się ŚWIADOMIE i test
   przyklepałby ten stan jako docelowy. */
const fs = require("fs");
const path = require("path");

// Końce linii normalizujemy zaraz po odczycie: przy core.autocrlf=true wzorce
// z \n nie trafiają i test przewraca się zamiast sprawdzać (lekcja z 28.09).
const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BŁĄD") + "  " + opis); if (!ok) bledy++; };

/* Wyciąga pary klucz→liczba z literału między pierwszym { a pasującym }.
   Działa tak samo dla słownika Pythona ("uav": 180) i obiektu JS (uav: 180). */
function tablica(tekst, nazwa) {
  const i = tekst.indexOf(nazwa);
  if (i < 0) return null;
  const otw = tekst.indexOf("{", i);
  const zam = tekst.indexOf("}", otw);
  if (otw < 0 || zam < 0) return null;
  const out = {};
  for (const m of tekst.slice(otw + 1, zam).matchAll(/["']?([a-zA-Z0-9_]+)["']?\s*:\s*([0-9.]+)/g))
    out[m[1]] = Number(m[2]);
  return out;
}

const zrodla = {
  "backend/app/config.py": tablica(czytaj("backend/app/config.py"), "NEPTUN_TYPE_SPEED_KMH"),
  "frontend/engine.js": tablica(czytaj("frontend/engine.js"), "const TYPE_SPEED_KMH"),
  "frontend/app.js": tablica(czytaj("frontend/app.js"), "const TYPE_SPEED_KMH"),
};

console.log("1. Trzy tablice prędkości są identyczne");
for (const [plik, tab] of Object.entries(zrodla))
  sprawdz(tab && Object.keys(tab).length >= 8,
    `${plik}: tablica odczytana (${tab ? Object.keys(tab).length : 0} klas)`);

const [wzorzecPlik, wzorzec] = Object.entries(zrodla)[0];
for (const [plik, tab] of Object.entries(zrodla).slice(1)) {
  if (!tab || !wzorzec) continue;
  const brak = Object.keys(wzorzec).filter((k) => !(k in tab));
  const nadmiar = Object.keys(tab).filter((k) => !(k in wzorzec));
  const inne = Object.keys(wzorzec).filter((k) => k in tab && tab[k] !== wzorzec[k])
    .map((k) => `${k}: ${tab[k]} zamiast ${wzorzec[k]}`);
  sprawdz(brak.length === 0, `${plik}: nie brakuje klas${brak.length ? " — BRAK: " + brak.join(", ") : ""}`);
  sprawdz(nadmiar.length === 0, `${plik}: brak klas spoza ${wzorzecPlik}${nadmiar.length ? " — NADMIAR: " + nadmiar.join(", ") : ""}`);
  sprawdz(inne.length === 0, `${plik}: wartości się zgadzają${inne.length ? " — RÓŻNE: " + inne.join("; ") : ""}`);
}

console.log("2. Każda pokazywana klasa obiektu ma prędkość");
// Klasa z własną etykietą na mapie jest pokazywana użytkownikowi, więc musi mieć
// czas dolotu. Tak przepadł `recon`: etykieta i ikona były, prędkości nie.
const app = czytaj("frontend/app.js");
const i = app.indexOf("const TYPE_META");
const blok = i < 0 ? "" : app.slice(i, app.indexOf("};", i));
const etykietowane = [...blok.matchAll(/^\s*([a-z0-9_]+):\s*\{[^}]*label:/gm)].map((m) => m[1]);
sprawdz(etykietowane.length > 0, `odczytano klasy z etykietami (${etykietowane.length})`);
for (const k of etykietowane.filter((k) => k !== "unknown"))
  sprawdz(k in (zrodla["frontend/app.js"] || {}), `klasa „${k}” ma prędkość typową`);
// „unknown" celowo NIE ma prędkości: nie zgadujemy, jak szybko leci coś,
// czego nie rozpoznaliśmy — brak czasu dolotu jest tu uczciwszy niż liczba.
sprawdz(!("unknown" in (zrodla["backend/app/config.py"] || {})),
  'klasa „unknown” świadomie bez prędkości — nie zgadujemy nierozpoznanego');

console.log("3. Tablica czytana tylko przez jedno wejście");
// Pięć miejsc czytało TYPE_SPEED_KMH[t.type] bez sprowadzenia do małych liter,
// podczas gdy backend i engine.js robią .lower() wszędzie.
const bezKomentarzy = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const bezposrednie = [...bezKomentarzy.matchAll(/TYPE_SPEED_KMH\s*\[/g)].length;
sprawdz(bezposrednie === 1, `app.js czyta tablicę tylko w typeSpeedKmh (znaleziono ${bezposrednie} odwołań)`);
sprawdz(/const typeSpeedKmh = \(t\) => TYPE_SPEED_KMH\[String\(t\?\.type \|\| ""\)\.toLowerCase\(\)\]/.test(app),
  "typeSpeedKmh sprowadza nazwę klasy do małych liter");


console.log("4. Dron odrzutowy: jedna podłoga we wszystkich trzech miejscach");
/* To jest NIEZMIENNIK, nie konkretna liczba: podłoga może się kiedyś zmienić,
   ale musi zmienić się we wszystkich trzech miejscach naraz. Do 04.10.2026
   backend liczył alarm po 450, a karta pokazywała dłuższy czas po 350 — czyli
   karta obiecywała WIĘCEJ czasu, niż zakładał alarm. */
const cfg = czytaj("backend/app/config.py");
const eng = czytaj("frontend/engine.js");
const npt = czytaj("backend/app/collectors/neptun.py");
const liczba = (tekst, re) => { const m = re.exec(tekst); return m ? Number(m[1]) : null; };
const podlogi = {
  "backend NEPTUN_JET_SPEED_KMH": liczba(cfg, /NEPTUN_JET_SPEED_KMH\s*=\s*([0-9.]+)/),
  "engine.js JET_SPEED_KMH": liczba(eng, /JET_SPEED_KMH\s*=\s*([0-9.]+)/),
  "app.js JET_ALARM_KMH": liczba(app, /JET_ALARM_KMH\s*=\s*([0-9.]+)/),
};
const wart = Object.values(podlogi);
sprawdz(wart.every((v) => v != null && v === wart[0]),
  "podłoga prędkości drona odrzutowego taka sama wszędzie: "
  + Object.entries(podlogi).map(([k, v]) => `${k}=${v}`).join(", "));

console.log("5. Pomiar z ruchu może prędkość tylko PODNIEŚĆ");
// Szum pozycji ze źródła (zmierzone na produkcji 13–42 km/h na realnym obiekcie)
// nie może obniżyć założonej prędkości, bo to OPÓŹNIA alarm.
sprawdz(npt.includes("max(_measured_speed(t) or 0.0, config.NEPTUN_JET_SPEED_KMH)"),
  "backend: max(pomiar, podłoga) — pomiar nie schodzi poniżej");
sprawdz(eng.includes("Math.max(measuredSpeedKmh(t) || 0, JET_SPEED_KMH)"),
  "engine.js: max(pomiar, podłoga) — tryb awaryjny liczy tak samo jak serwer");
sprawdz(/function measuredSpeedKmh/.test(eng) && /const trails = new Map\(\)/.test(eng),
  "engine.js UMIE zmierzyć prędkość z ruchu (ślad ze znacznikami czasu)");

console.log("6. Karta pokazuje liczbę serwera, nie własną");
sprawdz(app.includes("const zSerwera = t.straznik_speed;"),
  "karta bierze prędkość z pola straznik_speed, gdy serwer je podał");
sprawdz(npt.includes('t["straznik_speed"]'),
  "backend wystawia użytą prędkość w danych");

console.log("\nBŁĘDY: " + bledy);
process.exit(bledy ? 1 : 0);

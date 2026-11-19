/* Łączenie alarmów z kilku powiatów na telefonie (etap 3 alarmów powiatowych, 19.11.2026).

   Zasada usera (18.11.2026): pierwsze powiadomienie dzwoni; kolejne tego samego poziomu
   w ciągu 10 min dopisują się bez dźwięku; wyższy poziom i `ponowienie` dzwonią.
   Klucz łączenia = klucz zdarzenia z serwera („<poziom>|<początek sesji>”).

   1. Logika Androida (Laczenie.java) — kompilowana javakiem (JAVA_HOME albo JBR z Android
      Studio) i puszczana na tabeli przypadków. Bez javaca ta część jest POMIJANA z wyraźnym
      komunikatem (kod wyjścia dalej 0), reszta testu działa.
   2. Wpięcie w odbiór (StraznikFcmService): decyzja przed pokazaniem, dopisanie cichym
      kanałem pod osobnym identyfikatorem, ścieżka czerwonego (pełny ekran, kategoria
      alarmu, syrena) nietknięta, filtr toru i powiatów spoza miejsc.
   3. iPhone: jeśli w drzewie jest rozszerzenie powiadomień (gałąź iOS), ma tę samą zasadę
      i nie dotyka dźwięku pierwszego alarmu.

   Uruchomienie:  node scripts/test_laczenie_powiadomien.cjs */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const JAVA = path.join(ROOT, 'android-app', 'android', 'app', 'src', 'main', 'java', 'pl', 'straznik', 'app');

let bledy = 0;
function ok(w, opis) { console.log((w ? '  OK   ' : '  BLAD ') + opis); if (!w) bledy++; }

const MIN = 60000;
const K1 = '2026-11-17T09:10:00+00:00', K2 = '2026-11-17T13:00:00+00:00';
// [minuta, poziom, klucz, ponowienie, test, miejsce, oczekiwane D(zwoni)/L(dołącz), miejsca po decyzji]
const PRZYPADKI = [
  [0, 'elevated', `elevated|${K1}`, false, false, 'Lublin', 'D', 'Lublin'],
  [2, 'elevated', `elevated|${K1}`, false, false, 'powiat świdnicki', 'L', 'Lublin;powiat świdnicki'],
  [2.5, 'elevated', `elevated|${K1}`, false, false, 'powiat świdnicki', 'L', 'Lublin;powiat świdnicki'],
  [3, 'high', `high|${K1}`, false, false, 'Lublin', 'D', 'Lublin'],
  [4, 'high', `high|${K1}`, false, false, 'powiat świdnicki', 'L', 'Lublin;powiat świdnicki'],
  [5, 'elevated', `elevated|${K1}`, false, false, 'Rzeszów', 'L', 'Lublin;powiat świdnicki;Rzeszów'],
  [9, 'high', `high|${K1}`, true, false, 'Lublin', 'D', 'Lublin'],
  [14, 'high', `high|${K1}`, false, false, 'Chełm', 'L', 'Lublin;Chełm'],
  [18.5, 'high', `high|${K1}`, false, false, 'Zamość', 'L', 'Lublin;Chełm;Zamość'],
  [20, 'high', `high|${K1}`, false, false, 'powiat hrubieszowski', 'D', 'powiat hrubieszowski'],
  [21, 'elevated', `elevated|${K2}`, false, false, 'Lublin', 'D', 'Lublin'],
  [21.2, '', '', false, false, 'woj. lubelskie', 'D', 'woj. lubelskie'],
  [21.4, 'elevated', `elevated|${K2}`, false, true, 'Lublin', 'D', 'Lublin'],
  [22, 'elevated', `elevated|${K2}`, false, false, 'powiat lubelski', 'L', 'Lublin;powiat lubelski'],
  [-40, 'elevated', `elevated|${K2}`, false, false, 'Lublin', 'D', 'Lublin'],
];
const OCZEK = PRZYPADKI.map(p => `${p[6]} ${p[7]}`);

/* Wzorzec w JS — ta sama zasada, którą ma Laczenie.java i NotificationService.swift. */
function wzorzec() {
  const ranga = l => l === 'high' ? 2 : l === 'elevated' ? 1 : 0;
  const zd = k => k.includes('|') ? k.slice(k.indexOf('|') + 1) : k;
  const stan = new Map();
  return PRZYPADKI.map(([m, level, klucz, pon, test, miejsce]) => {
    const t = m * MIN;
    for (const [k, w] of stan) if (t - w.dzwonek > 3 * 60 * MIN || w.dzwonek - t > 10 * MIN) stan.delete(k);
    if (!klucz || test) return `D ${miejsce}`;
    if (!pon) for (const [k, w] of stan) {
      const [r, kk] = [+k.split('#')[0], k.slice(k.indexOf('#') + 1)];
      const wiek = t - w.dzwonek;
      if (r < ranga(level) || wiek < 0 || wiek >= 10 * MIN || zd(kk) !== zd(klucz)) continue;
      if (!w.miejsca.includes(miejsce)) w.miejsca.push(miejsce);
      return `L ${w.miejsca.join(';')}`;
    }
    stan.set(`${ranga(level)}#${klucz}`, { dzwonek: t, miejsca: [miejsce] });
    return `D ${miejsce}`;
  });
}

console.log('1. Zasada łączenia');
const w = wzorzec();
ok(JSON.stringify(w) === JSON.stringify(OCZEK), 'wzorzec JS zgodny z tabelą przypadków'
  + (JSON.stringify(w) !== JSON.stringify(OCZEK) ? '\n       ' + w.map((x, i) => `${x === OCZEK[i] ? ' ' : '≠'} ${x} | ${OCZEK[i]}`).join('\n       ') : ''));

function javac() {
  const kand = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin'),
    'C:/Program Files/Android/Android Studio/jbr/bin', '/usr/lib/jvm/default-java/bin', '/usr/bin'].filter(Boolean);
  for (const d of kand) {
    const exe = path.join(d, process.platform === 'win32' ? 'javac.exe' : 'javac');
    if (fs.existsSync(exe)) return { javac: exe, java: path.join(d, process.platform === 'win32' ? 'java.exe' : 'java') };
  }
  return null;
}
const jdk = javac();
if (!jdk) {
  console.log('  POMINIĘTE: brak javaca — Laczenie.java nie została uruchomiona (zainstaluj JDK albo ustaw JAVA_HOME)');
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'laczenie-'));
  const pkg = path.join(tmp, 'pl', 'straznik', 'app');
  fs.mkdirSync(pkg, { recursive: true });
  fs.copyFileSync(path.join(JAVA, 'Laczenie.java'), path.join(pkg, 'Laczenie.java'));
  const wiersze = PRZYPADKI.map(([m, level, klucz, pon, test, miejsce]) =>
    `    t(stan, ${JSON.stringify(klucz)}, ${JSON.stringify(level)}, ${pon}, ${test}, ${JSON.stringify(miejsce)}, ${Math.round(m * MIN)}L);`).join('\n');
  fs.writeFileSync(path.join(pkg, 'Proba.java'), `package pl.straznik.app;
import java.util.*;
public class Proba {
  static StringBuilder out = new StringBuilder();
  static void t(Map<String, Laczenie.Wpis> stan, String k, String l, boolean p, boolean test, String m, long teraz) {
    // za każdym razem przez zapis i odczyt — tak jak w SharedPreferences
    Map<String, Laczenie.Wpis> s2 = Laczenie.wczytaj(Laczenie.zapisz(stan));
    Laczenie.Wynik w = Laczenie.decyzja(s2, k, l, p, test, m, teraz);
    stan.clear(); stan.putAll(s2);
    StringBuilder ms = new StringBuilder();
    for (String x : w.miejsca) ms.append(ms.length() > 0 ? ";" : "").append(x);
    out.append(w.dzwoni ? "D " : "L ").append(ms).append("\\n");
  }
  public static void main(String[] a) throws Exception {
    Map<String, Laczenie.Wpis> stan = new LinkedHashMap<>();
${wiersze}
    System.out.write(out.toString().getBytes("UTF-8"));
    System.out.flush();
  }
}
`, 'utf8');
  try {
    execFileSync(jdk.javac, ['-encoding', 'UTF-8', '-d', tmp, path.join(pkg, 'Laczenie.java'), path.join(pkg, 'Proba.java')], { stdio: 'pipe' });
    const wynik = execFileSync(jdk.java, ['-cp', tmp, 'pl.straznik.app.Proba'], { encoding: 'utf8' }).trim().split(/\r?\n/);
    const zgodne = JSON.stringify(wynik) === JSON.stringify(OCZEK);
    ok(zgodne, `Laczenie.java (javac) — ${PRZYPADKI.length} przypadków, z zapisem i odczytem stanu`
      + (zgodne ? '' : '\n       ' + wynik.map((x, i) => `${x === OCZEK[i] ? ' ' : '≠'} ${x} | ${OCZEK[i]}`).join('\n       ')));
  } catch (e) {
    ok(false, 'Laczenie.java kompiluje się i działa: ' + String(e.stderr || e.message).slice(0, 400));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\n2. Wpięcie na Androidzie');
const fcm = fs.readFileSync(path.join(JAVA, 'StraznikFcmService.java'), 'utf8');
const alarms = fs.readFileSync(path.join(JAVA, 'Alarms.java'), 'utf8');
const lacz = fs.readFileSync(path.join(JAVA, 'Laczenie.java'), 'utf8');
const iLacz = fcm.indexOf('Alarms.laczenie('), iPost = fcm.indexOf('Alarms.postAlarm('), iFwd = fcm.indexOf('BackgroundPlugin.forwardAlarm(data)');
ok(iLacz > 0 && iLacz < iPost && iLacz < iFwd, 'decyzja o łączeniu PRZED pokazaniem alarmu i przekazaniem do aplikacji');
ok(/klucz_zdarzenia/.test(fcm) && /"1"\.equals\(data\.get\("ponowienie"\)\)/.test(fcm), 'klucz zdarzenia i znacznik ponowienia z wiadomości');
ok(/OKNO_MS = 10 \* 60 \* 1000L/.test(lacz), 'okno 10 min');
const dol = alarms.slice(alarms.indexOf('static void postDolaczone'), alarms.indexOf('static void postDolaczone') + 1600);
ok(/builder\(ctx, CH_QUIET\)/.test(dol) && /notifIdDolaczone/.test(dol) && !/notifId\(voiv\)/.test(dol),
  'dopisanie cichym kanałem pod osobnym identyfikatorem — nie zastępuje dzwoniącego alarmu');
ok(!/setFullScreenIntent|CATEGORY_ALARM|FLAG_INSISTENT/.test(dol), 'dopisanie bez pełnego ekranu i syreny');
const post = alarms.slice(alarms.indexOf('String headline, long sentAtMs, boolean test, String miejsce) {'));
ok(/setFullScreenIntent\(fullScreen, true\)/.test(post) && /setCategory\(Notification\.CATEGORY_ALARM\)/.test(post)
  && /FLAG_INSISTENT/.test(post) && /highChannel\(ctx\)/.test(post),
  'ścieżka czerwonego bez zmian: pełny ekran, kategoria alarmu (Nie przeszkadzać), syrena w pętli');
ok(/postDolaczone\(this, laczenie/.test(fcm) && /"_dolacz", "1"/.test(fcm), 'otwarta aplikacja dostaje dopisanie jako ciche (_dolacz)');
ok(/torAktywny\(this\)/.test(fcm) && /pominiety_tor/.test(fcm), 'odbiór przyjmuje tylko aktywny tor (bez podwójnych przy przejściu)');
ok(/obserwowanyPowiat\(this, terc\)/.test(fcm), 'alarm powiatu spoza zapisanych miejsc odrzucony');

console.log('\n3. iPhone (rozszerzenie powiadomień)');
const nse = path.join(ROOT, 'ios-app', 'ios', 'App', 'NotificationService', 'NotificationService.swift');
if (!fs.existsSync(nse)) {
  console.log('  POMINIĘTE: brak ios-app w tym drzewie (kod iOS jest na gałęzi ios-grota)');
} else {
  const sw = fs.readFileSync(nse, 'utf8');
  ok(/klucz_zdarzenia/.test(sw) && /ponowienie/.test(sw), 'NSE czyta klucz zdarzenia i znacznik ponowienia');
  ok(/600|10 \* 60/.test(sw), 'NSE: okno 10 min');
  ok(/content\.sound = nil/.test(sw), 'NSE: dopisanie bez dźwięku');
}

console.log();
if (bledy) { console.log(`BŁĘDY: ${bledy}`); process.exit(1); }
console.log('Wszystko OK');

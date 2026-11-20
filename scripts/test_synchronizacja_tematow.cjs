/* Wyścig synchronizacji tematów FCM na Androidzie (1.8.08).

   Znalezione 7.11.2026 na emulatorze: zamknięcie Ustawień przy 0 miejsc
   uruchamiało wypisanie z 16 tematów, a zapis miejsca chwilę później drugą
   synchronizację. Starsza mogła zapisać stan po nowszej albo nie zapisać go
   wcale, więc wiersz stanu pokazywał „Wypisywanie…” albo stan sprzed zmiany
   aż do ponownego uruchomienia aplikacji.

   Część JS jest WYKONYWANA (syncObservedRegions, wiersz stanu), część natywna
   sprawdzana w źródle. Kształt kodu bywa łamany na kilka linii, więc wzorce
   dopuszczają dowolne białe znaki. */
const fs = require("fs");
const path = require("path");

const czytaj = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
let bledy = 0;
const sprawdz = (ok, opis) => { console.log((ok ? "  OK  " : "  BLAD") + "  " + opis); if (!ok) bledy++; };

const app = czytaj("frontend/app.js");
const java = czytaj("android-app/android/app/src/main/java/pl/straznik/app/BackgroundPlugin.java");

/* ── 1. JS: zamknięcie Ustawień bez zmiany nie wysyła synchronizacji ───────── */
const mSync = app.match(/\nlet ostatniaSynchronizacja = null;\nfunction syncObservedRegions\([\s\S]*?\n\}\n/);
sprawdz(!!mSync, "app.js: syncObservedRegions z pamięcią ostatniej synchronizacji");
if (mSync) {
  const wywolania = [];
  const srodowisko = { regiony: ["mazowieckie"], off: false, voiv: "mazowieckie", powiaty: [], tor: "woj" };
  // etap 3 (19.11.2026): synchronizacja niesie też powiaty miejsc i tor wskazany przez serwer
  const f = new Function("alertsOff", "Places", "savedPlaces", "IS_APP", "BG", "myVoiv", "syncBrowserPushRegion",
    "powiatyDoTematow", "torTematow",
    mSync[0] + "\nreturn syncObservedRegions;");
  const sync = f(() => srodowisko.off, { observedVoivodeships: () => srodowisko.regiony.slice() }, [], true,
    () => ({ setObservedVoivodeships: (a) => { wywolania.push(a); return Promise.resolve(); } }),
    () => srodowisko.voiv, () => Promise.resolve(), () => srodowisko.powiaty.slice(), () => srodowisko.tor);
  sync();
  sprawdz(wywolania.length === 1, "start aplikacji synchronizuje zawsze");
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 1, "zamknięcie Ustawień bez zmiany — bez synchronizacji");
  srodowisko.regiony = ["mazowieckie", "lubelskie"];
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 2 && wywolania[1].voivodeships.length === 2, "zmiana województw — synchronizacja");
  srodowisko.off = true;
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 3 && wywolania[2].alertsOff === true && wywolania[2].voivodeships.length === 0,
    "wyłączenie alarmów — synchronizacja z pustą listą");
  sync();
  sprawdz(wywolania.length === 4, "wywołanie bez opcji (zgoda, zmiana miejsc) synchronizuje mimo braku zmian");
  srodowisko.off = false;
  sync();
  srodowisko.powiaty = ["0663"];
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 6 && JSON.stringify(wywolania[5].powiaty) === '["0663"]' && wywolania[5].tematy === "woj",
    "etap 3: wczytane granice (nowe powiaty) — synchronizacja z numerami powiatów");
  srodowisko.tor = "pow";
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 7 && wywolania[6].tematy === "pow", "etap 3: serwer przełączył tor — synchronizacja z tematy=pow");
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 7, "etap 3: ten sam tor i powiaty — bez synchronizacji");
  srodowisko.tor = "woj";
  sync({ tylkoPoZmianie: true });
  sprawdz(wywolania.length === 8 && wywolania[7].tematy === "woj", "etap 3: wyłącznik awaryjny (tor woj) — synchronizacja z powrotem");
  sprawdz(wywolania.every(w => !("gps" in w) && !("lat" in w) && !("places" in w)), "do warstwy natywnej nie idą miejsca ani współrzędne");
}
sprawdz(/dlg\.addEventListener\("close",[\s\S]{0,300}?syncObservedRegions\(\{\s*tylkoPoZmianie:\s*true\s*\}\)/.test(app),
  "app.js: zamknięcie Ustawień woła syncObservedRegions({ tylkoPoZmianie: true })");
// zmiana i usunięcie miejsca muszą synchronizować zawsze — wywołanie bez opcji
sprawdz(/placesDlg\.close\(\);toast\(/.test(app) && /savedPlaces=Places\.save\(localStorage,idx<0[\s\S]{0,120}?\);syncObservedRegions\(\);/.test(app),
  "app.js: zapis miejsca synchronizuje bez warunku");

/* ── 2. JS: wiersz „⏳ Zapisywanie…” i samoodświeżanie ───────────────────────── */
const mLinia = app.match(/\n(\s*const loc = previewLang[\s\S]*?const subLine = [\s\S]*?Телефон не записаний на жодне воєводство[^\n]*\n)/);
sprawdz(!!mLinia, "app.js: fragment z wierszem stanu");
if (mLinia) {
  const uruchom = (lang, s, subscribed) => {
    const T = (pl, en, uk) => lang === "pl" ? pl : lang === "uk" ? (uk !== undefined ? uk : en) : en;
    // etap 3: nazwaPowiatu z app.js (tu zastępnik), reszta jak dawniej
    return new Function("previewLang", "T", "esc", "UI", "alertsOff", "s", "subscribed", "noRegion", "nazwaPowiatu",
      mLinia[1] + "\nreturn subLine;")(lang, T, (x) => String(x), { voiv: (v) => v }, () => false, s, subscribed, false,
      (t) => ({ "0663": "Lublin", "0617": "powiat świdnicki" })[t] || t);
  };
  // etap 3 (19.11.2026): tor powiatów
  sprawdz(uruchom("pl", { torAktywny: "pow", topicsConfirmed: ["pow_0663", "pow_0617_krytyczne"] }, [])
    === "Zapisany do alarmów dla powiatów: Lublin, powiat świdnicki (potwierdzone przez Firebase).",
    "tor powiatów: wiersz wymienia powiaty potwierdzone przez Firebase (także _krytyczne)");
  sprawdz(uruchom("pl", { torAktywny: "woj", tematyTryb: "pow", topicsConfirmed: ["voiv_lubelskie"] }, ["Lubelskie"])
    .startsWith("Zapisany do alarmów dla: Lubelskie"),
    "serwer wskazał powiaty, ale Firebase jeszcze nie potwierdził — wiersz mówi prawdę: województwa");
  sprawdz(uruchom("en", { tematyTryb: "pow", topicsSyncing: true }, []).startsWith("⏳ Subscribing this phone to the counties"),
    "EN: „⏳ Subscribing … counties” w trakcie przejścia");
  sprawdz(uruchom("uk", { tematyTryb: "pow", topicsSyncing: true }, []).startsWith("⏳ Записування телефону на повіти"),
    "UK: „⏳ Записування … повіти”");
  sprawdz(uruchom("pl", { torAktywny: "pow", topicsConfirmed: [] }, []).startsWith("Telefon nie jest zapisany"),
    "tor powiatów bez potwierdzonych tematów — nie udaje zapisu");
  sprawdz(uruchom("pl", { topicsSyncing: true }, ["Mazowieckie"]).startsWith("⏳ Zapisywanie telefonu do województw"),
    "PL: w trakcie zapisu „⏳ Zapisywanie…”, nie stan sprzed zmiany");
  sprawdz(uruchom("en", { topicsSyncing: true }, []).startsWith("⏳ Subscribing"), "EN: „⏳ Subscribing…”");
  sprawdz(uruchom("uk", { topicsSyncing: true }, []).startsWith("⏳ Записування"), "UK: „⏳ Записування…”");
  sprawdz(uruchom("pl", { topicsUnsubscribing: true, topicsSyncing: true }, []).startsWith("⏳ Wypisywanie"),
    "wypisywanie ma pierwszeństwo przed zapisem");
  sprawdz(uruchom("pl", {}, ["Lubelskie"]).startsWith("Zapisany do alarmów dla: Lubelskie"),
    "starsza warstwa natywna bez topicsSyncing — wiersz jak dawniej");
}
sprawdz(/const wToku = s\.topicsSyncing \|\| s\.topicsUnsubscribing;[\s\S]{0,200}?setTimeout\(\(\) => refreshBgStatus\(previewLang\), \d+\)/.test(app),
  "app.js: wiersz w toku odświeża się sam, póki okno otwarte");
sprawdz(/else if \(dlg\.open && odswiezStanProby\+\+ < \d+\)/.test(app), "app.js: samoodświeżanie ma limit prób i tylko przy otwartym oknie");

/* ── 3. Android: pokolenie synchronizacji, flagi, straż ponowienia ─────────── */
sprawdz(/final long gen = SYNC_GEN\.incrementAndGet\(\);/.test(java), "Java: każda synchronizacja dostaje nowe pokolenie");
const strazePokolenia = java.match(/if \(SYNC_GEN\.get\(\) != gen\) return;/g) || [];
sprawdz(strazePokolenia.length >= 2, `Java: oba zakończenia (wypisanie i zapis) sprawdzają pokolenie (${strazePokolenia.length})`);
// sprawdzenie pokolenia musi być PRZED zapisem stanu w tym samym słuchaczu
for (const [nazwa, wz] of [["wypisanie", /left\.decrementAndGet\(\) == 0\) \{\s*if \(SYNC_GEN\.get\(\) != gen\) return;[\s\S]{0,200}?p\.edit\(\)/],
                            ["zapis", /pending\.decrementAndGet\(\) == 0\) \{\s*if \(SYNC_GEN\.get\(\) != gen\) return;[\s\S]{0,300}?p\.edit\(\)/]])
  sprawdz(wz.test(java), `Java: ${nazwa} — pokolenie sprawdzane przed zapisem stanu`);
sprawdz(/\.putBoolean\("topics_unsubscribing", target\.isEmpty\(\)\)[\s\S]{0,120}?\.putBoolean\("topics_syncing", !target\.isEmpty\(\)\)/.test(java),
  "Java: flagi „w toku” ustawiane od nowa na starcie każdej synchronizacji (nowsza zdejmuje „Wypisywanie…”)");
const mStraz = java.match(/private static void straz\([\s\S]*?\n    \}\n/);
sprawdz(!!mStraz, "Java: straż ponowienia w osobnej metodzie");
const straz = mStraz ? mStraz[0] : "";
sprawdz(/postDelayed\(\(\) -> \{\s*if \(done\.get\(\) \|\| SYNC_GEN\.get\(\) != gen\) return;/.test(straz),
  "Java: straż działa tylko dla najnowszego, niepotwierdzonego pokolenia");
sprawdz(/if \(cisza < SYNC_RETRY_MS && odlozenia < SYNC_MAX_ODLOZEN\) \{[\s\S]{0,200}?straz\(app, forceAll, retry, gen, done, odlozenia \+ 1\);\s*return;/.test(straz),
  "Java: gdy Firebase niedawno coś potwierdził, straż czeka dalej zamiast dokładać operacji (pomiar 9.11: 85 operacji ≈ 55 s)");
sprawdz(/if \(retry >= SYNC_MAX_RETRY\) return;[\s\S]{0,300}?syncFcmSubscription\(app, forceAll, retry \+ 1\);/.test(straz),
  "Java: po ciszy Firebase ponowienie, z limitem prób");
sprawdz(/OSTATNI_POSTEP\.set\(teraz\);\s*straz\(app, forceAll, retry, gen, done, 0\);/.test(java),
  "Java: każda synchronizacja uruchamia straż");
const sluchacze = (java.match(/addOnCompleteListener\(/g) || []).length;
const postepy = (java.match(/addOnCompleteListener\(\w+ -> (?:\{\s*)?OSTATNI_POSTEP\.set\(System\.currentTimeMillis\(\)\)/g) || []).length;
sprawdz(sluchacze >= 3 && postepy === sluchacze,
  `Java: każde potwierdzenie Firebase odnotowuje postęp (${postepy} z ${sluchacze} słuchaczy), także wypisania bez śledzenia wyniku`);
const retry = Number((java.match(/SYNC_RETRY_MS = ([\d_]+);/) || [])[1]?.replace(/_/g, ""));
const maks = Number((java.match(/SYNC_MAX_RETRY = (\d+);/) || [])[1]);
sprawdz(retry >= 30_000 && retry <= 120_000 && maks >= 1 && maks <= 3,
  `Java: rozsądne ponowienie (${retry} ms × ${maks}) — Firebase sam ponawia od 30 s, nie zasypujemy go`);
sprawdz(/ret\.put\("topicsSyncing", syncing\);/.test(java) && /topics_sync_at", 0\) < \d+_000;/.test(java),
  "Java: status() zwraca topicsSyncing z limitem czasu");
sprawdz(/topics_syncing", false\) && !syncing && fcm\.getString\("topics_error", ""\)\.isEmpty\(\)\)\s*ret\.put\("topicsError"/.test(java),
  "Java: zapis bez potwierdzenia po limicie zamienia się w błąd, nie wisi „⏳” w nieskończoność");
// zabezpieczenie z #15 zostaje: wypisanie ze WSZYSTKICH województw spoza celu
sprawdz(/for \(String v : Alarms\.VOIVS\) doWypisania\.add\(voivTopic\(v\)\);/.test(java),
  "Java: dalej wypisuje ze wszystkich województw spoza celu (zgłoszenie #15)");

/* ── 4. Etap 3: przejście między torami bez przerwy i bez podwójnych (19.11.2026) ── */
const mSyncJ = java.match(/private static void syncFcmSubscription\(Context c, boolean forceAll, int retry\) \{[\s\S]*?\n    \}\n/);
const sj = mSyncJ ? mSyncJ[0] : "";
sprawdz(!!mSyncJ, "Java: synchronizacja tematów znaleziona");
const iZapis = sj.indexOf("fm.subscribeToTopic(t)");
const pierwszyWypisPoZapisie = sj.indexOf("fm.unsubscribeFromTopic(", iZapis);
const wypisPrzedZapisem = sj.slice(sj.indexOf("if (target.isEmpty()) {"), iZapis).replace(/if \(target\.isEmpty\(\)\) \{[\s\S]*?\n        \}\n/, "");
sprawdz(iZapis > 0 && !/unsubscribeFromTopic/.test(wypisPrzedZapisem),
  "Java: przy niepustym celu nic nie jest wypisywane przed zapisem");
sprawdz(/if \(all\) \{[\s\S]*?putString\(KEY_TOR_AKTYWNY, torDocelowy\)[\s\S]*?for \(String s : doWypisania\)\s*fm\.unsubscribeFromTopic\(s\)/.test(sj)
  && pierwszyWypisPoZapisie > iZapis,
  "Java: wypis ze starych tematów i zmiana toru dopiero, gdy Firebase potwierdził CAŁY cel");
sprawdz(/Część celu niepotwierdzona[\s\S]*?suma\.addAll\(confirmed\);[\s\S]*?putStringSet\("topics", suma\)/.test(sj)
  && !/KEY_TOR_AKTYWNY[^\n]*\n[^\n]*suma/.test(sj),
  "Java: niepełne potwierdzenie — SUMA tematów (jak iPhone 1.8.09), tor bez zmian, nic nie wypisane");
sprawdz(/naPow = TOR_POW\.equals\(tryb\) && !powTarget\.isEmpty\(\)/.test(sj),
  "Java: tor powiatów tylko z policzonymi powiatami (pusty zestaw = zostajemy na województwach)");
sprawdz(/doWypisania\.addAll\(znane\)/.test(sj) && /for \(String v : Alarms\.VOIVS\) doWypisania\.add\(voivTopic\(v\)\);/.test(sj),
  "Java: po przejściu wypis ze wszystkich województw i z każdego zleconego powiatu");
sprawdz(/static String torAktywny\(Context c\)[\s\S]{0,400}?return null;/.test(java),
  "Java: tor nieodczytany — odbiór przepuszcza oba (lepiej alarm za dużo niż cisza)");
sprawdz(/call\.getArray\("powiaty", null\)/.test(java) && /matches\("\\\\d\{4\}"\)/.test(java),
  "Java: z JS przychodzą same numery TERYT (4 cyfry), nic innego");

console.log(bledy ? `BLEDY: ${bledy}` : "WSZYSTKO OK");
process.exit(bledy ? 1 : 0);

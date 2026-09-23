/* Strażnik UI localisation. Language changes presentation only: source data,
   scoring, region identifiers and FCM topics always keep their canonical form. */
(function () {
  "use strict";

  const JEZYKI = ["pl", "en", "uk"];
  const saved = localStorage.getItem("straznik_lang");
  let lang = JEZYKI.includes(saved) ? saved : "pl";

  const EN = {
    "fuzja sygnałów · wschodnia Polska": "signal fusion · eastern Poland",
    "Pobierz aplikację": "Download app", "⬇ Pobierz aplikację": "⬇ Download app",
    "⬇ Pobierz na Androida": "⬇ Get it for Android", "⬇ Pobierz na iOS": "⬇ Get it for iOS",
    "Instrukcja": "User guide", "📖 Instrukcja": "📖 User guide",
    "Postaw kawę": "Buy me a coffee", "☕ Postaw kawę": "☕ Buy me a coffee", "Legenda": "Legend",
    "☕ Postaw kawę autorowi": "☕ Buy the author a coffee", "Bałtyk": "Baltic",
    "Sąsiedzi": "Neighbours",
    "łączenie…": "connecting…", "teraz": "now", "NA ŻYWO": "LIVE",
    "Zamknij": "Close", "Zamknij panel": "Close panel",
    "Sygnały": "Signals", "Obiekty ≤ 250 km od granicy": "Objects ≤ 250 km from the border",
    "Lotnictwo wojskowe (ADS-B)": "Military aviation (ADS-B)", "nad PL-wschód": "over eastern Poland",
    "Legenda symboli": "Symbol legend", "Obiekty (Dane: NEPTUN, nad Ukrainą)": "Objects (Data: NEPTUN, over Ukraine)",
    "Dron / BpSP": "Drone / UAV", "Dron Shahed": "Shahed drone", "Dron FPV (lokalny)": "FPV drone (local)",
    "Dron rozpoznawczy": "Reconnaissance drone", "Rakieta manewrująca": "Cruise missile",
    "Rakieta balistyczna": "Ballistic missile", "Bomba kierowana KAB": "KAB guided bomb",
    "MiG-31K (nosiciel)": "MiG-31K (carrier)", "Obiekt nierozpoznany": "Unidentified object",
    "kurs nieznany — ikona nie jest obracana": "unknown heading — the icon is not rotated",
    "obwód UA z alarmem powietrznym, który daje punkty": "Ukrainian oblast with an air-raid alert that adds points",
    "Alarmy u sąsiadów (bez punktów)": "Alerts in neighbouring countries (no points)",
    "rejon Ukrainy z alarmem — poziom czerwony": "Ukrainian district with an alert — red level",
    "rejon Ukrainy z alarmem — poziom żółty": "Ukrainian district with an alert — yellow level",
    "Litwa, Łotwa, Estonia — alarm ogłoszony (wg mediów)": "Lithuania, Latvia, Estonia — alert declared (per media)",
    "pulsujący pierścień — obiekt liczy się teraz do punktów": "pulsing ring — the object currently adds points",
    "okrąg = niepewność pozycji (±km)": "circle = position uncertainty (±km)",
    "przerywana linia = trasa przelotu": "dashed line = flight path",
    "samolot wojskowy (ADS-B, jawny transponder)": "military aircraft (ADS-B, public transponder)",
    "śmigłowiec wojskowy (ADS-B) —": "military helicopter (ADS-B) —",
    "kliknij maszynę: model, przeznaczenie, operator": "select an aircraft: model, role and operator",
    "wysokość bryły 3D rośnie z liczbą punktów;": "3D height increases with the point total;",
    "kliknij obiekt lub województwo po szczegóły": "select an object or province for details",
    "Województwa (suma pkt z 60 min)": "Provinces (60-minute point total)",
    "Strefy PAŻP (tylko informacyjnie)": "PAŻP zones (information only)",
    "strefa stała — stoi tu od dawna": "standing zone — it has been here for a long time",
    "strefa włączona ostatnio (D / R / ADHOC / TSA)": "recently activated zone (D / R / ADHOC / TSA)",
    "strefy": "zones",
    "0–1.9 pkt — spokojnie": "0–1.9 pts — calm", "≥ 2 pkt — podwyższona uwaga": "≥ 2 pts — elevated attention",
    "≥ 4 pkt + potwierdzenie — wysoki priorytet": "≥ 4 pts + confirmation — high priority",
    "+0,5–1": "+0.5–1", "alarm +0,3": "alert +0.3", "+0,5": "+0.5",
    "przygaszony — kolor tylko od sąsiadów, bez alarmu": "dimmed — colour from neighbours only, no alert",
    "WYSOKI PRIORYTET": "HIGH PRIORITY", "PODWYŻSZONA UWAGA": "ELEVATED ATTENTION",
    "POTWIERDZAM — wycisz syrenę": "ACKNOWLEDGE — silence siren",
    "Schronienie — gdzie najbliżej": "Shelter — nearest",
    "Moja lokalizacja": "My location", "Województwo": "Province", "Wykryj z GPS": "Detect with GPS",
    "Moje miejsca": "My places", "📍 Otwórz Moje miejsca": "📍 Open My places",
    "Nie zapisano jeszcze żadnego miejsca.": "No saved places yet.",
    "Lokalizacja jest wyłączona.": "Location is off.",
    "🔔 Włącz powiadomienia w tej przeglądarce": "🔔 Turn on notifications in this browser",
    "🔕 Wyłącz powiadomienia w tej przeglądarce": "🔕 Turn off notifications in this browser",
    "🚨 Zgoda na alarm pełnoekranowy": "🚨 Check full-screen alert permission",
    "◎ Pobierz pozycję jeden raz": "◎ Read location once",
    "Usuń zapisaną pozycję": "Remove saved position",
    "Alarmy przy zamkniętej aplikacji": "Alerts while the app is closed",
    "Ustawienia powiadomień": "Notification settings", "Zgoda na alarm pełnoekranowy": "Full-screen alert permission",
    "Wyłącz oszczędzanie baterii": "Disable battery optimisation", "Sygnały dźwiękowe": "Alert sounds",
    "🔔 Ustawienia powiadomień": "🔔 Notification settings",
    "🔋 Wyłącz oszczędzanie baterii": "🔋 Disable battery optimisation",
    "Test: uwaga": "Test: attention", "Test: syrena": "Test: siren", "Test: pełny alarm": "Test: full alert",
    "Wersja aplikacji": "App version", "Sprawdź aktualizacje": "Check for updates",
    "Zaawansowane: wspólny backend": "Advanced: shared backend", "Adres serwera (opcjonalnie)": "Server address (optional)",
    "Anuluj": "Cancel", "Zapisz": "Save", "Nie teraz": "Not now", "Włącz powiadomienia": "Enable notifications",
    "Język interfejsu": "Interface language", "Polski": "Polish", "Angielski": "English",
    "📍 Wykryj z GPS": "📍 Detect with GPS", "▶ Test: uwaga": "▶ Test: attention",
    "▶ Test: syrena": "▶ Test: siren", "▶ Test: pełny alarm": "▶ Test: full alert",
    "⬆ Sprawdź aktualizacje": "⬆ Check for updates",
    "brak sygnałów": "no signals", "poniżej progu": "below threshold", "brak": "none", "— brak —": "— none —",
    "(okno": "(window", "min)": "min)",
    "Dane:": "Data:", "(agregator OSINT — nie radar; zawsze sprawdzaj confidence i ±km)": "(OSINT aggregator — not radar; always check confidence and ±km)",
    "Mapa:": "Map:",
    "(agregator OSINT — nie radar) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Mapa:": "(OSINT aggregator — not radar) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Map:",
    "(agregator OSINT — nie radar; zawsze sprawdzaj confidence i ±km) · ADS-B: adsb.lol / adsb.fi · Mapa:": "(OSINT aggregator — not radar; always check confidence and ±km) · ADS-B: adsb.lol / adsb.fi · Map:",
  };

  const VOIV_EN = {
    "dolnośląskie":"Lower Silesian", "kujawsko-pomorskie":"Kuyavian-Pomeranian",
    "lubelskie":"Lublin", "lubuskie":"Lubusz", "łódzkie":"Łódź", "małopolskie":"Lesser Poland",
    "mazowieckie":"Masovian", "opolskie":"Opole", "podkarpackie":"Subcarpathian",
    "podlaskie":"Podlaskie", "pomorskie":"Pomeranian", "śląskie":"Silesian",
    "świętokrzyskie":"Świętokrzyskie", "warmińsko-mazurskie":"Warmian-Masurian",
    "wielkopolskie":"Greater Poland", "zachodniopomorskie":"West Pomeranian"
  };
  const TYPE_EN = { uav:"Drone / UAV", shahed:"Shahed drone", fpv:"FPV drone", recon:"Reconnaissance drone",
    missile:"Cruise missile", cruise:"Cruise missile", ballistic:"Ballistic missile", kab:"KAB guided bomb",
    mig31k:"MiG-31K (carrier)", unknown:"Unidentified object" };
  const CONF_EN = { high:"high", medium:"medium", low:"low" };

  /* Ukrainski (od 23.09.2026). Ta sama zasada co w GROCIE: kluczem jest polski
     tekst ze zrodla, a brak tlumaczenia spada na angielski, nie na pusty napis. */
  const UK = {
    "fuzja sygnałów · wschodnia Polska": "синтез сигналів · східна Польща",
    "Pobierz aplikację": "Завантажити застосунок", "⬇ Pobierz aplikację": "⬇ Завантажити застосунок",
    "⬇ Pobierz na Androida": "⬇ Завантажити для Android", "⬇ Pobierz na iOS": "⬇ Завантажити для iOS",
    "Instrukcja": "Інструкція", "📖 Instrukcja": "📖 Інструкція",
    "Postaw kawę": "Пригостити кавою", "☕ Postaw kawę": "☕ Пригостити кавою", "Legenda": "Легенда",
    "☕ Postaw kawę autorowi": "☕ Пригостити автора кавою", "Bałtyk": "Балтика",
    "Sąsiedzi": "Сусіди",
    "łączenie…": "з\u2019єднання…", "teraz": "зараз", "NA ŻYWO": "НАЖИВО",
    "Zamknij": "Закрити", "Zamknij panel": "Закрити панель",
    "Sygnały": "Сигнали", "Obiekty ≤ 250 km od granicy": "Об\u2019єкти ≤ 250 км від кордону",
    "Lotnictwo wojskowe (ADS-B)": "Військова авіація (ADS-B)", "nad PL-wschód": "над сходом Польщі",
    "Legenda symboli": "Легенда символів", "Obiekty (Dane: NEPTUN, nad Ukrainą)": "Об\u2019єкти (Дані: NEPTUN, над Україною)",
    "Dron / BpSP": "Дрон / БпЛА", "Dron Shahed": "Дрон Shahed", "Dron FPV (lokalny)": "FPV-дрон (локальний)",
    "Dron rozpoznawczy": "Розвідувальний дрон", "Rakieta manewrująca": "Крилата ракета",
    "Rakieta balistyczna": "Балістична ракета", "Bomba kierowana KAB": "Керована авіабомба (КАБ)",
    "MiG-31K (nosiciel)": "МіГ-31К (носій)", "Obiekt nierozpoznany": "Невпізнаний об\u2019єкт",
    "kurs nieznany — ikona nie jest obracana": "курс невідомий — іконка не обертається",
    "obwód UA z alarmem powietrznym, który daje punkty": "область України з повітряною тривогою, яка додає бали",
    "Alarmy u sąsiadów (bez punktów)": "Тривоги в сусідніх країнах (без балів)",
    "rejon Ukrainy z alarmem — poziom czerwony": "район України з тривогою — червоний рівень",
    "rejon Ukrainy z alarmem — poziom żółty": "район України з тривогою — жовтий рівень",
    "Litwa, Łotwa, Estonia — alarm ogłoszony (wg mediów)": "Литва, Латвія, Естонія — оголошено тривогу (за ЗМІ)",
    "pulsujący pierścień — obiekt liczy się teraz do punktów": "пульсуюче кільце — об\u2019єкт зараз додає бали",
    "okrąg = niepewność pozycji (±km)": "коло = невизначеність позиції (±км)",
    "przerywana linia = trasa przelotu": "пунктир = пройдений шлях",
    "samolot wojskowy (ADS-B, jawny transponder)": "військовий літак (ADS-B, відкритий транспондер)",
    "śmigłowiec wojskowy (ADS-B) —": "військовий гелікоптер (ADS-B) —",
    "kliknij maszynę: model, przeznaczenie, operator": "торкніться машини: модель, призначення, оператор",
    "wysokość bryły 3D rośnie z liczbą punktów;": "висота 3D-фігури зростає разом із кількістю балів;",
    "kliknij obiekt lub województwo po szczegóły": "торкніться об\u2019єкта або воєводства, щоб побачити деталі",
    "Województwa (suma pkt z 60 min)": "Воєводства (сума балів за 60 хв)",
    "Strefy PAŻP (tylko informacyjnie)": "Зони PAŻP (лише інформативно)",
    "strefa stała — stoi tu od dawna": "постійна зона — діє тут давно",
    "strefa włączona ostatnio (D / R / ADHOC / TSA)": "нещодавно активована зона (D / R / ADHOC / TSA)",
    "strefy": "зони",
    "0–1.9 pkt — spokojnie": "0–1,9 бала — спокійно", "≥ 2 pkt — podwyższona uwaga": "≥ 2 бали — підвищена увага",
    "≥ 4 pkt + potwierdzenie — wysoki priorytet": "≥ 4 бали + підтвердження — високий пріоритет",
    "+0,5–1": "+0,5–1", "alarm +0,3": "тривога +0,3", "+0,5": "+0,5",
    "przygaszony — kolor tylko od sąsiadów, bez alarmu": "приглушений — колір лише від сусідів, без тривоги",
    "WYSOKI PRIORYTET": "ВИСОКИЙ ПРІОРИТЕТ", "PODWYŻSZONA UWAGA": "ПІДВИЩЕНА УВАГА",
    "POTWIERDZAM — wycisz syrenę": "ПІДТВЕРДЖУЮ — вимкнути сирену",
    "Schronienie — gdzie najbliżej": "Укриття — де найближче",
    "Moja lokalizacja": "Моє місцеперебування", "Województwo": "Воєводство", "Wykryj z GPS": "Визначити за GPS",
    "Moje miejsca": "Мої місця", "📍 Otwórz Moje miejsca": "📍 Відкрити Мої місця",
    "Nie zapisano jeszcze żadnego miejsca.": "Ще не збережено жодного місця.",
    "Lokalizacja jest wyłączona.": "Місцеперебування вимкнено.",
    "🔔 Włącz powiadomienia w tej przeglądarce": "🔔 Увімкнути сповіщення в цьому браузері",
    "🔕 Wyłącz powiadomienia w tej przeglądarce": "🔕 Вимкнути сповіщення в цьому браузері",
    "🚨 Zgoda na alarm pełnoekranowy": "🚨 Перевірити дозвіл на повноекранну тривогу",
    "◎ Pobierz pozycję jeden raz": "◎ Зчитати місцеперебування один раз",
    "Usuń zapisaną pozycję": "Видалити збережену позицію",
    "Alarmy przy zamkniętej aplikacji": "Тривоги, коли застосунок закритий",
    "Ustawienia powiadomień": "Налаштування сповіщень", "Zgoda na alarm pełnoekranowy": "Дозвіл на повноекранну тривогу",
    "Wyłącz oszczędzanie baterii": "Вимкнути економію батареї", "Sygnały dźwiękowe": "Звукові сигнали",
    "🔔 Ustawienia powiadomień": "🔔 Налаштування сповіщень",
    "🔋 Wyłącz oszczędzanie baterii": "🔋 Вимкнути економію батареї",
    "Test: uwaga": "Тест: увага", "Test: syrena": "Тест: сирена", "Test: pełny alarm": "Тест: повна тривога",
    "Wersja aplikacji": "Версія застосунку", "Sprawdź aktualizacje": "Перевірити оновлення",
    "Zaawansowane: wspólny backend": "Додатково: спільний сервер", "Adres serwera (opcjonalnie)": "Адреса сервера (необов\u2019язково)",
    "Anuluj": "Скасувати", "Zapisz": "Зберегти", "Nie teraz": "Не зараз", "Włącz powiadomienia": "Увімкнути сповіщення",
    "Język interfejsu": "Мова інтерфейсу", "Polski": "Польська", "Angielski": "Англійська",
    "📍 Wykryj z GPS": "📍 Визначити за GPS", "▶ Test: uwaga": "▶ Тест: увага",
    "▶ Test: syrena": "▶ Тест: сирена", "▶ Test: pełny alarm": "▶ Тест: повна тривога",
    "⬆ Sprawdź aktualizacje": "⬆ Перевірити оновлення",
    "brak sygnałów": "немає сигналів", "poniżej progu": "нижче порога", "brak": "немає", "— brak —": "— немає —",
    "(okno": "(вікно", "min)": "хв)",
    "Dane:": "Дані:", "(agregator OSINT — nie radar; zawsze sprawdzaj confidence i ±km)": "(агрегатор OSINT — не радар; завжди перевіряйте достовірність і ±км)",
    "Mapa:": "Мапа:",
    "(agregator OSINT — nie radar) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Mapa:": "(агрегатор OSINT — не радар) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Мапа:",
    "(agregator OSINT — nie radar; zawsze sprawdzaj confidence i ±km) · ADS-B: adsb.lol / adsb.fi · Mapa:": "(агрегатор OSINT — не радар; завжди перевіряйте достовірність і ±км) · ADS-B: adsb.lol / adsb.fi · Мапа:",
  };

  const VOIV_UK = {
    "dolnośląskie":"Нижньосілезьке", "kujawsko-pomorskie":"Куявсько-Поморське",
    "lubelskie":"Люблінське", "lubuskie":"Любуське", "łódzkie":"Лодзьке", "małopolskie":"Малопольське",
    "mazowieckie":"Мазовецьке", "opolskie":"Опольське", "podkarpackie":"Підкарпатське",
    "podlaskie":"Підляське", "pomorskie":"Поморське", "śląskie":"Сілезьке",
    "świętokrzyskie":"Свентокшиське", "warmińsko-mazurskie":"Вармінсько-Мазурське",
    "wielkopolskie":"Великопольське", "zachodniopomorskie":"Західнопоморське"
  };
  const TYPE_UK = { uav:"Дрон / БпЛА", shahed:"Дрон Shahed", fpv:"FPV-дрон", recon:"Розвідувальний дрон",
    missile:"Крилата ракета", cruise:"Крилата ракета", ballistic:"Балістична ракета", kab:"Керована авіабомба (КАБ)",
    mig31k:"МіГ-31К (носій)", unknown:"Невпізнаний об\u2019єкт" };
  const CONF_UK = { high:"висока", medium:"середня", low:"низька" };

  // Ukrainski bierze najpierw slownik UK, a gdy czegos w nim brakuje - angielski.
  // Polski tekst zostaje tylko w polskiej wersji: mieszanka PL i UK bylaby nieczytelna.
  function tr(s) {
    if (lang === "pl") return s;
    if (lang === "uk") return UK[s] || EN[s] || s;
    return EN[s] || s;
  }
  function voiv(s) {
    if (lang === "pl") return s;
    return (lang === "uk" ? VOIV_UK[s] || VOIV_EN[s] : VOIV_EN[s]) || s;
  }
  function type(s, fallback) {
    if (lang === "pl") return fallback || s;
    return (lang === "uk" ? TYPE_UK[s] || TYPE_EN[s] : TYPE_EN[s]) || fallback || s;
  }
  function confidence(s, fallback) {
    if (lang === "pl") return fallback || s;
    return (lang === "uk" ? CONF_UK[s] || CONF_EN[s] : CONF_EN[s]) || fallback || s;
  }
  // Trzy warianty w jednym miejscu — dla tekstow skladanych w app.js.
  // Brak ukrainskiego (trzeci argument pominiety) spada na angielski.
  function t(pl, en, uk) {
    if (lang === "pl") return pl;
    if (lang === "uk") return uk !== undefined ? uk : en;
    return en;
  }
  function set(next) {
    localStorage.setItem("straznik_lang", JEZYKI.includes(next) ? next : "pl");
    location.reload();
  }

  function previewSettings(next) {
    const en = next !== "pl", dlg = document.getElementById("settings");
    if (!dlg) return;
    const many = (sel, values) => dlg.querySelectorAll(sel).forEach((el,i) => {
      if (values[i] != null) el.textContent = values[i];
    });
    const button = (id, pl, eng) => { const el=document.getElementById(id); if(el) el.textContent=en?eng:pl; };
    const labelLead = (id, pl, eng) => {
      const el=document.getElementById(id)?.closest("label");
      if (el?.firstChild) el.firstChild.nodeValue=(en?eng:pl)+"\n      ";
    };
    // kolejność zgodna z zakładkami: Alarmy → Moje miejsca → Dźwięk → Aplikacja
    many(":scope .set-pane > h3:not(#trail-head)", en
      ? ["Alerts while the app is closed","My places","Alert sounds","Interface language","App version"]
      : ["Alarmy przy zamkniętej aplikacji","Moje miejsca","Sygnały dźwiękowe","Język interfejsu","Wersja aplikacji"]);
    // nagłówki dodane w 1.7.41 — po identyfikatorze, żeby nie przesuwać indeksów wyżej
    button("trail-head", "Mapa: trasy obiektów", "Map: object tracks");
    // Warianty iOS stoją poza selektorami pozycyjnymi (klasa .ios-only), więc
    // w podglądzie języka ustawiamy je po identyfikatorze.
    button("alarmy-intro-ios",
      "Alarmy dla Twojego województwa przychodzą jako powiadomienie push — także gdy aplikacja jest zamknięta, ekran zablokowany albo telefon w uśpieniu. Serwer Strażnika wysyła sygnał prosto na telefon; wystarczy zgoda na powiadomienia. Wymaga to działającego serwera: w trybie awaryjnym (serwer niedostępny) alarmy przychodzą tylko przy otwartej aplikacji.",
      "Alerts for your province arrive as a push notification — also when the app is closed, the screen is locked or the phone is asleep. The Strażnik server sends the signal straight to the phone; notification permission is all that is needed. This needs a working server: in fallback mode (server unreachable) alerts only arrive while the app is open.");
    button("alarm-ios-note",
      "Na iPhonie czerwony alarm przychodzi jako powiadomienie oznaczone „PILNE”: pokazuje się nad blokadą i gra syreną. Nie zapala pełnego ekranu i nie powtarza dźwięku — iOS nie pozwala na to zwykłym aplikacjom. Przy wyciszonym dzwonku alarm będzie bezgłośny: zostanie baner i wibracja — o ile w Ustawienia → Dźwięki i haptyka → Haptyka nie jest wybrane „Nie odtwarzaj w trybie cichym”. Żeby przeszedł także w nocy, sprawdź dwie rzeczy: Ustawienia → Powiadomienia → Strażnik → „Powiadomienia czasowo zależne” oraz Ustawienia → Skupienie → Sen → Aplikacje → dopuść Strażnika. Bez tego iOS wstrzymuje alarm do odblokowania telefonu.",
      "On iPhone a red alert arrives as a notification marked “Urgent”: it appears over the lock screen and plays our siren. It does not take over the screen and does not repeat the sound — iOS does not allow regular apps to do that. With the ringer muted the alert is silent: a banner and a vibration — as long as Settings → Sounds & Haptics → Haptics is not set to “Don’t Play in Silent Mode”. For it to reach you at night, check two settings: Settings → Notifications → Strażnik → “Time Sensitive Notifications” and Settings → Focus → Sleep → Apps → allow Strażnik. Without them iOS holds the alert until you unlock the phone.");
    button("dzwiek-ios-note",
      "Żółty poziom (≥2 pkt) — krótki sygnał uwagi i powiadomienie wyskakujące na ekranie. Czerwony (≥4 pkt) — modulowana syrena alarmu powietrznego + wibracja. Odtwarzane, gdy aplikacja jest otwarta; przy zamkniętej aplikacji alarm przychodzi jako powiadomienie push (z syreną dla czerwonego).",
      "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated air-raid siren and vibration. Played while the app is open; with the app closed the alert arrives as a push notification (with the siren for red).");
    button("ns-head", "Alarm natywny i głośność", "Native alert and volume");
    many(":scope .set-tab", en
      ? ["Alerts","My places","Sound","App"] : ["Alarmy","Moje miejsca","Dźwięk","Aplikacja"]);
    many(":scope .set-pane > p.fineprint:not(#app-version):not(#upd-status):not(#more-links):not(.ios-only)", en ? [
      "Alerts for your province arrive as push notifications even when the app is closed or the phone is asleep. Full-screen permission is required for a red alert to wake the screen. This needs the Strażnik server: in emergency mode (server unavailable) alerts arrive only while the app is open.",
      "A full-screen alert wakes the display and appears above the lock screen. Android 14 or later may revoke this permission after an update, so verify it manually.",
      "Save up to 8 places and choose which provinces you want notifications for. Exact places remain on this device.",
      "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated siren, vibration and a full-screen alert.",
      "The red siren continues until you acknowledge the alert.",
      "The app checks for a newer release at every launch and when it returns to the foreground. A dismissed non-critical update can be checked again here."
    ] : [
      "Alarmy dla Twojego województwa przychodzą jako powiadomienie push — także gdy aplikacja jest zamknięta, ekran wygaszony albo telefon w uśpieniu. Wymaga to działającego serwera: w trybie awaryjnym (serwer niedostępny) alarmy przychodzą tylko przy otwartej aplikacji.",
      "Alarm pełnoekranowy zapala ekran i pokazuje się nad blokadą. Android 14 i nowszy może cofnąć tę zgodę po aktualizacji, dlatego sprawdź ją osobiście.",
      "Zapisz do 8 miejsc i wybierz, dla których województw chcesz otrzymywać powiadomienia. Dokładne miejsca zostają na tym urządzeniu.",
      "Żółty poziom (≥2 pkt) — krótki sygnał uwagi i powiadomienie. Czerwony (≥4 pkt) — modulowana syrena, wibracja i alarm pełnoekranowy.",
      "Przy czerwonym poziomie syrena gra bez przerwy, aż potwierdzisz alarm przyciskiem na ekranie.",
      "Aplikacja sprawdza przy każdym uruchomieniu i powrocie na wierzch, czy jest nowsze wydanie. Pominiętą aktualizację sprawdzisz ręcznie tym przyciskiem."
    ]);
    labelLead("set-voiv", "Województwo", "Province");
    labelLead("set-lang", "Język interfejsu", "Interface language");
    const opts=document.getElementById("set-lang")?.options;
    if(opts?.[0]) opts[0].textContent="Polski";
    if(opts?.[1]) opts[1].textContent="English";
    if(opts?.[2]) opts[2].textContent="Українська";
    button("btn-places","📍 Otwórz Moje miejsca","📍 Open My places");
    button("btn-notif-settings","🔔 Ustawienia powiadomień","🔔 Notification settings");
    button("btn-battery","🔋 Wyłącz oszczędzanie baterii","🔋 Disable battery optimisation");
    button("btn-test-chime","▶ Test: uwaga","▶ Test: attention");
    button("btn-test-siren","▶ Test: syrena","▶ Test: siren");
    button("btn-test-alarm","▶ Test: pełny alarm","▶ Test: full alert");
    button("btn-update","⬆ Sprawdź aktualizacje","⬆ Check for updates");
    const links = dlg.querySelectorAll("#more-links a");
    if (links[0]) links[0].textContent = en ? "User guide ↗" : "Instrukcja użytkownika ↗";
    if (links[1]) {
      links[1].textContent = en ? "Changelog ↗" : "Historia zmian ↗";
      links[1].href = en ? "https://cukierrro.github.io/Straznik/zmiany-en.html"
                         : "https://cukierrro.github.io/Straznik/zmiany.html";
    }
    if (links[2]) links[2].textContent = en ? "Support the author ☕" : "Wesprzyj autora ☕";
    button("set-save","Zapisz","Save");
    const cancel=dlg.querySelector('button[value="cancel"]'); if(cancel) cancel.textContent=en?"Cancel":"Anuluj";
    const summary=dlg.querySelector("summary"); if(summary) summary.textContent=en?"Advanced: shared backend":"Zaawansowane: wspólny backend";
    const api=document.getElementById("set-api"); if(api) api.placeholder=en?"blank = Strażnik server (recommended)":"puste = serwer Strażnika (zalecane)";
    const ver=document.getElementById("app-version");
    if(ver?.textContent) ver.textContent=ver.textContent
      .replace(/^(Zainstalowana wersja|Installed version)/, en?"Installed version":"Zainstalowana wersja");
    const fs=document.getElementById("btn-fullscreen");
    if(fs) fs.textContent = en
      ? (fs.textContent.includes("Zezwól") ? "🚨 Allow full-screen alerts" : "🚨 Check full-screen alert permission")
      : (fs.textContent.includes("Allow") ? "🚨 Zezwól na alarm pełnoekranowy" : "🚨 Sprawdź zgodę na alarm pełnoekranowy");
    if (next === "uk") ukrainize(dlg);
  }

  /* Klucz = tekst angielski widoczny na ekranie (znormalizowany: pojedyncze spacje).
     Bloki z pogrubieniami i odnosnikami stoja nizej, w HTML_UK — tam kolejnosc slow
     w zdaniu ukrainskim jest inna niz w angielskim i tlumaczenie po kawalku wyszloby zle. */
  const EN2UK = {
    "signal fusion · eastern Poland": "синтез сигналів · східна Польща",
    "hosted on Mikrus ↗": "хостинг: Mikrus ↗",
    "UA alerts": "Тривоги UA",
    "⬇ Get it for Android": "⬇ Завантажити для Android",
    "⬇ Get it for iOS": "⬇ Завантажити для iOS",
    "📖 User guide": "📖 Інструкція",
    "☕ Buy me a coffee": "☕ Пригостити кавою",
    "☕ Buy the author a coffee": "☕ Пригостити автора кавою",
    "my region": "мій регіон",
    "zones": "зони",
    "whole PL": "вся Польща",
    "now": "зараз",
    "Data:": "Дані:",
    "Map:": "Мапа:",
    "sources ⓘ": "джерела ⓘ",
    "UNOFFICIAL additional source — it does not replace sirens, RCB or RSO alerts. In a real emergency, follow official instructions.":
      "НЕОФІЦІЙНЕ додаткове джерело — не замінює сирен, Alert RCB чи RSO. У реальній небезпеці виконуйте офіційні вказівки.",
    "Map": "Мапа", "Signals": "Сигнали", "History": "Історія", "More": "Ще",
    "Shelter — nearest": "Укриття — де найближче",
    "About and scoring": "Про застосунок і бали",
    "User guide": "Інструкція",
    "Support the author": "Підтримати автора",
    "Close": "Закрити",
    "no signals": "немає сигналів",
    "no signals in the window": "у вікні немає сигналів",
    "· thresholds: ≥2 attention, ≥4 priority": "· пороги: ≥2 увага, ≥4 пріоритет",
    "(window": "(вікно", "min)": "хв)",
    "Objects ≤ 250 km from the border": "Об’єкти ≤ 250 км від кордону",
    "Military aviation (ADS-B)": "Військова авіація (ADS-B)",
    "over eastern Poland": "над сходом Польщі",
    "Public transponder data (aircraft that choose to be visible) — this is NOT hostile-aircraft tracking.":
      "Відкриті дані транспондерів (літаки, які самі себе показують) — це НЕ стеження за ворожою авіацією.",
    "emergency mode — server unavailable, no alerts while the app is closed":
      "аварійний режим — сервер недоступний, при закритому застосунку тривог немає",
    "Legend": "Легенда",
    "Objects (Data: NEPTUN, over Ukraine)": "Об’єкти (Дані: NEPTUN, над Україною)",
    "Drone / UAV": "Дрон / БпЛА",
    "Shahed drone": "Дрон Shahed",
    "FPV drone (local)": "FPV-дрон (локальний)",
    "Reconnaissance drone": "Розвідувальний дрон",
    "Cruise missile": "Крилата ракета",
    "Ballistic missile": "Балістична ракета",
    "KAB guided bomb": "Керована авіабомба (КАБ)",
    "MiG-31K (carrier)": "МіГ-31К (носій)",
    "Unidentified object": "Невпізнаний об’єкт",
    "unknown heading — the icon is not rotated": "курс невідомий — іконка не обертається",
    "pulsing ring — the object currently adds points": "пульсуюче кільце — об’єкт зараз додає бали",
    "circle = position uncertainty (±km)": "коло = невизначеність позиції (±км)",
    "dashed line = flight path": "пунктир = пройдений шлях",
    "military aircraft (ADS-B, public transponder)": "військовий літак (ADS-B, відкритий транспондер)",
    "military helicopter (ADS-B) — select an aircraft: model, role and operator":
      "військовий гелікоптер (ADS-B) — торкніться машини: модель, призначення, оператор",
    "Provinces (60-minute point total)": "Воєводства (сума балів за 60 хв)",
    "0–1.9 pts — calm": "0–1,9 бала — спокійно",
    "≥ 2 pts — elevated attention": "≥ 2 бали — підвищена увага",
    "≥ 4 pts + confirmation — high priority": "≥ 4 бали + підтвердження — високий пріоритет",
    "dimmed — colour from neighbours only, no alert": "приглушений — колір лише від сусідів, без тривоги",
    "Ukrainian oblast with an air-raid alert that adds points": "область України з повітряною тривогою, яка додає бали",
    "Alerts in neighbouring countries (no points)": "Тривоги в сусідніх країнах (без балів)",
    "Ukrainian district with an alert — red level": "район України з тривогою — червоний рівень",
    "Ukrainian district with an alert — yellow level": "район України з тривогою — жовтий рівень",
    "Lithuania, Latvia, Estonia — alert declared (per media)": "Литва, Латвія, Естонія — оголошено тривогу (за ЗМІ)",
    "3D height increases with the point total;": "висота 3D-фігури зростає разом із кількістю балів;",
    "select an object or province for details": "торкніться об’єкта або воєводства, щоб побачити деталі",
    "PAŻP zones (information only)": "Зони PAŻP (лише інформативно)",
    "standing zone — it has been here for a long time": "постійна зона — діє тут давно",
    "recently activated zone (D / R / ADHOC / TSA)": "нещодавно активована зона (D / R / ADHOC / TSA)",
    "the zone layer adds no points — only a rare D/R/NPZ/ADHOC zone from the ground up over the east or north scores; tap a zone for details":
      "шар зон не додає балів — бали дає лише рідкісна зона D/R/NPZ/ADHOC від землі над сходом чи північчю; торкніться зони, щоб побачити деталі",
    "HIGH PRIORITY": "ВИСОКИЙ ПРІОРИТЕТ",
    "ELEVATED ATTENTION": "ПІДВИЩЕНА УВАГА",
    "What to do: go to a shelter or a room without windows, away from glass. Follow RCB and emergency-service messages.":
      "Що робити: перейдіть в укриття або в кімнату без вікон, подалі від скла. Стежте за повідомленнями RCB і служб.",
    "This is an UNOFFICIAL signal. Check sirens, RCB and RSO alerts — official channels are authoritative.":
      "Це НЕОФІЦІЙНИЙ сигнал. Перевірте сирени, Alert RCB і RSO — вирішальними є офіційні канали.",
    "ACKNOWLEDGE — silence siren": "ПІДТВЕРДЖУЮ — вимкнути сирену",
    "Where to shelter": "Де сховатися",
    "Watch the map": "Спостерігати за мапою",
    "I am safe": "Я в безпеці",
    "unofficial fusion of air-threat signals": "неофіційний синтез сигналів про повітряну загрозу",
    "Strażnik is an unofficial air-threat map for Poland. It combines reports of drones and missiles over Ukraine with RCB and RSO alerts, PAŻP airspace zones, ADS-B traffic and media reports. The map works live in a browser, and the Android and iPhone apps send alert notifications, even when the app is closed.":
      "Strażnik — неофіційна мапа повітряної загрози для Польщі. Вона поєднує повідомлення про дрони й ракети над Україною з тривогами RCB і RSO, зонами повітряного простору PAŻP, рухом ADS-B і повідомленнями ЗМІ. Мапа працює наживо у браузері, а застосунки для Android та iPhone надсилають сповіщення про тривогу навіть тоді, коли застосунок закритий.",
    "This is NOT an official warning system. It does not replace sirens, RCB or RSO alerts. In a real emergency, follow official channels. Strażnik provides an additional, potentially earlier signal — nothing more.":
      "Це НЕ офіційна система оповіщення. Вона не замінює сирен, Alert RCB чи RSO. У реальній небезпеці керуйтеся офіційними каналами. Strażnik дає додатковий, можливо раніший сигнал — не більше.",
    "How it works": "Як це працює",
    "No single signal proves that a threat exists. The app assigns points to several independent indicators and totals them over a 60-minute window for each province. A signal has full weight for 30 minutes, then fades linearly to zero. The resulting total determines the level, and the full breakdown is always visible.":
      "Жоден окремий сигнал не доводить, що загроза існує. Застосунок нараховує бали кільком незалежним показникам і підсумовує їх у 60-хвилинному вікні для кожного воєводства. Сигнал має повну вагу 30 хвилин, потім лінійно згасає до нуля. Отримана сума визначає рівень, а повний розклад завжди видно.",
    "Object heading towards Poland — score depends on class, count, distance and independent confirmations":
      "Об’єкт курсом на Польщу — бал залежить від класу, кількості, відстані та незалежних підтверджень",
    "Official alert in a Ukrainian region bordering Poland": "Офіційна тривога в прикордонній з Польщею області України",
    "Media": "ЗМІ",
    "Local reports of sirens, explosions or airspace violations; one article alone cannot trigger an alert":
      "Місцеві повідомлення про сирени, вибухи чи порушення повітряного простору; сама лише стаття тривоги не вмикає",
    "Official RCB alert from the Regional Warning System or a new gov.pl/RCB notice. Since 17.09.2026 RCB sends three kinds of message and they weigh accordingly: “the situation is being monitored” 1.5 · “a massive attack is under way… react to alarm signals” 3 · “threat of an air attack, find a safe place” 4.5. A later alert does not add to the earlier one — the current one counts":
      "Офіційний Alert RCB із Регіональної системи оповіщення або нове повідомлення gov.pl/RCB. Від 17.09.2026 RCB надсилає три види повідомлень, і вони важать відповідно: «ситуацію моніторять» 1,5 · «триває масований напад… реагуйте на сигнали тривоги» 3 · «загроза нападу з повітря, знайдіть безпечне місце» 4,5. Пізніша тривога не додається до попередньої — рахується поточна",
    "Military aviation activity over twice the seven-day baseline for the same time of day — informational only":
      "Активність військової авіації понад подвійну семиденну норму для тієї самої пори доби — лише інформація",
    "Rare ground-up ADHOC/R/NPZ/D zone; routine and repeating zones do not score. In the north it weighs twice as much, because NEPTUN does not reach there":
      "Рідкісна зона ADHOC/R/NPZ/D від землі; рутинні й повторювані зони балів не дають. На півночі важить удвічі більше, бо NEPTUN туди не сягає",
    "+1 płn.": "+1 півн.",
    "Baltic": "Балтика",
    "Air incident reported by Lithuanian, Latvian or Estonian media; an air-raid alert announced there is only a trace (Lithuania 0.3, Latvia 0.18, Estonia 0.12); an all-clear ends its contribution. Only a report from the last 30 minutes about something happening now counts — commentary and after-the-fact reports do not. It reaches the whole coast: Podlaskie, Warmian-Masurian and Pomeranian at full weight, West Pomeranian at half":
      "Повітряний інцидент за повідомленнями литовських, латвійських чи естонських ЗМІ; оголошена там повітряна тривога — лише слід (Литва 0,3, Латвія 0,18, Естонія 0,12); відбій завершує її внесок. Рахується лише повідомлення за останні 30 хвилин про те, що відбувається зараз — коментарі й ретроспективи ні. Сягає всього узбережжя: Підляське, Вармінсько-Мазурське й Поморське з повною вагою, Західнопоморське — з половинною",
    "alert +0.3": "тривога +0,3",
    "Neighbours": "Сусіди",
    "NATO neighbour airspace closure in northern Romania, Estonia or Lithuania — observational signal":
      "Закриття повітряного простору сусідом по НАТО на півночі Румунії, в Естонії чи Литві — спостережний сигнал",
    "How NEPTUN object points are calculated": "Як нараховуються бали за об’єкти NEPTUN",
    "One Shahed 80 km from the border is different from six Shaheds 50 km away, while a short-range FPV drone does not threaten Poland. The score combines object class, count, distance, confidence and position quality.":
      "Один Shahed за 80 км від кордону — це не те саме, що шість Shahed за 50 км, а FPV-дрон малої дальності Польщі не загрожує. Бал поєднує клас об’єкта, кількість, відстань, достовірність і якість позиції.",
    "Object class": "Клас об’єкта",
    "ballistic missile 3.0 · MiG-31K 2.6 · cruise missile 2.4 · KAB 1.8 · Shahed 1.4 · drone 1.1 · reconnaissance 0.15 · FPV 0":
      "балістична ракета 3,0 · МіГ-31К 2,6 · крилата ракета 2,4 · КАБ 1,8 · Shahed 1,4 · дрон 1,1 · розвідувальний 0,15 · FPV 0",
    "Count": "Кількість",
    "square root of object count — four objects weigh twice as much as one, not four times as much":
      "квадратний корінь із кількості об’єктів — чотири об’єкти важать удвічі більше за один, а не вчетверо",
    "Distance": "Відстань",
    "<30 km ×1.6 · <60 km ×1.3 · <100 km ×1.0 · <150 km ×0.55 · <250 km ×0.25 · farther 0":
      "<30 км ×1,6 · <60 км ×1,3 · <100 км ×1,0 · <150 км ×0,55 · <250 км ×0,25 · далі 0",
    "Wave": "Хвиля",
    "three different objects heading at Poland within 15 minutes and closer than 150 km add 0.5 pt together — several objects at once mean more than each on its own":
      "три різні об’єкти курсом на Польщу протягом 15 хвилин і ближче ніж 150 км разом додають 0,5 бала — кілька об’єктів одночасно означають більше, ніж кожен окремо",
    "Confidence": "Достовірність",
    "confidence, independent report count and observation status": "достовірність, кількість незалежних повідомлень і статус спостереження",
    "Position quality": "Якість позиції",
    "source point ×1.0 · source-reported area ×0.6 · recognised locality centre ×0.5; area positions cannot trigger ETA thresholds":
      "точка джерела ×1,0 · район, повідомлений джерелом, ×0,6 · розпізнаний центр населеного пункту ×0,5; районні позиції не можуть вмикати пороги за часом підльоту",
    "The model was checked against documented incidents. A mass border violation or a missile immediately next to the border crosses an alert threshold; routine activity over western Ukraine stays below it. NEPTUN contribution is capped at 8 points.":
      "Модель перевірено на задокументованих подіях. Масове порушення кордону або ракета одразу біля кордону переходять поріг тривоги; звичайна активність над заходом України лишається нижче. Внесок NEPTUN обмежено 8 балами.",
    "Estimated arrival time": "Орієнтовний час підльоту",
    "Distance alone is misleading: 130 km may mean about 10 minutes for a cruise missile and about 45 minutes for a drone. When possible, Strażnik estimates time to the Polish border and to your province using reported, measured or class-typical speed.":
      "Сама лише відстань оманлива: 130 км для крилатої ракети — це близько 10 хвилин, а для дрона — близько 45. Коли це можливо, Strażnik оцінює час підльоту до кордону Польщі й до вашого воєводства за повідомленою, виміряною або типовою для класу швидкістю.",
    "The estimate is conservative: 2.5 minutes are deducted for measured source delay. With a known or calculated heading, at least two confirmations and medium/high confidence, the model can raise yellow at ≤10 minutes and red at ≤5 minutes.":
      "Оцінка консервативна: 2,5 хвилини віднімаємо на виміряну затримку джерела. За відомого або обчисленого курсу, щонайменше двох підтверджень і середньої чи високої достовірності модель може підняти жовтий при ≤10 хвилинах, а червоний — при ≤5 хвилинах.",
    "This is an estimate, not a promise. It assumes unchanged speed and heading and does not account for air defence. No time is shown when heading is unknown. NEPTUN's ‘confirmed’ may confirm a report rather than coordinate accuracy. A recognised locality-centre point gets only a rounded area distance, with no route or ETA.":
      "Це оцінка, а не обіцянка. Вона припускає незмінні швидкість і курс і не враховує протиповітряної оборони. Коли курс невідомий, часу не показуємо. «Підтверджено» в NEPTUN може означати підтвердження повідомлення, а не точності координат. Точка, розпізнана як центр населеного пункту, отримує лише округлену відстань по району — без маршруту й часу підльоту.",
    "Levels": "Рівні",
    "≥ 2 pts — ELEVATED ATTENTION: yellow region, short attention sound and heads-up notification.":
      "≥ 2 бали — ПІДВИЩЕНА УВАГА: жовтий регіон, короткий сигнал уваги і спливне сповіщення.",
    "≥ 4 pts and a confirmation — HIGH PRIORITY: red region, modulated air-raid siren, vibration and loud notification.":
      "≥ 4 бали й підтвердження — ВИСОКИЙ ПРІОРИТЕТ: червоний регіон, модульована сирена повітряної тривоги, вібрація і гучне сповіщення.",
    "Where to find things": "Де що знайти",
    "☰ Panel — province scores, signal timeline, nearby objects and military aviation.":
      "☰ Панель — бали воєводств, стрічка сигналів, найближчі об’єкти й військова авіація.",
    "Legend — explains every map symbol and colour.": "Легенда — пояснює кожен символ і колір на мапі.",
    "⚙ Settings — your province, alert permissions, sound tests, language and optional backend.":
      "⚙ Налаштування — ваше воєводство, дозволи на тривоги, тести звуку, мова і власний сервер.",
    "◎ / ⤢ — return to your region or show Poland and Ukraine.": "◎ / ⤢ — повернення до свого регіону або показ Польщі й України.",
    "zones — shows active PAŻP airspace zones (airspace closed by the military). Tap a zone to see what it is and since when it has been active. Zones add no points — they are information only.":
      "зони — показують активні зони повітряного простору PAŻP (простір, закритий військовими). Торкніться зони, щоб побачити, що це і відколи діє. Зони балів не додають — це лише інформація.",
    "Top LEDs — data-source status; select an object or aircraft for details.":
      "Діоди вгорі — стан джерел даних; торкніться об’єкта або літака, щоб побачити деталі.",
    "What this app does NOT do": "Чого цей застосунок НЕ робить",
    "NEPTUN is an OSINT/crowdsourced aggregator, not radar, so confidence and position uncertainty are always shown. A new ID at the same locality-centre point does not prove a new physical object and is not automatically counted twice. ADS-B contains only public transponder emissions and cannot reveal aircraft flying dark.":
      "NEPTUN — агрегатор OSINT і повідомлень людей, а не радар, тому ми завжди показуємо достовірність і невизначеність позиції. Новий ідентифікатор у тій самій точці центру населеного пункту не доводить появи нового фізичного об’єкта і не рахується автоматично вдруге. ADS-B містить лише відкриті сигнали транспондерів і не покаже літаків, які летять без них.",
    "Data: NEPTUN · adsb.lol / airplanes.live · PAŻP · gov.pl/RCB · regional and Baltic media · neighbouring airspace sources · map © CARTO, © OpenStreetMap":
      "Дані: NEPTUN · adsb.lol / airplanes.live · PAŻP · gov.pl/RCB · регіональні та балтійські ЗМІ · джерела про повітряний простір сусідів · мапа © CARTO, © OpenStreetMap",
    "I understand — continue": "Зрозуміло — далі",
    "Data sources": "Джерела даних",
    "Each LED at the top represents one data source. Fusion relies on agreement between several sources, so one unavailable source reduces confirmation rather than disabling warnings.":
      "Кожна діода вгорі — це одне джерело даних. Синтез спирається на збіг кількох джерел, тому одне недоступне джерело зменшує підтвердження, а не вимикає попередження.",
    "🛰 Foreign aircraft over the eastern flank": "🛰 Чужі літаки над східним флангом",
    "Military aircraft with Russian or Belarusian registration visible in public ADS-B/MLAT data over and around the eastern flank. In history, this panel follows the selected time. This observes transponder emissions; it is not radar tracking and is not an alert. Missing data does not imply empty airspace.":
      "Військові літаки з російською чи білоруською реєстрацією, видимі у відкритих даних ADS-B/MLAT над східним флангом і поблизу. В історії ця панель іде за обраним часом. Це спостереження сигналів транспондерів, а не радарне стеження, і не тривога. Відсутність даних не означає порожнього неба.",
    "In range now": "Зараз у зоні",
    "Log — entered / disappeared from range": "Журнал — увійшли / зникли із зони",
    "Cameras": "Камери",
    "Public city and tourism cameras. Previews refresh every 30 seconds. Cameras show the ground, not the sky; they only provide additional context.":
      "Відкриті міські й туристичні камери. Перегляди оновлюються кожні 30 секунд. Камери показують землю, а не небо; вони дають лише додатковий контекст.",
    "I do not list cameras from Ukraine: since 2022 live streams from them have been banned, because they help correct artillery fire. Collecting them in an app that tracks air objects would be exactly the use that ban protects against.":
      "Я не показую камер з України: від 2022 року трансляції з них заборонені, бо допомагають коригувати вогонь. Збирати їх у застосунку, що стежить за повітряними об’єктами, було б саме тим застосуванням, від якого ця заборона захищає.",
    "Push alerts": "Push-сповіщення",
    "receive warnings even when you are not looking at your phone": "отримуйте попередження навіть тоді, коли не дивитесь у телефон",
    "Strażnik is useful only if it can warn you before you open it. Alerts for your region arrive as push notifications, even when the app is closed and the screen is off.":
      "Strażnik корисний лише тоді, коли може попередити вас, перш ніж ви його відкриєте. Тривоги для вашого регіону приходять як push-сповіщення навіть при закритому застосунку й вимкненому екрані.",
    "Notification permission is required. For red alerts, full-screen alert permission is also recommended.":
      "Потрібен дозвіл на сповіщення. Для червоних тривог радимо також дозвіл на повноекранну тривогу.",
    "We only ask for notification permission. So that a red alert can reach you at night, keep “Time Sensitive Notifications” on and allow Strażnik in your Sleep focus (Settings → Focus → Sleep → Apps).":
      "Ми просимо лише дозвіл на сповіщення. Щоб червона тривога дійшла вночі, тримайте увімкненими «Сповіщення з урахуванням часу» і дозвольте Strażnika у фокусі «Сон» (Налаштування → Фокус → Сон → Програми).",
    "Not now": "Не зараз",
    "Enable notifications": "Увімкнути сповіщення",
    "Full-screen alert": "Повноекранна тривога",
    "check the permission after an update": "перевірте дозвіл після оновлення",
    "Android 14 and later may turn this permission off when an app from outside the Play Store is updated. Without it a red alert will not wake the locked screen — you will only get a regular notification.":
      "Android 14 і новіші можуть вимкнути цей дозвіл, коли оновлюється застосунок з-поза Play Store. Без нього червона тривога не розбудить заблокованого екрана — ви отримаєте лише звичайне сповіщення.",
    "We will open system settings: allow full-screen notifications for Strażnik and come back to the app.":
      "Ми відкриємо системні налаштування: дозвольте Strażnikowi повноекранні сповіщення і поверніться до застосунку.",
    "Check permission": "Перевірити дозвіл",
    "Alerts": "Тривоги", "My places": "Мої місця", "Sound": "Звук", "App": "Застосунок",
    "Alerts while the app is closed": "Тривоги, коли застосунок закритий",
    "Alerts for your province arrive as push notifications even when the app is closed or the phone is asleep. Full-screen permission is required for a red alert to wake the screen. This needs the Strażnik server: in emergency mode (server unavailable) alerts arrive only while the app is open.":
      "Тривоги для вашого воєводства приходять як push-сповіщення навіть тоді, коли застосунок закритий або телефон спить. Щоб червона тривога розбудила екран, потрібен дозвіл на повноекранну тривогу. Для цього потрібен сервер Strażnika: в аварійному режимі (сервер недоступний) тривоги приходять лише при відкритому застосунку.",
    "Alerts for your province arrive as a push notification — also when the app is closed, the screen is locked or the phone is asleep. The Strażnik server sends the signal straight to the phone; notification permission is all that is needed. This needs a working server: in fallback mode (server unreachable) alerts only arrive while the app is open.":
      "Тривоги для вашого воєводства приходять як push-сповіщення — також коли застосунок закритий, екран заблокований або телефон спить. Сервер Strażnika надсилає сигнал просто на телефон; достатньо дозволу на сповіщення. Для цього потрібен робочий сервер: в аварійному режимі (сервер недоступний) тривоги приходять лише при відкритому застосунку.",
    "Alerts on this phone": "Тривоги на цьому телефоні",
    "Turn off if you only want to view the map": "Вимкніть, якщо хочете лише дивитися мапу",
    "🔔 Notification settings": "🔔 Налаштування сповіщень",
    "🔋 Disable battery optimisation": "🔋 Вимкнути економію батареї",
    "🚨 Allow full-screen alerts": "🚨 Дозволити повноекранні тривоги",
    "🚨 Check full-screen alert permission": "🚨 Перевірити дозвіл на повноекранну тривогу",
    "On iPhone a red alert arrives as a notification marked “Urgent”: it appears over the lock screen and plays our siren. It does not take over the screen and does not repeat the sound — iOS does not allow regular apps to do that. With the ringer muted the alert is silent: a banner and a vibration — as long as Settings → Sounds & Haptics → Haptics is not set to “Don’t Play in Silent Mode”. For it to reach you at night, check two settings: Settings → Notifications → Strażnik → “Time Sensitive Notifications” and Settings → Focus → Sleep → Apps → allow Strażnik. Without them iOS holds the alert until you unlock the phone.":
      "На iPhone червона тривога приходить як сповіщення з позначкою «Терміново»: воно з’являється над заблокованим екраном і програє нашу сирену. Воно не займає всього екрана і не повторює звуку — iOS не дозволяє цього звичайним застосункам. При вимкненому дзвінку тривога буде беззвучною: залишиться банер і вібрація — якщо в Налаштування → Звуки і тактильні сигнали → Тактильні сигнали не вибрано «Не відтворювати в тихому режимі». Щоб вона проходила й уночі, перевірте два місця: Налаштування → Сповіщення → Strażnik → «Сповіщення з урахуванням часу» і Налаштування → Фокус → Сон → Програми → дозвольте Strażnika. Без цього iOS притримає тривогу до розблокування телефону.",
    "A full-screen alert wakes the display and appears above the lock screen. Android 14 or later may revoke this permission after an update, so verify it manually.":
      "Повноекранна тривога вмикає екран і показується над блокуванням. Android 14 і новіші можуть скасувати цей дозвіл після оновлення, тому перевірте його особисто.",
    "Save up to 8 places and choose which provinces you want notifications for. Exact places remain on this device.":
      "Збережіть до 8 місць і виберіть, для яких воєводств хочете отримувати сповіщення. Точні місця залишаються на цьому пристрої.",
    "Alert sounds": "Звукові сигнали",
    "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated siren, vibration and a full-screen alert.":
      "Жовтий рівень (≥2 бали) — сигнал уваги і спливне сповіщення. Червоний (≥4 бали) — модульована сирена, вібрація і повноекранна тривога.",
    "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated air-raid siren and vibration. Played while the app is open; with the app closed the alert arrives as a push notification (with the siren for red).":
      "Жовтий рівень (≥2 бали) — сигнал уваги і спливне сповіщення. Червоний (≥4 бали) — модульована сирена повітряної тривоги і вібрація. Звучить при відкритому застосунку; при закритому тривога приходить як push-сповіщення (із сиреною для червоного).",
    "▶ Test: attention": "▶ Тест: увага",
    "▶ Test: siren": "▶ Тест: сирена",
    "▶ Test: full alert": "▶ Тест: повна тривога",
    "The red siren continues until you acknowledge the alert.": "При червоному рівні сирена грає безперервно, доки ви не підтвердите тривогу.",
    "Native alert and volume": "Системна тривога і гучність",
    "Red alert always at full volume": "Червона тривога завжди на повній гучності",
    "🔊 Android sound settings": "🔊 Налаштування звуку Android",
    "▶ Test: red native (in 5 s)": "▶ Тест: червона системна (через 5 с)",
    "▶ Test: yellow native (in 5 s)": "▶ Тест: жовта системна (через 5 с)",
    "The test uses the real notification path: lock the screen within 5 seconds to check the alert above the lock screen. Silence it with the button on the alert screen or “Wycisz alarm” in the notification.":
      "Тест іде справжнім шляхом сповіщення: заблокуйте екран протягом 5 секунд, щоб побачити тривогу над блокуванням. Вимкніть її кнопкою на екрані тривоги або «Wycisz alarm» у сповіщенні.",
    "Interface language": "Мова інтерфейсу",
    "Map: object tracks": "Мапа: шляхи об’єктів",
    "Drones and missiles (NEPTUN)": "Дрони й ракети (NEPTUN)",
    "Aircraft and helicopters (ADS-B)": "Літаки й гелікоптери (ADS-B)",
    "Off": "Вимкнено",
    "Flown track": "Пройдений шлях",
    "Track and heading": "Шлях і курс",
    "Off (followed aircraft only)": "Вимкнено (лише супроводжуваний літак)",
    "App version": "Версія застосунку",
    "⬆ Check for updates": "⬆ Перевірити оновлення",
    "The app checks for a newer release at every launch and when it returns to the foreground. A dismissed non-critical update can be checked again here.":
      "Застосунок перевіряє наявність новішого випуску при кожному запуску й поверненні на передній план. Пропущене некритичне оновлення можна перевірити тут вручну.",
    "Advanced: shared backend": "Додатково: спільний сервер",
    "Server address (optional)": "Адреса сервера (необов’язково)",
    "By default the app uses the Strażnik server (straznik.eu) — data and fusion are computed once on the server. When the server is unavailable, the app switches to its built-in mode and computes on the device. Enter your own HTTPS address (e.g. https://straznik.your-domain.pl) only if you want to use your own backend. HTTP and certificates added manually to the phone are not supported in the production build.":
      "Типово застосунок користується сервером Strażnika (straznik.eu) — дані й синтез рахуються один раз на сервері. Коли сервер недоступний, застосунок переходить у вбудований режим і рахує сам на пристрої. Власну адресу HTTPS (напр. https://straznik.ваш-домен.pl) вказуйте лише тоді, коли хочете користуватися власним сервером. HTTP і сертифікати, додані до телефону вручну, у виробничому випуску не підтримуються.",
    "User guide ↗": "Інструкція ↗",
    "Changelog ↗": "Історія змін ↗",
    "Support the author ☕": "Підтримати автора ☕",
    "Cancel": "Скасувати",
    "Save": "Зберегти",
    "A saved place does not indicate your presence. Data remains on this device.":
      "Збережене місце не означає, що ви там перебуваєте. Дані лишаються на цьому пристрої.",
    "＋ Add place": "＋ Додати місце",
    "Place name": "Назва місця",
    "Place scope": "Точність місця",
    "Province": "Воєводство",
    "Province + one-time location": "Воєводство + одноразове місцеперебування",
    "◎ Read location once": "◎ Зчитати місцеперебування один раз",
    "Remove saved position": "Видалити збережену позицію",
    "Watch alerts for this province": "Стежити за тривогами для цього воєводства",
    "How it works: when the app is closed, in the background or the screen is locked, you receive a province-level alert. After it arrives, open Strażnik and keep it in the foreground — for a saved exact location the app locally shows distance and, when heading and speed allow it, an estimated arrival time.":
      "Як це працює: коли застосунок закритий, у фоні або екран заблокований, ви отримуєте тривогу рівня воєводства. Після цього відкрийте Strażnika й тримайте його на передньому плані — для збереженого точного місця застосунок локально покаже відстань, а коли курс і швидкість це дозволяють, і орієнтовний час підльоту.",
    "Several places in the same province create one notification subscription. Province names are shared with the notification provider; place names and coordinates are not sent to the VPS or notifications.":
      "Кілька місць в одному воєводстві створюють одну підписку на сповіщення. Назви воєводств передаються постачальникові сповіщень; назви місць і координати не надсилаються ні на сервер, ні у сповіщення.",
    "Delete place": "Видалити місце",
    "Cancel changes": "Скасувати зміни",
    "Save on device": "Зберегти на пристрої",
    "📍 Detect with GPS": "📍 Визначити за GPS",
    "📍 Open My places": "📍 Відкрити Мої місця",
    "connecting…": "з’єднання…",
    "LIVE": "НАЖИВО",
    "(OSINT aggregator — not radar) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Map:":
      "(агрегатор OSINT — не радар) · ADS-B: adsb.lol / adsb.fi · PAŻP · RCB · Мапа:",
    "(OSINT aggregator — not radar; always check confidence and ±km) · ADS-B: adsb.lol / adsb.fi · Map:":
      "(агрегатор OSINT — не радар; завжди перевіряйте достовірність і ±км) · ADS-B: adsb.lol / adsb.fi · Мапа:",
    "An eastern event also raises awareness in neighbouring provinces: a neighbour gets 40% of its points, the next ring 40% of that (16%) and so on, providing earlier awareness farther west. Transferred points alone do not send a notification.":
      "Подія на сході підвищує увагу й у сусідніх воєводствах: сусід отримує 40% балів, наступне коло — 40% від цього (16%) і так далі, що дає раніше попередження далі на захід. Самі лише перенесені бали сповіщення не надсилають.",
    "Buy me a coffee": "Пригостити кавою",
    "Download app": "Завантажити застосунок",
    "Symbol legend": "Легенда символів",
    "Detect with GPS": "Визначити за GPS",
    "My location": "Моє місцеперебування",
  };

  function translateStatic(root) {
    if (lang === "pl") return;
    document.documentElement.lang = "en";
    document.title = "Strażnik — air threat map and alerts for Poland";
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const raw = node.nodeValue, key = raw.trim();
      if (!key || !EN[key]) continue;
      node.nodeValue = raw.replace(key, EN[key]);
    }
    // Atrybucja jest podzielona linkami na kilka węzłów, więc jej krótkie
    // fragmenty tłumaczymy bez usuwania wymaganych odnośników do mapy i danych.
    const fragments = [["agregator OSINT — nie radar", "OSINT aggregator — not radar"],
      // wiersz legendy o śmigłowcu jest jednym węzłem łamanym w źródle na dwie linie,
      // więc nie trafia w słownik całych fraz — tłumaczymy go po kawałku
      ["śmigłowiec wojskowy (ADS-B)", "military helicopter (ADS-B)"],
      ["kliknij maszynę: model, przeznaczenie, operator",
       "select an aircraft: model, role and operator"],
      ["zawsze sprawdzaj", "always check"], ["Mapa:", "Map:"]];
    for (const node of nodes) for (const [from,to] of fragments)
      if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
    const attrs = {
      "btn-download": ["title","Download the latest Strażnik app for Android"],
      "btn-ios": ["title","Get the Strażnik app for iPhone on the App Store"],
      "btn-instructions": ["title","Open the full Strażnik user guide"],
      "btn-about": ["title","About Strażnik — what it is and how it works"],
      "btn-legend": ["title","Symbol legend"], "btn-settings": ["title","My location and settings"],
      "btn-panel": ["title","Signal panel"], "btn-history": ["title","12-hour history"],
      "btn-home": ["title","Return to my region"], "btn-fit": ["title","Show all of Poland and Ukraine"]
    };
    for (const [id, [a,v]] of Object.entries(attrs)) {
      const el = document.getElementById(id); if (!el) continue;
      el.setAttribute(a,v); if (el.hasAttribute("aria-label")) el.setAttribute("aria-label",v);
    }
    document.querySelector(".brand")?.setAttribute("aria-label", "About Strażnik");
    document.getElementById("status-leds")?.setAttribute("title", "Data-source status — select for details");
    const api = document.getElementById("set-api"); if (api) api.placeholder = "blank = Strażnik server (recommended)";
    const set = (sel, value) => { const el = document.querySelector(sel); if (el) el.textContent = value; };
    const setMany = (sel, values) => document.querySelectorAll(sel).forEach((el,i) => {
      if (values[i] != null) el.textContent = values[i];
    });
    // innerHTML, bo w okienku są odnośniki (GitHub, Mikrus) — textContent je kasował
    const brandInfo = document.querySelector(".brand-info");
    if (brandInfo) brandInfo.innerHTML = "<b>Strażnik</b> is an unofficial early-warning system. It combines NEPTUN, "
      + "ADS-B, PAŻP, RCB, media and Ukrainian regional alerts into one air-threat assessment for Polish provinces. "
      + "It is an <b>additional</b> source and does not replace sirens, RCB or RSO alerts. "
      + '<a href="https://github.com/cukierrro/Straznik" target="_blank" rel="noopener">Source code on GitHub ↗</a>'
      + '<div class="brand-info-host"><img src="assets/mikrus-logo.svg" alt="Mikrus" width="74" height="12">'
      + "<p>Strażnik's server is provided by <b>Mikrus</b> — Polish VPS hosting for enthusiasts. "
      + "Thank you for supporting the project!</p>"
      + '<a href="https://mikr.us" target="_blank" rel="noopener">Mikrus website ↗</a></div>';
    set("#disclaimer span", "UNOFFICIAL additional source — it does not replace sirens, RCB or RSO alerts. In a real emergency, follow official instructions.");
    // nowa nawigacja 1.7.23: dolne zakładki, menu „Więcej", kadrowanie mapy
    setMany("#tabbar .tab-btn > span:not(.badge)", ["Map", "Signals", "History", "More"]);
    set("#more-sheet h3", "More");
    // GROTA po identyfikatorze, reszta bez niej: tłumaczenie po kolejności przesunęło się o jeden,
    // gdy w 1.7.68 na górze doszedł wpis GROTY („About and scoring” stało przy GROCIE).
    set("#btn-grota span", "Shelter — nearest");
    setMany("#more-sheet .sheet-row:not(#btn-grota) span", ["About and scoring", "User guide",
      "Support the author"]);
    // kolejność kafelków na mapie: mój region → strefy → cała PL
    setMany("#map-actions .map-btn span", ["my region", "zones", "whole PL"]);
    const zoneNote = [...document.querySelectorAll("#legend .muted-row")].pop();
    if (zoneNote) zoneNote.textContent = "the zone layer adds no points — only a rare D/R/NPZ/ADHOC "
      + "zone from the ground up over the east or north scores; tap a zone for details";
    const live = document.getElementById("tb-live");
    if (live) { live.innerHTML = "SWITCH<br>TO LIVE"; live.title = "Back to live view";
      live.setAttribute("aria-label", "Back to live view"); }
    const mode = document.querySelector(".tb-mode .tb-two");
    if (mode) mode.innerHTML = "HISTORY<br>VIEW";
    setMany("#settings .set-tab", ["Alerts", "My places", "Sound", "App"]);
    const langOpts = document.getElementById("set-lang")?.options;
    if (langOpts?.[2]) langOpts[2].textContent = "Українська";
    if (langOpts?.[0]) langOpts[0].textContent = "Polski";
    // linki w zakładce „Aplikacja" są wyłączone z tłumaczenia zbiorczego (żeby nie
    // skasować odnośników), więc podpisy ustawiamy osobno
    setMany("#more-links a", ["User guide ↗", "Changelog ↗", "Support the author ☕"]);
    const changes = document.querySelector('#more-links a[href*="zmiany"]');
    if (changes) changes.href = "https://cukierrro.github.io/Straznik/zmiany-en.html";
    // atrybucja: nazwy własne zostają, opis źródła musi być po angielsku
    const attr = document.getElementById("attr-text");
    if (attr) attr.innerHTML = '<b>Data: <a href="https://neptun.in.ua" target="_blank" rel="noopener">NEPTUN</a></b>'
      + ' (OSINT aggregator — not radar; always check confidence and ±km)'
      + ' · ADS-B: adsb.lol / adsb.fi · Map: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>'
      + ' © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';
    const moreClose = document.querySelector('#more-sheet button[value="cancel"]');
    if (moreClose) moreClose.textContent = "Close";
    set("#adsb-list + p", "Public transponder data (aircraft that choose to be visible) — this is NOT hostile-aircraft tracking.");
    set("#alarm-todo", "What to do: go to a shelter or a room without windows, away from glass. Follow RCB and emergency-service messages.");
    set("#alarm-grota span", "Where to shelter");
    set("#alarm-map", "Watch the map");
    set("#alarm-safe", "I am safe");
    set("#cam-title", "Cameras");
    const camNote = document.querySelectorAll("#cameras p.fineprint")[1];
    if (camNote) camNote.textContent = "I do not list cameras from Ukraine: since 2022 live streams from them have been banned, because they help correct artillery fire. Collecting them in an app that tracks air objects would be exactly the use that ban protects against.";
    set("#onboard-bg h2", "Push alerts");
    set("#settings details p.fineprint", "By default the app uses the Strażnik server (straznik.eu) — data and fusion are computed once on the server. When the server is unavailable, the app switches to its built-in mode and computes on the device. Enter your own HTTPS address (e.g. https://straznik.your-domain.pl) only if you want to use your own backend. HTTP and certificates added manually to the phone are not supported in the production build.");
    set("#alarm-overlay .alarm-note", "This is an UNOFFICIAL signal. Check sirens, RCB and RSO alerts — official channels are authoritative.");
    set("#about .about-sub", "unofficial fusion of air-threat signals");
    setMany("#about .about-body > p", [
      "Strażnik is an unofficial air-threat map for Poland. It combines reports of drones and missiles over Ukraine with RCB and RSO alerts, PAŻP airspace zones, ADS-B traffic and media reports. The map works live in a browser, and the Android and iPhone apps send alert notifications, even when the app is closed.",
      "No single signal proves that a threat exists. The app assigns points to several independent indicators and totals them over a 60-minute window for each province. A signal has full weight for 30 minutes, then fades linearly to zero. The resulting total determines the level, and the full breakdown is always visible.",
      "One Shahed 80 km from the border is different from six Shaheds 50 km away, while a short-range FPV drone does not threaten Poland. The score combines object class, count, distance, confidence and position quality.",
      "The model was checked against documented incidents. A mass border violation or a missile immediately next to the border crosses an alert threshold; routine activity over western Ukraine stays below it. NEPTUN contribution is capped at 8 points.",
      "Distance alone is misleading: 130 km may mean about 10 minutes for a cruise missile and about 45 minutes for a drone. When possible, Strażnik estimates time to the Polish border and to your province using reported, measured or class-typical speed.",
      "The estimate is conservative: 2.5 minutes are deducted for measured source delay. With a known or calculated heading, at least two confirmations and medium/high confidence, the model can raise yellow at ≤10 minutes and red at ≤5 minutes.",
      "This is an estimate, not a promise. It assumes unchanged speed and heading and does not account for air defence. No time is shown when heading is unknown. NEPTUN's ‘confirmed’ may confirm a report rather than coordinate accuracy. A recognised locality-centre point gets only a rounded area distance, with no route or ETA.",
      "An eastern event also raises awareness in neighbouring provinces: a neighbour gets 40% of its points, the next ring 40% of that (16%) and so on, providing earlier awareness farther west. Transferred points alone do not send a notification.",
      "NEPTUN is an OSINT/crowdsourced aggregator, not radar, so confidence and position uncertainty are always shown. A new ID at the same locality-centre point does not prove a new physical object and is not automatically counted twice. ADS-B contains only public transponder emissions and cannot reveal aircraft flying dark.",
      "Data: NEPTUN · adsb.lol / airplanes.live · PAŻP · gov.pl/RCB · regional and Baltic media · neighbouring airspace sources · map © CARTO, © OpenStreetMap"
    ]);
    const [north, redNote] = document.querySelectorAll("#about .about-note");
    if (redNote) redNote.innerHTML = "<b>4 pts alone are not enough.</b> Red needs a "
      + "confirmation: either an RCB alert saying “find a safe place”, or a real "
      + "strike object heading at Poland — less than 15 minutes of flight away or closer "
      + "than 50 km to the border. Reconnaissance drones and reports alone do not open red. "
      + "When a region has 4 pts without a confirmation it stays yellow, and Strażnik "
      + "says so on the card. The rule applies from 23.09.2026: before that an RCB alert "
      + "about a monitored situation together with Ukrainian oblast alarms and the media "
      + "could turn a region red with an empty map.";
    if (north) north.innerHTML = "<b>The north (Pomeranian, West Pomeranian, "
      + "Warmian-Masurian, Kuyavian-Pomeranian) is scored differently</b>, because "
      + "NEPTUN covers Ukraine and gives those provinces zero. What remains is PA\u017bP, "
      + "media (including a wave of reports about fighters scrambled over the Baltic), "
      + "Baltic media, RCB and neighbouring closures, so a PA\u017bP zone weighs 1 pt "
      + "there instead of 0.5. None of these raises the level on its own: zone 1 + media "
      + "report 1 = 2 pts (yellow); zone 1 + Baltic incident 0.5 = 1.5 pts — neighbouring "
      + "media are not enough on their own.";
    const lic = document.getElementById("about-license");
    if (lic) lic.innerHTML = '© 2026 cukierrro · all rights reserved · '
      + '<a href="https://github.com/cukierrro/Straznik/blob/main/LICENSE" target="_blank" rel="noopener">licence</a> · third-party licences: '
      + '<a href="https://github.com/cukierrro/Straznik/blob/main/NOTICE" target="_blank" rel="noopener">NOTICE</a>'
      + ' · server: <a href="https://mikr.us" target="_blank" rel="noopener">hosted on Mikrus ↗</a>';
    const host = document.querySelector(".brand-host");
    if (host) { host.querySelector("span").textContent = "hosted on Mikrus ↗";
      host.setAttribute("aria-label", "Strażnik is hosted on Mikrus — open the Mikrus website"); }
    set("#about .warn-box", "This is NOT an official warning system. It does not replace sirens, RCB or RSO alerts. In a real emergency, follow official channels. Strażnik provides an additional, potentially earlier signal — nothing more.");
    // stałe teksty z <b>, dlatego innerHTML (setMany ustawia textContent)
    [
      "<b>Ballistic missiles</b> (e.g. Iskander) fly for a few minutes — Strażnik cannot warn about them in advance. Sirens and the RCB Alert are what count.",
      "<b>The Belarusian direction:</b> NEPTUN describes objects over Ukraine; over Belarus we see nothing. From that side only the RCB Alert and media remain.",
      "<b>Kaliningrad and the Baltic:</b> no source on objects in the air — only Baltic media, neighbouring airspace zones and the RCB Alert.",
      "<b>Low-flying missiles</b> without observer reports may not appear in the data at all.",
      "<b>A MiG-31K take-off</b> and alerts for all of Ukraine are shown as information, not as an alert for Poland."
    ].forEach((html, i) => { const li = document.querySelectorAll("#about-blind li")[i]; if (li) li.innerHTML = html; });
    setMany("#about h3", ["How it works", "How NEPTUN object points are calculated", "Estimated arrival time", "Levels", "Where to find things", "What this app does NOT do"]);
    setMany("#about .about-tab:first-of-type tr td:nth-child(2)", [
      "Object heading towards Poland — score depends on class, count, distance and independent confirmations",
      "Official alert in a Ukrainian region bordering Poland",
      "Local reports of sirens, explosions or airspace violations; one article alone cannot trigger an alert",
      "Official RCB alert from the Regional Warning System or a new gov.pl/RCB notice. Since 17.09.2026 RCB sends three kinds of message and they weigh accordingly: “the situation is being monitored” 1.5 · “a massive attack is under way… react to alarm signals” 3 · “threat of an air attack, find a safe place” 4.5. A later alert does not add to the earlier one — the current one counts",
      "Military aviation activity over twice the seven-day baseline for the same time of day — informational only",
      "Rare ground-up ADHOC/R/NPZ/D zone; routine and repeating zones do not score. In the north it weighs twice as much, because NEPTUN does not reach there",
      "Air incident reported by Lithuanian, Latvian or Estonian media; an air-raid alert announced there is only a trace (Lithuania 0.3, Latvia 0.18, Estonia 0.12); an all-clear ends its contribution. Only a report from the last 30 minutes about something happening now counts — commentary and after-the-fact reports do not. It reaches the whole coast: Podlaskie, Warmian-Masurian and Pomeranian at full weight, West Pomeranian at half",
      "NATO neighbour airspace closure in northern Romania, Estonia or Lithuania — observational signal"
    ]);
    setMany("#about .about-tab:nth-of-type(2) tr td:first-child", ["Object class", "Count", "Distance", "Wave", "Confidence", "Position quality"]);
    setMany("#about .about-tab:nth-of-type(2) tr td:nth-child(2)", [
      "ballistic missile 3.0 · MiG-31K 2.6 · cruise missile 2.4 · KAB 1.8 · Shahed 1.4 · drone 1.1 · reconnaissance 0.15 · FPV 0",
      "square root of object count — four objects weigh twice as much as one, not four times as much",
      "<30 km ×1.6 · <60 km ×1.3 · <100 km ×1.0 · <150 km ×0.55 · <250 km ×0.25 · farther 0",
      "three different objects heading at Poland within 15 minutes and closer than 150 km add 0.5 pt together — several objects at once mean more than each on its own",
      "confidence, independent report count and observation status",
      "source point ×1.0 · source-reported area ×0.6 · recognised locality centre ×0.5; area positions cannot trigger ETA thresholds"
    ]);
    setMany("#about .lvl-row", [
      "≥ 2 pts — ELEVATED ATTENTION: yellow region, short attention sound and heads-up notification.",
      "≥ 4 pts and a confirmation — HIGH PRIORITY: red region, modulated air-raid siren, vibration and loud notification."
    ]);
    setMany("#about .about-list li", [
      "☰ Panel — province scores, signal timeline, nearby objects and military aviation.",
      "Legend — explains every map symbol and colour.",
      "⚙ Settings — your province, alert permissions, sound tests, language and optional backend.",
      "◎ / ⤢ — return to your region or show Poland and Ukraine.",
      "zones — shows active PAŻP airspace zones (airspace closed by the military). "
        + "Tap a zone to see what it is and since when it has been active. Zones add no "
        + "points — they are information only.",
      "Top LEDs — data-source status; select an object or aircraft for details."
    ]);
    set("#about-close", "I understand — continue");
    set("#sources h3", "Data sources");
    set("#sources > p:first-of-type", "Each LED at the top represents one data source. Fusion relies on agreement between several sources, so one unavailable source reduces confirmation rather than disabling warnings.");
    set("#watch h3", "🛰 Foreign aircraft over the eastern flank");
    setMany("#watch .watch-h", ["In range now", "Log — entered / disappeared from range"]);
    set("#watch > p", "Military aircraft with Russian or Belarusian registration visible in public ADS-B/MLAT data over and around the eastern flank. In history, this panel follows the selected time. This observes transponder emissions; it is not radar tracking and is not an alert. Missing data does not imply empty airspace.");
    set("#cameras > p:first-of-type", "Public city and tourism cameras. Previews refresh every 30 seconds. Cameras show the ground, not the sky; they only provide additional context.");
    set("#fs-check h2", "Full-screen alert");
    set("#fs-check .about-sub", "check the permission after an update");
    setMany("#fs-check .about-body > p", [
      "Android 14 and later may turn this permission off when an app from outside the Play Store is updated. Without it a red alert will not wake the locked screen — you will only get a regular notification.",
      "We will open system settings: allow full-screen notifications for Strażnik and come back to the app."
    ]);
    set("#fs-check-skip", "Not now");
    set("#fs-check-open", "Check permission");
    set("#onboard-bg .about-sub", "receive warnings even when you are not looking at your phone");
    // Teksty pokazywane tylko w aplikacji na iPhone'a (klasa .ios-only w index.html)
    set("#onboard-bg-ios", "We only ask for notification permission. So that a red alert can reach you at night, keep “Time Sensitive Notifications” on and allow Strażnik in your Sleep focus (Settings → Focus → Sleep → Apps).");
    set("#alarmy-intro-ios", "Alerts for your province arrive as a push notification — also when the app is closed, the screen is locked or the phone is asleep. The Strażnik server sends the signal straight to the phone; notification permission is all that is needed. This needs a working server: in fallback mode (server unreachable) alerts only arrive while the app is open.");
    set("#alarm-ios-note", "On iPhone a red alert arrives as a notification marked “Urgent”: it appears over the lock screen and plays our siren. It does not take over the screen and does not repeat the sound — iOS does not allow regular apps to do that. With the ringer muted the alert is silent: a banner and a vibration — as long as Settings → Sounds & Haptics → Haptics is not set to “Don’t Play in Silent Mode”. For it to reach you at night, check two settings: Settings → Notifications → Strażnik → “Time Sensitive Notifications” and Settings → Focus → Sleep → Apps → allow Strażnik. Without them iOS holds the alert until you unlock the phone.");
    set("#dzwiek-ios-note", "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated air-raid siren and vibration. Played while the app is open; with the app closed the alert arrives as a push notification (with the siren for red).");
    setMany("#onboard-bg .about-body > p:not(.ios-only)", [
      "Strażnik is useful only if it can warn you before you open it. Alerts for your region arrive as push notifications, even when the app is closed and the screen is off.",
      "Notification permission is required. For red alerts, full-screen alert permission is also recommended."
    ]);
    setMany("#settings .set-pane > p.fineprint:not(#app-version):not(#upd-status):not(#more-links):not(.ios-only)", [
      "Alerts for your province arrive as push notifications even when the app is closed or the phone is asleep. Full-screen permission is required for a red alert to wake the screen. This needs the Strażnik server: in emergency mode (server unavailable) alerts arrive only while the app is open.",
      "A full-screen alert wakes the display and appears above the lock screen. Android 14 or later may revoke this permission after an update, so verify it manually.",
      "Save up to 8 places and choose which provinces you want notifications for. Exact places remain on this device.",
      "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated siren, vibration and a full-screen alert.",
      "The red siren continues until you acknowledge the alert.",
      "The app checks for a newer release at every launch and when it returns to the foreground. A dismissed non-critical update can be checked again here."
    ]);
    set("#alerts-on-label", "Alerts on this phone");
    set("#alerts-on-note", "Turn off if you only want to view the map");
    set("#ns-head", "Native alert and volume");
    set("#ns-label", "Red alert always at full volume");
    const nsNote = document.getElementById("ns-note");
    if (nsNote) nsNote.innerHTML = "The siren uses the Android <b>“Alarms”</b> volume (not “Ring” or “Media”). A red alert raises it to <b>at least half</b> so the siren is never silent. The option above is <b>off</b> by default — when switched on, a red alert sets the volume to maximum, also at night. Either way the previous volume returns when you silence the alert. The yellow attention sound uses your normal volume.";
    set("#btn-sound-settings", "🔊 Android sound settings");
    set("#btn-native-test", "▶ Test: red native (in 5 s)");
    set("#btn-native-test-yellow", "▶ Test: yellow native (in 5 s)");
    set("#ns-test-note", "The test uses the real notification path: lock the screen within 5 seconds to check the alert above the lock screen. Silence it with the button on the alert screen or “Wycisz alarm” in the notification.");
    set("#trail-head", "Map: object tracks");
    const tn = document.getElementById("trail-neptun-label"); if (tn?.firstChild) tn.firstChild.nodeValue = "Drones and missiles (NEPTUN) ";
    const ta = document.getElementById("trail-adsb-label"); if (ta?.firstChild) ta.firstChild.nodeValue = "Aircraft and helicopters (ADS-B) ";
    const tno = document.getElementById("set-trail-neptun")?.options;
    if (tno) { tno[0].textContent = "Off"; tno[1].textContent = "Flown track"; tno[2].textContent = "Track and heading"; }
    const tao = document.getElementById("set-trail-adsb")?.options;
    if (tao) { tao[0].textContent = "Off (followed aircraft only)"; tao[1].textContent = "Flown track"; tao[2].textContent = "Track and heading"; }
    const trailNote = document.getElementById("trail-note");
    if (trailNote) trailNote.innerHTML = "The heading line covers 30 minutes of drone or missile flight (15 minutes for aircraft), with dots every 5 minutes. For NEPTUN objects it is drawn <b>only for a heading measured from movement</b> — not for a heading inferred from a target name or for an area position. It assumes an unchanged heading; it is not a forecast.";
    set("#places-dialog h2", "My places");
    const placesClose=document.getElementById("places-close"); if(placesClose)placesClose.setAttribute("aria-label","Close");
    set("#places-intro", "A saved place does not indicate your presence. Data remains on this device.");
    set("#place-add", "＋ Add place");
    const plabels=document.querySelectorAll("#places-dialog form > label:not(.place-alerts)");
    ["Place name","Place scope","Province"].forEach((v,i)=>{if(plabels[i]?.firstChild)plabels[i].firstChild.nodeValue=v;});
    const precision=document.getElementById("place-precision")?.options;
    if(precision){precision[0].textContent="Province";precision[1].textContent="Province + one-time location";}
    const placeName=document.getElementById("place-name"); if(placeName)placeName.placeholder="e.g. Home";
    set("#place-gps", "◎ Read location once"); set("#place-gps-remove", "Remove saved position");
    const alerts=document.querySelector(".place-alerts"); if(alerts?.firstChild)alerts.firstChild.nodeValue="Watch alerts for this province ";
    set("#places-alert-model", "How it works: when the app is closed, in the background or the screen is locked, you receive a province-level alert. After it arrives, open Strażnik and keep it in the foreground — for a saved exact location the app locally shows distance and, when heading and speed allow it, an estimated arrival time.");
    set("#places-privacy", "Several places in the same province create one notification subscription. Province names are shared with the notification provider; place names and coordinates are not sent to the VPS or notifications.");
    set("#place-delete", "Delete place"); set("#place-cancel", "Cancel changes");
    const submit=document.querySelector('#places-form button[type="submit"]'); if(submit)submit.textContent="Save on device";
    document.querySelectorAll("dialog menu button, #src-close, #watch-close, #cam-close").forEach(el => {
      if (el.textContent.trim() === "Zamknij") el.textContent = "Close";
    });
    if (lang === "uk") ukrainize(root);
  }

  /* Ukrainski powstaje z gotowego angielskiego ekranu: podmieniamy teksty wezlow
     i opisy przyciskow. Brak tlumaczenia zostawia tekst angielski — widac wtedy
     luke, zamiast pustego miejsca. Klucze sa znormalizowane (bez zlamanych linii). */
  const norm = (t) => t.trim().replace(/\s+/g, " ");

  const ATTR_UK = {
    "#btn-download": ["title", "Завантажити найновіший застосунок Strażnik для Android"],
    "#btn-ios": ["title", "Завантажити Strażnik для iPhone в App Store"],
    "#btn-instructions": ["title", "Відкрити повну інструкцію Strażnika"],
    "#btn-about": ["title", "Про Strażnika — що це і як працює"],
    "#btn-legend": ["title", "Легенда символів"],
    "#btn-settings": ["title", "Моє місцеперебування й налаштування"],
    "#btn-panel": ["title", "Панель сигналів"],
    "#btn-history": ["title", "Історія за 12 годин"],
    "#btn-home": ["title", "Повернутися до мого регіону"],
    "#btn-fit": ["title", "Показати всю Польщу й Україну"],
    "#status-leds": ["title", "Стан джерел даних — торкніться, щоб побачити деталі"],
    ".brand": ["aria-label", "Про Strażnika"],
    "#tb-live": ["title", "Повернутися до перегляду наживо"],
  };

  function ukrainize(root) {
    document.documentElement.lang = "uk";
    document.title = "Strażnik — мапа повітряних загроз і тривоги для Польщі";
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const uk = EN2UK[norm(node.nodeValue)];
      if (uk) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), uk);
    }
    for (const [sel, [attr, value]] of Object.entries(ATTR_UK)) {
      const el = document.querySelector(sel);
      if (!el) continue;
      el.setAttribute(attr, value);
      if (attr === "title" && el.hasAttribute("aria-label")) el.setAttribute("aria-label", value);
    }
    const api = document.getElementById("set-api");
    if (api) api.placeholder = "порожнє = сервер Strażnika (рекомендовано)";
    const placeName = document.getElementById("place-name");
    if (placeName) placeName.placeholder = "напр. Дім";
    const live = document.getElementById("tb-live");
    if (live) live.innerHTML = "ПЕРЕЙТИ<br>НАЖИВО";
    const mode = document.querySelector(".tb-mode .tb-two");
    if (mode) mode.innerHTML = "ПЕРЕГЛЯД<br>ІСТОРІЇ";
    const brandInfo = document.querySelector(".brand-info");
    if (brandInfo) brandInfo.innerHTML = "<b>Strażnik</b> — неофіційна система раннього попередження. "
      + "Вона поєднує NEPTUN, ADS-B, PAŻP, RCB, ЗМІ та тривоги в областях України в одну оцінку "
      + "повітряної загрози для воєводств Польщі. Це <b>додаткове</b> джерело, яке не замінює сирен, "
      + "Alert RCB чи повідомлень RSO. "
      + '<a href="https://github.com/cukierrro/Straznik" target="_blank" rel="noopener">Вихідний код на GitHub ↗</a>'
      + '<div class="brand-info-host"><img src="assets/mikrus-logo.svg" alt="Mikrus" width="74" height="12">'
      + "<p>Сервер Strażnika надає <b>Mikrus</b> — польський VPS-хостинг для ентузіастів. "
      + "Дякуємо за підтримку проєкту!</p>"
      + '<a href="https://mikr.us" target="_blank" rel="noopener">Сайт Mikrus ↗</a></div>';
    const attr = document.getElementById("attr-text");
    if (attr) attr.innerHTML = '<b>Дані: <a href="https://neptun.in.ua" target="_blank" rel="noopener">NEPTUN</a></b>'
      + ' (агрегатор OSINT — не радар; завжди перевіряйте достовірність і ±км)'
      + ' · ADS-B: adsb.lol / adsb.fi · Мапа: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>'
      + ' © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';
    const [northUk, redUk] = document.querySelectorAll("#about .about-note");
    if (northUk) northUk.innerHTML = "<b>Північ (Поморське, Західнопоморське, Вармінсько-Мазурське, "
      + "Куявсько-Поморське) оцінюється інакше</b>, бо NEPTUN охоплює Україну і дає цим воєводствам нуль. "
      + "Залишаються PAŻP, ЗМІ (зокрема хвиля повідомлень про підняті над Балтикою винищувачі), "
      + "балтійські ЗМІ, RCB і закриття простору в сусідів, тому зона PAŻP важить там 1 бал замість 0,5. "
      + "Жоден із цих сигналів сам рівня не піднімає: зона 1 + повідомлення ЗМІ 1 = 2 бали (жовтий); "
      + "зона 1 + балтійський інцидент 0,5 = 1,5 бала — самих лише сусідських ЗМІ не досить.";
    if (redUk) redUk.innerHTML = "<b>Самих 4 балів не досить.</b> Червоний потребує підтвердження: "
      + "або тривоги RCB зі словами «знайдіть безпечне місце», або реального ударного об’єкта курсом "
      + "на Польщу — менш ніж 15 хвилин лету чи ближче ніж 50 км до кордону. Самі лише розвідувальні "
      + "дрони й повідомлення червоного не відкривають. Коли регіон має 4 бали без підтвердження, він "
      + "лишається жовтим, і Strażnik пише про це на картці. Правило діє від 23.09.2026: раніше тривога "
      + "RCB про моніторинг ситуації разом із тривогами в областях України та ЗМІ могла зробити регіон "
      + "червоним із порожньою мапою.";
    [
      "<b>Балістичні ракети</b> (напр. «Іскандер») летять кілька хвилин — Strażnik не попередить про них заздалегідь. Вирішальні сирени й Alert RCB.",
      "<b>Білоруський напрямок:</b> NEPTUN описує об’єкти над Україною; над Білоруссю ми не бачимо нічого. З того боку залишаються лише Alert RCB і ЗМІ.",
      "<b>Калінінград і Балтика:</b> немає джерела про об’єкти в повітрі — лише балтійські ЗМІ, зони повітряного простору сусідів і Alert RCB.",
      "<b>Низько летючі ракети</b> без повідомлень спостерігачів можуть узагалі не з’явитися в даних.",
      "<b>Зліт МіГ-31К</b> і тривоги для всієї України показуємо як інформацію, а не як тривогу для Польщі."
    ].forEach((html, i) => { const li = document.querySelectorAll("#about-blind li")[i]; if (li) li.innerHTML = html; });
    const licUk = document.getElementById("about-license");
    if (licUk) licUk.innerHTML = '© 2026 cukierrro · усі права застережено · '
      + '<a href="https://github.com/cukierrro/Straznik/blob/main/LICENSE" target="_blank" rel="noopener">ліцензія</a> · ліцензії третіх сторін: '
      + '<a href="https://github.com/cukierrro/Straznik/blob/main/NOTICE" target="_blank" rel="noopener">NOTICE</a>'
      + ' · сервер: <a href="https://mikr.us" target="_blank" rel="noopener">хостинг Mikrus ↗</a>';
    const hostUk = document.querySelector(".brand-host");
    if (hostUk) { hostUk.querySelector("span").textContent = "хостинг: Mikrus ↗";
      hostUk.setAttribute("aria-label", "Strażnik працює на Mikrus — відкрити сайт Mikrus"); }
    const nsNoteUk = document.getElementById("ns-note");
    if (nsNoteUk) nsNoteUk.innerHTML = "Сирена використовує гучність Android <b>«Будильники»</b> (а не «Дзвінок» "
      + "чи «Медіа»). Червона тривога піднімає її <b>щонайменше до половини</b>, щоб сирена ніколи не була "
      + "беззвучною. Параметр вище типово <b>вимкнено</b> — якщо його увімкнути, червона тривога встановить "
      + "максимальну гучність, також уночі. У кожному разі попередня гучність повертається, коли ви вимкнете "
      + "тривогу. Жовтий сигнал уваги звучить зі звичайною гучністю.";
    const trailNoteUk = document.getElementById("trail-note");
    if (trailNoteUk) trailNoteUk.innerHTML = "Лінія курсу охоплює 30 хвилин лету дрона чи ракети (15 хвилин для "
      + "літаків), з точками кожні 5 хвилин. Для об’єктів NEPTUN вона малюється <b>лише для курсу, виміряного "
      + "з руху</b> — не для курсу, припущеного з назви цілі, і не для районної позиції. Вона припускає "
      + "незмінний курс; це не прогноз.";
    const trailN = document.getElementById("trail-neptun-label");
    if (trailN?.firstChild) trailN.firstChild.nodeValue = "Дрони й ракети (NEPTUN) ";
    const trailA = document.getElementById("trail-adsb-label");
    if (trailA?.firstChild) trailA.firstChild.nodeValue = "Літаки й гелікоптери (ADS-B) ";
    const alertsLabel = document.querySelector(".place-alerts");
    if (alertsLabel?.firstChild) alertsLabel.firstChild.nodeValue = "Стежити за тривогами для цього воєводства ";
    document.querySelectorAll("#places-dialog form > label:not(.place-alerts)").forEach((el, i) => {
      const txt = ["Назва місця", "Точність місця", "Воєводство"][i];
      if (txt && el.firstChild) el.firstChild.nodeValue = txt;
    });
    const voivLabel = document.getElementById("set-voiv")?.closest("label");
    if (voivLabel?.firstChild) voivLabel.firstChild.nodeValue = "Воєводство\n      ";
    const langLabel = document.getElementById("set-lang")?.closest("label");
    if (langLabel?.firstChild) langLabel.firstChild.nodeValue = "Мова інтерфейсу\n      ";
  }

  window.I18N = { get lang(){ return lang; }, get isEn(){ return lang === "en"; }, get isUk(){ return lang === "uk"; }, t, tr, voiv, type, confidence, set, previewSettings, translateStatic };
  document.addEventListener("DOMContentLoaded", () => translateStatic(document.body), { once:true });
})();

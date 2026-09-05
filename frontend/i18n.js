/* Strażnik UI localisation. Language changes presentation only: source data,
   scoring, region identifiers and FCM topics always keep their canonical form. */
(function () {
  "use strict";

  const saved = localStorage.getItem("straznik_lang");
  let lang = saved === "en" ? "en" : "pl";

  const EN = {
    "fuzja sygnałów · wschodnia Polska": "signal fusion · eastern Poland",
    "Pobierz aplikację": "Download app", "⬇ Pobierz aplikację": "⬇ Download app",
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
    "okrąg = niepewność pozycji (±km)": "circle = position uncertainty (±km)",
    "przerywana linia = trasa przelotu": "dashed line = flight path",
    "samolot wojskowy (ADS-B, jawny transponder)": "military aircraft (ADS-B, public transponder)",
    "Województwa (suma pkt z 60 min)": "Provinces (60-minute point total)",
    "0–1.9 pkt — spokojnie": "0–1.9 pts — calm", "≥ 2 pkt — podwyższona uwaga": "≥ 2 pts — elevated attention",
    "≥ 4 pkt — wysoki priorytet": "≥ 4 pts — high priority",
    "WYSOKI PRIORYTET": "HIGH PRIORITY", "PODWYŻSZONA UWAGA": "ELEVATED ATTENTION",
    "POTWIERDZAM — wycisz syrenę": "ACKNOWLEDGE — silence siren",
    "Moja lokalizacja": "My location", "Województwo": "Province", "Wykryj z GPS": "Detect with GPS",
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

  function tr(s) { return lang === "en" ? (EN[s] || s) : s; }
  function voiv(s) { return lang === "en" ? (VOIV_EN[s] || s) : s; }
  function type(s, fallback) { return lang === "en" ? (TYPE_EN[s] || fallback || s) : fallback || s; }
  function confidence(s, fallback) { return lang === "en" ? (CONF_EN[s] || fallback || s) : fallback || s; }
  function set(next) { localStorage.setItem("straznik_lang", next === "en" ? "en" : "pl"); location.reload(); }

  function previewSettings(next) {
    const en = next === "en", dlg = document.getElementById("settings");
    if (!dlg) return;
    const many = (sel, values) => dlg.querySelectorAll(sel).forEach((el,i) => {
      if (values[i] != null) el.textContent = values[i];
    });
    const button = (id, pl, eng) => { const el=document.getElementById(id); if(el) el.textContent=en?eng:pl; };
    const labelLead = (id, pl, eng) => {
      const el=document.getElementById(id)?.closest("label");
      if (el?.firstChild) el.firstChild.nodeValue=(en?eng:pl)+"\n      ";
    };
    many(":scope form > h3", en
      ? ["My location","Interface language","Alerts while the app is closed","Alert sounds","App version"]
      : ["Moja lokalizacja","Język interfejsu","Alarmy przy zamkniętej aplikacji","Sygnały dźwiękowe","Wersja aplikacji"]);
    many(":scope form > p.fineprint:not(#app-version):not(#upd-status)", en ? [
      "Choose the province where you live. Alerts for your region receive the highest priority and the map starts there.",
      "Alerts for your province arrive as push notifications even when the app is closed or the phone is asleep. Full-screen permission is required for a red alert to wake the screen.",
      "A full-screen alert wakes the display and appears above the lock screen. Android 14 or later may revoke this permission after an update, so verify it manually.",
      "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated siren, vibration and a full-screen alert.",
      "The red siren continues until you acknowledge the alert.",
      "The app checks for a newer release once a day. A dismissed non-critical update can be checked again here."
    ] : [
      "Wybierz województwo, w którym mieszkasz. Alarmy dla Twojego regionu dostają najwyższy priorytet, a mapa startuje na nim.",
      "Alarmy dla Twojego województwa przychodzą jako powiadomienie push — także gdy aplikacja jest zamknięta, ekran wygaszony albo telefon w uśpieniu.",
      "Alarm pełnoekranowy zapala ekran i pokazuje się nad blokadą. Android 14 i nowszy może cofnąć tę zgodę po aktualizacji, dlatego sprawdź ją osobiście.",
      "Żółty poziom (≥2 pkt) — krótki sygnał uwagi i powiadomienie. Czerwony (≥4 pkt) — modulowana syrena, wibracja i alarm pełnoekranowy.",
      "Przy czerwonym poziomie syrena gra bez przerwy, aż potwierdzisz alarm przyciskiem na ekranie.",
      "Aplikacja sama sprawdza raz na dobę, czy jest nowsze wydanie. Pominiętą aktualizację sprawdzisz ręcznie tym przyciskiem."
    ]);
    labelLead("set-voiv", "Województwo", "Province");
    labelLead("set-lang", "Język interfejsu", "Interface language");
    const opts=document.getElementById("set-lang")?.options;
    if(opts?.[0]) opts[0].textContent=en?"Polish":"Polski";
    if(opts?.[1]) opts[1].textContent="English";
    button("btn-gps","📍 Wykryj z GPS","📍 Detect with GPS");
    button("btn-notif-settings","🔔 Ustawienia powiadomień","🔔 Notification settings");
    button("btn-battery","🔋 Wyłącz oszczędzanie baterii","🔋 Disable battery optimisation");
    button("btn-test-chime","▶ Test: uwaga","▶ Test: attention");
    button("btn-test-siren","▶ Test: syrena","▶ Test: siren");
    button("btn-test-alarm","▶ Test: pełny alarm","▶ Test: full alert");
    button("btn-update","⬆ Sprawdź aktualizacje","⬆ Check for updates");
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
  }

  function translateStatic(root) {
    if (lang !== "en") return;
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
      ["zawsze sprawdzaj", "always check"], ["Mapa:", "Map:"]];
    for (const node of nodes) for (const [from,to] of fragments)
      if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from,to);
    const attrs = {
      "btn-download": ["title","Download the latest Strażnik app for Android"],
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
    set(".brand-info", "Strażnik is an unofficial early-warning system. It combines NEPTUN, ADS-B, PAŻP, RCB, media and Ukrainian regional alerts into one air-threat assessment for Polish provinces. It is an additional source and does not replace sirens, RCB or RSO alerts.");
    set("#disclaimer span", "UNOFFICIAL additional source — it does not replace sirens, RCB or RSO alerts. In a real emergency, follow official instructions.");
    set("#adsb-list + p", "Public transponder data (aircraft that choose to be visible) — this is NOT hostile-aircraft tracking.");
    set("#alarm-overlay .alarm-note", "This is an UNOFFICIAL signal. Check sirens, RCB and RSO alerts — official channels are authoritative.");
    set("#about .about-sub", "unofficial fusion of air-threat signals");
    setMany("#about .about-body > p", [
      "Strażnik is an unofficial air-threat map for Poland. It combines reports of drones and missiles over Ukraine with RCB and RSO alerts, PAŻP airspace zones, ADS-B traffic and media reports. The map works live in a browser; the Android app can also send notifications.",
      "No single signal proves that a threat exists. The app assigns points to several independent indicators and totals them over a 60-minute window for each province. A signal has full weight for 30 minutes, then fades linearly to zero. The resulting total determines the level, and the full breakdown is always visible.",
      "One Shahed 80 km from the border is different from six Shaheds 50 km away, while a short-range FPV drone does not threaten Poland. The score combines object class, count, distance and confidence.",
      "The model was checked against documented incidents. A mass border violation or a missile immediately next to the border crosses an alert threshold; routine activity over western Ukraine stays below it. NEPTUN contribution is capped at 8 points.",
      "Distance alone is misleading: 130 km may mean about 10 minutes for a cruise missile and about 45 minutes for a drone. When possible, Strażnik estimates time to the Polish border and to your province using reported, measured or class-typical speed.",
      "The estimate is conservative: 2.5 minutes are deducted for measured source delay. With a known or calculated heading, at least two confirmations and medium/high confidence, the model can raise yellow at ≤10 minutes and red at ≤5 minutes.",
      "This is an estimate, not a promise. It assumes unchanged speed and heading and does not account for air defence. No time is shown when heading is unknown.",
      "An eastern event also transfers 40% of its points to neighbouring provinces, providing earlier awareness farther west.",
      "NEPTUN is an OSINT/crowdsourced aggregator, not radar, so confidence and position uncertainty are always shown. ADS-B contains only public transponder emissions and cannot reveal aircraft flying dark.",
      "Data: NEPTUN · adsb.lol / airplanes.live · PAŻP · gov.pl/RCB · regional and Baltic media · neighbouring airspace sources · map © CARTO, © OpenStreetMap"
    ]);
    set("#about .warn-box", "This is NOT an official warning system. It does not replace sirens, RCB or RSO alerts. In a real emergency, follow official channels. Strażnik provides an additional, potentially earlier signal — nothing more.");
    setMany("#about h3", ["How it works", "How NEPTUN object points are calculated", "Estimated arrival time", "Levels", "Where to find things", "What this app does NOT do"]);
    setMany("#about .about-tab:first-of-type tr td:nth-child(2)", [
      "Object heading towards Poland — score depends on class, count, distance and independent confirmations",
      "Official alert in a Ukrainian region bordering Poland",
      "Local reports of sirens, explosions or airspace violations; one article alone cannot trigger an alert",
      "Official RCB alert from the Regional Warning System or a new gov.pl/RCB notice",
      "Military aviation activity over twice the seven-day baseline for the same time of day",
      "Rare ground-up ADHOC/R/NPZ/D zone; routine and repeating zones do not score",
      "Air incident reported by Lithuanian, Latvian or Estonian media; an all-clear ends its contribution",
      "NATO neighbour airspace closure in northern Romania, Estonia or Lithuania — observational signal"
    ]);
    setMany("#about .about-tab:nth-of-type(2) tr td:first-child", ["Object class", "Count", "Distance", "Confidence"]);
    setMany("#about .about-tab:nth-of-type(2) tr td:nth-child(2)", [
      "ballistic missile 3.0 · MiG-31K 2.6 · cruise missile 2.4 · KAB 1.8 · Shahed 1.4 · drone 1.1 · reconnaissance 0.5 · FPV 0",
      "square root of object count — four objects weigh twice as much as one, not four times as much",
      "<30 km ×1.6 · <60 km ×1.3 · <100 km ×1.0 · <150 km ×0.55 · <250 km ×0.25 · farther 0",
      "confidence, independent report count and observation status"
    ]);
    setMany("#about .lvl-row", [
      "≥ 2 pts — ELEVATED ATTENTION: yellow region, short attention sound and heads-up notification.",
      "≥ 4 pts — HIGH PRIORITY: red region, modulated air-raid siren, vibration and loud notification."
    ]);
    setMany("#about .about-list li", [
      "☰ Panel — province scores, signal timeline, nearby objects and military aviation.",
      "Legend — explains every map symbol and colour.",
      "⚙ Settings — your province, alert permissions, sound tests, language and optional backend.",
      "◎ / ⤢ — return to your region or show Poland and Ukraine.",
      "Top LEDs — data-source status; select an object or aircraft for details."
    ]);
    set("#about-close", "I understand — continue");
    set("#sources h3", "Data sources");
    set("#sources > p:first-of-type", "Each LED at the top represents one data source. Fusion relies on agreement between several sources, so one unavailable source reduces confirmation rather than disabling warnings.");
    set("#watch h3", "🛰 Foreign aircraft over the eastern flank");
    setMany("#watch .watch-h", ["In range now", "Log — entered / disappeared from range"]);
    set("#watch > p", "Military aircraft with Russian or Belarusian registration visible in public ADS-B/MLAT data over the Baltic region and the eastern flank. This observes transponder emissions; it is not radar tracking and is not an alert. Many aircraft fly with transponders off.");
    set("#cameras > p:first-of-type", "Public city and tourism cameras. Previews refresh every 30 seconds. Cameras show the ground, not the sky; they only provide additional context.");
    set("#onboard-bg .about-sub", "receive warnings even when you are not looking at your phone");
    setMany("#onboard-bg .about-body > p", [
      "Strażnik is useful only if it can warn you before you open it. Alerts for your region arrive as push notifications, even when the app is closed and the screen is off.",
      "Notification permission is required. For red alerts, full-screen alert permission is also recommended."
    ]);
    setMany("#settings form > p.fineprint:not(#app-version):not(#upd-status)", [
      "Choose the province where you live. Alerts for your region receive the highest priority and the map starts there.",
      "Alerts for your province arrive as push notifications even when the app is closed or the phone is asleep. Full-screen permission is required for a red alert to wake the screen.",
      "A full-screen alert wakes the display and appears above the lock screen. Android 14 or later may revoke this permission after an update, so verify it manually.",
      "Yellow (≥2 pts): attention sound and heads-up notification. Red (≥4 pts): modulated siren, vibration and a full-screen alert.",
      "The red siren continues until you acknowledge the alert.",
      "The app checks for a newer release once a day. A dismissed non-critical update can be checked again here."
    ]);
    document.querySelectorAll("dialog menu button, #src-close, #watch-close, #cam-close").forEach(el => {
      if (el.textContent.trim() === "Zamknij") el.textContent = "Close";
    });
  }

  window.I18N = { get lang(){ return lang; }, get isEn(){ return lang === "en"; }, tr, voiv, type, confidence, set, previewSettings, translateStatic };
  document.addEventListener("DOMContentLoaded", () => translateStatic(document.body), { once:true });
})();

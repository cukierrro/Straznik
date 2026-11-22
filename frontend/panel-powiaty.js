/* Panel Sygnały z powiatami (1.8.12, decyzja usera 22.11.2026 po prototypie na emulatorze).
   Dwie strony: „Powiaty” i „Województwa”. Na telefonie przełącza się je zakładką,
   strzałką albo przesunięciem palca w bok (jak pigułka „mój region”); na szerokim ekranie
   (≥ 1100 px) panel rośnie i obie strony stoją obok siebie.
   Strona „Powiaty”: Twoje powiaty (powiaty zapisanych miejsc z alarmami, w kolejności miejsc),
   pod nimi pozostałe powiaty z alarmem zgrupowane po województwach. Dotknięcie powiatu
   pokazuje, które sygnały dają mu punkty — z części stanu `/api/state?part=pow`, pobieranej
   dopiero wtedy (w stałej paczce podwoiłaby ją przy nalocie: 9,8 → 19,5 KB gzip, 20.11 05:35).
   Strona „Województwa” to dotychczasowe karty województw (renderPanel / renderHistoryPanel).
   Moduł działa po app.js i korzysta z jego stanu; app.js woła rysujPanelPowiatow()
   na końcu renderPanel i renderHistoryPanel. */
(() => {
  "use strict";
  const PROG = { elevated: 2.5, high: 4.0 };     // progi powiatu (backend config.POWIATY_PROG_*)
  const KOL = ["none", "elevated", "high"];
  const SZEROKI_PX = 1100;
  const KLUCZ_STRONY = "straznik_panel_strona";
  const t3 = (pl, en, uk) => UI.t(pl, en, uk);
  const otwarte = new Set();                     // rozwinięte powiaty
  const otwarteWoj = new Set();                  // rozwinięte grupy „inne powiaty”
  let rozbicie = null, rozbicieV = null, pobieranie = null, bladPobrania = false;

  const panel = document.getElementById("panel");
  const head = document.getElementById("panel-head");
  const kartyWoj = document.getElementById("voiv-cards");
  const cicheWoj = document.getElementById("voiv-quiet");
  if (!panel || !head || !kartyWoj || !cicheWoj) return;

  const pp = document.createElement("div");
  pp.id = "pp";
  pp.innerHTML = `
    <div class="pp-gora">
      <div class="pp-nav" role="tablist">
        <button type="button" class="pp-strz" data-kier="-1"><svg viewBox="0 0 10 16" aria-hidden="true"><path d="M7 2 2 8l5 6"/></svg></button>
        <button type="button" class="pp-zakl" role="tab" id="pp-zakl-pow" aria-controls="pp-s-pow"><span class="pp-zakl-t"></span><span class="pp-licz" id="pp-licz-pow"></span></button>
        <button type="button" class="pp-zakl" role="tab" id="pp-zakl-woj" aria-controls="pp-s-woj"><span class="pp-zakl-t"></span><span class="pp-licz" id="pp-licz-woj"></span></button>
        <button type="button" class="pp-strz" data-kier="1"><svg viewBox="0 0 10 16" aria-hidden="true"><path d="M3 2l5 6-5 6"/></svg></button>
      </div>
      <div class="pp-kropki" aria-hidden="true"><i></i><i></i></div>
    </div>
    <div class="pp-strony"><div class="pp-tor">
      <div class="pp-strona" id="pp-s-pow" role="tabpanel" aria-labelledby="pp-zakl-pow"></div>
      <div class="pp-strona" id="pp-s-woj" role="tabpanel" aria-labelledby="pp-zakl-woj"></div>
    </div></div>`;
  head.after(pp);
  const sPow = pp.querySelector("#pp-s-pow");
  const sWoj = pp.querySelector("#pp-s-woj");
  sWoj.append(kartyWoj, cicheWoj);
  const strony = pp.querySelector(".pp-strony");
  const tor = pp.querySelector(".pp-tor");
  const zakl = [pp.querySelector("#pp-zakl-pow"), pp.querySelector("#pp-zakl-woj")];

  /* Strona startowa idzie za podziałem mapy (powiaty / województwa); wybór ręczny
     pamiętamy na tym urządzeniu. */
  let strona = (() => {
    try { const s = localStorage.getItem(KLUCZ_STRONY); if (s === "0" || s === "1") return +s; } catch {}
    // podzialMapy, nie mapaPowiatow: ta druga czeka na plik granic, a moduł startuje przed mapą
    return typeof podzialMapy === "function" && podzialMapy() === "woj" ? 1 : 0;
  })();

  /* Bez serwera (tryb wbudowany) poziomów powiatów nie ma — panel zostaje przy województwach. */
  const dostepne = () => !(typeof standalone !== "undefined" && standalone);
  const szeroki = () => dostepne() && window.innerWidth >= SZEROKI_PX;

  function progiNaglowka() {
    const el = document.getElementById("panel-progi"), th = state?.fusion?.thresholds;
    if (!el || !th) return;
    const woj = `${t3("progi województwa", "province thresholds", "пороги воєводства")}: ≥${th.elevated} ${t3("uwaga", "attention", "увага")}, ≥${th.high} ${t3("priorytet", "priority", "пріоритет")}`;
    const pow = `${t3("progi powiatu", "county thresholds", "пороги повіту")}: ≥${pktTxt(PROG.elevated)} ${t3("uwaga", "attention", "увага")}, ≥${pktTxt(PROG.high)} ${t3("priorytet", "priority", "пріоритет")}`;
    el.textContent = !dostepne() ? woj : szeroki() ? `${pow} · ${woj}` : (strona === 0 ? pow : woj);
  }
  function ustawStrone(s, { zapisz = false } = {}) {
    strona = Math.max(0, Math.min(1, s));
    if (zapisz) try { localStorage.setItem(KLUCZ_STRONY, String(strona)); } catch {}
    zakl.forEach((z, i) => { z.classList.toggle("on", i === strona); z.setAttribute("aria-selected", String(i === strona)); z.tabIndex = i === strona ? 0 : -1; });
    pp.querySelectorAll(".pp-kropki i").forEach((k, i) => k.classList.toggle("on", i === strona));
    pp.dataset.strona = String(strona);
    tor.style.transform = szeroki() ? "" : `translateX(${-strona * 50}%)`;
    // strona niewidoczna wypada z kolejności klawiatury i czytnika ekranu
    sPow.toggleAttribute("inert", !szeroki() && strona !== 0);
    sWoj.toggleAttribute("inert", !szeroki() && strona !== 1);
    progiNaglowka();
    dopasujWysokosc();
  }
  /* Wysokość kontenera = wysokość BIEŻĄCEJ strony; inaczej krótka lista powiatów
     miałaby pod sobą pustkę wysokości kart województw. */
  function dopasujWysokosc() {
    if (szeroki()) { strony.style.height = ""; return; }
    const akt = strona === 0 ? sPow : sWoj;
    strony.style.height = akt.offsetHeight + "px";
  }
  zakl.forEach((z, i) => z.addEventListener("click", () => ustawStrone(i, { zapisz: true })));
  pp.querySelectorAll(".pp-strz").forEach(b => b.addEventListener("click", () => ustawStrone(strona + +b.dataset.kier, { zapisz: true })));
  // strzałki w lewo/prawo na zakładkach — wzorzec listy zakładek
  zakl.forEach(z => z.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    ustawStrone(strona + (e.key === "ArrowRight" ? 1 : -1), { zapisz: true });
    zakl[strona].focus();
  }));

  /* Przesunięcie palcem: strona jedzie za palcem, po puszczeniu przeskakuje, gdy ruch był
     dłuższy niż 15% szerokości albo szybki. Natywne przewijanie w poziomie łapało na
     emulatorze tylko wolny ruch (22.11.2026), więc gest obsługujemy sami, jak w pigułce;
     przewijanie w pionie zostaje natywne (touch-action: pan-y). */
  let x0 = null, y0 = 0, t0 = 0, poziomy = null;
  strony.addEventListener("touchstart", e => {
    if (szeroki() || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); poziomy = null;
  }, { passive: true });
  strony.addEventListener("touchmove", e => {
    if (x0 == null) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (poziomy === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) poziomy = Math.abs(dx) > Math.abs(dy);
    if (!poziomy) return;
    const szer = strony.clientWidth || 1;
    const opor = (strona === 0 && dx > 0) || (strona === 1 && dx < 0) ? 0.3 : 1;   // brzeg: opór
    tor.style.transition = "none";
    tor.style.transform = `translateX(${(-strona * szer + dx * opor) / (2 * szer) * 100}%)`;
  }, { passive: true });
  strony.addEventListener("touchend", e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    // szybki ruch na wolnym urządzeniu potrafi przyjść bez ani jednego touchmove (emulator,
    // 22.11.2026: touchstart → touchend) — wtedy kierunek rozstrzygamy na końcu gestu
    if (poziomy === null) poziomy = Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
    const szybki = Math.abs(dx) > 30 && Date.now() - t0 < 300;
    tor.style.transition = "";
    if (poziomy && (Math.abs(dx) > strony.clientWidth * 0.15 || szybki)) ustawStrone(strona + (dx < 0 ? 1 : -1), { zapisz: true });
    else ustawStrone(strona);
    x0 = null; poziomy = null;
  }, { passive: true });
  // Przerwany gest nie kończy się touchend: WebKit przerywa serię dotknięć np. przy geście
  // systemowym, Android, gdy dotyk przejmie system. Bez tego tor zostawał przesunięty w pół
  // drogi aż do następnego stanu (zgłoszenie sesji iOS, 22.11.2026) — wraca od razu.
  strony.addEventListener("touchcancel", () => {
    if (x0 == null) return;
    tor.style.transition = "";
    ustawStrone(strona);
    x0 = null; poziomy = null;
  }, { passive: true });

  window.addEventListener("resize", () => { panel.classList.toggle("pp-szeroki", szeroki()); ustawStrone(strona); });
  new ResizeObserver(dopasujWysokosc).observe(sPow);
  new ResizeObserver(dopasujWysokosc).observe(sWoj);

  /* ── dane ── */
  function stanPowiatu(t) {
    const zrodlo = histMode ? (powHistoria || {}) : (state?.fusion?.powiaty || {});
    const pkt = histMode ? {} : (state?.fusion?.powiaty_pkt || {});
    const p = zrodlo[t];
    return p ? { terc: t, level: p.level || "none", score: +p.score || 0, woj: p.woj || powCecha(t)?.properties?.w }
      // historia zapisuje tylko powiaty z poziomem — punktów poniżej progu z tamtej chwili
      // nie znamy, więc bez liczby (nie „0,0 pkt”, które mogłoby być nieprawdą)
      : { terc: t, level: "none", score: histMode ? null : (+pkt[t] || 0), woj: powCecha(t)?.properties?.w };
  }
  const nazwa = t => { const n = nazwaPowiatuMapy(t); return n ? n.charAt(0).toUpperCase() + n.slice(1) : t; };
  const poziomTxt = p => p.level === "none"
    ? ((p.score || 0) > 0 ? t3("poniżej progu", "below threshold", "нижче порога") : t3("brak alarmu", "no alert", "немає тривоги"))
    : LEVEL_LABEL[p.level];
  const kolejnosc = (a, b) => KOL.indexOf(b.level) - KOL.indexOf(a.level) || b.score - a.score;

  function pobierzRozbicie() {
    const v = state?.pow_v;
    if (!v || pobieranie || (rozbicie && rozbicieV === v)) return;
    const base = apiBase(); if (!base) return;
    pobieranie = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(base + "/api/state?part=pow", { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("format");
        rozbicie = d; rozbicieV = v; bladPobrania = false;
      } catch { bladPobrania = true; }
      pobieranie = null;
      rysujPanelPowiatow();
    })();
  }

  function sygnalyHTML(p) {
    if (histMode) return `<p class="fineprint">${t3("Sygnały powiatu są tylko na żywo. W historii zobaczysz sygnały województwa.", "County signals are only live. In history you can see the province signals.", "Сигнали повіту лише наживо. В історії видно сигнали воєводства.")}</p>`
      + przyciskWoj(p);
    if (!(p.score > 0)) return `<p class="fineprint">${t3("Żaden sygnał nie daje teraz temu powiatowi punktów.", "No signal gives this county points right now.", "Зараз жоден сигнал не дає цьому повіту балів.")}</p>`;
    if (!state?.pow_v) return `<p class="fineprint">${t3("Serwer nie podaje jeszcze sygnałów powiatu.", "The server does not provide county signals yet.", "Сервер ще не надає сигнали повіту.")}</p>` + przyciskWoj(p);
    if (!rozbicie || rozbicieV !== state.pow_v) {
      pobierzRozbicie();
      if (!rozbicie) return `<p class="fineprint">${bladPobrania
        ? t3("Nie udało się wczytać sygnałów powiatu.", "Could not load the county signals.", "Не вдалося завантажити сигнали повіту.")
        : t3("Wczytuję sygnały powiatu…", "Loading county signals…", "Завантажую сигнали повіту…")}</p>` + przyciskWoj(p);
    }
    const r = rozbicie[p.terc];
    if (!r || !r.s?.length) return `<p class="fineprint">${t3("Żaden sygnał nie daje teraz temu powiatowi punktów.", "No signal gives this county points right now.", "Зараз жоден сигнал не дає цьому повіту балів.")}</p>` + przyciskWoj(p);
    const MAX = 5;
    const widoczne = r.s.slice(0, MAX);
    const reszta = r.s.length - widoczne.length + (r.wiecej || 0);
    return `<ul class="pp-syg-lista">${widoczne.map(x => `<li class="pp-syg"><span class="pp-syg-t">${esc(x.t)}</span>
        <span class="pp-syg-p">+${pktTxt(x.p)}</span></li>`).join("")}</ul>`
      + (reszta > 0 ? `<p class="fineprint">${t3(`i jeszcze ${reszta} o mniejszym wkładzie`, `and ${reszta} more with a smaller share`, `і ще ${reszta} з меншим внеском`)}</p>` : "")
      + przyciskWoj(p);
  }
  const przyciskWoj = p => p.woj
    ? `<button type="button" class="chip pp-do-woj" data-woj="${esc(p.woj)}">${t3("Sygnały województwa", "Province signals", "Сигнали воєводства")} ${esc(UI.voiv(p.woj))} →</button>` : "";

  function wierszPowiatu(p) {
    const otw = otwarte.has(p.terc);
    return `<div class="pp-pow level-${p.level}${otw ? " open" : ""}" data-t="${p.terc}">
      <button type="button" class="pp-pow-head" aria-expanded="${otw}">
        <span class="pp-znak" aria-hidden="true">${p.level === "high" ? "!" : ""}</span>
        <span class="pp-pow-nazwa">${esc(nazwa(p.terc))}
          <span class="pp-pow-poziom"><span class="pp-woj">${esc(UI.voiv(p.woj || ""))}</span> · ${poziomTxt(p)}</span></span>
        <span class="pp-pow-pkt">${p.score == null ? "" : `${pktTxt(p.score)} ${t3("pkt", "pts", "бал.")}`}</span>
      </button>
      ${otw ? `<div class="pp-pow-syg">${sygnalyHTML(p)}</div>` : ""}
    </div>`;
  }

  function rysujPanelPowiatow() {
    const dost = dostepne();
    pp.classList.toggle("pp-bez-powiatow", !dost);
    panel.classList.toggle("pp-szeroki", szeroki());
    if (!dost) { strona = 1; ustawStrone(1); return; }
    if (!state?.fusion && !histMode) return;
    if (!histMode) {
      document.getElementById("panel-title").textContent = t3("Sygnały", "Signals", "Сигнали");
      const x = document.getElementById("panel-x");
      if (x) { x.title = t3("Zamknij panel sygnałów", "Close the signals panel", "Закрити панель сигналів"); x.setAttribute("aria-label", x.title); }
    }
    zakl[0].querySelector(".pp-zakl-t").textContent = t3("Powiaty", "Counties", "Повіти");
    zakl[1].querySelector(".pp-zakl-t").textContent = t3("Województwa", "Provinces", "Воєводства");
    pp.querySelector('.pp-strz[data-kier="-1"]').setAttribute("aria-label", t3("Poprzednia strona panelu", "Previous panel page", "Попередня сторінка панелі"));
    pp.querySelector('.pp-strz[data-kier="1"]').setAttribute("aria-label", t3("Następna strona panelu", "Next panel page", "Наступна сторінка панелі"));

    const moje = (typeof kolejnoscPowiatowMiejsc === "function" ? kolejnoscPowiatowMiejsc() : []).map(stanPowiatu);
    const mojeT = new Set(moje.map(p => p.terc));
    const zrodlo = histMode ? (powHistoria || {}) : (state?.fusion?.powiaty || {});
    const zPoz = Object.keys(zrodlo).filter(t => !mojeT.has(t)).map(stanPowiatu).filter(p => p.level !== "none");
    const wgWoj = {};
    for (const p of zPoz) (wgWoj[p.woj || "?"] ||= []).push(p);
    const grupy = Object.entries(wgWoj).map(([w, l]) => ({ w, l: l.sort(kolejnosc),
      cz: l.filter(p => p.level === "high").length, zo: l.filter(p => p.level === "elevated").length }))
      .sort((a, b) => b.cz - a.cz || b.zo - a.zo);
    const wszystkie = Object.values(zrodlo).filter(p => p?.level && p.level !== "none");
    const licznik = (el, n, cz) => { el.textContent = n ? String(n) : ""; el.classList.toggle("cz", !!cz); };
    licznik(pp.querySelector("#pp-licz-pow"), wszystkie.length, wszystkie.some(p => p.level === "high"));
    const wojAkt = histMode ? [] : Object.values(state?.fusion?.voivodeships || {}).filter(v => v.level !== "none");
    licznik(pp.querySelector("#pp-licz-woj"), wojAkt.length, wojAkt.some(v => v.level === "high"));
    const mojeAlarm = moje.filter(p => p.level !== "none").length;
    moje.sort(kolejnosc);
    const bezZapisu = histMode && powHistoria === null;   // chwila sprzed zapisu powiatów (21.11.2026)

    sPow.innerHTML = (histMode ? `<div class="hist-banner">${t3("PODGLĄD HISTORII — powiaty z wybranej chwili", "HISTORY VIEW — counties at the chosen moment", "ПЕРЕГЛЯД ІСТОРІЇ — повіти на обрану мить")}</div>` : "")
      + (histMode && powHistoria === null ? `<p class="fineprint pp-brak-zapisu">${t3("Z tej chwili nie ma zapisu powiatów — historia zapisuje je od 21 listopada 2026.", "There is no county record for this moment — history stores counties from 21 November 2026.", "Для цього моменту немає запису повітів — історія зберігає їх від 21 листопада 2026 року.")}</p>` : "")
      + (bezZapisu ? "" : (moje.length ? `<section class="pp-sekcja">
        <h2>${t3("Twoje powiaty", "Your counties", "Ваші повіти")} <span class="muted">${mojeAlarm
          ? t3(`· z alarmem: ${mojeAlarm} z ${moje.length}`, `· with an alert: ${mojeAlarm} of ${moje.length}`, `· з тривогою: ${mojeAlarm} з ${moje.length}`)
          : `· ${moje.length}`}</span></h2>
        ${moje.map(wierszPowiatu).join("")}
      </section>` : "")
      + `<section class="pp-sekcja">
        <h2>${moje.length ? t3("Inne powiaty z alarmem", "Other counties with an alert", "Інші повіти з тривогою") : t3("Powiaty z alarmem", "Counties with an alert", "Повіти з тривогою")} <span class="muted">· ${zPoz.length}</span></h2>
        ${grupy.length ? grupy.map(g => {
          const otw = otwarteWoj.has(g.w);
          return `<div class="pp-grupa${otw ? " open" : ""}" data-woj="${esc(g.w)}">
            <button type="button" class="pp-grupa-head" aria-expanded="${otw}">
              <span class="pp-grupa-nazwa">${esc(UI.voiv(g.w))}</span>
              <span class="pp-grupa-licz">${g.cz ? `<b class="cz">${g.cz} ${t3("czerw.", "red", "черв.")}</b>` : ""}${g.zo ? `<b class="zo">${g.zo} ${t3("żółt.", "yellow", "жовт.")}</b>` : ""}</span>
              <svg class="pp-chev" viewBox="0 0 10 16" aria-hidden="true"><path d="M3 2l5 6-5 6"/></svg>
            </button>
            ${otw ? `<div class="pp-grupa-lista">${g.l.map(wierszPowiatu).join("")}</div>` : ""}
          </div>`;
        }).join("") : `<p class="fineprint">${moje.length
          ? t3("Żaden inny powiat nie ma alarmu.", "No other county has an alert.", "Жоден інший повіт не має тривоги.")
          : t3("Żaden powiat nie ma alarmu.", "No county has an alert.", "Жоден повіт не має тривоги.")}</p>`}
        ${!moje.length && IS_APP ? `<p class="fineprint">${t3("Twoje powiaty pojawią się tu po zapisaniu miejsc z alarmami.", "Your counties appear here once you save places with alerts.", "Ваші повіти з’являться тут після збереження місць із тривогами.")}</p>` : ""}
      </section>`);

    sPow.querySelectorAll(".pp-pow-head").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const t = b.closest(".pp-pow").dataset.t;
      if (otwarte.has(t)) otwarte.delete(t); else otwarte.add(t);
      rysujPanelPowiatow();
    }));
    sPow.querySelectorAll(".pp-grupa-head").forEach(b => b.addEventListener("click", () => {
      const w = b.closest(".pp-grupa").dataset.woj;
      if (otwarteWoj.has(w)) otwarteWoj.delete(w); else otwarteWoj.add(w);
      rysujPanelPowiatow();
    }));
    sPow.querySelectorAll(".pp-do-woj").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const w = b.dataset.woj;
      if (!histMode) { openVoivs.add(w); forcedVoivs?.add?.(w); renderPanel(); }
      ustawStrone(1, { zapisz: true });
      setTimeout(() => document.querySelector(`.voiv-card[data-voiv="${CSS.escape(w)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 320);
    }));
    ustawStrone(strona);
  }
  window.rysujPanelPowiatow = rysujPanelPowiatow;
  ustawStrone(strona);
  try { if (state?.fusion) rysujPanelPowiatow(); } catch {}
})();

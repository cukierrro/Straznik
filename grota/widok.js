/* GROTA jako moduł Strażnika — jedyny punkt wejścia (kontrakt: grota/README.md).

   Strażnik wstawia <script src="grota/widok.js"> dopiero przy pierwszym wejściu i woła:
     window.Grota.otworz()   — pokazuje moduł; przy pierwszym razie dociąga resztę plików,
     window.Grota.ukryj()    — chowa moduł i zdejmuje jego mapę (punkty i stan zostają w pamięci),
     window.Grota.widoczny   — czy moduł jest teraz na ekranie,
     window.Grota.wstecz()   — jeden krok „wstecz” wewnątrz Groty; false, gdy nie ma już czego cofać
                               (wtedy Strażnik chowa moduł).
   Plik powstaje w repo Groty (modul/widok.js) i trafia do Strażnika przez tools/eksport_modulu.cjs. */
(function () {
  "use strict";
  if (window.Grota) return;

  const BAZA = "grota/";
  const WERSJA = "156270d3d7";                 // podmieniane przy eksporcie — świeże pliki po aktualizacji aplikacji
  const SKRYPTY = ["ikony.js", "poradnik.js", "grota-core.js", "trasa-lokalna.js", "vendor/fflate.min.js", "offline.js", "grota.js"];

  // Szkielet widoku — ten sam układ co samodzielna Grota, plus powrót do Strażnika w nagłówku.
  const SZABLON = `
<div id="grota" class="w-strazniku">
  <header class="g-top">
    <button type="button" class="g-powrot" data-grota="powrot" aria-label="Wróć do Strażnika">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Strażnik</span></button>
    <div class="g-brand"><span class="g-logo">⛨</span><div><b>GROTA</b><small>gdzie się schronić</small></div></div>
  </header>
  <div class="g-body">
    <div class="map-wrap">
      <div id="g-map"></div>
      <div id="rec-bar" class="rec-bar" hidden aria-live="polite"></div>
      <div id="map-offline" class="map-offline" hidden role="status"></div>
      <div id="map-load" class="map-load" role="status">Wczytuję punkty schronienia…</div>
      <button id="btn-theme" class="map-btn theme" title="Jasna / ciemna mapa" aria-label="Jasna albo ciemna mapa" data-icon="moon"></button>
      <button id="btn-locate" class="map-btn" title="Moja pozycja" aria-label="Moja pozycja" data-icon="locate-fixed"></button>
    </div>
    <aside id="g-panel" aria-live="polite"></aside>
  </div>
  <nav class="g-bottom" aria-label="Sekcje">
    <button data-tab="mapa" class="on" data-icon="map">Mapa</button>
    <button data-tab="miejsca" data-icon="map-pin-house">Miejsca</button>
    <button data-tab="teraz" class="danger" data-icon="shield-alert">TERAZ</button>
    <button data-tab="przygotuj" data-icon="backpack">Przygotuj</button>
    <button data-tab="zasady" data-icon="book-open">Zasady</button>
  </nav>
</div>`;

  let wczytywanie = null, widoczny = false, chceOtwarte = false;
  const pojemnik = () => document.getElementById("grota-widok");

  /* Grota używa składni, której nie zna WebView starszy niż Chrome 80 (m.in. `?.`). Na takim telefonie
     lepiej jasno powiedzieć, co się dzieje, niż pokazać pusty ekran. */
  function webviewWystarczy() {
    try { new Function("var a = {}; return a?.b ?? 1;")(); return true; } catch (e) { return false; }
  }

  function skrypt(src) {
    return new Promise(function (ok, zle) {
      const s = document.createElement("script");
      s.src = src + "?v=" + WERSJA;
      s.async = false;
      s.onload = ok;
      s.onerror = function () { zle(new Error("nie wczytał się " + src)); };
      document.head.appendChild(s);
    });
  }

  function styl(href) {
    if (document.querySelector('link[data-grota-styl]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href + "?v=" + WERSJA; l.setAttribute("data-grota-styl", "");
    document.head.appendChild(l);
  }

  function przygotuj() {
    if (!wczytywanie) {
      wczytywanie = (async function () {
        const p = pojemnik();
        if (!p) throw new Error("brak pojemnika #grota-widok");
        if (!window.maplibregl) throw new Error("brak MapLibre na stronie");
        window.GROTA_BAZA = BAZA;
        window.GROTA_MODUL = true;
        styl(BAZA + "grota.css");
        p.innerHTML = SZABLON;
        p.addEventListener("click", function (e) {
          if (e.target.closest('[data-grota="powrot"]')) window.Grota.ukryj();
        });
        for (const s of SKRYPTY) await skrypt(BAZA + s);
        if (!window.GrotaModul) throw new Error("grota.js nie wystawił GrotaModul");
      })().catch(function (e) { wczytywanie = null; throw e; });
    }
    return wczytywanie;
  }

  window.Grota = {
    async otworz() {
      const p = pojemnik();
      if (!p) throw new Error("brak pojemnika #grota-widok");
      chceOtwarte = true;
      if (!webviewWystarczy()) {
        p.innerHTML = '<div class="grota-za-stary"><p><b>Wyszukiwanie schronień wymaga nowszej wersji przeglądarki systemowej (Android System WebView).</b></p>'
          + "<p>Zaktualizuj ją w Sklepie Play i otwórz Grotę jeszcze raz. Alarmy Strażnika działają bez zmian.</p>"
          + '<button type="button" data-grota="powrot">Wróć do Strażnika</button></div>';
        p.onclick = function (e) { if (e.target.closest('[data-grota="powrot"]')) window.Grota.ukryj(); };
        p.hidden = false; widoczny = true;
        return;
      }
      // pokazujemy od razu — pierwsze wczytanie trwa chwilę, a mapa MapLibre potrzebuje widocznego pojemnika
      p.hidden = false; widoczny = true;
      await przygotuj();
      if (!chceOtwarte) { p.hidden = true; widoczny = false; return; }   // w międzyczasie ktoś zamknął
      window.GrotaModul.pokaz();
    },
    ukryj() {
      chceOtwarte = false;
      const p = pojemnik();
      if (p) p.hidden = true;
      if (!widoczny) return;
      widoczny = false;
      if (window.GrotaModul) window.GrotaModul.schowaj();
    },
    get widoczny() { return widoczny; },
    wstecz() {
      if (!widoczny || !window.GrotaModul) return false;
      return window.GrotaModul.wstecz();
    },
  };
})();

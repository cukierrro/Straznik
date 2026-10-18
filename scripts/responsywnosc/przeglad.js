// Przegląd responsywności — wstrzykiwany do strony przez scripts/test_responsywnosc.cjs
// (przeglądarka) albo przez DevTools do WebView aplikacji na emulatorze.
//
// Powstał 18.10.2026 po analizie na emulatorze Pixel 7 (320/360/411 dp, czcionka
// 100–200 %, PL/EN/UK), która potwierdziła zgłoszenia userów: karta obiektu nad
// ekranem bez przycisku zamknięcia, tytuł wykresu łamany w słupek, godzina historii
// za krawędzią, okno zgody ściśnięte do kolumny. Detektor:
//   A — element poza ekranem w poziomie
//   B — okno / warstwa stała poza ekranem w pionie (bez przewijania)
//   C — tekst wystaje z własnej ramki albo jest ucięty (bez wielokropka)
//   D — tekst wystaje poza ramkę rodzica
//   E — krótki tekst (≤ 32 znaki) złamany w ≥ 3 linie (liczone z prostokątów tekstu)
//   F — przycisk poza widokiem, gdy nie ma przewijania
//   G — krótka etykieta (≤ 10 znaków) ucięta wielokropkiem
// Zwraca JSON: { W, H, wyniki: [{ widok, problemy | blad }] }.
// Przegląd responsywności w aplikacji (WebView). Wstrzykiwany przez cdp.cjs.
// Zwraca JSON: dla każdego widoku listę problemów.
(async () => {
  // tempo < 1 skraca odstępy (przeglądarka na komputerze); emulator: domyślne 1
  const tempo = window.__przegladTempo || 1;
  const czekaj = (ms) => new Promise(r => setTimeout(r, ms * tempo));
  const W = innerWidth, H = innerHeight;

  const opis = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim())
      s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    const p = el.parentElement && el.parentElement.closest("[id]");
    return (p ? p.id + " > " : "") + s;
  };
  const widoczny = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2 ? { r, cs } : null;
  };
  const przewijany = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 2) return a;
    }
    return null;
  };

  function detektor(korzen) {
    const out = [];
    for (const el of korzen.querySelectorAll("*")) {
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      if (el.closest(".maplibregl-canvas-container, .maplibregl-ctrl-attrib")) continue;
      // schowane przyciski mapy celowo wystają za prawą krawędź (pasek ~20 px do wysunięcia)
      if (el.closest("#map-actions.schowane")) continue;
      const v = widoczny(el); if (!v) continue;
      // element w trakcie animacji (np. wysuwany panel) mierzymy dopiero, gdy stanie
      if (el.getAnimations && el.getAnimations().some(an => an.playState === "running")) continue;
      const { r, cs } = v;
      // A. poza ekranem w poziomie
      if (r.right > W + 1 || r.left < -1)
        out.push({ t: "A poza ekranem (poziomo)", el: opis(el), x: `${Math.round(r.left)}–${Math.round(r.right)}/${W}` });
      // B. pojemnik stały / okno poza ekranem w pionie (ucięty, nie da się zamknąć)
      const pos = cs.position;
      if ((pos === "fixed" || el.tagName === "DIALOG") && (r.top < -1 || r.bottom > H + 1) && !przewijany(el))
        out.push({ t: "B pojemnik poza ekranem (pion)", el: opis(el), y: `${Math.round(r.top)}–${Math.round(r.bottom)}/${H}` });
      // C. tekst wystaje z własnej ramki / ucięty
      const tekst = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2);
      // G. krótka etykieta ucięta wielokropkiem („−12 h” → „−1…” myli bardziej niż brak podpisu)
      if (tekst && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow === "ellipsis"
          && el.textContent.trim().length <= 10)
        out.push({ t: "G krótka etykieta ucięta", el: opis(el), txt: el.textContent.trim(), o: el.scrollWidth - el.clientWidth });
      if (tekst && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis")
        out.push({ t: /hidden|clip/.test(cs.overflowX) ? "C tekst ucięty" : "C tekst wystaje z ramki",
                   el: opis(el), txt: el.textContent.trim().slice(0, 40), o: el.scrollWidth - el.clientWidth });
      // D. element wystaje poza rodzica (rodzic bez przewijania)
      const par = el.parentElement;
      if (par && par !== document.body && tekst) {
        const pv = widoczny(par);
        const pcs = pv && pv.cs;
        if (pv && !/(auto|scroll|hidden|clip)/.test(pcs.overflowX) && pcs.position !== "static" || pv && pcs.backgroundColor !== "rgba(0, 0, 0, 0)") {
          const pr = pv.r;
          if (r.right > pr.right + 2 || r.left < pr.left - 2)
            out.push({ t: "D wystaje poza ramkę rodzica", el: opis(el), txt: el.textContent.trim().slice(0, 40), o: Math.round(Math.max(r.right - pr.right, pr.left - r.left)) });
        }
      }
      // E. krótki tekst złamany w ≥3 linie (wąska kolumna)
      const txt = el.textContent.trim();
      if (tekst && txt.length <= 32) {
        // prawdziwe linie: różne wysokości prostokątów tekstu (Range), nie wysokość pudełka
        const rg = document.createRange(); rg.selectNodeContents(el);
        const gory = new Set([...rg.getClientRects()].filter(q => q.width > 1).map(q => Math.round(q.top)));
        const linie = gory.size;
        if (linie >= 3)
          out.push({ t: "E krótki tekst w wielu liniach", el: opis(el), txt: txt.slice(0, 32), linie, szer: Math.round(r.width) });
      }
      // F. kontrolka nie do kliknięcia: przycisk zamknięcia / akcji poza widokiem, gdy nie ma przewijania
      if (/^(button|summary)$/i.test(el.tagName) && (r.top < 0 || r.bottom > H) && !przewijany(el))
        out.push({ t: "F przycisk poza widokiem", el: opis(el), txt: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 25), y: `${Math.round(r.top)}–${Math.round(r.bottom)}/${H}` });
    }
    const uniq = new Map();
    for (const o of out) { const k = o.t + "|" + o.el; if (!uniq.has(k)) uniq.set(k, o); }
    return [...uniq.values()];
  }

  const wyniki = [];
  const zamknij = async () => {
    document.querySelectorAll("dialog[open]").forEach(d => { try { d.close(); } catch {} });
    try { hideCard(); } catch {}
    try { if (histMode) exitHistory(); } catch {}
    try { setPanel(false); } catch {}
    await czekaj(400);
  };
  const kartaObiektu = async () => {
    const f = (map.getSource("threats")?._data?.features || []);
    // najdłuższy opis = najgorszy przypadek dla karty
    const p = f.map(x => x.properties).sort((a, b) => String(b.opis || "").length - String(a.opis || "").length)[0];
    if (!p) throw new Error("brak obiektów na mapie");
    openThreatPopup(null, p);
  };
  const krok = async (nazwa, fn) => {
    await zamknij();
    try { await fn(); } catch (e) { wyniki.push({ widok: nazwa, blad: String(e.message || e).slice(0, 80) }); return; }
    await czekaj(900);
    wyniki.push({ widok: nazwa, problemy: detektor(document.body) });
  };
  const historia = async () => { toggleHistory(); for (let i = 0; i < 20 && !histTimes?.length; i++) await czekaj(300); await czekaj(800); };

  await krok("mapa", async () => {});
  await krok("sygnały", async () => setPanel(true));
  await krok("karta obiektu", kartaObiektu);
  await krok("historia", historia);
  await krok("historia + wykres", async () => { await historia();
    const s = document.querySelector("#hist-chart summary, details summary"); s && s.click(); });
  await krok("historia + karta", async () => { await historia(); await kartaObiektu(); });
  await krok("historia + sygnały", async () => { await historia(); setPanel(true); });
  await krok("menu", async () => document.getElementById("more-sheet").showModal());
  await krok("ustawienia", async () => { openSettings(); await czekaj(300);
    document.querySelectorAll("#settings details").forEach(d => d.open = true); });
  await krok("o aplikacji", async () => { const d = document.getElementById("about"); d.showModal();
    d.querySelectorAll("details").forEach(x => x.open = true); });
  await krok("źródła", async () => showSources());
  await krok("GROTA", async () => openPlaces());
  await krok("licznik", async () => document.getElementById("licznik-okno").showModal());
  await krok("zgoda pełnoekranowa", async () => document.getElementById("fs-check").showModal());
  await krok("obserwacja", async () => showWatch());
  await zamknij();
  return JSON.stringify({ W, H, skala: getComputedStyle(document.documentElement).getPropertyValue("--skala-tekstu").trim(),
    jezyk: localStorage.getItem("straznik_lang"), wyniki });
})()

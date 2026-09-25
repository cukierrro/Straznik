/* Języki Groty: polski (źródło), angielski, ukraiński.

   Kluczem tłumaczenia jest polski tekst, dokładnie taki jak w kodzie — polski ekran nie zmienia się ani o znak,
   a brakujące tłumaczenie spada na polski, zamiast pokazać pusty napis albo klucz techniczny.
   Zmienne w tekstach: {nazwa}, podstawiane z obiektu `v`. Słowniki: jezyk-en.js, jezyk-uk.js
   (window.GROTA_SLOWNIK.en / .uk), wczytywane razem z Grotą.

   Który język:
   1. wybrany w Grocie (Zasady → Język) — localStorage `grota_lang`,
   2. język Strażnika (`straznik_lang`: pl/en/uk — ukraiński doszedł 23.09.2026),
   3. język telefonu: uk/ru-UA → ukraiński, inny niż polski → angielski,
   4. polski.
   Własny wybór w Grocie zostaje: ktoś może chcieć Strażnika po polsku, a Groty po ukraińsku. */
(function (global) {
  "use strict";
  const JEZYKI = ["pl", "en", "uk"];
  const NAZWY = { pl: "Polski", en: "English", uk: "Українська" };
  const LOCALE = { pl: "pl-PL", en: "en-GB", uk: "uk-UA" };

  function czytaj(k) { try { return localStorage.getItem(k); } catch { return null; } }

  function wykryj() {
    const wlasny = czytaj("grota_lang");
    if (JEZYKI.includes(wlasny)) return wlasny;
    const straznik = czytaj("straznik_lang");
    if (JEZYKI.includes(straznik)) return straznik;
    const tel = (navigator.languages && navigator.languages[0]) || navigator.language || "pl";
    if (/^pl/i.test(tel)) return "pl";
    if (/^uk/i.test(tel) || /-UA$/i.test(tel)) return "uk";
    return "en";
  }

  let jezyk = wykryj();
  const slownik = () => (jezyk === "pl" ? null : (global.GROTA_SLOWNIK || {})[jezyk] || null);
  const brakujace = new Set();              // do testów: które klucze nie mają tłumaczenia

  function podstaw(s, v) {
    return v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m)) : s;
  }

  // t("Trasa {d} · ok. {m} min", { d: "800 m", m: 11 })
  function t(pl, v) {
    const sl = slownik();
    let s = pl;
    if (sl) {
      if (Object.prototype.hasOwnProperty.call(sl, pl)) s = sl[pl];
      else brakujace.add(pl);
    }
    return podstaw(s, v);
  }

  /* Liczba mnoga. Wywołanie zawsze po polsku: tn(5, "punkt", "punkty", "punktów") → „5 punktów”.
     Słownik trzyma formy pod kluczem "punkt|punkty|punktów":
     en: ["point", "points"], uk: ["пункт", "пункти", "пунктів"]. */
  function forma(n, formy, reguly) {
    const t10 = n % 10, h = n % 100;
    if (reguly === "en") return n === 1 ? formy[0] : formy[1];
    if (reguly === "uk") return t10 === 1 && h !== 11 ? formy[0] : t10 >= 2 && t10 <= 4 && (h < 12 || h > 14) ? formy[1] : formy[2];
    return n === 1 ? formy[0] : t10 >= 2 && t10 <= 4 && (h < 12 || h > 14) ? formy[1] : formy[2];
  }
  function tn(n, one, few, many) {
    const sl = slownik(), klucz = `${one}|${few}|${many}`;
    const f = sl && sl[klucz];
    if (sl && !f) brakujace.add(klucz);
    return `${liczba(n)} ${f ? forma(n, f, jezyk) : forma(n, [one, few, many], "pl")}`;
  }

  const liczba = (n) => (typeof n === "number" ? n.toLocaleString(LOCALE[jezyk]) : String(n));
  // ułamek z jednym miejscem po przecinku: „2,5” po polsku i ukraińsku, „2.5” po angielsku
  const ulamek = (x, miejsc = 1) => {
    const s = x.toFixed(miejsc);
    return jezyk === "en" ? s : s.replace(".", ",");
  };

  global.GrotaJezyk = {
    JEZYKI, NAZWY,
    get jezyk() { return jezyk; },
    get locale() { return LOCALE[jezyk]; },
    /* Zmiana w locie: Grota przerysowuje panel, a napisy stałe (zakładki, przyciski mapy) odświeża przez
       data-t / data-t-title / data-t-aria. Zapamiętujemy wybór — ma pierwszeństwo przed Strażnikiem. */
    ustaw(j) {
      if (!JEZYKI.includes(j)) return;
      jezyk = j;
      try { localStorage.setItem("grota_lang", j); } catch { /* prywatne okno */ }
      try { document.documentElement && global.GrotaJezyk.przetlumaczStale(document); } catch { /* bez DOM */ }
      // grota.js odświeża resztę (panel, mapa, znaczniki) — bez względu na to, kto zmienił język
      try { global.dispatchEvent(new CustomEvent("grota:jezyk", { detail: j })); } catch { /* bez DOM */ }
    },
    t, tn, liczba, ulamek,
    przetlumaczStale(korzen) {
      korzen.querySelectorAll("[data-t]").forEach((el) => {
        const cel = el.querySelector("[data-t-tekst]") || el;
        cel.textContent = t(el.dataset.t);
      });
      korzen.querySelectorAll("[data-t-title]").forEach((el) => { el.title = t(el.dataset.tTitle); });
      korzen.querySelectorAll("[data-t-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.tAria)); });
    },
    brakujace,
  };
})(typeof window !== "undefined" ? window : globalThis);

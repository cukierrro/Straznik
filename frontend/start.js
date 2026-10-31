/* Przeniesione z index.html 31.10.2026 (1.8.04): CSP aplikacji i strony nie wpuszcza
   skryptów wpisanych w stronę ('unsafe-inline'), więc każdy skrypt jest osobnym plikiem.
   Wczytywany synchronicznie w <head> — wykonuje się przed pierwszym renderem jak dawniej. */
/* iPhone: część rzeczy z Androida (głośność, pełny ekran, APK) tam nie działa,
   a linki do wsparcia autora łamią zasady App Store — ukrywa je klasa ios-app. */
if (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === "ios")
  document.documentElement.classList.add("ios-app");
/* Za stary silnik przeglądarki (np. Android bez aktualizacji „Android System WebView”)
   nie wczyta app.js i zostałby pusty ekran. Wtedy mówimy wprost, co zaktualizować. */
/* Wielkość tekstu (zgłoszenie #4, filo4444). Mnożnik ustawiamy TUTAJ, w nagłówku,
   a nie w app.js na końcu strony — inaczej tekst mignąłby w rozmiarze podstawowym
   i podskoczył przy pierwszym odmalowaniu. Wpuszczamy wyłącznie znane wartości:
   to, co idzie do CSS, nie może pochodzić wprost z pamięci przeglądarki. */
try {
  var _ts = localStorage.getItem("straznik_skala_tekstu");
  if (_ts === "1.15" || _ts === "1.3")
    document.documentElement.style.setProperty("--skala-tekstu", _ts);
} catch (e) {}
/* Wynik testu składni z silnik.js (wczytany tuż przed tym plikiem). Za stary silnik
   nie sparsuje tamtego pliku, więc flaga zostaje pusta. Dawniej test kompilował
   tekst w locie (eval) — CSP bez 'unsafe-eval' by go zablokowała. */
var STRAZNIK_OLD_ENGINE = window.STRAZNIK_SILNIK_NOWY !== true;
if (STRAZNIK_OLD_ENGINE) document.addEventListener("DOMContentLoaded", function () {
  var d = document.createElement("div");
  d.setAttribute("role", "alert");
  d.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#0b0f1a;color:#e8eefc;padding:28px 22px;font:16px/1.5 sans-serif;overflow:auto";
  var app = document.documentElement.className.indexOf("native-app") >= 0;
  d.innerHTML = "<h2 style=\"margin:0 0 12px\">Strażnik nie może się uruchomić</h2>" +
    "<p>Silnik przeglądarki w tym telefonie jest za stary. " + (app
      ? "Zaktualizuj w Sklepie Play aplikacje <b>Android System WebView</b> i <b>Chrome</b>, a potem uruchom Strażnika ponownie."
      : "Zaktualizuj przeglądarkę (np. Chrome) i odśwież stronę.") + "</p>" +
    "<p style=\"color:#9fb0cf\">Bez tej aktualizacji nie działa mapa ani ustawienia alarmów — nie polegaj na Strażniku, dopóki jej nie zrobisz.</p>";
  document.body.appendChild(d);
});

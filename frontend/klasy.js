/* Przeniesione z index.html 31.10.2026 (1.8.04): CSP aplikacji i strony nie wpuszcza
   skryptów wpisanych w stronę ('unsafe-inline'), więc każdy skrypt jest osobnym plikiem.
   Wczytywany synchronicznie w <head> — wykonuje się przed pierwszym renderem jak dawniej. */
/* Klasa platformy przed pierwszym renderem: elementy .web-only nie mogą
   mignąć w APK, nawet gdy główny app.js załaduje się później lub z błędem. */
document.documentElement.classList.add(
  location.protocol === "capacitor:" || location.protocol === "file:" || window.Capacitor
    ? "native-app" : "web-app"
);
/* W aplikacji strona nie powiększa się dwoma palcami ani podwójnym dotknięciem — czytelnik
   (22.09.2026) przypadkiem powiększał cały interfejs jak w przeglądarce. Mapa przybliża się
   dalej, bo obsługuje gesty sama. Na stronie WWW powiększanie zostaje (dostępność), a duży
   tekst w aplikacji daje systemowy rozmiar czcionki. */
if (document.documentElement.classList.contains("native-app"))
  document.querySelector('meta[name="viewport"]')?.setAttribute("content",
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
/* Który przycisk pobierania pokazać na wąskim ekranie telefonu: tylko ten dla jego
   systemu (dwa naraz zawijały pasek do drugiego rzędu). iPad zgłasza się jak Mac,
   więc rozpoznajemy go po ekranie dotykowym. Nieznany system widzi oba. */
(function () {
  var ua = navigator.userAgent || "";
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) document.documentElement.classList.add("ua-ios");
  else if (/Android/.test(ua)) document.documentElement.classList.add("ua-android");
})();

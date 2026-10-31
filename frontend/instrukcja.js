/* Przeniesione z index.html 31.10.2026 (1.8.04): CSP aplikacji i strony nie wpuszcza
   skryptów wpisanych w stronę ('unsafe-inline'), więc każdy skrypt jest osobnym plikiem.
   Wczytywany synchronicznie w <head> — wykonuje się przed pierwszym renderem jak dawniej. */
/* Instrukcja pasująca do telefonu i języka (21.09.2026). iPhone ma osobną, bo alarmy,
   zgody i aktualizacje działają tam inaczej. Tu, a nie w app.js: index.html nie jest
   trzymany w Cloudflare, więc zmiana dociera bez podbijania wersji skryptów. */
(function () {
  var root = document.documentElement.classList;
  var ios = root.contains("ios-app") || root.contains("ua-ios");
  var en = !!(window.I18N && window.I18N.isEn);
  var page = ios ? (en ? "iphone-en.html" : "iphone.html") : (en ? "en.html" : "");
  if (!page) return;
  var links = document.querySelectorAll('a[href="https://cukierrro.github.io/Straznik/"]');
  for (var i = 0; i < links.length; i++) links[i].href = "https://cukierrro.github.io/Straznik/" + page;
})();

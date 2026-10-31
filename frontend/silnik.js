/* Test wieku silnika przeglądarki (31.10.2026, 1.8.04). Ten plik używa składni `?.` i `??`;
   silnik starszy niż Chrome 80 nie sparsuje go wcale, więc flaga nie zostanie ustawiona,
   a start.js pokaże ekran „zaktualizuj WebView”. Bez eval — CSP go nie wpuszcza.
   Nie dopisuj tu niczego innego: błąd składni wyłącza cały plik. */
window.STRAZNIK_SILNIK_NOWY = (function () { var a = null; return a?.b ?? 1; })() === 1;

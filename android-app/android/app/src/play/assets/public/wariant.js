/* Wariant dla Google Play — przykrywa frontend/wariant.js przy scalaniu zasobów.
 * Skutki w kodzie: brak sprawdzania aktualizacji (app.js: UPDATE_CHECK) i ukryte
 * odnośniki do wsparcia autora (klasa `no-sklep`). Uprawnienie
 * REQUEST_INSTALL_PACKAGES usuwa osobno src/play/AndroidManifest.xml.
 */
window.STRAZNIK_KANAL = "play";
document.documentElement.classList.add("sklep-app");

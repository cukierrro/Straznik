/* Kanał dystrybucji tej kopii Strażnika.
 *
 * Ten plik jest JEDYNYM miejscem, które odróżnia wydanie z GitHuba od wydania
 * w Google Play. Wersja sklepowa NIE może aktualizować się sama ani prowadzić
 * do zbiórki poza sklepem — regulamin Play tego zabrania, a złamanie go kończy
 * się zdjęciem aplikacji, czyli utratą kanału ostrzegania dla wszystkich,
 * którzy nie mogą instalować z pliku.
 *
 * Nie ustawiaj tu „play" ręcznie. Podmianę robi wariant `play` w Gradle:
 * `android-app/android/app/src/play/assets/public/wariant.js` przykrywa ten
 * plik przy scalaniu zasobów, więc nie da się wydać APK z GitHuba bez
 * aktualizatora ani paczki do Play z aktualizatorem.
 *
 * Strona WWW i wersja na iPhone'a biorą ten plik bez zmian („github"):
 * na iOS aktualizator i tak jest wyłączony osobno (IS_IOS), a strona nie ma
 * czego aktualizować.
 *
 * Pilnuje tego `scripts/test_wariant_sklepowy.cjs`.
 */
window.STRAZNIK_KANAL = "github";
/* Klasę ustawiamy tutaj, a nie w app.js: app.js wykonuje się po pierwszym
   renderze, więc odnośnik do zbiórki zdążyłby mrugnąć na ekranie. */
if (window.STRAZNIK_KANAL === "play") document.documentElement.classList.add("sklep-app");

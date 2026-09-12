# Strażnik 1.7.25 — okno aktualizacji po angielsku

Poprawka jednej rzeczy, znalezionej przy sprawdzaniu wydania 1.7.24 na urządzeniu z
angielskim interfejsem.

## Okno i komunikaty aktualizacji mówią językiem interfejsu

Cała ścieżka aktualizacji była zapisana po polsku na sztywno, więc w angielskiej
aplikacji wyglądała tak: „Masz najnowszą wersję (1.7.24).”, „Dostępna wersja …”,
„Co się zmienia:”, przyciski „Aktualizuj” i „Później”, a w trakcie pobierania
„Pobieram…”, „Sprawdzam podpis i sumę SHA-256…”, „Potwierdź instalację w oknie
Androida.”. Teraz każdy z tych komunikatów ma wersję angielską — łącznie z podpowiedzią
o zgodzie „Install from this source”, która pojawia się, gdy Android odmówi instalacji.

To ten sam wymóg, co przy alertach i nazwach obwodów: angielski interfejs ma być
angielski w całości, a nie tylko na ekranach, na które ktoś wcześniej zajrzał.

Reszta wydania 1.7.24 bez zmian — opis w `docs/RELEASE_1.7.24.md`.

## Zweryfikowane na urządzeniu

Emulator Pixel 7 (Android 14), interfejs przełączony na angielski: „Check for updates”
odpowiada „You have the latest version (1.7.25).”.

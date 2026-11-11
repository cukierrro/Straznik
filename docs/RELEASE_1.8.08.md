# Wydanie 1.8.08 — stan zapisu na Androidzie, alert RCB dla kilku województw, GROTA z 10 listopada

versionCode 138, versionName 1.8.08. 11 listopada 2026. Wspólny numer dla Androida i iPhone'a.

<!-- zmiany -->
- Android: po zmianie miejsc wiersz stanu w „Alarmy i zgody” pokazuje „⏳ Zapisywanie telefonu do województw…” i sam przechodzi na potwierdzony stan, bez ponownego uruchamiania aplikacji. Gdy Firebase długo milczy, aplikacja ponawia zapis.
- Alert RCB wysłany do kilku województw liczy się dla każdego z nich, także gdy oficjalny wpis wymienia tylko jedno.
- Alarmy powietrzne na Litwie z serwisu LRT są wychwytywane także wtedy, gdy LRT dopisuje je do jednego, ciągle aktualizowanego artykułu.
- GROTA: wykaz miejsc schronienia PSP z 10 listopada 2026 — 88 256 punktów.
<!-- /zmiany -->

## Stan zapisu na Androidzie

Wydanie 1.8.07 pokazało w <kbd>Menu</kbd> → <kbd>Ustawienia</kbd> → <kbd>Alarmy i zgody</kbd> datę ostatniego potwierdzenia zapisu przez Firebase. Notatki 1.8.07 opisywały znane ograniczenie: zaraz po zmianie miejsc wiersz potrafił pokazywać stan sprzed zmiany („nie jest zapisany” albo „Wypisywanie…”), dopóki aplikacja nie została uruchomiona ponownie. To jest naprawione.

- Każda synchronizacja ma swój numer i stan zapisuje tylko najnowsza, więc kilka szybkich zmian miejsc nie nadpisuje sobie nawzajem wyniku.
- Dopóki Firebase nie potwierdzi zmiany, wiersz mówi „⏳ Zapisywanie telefonu do województw…” i odświeża się sam, póki ustawienia są otwarte.
- Zamknięcie ustawień bez zmiany miejsc nie wysyła już nowego zapisu.

Przy tej poprawce sprawdziliśmy kod biblioteki Firebase. Operację dodaną dokładnie w chwili, gdy Firebase kończy swoją kolejkę, potrafi on odłożyć do następnej synchronizacji. Zdanie z notatek 1.8.07, że sam zapis zawsze przebiega poprawnie, było więc zbyt mocne. Teraz, gdy Firebase przez 45 sekund niczego nie potwierdza, aplikacja ponawia zapis (najwyżej dwa razy). Gdy po dwóch minutach nadal nie ma potwierdzenia, wiersz mówi o tym wprost zamiast „w toku”.

Sprawdzone na emulatorze z Androidem 12, na APK podpisanym kluczem wydania: pięć szybkich zmian miejsc kończy się potwierdzonym zapisem do województwa z ostatniej zmiany, bez ponownego uruchamiania i bez ponowień. Na prawdziwym telefonie tej wersji nie sprawdzano.

Poprawka dotyczy Androida. iPhone numeruje synchronizacje od wcześniejszych wersji.

## Alert RCB dla kilku województw

9 listopada 2026 wieczorem Alert RCB poszedł do powiatów województw lubelskiego i podlaskiego. Oficjalny wpis, z którego korzysta Strażnik, wymieniał tylko lubelskie. Artykuł mediów „Alert RCB dla województw lubelskiego i podlaskiego” był traktowany jako powtórzenie alertu dla lubelskiego, więc podlaskie zostało bez punktów.

Teraz artykuł o Alercie RCB jest powtórzeniem tylko dla województw, które mają już własny oficjalny wpis. Województwo wymienione w tytule bez takiego wpisu dostaje punkty z mediów. Ochrona przed podwójnym liczeniem tego samego alertu zostaje bez zmian.

Po stronie serwera: gdy komunikat RCB na gov.pl przekierowuje na inną stronę, serwer ponawia odczyt w kolejnych obiegach i zapisuje ostrzeżenie w dzienniku, zamiast po cichu go pomijać.

## Litwa

W nocy z 10 na 11 listopada 2026 na Litwie ogłoszono czerwony alarm także przy granicy z Polską, a Strażnik go nie pokazał. LRT prowadził jeden artykuł o alarmach i przez całą noc zmieniał tylko jego tytuł, a data publikacji zostawała z pierwszego alarmu. Strażnik uznawał więc kolejne alarmy za stare albo za ten sam artykuł.

Teraz nowy tytuł znanego artykułu jest nowym zdarzeniem, a jego wiek liczy się od chwili, gdy go zobaczyliśmy. Trwający alarm rozszerzony na kolejne okręgi odświeża opis w oknie źródeł, ale nie dolicza punktów drugi raz.

Serwer przez tydzień obserwuje też rosyjskojęzyczny kanał LRT na Telegramie, który podawał alarmy tej nocy na bieżąco. To tylko obserwacja: nic stamtąd nie trafia do punktacji ani powiadomień. Po tygodniu zdecydujemy, czy i jak z niego korzystać.

## GROTA

Wykaz miejsc schronienia Państwowej Straży Pożarnej z 10 listopada 2026: 88 256 punktów (w wykazie z 2 listopada było 88 138). Wobec poprzedniej paczki 744 punkty doszły, 626 ubyło, a 652 się zmieniły, w tym 220 zmian dostępności. Punkt przy ul. Żarskiej 7 w Nowogrodzie Bobrzańskim stał dotąd 161 km dalej, pod Wronkami; teraz jest na miejscu.

Zrzuty instrukcji GROTY (filtry mapy, data wykazu, zmiana wykazu) wykonano na nowo w trzech językach.

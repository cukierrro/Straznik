# Biblioteka zdjęć samolotów i śmigłowców — weryfikacja wydania

Data: 2026-09-08. Biblioteka podłączona do frontendu i APK 1.7.18
(code 48). Bez zmian VPS, punktacji i powiadomień.

## Aktualny wynik

- 61 kodów z dostępnej historii ma jawną decyzję. 60 prawdziwych fotografii
  obejrzano i sprawdzono z opisem źródła oraz warunkami wykorzystania.
- 21 kodów pozwala na bezpośredni dobór przykładu modelu; 39 wymaga
  dodatkowego potwierdzenia modelu/wariantu. SB39 pozostaje bez zdjęcia.
- Krótkie rejestracje nie są kluczem zdjęć. Dla Z42/0543 dopuszczono
  udokumentowane powiązanie z hex 4984f4. Sprzeczny opis zawsze blokuje dobór.
- Lokalne zdjęcia zajmują 5,17 MiB; nie wymagają zapytań do API fotografii.
  Podpisy PL/EN odróżniają przykład modelu od obserwowanego egzemplarza,
  zawierają autora, źródło, licencję i informację o kadrowaniu źródłowym.
- Manifest: [verified-photos.json](verified-photos.json). Ręczne decyzje:
  [review-decisions.json](review-decisions.json). Pełna galeria: uruchom
  `scripts/serve_aircraft_review.py`, następnie http://127.0.0.1:8780/.
- Testy selektora: 10 PASS; test Android release na Pixelu 7: PASS,
  w tym załadowanie wszystkich 60 zdjęć offline i dwie karty regresyjne.
  Podpis certyfikatu release zgodny z dotychczasowym APK.
- Rzeczywiste zrzuty PL/EN z mapą: PASS po usunięciu przez użytkownika
  przeszkody po stronie osłony HTTPS hosta. Początkowy błąd
  `ERR_CERT_AUTHORITY_INVALID` nie wymagał zmiany zabezpieczeń aplikacji.
  Nowe zrzuty RCH5078 / C-17 dodano do obu instrukcji, test instrukcji PASS
  (21 obrazów). Wi-Fi emulatora przywrócono do wcześniejszego stanu.
- Zakres wydania obejmuje GitHub Release i instrukcję na GitHub Pages, bez zmian
  na VPS. Pełna historia od początku działania nie została odtworzona; zakres
  inwentaryzacji opisano poniżej.

Poniżej zachowano historię wcześniejszego badania. Pierwsze sześć kandydatur
i dwuelementowy podgląd nie są aktualnym katalogiem produkcyjnym.

**Aktualizacja:** potwierdzono dwa błędy zgłoszone przez użytkownika (019/PZ3T
i 0543/Z42), przygotowano dwa zweryfikowane przykłady i osobny selektor offline
z 12 testami PASS. Szczegóły: [diagnoza i dalsza praca](COLLISIONS_2026-09-08.md).
[Podgląd PL/EN](preview.html) należy otwierać przez lokalny serwer HTTP.
Nie jest to jeszcze poprawka podłączona do aplikacji. Poniższe pierwsze sześć
kandydatur stanowi wcześniejszy etap badania, nie zatwierdzony katalog.

## Uzgodnienie z użytkownikiem

Zdjęcie ma przedstawiać ten sam model, nie musi to być obserwowany egzemplarz
ani jego rejestracja. Preferowana własna biblioteka prawdziwych fotografii.
Podpis PL: „Przykładowy egzemplarz: [model]. Zdjęcie nie przedstawia obserwowanej maszyny”.
Podpis EN: “Example aircraft: [model]. Not a photo of the tracked aircraft.”
Nie zmieniać ikon maszyn na mapie.

Ilustracja AI jest ewentualnym materiałem poglądowym, nie zdjęciem, modelem
3D ani zweryfikowanym odwzorowaniem 1:1. Nie generować jej zamiast dostępnego
zdjęcia. Brak zgodności = brak zdjęcia, nigdy losowy podobny samolot.

## Inwentaryzacja, nie pełna historia

Znaleziono **61 kodów typu** w trzech lokalnych eksportach historii,
lokalnym stanie oraz jednym odczycie publicznego /api/history/bundle.
Pokrycie migawek: 07.09.2026 18:32:48 – 08.09.2026 21:05:51 CEST.
Pliki częściowo się pokrywają; liczby migawek nie oznaczają unikalnych lotów.
Kod typu nie zawsze identyfikuje dokładny wariant.

Źródła i czasy dla każdego kodu: [inventory.json](inventory.json).
Skrypt: scripts/audit_aircraft_models.py. Cztery testy offline PASS.

Kody: A148, A169, A319, A332, A400, AN28, AS32, B06, B350, B737, B739, B744, B77W, B788, BE20, C130, C17, C27J, C295, C30J, C560, CL2T, CL60, D228, DA40, DA62, E3CF, E3TF, E737, EC35, EN48, F16, F2TH, FA7X, GLEX, GLF4, GLF5, GLF6, H47, H60, IL76, K35R, L39, L410, LJ45, M28, MI8, P180, PC12, PC6T, PC7, PC9, PZ3T, R135, RFAL, SB39, SUCO, SW4, T204, W3, Z42.

**Nie udało się potwierdzić wszystkich modeli od początku działania aplikacji.**
Bieżące snapshots i adsb_watch_events są kasowane po 12 h; adsb_samples
przechowuje liczebność ruchu, nie modele. Część starszych danych może pozostać
w signals.details.aircraft lub kopiach baz. Próba listowania kopii na VPS przez
SSH BatchMode została odrzucona (uwierzytelnienie). Nie czytano sekretów.
Kolejny odczyt po zalogowaniu: retencja i zakres signals, zagregowane typy
z details.aircraft oraz dostępne kopie baz Strażnika. Bez odtwarzania kopii
na działającej produkcji i bez importowania modułu aplikacji.

## Historyczna diagnoza doboru (przed poprawką)

Poprzednie acPhoto w frontend/app.js pobierało pierwszy wynik z API po reg/hex.
Nie weryfikuje modelu; przy podanej rejestracji i braku wyniku nie wykonuje
kolejnej próby po hex. To ustalenie z kodu, nie dowód, że każda fotografia jest błędna.

Docelowo dobór zdjęcia przez zatwierdzony identyfikator modelu i jawne aliasy.
Nie utożsamiać automatycznie rodziny z wersją specjalną. Przeglądu wymagają
m.in. istniejące mapowania A332/A333→MRTT, GLEX→ARTEMIS, EC35→H135M,
H145→H145M oraz nazwy podwariantów H60/F35. To lista do weryfikacji,
nie gotowa nowa tabela identyfikacji. Nie zmieniać przy tym klasyfikacji
wojskowej, filtrowania kolektora ani naliczania punktów.

## Pierwsze sześć zdjęć — wynik ręcznej kontroli

Metadane i pełne linki: [photo-candidates.json](photo-candidates.json).
Przeczytano strony źródłowe, opis modelu i warunki licencji; pobrano pliki
lokalnie do test-out/aircraft-photo-review i obejrzano każdy z nich.
To **kandydaci**, a nie kompletna ani wdrożona biblioteka.

| Kod | Zdjęcie | Ocena |
| --- | --- | --- |
| H60 | UH-60 Black Hawk, Charles Rosemond / U.S. Army | Czytelny cały śmigłowiec; dobry przykład rodziny, wariant wymaga potwierdzenia. |
| W3 | W-3A Sokół, Iky100, CC BY-SA 3.0 | Czytelny przykład konkretnie W-3A; nie opisywać jako każdy wariant W3. |
| C17 | Prototyp T-1 w muzeum, James St. John, CC BY 2.0 | Szukać lepszego kadru: bardzo panoramiczny widok czołowy, osłony silników. |
| C30J | C-130J, Chris Birdwell / U.S. Air Force | Rzeczywista maszyna; końcówki skrzydeł obcięte już w oryginale. Szukać całej sylwetki. |
| H47 | Chinook jednostki specjalnej, Dustin Knight / U.S. Navy | Widoczne wyposażenie specjalne; nie używać jako bezwarunkowego przykładu standardowego CH-47. |
| A400 | A400M, Oleg V. Belyakov, CC BY-SA 3.0 | Model opisany jednoznacznie, ale ucięte skrzydła i ogon. Szukać całej sylwetki. |

Dla prac federalnych USA zachowano dokładne oznaczenie domeny publicznej ze
strony źródłowej (dotyczy USA), nie opis „bez licencji na całym świecie”.
Dla CC zachować autora, link źródła, wersję licencji i informację o zmianach.
Nie wykorzystywać uprawnień jednego autora do innych zdjęć tego serwisu.

## Pierwotny plan kontroli (postęp opisany powyżej)

1. Uzupełnić pozostałe typy, rozstrzygnąć warianty i przejrzeć wszystkie zdjęcia.
2. Przygotować lokalne pliki o rozsądnym rozmiarze oraz manifest z licencjami.
3. Podgląd kart PL/EN z podpisami, bez podmiany zdjęć w produkcji.
4. Testy: poprawne mapowanie; brak zdjęcia przy nieznanym lub sprzecznym typie;
   brak pomylenia zdjęć przy szybkim przełączaniu kart; offline; PL/EN.
5. Osobna zgoda na wdrożenie. Aktualizacja obu instrukcji zgodnie z AGENTS.md.

## Kolejna praca: lokalizacje

Użytkownik wybrał wariant 2 „Miejsca z szybką edycją”. Po pracy nad biblioteką
kontynuować projekt lokalizacji. Zakładki miejsc oraz dodawanie/edycja/usuwanie,
wybór dokładności, GPS tylko na żądanie. Dane lokalne, żadnego przesyłania
miejsc/adresu/GPS na VPS. Prototyp nie może korzystać z produkcyjnych FCM
ani zmieniać subskrypcji. Obsługa wielu regionów i konsekwencje prywatności
wymagają osobnej kontroli. Nie traktować akceptacji makiety jako zgody na
publikację modułu schronień lub zmianę alarmów.

# -*- coding: utf-8 -*-
"""Buduje dwujęzyczną stronę „Historia zmian" (docs/zmiany.html, docs/zmiany-en.html).

Jedno źródło prawdy dla obu języków: dopisanie wydania to jeden wpis w RELEASES.
Pełne omówienia zostają w docs/RELEASE_*.md — tutaj są skróty z ilustracjami,
bo strona ma odpowiadać na pytanie „co się zmieniło w mojej aplikacji".

Uruchomienie: py scripts/build_changelog.py
"""
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

# (wersja, data PL, data EN, tytuł PL, tytuł EN, punkty PL, punkty EN, zrzuty)
# Zrzut: (plik, alt PL, alt EN, podpis PL, podpis EN)
RELEASES = [
    ("1.7.61", "18 września 2026", "18 September 2026",
     "Trzy poprawki zgłoszone z telefonów",
     "Three fixes reported from phones",
     ["Historia znowu pokazuje obiekty tak jak mapa na żywo. Po poprzednim wydaniu zamiast ikony drona bywał pełny żółty krążek — wiek meldunku, który wygasza ikonę, nie docierał do zapisanych migawek, a bez niego rysowanie wywracało się na domyślne ustawienia.",
      "W oknie „Moje miejsca” widać wszystkie zapisane miejsca naraz. Przy czterech i więcej rząd zakładek przewijał się w bok i na wąskim ekranie miejsca po prostu znikały za krawędzią; teraz zawijają się do kolejnych wierszy, a długie nazwy kończą się wielokropkiem.",
      "Na iPhonie dotknięcie pola formularza nie powiększa już całego ekranu — pola mają wymagane 16 punktów. Na Androidzie ta zmiana nic nie zmienia."],
     ["History shows objects the way the live map does again. Since the previous release a drone icon could turn into a solid yellow disc: the report age that fades an icon never reached the stored snapshots, and without it the drawing fell back to its defaults.",
      "The My places window shows every saved place at once. With four or more the tab row scrolled sideways and, on a narrow screen, places simply vanished past the edge; they now wrap onto further lines and long names end in an ellipsis.",
      "On iPhone, touching a form field no longer magnifies the whole screen — fields now use the required 16 points. On Android nothing changes."],
     []),

    ("1.7.60", "17 września 2026", "17 September 2026",
     "Widać, jak stary jest meldunek",
     "You can see how old each report is",
     ["Pod ikoną drona albo rakiety pojawia się wiek ostatniego meldunku, np. „7 min”, a sama ikona stopniowo blednie: od dziesięciu minut do godziny. Karta obiektu ma teraz linię „ostatni meldunek”, a przy meldunku starszym niż kwadrans dopisek, że obiekt mógł się od tego czasu przemieścić.",
      "Po co: NEPTUN zbiera zgłoszenia ludzi, nie odczyty radaru. Obiekt stoi w tym samym miejscu, dopóki ktoś nie zgłosi go ponownie, a czasem kolejnego zgłoszenia nie ma wcale. Pomiar z 17 września: w ciągu dziesięciu minut pozycję zmienił jeden obiekt z czternastu. Nieruchoma ikona to brak nowych zgłoszeń, a nie zawieszona mapa.",
      "Komunikat „brak połączenia z serwerem” pokazuje się dopiero po sześciu sekundach bez połączenia. Wcześniej migał także wtedy, gdy telefon wracał z tła i połączenie wracało po sekundzie."],
     ["Under a drone or missile icon there is now the age of the last report, for example “7 min”, and the icon fades gradually between ten minutes and an hour. The object card has a “last report” line and, past a quarter of an hour, adds that the object may have moved on since.",
      "Why: NEPTUN collects human reports, not radar returns. An object stays where it was until someone reports it again, and sometimes no further report arrives. Measured on 17 September: one object out of fourteen changed position within ten minutes. A motionless icon means no new reports, not a frozen map.",
      "The “server connection lost” notice now waits six seconds. Before, it also flashed when the phone came back from the background and the connection returned within a second."],
     []),

    ("1.7.59", "17 września 2026", "17 September 2026",
     "Lżejsze połączenie na żywo",
     "A lighter live connection",
     ["Serwer wysyłał dotąd każdemu telefonowi cały stan mapy (ok. 55 KB) przy każdej zmianie i kompresował go osobno dla każdego połączenia. Pomiar z 17 września: rozesłanie do 1281 telefonów zajmowało prawie sekundę i blokowało w tym czasie serwer — stąd zacięcia i komunikat o dużym ruchu podczas syren.",
      "Teraz przez połączenie na żywo idzie krótki sygnał „zmieniło się” (ok. 50 bajtów), a aplikacja pobiera stan mapy z pamięci podręcznej Cloudflare. Rozesłanie sygnału do tysiąca telefonów zajmuje 5 milisekund zamiast sekundy, a pobranie stanu w większości przypadków nie obciąża już serwera.",
      "Dla Ciebie nic się nie zmienia: mapa odświeża się tak samo, pierwszy stan przychodzi od razu po połączeniu, a alarmy i powiadomienia idą osobną drogą i działają bez zmian. Limit jednoczesnych połączeń wzrósł do 15 000."],
     ["Until now the server sent every phone the whole map state (about 55 KB) on each change and compressed it separately for each connection. Measured on 17 September: a fan-out to 1281 phones took almost a second and blocked the server meanwhile — this is what caused the stalls and the heavy-traffic notice during the sirens.",
      "Now the live connection carries a short “changed” signal (about 50 bytes) and the app fetches the map state from Cloudflare's edge cache. Sending that signal to a thousand phones takes 5 milliseconds instead of a second, and fetching the state mostly no longer touches the server.",
      "Nothing changes for you: the map refreshes as before, the first state arrives immediately after connecting, and alerts and notifications travel a separate path and work unchanged. The live-connection limit is now 15,000."],
     []),

    ("1.7.58", "17 września 2026", "17 September 2026",
     "Nowy serwer od Mikrusa",
     "A new server from Mikrus",
     ["Od 17 września Strażnik działa na osobnym serwerze, który przekazał projektowi Mikrus. Wcześniej dzielił dwa rdzenie procesora z innymi projektami; przeniesienie trwało niespełna minutę i nie zmieniło adresu strony ani działania powiadomień.",
      "Pod napisem STRAŻNIK jest teraz logo Mikrusa i link „hostowane na Mikrusie”, a w okienku po dotknięciu nazwy aplikacji — krótkie podziękowanie z linkiem do strony Mikrusa. Ta sama informacja jest w oknie „O aplikacji”, w stopce instrukcji i w README.",
      "W wersji angielskiej okienko po dotknięciu nazwy aplikacji znów ma link do kodu źródłowego na GitHubie."],
     ["Since 17 September Strażnik runs on its own server, provided to the project by Mikrus. Before, it shared two CPU cores with other projects; the move took under a minute and changed neither the website address nor how notifications work.",
      "Under the STRAŻNIK name there is now the Mikrus logo and a “hosted on Mikrus” link, and the popover shown after tapping the app name has a short thank-you with a link to the Mikrus website. The same note is in the About window, the user guide footer and the README.",
      "In English, the popover shown after tapping the app name has its GitHub source code link back."],
     []),

    ("1.7.57", "17 września 2026", "17 September 2026",
     "Przyciski przewijania historii i działający przycisk „wstecz”",
     "History scroll buttons and a working back button",
     ["Pod suwakiem historii jest teraz rząd dziewięciu przycisków: początek (−12 h), poprzedni alarm, −10 i −1 minut, odtwarzanie i pauza, +1 i +10 minut, następny alarm oraz koniec. Przytrzymanie ±1 i ±10 przewija dalej, a przycisk ×1 w nagłówku zmienia prędkość odtwarzania na ×2 i ×4. Dotąd było ok. 720 migawek na kilku centymetrach suwaka i trudno było trafić w konkretną minutę.",
      "Skoki do alarmów przenoszą na początek poprzedniego albo następnego okresu z poziomem podwyższonym lub wysokim. Kroki liczą się po czasie migawek, więc po przerwie w działaniu aplikacji przycisk przeskakuje dziurę, zamiast stać w miejscu.",
      "Pełnej szerokości przycisk „Wróć do podglądu na żywo” zastąpiła mała ramka „ZMIEŃ NA ŻYWO” obok napisu „PODGLĄD HISTORII”. Pasek zajmuje mniej miejsca na mapie.",
      "Systemowy przycisk „wstecz” na Androidzie najpierw zamyka to, co jest otwarte: okno ustawień, kartę obiektu, legendę, tryb historii albo panel sygnałów. Dopiero na samej mapie chowa aplikację. Wcześniej od razu ją minimalizował. Podczas czerwonego alarmu „wstecz” niczego nie zamyka, żeby przypadkowe dotknięcie go nie uciszyło."],
     ["The history slider now has a row of nine buttons below it: start (−12 h), previous alert, −10 and −1 minutes, play and pause, +1 and +10 minutes, next alert and end. Holding ±1 and ±10 keeps scrolling, and the ×1 button in the header switches playback speed to ×2 and ×4. Before, about 720 snapshots sat on a few centimetres of slider and a specific minute was hard to hit.",
      "Alert jumps go to the start of the previous or next period with an elevated or high level. Steps follow snapshot times, so after a gap when the app was closed a button jumps across the gap instead of standing still.",
      "The full-width “Back to live view” button has been replaced by a small “SWITCH TO LIVE” frame next to “HISTORY VIEW”. The bar covers less of the map.",
      "The Android system back button first closes whatever is open: the settings window, an object card, the legend, history view or the signals panel. Only on the plain map does it send the app to the background. Before, it minimised the app straight away. During a red alert back closes nothing, so an accidental tap cannot silence it."],
     []),

    ("1.7.56", "17 września 2026", "17 September 2026",
     "Duży ruch zamiast „brak połączenia”",
     "“Heavy traffic” instead of “connection lost”",
     ["Podczas syren w Lublinie i Rzeszowie 17 września z serwerem łączyło się naraz więcej osób, niż pozwalał limit połączeń na żywo. Serwer działał, a mapa się odświeżała, ale aplikacja przez około dwie godziny pokazywała „brak połączenia z serwerem” i co kilka sekund próbowała połączyć się od nowa.",
      "Teraz, gdy serwer jest zajęty, aplikacja pokazuje „duży ruch — mapa odświeżana co kilka sekund”, pobiera stan mapy co 5–8 sekund i próbuje połączenia na żywo co 1–2 minuty. Napis „brak połączenia” pojawia się tylko wtedy, gdy nie da się pobrać nawet stanu mapy.",
      "Po stronie serwera limit połączeń na żywo wzrósł z 3000 do 10 000, a nadmiarowi użytkownicy dostają czytelny sygnał „zajęty” zamiast odmowy. Te zmiany działają już na stronie internetowej. Powiadomienia i alarmy nie zależą od połączenia na żywo — przychodzą przez usługę powiadomień Androida."],
     ["During the sirens in Lublin and Rzeszów on 17 September more people connected at once than the live-connection limit allowed. The server kept working and the map kept refreshing, but for about two hours the app showed “server connection lost” and retried every few seconds.",
      "Now, when the server is busy, the app shows “heavy traffic — map refreshes every few seconds”, fetches the map state every 5–8 seconds and retries the live connection every 1–2 minutes. “Connection lost” appears only when even the map state cannot be fetched.",
      "On the server the live-connection limit went up from 3000 to 10,000, and extra users get a clear “busy” signal instead of a refusal. These changes already work on the website. Notifications and alerts do not depend on the live connection — they arrive through Android’s notification service."],
     []),

    ("1.7.55", "17 września 2026", "17 September 2026",
     "Przypomnienie o alarmie pełnoekranowym i stabilniejsze połączenie",
     "Full-screen alert reminder and a steadier connection",
     ["Po każdej aktualizacji na Androidzie 14 i nowszym aplikacja raz pokazuje okno „Alarm pełnoekranowy — sprawdź zgodę po aktualizacji”. Android potrafi wyłączyć tę zgodę przy aktualizacji aplikacji spoza Sklepu Play, a bez niej czerwony alarm nie zapali wygaszonego ekranu. Przycisk „Sprawdź zgodę” otwiera właściwy przełącznik w ustawieniach. Okno pojawi się przy następnych aktualizacjach, od 1.7.55 do kolejnej wersji.",
      "Wcześniej aplikacja mogła tego nie zauważyć: Android bywa optymistyczny i zgłasza zgodę jako włączoną, a pasek z ostrzeżeniem, raz zamknięty, już nie wracał. Teraz po aktualizacji pasek znów się pokazuje.",
      "Gdy sieć (np. firmowa) zrywa połączenie na żywo zaraz po jego nawiązaniu, aplikacja i strona nie łączą się już ponownie co sekundę. Po trzech krótkich połączeniach przechodzą na pobieranie stanu co kilka sekund i próbują połączenia na żywo co około 5 minut. Mapa dalej się odświeża, a serwer nie jest zasypywany zapytaniami."],
     ["After every update on Android 14 and later the app shows a one-time “Full-screen alert — check the permission after an update” dialog. Android may turn this permission off when an app from outside the Play Store is updated, and without it a red alert will not wake the locked screen. The “Check permission” button opens the right system toggle. The dialog appears on the next updates, from 1.7.55 onwards.",
      "Previously the app could miss this: Android can report the permission as granted when it is not, and the warning banner, once closed, never came back. After an update the banner shows again.",
      "When a network (e.g. a corporate one) drops the live connection right after it opens, the app and the website no longer reconnect every second. After three short connections they fetch the state every few seconds and retry the live connection about every 5 minutes. The map keeps refreshing and the server is not flooded."],
     []),

    ("1.7.54", "17 września 2026", "17 September 2026",
     "Bezpieczniejsze aktualizacje i nowa licencja",
     "Safer updates and a new licence",
     ["Aktualizacja z poziomu aplikacji pobiera plik tylko z wydań Strażnika na GitHubie i przed instalacją sprawdza nie tylko sumę kontrolną, ale też to, że plik jest Strażnikiem podpisanym tym samym kluczem co wersja na telefonie. Podrobiony plik zostanie odrzucony, zanim otworzy się instalator Androida.",
      "Od tej wersji kod jest objęty licencją „wszelkie prawa zastrzeżone”; wersje do 1.7.53 pozostają na MIT. Aplikację nadal pobierasz i używasz bezpłatnie. W oknie „O aplikacji” są linki do licencji i do licencji składników (NOTICE).",
      "W powiadomieniu o alarmie tytuł artykułu pojawia się tylko od znanych redakcji i z kanałów wpisanych na stałe; inne doniesienia są opisane jako „Doniesienie medialne”, a pełny tytuł widać w aplikacji. Obca strona nie może już wstawić swojego tekstu do alarmu.",
      "Poprawki bezpieczeństwa po audycie: treści z zewnętrznych źródeł w panelu sygnałów i w karcie samolotu są dokładniej zabezpieczone, a serwer odrzuca zbyt duże zapytania i zalew zapisów do powiadomień."],
     ["In-app updates download the file only from Strażnik releases on GitHub and, before installing, check not only the checksum but also that the file is Strażnik signed with the same key as the version on your phone. A forged file is rejected before the Android installer opens.",
      "From this version the code is under an “all rights reserved” licence; versions up to 1.7.53 stay under MIT. You can still download and use the app for free. The About dialog links to the licence and to third-party licences (NOTICE).",
      "Alert notifications quote an article title only from known newsrooms and from feeds configured directly; other reports are shown as “Media report” and the full title is visible in the app. An outside site can no longer put its own text into an alert.",
      "Security fixes after an audit: content from external sources in the signals panel and aircraft card is escaped more strictly, and the server rejects oversized requests and floods of notification sign-ups."],
     []),

    ("1.7.53", "16 września 2026", "16 September 2026",
     "Drony znów się ruszają, kolory alarmów nie migają",
     "Drones move again, alert colours no longer flicker",
     ["Dlaczego ikony stały: do wersji 1.7.47 aplikacja przesuwała drona „na zapas” — typową prędkością dla jego rodzaju i kursem domniemanym, gdy NEPTUN go nie podawał. Audyt w 1.7.48 pokazał, że ikona odlatywała wtedy tam, gdzie drona nie było, czasem kilkanaście kilometrów dalej albo w złą stronę, więc to wyłączyliśmy. Skutek uboczny: dron bez zmierzonej prędkości stał do następnego meldunku i przeskakiwał.",
      "Co teraz: po każdym nowym meldunku NEPTUN-a ikona płynnie przejeżdża ze starej pozycji do nowej przez 45 sekund, a linia trasy kończy się na ikonie.",
      "Czym to się różni od dawnego ruchu: ikona jedzie tylko po odcinku między dwiema prawdziwymi pozycjami — nigdy nie wyprzedza źródła i nie zgaduje dalszego lotu. W trakcie przejazdu jest do 45 s za meldunkiem, a po nim stoi dokładnie w miejscu meldunku. Skoki ponad 80 km i meldunki po powrocie do aplikacji pokazujemy od razu. Obiekty ze zmierzoną prędkością i kursem przesuwają się jak dotąd (do 18 km, do 7 min). Punkty i alarmy liczymy, jak wcześniej, z meldunków, nie z pozycji ikony.",
      "Kolor województwa (żółty, czerwony) trzyma się 10 minut od ostatniego przekroczenia progu. 16.09 podkarpackie zmieniło kolor 7 razy w pół godziny — teraz byłyby 2 zmiany. Wzrost poziomu jest natychmiastowy, a odwołanie alertu RCB zdejmuje go od razu.",
      "W historii czas wstecz wygląda jak „−5 h 57 min”, a na niskich ekranach panel historii ma więcej miejsca. Artykuły o tym, że lotnictwo zakończyło działania, nie dają punktów."],
     ["Why icons stood still: up to 1.7.47 the app moved a drone ahead of its reports — at a speed typical for its kind and along a presumed heading when NEPTUN gave none. The 1.7.48 audit showed that the icon then flew to where no drone was, sometimes a dozen kilometres further or the wrong way, so we turned it off. Side effect: a drone without a measured speed stood still until the next report and then jumped.",
      "What now: after each new NEPTUN report the icon glides smoothly from the old position to the new one over 45 seconds, and the track line ends at the icon.",
      "How this differs from the old movement: the icon only travels along the segment between two real positions — it never gets ahead of the source and never guesses the further flight. While gliding it is up to 45 s behind the report, and afterwards it sits exactly at the reported position. Jumps over 80 km and reports received after returning to the app are shown at once. Objects with a measured speed and heading move as before (up to 18 km, up to 7 min). Points and alerts are still computed from reports, not from the icon position.",
      "A province colour (yellow, red) is held for 10 minutes after the score last reached its threshold. On 16.09 podkarpackie changed colour 7 times in half an hour — now it would be 2 changes. Raising the level is immediate, and an RCB alert cancellation drops it at once.",
      "History shows the time offset as “−5 h 57 min”, and on short screens the history panel has more room. Articles saying that aircraft have ended operations no longer add points."],
     []),

    ("1.7.52", "15 września 2026", "15 September 2026",
     "Alarmy u sąsiadów na mapie i ostrzejsze media bałtyckie",
     "Neighbouring alerts on the map and stricter Baltic media",
     ["Na mapie świecą rejony Ukrainy z alarmem powietrznym — czerwone i żółte, jak w NEPTUN-ie. To tylko podgląd: nie dolicza punktów. Po dotknięciu rejonu widać poziom, godzinę i powód.",
      "Litwa, Łotwa i Estonia dostają czerwony odcień, gdy media tych krajów podają ogłoszony alarm, a nie ma jeszcze odwołania.",
      "Media krajów bałtyckich ważą mniej: incydent 0,5 pkt zamiast 1. Liczy się tylko doniesienie z ostatnich 30 minut o zdarzeniu teraz — bez komentarzy („Minister: …”), relacji z wczoraj i artykułów z godziną zdarzenia sprzed ponad godziny.",
      "Poranne podsumowania i publicystyka po nocnym alercie RCB („Nocny alert RCB…”, „Alert RCB zamiast ostrzegać…”) nie dają już punktów.",
      "W legendzie jest nowa sekcja „Alarmy u sąsiadów (bez punktów)”."],
     ["Ukrainian districts with an air-raid alert light up red or yellow, as in NEPTUN. It is a preview only and adds no points. Tap a district to see the level, start time and reason.",
      "Lithuania, Latvia and Estonia get a red tint when their media report a declared alert that has not yet been lifted.",
      "Baltic media weigh less: an incident is 0.5 pt instead of 1. Only a report from the last 30 minutes about something happening now counts — no commentary (“Minister: …”), no reports about yesterday and no articles whose event time is over an hour old.",
      "Morning recaps and opinion pieces after a night RCB alert (“Nocny alert RCB…”, “Alert RCB zamiast ostrzegać…”) no longer add points.",
      "The legend has a new section, “Alerts in neighbouring countries (no points)”."],
     []),

    ("1.7.51", "15 września 2026", "15 September 2026",
     "Starsze telefony, duża czcionka i komunikat MiG-31K jak w NEPTUN-ie",
     "Older phones, large fonts and a MiG-31K notice matching NEPTUN",
     ["Komunikat o starcie MiG-31K brzmi jak w NEPTUN-ie: „monitoring, nie alarm”, gdy Ukraina nie ogłosiła alarmu dla całego kraju. Wcześniej aplikacja zawsze pisała „alarm w całej Ukrainie”.",
      "Na telefonach ze starszym silnikiem przeglądarki (np. Galaxy S10 bez aktualizacji WebView) okno „Moje miejsca” i inne okna znów się przewijają i widać w nich przyciski Zapisz i Anuluj.",
      "Przy dużej czcionce systemowej i na małych ekranach zakładki ustawień nie są ucinane, przyciski mapy nie wchodzą na górny pasek (w razie potrzeby zostają same ikony), a panel sygnałów zaczyna się pod paskiem.",
      "Strefy PAŻP i dziennik obcych maszyn ładują się także na starszych Androidach. Na zbyt starym silniku przeglądarki zamiast pustego ekranu jest instrukcja, co zaktualizować.",
      "W przeglądarce obiekty nie przeskakują już między starym a aktualnym położeniem — stan z serwera nie jest brany z pamięci przeglądarki.",
      "Ustawienia mówią wprost, gdy nie wybrano jeszcze województwa do alarmów, zamiast pokazywać „Wypisywanie telefonu z województw…”. Mapa dopasowuje się do zmiany rozmiaru ekranu w trakcie uruchamiania (tablety, podzielony ekran)."],
     ["The MiG-31K take-off notice now matches NEPTUN: “monitoring, not an alert” when Ukraine has not declared a nationwide alert. Previously the app always said “alert across Ukraine”.",
      "On phones with an older browser engine (e.g. a Galaxy S10 without WebView updates) My places and other dialogs scroll again and show the Save and Cancel buttons.",
      "With a large system font and on small screens the settings tabs are no longer cut off, map buttons no longer overlap the top bar (icons only when needed), and the signals panel starts below the bar.",
      "Airspace zones and the foreign aircraft log also load on older Android versions. On a browser engine that is too old, a screen explains what to update instead of staying blank.",
      "In the browser, objects no longer jump between an old and the current position — the server state is no longer taken from the browser cache.",
      "Settings say plainly when no province has been chosen for alerts yet, instead of “Unsubscribing this phone from provinces…”. The map adapts when the screen size changes during start-up (tablets, split screen)."],
     []),

    ("1.7.50", "15 września 2026", "15 September 2026",
     "Suwak „Alarmy na tym telefonie” z potwierdzeniem",
     "“Alerts on this phone” switch with confirmation",
     ["Wyłączenie alarmów nie ginie już po zamknięciu aplikacji przez Androida — wcześniej po ponownym uruchomieniu telefon zapisywał się z powrotem do województwa.",
      "Zamiast pola „Nie chcę alarmów” jest suwak „Alarmy na tym telefonie”, jak w ustawieniach Androida.",
      "Po wyłączeniu telefon wypisuje się ze wszystkich województw, a status pokazuje, do ilu jest zapisany — z potwierdzeniem z Firebase. Nawet gdyby alarm dotarł przed wypisaniem, telefon go nie pokaże.",
      "Przy wyłączonych alarmach testy dźwięku i alarmu nie udają już, że alarm zadziała, tylko mówią, jak włączyć alarmy."],
     ["Turning alerts off is no longer lost when Android closes the app — previously the phone re-subscribed to its province on the next start.",
      "The “I don't want alerts” box is now an “Alerts on this phone” switch, as in Android settings.",
      "When switched off, the phone unsubscribes from every province and the status shows how many it is subscribed to, confirmed by Firebase. Even an alert that arrives before the unsubscription is not shown.",
      "With alerts off, the sound and alert tests no longer pretend an alert would work; they say how to turn alerts on."],
     []),

    ("1.7.49", "14 września 2026", "14 September 2026",
     "Mniej fałszywych sygnałów z mediów",
     "Fewer false media signals",
     ["Odnośniki do innych artykułów w opisie RSS („CZYTAJ: …”) nie są już brane za treść wpisu — artykuł o oszuście nie dostanie punktów za „atak dronów” z polecanego tekstu.",
      "Miesiąc „września” nie jest już brany za miasto Września, więc daty nie przypisują artykułów do województwa wielkopolskiego."],
     ["Links to other articles in RSS descriptions (“CZYTAJ: …”) are no longer read as the entry's content — a story about a fraudster no longer scores for a “drone attack” in a recommended headline.",
      "The month “września” (September) is no longer mistaken for the town of Września, so dates no longer assign articles to Greater Poland."],
     []),

    ("1.7.48", "14 września 2026", "14 September 2026",
     "Dokładniejsza granica, uczciwy czas dolotu i tryb awaryjny",
     "More accurate border, honest arrival times and emergency mode",
     ["Odległość obiektu liczymy do rzeczywistego konturu Polski, razem z wybrzeżem: obiekt nad Polską ma „nad Polską”, a kurs porównujemy z całym krajem, a nie z najbliższym punktem granicy.",
      "Kurs „kursem na X” podany przez NEPTUN jako domniemany nie uruchamia już alarmu czasu dolotu, dopóki ruch obiektu go nie potwierdzi; drony odrzutowe (Geran-3) liczymy przy 450 km/h albo zmierzonej prędkości.",
      "Czas dolotu w karcie to przedział uwzględniający niepewność pozycji i wiek danych; na liście sygnałów starzeje się razem z sygnałem.",
      "Znaczniki nie jeżdżą po mapie bez zmierzonego ruchu, przybliżone pozycje mają szerszy okrąg, a trasa obiektu nie urywa się przy zmianie identyfikatora.",
      "Historia pokazuje przeniesienia od sąsiednich województw, a tryb awaryjny ma stały znacznik, że bez serwera alarmy nie przyjdą przy zamkniętej aplikacji.",
      "W „O aplikacji” nowa lista tego, czego system nie widzi: rakiety balistyczne, kierunek białoruski, Kaliningrad i Bałtyk."],
     ["Object distance is measured to Poland's actual outline, including the coast: an object over Poland shows “over Poland”, and its heading is compared with the whole country, not the nearest border point.",
      "A presumed NEPTUN heading (“towards X”) no longer triggers the arrival-time alert until the object's movement confirms it; jet drones (Geran-3) are counted at 450 km/h or their measured speed.",
      "The card shows arrival time as a range that allows for position uncertainty and data age; in the signal list it ages with the signal.",
      "Markers no longer drift without measured movement, approximate positions get a wider circle, and an object's track no longer breaks when its ID changes.",
      "History includes transfers from neighbouring provinces, and emergency mode shows a permanent badge that alerts will not arrive while the app is closed without the server.",
      "About now lists what the system cannot see: ballistic missiles, the Belarusian direction, Kaliningrad and the Baltic."],
     []),

    ("1.7.47", "14 września 2026", "14 September 2026",
     "Jaśniejszy komunikat o MiG-31K i stabilny pasek historii",
     "Clearer MiG-31K notice and a steady history bar",
     ["Komunikat o starcie MiG-31K wyjaśnia, co oznacza: samolot przenosi rakiety Kindżał, więc sam start to alarm dla całej Ukrainy; położenia nie podaje żadne źródło, a dla Polski to informacja, nie zagrożenie.",
      "W historii komunikat jest małą plakietką w nagłówku paska (pełny tekst po dotknięciu), więc pasek i przyciski mapy nie podskakują już spod palca podczas przewijania."],
     ["The MiG-31K take-off notice explains what it means: the aircraft carries Kinzhal missiles, so the take-off alone is an alert for all of Ukraine; no source gives its position, and for Poland it is information, not a threat.",
      "In history the notice is a small badge in the bar header (full text on tap), so the bar and map buttons no longer jump from under your finger while scrubbing."],
     []),

    ("1.7.46", "14 września 2026", "14 September 2026",
     "Płynniejsza historia i start MiG-31K jako komunikat",
     "Smoother history and MiG-31K take-off as a notice",
     ["Historia mapy ma migawki co minutę zamiast co dwie, więc przewijanie jest płynniejsze.",
      "Start MiG-31K ogłoszony przez NEPTUN dla całej Ukrainy jest komunikatem nad paskiem województwa, a nie ikoną stojącą w środku Ukrainy. To alarm ogólnokrajowy bez pozycji samolotu i nie dolicza punktów; maszyna zgłoszona w konkretnym miejscu nadal jest na mapie."],
     ["The map history has a snapshot every minute instead of every two, so scrubbing is smoother.",
      "A MiG-31K take-off announced by NEPTUN for all of Ukraine is a notice above the province bar, not an icon parked in central Ukraine. It is a nationwide alert without an aircraft position and adds no points; an aircraft reported at a specific place is still on the map."],
     []),

    ("1.7.45", "14 września 2026", "14 September 2026",
     "Wyraźne granice państw na mapie",
     "Clear national borders on the map",
     ["Kraje sąsiednie mają wyraźnie różne kolory, więc granice widać jako ciągły styk barw — bez przerw przy pochylonej i oddalonej mapie.",
      "Krym jest zaznaczony w granicach Ukrainy, a sąsiednie kraje nie nachodzą już na siebie pasami (np. Litwa i Łotwa)."],
     ["Neighbouring countries have clearly different colours, so borders show as a continuous colour edge — no gaps on a tilted or zoomed-out map.",
      "Crimea is shown within Ukraine, and neighbouring countries no longer overlap in strips (e.g. Lithuania and Latvia)."],
     []),

    ("1.7.44", "14 września 2026", "14 September 2026",
     "Rezygnacja z alarmów, kierunek drona i poprawki mediów bałtyckich",
     "Opting out of alerts, drone heading and Baltic media fixes",
     ["Ostrzeżenie o zgodach na mapie ma krzyżyk, a w ⚙ → Alarmy można wyłączyć alarmy na tym telefonie i zostać przy samym podglądzie mapy.",
      "Dziób ikony drona wskazuje kierunek zmierzony z ruchu — ten sam co trasa i linia kierunku; karta pokazuje, gdy NEPTUN podaje inny kurs.",
      "Media z Litwy, Łotwy i Estonii: artykuł o alarmach (rozmowa, pytania) nie jest już alarmem, a atak na Ukrainie nie jest incydentem bałtyckim."],
     ["The permission warning on the map has a close button, and ⚙ → Alerts lets you turn alerts off on this phone and keep only the map view.",
      "The drone icon's nose shows the heading measured from movement — the same as the track and heading line; the card notes when NEPTUN reports a different heading.",
      "Lithuanian, Latvian and Estonian media: an article about alerts (an interview, questions) is no longer an alert, and a strike in Ukraine is no longer a Baltic incident."],
     []),

    ("1.7.43", "13 września 2026", "13 September 2026",
     "Granice państw w dotychczasowym wyglądzie",
     "National borders back to their previous look",
     ["Wyraźniejsze białe obrysy granic państw zostały czasowo zdjęte: przy pochylonej mapie znikały na nich odcinki. Mapa pokazuje granice tak jak mapa bazowa, a obrysy wrócą w najbliższej przyszłości — dopracowane.",
      "Trasy obiektów i samolotów z 1.7.42 zostają bez zmian."],
     ["The more visible white national border outlines have been temporarily removed: parts of them disappeared on the tilted map. The map shows borders as the base map draws them, and refined outlines will return in the near future.",
      "Object and aircraft tracks from 1.7.42 stay unchanged."],
     []),

    ("1.7.42", "13 września 2026", "13 September 2026",
     "Ciągłe granice po oddaleniu i widoczne trasy obiektów",
     "Continuous borders when zoomed out and visible object tracks",
     ["Granice państw nie mają już przerw po oddaleniu mapy — także między Białorusią a Ukrainą, przy Krymie i na linii frontu.",
      "Trasy obiektów i samolotów widać od razu po otwarciu aplikacji: serwer przesyła krótką historię pozycji.",
      "Kierunek lotu korzysta też z trasy podawanej przez NEPTUN; linia trasy jest wyraźniejsza."],
     ["National borders no longer break up when the map is zoomed out — including between Belarus and Ukraine, around Crimea and along the front line.",
      "Object and aircraft tracks show right after opening the app: the server sends a short position history.",
      "The heading line also uses the track reported by NEPTUN; the track line is more visible."],
     []),

    ("1.7.41", "13 września 2026", "13 September 2026",
     "Pewniejsze alarmy, głośność syreny i trasy obiektów",
     "More reliable alerts, siren volume and object tracks",
     ["Otwarta aplikacja alarmuje dla każdego obserwowanego województwa, nie tylko pierwszego miejsca; push przy otwartej aplikacji już nie przepada.",
      "Czerwona syrena gra w pętli do wyciszenia (przycisk na ekranie alarmu albo „Wycisz alarm” w powiadomieniu) i podnosi głośność „Alarmy” co najmniej do połowy. Opcja pełnej głośności — domyślnie wyłączona, tylko po świadomym włączeniu.",
      "Żółty sygnał uwagi szanuje tryb cichy i Nie przeszkadzać. Powiadomienie opóźnione o ponad 10 minut przychodzi cicho z dopiskiem.",
      "Alarmy docierają po restarcie telefonu przed odblokowaniem; subskrypcje województw są odnawiane i potwierdzane przy każdym starcie.",
      "Trasy obiektów na mapie: osobno dla dronów i rakiet oraz samolotów — wyłączone, przebyta trasa albo trasa i kierunek lotu.",
      "Natywne testy czerwonego i żółtego alarmu w ustawieniach, czytelniejszy alarm („co zrobić”, najbliższy obiekt), wyraźniejsze granice państw i dioda RCB/RSO."],
     ["The open app alerts for every watched province, not only the first place; a push received while the app is open is no longer lost.",
      "The red siren loops until silenced (the button on the alert screen or “Wycisz alarm” in the notification) and raises the “Alarms” volume to at least half. A full-volume option — off by default, only when deliberately switched on.",
      "The yellow attention sound respects silent mode and Do Not Disturb. A notification delayed by more than 10 minutes arrives silently with a note.",
      "Alerts arrive after a phone restart before unlocking; province subscriptions are renewed and confirmed at every start.",
      "Object tracks on the map: separately for drones and missiles and for aircraft — off, flown track, or track and heading.",
      "Native red and yellow alert tests in settings, a clearer alert (“what to do”, nearest object), more visible national borders and an RCB/RSO indicator."],
     []),

    ("1.7.40", "13 września 2026", "13 September 2026",
     "Koniec i czas trwania alarmów w obwodach UA",
     "End and duration of Ukrainian oblast alerts",
     ["Koniec alarmu w obwodzie Ukrainy od razu zeruje jego punkty i gasi podświetlenie obwodu. Wcześniej 10-minutowy alarm liczył się jeszcze do godziny.",
      "Długi alarm liczy się dalej: pełna waga przez pierwsze 30 minut od prawdziwego początku, potem połowa, dopóki trwa. Wcześniej alarm trwający kilka godzin znikał z punktów po godzinie.",
      "Panel pokazuje godzinę końca alarmu albo „trwa od …, połowa wagi”, a karta obwodu — od kiedy trwa alarm.",
      "Litwa, Łotwa i Estonia: kanały i ostatni alarm w oknie Źródła (od 1.7.38 na stronie, teraz także w aplikacji)."],
     ["The end of an alert in a Ukrainian oblast zeroes its points and switches off the oblast highlight at once. Previously a 10-minute alert kept counting for up to an hour.",
      "A long alert keeps counting: full weight for the first 30 minutes from its real start, then half while it lasts. Previously an alert lasting hours dropped out of the score after an hour.",
      "The panel shows when the alert ended or “in progress since …, half weight”, and the oblast card shows when the alert started.",
      "Lithuania, Latvia and Estonia: feeds and the last alert in the Sources window (on the website since 1.7.38, now in the app too)."],
     []),

    ("1.7.39", "13 września 2026", "13 September 2026",
     "Odporność na szczyty ruchu",
     "Resilience to traffic peaks",
     ["13 września o 04:54 serwer został zatrzymany przez brak pamięci w szczycie wejść i wstał po 5 sekundach. Stan, historia i strefy są teraz przygotowywane zawczasu i podawane przez Cloudflare, a serwer sam odrzuca nadmiar wejść na stronę, zanim zabraknie pamięci.",
      "Po utracie połączenia aplikacja łączy się ponownie z losowym opóźnieniem, żeby tysiące telefonów nie wracały w tej samej sekundzie.",
      "Gdy serwer jest przeciążony, aplikacja pobiera stan co kilka sekund zamiast stałego połączenia i po 1–2 minutach próbuje wrócić.",
      "Powiadomienia i zbieranie danych działają niezależnie od ruchu na stronie."],
     ["On 13 September at 04:54 the server was stopped for lack of memory during a traffic peak and came back after 5 seconds. State, history and zones are now prepared in advance and served through Cloudflare, and the server itself turns away excess website traffic before memory runs out.",
      "After losing the connection, the app reconnects after a random delay so thousands of phones do not return in the same second.",
      "When the server is overloaded, the app fetches the state every few seconds instead of keeping a live connection, and tries to return after 1–2 minutes.",
      "Notifications and data collection work independently of website traffic."],
     []),

    ("1.7.38", "13 września 2026", "13 September 2026",
     "Czytelny kurs dronów, puls liczonych obiektów, obwody UA i Bałtyk",
     "Readable drone heading, pulsing counted objects, UA oblasts and the Baltics",
     ["BpSP ma czerwony dziób i czerwony grot przed nim. Obiekt bez znanego kursu nie jest już obracany dziobem na północ — każdy typ ma wtedy przerywaną obwódkę i znak zapytania. Dron rozpoznawczy jest biało-szary.",
      "Obiekty, które w tej chwili dodają punkty któremuś województwu, pulsują czerwonym pierścieniem.",
      "Obwód Ukrainy z alarmem powietrznym, który daje punkty, jest delikatnie podświetlony na różowo; dotknięcie pokazuje punkty dla województw.",
      "Litwa, Łotwa i Estonia: nowe kanały (LRT, 15min, LSM, ERR). Ogłoszony tam alarm to ślad w panelu za 0,12–0,3 pkt; okno Źródła pokazuje stan kanałów, ostatni alarm i strefy.",
      "Okno aktualizacji pokazuje pełną listę zmian. Karta drona podaje poprawne odchylenie kursu od kierunku na granicę."],
     ["The UAV icon has a red nose and a red arrowhead ahead of it. An object without a known heading is no longer turned nose-north — every type then gets a dashed ring and a question mark. Reconnaissance drones are white-grey.",
      "Objects that currently add points to a province pulse with a red ring.",
      "A Ukrainian oblast with an air-raid alert that adds points is gently highlighted in pink; a tap shows the points for each province.",
      "Lithuania, Latvia and Estonia: new feeds (LRT, 15min, LSM, ERR). An alert announced there is a trace in the panel worth 0.12–0.3; the Sources window shows feed status, the last alert and zones.",
      "The update window shows the full list of changes. The drone card shows the correct heading offset from the direction to the border."],
     []),

    ("1.7.37", "13 września 2026", "13 September 2026",
     "Media po przeczytaniu treści, bez marginesu alarmów, nowa instrukcja",
     "Media scored after reading the article, no alert margin, new guide",
     ["Serwer czyta cały artykuł, zanim przyzna punkty. Relacja z wcześniejszego zdarzenia albo artykuł, którego nie da się przeczytać, zostaje w panelu z linkiem, ale ma 0 pkt. Media dają 0,5 lub 1 pkt, limit 1 pkt.",
      "Poziom powiadomień zawsze odpowiada bieżącym punktom. Powtórka tego samego poziomu w ciągu 60 minut nie dzwoni, chyba że przyjdzie nowy Alert RCB.",
      "Alarmy dalszych obwodów Ukrainy ważą mniej — waga maleje płynnie z odległością.",
      "Strefy nałożone na siebie: dotyk otwiera najmniejszą, a pozostałe są w karcie jako przyciski. W historii czas sygnałów liczy się od wybranej chwili.",
      "Strona WWW: ikona Strażnika w karcie przeglądarki oraz wyłączanie powiadomień w ustawieniach, ze ścieżką do uprawnień przeglądarki.",
      "Śmigłowiec ma na mapie własną ikonę z tarczą wirnika zamiast sylwetki samolotu. Karta drona po angielsku podaje nazwy miejscowości i obwodów po angielsku.",
      "Instrukcja napisana od nowa dla bieżącej wersji, z nowymi zrzutami po polsku i angielsku."],
     ["The server reads the whole article before awarding points. A report on an earlier event, or an article that cannot be read, stays in the panel with its link but scores 0. Media add 0.5 or 1 point, capped at 1.",
      "The notification level always matches the current points. Returning to the same level within 60 minutes does not ring unless a new Alert RCB arrives.",
      "Alerts in more distant Ukrainian oblasts weigh less — the weight falls smoothly with distance.",
      "Overlapping zones: a tap opens the smallest one and lists the others as buttons on the card. In history, signal times count from the chosen moment.",
      "Website: the Strażnik icon in the browser tab, and turning notifications off in settings with the path to the browser permission.",
      "Helicopters have their own map icon with a rotor disc instead of an aeroplane silhouette. In English, drone cards give place and oblast names in English.",
      "The user guide was rewritten for the current version, with new screenshots in Polish and English."],
     []),

    ("1.7.36", "13 września 2026", "13 September 2026",
     "Przeniesienia bez podwójnego liczenia, odwołania RCB",
     "Spillover without double counting, RCB cancellations",
     ["To samo zdarzenie (artykuł, alarm obwodu UA) przypisane do dwóch sąsiednich województw nie wraca już do sąsiada jako przeniesienie. Lubelskie i podkarpackie podbijały się tak nawzajem.",
      "Przeniesienie może włączyć powiadomienie tylko przy co najmniej 1 pkt własnych i najwyżej o jeden stopień. Kolor z samych przeniesień jest na mapie przygaszony, a karta ma kreskowaną ramkę.",
      "Dźwięk w otwartej aplikacji słucha poziomu alarmu, nie koloru mapy — województwo zabarwione przez sąsiadów już nie włącza syreny.",
      "Poziom gaśnie 0,5 pkt pod progiem, a powrót na ten sam poziom w ciągu 30 min nie powtarza powiadomienia bez nowego alertu RCB albo obiektu NEPTUN.",
      "Odwołanie alertu RCB w RSO (także zmianą istniejącego wpisu) gasi alert i artykuły, które go potem opisują."],
     ["The same event (an article, a Ukrainian oblast alert) assigned to two neighbouring provinces no longer comes back to the neighbour as spillover. Lubelskie and podkarpackie were inflating each other this way.",
      "Spillover can only trigger a notification with at least 1 point of own signals, and by one step at most. Colour from spillover alone is dimmed on the map and the card gets a dashed border.",
      "The in-app sound follows the alert level, not the map colour — a province coloured by its neighbours no longer starts the siren.",
      "A level drops 0.5 points below its threshold, and returning to the same level within 30 minutes does not repeat the notification without a new RCB alert or NEPTUN object.",
      "An RCB cancellation in RSO (including an edit of the existing entry) clears the alert and the articles that describe it afterwards."],
     []),

    ("1.7.35", "12 września 2026", "12 September 2026",
     "Zamknięcie karty strefy nie zamyka listy sygnałów",
     "Closing a zone card no longer closes the signal list",
     ["Dotknięcie ✕ na karcie strefy zamykało listę sygnałów, a samej karty nie — karta leży poza panelem, więc liczyło się to jak kliknięcie obok niego.",
      "Zwinięcie panelu przesuwało przy tym kartę spod palca, więc właściwy klik już w ✕ nie trafiał. Stąd oba objawy naraz.",
      "Punktacja bez zmian."],
     ["Tapping the close cross on a zone card was closing the signal list instead of the card — the card sits outside the panel, so it counted as a tap beside it.",
      "Collapsing the panel also moved the card out from under the finger, so the actual click missed the cross. Hence both symptoms at once.",
      "Scoring is unchanged."],
     []),

    ("1.7.34", "12 września 2026", "12 September 2026",
     "Weto nie kasuje już prawdziwego meldunku",
     "A veto no longer deletes a genuine report",
     ["Weto „dni po” trafiało w środek słowa „wschodni powiat” i kasowało prawdziwy meldunek o poderwaniu lotnictwa. Hasła muszą się teraz zaczynać na granicy słowa.",
      "Weta podzielone na twarde i miękkie. „Ćwiczenia” czy „rocznica” kasują wszystko, bo przy teście syren one naprawdę zawyły. „Potrwają” czy „co wiemy” tylko obniżają relację z 1,5 do 1,0 pkt — zdarzenie jest prawdziwe, artykuł opisuje skutki.",
      "Miękkie weto działa wyłącznie przy frazie krytycznej; sam poradnik jest odrzucany jak dotychczas.",
      "Progi i limity bez zmian — same media nadal nigdy nie alarmują."],
     ["The veto “dni po” was matching inside the Polish word for “eastern district” and deleting a genuine report of fighters being scrambled. Keywords must now start at a word boundary.",
      "Vetoes are split into hard and soft. “Exercise” or “anniversary” cancel everything, because during a siren test the sirens really do sound. “Will last” or “what we know” only downgrade an operational report from 1.5 to 1.0 points — the event is real, the article covers its effects.",
      "A soft veto only applies when a critical phrase is present; a plain explainer is rejected exactly as before.",
      "Thresholds and caps are unchanged — media alone still never raise an alert."],
     []),

    ("1.7.33", "12 września 2026", "12 September 2026",
     "Karta strefy czytelna, karencja naprawdę działa",
     "The zone card is readable, and the grace period really works",
     ["Karencja zniknięcia strefy, opisana w notatkach 1.7.30, nie była zaimplementowana. Bez niej przełączenie planu PAŻP o 06:00 UTC zgłosiłoby dziś rano trzydzieści stref jako świeże aktywacje.",
      "Nazwa strefy chowała się pod przyciskami zwiń i zamknij — teraz zawija się w całości.",
      "Kolor nagłówka karty dawał na białym tle kontrast 1,83:1, czyli poniżej progu czytelności. Teraz 5,7:1, tą samą metodą, której od dawna używają karty obiektów.",
      "Instrukcja pokazuje warstwę stref na zrzutach z aplikacji, po polsku i po angielsku.",
      "Punktacja bez zmian."],
     ["The zone-disappearance grace period described in the 1.7.30 notes had never been implemented. Without it, this morning’s PAŻP daily-plan rollover would have reported thirty zones as fresh activations.",
      "The zone designator was hiding under the collapse and close buttons — it now wraps in full.",
      "The card heading gave a contrast of 1.83:1 on the white card, below any legibility threshold. It is now 5.7:1, using the same approach object cards have used for a long time.",
      "The guide shows the zone layer in screenshots from the app, in Polish and English.",
      "Scoring is unchanged."],
     []),

    ("1.7.32", "12 września 2026", "12 September 2026",
     "Okno aktualizacji mówi całym zdaniem, strefa nie obiecuje końca",
     "The update box speaks in full sentences, a zone promises no end",
     ["Okno aktualizacji pokazywało trzy urwane w połowie kawałki jednego zdania — notatki wydania są zawijane, a każda linia uchodziła za osobny punkt. Teraz są pełne punkty, do ośmiu, a pole się przewija.",
      "Karta strefy PAŻP pisała „Planowany koniec: 13.09” także dla strefy powołanej do grudnia. To był koniec dobowej rezerwacji, nie strefy — wiersz nazywa się teraz „Rezerwacja do” i mówi, że PAŻP publikuje plan dzień po dniu.",
      "Instrukcja tłumaczy w tabeli, które strefy punktują (D, R, NPZ, ADHOC), które nie (TSA, TRA, ATZ, skoki, szybowce, drony) i skąd wzięła się ta decyzja — z czterodniowego pomiaru bez przyznawania punktów.",
      "Punktacja bez zmian."],
     ["The update box was showing three fragments of a single sentence cut in half — release notes are wrapped, and every line counted as a separate bullet. Now it shows whole points, up to eight, and scrolls.",
      "A PAŻP zone card said “Planned end: 13.09” even for a zone declared until December. That was the end of the daily slot, not of the zone — the row now reads “Reserved until” and says PAŻP publishes its plan day by day.",
      "The guide now explains in a table which zones score (D, R, NPZ, ADHOC), which do not (TSA, TRA, ATZ, parachuting, gliding, drones) and where that decision came from — a four-day measurement with no points awarded.",
      "Scoring is unchanged."],
     []),

    ("1.7.31", "12 września 2026", "12 September 2026",
     "Artykuł trafia tam, gdzie się zdarzył",
     "An article lands where the event happened",
     ["Ogólnopolski komunikat wojskowy trafiał do wielkopolskiego, bo słowo „rozpoznania” zawiera „poznan”. Nazwa miejscowości musi się teraz zaczynać na granicy słowa.",
      "Artykuł mówiący, że zagrożenie się skończyło („odwołano alarm”, „zakończono operowanie lotnictwa”), nie punktuje i wygasza wcześniejsze doniesienia medialne w tym województwie. Oficjalnego alertu RCB nie rusza.",
      "Nazwa redakcji przestaje decydować o regionie — „Rumunia: dron spadł na blok” z Radia Szczecin trafiało do zachodniopomorskiego.",
      "Słownik nazw urósł z około 200 do 565 haseł, od 23 do 49 na województwo: nazwy potoczne krain („na Podlasiu”, „na Lubelszczyźnie”), większe miasta, przejścia graniczne i lotniska.",
      "Na tych samych kanałach: przed zmianą 8 przypisań z treści i 31 z domniemania, po zmianie 17 z treści i 0 z domniemania.",
      "Alarm bombowy w szkole i syreny na uroczystościach przestały punktować."],
     ["A nationwide military statement was landing in Greater Poland, because the Polish word for “reconnaissance” contains “poznan”. A place name must now start at a word boundary.",
      "An article saying the threat is over (“alert cancelled”, “air operations concluded”) scores nothing and fades earlier media reports in that province. It does not touch an official RCB alert.",
      "A newsroom’s name no longer decides the region — “Romania: a drone hit a block of flats” from Radio Szczecin was landing in West Pomerania.",
      "The place-name dictionary grew from about 200 to 565 entries, 23 to 49 per province: colloquial region names, larger towns, border crossings and airfields.",
      "On the same feeds: before the change 8 attributions came from the text and 31 from a guess; after it, 17 from the text and none from a guess.",
      "A bomb hoax at a school and sirens at commemorations no longer score."],
     []),

    ("1.7.30", "12 września 2026", "12 September 2026",
     "Widać strefy PAŻP, a północ przestaje być ślepa",
     "PAŻP zones are visible, and the north stops being blind",
     ["Nowy przycisk „strefy” na mapie pokazuje aktywne strefy przestrzeni powietrznej. Dotknięcie strefy tłumaczy po ludzku, co to jest, od kiedy Strażnik widzi ją włączoną, do kiedy ma obowiązywać i na jakiej wysokości.",
      "Strefy nie dodają punktów i nie wywołują alarmu — zamknięcie nieba jest decyzją wojska, a nie niezależnym pomiarem zagrożenia. Karta mówi to wprost.",
      "Strefa stojąca od dawna ma spokojny kontur, a bryłę dostaje tylko strefa włączona na naszych oczach — inaczej 31 stref zalewało mapę i wyglądało jak alarm w całym kraju.",
      "Północ (pomorskie, zachodniopomorskie, warmińsko-mazurskie, kujawsko-pomorskie) liczy się inaczej, bo NEPTUN pokrywa Ukrainę i daje tam zero. Strefa PAŻP waży tam 1 pkt zamiast 0,5, a incydenty bałtyckie i zamknięcia nieba na Litwie i w Estonii docierają wreszcie na wybrzeże.",
      "Nadal żaden pojedynczy sygnał nie podnosi poziomu sam: strefa 1 + ruch ADS-B 1 = 2 pkt, strefa 1 + incydent bałtycki 1 = 2 pkt. Strefy powtarzające się w ciągu 7 dni to rutyna i nie punktują wcale.",
      "Województwo w całości przykryte dużą strefą znów da się dotknąć; karta strefy prowadzi do województwa, a karta województwa wylicza swoje strefy."],
     ["A new “zones” button on the map shows active airspace zones. Tapping a zone explains in plain language what it is, since when Strażnik has seen it active, when it is due to end and at what altitude.",
      "Zones add no points and raise no alert — closing airspace is a decision by the military, not an independent measurement of the threat. The card says so explicitly.",
      "A long-standing zone gets a quiet outline; only a zone switched on while we were watching gets a 3D block — otherwise 31 zones flooded the map and looked like a nationwide alert.",
      "The north (Pomeranian, West Pomeranian, Warmian-Masurian, Kuyavian-Pomeranian) is scored differently, because NEPTUN covers Ukraine and gives it zero. A PAŻP zone weighs 1 pt there instead of 0.5, and Baltic incidents and Lithuanian or Estonian airspace closures finally reach the coast.",
      "No single signal still raises the level on its own: zone 1 + ADS-B activity 1 = 2 pts, zone 1 + Baltic incident 1 = 2 pts. Zones repeating within 7 days are routine and score nothing.",
      "A province fully covered by a large zone can be tapped again; the zone card leads to the province, and the province card lists its zones."],
     []),

    ("1.7.29", "12 września 2026", "12 September 2026",
     "Widać, co przyleciało i skąd bierze się wynik",
     "You can see what arrived and where the score comes from",
     ["Artykuł o kilku województwach trafia teraz do każdego z nich. Alert RCB „dla województw lubelskiego i podkarpackiego” wchodził wyłącznie do podkarpackiego, bo dopasowanie brało jedno, najdłuższe hasło.",
      "Sygnał z ostatnich pięciu minut idzie na górę listy z plakietką NOWY — wcześniej nowy obiekt wart 0,1 pkt lądował pod wpisami sprzed godziny. Potem wraca na miejsce według wkładu.",
      "Karta województwa rozpisuje sumę: „składa się z: 1.2 RCB + 1.0 ALARM UA + 0.9 MEDIA · 2 sygnałów bez wkładu”.",
      "Sygnał, którego obiekt zniknął z mapy, mówi „nieśledzony na mapie” zamiast podać odległość sprzed 40 minut.",
      "Punktacja bez zmian poza przypisaniem artykułu do właściwych województw."],
     ["An article naming several provinces now reaches each of them. An RCB alert “for the Lublin and Subcarpathian provinces” used to reach Subcarpathia only, because the matcher took a single, longest keyword.",
      "A signal from the last five minutes goes to the top of the list with a NEW badge — a new object worth 0.1 pts used to land below hour-old entries. It returns to its place by contribution afterwards.",
      "The province card spells the total out: “adds up to: 1.2 RCB + 1.0 UA ALERT + 0.9 MEDIA · 2 signals add nothing”.",
      "A signal whose object left the map says “no longer tracked” instead of quoting a distance from 40 minutes ago.",
      "Scoring is unchanged apart from attributing an article to the right provinces."],
     []),

    ("1.7.28", "12 września 2026", "12 September 2026",
     "Karta obiektu i sygnały mówią to samo",
     "The object card and the signals agree",
     ["Karta obiektu podawała same stopnie kursu; teraz ma werdykt — „0 pkt — kurs 71° od kierunku na Polskę” albo „kurs na Polskę” — czyli to samo, co lista sygnałów.",
      "Sygnał zamrażał odległość z chwili powstania: panel mówił „192,5 km”, gdy ten sam dron był na mapie 130 km od granicy. Dopóki obiekt jest śledzony, wiersz dopisuje „teraz 130,0 km”.",
      "Punktacja bez zmian. Przypomnienie reguły: pełna waga do ±50° od kierunku na granicę, liniowy spadek do zera przy ±70°, nieznany kurs ×0,5 i tylko do 150 km."],
     ["The object card only gave the heading in degrees; it now carries the verdict — “0 pts — heading 71° away from the direction to Poland” or “heading towards Poland” — the same wording as the signal list.",
      "A signal froze the distance from the moment it was raised: the panel said “192.5 km” while the same drone sat 130 km from the border on the map. While the object is still tracked, the row now appends “now 130.0 km”.",
      "Scoring is unchanged. The rule, for the record: full weight up to ±50° off the direction to the border, a linear fall to zero at ±70°, unknown heading ×0.5 and only within 150 km."],
     []),

    ("1.7.27", "12 września 2026", "12 September 2026",
     "Obiekt na mapie musi być widoczny na liście",
     "An object on the map has to appear in the list",
     ["Dron blisko granicy był widoczny na mapie, a w „Sygnałach” nie było go wcale — bo leciał w bok i nie wnosił punktów. Zero było policzone dobrze, ale wyglądało jak przeoczenie aplikacji.",
      "Sekcja „Sygnały” kończy się teraz listą „Na mapie, ale bez punktów” z podanym powodem — np. „kurs 86° od kierunku na Polskę” albo „kurs nieznany”.",
      "Punktacja bez zmian: obiekt lecący w bok 150 km od granicy nadal wnosi zero. Zmieniło się to, że widać, iż aplikacja go widzi.",
      "Okno „Źródła danych” ma wersję angielską — było ostatnim ekranem, w którym treść zostawała po polsku."],
     ["A drone near the border was visible on the map but missing from “Signals” entirely — because it was flying sideways and scored nothing. The zero was correct, but it looked like the app had missed it.",
      "The “Signals” section now ends with an “On the map, but scoring 0 pts” list that states the reason — e.g. “heading 86° away from the direction to Poland” or “heading unknown”.",
      "Scoring is unchanged: an object flying sideways 150 km from the border still contributes zero. What changed is that you can see the app noticed it.",
      "The “Data sources” dialog now has an English version — it was the last screen whose content stayed in Polish."],
     []),

    ("1.7.26", "12 września 2026", "12 September 2026",
     "Alarmy UA punktowane po odległości",
     "Ukrainian alerts scored by distance",
     ["Obwód rówieński i żytomierski ogłaszały się jako „graniczy z woj. lubelskie” i dostawały tyle samo punktów co obwód wołyński — a leżą 70 i 220 km od granicy.",
     "Teraz punkty maleją z odległością: wspólna granica ×1,0, do 120 km ×0,6, do 220 km ×0,35, do 320 km ×0,2. Dalej nie punktujemy.",
     "Doszedł obwód tarnopolski, iwanofrankowski, chmielnicki, czerniowiecki i winnicki. Ten sam obwód może ważyć różnie dla Lubelskiego i Podkarpacia.",
     "Tytuł podaje dystans zamiast nieprawdziwego „graniczy”. Limit klasy 1,0 pkt bez zmian — alarmy nadal nie zastąpią obiektu na mapie.",
     "Okna otwierają się od góry i uwzględniają pasek stanu; legenda ma zapas na dole i cień „jest więcej poniżej”."],
     ["Rivne and Zhytomyr oblasts announced themselves as “borders Lublin province” and scored the same as Volyn — while lying 70 and 220 km from the border.",
      "Points now fall with distance: a shared border ×1.0, up to 120 km ×0.6, up to 220 km ×0.35, up to 320 km ×0.2. Beyond that, nothing.",
      "Ternopil, Ivano-Frankivsk, Khmelnytskyi, Chernivtsi and Vinnytsia oblasts were added. The same oblast can weigh differently for Lublin and Subcarpathia.",
      "The title gives the distance instead of an untrue “borders”. The 1.0-point class cap is unchanged — alerts still cannot replace an object on the map.",
      "Dialogs open from the top and clear the status bar; the legend has bottom padding and a “more below” shadow."],
     []),

    ("1.7.25", "12 września 2026", "12 September 2026",
     "Okno aktualizacji po angielsku",
     "The update dialog speaks English",
     ["Cała ścieżka aktualizacji — komunikaty, opis „Co się zmienia”, przyciski i informacje z pobierania — była zapisana po polsku na sztywno i taka zostawała w angielskim interfejsie. Teraz mówi językiem interfejsu."],
     ["The whole update path — messages, the “What changes” list, the buttons and the download progress — was hard-coded in Polish and stayed that way in the English interface. It now follows the interface language."],
     []),

    ("1.7.24", "12 września 2026", "12 September 2026",
     "Poprawki po dniu na urządzeniu",
     "Fixes after a day on a real device",
     ["<b>„Sprawdź aktualizacje” znów odpowiada.</b> GitHub odrzucał zapytania serwera limitem 60/h na adres IP; teraz serwer trzyma ostatnie znane wydanie i podaje je zamiast błędu.",
      "„Zapisz na urządzeniu” przy pustej nazwie nie jest już martwym przyciskiem — komunikat przewija się na ekran, a kursor ląduje w brakującym polu. Udany zapis zamyka okno i wraca do Ustawień.",
      "Mapa startuje zawsze na tym samym kadrze: Polska i cała Ukraina. Przycisk „mój region” też pokazuje województwo w kontekście, a nie sam obrys.",
      "Pasek historii stoi w miejscu — wcześniej uciekał w górę spod palca, gdy w oknie pojawiał się sygnał.",
      "Nowa strona z historią zmian, dostępna z aplikacji: Ustawienia → Aplikacja → „Historia zmian ↗”."],
     ["<b>“Check for updates” answers again.</b> GitHub was rejecting the server’s requests with its 60/h per-IP limit; the server now keeps the last known release and serves it instead of an error.",
      "“Save on device” with an empty name is no longer a dead button — the message scrolls into view and the cursor lands in the missing field. A successful save closes the dialog and returns to Settings.",
      "The map always opens on the same frame: Poland and the whole of Ukraine. The “my region” button also shows the province in context rather than just its outline.",
      "The history bar stays put — it used to jump upwards from under your thumb when a signal appeared in the window.",
      "A new changelog page, reachable from the app: Settings → App → “Changelog ↗”."],
     []),

    ("1.7.23", "12 września 2026", "12 September 2026",
     "Nawigacja, która nie zasłania mapy",
     "Navigation that stops covering the map",
     ["Dolne zakładki <b>Mapa · Sygnały · Historia · Więcej</b> — z podpisami, w zasięgu kciuka. Górny pasek to już tylko legenda, 2D/3D, obce lotnictwo, powiadomienia i ustawienia.",
      "Karta obiektu otwiera się jako <b>miniatura w rogu</b> i nie zasłania mapy; strzałka rozwija ją do pełnej karty. Zaznaczony obiekt ma na mapie biały pierścień.",
      "Okna („O aplikacji”, ustawienia, „Moje miejsca”) kończą się nad paskiem zakładek i nie wchodzą na przyciski Androida.",
      "Tryb historii nazywa się wprost, a suwak jest wyraźnie większy. Ustawienia podzielone na cztery zakładki.",
      "Aktualizacje sprawdzane <b>przy każdym uruchomieniu</b>, a nie raz na dobę."],
     ["Bottom tabs <b>Map · Signals · History · More</b> — labelled and within thumb reach. The top bar now holds only the legend, 2D/3D, foreign aviation, notifications and settings.",
      "The object card opens as a <b>thumbnail in the corner</b> instead of covering the map; a chevron expands it to the full card. The selected object gets a white ring on the map.",
      "Dialogs (“About”, settings, “My places”) end above the tab bar and never reach the Android buttons.",
      "History mode names itself outright and the slider is considerably larger. Settings split into four tabs.",
      "Updates are checked <b>at every launch</b> instead of once a day."],
     [("card-mini-pl.jpg",
       "Miniatura karty obiektu w rogu mapy z białym pierścieniem wokół zaznaczonego samolotu",
       "Object card thumbnail in the corner of the map with a white ring around the selected aircraft",
       "Karta jako miniatura — mapa zostaje widoczna.",
       "The card as a thumbnail — the map stays visible."),
      ("01_start.jpg",
       "Ekran startowy 1.7.23 z dolnymi zakładkami Mapa, Sygnały, Historia, Więcej",
       "Start screen in 1.7.23 with the Map, Signals, History, More tab bar",
       "Nowy dolny pasek zakładek.",
       "The new bottom tab bar.")]),

    ("1.7.22", "12 września 2026", "12 September 2026",
     "Alarm ma powstać i dotrzeć",
     "The alert has to be raised — and arrive",
     ["Limit klasy źródła przydzielany <b>po wygaszeniu wiekiem</b>: w dłuższym ataku świeży obiekt przy granicy nie wnosi już zera.",
      "Poziom zagrożenia przeliczany co 45 sekund także bez nowego sygnału i trwały po restarcie serwera.",
      "Push ma termin ważności 15 minut i trzy próby wysyłki — telefon po powrocie z offline nie dostanie syreny o zdarzeniu sprzed godzin.",
      "Alarmy powietrzne z zachodnich obwodów Ukrainy są wreszcie odczytywane (przychodzą jako rejony).",
      "Samo przeniesienie punktów od sąsiada nie budzi już telefonu — powiadomienie wymaga własnego sygnału w województwie."],
     ["The source-class cap is assigned <b>after age decay</b>: during a longer attack a fresh object near the border no longer contributes zero.",
      "The threat level is recomputed every 45 seconds even without a new signal, and survives a server restart.",
      "Push messages carry a 15-minute expiry and three delivery attempts — a phone coming back online will not get a siren about an event from hours ago.",
      "Air alerts from western Ukrainian oblasts are finally read (they arrive as raions).",
      "Points spilled over from a neighbour no longer wake the phone — a notification needs the province’s own signal."],
     [("updates-pl.jpg",
       "Zakładka Aplikacja w ustawieniach: zainstalowana wersja i przycisk Sprawdź aktualizacje",
       "App tab in settings: installed version and the Check for updates button",
       "Okna informacyjne przewijają się do końca zamiast ucinać treść.",
       "Information dialogs scroll all the way instead of cutting content off.")]),

    ("1.7.21", "11 września 2026", "11 September 2026",
     "Ostrożniejsze źródła",
     "More careful sources",
     ["Zwykły artykuł RSS wnosi 1 pkt, jednoznaczna reakcja operacyjna 1,5 pkt, a cała klasa RSS ma limit 1,5 pkt — <b>same media nie zapalą już żółtego poziomu</b>.",
      "Materiały historyczne, rocznicowe, poradnikowe i prawne zostają widoczne, ale nie podnoszą poziomu zagrożenia.",
      "Punkt środka Łucka używany w meldunkach NEPTUN jest rozpoznawany jako pozycja rejonowa, mimo źródłowego <code>confirmed</code>."],
     ["A routine RSS article contributes 1 point, an unambiguous operational response 1.5, and the whole RSS class is capped at 1.5 — <b>media alone can no longer raise the yellow level</b>.",
      "Historical, anniversary, explainer and legal material stays visible but does not raise the threat level.",
      "The Lutsk centre point used in NEPTUN reports is recognised as an area position despite the source saying <code>confirmed</code>."],
     [("approx-position-pl.png",
       "Karta punktu środka Łucka rozpoznanego jako pozycja rejonowa, bez dystansu, trasy i ETA",
       "Lutsk locality-centre point recognised as an area position, without distance, route or ETA",
       "Pozycja rejonowa: bez pozornej trasy i czasu dolotu.",
       "An area position: no apparent route and no arrival time.")]),

    ("1.7.20", "10 września 2026", "10 September 2026",
     "Uczciwe pozycje przybliżone",
     "Honest approximate positions",
     ["Punkt oznaczony przez NEPTUN jako przybliżony jest opisany jako <b>rejon zgłoszenia</b>, a nie potwierdzona pozycja obiektu.",
      "Dla takiego punktu aplikacja nie przesuwa sztucznie znacznika, nie rysuje pozornej trasy i nie podaje czasu dolotu.",
      "Przybliżona pozycja nie może uruchomić progowego alarmu ETA."],
     ["A point flagged approximate by NEPTUN is described as a <b>report area</b>, not a confirmed object position.",
      "For such a point the app does not move the marker artificially, does not draw an apparent route and gives no arrival time.",
      "An approximate position cannot trigger a threshold ETA alert."],
     []),

    ("1.7.19", "9 września 2026", "9 September 2026",
     "Moje miejsca",
     "My places",
     ["Do 8 profili miejsc przechowywanych <b>lokalnie</b>; stare pojedyncze województwo przeniesione do profilu „Dom”.",
      "Każde miejsce może obserwować alerty swojego województwa; powtórzone województwa dają jedną subskrypcję.",
      "Opcjonalny GPS odczytywany wyłącznie na żądanie. Nazwy miejsc i współrzędne nie trafiają na serwer ani do powiadomień."],
     ["Up to 8 place profiles stored <b>locally</b>; the old single-province setting is migrated into a “Home” profile.",
      "Each place can watch its province’s alerts; repeated provinces create a single subscription.",
      "Optional GPS is read only on request. Place names and coordinates never reach the server or notifications."],
     [("places-pl.png",
       "Okno Moje miejsca: nazwa, zakres, województwo i przełącznik obserwacji alertów",
       "My places dialog: name, scope, province and the watch-alerts switch",
       "Miejsca zostają na urządzeniu.",
       "Places stay on the device.")]),

    ("1.7.18", "8 września 2026", "8 September 2026",
     "Zweryfikowane fotografie modeli",
     "Verified model photographs",
     ["Lokalna biblioteka 60 sprawdzonych zdjęć samolotów i śmigłowców zamiast losowej fotografii z sieci.",
      "Każde zdjęcie ma autora, źródło i licencję; nie przedstawia konkretnego śledzonego egzemplarza.",
      "Przy nieznanym albo sprzecznym wariancie karta mówi wprost, że brakuje zweryfikowanego zdjęcia."],
     ["A local library of 60 verified aircraft and helicopter photographs instead of a random picture from the web.",
      "Every photograph carries its author, source and licence; none depicts the specific tracked airframe.",
      "For an unknown or contradictory variant the card says outright that no verified photo is available."],
     [("aircraft-pl.png",
       "Rozwinięta karta samolotu z fotografią przykładowego egzemplarza, autorem, źródłem i licencją",
       "Expanded aircraft card with an example photograph, author, source and licence",
       "Zdjęcie przykładowego egzemplarza, nie śledzonej maszyny.",
       "A photo of an example airframe, not the tracked one.")]),

    ("1.7.17", "7 września 2026", "7 September 2026",
     "Spójny czas w historii",
     "Consistent time in history",
     ["Mapa, lista maszyn i szczegóły samolotu pokazują tę samą wybraną chwilę — wpis z przyszłości nie pojawi się na wcześniejszej migawce.",
      "Przygaszone ostatnie pozycje mają oznaczenie czasu i osobny licznik; nie oznaczają lądowania ani zestrzelenia.",
      "Dziennik serwera obejmuje też czas, gdy aplikacja była zamknięta."],
     ["The map, aircraft list and aircraft details all show the same selected moment — an entry from the future cannot appear in an earlier snapshot.",
      "Dimmed last positions carry a timestamp and their own counter; they do not mean a landing or a shoot-down.",
      "The server journal also covers the time while the app was closed."],
     [("history-map-pl.png",
       "Tryb historii: nagłówek trybu, suwak i licznik maszyn w migawce",
       "History mode: mode heading, slider and the snapshot aircraft count",
       "Jedna wybrana chwila w całym interfejsie.",
       "One selected moment across the whole interface.")]),

    ("1.7.16", "6 września 2026", "6 September 2026",
     "Dokończony angielski",
     "English finished off",
     ["Angielskie opisy samolotów wojskowych: przeznaczenie, kraj rejestracji, telemetria i śledzenie trasy.",
      "Przetłumaczony widok obcych maszyn oraz brakujące objaśnienia w legendzie.",
      "Nazwy państw, miast i regionów na mapie po angielsku; brakujące nazwy zachowują bezpieczną nazwę źródłową."],
     ["English descriptions for military aircraft: role, country of registration, telemetry and route following.",
      "The foreign-aircraft view and the missing legend explanations are translated.",
      "Country, city and region names on the map appear in English; missing names keep the safe source name."],
     []),

    ("1.7.15", "5 września 2026", "5 September 2026",
     "Angielski interfejs",
     "English interface",
     ["Angielski interfejs strony i aplikacji, bez zmiany źródeł, punktacji ani nazw technicznych.",
      "Wybór języka pokazuje tłumaczenie ustawień od razu; utrwala je dopiero „Zapisz”.",
      "Podniesiona głośność czerwonej syreny, żeby nie była cichsza od żółtego sygnału uwagi."],
     ["An English interface for the site and the app, with no change to sources, scoring or technical names.",
      "Picking a language previews the translated settings immediately; only “Save” makes it permanent.",
      "The red siren is louder so it is not quieter than the yellow attention signal."],
     []),

    ("1.7.14", "4 września 2026", "4 September 2026",
     "Okno aktualizacji mówi, czego dotyczy",
     "The update prompt says what it is about",
     ["Okno aktualizacji pokazuje listę „Co się zmienia” — do trzech najważniejszych punktów.",
      "Aktualizację niekrytyczną nadal można odłożyć do następnej sesji."],
     ["The update prompt shows a “What changes” list — up to three key points.",
      "A non-critical update can still be postponed to the next session."],
     []),

    ("1.7.13", "3 września 2026", "3 September 2026",
     "Pełniejsza historia obcych maszyn",
     "Fuller history of foreign aircraft",
     ["Historia zapisuje wejścia i wyjścia rosyjskich oraz białoruskich maszyn ADS-B razem z ostatnią pozycją.",
      "Krótkotrwała maszyna wykryta pomiędzy migawkami nie znika już z mapy historycznej.",
      "Pozycja odtworzona ze zdarzenia jest półprzezroczysta, żeby nie udawała zwykłej migawki."],
     ["History records entries and exits of Russian and Belarusian ADS-B aircraft together with their last position.",
      "A short-lived aircraft caught between snapshots no longer disappears from the historical map.",
      "A position reconstructed from an event is semi-transparent so it does not pose as a regular snapshot."],
     []),

    ("1.7.12", "2 września 2026", "2 September 2026",
     "Bezpieczniejsze połączenia",
     "Safer connections",
     ["Zewnętrzne serwery wymagają HTTPS; aplikacja ufa wyłącznie systemowym urzędom certyfikacji.",
      "Własny adres HTTP nie jest zapisywany — wcześniej zapisany błędny adres trzeba poprawić w ustawieniach.",
      "Ustawienia użytkownika zachowane podczas aktualizacji."],
     ["External servers must use HTTPS; the app trusts only system certificate authorities.",
      "A custom HTTP address is not saved — an incorrect address stored earlier has to be corrected in settings.",
      "User settings are preserved across updates."],
     []),
]

HEAD = """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="https://cukierrro.github.io/Straznik/{self_file}">
<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/zmiany.html">
<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/zmiany-en.html">
<link rel="icon" href="ikona.png">
<link rel="stylesheet" href="guide.css">
<meta property="og:type" content="website">
<meta property="og:url" content="https://cukierrro.github.io/Straznik/{self_file}">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="https://cukierrro.github.io/Straznik/share-panel-v2.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="{og_alt}">
<meta name="twitter:image" content="https://cukierrro.github.io/Straznik/share-panel-v2.jpg">
<meta property="og:locale" content="{locale}">
<meta property="og:locale:alternate" content="{locale_alt}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body id="top">
<a class="skip" href="#content">{skip}</a>
<nav aria-label="{nav_label}"><div class="nav-in">
  <a class="brand" href="{guide}#top">STRAŻNIK</a>
  <div class="nav-links"><a href="{guide}">{nav_guide}</a><a href="{self_file}" aria-current="page">{nav_changes}</a><a href="https://github.com/cukierrro/Straznik/releases">{nav_releases}</a></div>
  <div class="languages" aria-label="{lang_label}"><a href="zmiany.html" lang="pl"{pl_current}>PL</a><a href="zmiany-en.html" lang="en" hreflang="en"{en_current}>EN</a></div>
</div></nav>
<header class="hero"><div class="wrap">
  <div class="eyebrow">{eyebrow}</div>
  <h1>{h1}</h1>
  <p class="lead">{lead}</p>
  <div class="actions"><a class="button primary" href="https://github.com/cukierrro/Straznik/releases/latest/download/Straznik.apk">{download}</a><a class="button" href="{guide}">{guide_button}</a></div>
  <p class="fineprint">{fineprint}</p>
</div></header>
<main id="content" class="wrap">
"""

FOOT = """</main>
<footer><div class="wrap">
  <p><b>STRAŻNIK</b> — {footer_note}</p>
  <p><a href="https://github.com/cukierrro/Straznik">{src}</a> · <a href="{guide}">{guide_link}</a> · <a href="{other}" lang="{other_lang}">{other_label}</a></p>
  <p>{host}</p>
  <a class="back-top" href="#top">{back}</a>
</div></footer>
</body>
</html>
"""

TEXTS = {
    "pl": dict(
        lang="pl", locale="pl_PL", locale_alt="en_GB", self_file="zmiany.html",
        other="zmiany-en.html", other_lang="en", other_label="English changelog",
        guide="index.html", guide_button="Instrukcja użytkownika",
        guide_link="Instrukcja użytkownika",
        title="Strażnik — historia zmian",
        og_title="Strażnik — historia zmian",
        description="Co zmieniło się w każdym wydaniu Strażnika: opis zmian ze zrzutami, od 1.7.12 do najnowszej wersji.",
        og_alt="Strażnik — historia zmian aplikacji",
        skip="Przejdź do treści", nav_label="Nawigacja",
        nav_guide="Instrukcja", nav_changes="Historia zmian", nav_releases="Wydania na GitHubie",
        lang_label="Język strony",
        eyebrow="Historia zmian",
        h1="Co zmieniło się<br>w każdym wydaniu.",
        lead="Skrót zmian widocznych dla użytkownika, od najnowszego wydania. Pełne omówienia są w plikach <code>docs/RELEASE_*.md</code> w repozytorium.",
        download="↓ Pobierz najnowsze APK",
        fineprint="Wersję zainstalowaną na telefonie sprawdzisz w aplikacji: <kbd>⚙</kbd> → zakładka <kbd>Aplikacja</kbd> → „Wersja aplikacji”. Tam też jest przycisk <kbd>⬆ Sprawdź aktualizacje</kbd>.",
        footer_note="nieoficjalne źródło dodatkowe. Nie zastępuje syren, RCB ani RSO.",
        src="Kod źródłowy", back="↑ Wróć na górę",
        host='Serwer: <a href="https://mikr.us">hostowane na Mikrusie</a> — dziękujemy za wsparcie projektu.',
        details="Pełny opis wydania", release_word="Wydanie",
    ),
    "en": dict(
        lang="en", locale="en_GB", locale_alt="pl_PL", self_file="zmiany-en.html",
        other="zmiany.html", other_lang="pl", other_label="Polska wersja",
        guide="en.html", guide_button="User guide",
        guide_link="User guide",
        title="Strażnik — changelog",
        og_title="Strażnik — changelog",
        description="What changed in every Strażnik release: user-visible changes with screenshots, from 1.7.12 to the latest version.",
        og_alt="Strażnik — application changelog",
        skip="Skip to content", nav_label="Navigation",
        nav_guide="Guide", nav_changes="Changelog", nav_releases="Releases on GitHub",
        lang_label="Page language",
        eyebrow="Changelog",
        h1="What changed<br>in every release.",
        lead="A summary of user-visible changes, newest first. Full write-ups live in <code>docs/RELEASE_*.md</code> in the repository.",
        download="↓ Download the latest APK",
        fineprint="To see which version your phone has, open the app: <kbd>⚙</kbd> → the <kbd>App</kbd> tab → “App version”. The <kbd>⬆ Check for updates</kbd> button is right there too.",
        footer_note="an unofficial additional source. It does not replace sirens, RCB or RSO.",
        src="Source code", back="↑ Back to top",
        host='Server: <a href="https://mikr.us">hosted on Mikrus</a> — thank you for supporting the project.',
        details="Full release notes", release_word="Release",
    ),
}


def build(lang: str) -> str:
    t = TEXTS[lang]
    pl_current = ' aria-current="page"' if lang == "pl" else ""
    en_current = ' aria-current="page"' if lang == "en" else ""
    out = [HEAD.format(pl_current=pl_current, en_current=en_current, **t)]
    for version, date_pl, date_en, title_pl, title_en, pts_pl, pts_en, shots in RELEASES:
        date = date_pl if lang == "pl" else date_en
        title = title_pl if lang == "pl" else title_en
        points = pts_pl if lang == "pl" else pts_en
        out.append(f'<section id="v{version.replace(".", "-")}">\n')
        out.append(f'  <h2>{version} — {title}</h2>\n')
        out.append(f'  <p class="fineprint">{t["release_word"]} {version} · {date} · '
                   f'<a href="https://github.com/cukierrro/Straznik/releases/tag/v{version}">{t["details"]}</a></p>\n')
        out.append("  <ul>\n")
        for point in points:
            out.append(f"    <li>{point}</li>\n")
        out.append("  </ul>\n")
        if shots:
            out.append('  <div class="shots">\n')
            for file, alt_pl, alt_en, cap_pl, cap_en in shots:
                alt = alt_pl if lang == "pl" else alt_en
                cap = cap_pl if lang == "pl" else cap_en
                out.append(f'    <figure><a class="shot-link" href="screens/{file}">'
                           f'<img loading="lazy" src="screens/{file}" width="1080" height="2400" alt="{alt}"></a>'
                           f"<figcaption>{cap}</figcaption></figure>\n")
            out.append("  </div>\n")
        out.append("</section>\n")
    out.append(FOOT.format(**t))
    return "".join(out)


def main():
    for lang in ("pl", "en"):
        path = DOCS / TEXTS[lang]["self_file"]
        io.open(path, "w", encoding="utf-8", newline="").write(build(lang))
        print("zapisano", path.relative_to(ROOT))
    missing = [s[0] for r in RELEASES for s in r[7] if not (DOCS / "screens" / s[0]).is_file()]
    assert not missing, f"brak zrzutów: {missing}"
    print(f"OK: {len(RELEASES)} wydań w dwóch językach")


if __name__ == "__main__":
    main()

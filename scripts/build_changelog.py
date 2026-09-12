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
<meta property="og:image" content="https://cukierrro.github.io/Straznik/share-history-v1.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="{og_alt}">
<meta name="twitter:image" content="https://cukierrro.github.io/Straznik/share-history-v1.jpg">
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
  <p><a href="https://github.com/cukierrro/Straznik">{src}</a> · <a href="{guide}">{guide_link}</a> · <a href="{other}" lang="{other_lang}">{other_label}</a> · <a href="https://buycoffee.to/cukierrro">{coffee}</a></p>
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
        src="Kod źródłowy", coffee="Postaw kawę", back="↑ Wróć na górę",
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
        src="Source code", coffee="Buy a coffee", back="↑ Back to top",
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

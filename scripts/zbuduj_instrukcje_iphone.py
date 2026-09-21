# -*- coding: utf-8 -*-
"""Instrukcja dla iPhone'a (docs/iphone.html, docs/iphone-en.html) z instrukcji dla Androida.

Rozdziały wspólne (mapa, strefy, sygnały, historia, obce maszyny, punktacja, serwer)
przechodzą bez zmian — zmiana w docs/index.html albo docs/en.html trafia do obu
instrukcji po ponownym uruchomieniu. Rozdziały, w których iPhone działa inaczej
(instalacja, zgody, ekran, alarmy, strona WWW, problemy, prywatność), są tu napisane
osobno. Skrypt przerywa, jeśli w instrukcji dla Androida zniknie coś, na czym się opiera.

Uruchomienie:  py scripts/zbuduj_instrukcje_iphone.py
"""
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
APP_STORE = "https://apps.apple.com/pl/app/id6813563009"
WERSJA_IOS = "1.7.63"


def sekcja(html, ident, nowa):
    wzor = re.compile(r'<section id="%s">.*?</section>' % re.escape(ident), re.S)
    if len(wzor.findall(html)) != 1:
        sys.exit(f"Brak sekcji {ident} w instrukcji dla Androida")
    return wzor.sub(lambda _: nowa.strip(), html, count=1)


def zamien(html, stare, nowe, opis):
    if html.count(stare) != 1:
        sys.exit(f"Nie znalazłem ({opis}): {stare[:80]}")
    return html.replace(stare, nowe, 1)


def wytnij(html, wzor, nowe, opis):
    r = re.compile(wzor, re.S)
    if len(r.findall(html)) != 1:
        sys.exit(f"Nie znalazłem ({opis})")
    return r.sub(lambda _: nowe, html, count=1)


def fig(src, alt, podpis):
    return (f'<figure><a class="shot-link" href="{src}"><img loading="lazy" src="{src}" '
            f'width="1284" height="2778" alt="{alt}"></a><figcaption>{podpis}</figcaption></figure>')


# ─────────────────────────────── PL ───────────────────────────────
PL = dict(
    plik_zrodlo="index.html", plik="iphone.html", druga="iphone-en.html", android="index.html",
    head=[
        ("<title>Strażnik 1.7.64 — instrukcja użytkownika</title>",
         f"<title>Strażnik na iPhone'a {WERSJA_IOS} — instrukcja użytkownika</title>"),
        ('content="Instrukcja Strażnika 1.7.64: instalacja,',
         f'content="Instrukcja Strażnika na iPhone\'a ({WERSJA_IOS}, App Store): instalacja,'),
        ('<link rel="canonical" href="https://cukierrro.github.io/Straznik/">',
         '<link rel="canonical" href="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/">',
         '<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/en.html">',
         '<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/iphone-en.html">'),
        ('<link rel="alternate" hreflang="x-default" href="https://cukierrro.github.io/Straznik/">',
         '<link rel="alternate" hreflang="x-default" href="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<meta property="og:url" content="https://cukierrro.github.io/Straznik/">',
         '<meta property="og:url" content="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<meta property="og:title" content="Strażnik — instrukcja użytkownika">',
         '<meta property="og:title" content="Strażnik na iPhone\'a — instrukcja użytkownika">'),
    ],
    nav_jezyki=('<a href="index.html" lang="pl" aria-current="page">PL</a><a href="en.html" lang="en" hreflang="en">EN</a>',
                '<a href="iphone.html" lang="pl" aria-current="page">PL</a><a href="iphone-en.html" lang="en" hreflang="en">EN</a>'),
    nav_android=('<a href="iphone.html">iPhone</a>', '<a href="index.html">Android</a>'),
    hero=f"""
  <div><div class="eyebrow">Instrukcja dla iPhone'a · wersja {WERSJA_IOS} z App Store</div>
    <h1>Sytuacja na mapie.<br>Źródła za każdym sygnałem.</h1>
    <p class="lead">Strażnik łączy publiczne informacje o zagrożeniach z powietrza i pokazuje ich punktację dla polskich województw. Ta instrukcja opisuje <b>aplikację na iPhone'a</b>. Mapa, sygnały, historia i punktacja działają tak samo jak na Androidzie; inaczej działają alarmy, zgody i aktualizacje — te rozdziały są napisane osobno.</p>
    <div class="actions"><a class="button primary" href="{APP_STORE}">↓ Pobierz z App Store</a><a class="button" href="https://straznik.eu">Otwórz mapę</a><a class="button" href="index.html">Instrukcja dla Androida</a></div>
    <p class="fineprint">Zrzuty z iPhone'a wykonano 18 września 2026 na aplikacji z TestFlight, na żywych danych. W rozdziałach wspólnych (mapa, strefy, sygnały, obce maszyny) zostały zrzuty z Androida — ekran aplikacji wygląda na iPhonie tak samo, różni się tylko pasek systemu. Dotknij zdjęcia, aby otworzyć je w pełnym rozmiarze.</p>
    <p class="host-note"><img src="mikrus-logo.svg" alt="Mikrus" width="86" height="14">
      Serwer Strażnika zapewnia <a href="https://mikr.us">Mikrus</a> — dziękujemy za wsparcie projektu.</p>
  </div>
  <a class="shot-link" href="screens/ios/1-mapa.jpg"><img src="screens/ios/1-mapa.jpg" width="1284" height="2778" alt="Strażnik na iPhonie: mapa Polski i Ukrainy, sześć zielonych diod źródeł, ikony u góry, kafelki mój region, strefy i cała PL oraz dolne zakładki Mapa, Sygnały, Historia, Więcej"></a>
""",
    instalacja=f"""
<section id="instalacja">
  <h2>1. Instalacja i aktualizacje</h2>
  <ol>
    <li>Otwórz <a href="{APP_STORE}"><b>Strażnika w App Store</b></a> albo wyszukaj w App Store „Strażnik alarm powietrzny”. Aplikacja jest dostępna w App Store w Polsce, Niemczech i Wielkiej Brytanii, na Litwie, Łotwie, w Estonii i na Ukrainie.</li>
    <li>Naciśnij <kbd>Pobierz</kbd> i potwierdź tak jak każdą inną aplikację. Strażnik jest bezpłatny i nie ma zakupów w aplikacji.</li>
    <li>Przy pierwszym uruchomieniu zezwól na powiadomienia — bez tej zgody alarm nie dotrze przy zamkniętej aplikacji.</li>
    <li>Zapisz swoje województwo w <kbd>⚙</kbd> → <kbd>Moje miejsca</kbd> i zaznacz <kbd>Obserwuj alerty dla tego województwa</kbd>.</li>
    <li>Wykonaj cztery kroki z ramki „Sprawdź swojego iPhone'a” w rozdziale <a href="#alarmy">9</a> — od nich zależy, czy usłyszysz alarm w nocy.</li>
  </ol>
  <h3>Aktualizacje</h3>
  <p>Na iPhonie aktualizacje przychodzą <b>przez App Store</b>, jak w każdej aplikacji — Strażnik nie pobiera plików sam i nie ma przycisku „Sprawdź aktualizacje”. Jeśli masz wyłączone automatyczne aktualizacje, wejdź w App Store → swoje konto (ikona u góry) → lista aktualizacji. Wersja na iPhone'a może mieć inny numer niż na Androidzie: każde wydanie przechodzi przegląd Apple, więc czasem pojawia się później.</p>
  <div class="note"><b>Która wersja jest u Ciebie?</b> <kbd>⚙</kbd> → zakładka <kbd>Aplikacja</kbd> → „Zainstalowana wersja”. Tam też jest język interfejsu i odnośniki do tej instrukcji i historii zmian.</div>
  <h3>Wersja testowa (TestFlight)</h3>
  <p>Jeśli testowałeś Strażnika przez TestFlight, nie musisz niczego odinstalowywać: pobierz go z App Store, a wersja ze sklepu zastąpi testową. Ustawienia i Moje miejsca zostają. Po instalacji otwórz aplikację raz i sprawdź, czy województwo do alarmów jest dalej zaznaczone.</p>
</section>
""",
    pierwsze_zgody_stare=r'<div class="shots">\s*<figure><a class="shot-link" href="screens/1737/set-alarmy-pl\.jpg">.*?</div>\s*<h3>Zgody na Androidzie</h3>\s*<p>.*?</p>',
    pierwsze_zgody_nowe="""<h3>Zgody na iPhonie</h3>
  <p>Przy pierwszym uruchomieniu Strażnik prosi tylko o zgodę na <b>powiadomienia</b>. Na iPhonie nie ma zgody na alarm pełnoekranowy ani ustawień baterii — iOS nie daje ich zwykłym aplikacjom. W zakładce <kbd>⚙</kbd> → <kbd>Alarmy</kbd> sprawdzisz, czy powiadomienia są gotowe i dla jakiego regionu; przycisk <kbd>🔔 Ustawienia powiadomień</kbd> otwiera ustawienia Strażnika w iOS. Jeśli „Powiadomienia czasowo zależne” są wyłączone, zakładka pokaże ostrzeżenie — bez nich czerwony alarm może nie przebić trybu Skupienia.</p>
  <p>Jeśli chcesz tylko oglądać mapę, wyłącz suwak <kbd>Alarmy na tym telefonie</kbd> — telefon zostanie wypisany ze wszystkich województw i przestanie dostawać powiadomienia o alarmach. Zgody iOS zostają bez zmian — aplikacja nie może ich zmienić; wyłączysz je w Ustawieniach iPhone'a.</p>""",
    miejsca_fig=('<figure><a class="shot-link" href="screens/1737/places-pl.jpg">',
                 fig("screens/ios/5-miejsca.jpg", "Moje miejsca na iPhonie: miejsca Dom i Rodzice, zakres Województwo, województwo lubelskie, zaznaczone Obserwuj alerty dla tego województwa, opis działania i przycisk Zapisz na urządzeniu",
                     "Miejsce „Dom” w lubelskim z obserwacją alertów (iPhone).")),
    wiecej=("Więcej — „O aplikacji i punktacja”, „Instrukcja użytkownika”, „Wesprzyj autora”.",
            "Więcej — „O aplikacji i punktacja” i „Instrukcja użytkownika”. Na iPhonie nie ma odnośnika do wsparcia autora — zasady App Store nie pozwalają na nie w aplikacji."),
    wiecej_fig=r'\s*<figure><a class="shot-link" href="screens/1737/more-pl\.jpg">.*?</figure>',
    ekran_dopisek=("Panele i okna zamkniesz krzyżykiem, zakładką <kbd>Mapa</kbd> albo dotknięciem obok.</p>",
                   "Panele i okna zamkniesz krzyżykiem, zakładką <kbd>Mapa</kbd> albo dotknięciem obok. iPhone nie ma przycisku „wstecz” — cofasz się krzyżykiem albo zakładką <kbd>Mapa</kbd>.</p>"),
    alarmy=f"""
<section id="alarmy">
  <h2>9. Alarmy i powiadomienia</h2>
  <div class="tw"><table><thead><tr><th>Poziom</th><th>Co się dzieje na iPhonie</th></tr></thead><tbody>
    <tr><td>poniżej 2 pkt</td><td>Informacja na mapie i w panelu, bez powiadomienia.</td></tr>
    <tr><td>żółty, od 2 pkt — PODWYŻSZONA UWAGA</td><td>Zwykłe powiadomienie z krótkim sygnałem uwagi. Szanuje wyciszony dzwonek i tryb Skupienia.</td></tr>
    <tr><td>czerwony, od 4 pkt — WYSOKI PRIORYTET</td><td>Powiadomienie oznaczone <b>„PILNE”</b> (czasowo zależne): pokazuje się nad blokadą i gra syreną <b>jeden raz</b>, z wibracją. Przebija tryb Skupienia, jeśli na to pozwolisz (ramka niżej). <b>Nie zapala pełnego ekranu i nie powtarza syreny w pętli</b> — iOS nie pozwala na to zwykłym aplikacjom. Dotknięcie powiadomienia otwiera Strażnika na ekranie alarmu.</td></tr>
  </tbody></table></div>
  <div class="split">
    <div>
      <h3>Czym iPhone różni się od Androida</h3>
      <ul>
        <li><b>Brak pełnego ekranu.</b> Na Androidzie czerwony alarm zapala ekran i zasłania blokadę. Na iPhonie jest to wyraźne powiadomienie na blokadzie.</li>
        <li><b>Syrena gra raz.</b> Na Androidzie gra w pętli, aż potwierdzisz. Na iPhonie — jeden raz przy powiadomieniu. W pętli gra tylko wtedy, gdy aplikacja jest otwarta na ekranie; wyciszysz ją wtedy przyciskiem <kbd>POTWIERDZAM — wycisz syrenę</kbd>.</li>
        <li><b>Wyciszony dzwonek = cisza.</b> Gdy przełącznik z boku telefonu (albo przycisk czynności) jest na wyciszeniu, alarm jest bezgłośny — zostaje baner i wibracja (jeśli w Ustawienia → Dźwięki i haptyka → Haptyka nie wybrano „Nie odtwarzaj w trybie cichym”). Wyciszenie mogą przebić tylko tzw. alarmy krytyczne (Critical Alerts), na które Apple wydaje osobną zgodę. <b>Złożyliśmy wniosek do Apple</b>; do czasu decyzji zostaw dzwonek włączony, jeśli chcesz słyszeć syrenę.</li>
        <li><b>Brak suwaka głośności alarmu.</b> Syrena gra na głośności <b>dzwonka i alertów</b> iPhone'a, a aplikacja nie może jej podnieść (na Androidzie podnosimy głośność alarmu sami). Przy nisko ustawionym dzwonku syrena będzie cicha. Ustaw suwak w <b>Ustawienia → Dźwięki i haptyka → „Dzwonek i alerty”</b> i wyłącz tam „Zmieniaj przyciskami” — wtedy boczne przyciski ściszają tylko muzykę, a nie przypadkiem dzwonek. Własną głośność, niezależną od suwaka, dają dopiero alarmy krytyczne (Critical Alerts), o które wystąpiliśmy do Apple.</li>
        <li><b>Tryb Skupienia i Sen.</b> iOS wymaga osobnej zgody na „powiadomienia czasowo zależne” — dla aplikacji i dla każdego trybu Skupienia. Bez niej alarm poczeka do odblokowania telefonu.</li>
      </ul>
    </div>
    {fig("screens/ios/6-alarm.jpg", "Ekran alarmu w otwartej aplikacji na iPhonie: WYSOKI PRIORYTET, woj. lubelskie, lista sygnałów NEPTUN, wskazówka co zrobić i przycisk POTWIERDZAM — wycisz syrenę", "Ekran alarmu, gdy aplikacja jest otwarta.")}
  </div>
  <div class="warn"><b>Sprawdź swojego iPhone'a.</b> Od tych czterech rzeczy zależy, czy usłyszysz czerwony alarm w nocy:
    <ol>
      <li><b>Dzwonek włączony i głośny</b> — przełącznik z boku telefonu nie na wyciszeniu, a suwak „Dzwonek i alerty” (Ustawienia → Dźwięki i haptyka) wysoko; syrena gra na tej głośności. Jeśli czasem wyciszasz telefon, ustaw <b>Ustawienia → Dźwięki i haptyka → Haptyka → „Zawsze odtwarzaj”</b> (albo „Odtwarzaj w trybie cichym”) — wtedy wyciszony iPhone przynajmniej zawibruje.</li>
      <li><b>Powiadomienia dozwolone:</b> Ustawienia → Powiadomienia → Strażnik → „Zezwalaj na powiadomienia”.</li>
      <li><b>„Powiadomienia czasowo zależne” włączone</b> — w tym samym miejscu.</li>
      <li><b>Strażnik dopuszczony w trybie Sen:</b> Ustawienia → Skupienie → Sen → Aplikacje → dodaj Strażnika. Jeśli używasz też innych trybów Skupienia (np. Praca), dopuść go i tam.</li>
    </ol>
    Sprawdź to ponownie po aktualizacji iOS.</div>
  <h3>Kiedy telefon dzwoni, a kiedy nie</h3>
  <ul>
    <li>Powiadomienie przychodzi tylko dla <b>obserwowanych województw</b> z Moich miejsc.</li>
    <li>Województwo musi mieć co najmniej <b>1 pkt własnych sygnałów</b>. Kolor wyłącznie od sąsiadów nie dzwoni.</li>
    <li>Przeniesienie od sąsiadów może domknąć próg najwyżej o jeden stopień: własne punkty poniżej żółtego plus sąsiad dają co najwyżej żółty.</li>
    <li><b>Bez powtórek:</b> jeśli wynik spadnie i znów przekroczy ten sam próg w ciągu 60 minut od powiadomienia, zmienia się tylko mapa. Wyjątek: nowy Alert RCB/RSO. Wejście na wyższy poziom, z żółtego na czerwony, powiadamia zawsze.</li>
    <li>W otwartej aplikacji dźwięk gra według tych samych zasad co powiadomienie, nie według koloru mapy — dla <b>każdego obserwowanego województwa</b>.</li>
    <li>Powiadomienie, które dotarło z opóźnieniem ponad 10 minut (np. po powrocie zasięgu), pokazuje się cicho z dopiskiem „opóźnione o … min”.</li>
  </ul>
  <h3>Testy dźwięku</h3>
  <p>W <kbd>⚙</kbd> → <kbd>Dźwięk</kbd> są <kbd>▶ Test: uwaga</kbd>, <kbd>▶ Test: syrena</kbd> i <kbd>▶ Test: pełny alarm</kbd> — grają w oknie aplikacji. Niżej są <kbd>▶ Test: czerwony natywny (za 5 s)</kbd> i <kbd>▶ Test: żółty natywny (za 5 s)</kbd>: po 5 sekundach przychodzi prawdziwe powiadomienie iPhone'a z syreną albo sygnałem uwagi. Zablokuj ekran w tym czasie, żeby zobaczyć, jak alarm wygląda nad blokadą — i czy go słychać przy Twoich ustawieniach dzwonka i Skupienia. Jeśli powiadomienia są zablokowane, aplikacja powie o tym od razu. Żaden test nie sprawdza drogi powiadomienia z serwera.</p>
  <p><b>Jak to działa technicznie:</b> serwer wysyła powiadomienie przez Firebase i usługę powiadomień Apple (APNs) dla każdego obserwowanego województwa — także przy zamkniętej aplikacji i zablokowanym ekranie. Strażnik nie działa na iPhonie w tle i nie odpytuje źródeł sam; wszystko, co przychodzi przy zamkniętej aplikacji, to powiadomienia z serwera. <b>Tryb awaryjny:</b> gdy serwer nie odpowiada, otwarta aplikacja uruchamia wbudowany silnik i sama odpytuje źródła; co minutę sprawdza powrót serwera. Tryb awaryjny działa tylko przy otwartej aplikacji — przy zamkniętej, bez serwera, alarm nie przyjdzie.</p>
</section>
""",
    wstecz_historia=("zakładka <kbd>Mapa</kbd> albo systemowy przycisk „wstecz” przywraca bieżący widok.",
                     "albo zakładka <kbd>Mapa</kbd> przywraca bieżący widok."),
    zrzuty=[("screens/1737/history-pl.jpg", "screens/ios/2-historia.jpg"),
            ("screens/1737/history-panel-pl.jpg", "screens/ios/3-sygnaly.jpg")],
    www_pobierz=("Na górze są dodatkowo przyciski <b>Pobierz aplikację</b>, <b>Instrukcja</b> i <b>Postaw kawę</b>.",
                 "Na górze są dodatkowo przyciski pobierania aplikacji (na Androida i na iOS), <b>Instrukcja</b> i <b>Postaw kawę</b>."),
    www_iphone=("Na iPhonie powiadomienia działają tylko dla strony dodanej do ekranu początkowego.</p>",
                "Na iPhonie powiadomienia strony działają tylko po dodaniu jej do ekranu początkowego (Safari → Udostępnij → „Do ekranu początkowego”) — prościej zainstalować aplikację z App Store, która daje też powiadomienie „PILNE” z syreną.</p>"),
    problemy_stare=("<li><b>Brak powiadomień</b> — sprawdź Moje miejsca (obserwowane województwo), zgody, kanały powiadomień, baterię i czy aplikacja nie została wymuszenie zatrzymana. Test dźwięku nie sprawdza drogi push z serwera.</li>",
                    "<li><b>Brak powiadomień</b> — sprawdź Moje miejsca (obserwowane województwo), suwak <kbd>Alarmy na tym telefonie</kbd> i Ustawienia → Powiadomienia → Strażnik. Test dźwięku nie sprawdza drogi push z serwera.</li>\n"
                    "    <li><b>Alarm przyszedł bez dźwięku</b> — najczęściej dzwonek jest wyciszony przełącznikiem z boku telefonu albo działa tryb Skupienia bez dopuszczonego Strażnika. Zob. ramkę „Sprawdź swojego iPhone'a” w rozdziale <a href=\"#alarmy\">9</a>.</li>\n"
                    "    <li><b>Alarm przyszedł dopiero po odblokowaniu</b> — wyłączone „Powiadomienia czasowo zależne” albo Strażnik niedopuszczony w trybie Sen.</li>\n"
                    "    <li><b>Po wymianie telefonu</b> — zainstaluj Strażnika z App Store i zapisz miejsca na nowo; Moje miejsca nie przechodzą między telefonami.</li>\n"
                    "    <li><b>Diody zielone, przyciski działają, a mapa jest pusta</b> (także w Safari) — iPhone blokuje rysowanie map (WebGL). Najczęściej to <b>Tryb blokady</b>: Ustawienia → Prywatność i ochrona → Tryb blokady → Konfiguruj przeglądanie → wyklucz Strażnika, a w Safari także straznik.eu. Jeśli Tryb blokady jest wyłączony, sprawdź Ustawienia → Aplikacje → Safari → Zaawansowane → Flagi funkcji → WebGL. Alarmy i powiadomienia działają także bez mapy.</li>"),
    prywatnosc=("zapisują się tylko na urządzeniu; kopia zapasowa Androida dla aplikacji jest wyłączona.",
                "zapisują się tylko na urządzeniu."),
    stopka=('<a href="en.html" lang="en">English user guide</a>',
            '<a href="index.html">Instrukcja dla Androida</a> · <a href="iphone-en.html" lang="en">iPhone guide in English</a>'),
)

# ─────────────────────────────── EN ───────────────────────────────
EN = dict(
    plik_zrodlo="en.html", plik="iphone-en.html", druga="iphone.html", android="en.html",
    head=[
        ("<title>Strażnik 1.7.64 — user guide</title>",
         f"<title>Strażnik for iPhone {WERSJA_IOS} — user guide</title>"),
        ('content="Strażnik 1.7.64 user guide: installation,',
         f'content="Strażnik for iPhone user guide ({WERSJA_IOS}, App Store): installation,'),
        ('<link rel="canonical" href="https://cukierrro.github.io/Straznik/en.html">',
         '<link rel="canonical" href="https://cukierrro.github.io/Straznik/iphone-en.html">'),
        ('<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/">',
         '<link rel="alternate" hreflang="pl" href="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/en.html">',
         '<link rel="alternate" hreflang="en" href="https://cukierrro.github.io/Straznik/iphone-en.html">'),
        ('<link rel="alternate" hreflang="x-default" href="https://cukierrro.github.io/Straznik/">',
         '<link rel="alternate" hreflang="x-default" href="https://cukierrro.github.io/Straznik/iphone.html">'),
        ('<meta property="og:url" content="https://cukierrro.github.io/Straznik/en.html">',
         '<meta property="og:url" content="https://cukierrro.github.io/Straznik/iphone-en.html">'),
        ('<meta property="og:title" content="Strażnik — user guide">',
         '<meta property="og:title" content="Strażnik for iPhone — user guide">'),
    ],
    nav_jezyki=('<a href="index.html" lang="pl" hreflang="pl">PL</a><a href="en.html" lang="en" aria-current="page">EN</a>',
                '<a href="iphone.html" lang="pl" hreflang="pl">PL</a><a href="iphone-en.html" lang="en" aria-current="page">EN</a>'),
    nav_android=('<a href="iphone-en.html">iPhone</a>', '<a href="en.html">Android</a>'),
    hero=f"""
  <div><div class="eyebrow">iPhone guide · version {WERSJA_IOS} from the App Store</div>
    <h1>The situation on a map.<br>The sources behind each signal.</h1>
    <p class="lead">Strażnik combines public information about airborne threats and shows a score for each Polish province. This guide covers the <b>iPhone app</b>. The map, signals, history and scoring work exactly as on Android; alerts, permissions and updates work differently — those chapters are written separately.</p>
    <div class="actions"><a class="button primary" href="{APP_STORE}">↓ Get it on the App Store</a><a class="button" href="https://straznik.eu">Open the map</a><a class="button" href="en.html">Android guide</a></div>
    <p class="fineprint">The iPhone screenshots were taken on 18 September 2026 on the TestFlight build, using live data. The shared chapters (map, zones, signals, foreign aircraft) keep the Android screenshots — the app screen looks the same on iPhone, only the system bar differs. The iPhone screenshots show the Polish interface. Tap a screenshot to open it full size.</p>
    <p class="host-note"><img src="mikrus-logo.svg" alt="Mikrus" width="86" height="14">
      Strażnik’s server is provided by <a href="https://mikr.us">Mikrus</a> — thank you for supporting the project.</p>
  </div>
  <a class="shot-link" href="screens/ios/1-mapa.jpg"><img src="screens/ios/1-mapa.jpg" width="1284" height="2778" alt="Strażnik on iPhone: map of Poland and Ukraine, six green source indicators, icons at the top, the my region, zones and whole PL tiles, and the Map, Signals, History, More tabs"></a>
""",
    instalacja=f"""
<section id="instalacja">
  <h2>1. Installation and updates</h2>
  <ol>
    <li>Open <a href="{APP_STORE}"><b>Strażnik on the App Store</b></a> or search the App Store for “Strażnik alarm powietrzny”. The app is available on the App Store in Poland, Germany, the United Kingdom, Lithuania, Latvia, Estonia and Ukraine.</li>
    <li>Tap <kbd>Get</kbd> and confirm as with any other app. Strażnik is free and has no in-app purchases.</li>
    <li>On first launch, allow notifications — without them an alert cannot reach you while the app is closed.</li>
    <li>Save your province in <kbd>⚙</kbd> → <kbd>My places</kbd> and tick <kbd>Watch alerts for this province</kbd>.</li>
    <li>Go through the four steps in the “Check your iPhone” box in chapter <a href="#alarmy">9</a> — they decide whether you hear an alert at night.</li>
  </ol>
  <h3>Updates</h3>
  <p>On iPhone, updates come <b>through the App Store</b>, as for any app — Strażnik does not download files itself and has no “Check for updates” button. If automatic updates are off, open the App Store → your account (icon at the top) → the list of updates. The iPhone version number can differ from Android: every release goes through Apple's review, so it sometimes arrives later.</p>
  <div class="note"><b>Which version do you have?</b> <kbd>⚙</kbd> → <kbd>App</kbd> tab → “Installed version”. The interface language and links to this guide and the changelog are there too.</div>
  <h3>Test build (TestFlight)</h3>
  <p>If you tested Strażnik through TestFlight, you do not need to uninstall anything: get it from the App Store and the store version replaces the test build. Settings and My places stay. After installing, open the app once and check that your province is still selected for alerts.</p>
</section>
""",
    pierwsze_zgody_stare=r'<div class="shots">\s*<figure><a class="shot-link" href="screens/1737/set-alarmy-en\.jpg">.*?</div>\s*<h3>Android permissions</h3>\s*<p>.*?</p>',
    pierwsze_zgody_nowe="""<h3>iPhone permissions</h3>
  <p>On first launch Strażnik asks only for permission to send <b>notifications</b>. There is no full-screen alert permission and no battery setting on iPhone — iOS does not offer them to ordinary apps. In <kbd>⚙</kbd> → <kbd>Alerts</kbd> you can check whether notifications are ready and for which region; the <kbd>🔔 Notification settings</kbd> button opens Strażnik's settings in iOS. If “Time Sensitive Notifications” are off, the tab shows a warning — without them a red alert may not break through a Focus mode.</p>
  <p>If you only want to watch the map, turn off <kbd>Alerts on this phone</kbd> — the phone is unsubscribed from every province and stops receiving alert notifications. iOS permissions stay as they are — the app cannot change them; you switch them off in the iPhone's Settings.</p>""",
    miejsca_fig=('<figure><a class="shot-link" href="screens/1737/places-en.jpg">',
                 fig("screens/ios/5-miejsca.jpg", "My places on iPhone (Polish interface): places Home and Parents, scope Province, province Lublin, Watch alerts for this province ticked, how it works note and the Save on device button",
                     "A “Home” place in Lublin province with alerts watched (iPhone, Polish interface).")),
    wiecej=("More — “About and scoring”, “User guide”, “Support the author”.",
            "More — “About and scoring” and “User guide”. There is no link to support the author on iPhone — App Store rules do not allow it in the app."),
    wiecej_fig=r'\s*<figure><a class="shot-link" href="screens/1737/more-en\.jpg">.*?</figure>',
    ekran_dopisek=("Close panels and windows with the cross, the <kbd>Map</kbd> tab or a tap beside them.</p>",
                   "Close panels and windows with the cross, the <kbd>Map</kbd> tab or a tap beside them. iPhone has no back button — go back with the cross or the <kbd>Map</kbd> tab.</p>"),
    alarmy=f"""
<section id="alarmy">
  <h2>9. Alerts and notifications</h2>
  <div class="tw"><table><thead><tr><th>Level</th><th>What happens on iPhone</th></tr></thead><tbody>
    <tr><td>below 2 pts</td><td>Shown on the map and in the panel, no notification.</td></tr>
    <tr><td>yellow, from 2 pts — ELEVATED ATTENTION</td><td>An ordinary notification with a short attention tone. It respects the silenced ringer and Focus modes.</td></tr>
    <tr><td>red, from 4 pts — HIGH PRIORITY</td><td>A notification marked <b>“Urgent”</b> (Time Sensitive): it appears on the lock screen and plays the siren <b>once</b>, with vibration. It breaks through a Focus mode if you allow it (box below). <b>It does not take over the full screen and does not loop the siren</b> — iOS does not allow ordinary apps to do that. Tapping the notification opens Strażnik on the alert screen.</td></tr>
  </tbody></table></div>
  <div class="split">
    <div>
      <h3>How iPhone differs from Android</h3>
      <ul>
        <li><b>No full screen.</b> On Android a red alert wakes the screen and covers the lock screen. On iPhone it is a prominent notification on the lock screen.</li>
        <li><b>The siren plays once.</b> On Android it loops until you confirm. On iPhone it plays once with the notification. It loops only while the app is open on screen; silence it then with <kbd>CONFIRM — silence the siren</kbd>.</li>
        <li><b>Silenced ringer = silence.</b> When the switch on the side of the phone (or the Action button) is set to silent, the alert is silent — you get the banner and the vibration (unless Settings → Sounds &amp; Haptics → Haptics is set to “Don’t Play in Silent Mode”). Only so-called Critical Alerts can break through silent mode, and Apple grants them separately. <b>We have applied to Apple</b>; until they decide, keep the ringer on if you want to hear the siren.</li>
        <li><b>No alert-volume slider.</b> The siren plays at the iPhone's <b>ringer and alerts</b> volume, and the app cannot raise it (on Android we raise the alarm volume ourselves). With the ringer turned down, the siren is quiet. Set the slider in <b>Settings → Sounds &amp; Haptics → “Ringtone and Alerts”</b> and turn off “Change with Buttons” there — then the side buttons change only media volume, not the ringer by accident. Only Critical Alerts, which we have applied for, get their own volume independent of the slider.</li>
        <li><b>Focus and Sleep.</b> iOS needs a separate permission for “Time Sensitive Notifications” — for the app and for each Focus mode. Without it the alert waits until you unlock the phone.</li>
      </ul>
    </div>
    {fig("screens/ios/6-alarm.jpg", "Alert screen in the open app on iPhone (Polish interface): HIGH PRIORITY, Lublin province, list of NEPTUN signals, what to do and the CONFIRM — silence the siren button", "The alert screen while the app is open (Polish interface).")}
  </div>
  <div class="warn"><b>Check your iPhone.</b> These four things decide whether you hear a red alert at night:
    <ol>
      <li><b>Ringer on and loud</b> — the side switch is not on silent and the “Ringtone and Alerts” slider (Settings → Sounds &amp; Haptics) is high; the siren plays at that volume. If you sometimes silence the phone, set <b>Settings → Sounds &amp; Haptics → Haptics → “Always Play”</b> (or “Play in Silent Mode”) — then a silenced iPhone at least vibrates.</li>
      <li><b>Notifications allowed:</b> Settings → Notifications → Strażnik → “Allow Notifications”.</li>
      <li><b>“Time Sensitive Notifications” on</b> — in the same place.</li>
      <li><b>Strażnik allowed in Sleep:</b> Settings → Focus → Sleep → Apps → add Strażnik. If you use other Focus modes (e.g. Work), allow it there too.</li>
    </ol>
    Check again after an iOS update.</div>
  <h3>When the phone sounds and when it does not</h3>
  <ul>
    <li>A notification arrives only for <b>watched provinces</b> from My places.</li>
    <li>The province needs at least <b>1 pt of its own signals</b>. A colour coming only from neighbours does not sound.</li>
    <li>Spill-over from neighbours can close the threshold by at most one step: own points below yellow plus a neighbour give at most yellow.</li>
    <li><b>No repeats:</b> if the score drops and crosses the same threshold again within 60 minutes of a notification, only the map changes. Exception: a new RCB/RSO alert. Moving up a level, from yellow to red, always notifies.</li>
    <li>In the open app sound follows the same rules as the notification, not the map colour — for <b>every watched province</b>.</li>
    <li>A notification that arrives more than 10 minutes late (e.g. after coverage returns) is shown silently, marked “delayed by … min”.</li>
  </ul>
  <h3>Sound tests</h3>
  <p><kbd>⚙</kbd> → <kbd>Sound</kbd> has <kbd>▶ Test: attention</kbd>, <kbd>▶ Test: siren</kbd> and <kbd>▶ Test: full alert</kbd> — they play in the app window. Below are <kbd>▶ Test: native red (in 5 s)</kbd> and <kbd>▶ Test: native yellow (in 5 s)</kbd>: after 5 seconds a real iPhone notification arrives with the siren or the attention tone. Lock the screen in the meantime to see how the alert looks on the lock screen — and whether you hear it with your ringer and Focus settings. If notifications are blocked, the app tells you at once. No test checks the notification path from the server.</p>
  <p><b>How it works technically:</b> the server sends a notification through Firebase and Apple's push service (APNs) for every watched province — also with the app closed and the screen locked. Strażnik does not run in the background on iPhone and does not poll sources itself; everything that arrives with the app closed is a server notification. <b>Fallback mode:</b> when the server does not respond, the open app starts its built-in engine and polls the sources itself, checking every minute for the server to return. Fallback mode works only with the app open — with the app closed and no server, no alert arrives.</p>
</section>
""",
    wstecz_historia=("the <kbd>Map</kbd> tab or the system back button restores the current view.",
                     "or the <kbd>Map</kbd> tab restores the current view."),
    zrzuty=[],
    www_pobierz=("At the top there are also <b>Download app</b>, <b>User guide</b> and <b>Buy a coffee</b> buttons.",
                 "At the top there are also app download buttons (for Android and iOS), <b>User guide</b> and <b>Buy a coffee</b>."),
    www_iphone=("On an iPhone notifications work only for the site added to the Home Screen.</p>",
                "On iPhone the site's notifications work only after adding it to the Home Screen (Safari → Share → “Add to Home Screen”) — it is simpler to install the App Store app, which also gives the “Urgent” notification with the siren.</p>"),
    problemy_stare=("<li><b>No notifications</b> — check My places (watched province), permissions, notification channels, battery settings and whether the app was force-stopped. A sound test does not check the push path from the server.</li>",
                    "<li><b>No notifications</b> — check My places (watched province), the <kbd>Alerts on this phone</kbd> switch and Settings → Notifications → Strażnik. A sound test does not check the push path from the server.</li>\n"
                    "    <li><b>The alert arrived without sound</b> — most often the ringer is silenced with the switch on the side of the phone, or a Focus mode is on without Strażnik allowed. See the “Check your iPhone” box in chapter <a href=\"#alarmy\">9</a>.</li>\n"
                    "    <li><b>The alert arrived only after unlocking</b> — “Time Sensitive Notifications” are off, or Strażnik is not allowed in Sleep.</li>\n"
                    "    <li><b>After changing phones</b> — install Strażnik from the App Store and save your places again; My places do not move between phones.</li>\n"
                    "    <li><b>Green indicators, working buttons, but an empty map</b> (in Safari too) — the iPhone blocks map drawing (WebGL). Most often it is <b>Lockdown Mode</b>: Settings → Privacy &amp; Security → Lockdown Mode → Configure Web Browsing → exclude Strażnik, and straznik.eu in Safari. If Lockdown Mode is off, check Settings → Apps → Safari → Advanced → Feature Flags → WebGL. Alerts and notifications work without the map.</li>"),
    prywatnosc=("are stored only on the device; Android backup is disabled for the app.",
                "are stored only on the device."),
    stopka=('<a href="index.html" lang="pl">Instrukcja po polsku</a>',
            '<a href="en.html">Android guide</a> · <a href="iphone.html" lang="pl">Instrukcja dla iPhone\'a po polsku</a>'),
)


def zbuduj(c):
    html = (DOCS / c["plik_zrodlo"]).read_text(encoding="utf-8")
    # numer wersji Androida zmienia się z każdym wydaniem — wzorce nagłówka piszemy dla 1.7.64
    # i podstawiamy bieżący numer z tytułu instrukcji
    m = re.search(r"<title>Strażnik (\d+\.\d+\.\d+) —", html)
    if not m:
        sys.exit("Nie odczytałem wersji z tytułu instrukcji dla Androida")
    for stare, nowe in c["head"]:
        html = zamien(html, stare.replace("1.7.64", m.group(1)), nowe, "nagłówek")
    html = zamien(html, *c["nav_jezyki"], "przełącznik języka")
    html = zamien(html, *c["nav_android"], "odnośnik do drugiej instrukcji")
    html = wytnij(html, r'(?<=<header class="hero"><div class="wrap hero-grid">).*?(?=</div></header>)',
                  c["hero"], "hero")
    html = sekcja(html, "instalacja", c["instalacja"])
    html = wytnij(html, c["pierwsze_zgody_stare"], c["pierwsze_zgody_nowe"], "zgody Androida")
    stare_fig, nowa_fig = c["miejsca_fig"]
    # zrzut Moich miejsc z Androida zamieniamy na zrzut z iPhone'a
    html = wytnij(html, re.escape(stare_fig) + r'.*?</figure>', nowa_fig, "zrzut Moich miejsc")
    html = zamien(html, *c["wiecej"], "zakładka Więcej")
    html = wytnij(html, c["wiecej_fig"], "", "zrzut zakładki Więcej")
    html = zamien(html, *c["ekran_dopisek"], "zamykanie okien")
    html = zamien(html, *c["wstecz_historia"], "wstecz w Historii")
    for stary, nowy in c["zrzuty"]:
        wzor = r'<figure><a class="shot-link" href="%s"><img([^>]*?)src="%s" width="1080" height="2400"' % (re.escape(stary), re.escape(stary))
        html = re.sub(wzor, lambda m: '<figure><a class="shot-link" href="%s"><img%ssrc="%s" width="1284" height="2778"'
                      % (nowy, m.group(1), nowy), html, count=1)
        if nowy not in html:
            sys.exit("Nie podmieniłem zrzutu " + stary)
    html = sekcja(html, "alarmy", c["alarmy"])
    html = zamien(html, *c["www_pobierz"], "przyciski strony")
    html = zamien(html, *c["www_iphone"], "powiadomienia strony na iPhonie")
    html = zamien(html, *c["problemy_stare"], "brak powiadomień")
    html = zamien(html, *c["prywatnosc"], "kopia zapasowa")
    html = zamien(html, *c["stopka"], "stopka")
    # ślady instrukcji Androida, które nie mają sensu na iPhonie (celowe wzmianki
    # „na iPhonie nie ma zgody na alarm pełnoekranowy” są w tekstach wyżej i nie są tu łapane)
    for slowo in ("Straznik.apk", "Play Protect", "Wymuś zatrzymanie", "force-stop", "Ustawienia dźwięku Androida",
                  "Android sound settings", "Wyłącz oszczędzanie baterii", "Disable battery optimisation",
                  "Sprawdź zgodę na alarm pełnoekranowy", "Check full-screen alert permission"):
        if slowo in html:
            sys.exit(f"W instrukcji dla iPhone'a został ślad Androida: {slowo}")
    (DOCS / c["plik"]).write_text(html, encoding="utf-8", newline="\n")
    print("zapisano", c["plik"], len(html) // 1024, "KB")


if __name__ == "__main__":
    for c in (PL, EN):
        zbuduj(c)

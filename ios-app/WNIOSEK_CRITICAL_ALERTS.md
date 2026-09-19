# Wniosek do Apple o Critical Alerts

**Co to jest:** uprawnienie `com.apple.developer.usernotifications.critical-alerts`.
Powiadomienie oznaczone jako „critical” **gra dźwiękiem nawet przy wyciszonym
telefonie i w trybie „Nie przeszkadzać”**, z głośnością ustawioną przez aplikację.
To jedyna droga, żeby nocny alarm na iPhonie obudził człowieka, który wieczorem
przesunął przełącznik wyciszenia.

**Formularz:** developer.apple.com/contact/request/notifications-critical-alerts-entitlement
(wymaga zalogowania na konto Apple Developer).

**Kiedy wysłać:** **można teraz.** Od 19.09.2026 mamy działającą wersję w TestFlight
i pomiary z dwóch iPhone'ów — Apple zwykle pyta właśnie o to. Wniosek można złożyć
raz i w razie odmowy ponowić.

**Szanse:** niepewne. Apple przyznaje to uprawnienie głównie aplikacjom medycznym,
bezpieczeństwa publicznego i domowego, zwykle instytucjom. Strażnik jest aplikacją
nieoficjalną, prowadzoną przez osobę prywatną — odmowa jest realna. Plan awaryjny
(już działa, potwierdzony na urządzeniach): poziom **Time Sensitive**, który przebija
tryb Skupienia, ale nie przebija wyciszonego dzwonka.

**Uwaga:** dopóki Apple nie przyzna uprawnienia, **nie** włączamy `critical`
w `App.entitlements` ani w wiadomości z serwera — build z takim uprawnieniem bez
zgody nie przejdzie podpisu i przeglądu.

---

## Co mamy zmierzone (to jest siła tego wniosku)

19.09.2026, dwa iPhone'y (15 Pro Max / iOS 26.6.1 i 14 Pro Max / iOS 26.6.2),
build 1.7.61 z TestFlight, prawdziwa wiadomość z naszego serwera:

| Warunek | Wynik |
|---|---|
| Dzwonek włączony, ekran zablokowany, aplikacja zamknięta | alarm nad blokadą, oznaczony „PILNE”, **gra nasza syrena**, 3 sekundy od wysyłki |
| **Dzwonek wyciszony** | **brak dźwięku** — tylko wibracja i baner |
| Tryb Sen bez dopuszczenia aplikacji | alarm wstrzymany do odblokowania telefonu |
| Tryb Sen po dopuszczeniu aplikacji | alarm dochodzi |
| Dźwięk | odtwarzany **raz**, bez powtórzeń |

Wniosek z tej tabeli jest jednozdaniowy i to on jest treścią naszej prośby:
**wszystko działa poza jednym przypadkiem, który akurat jest tym nocnym.**

---

## Treść wniosku (do wklejenia w formularz, po angielsku)

> **App name:** Strażnik: alarm powietrzny (Apple ID 6813563009)
> **Bundle ID:** pl.straznik.app
> **Category:** Weather / Utilities (public safety information)
>
> **What the app does**
> Strażnik is a free, ad-free early-warning app for people in Poland. It merges
> several independent public sources into one threat level per Polish province:
> official alerts from the Government Centre for Security (RCB) and the national
> RSO system, airspace restrictions published by the Polish Air Navigation
> Services Agency, public ADS-B military traffic, OSINT reports of drones and
> missiles over Ukraine, and regional media reports. The app states clearly, on
> the first screen and in every alert, that it is an unofficial additional source
> and does not replace sirens, RCB or RSO.
>
> **What we measured on real iPhones (19 September 2026)**
> The app is in TestFlight and two testers went through the full alert path with
> a real message from our server, on iOS 26.6.1 and 26.6.2.
>
> With the ringer on, the red alert arrives over the Lock Screen three seconds
> after we send it, marked Time Sensitive, and plays our siren. Inside a Focus
> mode it arrives once the user has allowed the app for that Focus.
>
> **With the ringer switched to silent, the same alert is delivered with no sound
> at all** — a banner and a vibration. That is the one gap we cannot close. For an
> air-raid warning at three in the morning, on a phone muted at bedtime, it is the
> difference between waking up and sleeping through it.
>
> **Why this matters here**
> Poland has repeatedly been affected by airborne incidents: drones and missile
> debris crossing the border, temporary airspace closures, RCB alerts sent to
> whole provinces, and in 2026 sirens sounded in parts of the country. These
> events happen mostly at night. Our users — including people living near the
> eastern border and parents of small children — ask for one thing above all: to
> be woken up when a threat is minutes away. On Android the app can do this. On
> iPhone, for a muted phone, the alert effectively does not exist.
>
> **When a critical alert would be used**
> Only for the highest level (red), which requires a fused score of at least 4.0
> points from **several independent sources at once** — a single media headline or
> a single unconfirmed report can never reach it. The server enforces a minimum
> interval of 10 minutes between notifications of the same level for the same
> province, and alerts are sent per province, only to users who explicitly
> selected that province. Historically this level is reached a few times a year,
> not daily.
>
> The lower level (yellow) would keep using a time-sensitive notification, never
> critical. We would rather under-use this entitlement than spend it.
>
> **User control**
> - Notifications are opt-in; the user chooses which provinces to watch.
> - A single switch ("Alerts on this phone") unsubscribes the device completely,
>   and the app shows the subscription state confirmed by the server, so the user
>   can see it is off.
> - Critical alerts would additionally require the separate iOS permission, which
>   we would request with a plain explanation of what it does and when it is used.
> - No marketing, no promotional content, ever: the only notifications the app
>   sends are threat-level changes for the selected provinces.
>
> **Transparency**
> The app is free, has no accounts, no advertising, no analytics and no in-app
> purchases. The source code is published (all rights reserved, code visible) at
> github.com/cukierrro/Straznik. The user guide, including the scoring rules and
> the full list of sources, is public at cukierrro.github.io/Straznik.
>
> We are aware that Strażnik is not an official government service and we never
> present it as one. We are asking for this entitlement because the alert it
> delivers is time-critical for personal safety, and on iPhone there is no other
> way to deliver it to a sleeping user.

---

## Gdyby Apple odpowiedziało pytaniami

| Pytanie Apple | Odpowiedź |
|---|---|
| Ilu użytkowników i jak często wysyłacie alarmy? | Android rozprowadzany poza sklepem, ok. 200–400 urządzeń. Czerwony poziom: pojedyncze przypadki w roku; żółty: kilka–kilkanaście razy w miesiącu, ale on **nie** byłby krytyczny. |
| Czy jesteście służbą albo współpracujecie z rządem? | Nie. Aplikacja jest nieoficjalna i tak się przedstawia. Korzysta z publicznych komunikatów RCB/RSO i publicznych danych o przestrzeni powietrznej. |
| Jak zapobiegacie fałszywym alarmom? | Wymagana suma punktów z kilku niezależnych źródeł, limity punktów na klasę źródła, wygaszanie starych sygnałów, odstęp 10 minut, dziennik alarmów. Zasady opisane publicznie w instrukcji. |
| Czy próbowaliście Time Sensitive? | Tak, działa i zostaje jako poziom domyślny — mamy pomiary z dwóch iPhone'ów. Nie rozwiązuje jedynego przypadku, o który prosimy: wyciszonego telefonu w nocy. |
| Konto testowe? | Nie ma kont. Wystarczy wybrać województwo w Ustawieniach; w aplikacji jest przycisk „Test: czerwony natywny”, który pokazuje prawdziwe powiadomienie. Możemy dodać recenzenta do TestFlight. |

---

## Jak wysłać (krok po kroku)

1. Zaloguj się na developer.apple.com i otwórz formularz:
   `https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/`
2. Wypełnij: App Name **Strażnik: alarm powietrzny**, Bundle ID **pl.straznik.app**,
   Apple ID aplikacji **6813563009**, platforma iOS.
3. W polu opisu wklej tekst z sekcji „Treść wniosku” powyżej (po angielsku).
4. Jeśli formularz pyta o wersję do sprawdzenia — podaj, że aplikacja jest
   w TestFlight i możesz dodać recenzenta jako testera.
5. Odpowiedź przychodzi mailem, bywa że po kilku tygodniach. Do tego czasu
   **nie włączamy** `critical` ani w `App.entitlements`, ani na serwerze.

Jeśli Apple odmówi: zostaje Time Sensitive (działa, potwierdzone na urządzeniach)
plus jasna informacja w instrukcji, że przy wyciszonym telefonie alarm będzie tylko
wibracją i banerem. Ta informacja jest już w tekstach zatwierdzonych do wprowadzenia
(B6) — użytkownik ma wiedzieć, na czym stoi, niezależnie od decyzji Apple.

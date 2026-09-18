# Wniosek do Apple o Critical Alerts

**Co to jest:** uprawnienie `com.apple.developer.usernotifications.critical-alerts`.
Powiadomienie oznaczone jako „critical” **gra dźwiękiem nawet przy wyciszonym
telefonie i w trybie „Nie przeszkadzać”**, z głośnością ustawioną przez aplikację.
To jedyna droga, żeby czerwony alarm na iPhonie zachował się podobnie jak na
Androidzie.

**Formularz:** developer.apple.com/contact/request/notifications-critical-alerts-entitlement
(wymaga zalogowania na konto Apple Developer).

**Kiedy wysłać:** **teraz** — build 1.7.57 (2609181725) jest w TestFlight od 18.09.2026, a Apple zwykle pyta o działającą wersję. Wcześniej planowaliśmy wysłać po pierwszym buildzie — Apple często
pyta o działającą wersję i konto testera. Wniosek można złożyć raz i ponowić.

**Szanse:** niepewne. Apple przyznaje to uprawnienie głównie aplikacjom
medycznym, bezpieczeństwa publicznego i domowego, zwykle instytucjom. Strażnik
jest aplikacją nieoficjalną, prowadzoną przez osobę prywatną — odmowa jest
realna. Plan awaryjny (już w kodzie): poziom **Time Sensitive**, który przebija
tryb Skupienia, ale nie wyciszony dzwonek.

**Uwaga:** dopóki Apple nie przyzna uprawnienia, **nie** włączamy `critical`
w `App.entitlements` ani w wiadomości z serwera — build z takim uprawnieniem
bez zgody nie przejdzie podpisu i przeglądu.

---

## Treść wniosku (do wklejenia w formularz, po angielsku)

> **App name:** Strażnik
> **Bundle ID:** pl.straznik.app
> **Category:** Weather / Utilities (public safety information)
>
> **What the app does**
> Strażnik is a free, ad-free early-warning app for people in Poland. It merges
> several independent sources into one threat level per Polish province
> (voivodeship): official alerts from the Polish Government Centre for Security
> (RCB) and the national RSO system, airspace restrictions published by the
> Polish Air Navigation Services Agency (PAŻP), public ADS-B military traffic,
> OSINT reports of drones and missiles over Ukraine, and regional media reports.
> The app states clearly, on the first screen and in every alert, that it is an
> unofficial additional source and does not replace sirens, RCB or RSO.
>
> **What we measured on a real iPhone (18 September 2026)**
> The app is already on TestFlight and a tester went through the notification
> paths. With the ringer on, the red alert arrives on the Lock Screen with our
> siren, including inside Focus modes once the app is allowed there. With the
> ringer switched to silent, the same alert is delivered **without any sound** —
> only a banner and a vibration. For a night-time air-raid warning that is the
> difference between waking up and sleeping through it, and it is the one gap we
> cannot close with Time Sensitive notifications.
>
> **Why we need Critical Alerts**
> Poland has repeatedly been affected by airborne incidents: drones and missile
> debris crossing the border, temporary airspace closures, and RCB alerts sent to
> whole provinces; in 2026 sirens were sounded in parts of the country.
> These events happen mostly **at night**, when phones are muted or in Do Not
> Disturb. Our users — including people living near the eastern border and
> parents of small children — ask for one thing above all: to be woken up when
> a threat is minutes away. On Android the app can do this. On iPhone, a muted
> phone means the alert is silent, which for this use case means the alert
> effectively does not exist.
>
> **When a critical alert would be used**
> Only for the highest level ("WYSOKI PRIORYTET", red), which requires a fused
> score of at least 4.0 points from **several independent sources at once** —
> a single media headline or a single unconfirmed report can never trigger it.
> The server enforces a minimum interval of 10 minutes between notifications of
> the same level for the same province. Alerts are sent per province and only to
> users who explicitly selected that province. Historically this level is
> reached a few times a year, not daily.
>
> Lower levels ("PODWYŻSZONA UWAGA", yellow) would keep using a normal or
> time-sensitive notification, never critical.
>
> **User control**
> - Notifications are opt-in; the user chooses which provinces to watch.
> - A single switch ("Alerts on this phone") unsubscribes the device completely.
> - Critical alerts would additionally require the user to grant the separate
>   iOS permission for critical alerts, which we would request with a plain
>   explanation of what it does.
> - No marketing, no promotional content, ever: the only notifications the app
>   sends are threat-level changes for the selected provinces.
>
> **Transparency**
> The app is free, has no accounts, no advertising, no analytics and no in-app
> purchases. The source code is published (all rights reserved, code visible)
> at github.com/cukierrro/Straznik. The user guide, including the scoring rules
> and the list of sources, is public at cukierrro.github.io/Straznik.
>
> We are aware that Strażnik is not an official government service and we do not
> present it as one. We are asking for this entitlement because the alert it
> delivers is time-critical for personal safety, and on iPhone there is no other
> way to deliver it to a sleeping user.

---

## Gdyby Apple odpowiedziało pytaniami

Najczęstsze pytania i nasze odpowiedzi (do użycia w korespondencji):

| Pytanie Apple | Odpowiedź |
|---|---|
| Ilu użytkowników i jak często wysyłacie alarmy? | Apka rozprowadzana dotąd poza sklepem (Android, ok. 200–400 urządzeń). Czerwony poziom: pojedyncze przypadki w roku; żółty: kilka–kilkanaście razy w miesiącu, ale on **nie** byłby krytyczny. |
| Czy jesteście służbą albo współpracujecie z rządem? | Nie. Aplikacja jest nieoficjalna i tak się przedstawia. Korzysta z publicznych komunikatów RCB/RSO i publicznych danych o przestrzeni powietrznej. |
| Jak zapobiegacie fałszywym alarmom? | Wymagana suma punktów z kilku niezależnych źródeł, limity punktów na klasę źródła, wygaszanie starych sygnałów, odstęp 10 minut, dziennik alarmów. Zasady opisane publicznie w instrukcji. |
| Konto testowe? | Nie ma kont. Wystarczy wybrać województwo w Ustawieniach; w aplikacji jest przycisk „Test: czerwony natywny”, który pokazuje prawdziwe powiadomienie. |

---

## Jak wysłać (krok po kroku)

1. Zaloguj się na developer.apple.com i otwórz formularz:
   `https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/`
2. Wypełnij: App Name **Strażnik: alarm powietrzny**, Bundle ID **pl.straznik.app**,
   Apple ID aplikacji **6813563009**, platforma iOS.
3. W polu opisu wklej tekst z sekcji „Treść wniosku” powyżej (po angielsku).
4. Jeśli formularz pyta o wersję do sprawdzenia — podaj, że aplikacja jest
   w TestFlight i możesz dodać recenzenta jako testera.
5. Odpowiedź przychodzi mailem; bywa, że po kilku tygodniach. Do tego czasu
   **nie włączamy** `critical` ani w `App.entitlements`, ani na serwerze —
   build z tym uprawnieniem bez zgody nie przejdzie podpisu.

Jeśli Apple odmówi: zostaje Time Sensitive (działa, potwierdzone na urządzeniu)
plus jasna informacja w instrukcji, że przy wyciszonym telefonie alarm będzie
tylko wibracją i banerem.

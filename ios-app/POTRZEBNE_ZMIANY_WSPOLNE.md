# Zmiany we wspólnym kodzie potrzebne dla iPhone'a

Sesja iOS **niczego z tego nie wprowadziła**. Wprowadza sesja główna, za zgodą
użytkownika. Stan kodu: `main` @ `69f44e1` (1.7.57, 17.09.2026).

Kolejność i pilność:

| # | Zmiana | Pilne? | Bez niej |
|---|---|---|---|
| A | Blok `apns` w wiadomości FCM (`backend/app/notify.py`) | **przed testem pushy na iPhonie** | iPhone przy zamkniętej aplikacji **nie dostaje żadnego alarmu** |
| B1–B2 | Wykrycie iOS + ukrycie „Postaw kawę” | przed App Store (TestFlight może być bez) | odrzucenie w przeglądzie Apple (3.1.1) |
| B3–B7 | Teksty i przyciski Androidowe w ustawieniach | przed zewnętrznymi testerami | mylące opisy („głośność Androida”, „pełny ekran”) |
| C | Uwaga do buildu Androida (`pl-outline.js`) | do sprawdzenia | możliwy nieaktualny plik w APK |

---

## A. Blok `apns` w `backend/app/notify.py`

### Dlaczego
Android dostaje wiadomość **data-only** i sam buduje alarm (`StraznikFcmService`).
Na iOS wiadomość data-only przy zamkniętej aplikacji **nie wyświetla niczego**
i nie budzi aplikacji. Powiadomienie musi zbudować system z bloku `apns`.
FCM wysyła blok `android` tylko na Androida, a `apns` tylko na iOS, więc
**Android zostaje bez zmian** (dalej data-only, bez `notification`).

### Zmiana (propozycja kodu)

```python
# notify.py — obok FCM_TTL_S
# iOS: ładunek APNs ma limit 4096 bajtów, a FCM wkłada do niego także całe `data`.
# Treść powiadomienia iPhone'a skracamy, żeby całość zmieściła się z zapasem.
APNS_PAYLOAD_BUDGET = 3700


def _apns_config(topic: str, data: dict):
    """Powiadomienie dla iPhone'a. Na iOS wiadomość data-only nie budzi zamkniętej
    aplikacji, więc tytuł, treść i dźwięk musi podać serwer. Android ten blok
    ignoruje. Tekst jak Alarms.postAlarm na Androidzie. None = za duże `data`
    (wtedy wysyłamy bez bloku iOS, żeby nie stracić alarmu na Androidzie)."""
    from firebase_admin import messaging

    def size(value) -> int:
        return len(json.dumps(value, ensure_ascii=False).encode())

    level = data.get("level", "")
    high = level == "high"
    title = (("TEST — " if topic.startswith(config.TEST_TOPIC_PREFIX) else "")
             + f"{LEVEL_LABELS.get(level, level)}: woj. {data.get('voiv', '')} ({data.get('score', '')} pkt)")
    tail = [("Co zrobić: przejdź do schronu lub pomieszczenia bez okien i śledź komunikaty RCB."
             if high else "Co zrobić: zachowaj czujność i sprawdź komunikaty RCB."),
            "NIEOFICJALNE źródło — kieruj się syrenami, RCB i RSO."]
    # ~400 bajtów na klucze aps, dźwięk, thread-id i identyfikatory dokładane przez FCM
    used = size(data) + size(title) + size("\n".join(tail)) + 400
    if used > APNS_PAYLOAD_BUDGET:
        log.warning("FCM %s: data %d B — pomijam blok iOS, żeby nie stracić wysyłki", topic, size(data))
        return None
    lines = []
    reasons = [x.strip() for x in (data.get("reasons") or "").split("\n") if x.strip()][:4]
    for line in ([data["headline"]] if data.get("headline") else []) + reasons:
        if used + size(line) > APNS_PAYLOAD_BUDGET:
            break
        lines.append(line)
        used += size(line)
    return messaging.APNSConfig(
        headers={
            "apns-priority": "10",                         # natychmiast (wymaga alertu)
            "apns-push-type": "alert",
            "apns-expiration": str(int(time.time()) + APNS_TTL_S),  # 600 s, krócej niż Android
            "apns-collapse-id": topic,                     # jak collapse_key Androida
        },
        payload=messaging.APNSPayload(aps=messaging.Aps(
            alert=messaging.ApsAlert(title=title, body="\n".join(lines + tail)),
            # pliki dołączone do aplikacji iOS (kopie res/raw z Androida)
            sound="alarm_syrena.wav" if high else "alert_uwaga.wav",
            thread_id=topic,
            # firebase-admin 7.5 nie ma pola interruption_level — idzie przez custom_data
            custom_data={
                "interruption-level": "time-sensitive" if high else "active",
                "relevance-score": 1.0 if high else 0.6,
            },
        )),
    )


def _send_fcm_sync(topic: str, data: dict) -> str:
    from datetime import timedelta
    from firebase_admin import messaging
    msg = messaging.Message(
        topic=topic,
        data=data,
        android=messaging.AndroidConfig(          # bez zmian
            priority="high",
            ttl=timedelta(seconds=FCM_TTL_S),
            collapse_key=topic,
            direct_boot_ok=True,
        ),
        apns=_apns_config(topic, data),           # NOWE: tylko iPhone
    )
    return messaging.send(msg)
```

Decyzje do potwierdzenia przez użytkownika:
- **Żółty = `active`** (nie przebija trybu Skupienia w nocy), **czerwony =
  `time-sensitive`** (przebija Skupienie, ale nie wyciszony dzwonek). Alternatywa:
  oba `time-sensitive`.
- Critical Alerts (przebija wyciszenie) — dopiero po zgodzie Apple. Wtedy dla
  czerwonego: `sound=messaging.CriticalSound("alarm_syrena.wav", critical=True, volume=1.0)`
  i `interruption-level: critical`. Bez zgody Apple nie włączać.

### Test (do dodania jako `scripts/test_fcm_apns.py`)

1. **Offline, bez wysyłania** — kształt wiadomości i limit rozmiaru:

```python
"""Blok apns dla iPhone'a: Android bez zmian, iOS mieści się w 4096 B."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from firebase_admin import messaging
from firebase_admin import _messaging_encoder as enc   # prywatne, ale stabilne w 6.x–7.x
from app import notify


def encoded(topic, data):
    msg = messaging.Message(topic=topic, data=data,
                            android=messaging.AndroidConfig(priority="high"),
                            apns=notify._apns_config(topic, data))
    return json.loads(json.dumps(msg, cls=enc.MessageEncoder))


def apns_bytes(m):
    payload = dict(m["apns"]["payload"])
    payload.update(m["data"])          # FCM dokłada data do ładunku APNs
    return len(json.dumps(payload, ensure_ascii=False).encode())


def main():
    data = {"voiv": "świętokrzyskie", "level": "high", "score": "4.5",
            "headline": "Rakieta manewrująca ok. 120 km od granicy, dolot do granicy ok. 9 min",
            "reasons": "\n".join(f"• Doniesienie {i}: " + "ż" * 120 + " (+0.5 pkt)" for i in range(9)),
            "sent_at": "2026-09-17T12:00:00+00:00", "event_id": "świętokrzyskie|high|1"}
    m = encoded("voiv_swietokrzyskie", data)
    assert "notification" not in m and m["android"]["priority"] == "high"      # Android: dalej data-only
    aps = m["apns"]["payload"]["aps"]
    assert aps["interruption-level"] == "time-sensitive" and aps["sound"] == "alarm_syrena.wav"
    assert aps["alert"]["title"].startswith("WYSOKI PRIORYTET: woj. świętokrzyskie")
    assert "NIEOFICJALNE" in aps["alert"]["body"]
    assert m["apns"]["headers"]["apns-collapse-id"] == "voiv_swietokrzyskie"
    assert apns_bytes(m) <= 4096, apns_bytes(m)

    t = encoded("test_voiv_lubelskie", dict(data, voiv="lubelskie", level="elevated"))
    assert t["apns"]["payload"]["aps"]["alert"]["title"].startswith("TEST — PODWYŻSZONA UWAGA")
    assert t["apns"]["payload"]["aps"]["interruption-level"] == "active"

    huge = dict(data, reasons="x" * 3900)                 # ekstremum: iOS pomijamy, Android zostaje
    assert notify._apns_config("voiv_lubelskie", huge) is None
    print("OK: apns dla iOS, Android data-only bez zmian")


if __name__ == "__main__":
    main()
```

2. **Walidacja przez Google bez dostarczenia** (na VPS, z poświadczeniami):
   `messaging.send(msg, dry_run=True)` dla tematu `test_voiv_lubelskie` —
   FCM sprawdza wiadomość (także rozmiar APNs), ale **nikomu jej nie wysyła**.

3. **Prawdziwy push tylko na temat testowy** — po wgraniu klucza APNs do
   Firebase i zainstalowaniu buildu z TestFlight (build TestFlight sam zapisuje się
   też do `test_voiv_*`, wersja z App Store nie):
   ```python
   notify._send_fcm_sync("test_voiv_lubelskie", {...})   # tylko prefiks test_
   ```
   **Nigdy** na `voiv_*` — przyszedłby alarm do wszystkich użytkowników.
   Sprawdzić na iPhonie: zamknięta aplikacja, zablokowany ekran, tryb Skupienia.

4. Regresja Androida: istniejący test/emulator — push dalej przez
   `StraznikFcmService` (data-only), pełny ekran bez zmian.

---

## B. Frontend (`frontend/index.html`, `app.js`, `style.css`, `i18n.js`)

Plugin iOS ma tę samą nazwę i metody co Androidowy, więc **aplikacja już działa
bez tych zmian** — poniższe usuwa mylące rzeczy i spełnia zasady Apple.

### B1. Wykrycie iOS (warunek dla reszty)

`index.html`, skrypt „Klasa platformy przed pierwszym renderem”:
```js
if (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === "ios")
  document.documentElement.classList.add("ios-app");
```
`style.css` obok `.native-app .web-only`:
```css
.ios-app .no-ios { display: none !important; }
```
`app.js` pod `IS_APP`:
```js
const IS_IOS = IS_APP && window.Capacitor?.getPlatform?.() === "ios";
```
(`window.Capacitor` jest wstrzykiwany na iOS przed skryptami strony.)

### B2. „Postaw kawę” ukryte na iOS — zasady App Store 3.1.1 / 3.1.1(a)
Decyzja użytkownika z 17.09: iOS idzie do App Store jako konto **niehandlowca**,
a wsparcie autora zostaje **tylko na stronie**. Apple zabrania w aplikacji
przycisków, linków i zachęt do płatności poza zakupem w aplikacji — dotyczy to
także **nazwy** linku („Wesprzyj autora”, „Postaw kawę”).

Dodać klasę `no-ios` do:
- `index.html:102` `#btn-coffee` (ma już `web-only`, dopisać dla porządku)
- `index.html:250` `.sheet-row` „Wesprzyj autora” w menu „Więcej”
- `index.html:532` `.chip.coffee` „Postaw kawę autorowi” w oknie „O aplikacji”
- `index.html:775` link „Wesprzyj autora ☕” w zakładce Aplikacja

W aplikacji **zostaje** jeden neutralny link (bez słów o wsparciu):
„Instrukcja użytkownika ↗” (`index.html:247`, `773`). **Nie dodajemy** linku do
strony głównej straznik.eu — ona ma przycisk kawy, więc link z aplikacji byłby
tym samym problemem (decyzja użytkownika 17.09).

Test: w buildzie iOS `document.querySelectorAll('a[href*="buycoffee"]')` —
wszystkie mają `offsetParent === null`; żaden widoczny tekst w aplikacji nie
zawiera „kaw”, „wesprzyj”, „donate”, „buycoffee”.

### B2b. Strona instrukcji bez przycisku kawy (`docs/`, GitHub Pages)
**Decyzja użytkownika 17.09:** przycisk „Postaw kawę” **znika ze strony
instrukcji**, zostaje na stronie głównej straznik.eu (i w wersji na Androida
oraz w przeglądarce). Powód: recenzenci Apple otwierają linki z aplikacji, a
zachęta do zapłaty na stronie docelowej może być uznana za obejście zakupów
w aplikacji (3.1.1(a)).

Do zmiany — stopka sekcji „Prywatność i źródła”:
- `docs/index.html:356` — usunąć `<a href="https://buycoffee.to/cukierrro">Postaw kawę</a>`
  (razem z poprzedzającym separatorem „ · ”)
- `docs/en.html:356` — to samo dla „Buy a coffee”

Sprawdzić też, czy kawy nie ma w nagłówku/menu instrukcji ani na `zmiany.html`
i `zmiany-en.html` (na 17.09 nie znalazłem tam linków buycoffee).

**Przy okazji, potrzebne do App Store:** Apple wymaga adresu **polityki
prywatności**. Dziś jest sekcja 14 „Prywatność i źródła” w instrukcji
(`docs/index.html#prywatnosc`) — wystarczy jako adres, ale czytelniejsza byłaby
osobna, krótka strona `docs/prywatnosc.html` (te same treści: brak konta,
reklam i analityki; na serwer i do dostawcy powiadomień idą tylko nazwy
województw i identyfikator subskrypcji; dokładna lokalizacja zostaje
w telefonie). Do decyzji użytkownika i sesji głównej.

### B3. Wersja aplikacji i aktualizacje
Plugin iOS **celowo zwraca pusty `appVersion`** — dzięki temu `checkForUpdate()`
kończy się od razu i nie proponuje APK (Apple odrzuca aplikacje namawiające do
instalacji spoza App Store). Wersję iOS podaje w `iosAppVersion`.
- `app.js` `refreshBgStatus()`, linia z `verEl.textContent`:
  `const shown = s.appVersion || s.iosAppVersion;` i użyć `shown`.
- `#btn-update` ukryć na iOS: `if (updBtn) updBtn.style.display = UPDATE_CHECK && !IS_IOS ? "" : "none";`

### B4. Stopka stanu w zakładce Alarmy
`app.js` `refreshBgStatus()`:
```js
+ `<br><span class="muted">${s.platform === "ios" ? `iOS ${esc(s.osVersion || "")}`
    : `Android ${s.sdk}, ${esc(s.manufacturer || "")}`}`
```
Dodatkowe ostrzeżenie tylko na iOS (pole `timeSensitiveAllowed` z pluginu):
```js
if (s.platform === "ios" && s.notificationsAllowed && s.timeSensitiveAllowed === false)
  warn.push(isEn ? "⚠ “Time Sensitive Notifications” are off for Strażnik — a red alert may stay silent in Focus mode. Settings → Strażnik → Notifications."
    : "⚠ „Powiadomienia czasowo zależne” są wyłączone dla Strażnika — czerwony alarm może nie przebić trybu Skupienia. Ustawienia → Strażnik → Powiadomienia.");
```

**Potwierdzone na urządzeniu (18.09.2026, iPhone testerki, build 2609181725):**
ostrzeżenie o „Powiadomieniach czasowo zależnych” jest **potrzebne i pilne**.
Test czerwonego alarmu zadziałał na zablokowanym ekranie z włączonym dzwonkiem,
na wyciszeniu dał wibrację i baner bez dźwięku, a **w trybie Sen nie dotarło nic
do odblokowania telefonu**. Powód: iOS dopuszcza powiadomienia czasowo zależne
dopiero po zgodzie — per aplikacja (Ustawienia → Powiadomienia → Strażnik) i per
tryb Skupienia (Ustawienia → Skupienie → Sen → Aplikacje). Plugin już zwraca
`timeSensitiveAllowed`, więc aplikacja może to wykryć i podpowiedzieć ustawienie.

**Zmiana wdrożona 18.09.2026 (`9295695`, sesja główna):** `apns-expiration` to
teraz `now + 600 s`, a nie `now + FCM_TTL_S` (900 s). Powód jest po stronie iOS:
Android czyta `sent_at` i spóźniony alarm pokazuje **cicho**, z dopiskiem
„opóźnione o X min”, a iPhone rysuje baner z ładunku wyrenderowanego w chwili
wysyłki — nie da się go po fakcie ściszyć ani opisać. Wiadomość sprzed kwadransa
zawyłaby syreną jak świeża. Krótsza ważność znaczy: iPhone dostanie alarm
aktualny albo żaden. Ttl Androida zostaje 15 minut, bo on umie zdegradować.

Uwaga dla nas: kontrola `sent_at` w pluginie iOS (`isStale`) **nie blokuje**
wyświetlenia — działa tylko w `willPresent`, czyli przy aplikacji na wierzchu,
i decyduje wyłącznie o tym, czy zdarzenie trafi do `app.js`, czy do zwykłego
banera. Jedyną realną barierą dla spóźnionej wiadomości jest `apns-expiration`.

### B5. Elementy tylko dla Androida — klasa `android-only` + CSS `.ios-app .android-only {display:none!important}`
- `#btn-battery` (🔋 oszczędzanie baterii), `#btn-fullscreen`, `#fs-check` (dialog)
- w `#native-sound`: przełącznik `set-force-volume`, `#ns-volume`, `#btn-sound-settings`
  („Ustawienia dźwięku Androida”), akapit `#ns-note`
**Potwierdzone na urządzeniu (18.09.2026):** przełącznik „Czerwony alarm zawsze na
pełnej głośności” po włączeniu **sam wraca na wyłączony** — plugin zgłasza
`supported: false`, bo iOS nie pozwala aplikacji zmieniać głośności. Dla testerki
wyglądało to na usterkę, więc ukrycie tego przełącznika na iOS jest pilniejsze
niż resztą tej listy.

- **zostają** `#btn-native-test` i `#btn-native-test-yellow` — na iOS działają
  (lokalne powiadomienie z syreną za 5 s)

### B6. Teksty z „Androidem” / „pełnym ekranem” — wariant iOS

**Stan: gotowe do wprowadzenia (19.09.2026).** Teksty poniżej opisują zachowanie
**zmierzone na dwóch iPhone'ach**, a nie przewidywane: alarm dociera w 3 sekundy,
iOS oznacza go jako „PILNE”, widać go nad blokadą, gra nasza syrena — raz, nie
w pętli. Przy wyciszonym dzwonku jest tylko wibracja i baner. W trybie Skupienia
przechodzi dopiero po ręcznym dopuszczeniu aplikacji (potwierdzone u testerki).

Dlaczego to pilne: te teksty **są dziś widoczne na iPhonie** (zrzut z zakładki
Alarmy: „Android 14 i nowszy może cofnąć tę zgodę…”). Recenzent App Store czyta
je przy ocenie, a nasze główne ryzyko odrzucenia to zarzut 4.2.2 — „aplikacja
z innej platformy”. Dla użytkownika opisują funkcję, której na iOS nie ma.

#### 1. `index.html` — ekran powitalny `#onboard-bg`, drugi akapit (ok. l. 616)

Android (zostaje): „Poprosimy tylko o zgodę na powiadomienia. Dla czerwonego alarmu
warto też włączyć zgodę na alarm pełnoekranowy (zapala ekran nad blokadą) — zrobisz
to jednym przyciskiem w Ustawieniach.”

**iOS:**
> Poprosimy tylko o zgodę na powiadomienia. Żeby czerwony alarm odezwał się w nocy,
> zostaw włączone „Powiadomienia czasowo zależne” i dopuść Strażnika w trybie Sen
> (Ustawienia → Skupienie → Sen → Aplikacje).

**EN:**
> We only ask for notification permission. So that a red alert can reach you at
> night, keep “Time Sensitive Notifications” on and allow Strażnik in your Sleep
> focus (Settings → Focus → Sleep → Apps).

#### 2. `index.html` — zakładka Alarmy, akapit wstępny (ok. l. 661)

Usunąć dla iOS zdanie o usłudze w tle i o zgodzie na alarm pełnoekranowy:

**iOS:**
> Alarmy dla Twojego województwa przychodzą jako **powiadomienie push** — także gdy
> aplikacja jest zamknięta, ekran zablokowany albo telefon w uśpieniu. Serwer
> Strażnika wysyła sygnał prosto na telefon; wystarczy zgoda na powiadomienia.
> Wymaga to działającego serwera: w trybie awaryjnym (serwer niedostępny) alarmy
> przychodzą tylko przy otwartej aplikacji.

**EN:**
> Alerts for your province arrive as a **push notification** — also when the app is
> closed, the screen is locked or the phone is asleep. The Strażnik server sends the
> signal straight to the phone; notification permission is all that is needed. This
> needs a working server: in fallback mode (server unreachable) alerts only arrive
> while the app is open.

#### 3. `index.html` — akapit o alarmie pełnoekranowym (ok. l. 683–690) — NAJWAŻNIEJSZY

Cały akapit o Androidzie 14, zgodzie i oszczędzaniu baterii **zastąpić na iOS**:

**iOS:**
> Na iPhonie czerwony alarm przychodzi jako powiadomienie oznaczone **„PILNE”**:
> pokazuje się nad blokadą i gra syreną. **Nie zapala pełnego ekranu i nie powtarza
> dźwięku** — iOS na to nie pozwala zwykłym aplikacjom. Przy **wyciszonym dzwonku**
> alarm będzie bezgłośny: zostanie wibracja i baner.
>
> Żeby przeszedł także w nocy, sprawdź dwie rzeczy: **Ustawienia → Powiadomienia →
> Strażnik → „Powiadomienia czasowo zależne”** oraz **Ustawienia → Skupienie → Sen →
> Aplikacje → dopuść Strażnika**. Bez tego iOS wstrzymuje alarm do odblokowania
> telefonu.

**EN:**
> On iPhone a red alert arrives as a notification marked **“Urgent”**: it appears
> over the lock screen and plays our siren. It **does not take over the screen and
> does not repeat the sound** — iOS does not allow regular apps to do that. With the
> **ringer muted** the alert is silent: a vibration and a banner, nothing more.
>
> For it to reach you at night, check two settings: **Settings → Notifications →
> Strażnik → “Time Sensitive Notifications”** and **Settings → Focus → Sleep → Apps
> → allow Strażnik**. Without them iOS holds the alert until you unlock the phone.

#### 4. `index.html` — zakładka Dźwięk (ok. l. 707)

„…jako powiadomienie push (z pełnym ekranem i syreną dla czerwonego).”
**iOS:** „…jako powiadomienie push (z syreną dla czerwonego).”
**EN iOS:** “…as a push notification (with the siren for red).”

#### 5. `app.js:3563` — komunikat o wyłączonych powiadomieniach

„Włącz je w ustawieniach **Androida** (⚙ → Ustawienia powiadomień).”
**iOS:** „Włącz je w Ustawieniach **iPhone'a** (⚙ → Ustawienia powiadomień).”

#### 6. `app.js:4979` — potwierdzenie przy wyłączaniu alarmów

„Zgody na powiadomienia w ustawieniach **Androida** zostają bez zmian…”
**iOS:** „Zgody na powiadomienia w Ustawieniach **iPhone'a** zostają bez zmian…”

#### 7. `index.html:377` — ekran „O aplikacji”

„aplikacja na Androida może wysyłać powiadomienia” → **„aplikacja na Androida
i iPhone'a…”**. Dopiero **po** pojawieniu się w App Store — wcześniej byłoby to
nieprawdą dla czytelnika strony.

#### Czego NIE zmieniamy

Przycisk „Zgoda na alarm pełnoekranowy” i „Wyłącz oszczędzanie baterii” mają już
`android-only` i na iOS się nie pokazują (B5, zrobione). Ostrzeżenia o wygasłej
zgodzie na pełny ekran nie pojawiają się, bo plugin iOS zwraca
`fullScreenAllowed: true` — to celowe, nie przeoczenie.

Odpowiedniki EN w `i18n.js` (l. 113, 120, 312, 324, 335–336) — te same zmiany.
### B7. Wynik testu natywnego bez zgody
`app.js` `nativeTest()`: plugin iOS zwraca `{scheduled:false, reason:"denied"}`,
gdy powiadomienia są zablokowane. Dziś toast „Test alarmu za 5 sekund” pokaże się
mimo to:
```js
const r = await plugin.testNativeAlarm({ level, delayMs: 5000, voivodeship: myVoiv() || "lubelskie" });
if (r && r.scheduled === false) return toast(UI.isEn
  ? "Notifications are blocked — enable them in Settings → Strażnik → Notifications."
  : "Powiadomienia są zablokowane — włącz je w Ustawienia → Strażnik → Powiadomienia.", 6000);
```
(Android zwraca `undefined` — zachowanie bez zmian.)

### B8. Do sprawdzenia na iPhonie (bez zmian w kodzie na razie)
- `navigator.vibrate` nie istnieje w Safari/WKWebView — alarm przy otwartej
  aplikacji nie wibruje (kod jest już zabezpieczony `if (navigator.vibrate)`).
- Syrena Web Audio wymaga wcześniejszego dotknięcia ekranu — `app.js:3430`
  odblokowuje `AudioContext` przy pierwszym `pointerdown`; po powrocie z tła iOS
  może go ponownie zawiesić. Test na TestFlight.
- `dvh` i `<dialog>` wymagają iOS 15.4+; build iOS ma minimum **iOS 16**.

---

## C. Uwaga przy okazji: build Androida i `pl-outline.js`

`1_buduj_i_testuj.bat` (krok 3/7) kopiuje do `android-app/www` wybrane pliki,
ale **nie kopiuje `pl-outline.js`** (wczytywanego przez `index.html`, ostatnia
zmiana `6320cae`, A2b) ani `manifest.json`. Jeśli `android-app/www/pl-outline.js`
w katalogu głównym jest starszy niż `frontend/pl-outline.js`, APK ma nieaktualny
kontur Polski. Nie sprawdzałem katalogu głównego (poza tą sesją) — do weryfikacji
w sesji głównej. Skrypt iOS (`ios-app/skrypty/przygotuj.mjs`) kopiuje cały
`frontend/` poza plikami tylko dla strony.

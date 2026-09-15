package pl.straznik.app;

import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Odbiór pushy FCM. Serwer liczy fuzję raz i przy wzroście poziomu wysyła
 * wiadomość `data` na temat voiv_&lt;region&gt;. Telefon subskrybuje tematy
 * obserwowanych województw, więc dostaje tylko ich alarmy — nawet przy zamkniętej
 * aplikacji, w trybie Doze i przed pierwszym odblokowaniem po restarcie (direct boot).
 *
 * Celowo wiadomości są `data-only`: dzięki temu ZAWSZE trafiają tutaj (system nie
 * wyświetla ich sam), a my sami budujemy powiadomienie —
 * {@link Alarms#postAlarm}, z pełnoekranowym alarmem dla czerwonego.
 */
public class StraznikFcmService extends FirebaseMessagingService {
    private static final String TAG = "StraznikFcm";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty()) return;

        String voivName = data.get("voiv");
        String level = data.get("level");
        if (voivName == null || level == null) return;
        // Użytkownik wyłączył alarmy na tym telefonie. Wypisanie z tematów FCM dociera
        // z opóźnieniem (albo wcale bez internetu), więc sprawdzamy to także tutaj.
        if (Alarms.prefs(this).getBoolean(Alarms.KEY_ALERTS_OFF, false)) {
            Log.i(TAG, "alarmy wyłączone na tym telefonie — pomijam " + voivName + "/" + level);
            return;
        }

        int voiv = -1;
        for (int i = 0; i < Alarms.VOIVS.length; i++)
            if (Alarms.VOIVS[i].equalsIgnoreCase(voivName)) { voiv = i; break; }
        if (voiv < 0) { Log.w(TAG, "nieznane województwo: " + voivName); return; }

        long sentAtMs = 0;
        try {
            // „2026-09-13T17:09:16+00:00" — SimpleDateFormat zamiast java.time (minSdk 24)
            sentAtMs = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT)
                .parse(data.get("sent_at")).getTime();
        } catch (Exception ignored) {}
        boolean stale = sentAtMs > 0 && System.currentTimeMillis() - sentAtMs > Alarms.STALE_AFTER_MS;

        // Audyt B1: przy aplikacji na wierzchu wiadomość była po cichu porzucana, a
        // WebView alarmował tylko o głównym miejscu — alarm dla drugiego miejsca
        // (np. rodzice w innym województwie) przepadał. Teraz świeżą wiadomość
        // przekazujemy do aplikacji, a gdy ta jej nie odbierze — pokazujemy natywnie.
        if (!stale && MainActivity.isForeground() && BackgroundPlugin.forwardAlarm(data)) return;

        double score = 0;
        try { score = Double.parseDouble(data.get("score")); } catch (Exception ignored) {}

        List<String> reasons = new ArrayList<>();
        String r = data.get("reasons");
        if (r != null && !r.isEmpty())
            for (String line : r.split("\n"))
                if (!line.trim().isEmpty()) reasons.add(line.trim());

        Alarms.createChannels(this);
        Alarms.postAlarm(this, voiv, level, score, reasons, data.get("headline"), sentAtMs, false);
    }

    @Override
    public void onNewToken(String token) {
        // Audyt B3: nowy token (np. po wyczyszczeniu danych Usług Google Play) nie ma
        // żadnych tematów, a aplikacja dalej uważała je za subskrybowane. Zapisujemy
        // wszystkie tematy od nowa.
        Log.i(TAG, "odświeżono token FCM — ponowna subskrypcja tematów");
        try {
            BackgroundPlugin.syncFcmSubscription(getApplicationContext(), true);
        } catch (Exception e) {
            // przed pierwszym odblokowaniem zapis ustawień jest niedostępny — nadrobi to start aplikacji
            Log.w(TAG, "subskrypcja po nowym tokenie", e);
        }
    }
}

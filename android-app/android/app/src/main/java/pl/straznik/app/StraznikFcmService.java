package pl.straznik.app;

import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Odbiór pushy FCM. Serwer liczy fuzję raz i przy wzroście poziomu wysyła
 * wiadomość `data` na temat voiv_&lt;region&gt;. Telefon subskrybuje temat swojego
 * województwa, więc dostaje tylko własne alarmy — nawet przy zamkniętej aplikacji
 * i w trybie Doze (wiadomości mają priorytet „high").
 *
 * Celowo wiadomości są `data-only`: dzięki temu ZAWSZE trafiają tutaj (system nie
 * wyświetla ich sam), a my odtwarzamy dokładnie tę samą ścieżkę co usługa w tle —
 * {@link MonitorService#postAlarm}, z pełnoekranowym alarmem dla czerwonego.
 */
public class StraznikFcmService extends FirebaseMessagingService {
    private static final String TAG = "StraznikFcm";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty()) return;

        // Aplikacja na wierzchu sama pokazuje alarm (WebView/silnik) — nie dublujemy.
        if (MainActivity.isForeground()) return;
        // Usługa pierwszoplanowa (jeśli włączona) już monitoruje i powiadamia lokalnie.
        if (MonitorService.ALIVE) return;

        String voivName = data.get("voiv");
        String level = data.get("level");
        if (voivName == null || level == null) return;

        int voiv = -1;
        for (int i = 0; i < Sources.VOIVS.length; i++)
            if (Sources.VOIVS[i].equalsIgnoreCase(voivName)) { voiv = i; break; }
        if (voiv < 0) { Log.w(TAG, "nieznane województwo: " + voivName); return; }

        double score = 0;
        try { score = Double.parseDouble(data.get("score")); } catch (Exception ignored) {}

        List<String> reasons = new ArrayList<>();
        String r = data.get("reasons");
        if (r != null && !r.isEmpty())
            for (String line : r.split("\n"))
                if (!line.trim().isEmpty()) reasons.add(line.trim());

        MonitorService.createChannels(this);
        MonitorService.postAlarm(this, voiv, level, score, reasons);
    }

    @Override
    public void onNewToken(String token) {
        // Subskrypcja idzie po TEMATACH (voiv_<region>), nie po tokenie, więc tokena
        // nie musimy nigdzie wysyłać — subskrypcje odnawiają się same.
        Log.i(TAG, "odświeżono token FCM");
    }
}

package pl.straznik.app;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Czy aplikacja jest na wierzchu — push FCM pomija powiadomienie, gdy tak jest
     *  (alarm pokazuje wtedy sam WebView), żeby nie było podwójnego alarmu. */
    private static volatile boolean FOREGROUND = false;
    public static boolean isForeground() { return FOREGROUND; }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        // kanały powiadomień potrzebne dla alarmów z pusha (StraznikFcmService)
        Alarms.createChannels(this);
        // odśwież subskrypcję tematu FCM na podstawie zapisanego regionu
        BackgroundPlugin.syncFcmSubscription(this);
        // Usługa pierwszoplanowa w tle WYCOFANA — alarmy przy zamkniętej aplikacji
        // dostarcza FCM (patrz StraznikFcmService), więc nic tu nie uruchamiamy.

        // Systemowe „wstecz” (17.09.2026): wcześniej od razu minimalizowało aplikację,
        // nawet z otwartymi ustawieniami. Najpierw pytamy stronę (window.straznikBack),
        // czy ma co zamknąć; dopiero gdy nie — aplikacja idzie w tło jak dotąd.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    moveTaskToBack(true);
                    return;
                }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return !!(window.straznikBack&&window.straznikBack());}"
                        + "catch(e){return false;}})()",
                    value -> { if (!"true".equals(value)) moveTaskToBack(true); });
            }
        });
    }

    @Override public void onResume() {
        super.onResume();
        FOREGROUND = true;
        // Powrót z systemowych ustawień: użytkownik mógł właśnie przyznać dostęp do
        // trybu Nie przeszkadzać, a setBypassDnd na kanale czerwonego zadziała dopiero
        // przy kolejnym createChannels. Bez tego zgoda nie robiłaby nic do restartu.
        Alarms.createChannels(this);
        // alarm wyciszony dotknięciem powiadomienia (bez „Wycisz”) zostawiał
        // podniesioną głośność — przywracamy ją, gdy nie gra już żaden czerwony
        if (!redAlarmActive()) Alarms.restoreAlarmVolume(this);
    }

    private boolean redAlarmActive() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return false;
        try {
            android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications())
                if ((sbn.getNotification().flags & android.app.Notification.FLAG_INSISTENT) != 0) return true;
        } catch (Exception ignored) {}
        return false;
    }
    @Override public void onPause() { FOREGROUND = false; super.onPause(); }
}

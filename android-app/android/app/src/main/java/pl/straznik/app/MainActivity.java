package pl.straznik.app;

import android.os.Bundle;

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
        // kanały powiadomień potrzebne też dla alarmów z pusha (StraznikFcmService)
        MonitorService.createChannels(this);
        // odśwież subskrypcję tematu FCM na podstawie zapisanego regionu
        BackgroundPlugin.syncFcmSubscription(this);
        // Usługa pierwszoplanowa w tle WYCOFANA — alarmy przy zamkniętej aplikacji
        // dostarcza FCM (patrz StraznikFcmService), więc nic tu nie uruchamiamy.
    }

    @Override public void onResume() { super.onResume(); FOREGROUND = true; }
    @Override public void onPause() { FOREGROUND = false; super.onPause(); }
}

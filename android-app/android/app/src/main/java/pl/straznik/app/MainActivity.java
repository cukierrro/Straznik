package pl.straznik.app;

import android.content.Intent;
import android.os.Build;
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
        MonitorService.createChannels(this);
        // odśwież subskrypcję tematu FCM na podstawie zapisanego regionu
        BackgroundPlugin.syncFcmSubscription(this);
        resumeMonitoringIfEnabled();
    }

    @Override protected void onResume() { super.onResume(); FOREGROUND = true; }
    @Override protected void onPause() { FOREGROUND = false; super.onPause(); }

    /**
     * Nasłuch włączony w ustawieniach ma działać także wtedy, gdy usługa nie
     * przetrwała — po wymuszonym zatrzymaniu, czyszczeniu pamięci przez system
     * albo agresywnym menedżerze baterii. Bez tego przełącznik pokazywałby
     * „włączone", a w tle nic by nie chodziło, aż do restartu telefonu.
     */
    private void resumeMonitoringIfEnabled() {
        if (!BackgroundPlugin.isEnabled(this)) return;
        try {
            Intent i = new Intent(this, MonitorService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i);
            else startService(i);
        } catch (Exception ignored) {}
    }
}

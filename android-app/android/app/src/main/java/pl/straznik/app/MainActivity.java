package pl.straznik.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundPlugin.class);
        super.onCreate(savedInstanceState);
        MonitorService.createChannels(this);
        resumeMonitoringIfEnabled();
    }

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

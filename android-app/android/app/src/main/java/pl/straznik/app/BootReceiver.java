package pl.straznik.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Wznawia nasłuch po restarcie telefonu — jeśli użytkownik go wcześniej włączył. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (a == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(a)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        if (!BackgroundPlugin.isEnabled(context)) return;
        Intent svc = new Intent(context, MonitorService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(svc);
            else context.startService(svc);
        } catch (Exception ignored) {}
    }
}

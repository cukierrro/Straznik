package pl.straznik.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.ArrayList;
import java.util.List;

/**
 * WYŁĄCZNIE w buildzie debug (katalog src/debug) — nie trafia do wydania.
 * Pozwala odpalić DOKŁADNIE tę samą ścieżkę alarmu, której używa usługa w tle,
 * bez czekania na realne zdarzenie. Dzięki temu da się zweryfikować migający
 * alarm pełnoekranowy i syrenę przy zamkniętej aplikacji i różnym stanie ekranu:
 *
 *   adb shell am broadcast -a pl.straznik.app.TEST_ALARM --es level high  --ei voiv 0 --ef score 5.5
 *   adb shell am broadcast -a pl.straznik.app.TEST_ALARM --es level elevated --ei voiv 0 --ef score 2.5
 */
public class TestReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent i) {
        if (i == null) return;
        MonitorService.createChannels(ctx);
        String level = i.getStringExtra("level");
        if (level == null) level = "high";
        int voiv = i.getIntExtra("voiv", 0);
        double score = i.getDoubleExtra("score", "high".equals(level) ? 5.5 : 2.5);

        // direct=true: uruchom wprost migający ekran alarmu (podgląd UI + syrena),
        // gdy emulatora nie da się uśpić, by wywołać go przez full-screen intent
        if (i.getBooleanExtra("direct", false)) {
            ctx.startActivity(new Intent(ctx, AlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(AlarmActivity.EXTRA_VOIV, Sources.VOIVS[voiv])
                .putExtra(AlarmActivity.EXTRA_SCORE, score)
                .putExtra(AlarmActivity.EXTRA_BODY, "• [test] Rakieta kursem na granicę PL, 60 km"));
            return;
        }

        List<String> reasons = new ArrayList<>();
        reasons.add("• [test] Rakieta kursem na granicę PL, 60 km");
        reasons.add("• [test] Sygnał testowy — weryfikacja alarmu w tle");
        MonitorService.postAlarm(ctx, voiv, level, score, reasons);
    }
}

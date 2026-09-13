package pl.straznik.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * „Wycisz alarm” z powiadomienia i odrzucenie powiadomienia gestem. Syrena
 * czerwonego gra w pętli (FLAG_INSISTENT), więc musi istnieć sposób na jej
 * wyciszenie bez otwierania aplikacji; przy okazji wraca głośność sprzed alarmu.
 */
public class AlarmActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Alarms.ACTION_SILENCE.equals(intent.getAction())) return;
        int voiv = intent.getIntExtra(Alarms.EXTRA_NOTIF_ID, -1);
        if (voiv < 0 || voiv >= Alarms.VOIVS.length) {
            Alarms.restoreAlarmVolume(context);
            return;
        }
        Alarms.silence(context, voiv);
    }
}

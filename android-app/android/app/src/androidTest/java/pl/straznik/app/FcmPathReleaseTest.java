package pl.straznik.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.service.notification.StatusBarNotification;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import static org.junit.Assert.*;

/**
 * Odbiór pushu FCM na wariancie release — także po R8 — bez serwera i bez tematów.
 *
 * Podaje odbiornikowi Firebase tę samą intencję, którą doręczają Usługi Google
 * Play, więc przechodzi przez zminifikowany kod Firebase (FirebaseInstanceIdReceiver,
 * FirebaseMessagingService, RemoteMessage) aż do naszego onMessageReceived
 * i Alarms.postAlarm. Nic nie
 * wysyła w sieć; na urządzeniu pokazuje prawdziwy czerwony alarm z nagłówkiem
 * TEST LOKALNY. Uruchamiać na emulatorze, z aplikacją w tle (HOME), bo przy
 * aplikacji na wierzchu wiadomość trafia do WebView, a nie do alarmu natywnego.
 *
 *   gradlew -PsecurityTests assembleGithubReleaseAndroidTest
 *   adb shell am instrument -w -e class pl.straznik.app.FcmPathReleaseTest \
 *       pl.straznik.app.test/androidx.test.runner.AndroidJUnitRunner
 */
public class FcmPathReleaseTest {
    private static final String HEADLINE = "TEST LOKALNY: ścieżka FCM wariantu release";

    @Test public void dataMessageReachesNativeRedAlarm() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences fcm = c.getSharedPreferences("straznik_fcm", Context.MODE_PRIVATE);
        int before = fcm.getInt("push_count", 0);
        // alarm z poprzedniego przebiegu może jeszcze wisieć z tym samym nagłówkiem —
        // bez sprzątania test znalazłby stary i skończył, zanim dojdzie nowy
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.cancelAll();
        // Od zgłoszenia #15 usługa pomija województwo spoza obserwowanych. Na czystym
        // emulatorze nic nie jest obserwowane, więc na czas testu wpisujemy lubelskie
        // i przywracamy poprzedni stan. Bez syncFcmSubscription: test nie zapisuje
        // emulatora do żadnego tematu FCM.
        SharedPreferences bg = c.getSharedPreferences("straznik_bg", Context.MODE_PRIVATE);
        boolean mialRegiony = bg.contains("observed_voivs");
        java.util.Set<String> regionyPrzed = new java.util.HashSet<>(
            bg.getStringSet("observed_voivs", java.util.Collections.<String>emptySet()));
        bg.edit().putStringSet("observed_voivs",
            new java.util.HashSet<>(java.util.Collections.singleton("lubelskie"))).commit();
        try {
        String headline = HEADLINE + " #" + System.currentTimeMillis();

        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        // Ta sama droga co z Usług Google Play: rozgłoszenie do odbiornika Firebase
        // z manifestu. Usługi nie da się karmić wprost — Firebase bierze wiadomości
        // z własnej kolejki, którą zasila właśnie ten odbiornik. Uprawnienie
        // c2dm.SEND nie blokuje, bo nadawca ma ten sam UID co odbiornik.
        Intent push = new Intent("com.google.android.c2dm.intent.RECEIVE")
            .setComponent(new ComponentName(c, "com.google.firebase.iid.FirebaseInstanceIdReceiver"))
            .putExtra("from", "/topics/test_lokalny")
            .putExtra("google.message_id", "0:test-lokalny-" + System.currentTimeMillis())
            .putExtra("voiv", "lubelskie")
            .putExtra("level", "high")
            .putExtra("score", "4.0")
            .putExtra("headline", headline)
            .putExtra("reasons", "To jest test — nie ma zagrożenia.")
            .putExtra("sent_at", iso.format(new Date()));
        c.sendBroadcast(push);

        Notification found = null;
        for (int i = 0; i < 40 && found == null; i++) {
            for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                CharSequence big = sbn.getNotification().extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
                if (big != null && big.toString().contains(headline)) found = sbn.getNotification();
            }
            if (found == null) Thread.sleep(250);
        }
        assertNotNull("brak powiadomienia alarmu po wiadomości FCM", found);
        // Kanał z kodu aplikacji, nie wpisany na sztywno: 1.8.06 przeszło na
        // straznik-high-v4 i test z „v3” padał na poprawnym alarmie (6.11.2026).
        assertEquals(Alarms.highChannel(c), found.getChannelId());
        assertTrue("czerwony musi iść kanałem straznik-high-*",
            found.getChannelId().startsWith("straznik-high-"));
        assertEquals(Notification.CATEGORY_ALARM, found.category);
        // Bez zgody USE_FULL_SCREEN_INTENT (Android 14 cofa ją przy aktualizacji spoza
        // Play) system zdejmuje fullScreenIntent i zostawia flagę „zażądany, ale
        // odmówiony” (FLAG_FSI_REQUESTED_BUT_DENIED, ukryta stała 0x4000). Wtedy
        // sprawdzamy, że aplikacja go zażądała; ze zgodą — że naprawdę jest.
        if (android.os.Build.VERSION.SDK_INT >= 34 && !nm.canUseFullScreenIntent())
            assertTrue("czerwony nie zażądał pełnego ekranu", (found.flags & 0x4000) != 0);
        else
            assertNotNull("czerwony bez pełnego ekranu", found.fullScreenIntent);
        assertTrue("czerwony bez FLAG_INSISTENT", (found.flags & Notification.FLAG_INSISTENT) != 0);
        assertEquals("dowód dostarczenia nie został zapisany", before + 1, fcm.getInt("push_count", 0));
        } finally {
            if (mialRegiony) bg.edit().putStringSet("observed_voivs", regionyPrzed).commit();
            else bg.edit().remove("observed_voivs").commit();
        }
    }
}

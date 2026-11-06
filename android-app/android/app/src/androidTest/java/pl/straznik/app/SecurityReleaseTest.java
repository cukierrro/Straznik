package pl.straznik.app;

import android.content.Context;
import android.os.Bundle;
import android.security.NetworkSecurityPolicy;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import org.junit.Test;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Installed separately by the test runner. Never packaged in the application. */
public class SecurityReleaseTest {
    private String js(MainActivity a, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            a.getBridge().getWebView().evaluateJavascript(script, value -> {
                result.set(value); done.countDown();
            }));
        assertTrue("JS timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    // recoveryOnDevice (WebSocket) i publishedUpdate (wersja 1.7.12, podlaskie) usunięte
    // 6.11.2026: aplikacja od dawna odpytuje serwer zamiast WebSocketu, a wydanie
    // i województwo były wpisane na sztywno — testy opisywały aplikację z 1.7.12.
    private void shell(String command) throws Exception {
        android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation()
            .getUiAutomation().executeShellCommand(command);
        try (java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd)) {
            while (in.read() != -1) { }
        }
    }

    @Test public void networkPolicy() throws Exception {
        NetworkSecurityPolicy p = NetworkSecurityPolicy.getInstance();
        assertFalse(p.isCleartextTrafficPermitted("example.org"));
        assertFalse(p.isCleartextTrafficPermitted("straznik.eu"));
        assertFalse(p.isCleartextTrafficPermitted("sub.localhost"));
        assertTrue(p.isCleartextTrafficPermitted("localhost"));
        javax.net.ssl.HttpsURLConnection c = (javax.net.ssl.HttpsURLConnection)
            new java.net.URL("https://straznik.eu/api/health").openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(15000);
        try { assertEquals(200, c.getResponseCode()); } finally { c.disconnect(); }
    }

    @Test public void nativeNotifications() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.app.NotificationManager nm = c.getSystemService(android.app.NotificationManager.class);
        Alarms.createChannels(c);
        assertTrue(nm.areNotificationsEnabled());
        for (String level : new String[]{"elevated", "high"}) {
            Alarms.postAlarm(c, 2, level, level.equals("high") ? 4.5 : 2.5,
                java.util.Collections.singletonList("TEST TYLKO PIXEL — brak rzeczywistego zagrożenia"));
            Thread.sleep(800);
            android.service.notification.StatusBarNotification found = null;
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications())
                if (n.getId() == 2002) found = n;
            assertNotNull("Notification missing: " + level, found);
            android.app.Notification n = found.getNotification();
            assertEquals(level.equals("high") ? Alarms.CH_HIGH : Alarms.CH_INFO, n.getChannelId());
            assertTrue(n.extras.getString(android.app.Notification.EXTRA_TEXT).contains("TEST TYLKO PIXEL"));
            // Android 14 may strip the intent when the user denies this permission.
            if (level.equals("high") && (android.os.Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())) assertNotNull(n.fullScreenIntent);
            else if (level.equals("high")) { /* Delivery is verified above; FSI is not guaranteed. */ }
            else assertNull(n.fullScreenIntent);
            nm.cancel(2002);
        }
    }

    /**
     * Aktualizator wariantu github (telefony bez Sklepu Google, np. Huawei): pobiera
     * najnowszy APK z GitHuba, sprawdza SHA-256 i oddaje go instalatorowi Androida.
     * Niczego nie instaluje — instalator czeka na potwierdzenie, którego nikt nie daje.
     * Zgodę „instalowanie aplikacji” test daje sam (bez niej aktualizator słusznie
     * odmawia — tak padał na czystym emulatorze 6.11.2026). COFNĄĆ JĄ musi uruchamiający,
     * PO teście: Android zabija proces aplikacji przy cofnięciu tej zgody („Killing …
     * REQUEST_INSTALL_PACKAGES changed”), a test działa właśnie w tym procesie:
     *   adb shell appops set pl.straznik.app REQUEST_INSTALL_PACKAGES default
     * Uruchamiać osobno, na końcu — kolejne testy w tym samym przebiegu by nie ruszyły.
     */
    @Test public void prepareUpdater() throws Exception {
        String pkg = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        shell("appops set " + pkg + " REQUEST_INSTALL_PACKAGES allow");
        android.app.Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        MainActivity a = (MainActivity) ins.startActivitySync(new android.content.Intent(
            ins.getTargetContext(), MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
        for (int i=0; i<30 && !"true".equals(js(a,"typeof BG === 'function'")); i++) Thread.sleep(1000);
        js(a,"window.testUpdateResult='pending'; fetch(UPDATE_API).then(r=>r.json()).then(r=>BG().installUpdate({url:r.url,sha256:r.sha256})).then(()=>window.testUpdateResult='ok').catch(e=>window.testUpdateResult=String(e)); void 0");
        for (int i=0; i<90 && "\"pending\"".equals(js(a,"window.testUpdateResult")); i++) Thread.sleep(1000);
        assertEquals("\"ok\"", js(a,"window.testUpdateResult"));
        // Keep the process alive while the external installer displays its UI.
        Thread.sleep(45000);
    }

    @Test public void deviceToken() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        com.google.firebase.FirebaseApp.initializeApp(c);
        String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 40, TimeUnit.SECONDS);
        assertNotNull(token);
        Bundle result = new Bundle();
        result.putString("pixel_fcm_token", token);
        InstrumentationRegistry.getInstrumentation().sendStatus(0, result);
    }
}

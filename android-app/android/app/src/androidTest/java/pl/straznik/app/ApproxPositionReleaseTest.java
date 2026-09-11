package pl.straznik.app;

import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;

import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Isolated UI replay of an archived NEPTUN observation. It performs no network
 * writes, signal ingestion, notification delivery or production state changes.
 */
public class ApproxPositionReleaseTest {
    private String js(MainActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().evaluateJavascript(script, value -> {
                result.set(value);
                done.countDown();
            }));
        assertTrue(done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void check(MainActivity activity, String expression) throws Exception {
        assertEquals(expression, "true", js(activity, expression));
    }

    private void reload(MainActivity activity) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            activity.getBridge().getWebView().reload());
    }

    private void capture(String name) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Bitmap screen = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(screen);
        File output = new File(instrumentation.getTargetContext().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream stream = new FileOutputStream(output)) {
            assertTrue(screen.compress(Bitmap.CompressFormat.PNG, 100, stream));
        } finally {
            screen.recycle();
        }
    }

    @Test public void approximatePositionHasNoRouteOrEta() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String originalLang = null;
        try {
            for (int i = 0; i < 45 && !"true".equals(js(activity,
                    "typeof openThreatPopup === 'function' && typeof etaHtml === 'function'")); i++) {
                Thread.sleep(1000);
            }
            originalLang = js(activity, "localStorage.getItem('straznik_lang')");
            for (String lang : new String[]{"pl", "en"}) {
                js(activity, "localStorage.setItem('straznik_lang','" + lang + "')");
                reload(activity);
                Thread.sleep(1500);
                for (int i = 0; i < 45 && !"true".equals(js(activity,
                        "typeof openThreatPopup === 'function' && UI.lang === '" + lang + "'")); i++) {
                    Thread.sleep(1000);
                }
                js(activity,
                    "document.querySelectorAll('dialog[open]').forEach(d=>d.close());"
                    + "document.getElementById('disclaimer-x')?.click();"
                    + "const t={id:'trk_00180686',type:'uav',lat:50.7472,lon:25.3254,"
                    + "positionQuality:'confirmed',confidenceLevel:'medium',uncertaintyKm:10,sourceCount:1,"
                    + "locality:'Луцьк',updatedAt:'2026-09-11T11:33:00+02:00',"
                    + "pl_assessment:{dist_km:91.8,toward_pl:true,heading_known:true,border_voiv:'lubelskie'},"
                    + "heading:317};"
                    + "openThreatPopup([t.lon,t.lat],{type:t.type,opis:threatDesc(t),confidence:t.confidenceLevel,"
                    + "uncertainty:t.uncertaintyKm,heading:t.heading,dist_km:t.pl_assessment.dist_km,"
                    + "distance_text:threatDistanceText(t,t.pl_assessment.dist_km),eta:etaHtml(t)});"
                    + "void 0");
                String expected = lang.equals("pl")
                    ? "środek miejscowości użyty jako punkt odniesienia"
                    : "locality centre used as a reference point";
                check(activity, "document.getElementById('ac-card').textContent.includes('" + expected + "')");
                check(activity, "!document.getElementById('ac-card').textContent.includes('~40 min')");
                check(activity, "!document.getElementById('ac-card').textContent.includes('91.8 km')");
                check(activity, "document.getElementById('ac-card').textContent.includes('90 km')");
                check(activity, "!document.querySelector('#ac-card .local-place-eta')");
                Thread.sleep(500);
                capture("approx-position-" + lang);
            }
        } finally {
            if (originalLang != null) {
                js(activity, "const savedLang=" + originalLang
                    + "; if(savedLang===null)localStorage.removeItem('straznik_lang');"
                    + "else localStorage.setItem('straznik_lang',savedLang)");
                reload(activity);
            }
        }
    }
}

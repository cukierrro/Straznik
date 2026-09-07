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
import static org.junit.Assert.*;

/** Local replay only. No signal ingestion, FCM messages or production writes. */
public class HistoryReleaseTest {
    private String js(MainActivity a, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            a.getBridge().getWebView().evaluateJavascript(script, value -> {
                result.set(value); done.countDown();
            }));
        assertTrue(done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void check(MainActivity a, String expression) throws Exception {
        assertEquals(expression, "true", js(a, expression));
    }
    private void capture(String name) throws Exception {
        Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        Bitmap screen = ins.getUiAutomation().takeScreenshot();
        assertNotNull(screen);
        File out = new File(ins.getTargetContext().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream stream = new FileOutputStream(out)) {
            assertTrue(screen.compress(Bitmap.CompressFormat.PNG, 100, stream));
        } finally { screen.recycle(); }
    }
    @Test public void historicalAircraftReplay() throws Exception {
        Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        MainActivity a = (MainActivity) ins.startActivitySync(new Intent(ins.getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String originalLang = null;
        try {
            for (int i=0;i<45 && !"true".equals(js(a,"typeof showHistoryAt === 'function' && typeof srvAdsbEvents !== 'undefined'"));i++) Thread.sleep(1000);
            check(a,"typeof showHistoryAt === 'function'");
            originalLang = js(a,"localStorage.getItem('straznik_lang')");
            // Keep fixture entirely in memory; runtime reload restores real data.
            js(a,"window.__replaySetup = () => {"
                + "standalone=false; histMode=true; document.body.classList.add('history-mode');"
                + "document.querySelectorAll('dialog[open]').forEach(d=>d.close());"
                + "document.getElementById('timebar').classList.remove('hidden');"
                + "srvSigs=[]; watchEvents=[]; watchSyncState='ok'; watchFetchAt=Date.now();"
                + "srvAdsbEvents=[{ts:'2026-09-07T17:54:18+02:00',kind:'enter',hex:'152c29',reg:'RA-76841',type:'IL76',lat:44.659098,lon:21.145265,alt:6700,gs:266.9,track:173.11},"
                + "{ts:'2026-09-07T17:55:20+02:00',kind:'exit',hex:'152c29',reg:'RA-76841',type:'IL76',lat:44.659098,lon:21.145265,alt:6700,gs:266.9,track:173.11}];"
                + "histTimes=['2026-09-07T17:52:01+02:00','2026-09-07T17:54:01+02:00','2026-09-07T17:56:01+02:00'];"
                + "srvSnaps=histTimes.map(ts=>({ts,t:Date.parse(ts),aircraft:[],threats:[]}));"
                + "timelinePoints=[]; const slider=document.getElementById('tb-slider'); slider.max='2'; slider.value='0';"
                + "adsbByHex.set('152c29',{hex:'152c29',callsign:'LIVE-ONLY',type:'IL76',lat:48,lon:25,foreign:true,alt:31000});"
                + "}; __replaySetup(); void 0");
            for (int idx : new int[]{0,1,2,1,0,2}) {
                js(a,"document.getElementById('tb-slider').value='"+idx+"'; showHistoryAt("+idx+"); fillWatch(); void 0");
                check(a, "historyAdsbByHex.has('152c29') === " + (idx==2));
                check(a,"!document.getElementById('watch-current').textContent.includes('LIVE-ONLY')");
                check(a,"document.getElementById('tb-info').textContent.includes('0 ')");
                if (idx<2) check(a,"!document.getElementById('watch-events').textContent.includes('RA-76841')");
                else check(a,"document.getElementById('watch-events').textContent.includes('RA-76841')");
            }
            js(a,"openPlanePopup([21.145265,44.659098],{hex:'152c29'}); void 0");
            check(a,"document.getElementById('ac-card').textContent.includes('RA-76841') && !document.getElementById('ac-card').textContent.includes('LIVE-ONLY')");
            check(a,"!document.querySelector('#ac-card .btn-follow')");
            // Queued drag must not restore history after the user presses LIVE.
            js(a,"scrubTo(0); exitHistory(); void 0");
            Thread.sleep(100);
            check(a,"!histMode && historyAdsbByHex.size===0 && historyAdsbTime===null");
            for (String lang : new String[]{"pl","en"}) {
                js(a,"localStorage.setItem('straznik_lang','"+lang+"'); location.reload(); void 0");
                Thread.sleep(3500);
                for(int i=0;i<45 && !"true".equals(js(a,"typeof mapReady !== 'undefined' && mapReady && srvSnaps.length > 0"));i++) Thread.sleep(1000);
                check(a,"UI.lang === '"+lang+"'");
                check(a,"mapReady && srvSnaps.length > 0");
                // Guide captures use real server snapshots after reload, NOT replay fixtures.
                js(a,"document.querySelectorAll('dialog[open]').forEach(d=>d.close()); watchFetchAt=Date.now(); toggleHistory().catch(e=>console.error('History capture: '+e)); map.jumpTo({center:[24,50],zoom:4.4}); void 0");
                for(int i=0;i<45 && !"true".equals(js(a,"histMode && historyAdsbTime !== null"));i++) Thread.sleep(1000);
                check(a,"histMode && historyAdsbTime !== null");
                js(a,"document.getElementById('disclaimer-x').click(); void 0");
                for(int i=0;i<45 && !"true".equals(js(a,"map.areTilesLoaded()"));i++) Thread.sleep(1000);
                check(a,"map.areTilesLoaded()");
                Thread.sleep(1000);
                capture("history-map-"+lang);
                js(a,"showWatch(); void 0");
                Thread.sleep(500);
                check(a,"document.getElementById('watch').open");
                capture("history-watch-"+lang);
            }
        } finally {
            if (originalLang != null) js(a,"const savedLang="+originalLang+"; if(savedLang===null)localStorage.removeItem('straznik_lang');else localStorage.setItem('straznik_lang',savedLang); location.reload(); void 0");
        }
    }
}

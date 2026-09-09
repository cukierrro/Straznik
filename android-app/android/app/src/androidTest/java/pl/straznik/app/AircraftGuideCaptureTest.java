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

/** Actual observed aircraft only. No fixtures, signal writes or notification APIs. */
public class AircraftGuideCaptureTest {
    private String js(MainActivity a, String code) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> r=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->a.getBridge().getWebView().evaluateJavascript(code,v->{r.set(v);done.countDown();}));
        assertTrue(done.await(10,TimeUnit.SECONDS)); return r.get();
    }
    private void waitFor(MainActivity a,String code,int seconds) throws Exception {
        for(int i=0;i<seconds && !"true".equals(js(a,code));i++) Thread.sleep(1000);
        assertEquals(code,"true",js(a,code));
    }
    @Test public void realAircraftCards() throws Exception {
        Instrumentation ins=InstrumentationRegistry.getInstrumentation();
        MainActivity a=(MainActivity)ins.startActivitySync(new Intent(ins.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String original=null;
        try {
            waitFor(a,"typeof openPlanePopup==='function'",40);
            original=js(a,"localStorage.getItem('straznik_lang')");
            for(String lang:new String[]{"pl","en"}) {
                js(a,"localStorage.setItem('straznik_lang','"+lang+"'); location.reload(); void 0");
                Thread.sleep(2500);
                waitFor(a,"typeof mapReady!=='undefined' && mapReady && typeof openPlanePopup==='function'",45);
                // Suppress foreground alert UI while photographing; no persistent setting changes.
                js(a,"histMode=true; document.querySelectorAll('dialog[open]').forEach(d=>d.close()); void 0");
                waitFor(a,"srvSnaps.length>0",45);
                js(a,"window.__guideSnapshot=srvSnaps.slice().reverse().find(s=>(s.aircraft||[]).some(p=>AircraftPhotos.select(p,AircraftPhotoCatalog))); void 0");
                assertEquals("No verified aircraft in actual available history","true",js(a,"!!window.__guideSnapshot"));
                js(a,"histMode=false; toggleHistory().catch(console.error); void 0");
                waitFor(a,"histMode && histTimes.length>0",30);
                js(a,"window.__guideIdx=histTimes.indexOf(__guideSnapshot.ts); void 0");
                assertEquals("true",js(a,"__guideIdx>=0"));
                js(a,"showHistoryAt(__guideIdx); document.getElementById('tb-slider').value=__guideIdx; void 0");
                waitFor(a,"historyAdsbByHex.size>0",20);
                js(a,"window.__guidePlane=[...historyAdsbByHex.values()].find(p=>AircraftPhotos.select(p,AircraftPhotoCatalog)); map.jumpTo({center:[__guidePlane.lon,__guidePlane.lat],zoom:5.5}); document.getElementById('disclaimer-x')?.click(); void 0");
                waitFor(a,"map.areTilesLoaded()",40);
                js(a,"openPlanePopup([__guidePlane.lon,__guidePlane.lat],__guidePlane); void 0");
                waitFor(a,"!!document.querySelector('#ac-card img')?.naturalWidth",15);
                Thread.sleep(1000);
                Bitmap bitmap=ins.getUiAutomation().takeScreenshot(); assertNotNull(bitmap);
                try(FileOutputStream out=new FileOutputStream(new File(ins.getTargetContext().getExternalFilesDir(null),"aircraft-"+lang+".png"))) {
                    assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));
                } finally {bitmap.recycle();}
                System.out.println("GUIDE "+lang+": "+js(a,"JSON.stringify({time:historyAdsbTime,aircraft:__guidePlane,photo:document.querySelector('#ac-card img').alt})"));
            }
        } finally {
            if(original!=null) js(a,"const saved="+original+"; if(saved===null)localStorage.removeItem('straznik_lang');else localStorage.setItem('straznik_lang',saved); location.reload(); void 0");
        }
    }
}

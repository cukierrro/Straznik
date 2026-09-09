package pl.straznik.app;

import android.app.Instrumentation;
import android.content.Intent;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Device-only photo tests. Never injects signals or invokes notification APIs. */
public class AircraftPhotoReleaseTest {
    private String js(MainActivity a, String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);
        AtomicReference<String> result=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->a.getBridge().getWebView().evaluateJavascript(script,v->{result.set(v);done.countDown();}));
        assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();
    }
    private void check(MainActivity a,String expression) throws Exception {assertEquals(expression,"true",js(a,expression));}
    @Test public void modelPhotosOnRelease() throws Exception {
        Instrumentation ins=InstrumentationRegistry.getInstrumentation();
        MainActivity a=(MainActivity)ins.startActivitySync(new Intent(ins.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            for(int i=0;i<30 && !"true".equals(js(a,"typeof openPlanePopup==='function' && !!window.AircraftPhotoCatalog"));i++)Thread.sleep(1000);
            check(a,"Object.keys(AircraftPhotoCatalog.photos).length===60");
            // All fixture changes stay in memory. History guard prevents live UI alerts during card tests.
            js(a,"histMode=true; document.querySelectorAll('dialog[open]').forEach(d=>d.close()); window.__photoCheck='pending'; Promise.all(Object.values(AircraftPhotoCatalog.photos).map(p=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);i.src=p.src;}))).then(r=>window.__photoCheck=r.every(Boolean)?'ok':'failed'); void 0");
            for(int i=0;i<30 && "\"pending\"".equals(js(a,"window.__photoCheck"));i++)Thread.sleep(500);
            assertEquals("\"ok\"",js(a,"window.__photoCheck"));
            check(a,"AircraftPhotos.select({type:'Z42',reg:'0543'},AircraftPhotoCatalog)===null");
            check(a,"AircraftPhotos.select({type:'Z42',reg:'0543',hex:'4984f4'},AircraftPhotoCatalog).model==='Zlín Z-242L'");
            js(a,"historyAdsbByHex.clear(); openPlanePopup([0,0],{type:'PZ3T',reg:'019',hex:'test-photo',callsign:'OFFLINE PHOTO TEST'}); void 0");
            for(int i=0;i<20 && !"true".equals(js(a,"!!document.querySelector('#ac-card img')?.naturalWidth"));i++)Thread.sleep(250);
            check(a,"document.querySelector('#ac-card img').getAttribute('src').startsWith('assets/aircraft/pz3t-')");
            check(a,"document.querySelector('#ac-card .ph-cr').textContent.includes('Ronnie Macdonald')");
            check(a,"document.querySelectorAll('#ac-card .ph-cr a').length===2");
            js(a,"openPlanePopup([0,0],{type:'H60',reg:'019',hex:'no-photo',callsign:'OFFLINE PHOTO TEST'}); void 0");
            Thread.sleep(200);
            check(a,"!document.querySelector('#ac-card img').getAttribute('src')");
            check(a,"AircraftPhotos.caption(AircraftPhotoCatalog.photos.PZ3T,'en').includes('Not the tracked aircraft')");
        } finally {js(a,"hideCard(); location.reload(); void 0");}
    }
}

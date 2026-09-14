package pl.straznik.offlinelab;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;

/** Offline diagnostic viewer; no connection to the installed production app. */
public final class MainActivity extends Activity {
    private WebView view;
    public final class Results {
        @JavascriptInterface public void report(String result) {
            Log.i("StraznikOfflineLab", result);
        }
        @JavascriptInterface public String readTestState(String key) {
            if (!"restart".equals(key) && !"phase".equals(key) && !"real-report".equals(key)) return "";
            return getSharedPreferences("offline-tests", MODE_PRIVATE).getString(key, "");
        }
        @JavascriptInterface public boolean writeTestState(String key, String value) {
            if ((!"restart".equals(key) && !"phase".equals(key) && !"real-report".equals(key)) || value == null || value.length() > 262144) return false;
            return getSharedPreferences("offline-tests", MODE_PRIVATE).edit().putString(key, value).commit();
        }
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setBlockNetworkLoads(true);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setAllowFileAccessFromFileURLs(false);
        view.getSettings().setAllowUniversalAccessFromFileURLs(false);
        view.addJavascriptInterface(new Results(), "OfflineResults");
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i("StraznikOfflineLab", "CONSOLE " + message.messageLevel() + " "
                    + message.sourceId() + ":" + message.lineNumber() + " " + message.message());
                return true;
            }
        });
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
                return true; // This single local screen never navigates elsewhere.
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView w, WebResourceRequest r) {
                if (r.getUrl().toString().startsWith("file:///android_asset/")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
        });
        setContentView(view);
        view.loadUrl("file:///android_asset/index.html");
    }
    @Override public void onDestroy() {
        view.removeJavascriptInterface("OfflineResults");
        view.destroy();
        super.onDestroy();
    }
}

package dev.tteles.gira;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewRenderProcess;
import android.webkit.WebViewRenderProcessClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
    );

    // Attach crash handler to Capacitor's WebView
    WebView webView = this.bridge.getWebView();
    if (webView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      webView.setWebViewRenderProcessClient(new WebViewRenderProcessClient() {
        @Override
        public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) {
          Log.w("CapacitorWebView", "⚠️ WebView became unresponsive.");
        }

        @Override
        public void onRenderProcessGone(WebView view, WebViewRenderProcess renderer) {
          Log.e("CapacitorWebView", "❌ WebView renderer crashed. Restarting activity…");

          // Destroy the crashed WebView to avoid fatal crash
          try {
            view.destroy();
          } catch (Exception e) {
            Log.e("CapacitorWebView", "Error while destroying WebView", e);
          }

          // Restart activity to reload the WebView cleanly
          recreate();
        }
      });

      // Log the current WebView package + version
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        try {
          String webViewVersion = WebView.getCurrentWebViewPackage().versionName;
          Log.i("CapacitorWebView", "Using WebView version: " + webViewVersion);
        } catch (Exception e) {
          Log.w("CapacitorWebView", "Could not get WebView version", e);
        }
      }
    }
  }
}

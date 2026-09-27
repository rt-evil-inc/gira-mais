package dev.tteles.gira;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.lifecycle.Lifecycle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

  private static final String TAG = "MainActivity";

  // Set when the WebView's renderer died while the activity was out of sight;
  // the activity is rebuilt once it's back in front
  private boolean webViewLost = false;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Keep your system UI flags
    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
    );

    // Attach a custom WebViewClient to handle renderer crashes
    bridge.getWebView().setWebViewClient(new RendererRecoveryClient());
  }

  @Override
  public void onResume() {
    super.onResume();
    if (webViewLost) {
      webViewLost = false;
      recreate();
    }
  }

  private class RendererRecoveryClient extends BridgeWebViewClient {
    RendererRecoveryClient() {
      super(bridge);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
      // The system kills the renderer to reclaim memory, mostly while the app
      // is in the background, and it can also crash. Either way this WebView
      // can't be used again and must be destroyed (returning true keeps the
      // app alive); rebuilding the activity loads the app into a fresh one.
      // In the background that waits until the user comes back, so a page
      // loaded under memory pressure isn't killed straight away again
      Log.w(TAG, "WebView renderer gone (crashed: " + detail.didCrash() + ")");
      ViewGroup parent = (ViewGroup) view.getParent();
      if (parent != null) parent.removeView(view);
      view.destroy();

      if (getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
        recreate();
      } else {
        webViewLost = true;
      }
      return true;
    }
  }
}

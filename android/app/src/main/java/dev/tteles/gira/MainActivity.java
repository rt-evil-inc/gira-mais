package dev.tteles.gira;

import android.os.Bundle;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Keep your system UI flags
    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
    );

    // Attach a custom WebViewClient to handle renderer crashes
    bridge.getWebView().setWebViewClient(new CustomWebViewClient(bridge));
  }

  private static class CustomWebViewClient extends BridgeWebViewClient {
    public CustomWebViewClient(com.getcapacitor.Bridge bridge) {
      super(bridge);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
      // Handle WebView renderer crash gracefully
      if (!detail.didCrash()) {
        // The renderer was killed to reclaim memory
        view.destroy();
        return true; // prevent app from crashing
      }

      // Renderer crashed — destroy and maybe reload
      view.destroy();

      // Restart the app’s activity:
      view.post(() -> {
        android.content.Intent intent = new android.content.Intent(view.getContext(), MainActivity.class);
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK);
        view.getContext().startActivity(intent);
      });

      return true;
    }
  }
}

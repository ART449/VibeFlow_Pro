package com.iartlabs.byflow;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final String EXTRA_START_PATH = "com.iartlabs.byflow.EXTRA_START_PATH";
    public static final String EXTRA_TARGET_VIEW = "com.iartlabs.byflow.EXTRA_TARGET_VIEW";

    public static Intent createLaunchIntent(Context context, String startPath, String targetView) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra(EXTRA_START_PATH, startPath);
        intent.putExtra(EXTRA_TARGET_VIEW, targetView);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fix Google OAuth 403 disallowed_useragent:
        // Override WebView user-agent to look like real Chrome,
        // and intercept Google auth URLs to open in Chrome Custom Tabs
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            String defaultUA = settings.getUserAgentString();
            // Remove "wv" flag that Google uses to detect WebView
            String cleanUA = defaultUA.replace("; wv)", ")");
            settings.setUserAgentString(cleanUA);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    String host = url != null ? url.getHost() : "";
                    // Open Google auth in Chrome Custom Tabs instead of WebView
                    if (host != null && (host.contains("accounts.google.com")
                            || host.contains("googleapis.com/identitytoolkit"))) {
                        CustomTabsIntent customTab = new CustomTabsIntent.Builder().build();
                        customTab.launchUrl(MainActivity.this, url);
                        return true;
                    }
                    return false;
                }
            });
        }

        loadLaunchRouteIfNeeded(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadLaunchRouteIfNeeded(intent);
    }

    private void loadLaunchRouteIfNeeded(Intent intent) {
        if (intent == null || getBridge() == null) {
            return;
        }

        String startPath = intent.getStringExtra(EXTRA_START_PATH);
        if (startPath == null || startPath.trim().isEmpty()) {
            return;
        }

        String startUrl = resolveStartUrl(startPath);
        if (startUrl == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        final String targetView = intent.getStringExtra(EXTRA_TARGET_VIEW);
        webView.post(() -> {
            String currentUrl = webView.getUrl();
            if (currentUrl == null || !currentUrl.equals(startUrl)) {
                webView.loadUrl(startUrl);
            }

            if (targetView != null && !targetView.trim().isEmpty()) {
                webView.postDelayed(() -> applyTargetView(webView, targetView), 1200);
            }
        });
    }

    private String resolveStartUrl(String startPath) {
        if (getBridge() == null) {
            return null;
        }

        String baseUrl = getBridge().getAppUrl();
        if (baseUrl == null || baseUrl.trim().isEmpty()) {
            return null;
        }

        if (startPath.startsWith("http://") || startPath.startsWith("https://")) {
            return startPath;
        }

        String normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        String normalizedPath = startPath.startsWith("/") ? startPath.substring(1) : startPath;
        return normalizedBase + normalizedPath;
    }

    private void applyTargetView(WebView webView, String targetView) {
        String escapedView = targetView.replace("\\", "\\\\").replace("'", "\\'");
        String script =
            "(function(){" +
            "try{" +
            "var view='" + escapedView + "';" +
            "if(window.showViewDirect){window.showViewDirect(view);}" +
            "var navs=Array.from(document.querySelectorAll('.nav')); " +
            "navs.forEach(function(nav){nav.classList.remove('active');});" +
            "var match=navs.find(function(nav){var handler=nav.getAttribute('onclick')||''; return handler.indexOf(\"showView('\"+view+\"'\")!==-1;});" +
            "if(match){match.classList.add('active');}" +
            "if(view==='comandas' && window.loadComandas){window.loadComandas();}" +
            "if(view==='cocina' && window.loadCocina){window.loadCocina();}" +
            "if(view==='inventario' && window.loadInventory){window.loadInventory();}" +
            "if(view==='corte' && window.loadCorte){window.loadCorte();}" +
            "}catch(e){console.warn('ByFlow native view handoff failed', e);}" +
            "})();";
        webView.evaluateJavascript(script, null);
    }
}

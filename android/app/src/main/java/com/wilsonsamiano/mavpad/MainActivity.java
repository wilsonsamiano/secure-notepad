package com.wilsonsamiano.mavpad;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new Bridge(), "MavPadAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {}
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER);
                } catch (Exception e) {
                    uploadCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER) {
            if (uploadCallback != null) {
                uploadCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                uploadCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private static String safeName(String name, String fallback) {
        String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return safe.isEmpty() ? fallback : safe;
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".txt")) return "text/plain";
        if (n.endsWith(".ics")) return "text/calendar";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    /** Hand a file to the Android share sheet (Save to Files, Drive, email, ...). */
    private void shareFile(String safe, byte[] bytes, String mime, String title) {
        try {
            File dir = new File(getCacheDir(), "share");
            if (!dir.mkdirs() && !dir.isDirectory()) return;
            File out = new File(dir, safe);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(this, "com.wilsonsamiano.mavpad.fileprovider", out);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, safe);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, title));
        } catch (Exception ignored) {}
    }

    /** Save a picture to Pictures/MavPad (Android 10+, no permission needed). */
    private void saveToGallery(String name, byte[] bytes, String mime) throws Exception {
        ContentResolver resolver = getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, mime);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/MavPad");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
        if (uri == null) throw new Exception("insert failed");
        try (OutputStream os = resolver.openOutputStream(uri)) {
            if (os == null) throw new Exception("no stream");
            os.write(bytes);
        } catch (Exception e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
    }

    private class Bridge {
        /** Backups (.json) and exports (.txt, .ics). Keeps the file's own extension and type. */
        @JavascriptInterface
        public void saveTextFile(String filename, String contents) {
            String safe = safeName(filename, "mavpad-backup.json");
            String mime = mimeFor(safe);
            String title = safe.endsWith(".json") ? "Save encrypted backup" : "Save export";
            byte[] bytes = contents == null ? new byte[0] : contents.getBytes(StandardCharsets.UTF_8);
            runOnUiThread(() -> shareFile(safe, bytes, mime, title));
        }

        /** Photo download. Returns "saved" (in Pictures/MavPad), "shared" (share sheet on Android 9 and older) or "error". */
        @JavascriptInterface
        public String saveImage(String filename, String base64, String mime) {
            try {
                String safe = safeName(filename, "mavpad-photo.jpg");
                String type = mime != null && mime.startsWith("image/") ? mime : mimeFor(safe);
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    saveToGallery(safe, bytes, type);
                    return "saved";
                }
                runOnUiThread(() -> shareFile(safe, bytes, type, "Save photo"));
                return "shared";
            } catch (Exception e) {
                return "error";
            }
        }
    }
}

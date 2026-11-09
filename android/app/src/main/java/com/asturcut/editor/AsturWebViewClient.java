package com.asturcut.editor;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Entrega os arquivos de mídia do app em https://localhost/_astur_media/?p=... com suporte a Range. */
public class AsturWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;

    public AsturWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri u = request.getUrl();
        if ("localhost".equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/_astur_media/")) {
            return serve(request);
        }
        return super.shouldInterceptRequest(view, request);
    }

    static String mimeFor(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        String ext = n.contains(".") ? n.substring(n.lastIndexOf('.') + 1) : "";
        switch (ext) {
            case "mp4": case "m4v": return "video/mp4";
            case "mov": return "video/quicktime";
            case "webm": return "video/webm";
            case "mkv": return "video/x-matroska";
            case "3gp": return "video/3gpp";
            case "mp3": return "audio/mpeg";
            case "wav": return "audio/wav";
            case "m4a": return "audio/mp4";
            case "aac": return "audio/aac";
            case "ogg": case "opus": return "audio/ogg";
            case "flac": return "audio/flac";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "heic": return "image/heic";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "astur": case "json": return "application/json";
            default: return "application/octet-stream";
        }
    }

    private WebResourceResponse error(int code, String reason) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", code, reason, h, new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse serve(WebResourceRequest request) {
        try {
            String p = request.getUrl().getQueryParameter("p");
            if (p == null) return error(400, "Bad Request");
            File f = new File(p);
            String base = bridge.getContext().getFilesDir().getCanonicalPath();
            if (!f.getCanonicalPath().startsWith(base + File.separator) || !f.isFile()) return error(404, "Not Found");
            long size = f.length();
            String mime = mimeFor(f.getName());
            Map<String, String> h = new HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Cache-Control", "no-cache");
            String range = null;
            for (Map.Entry<String, String> e : request.getRequestHeaders().entrySet()) {
                if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            }
            if (range != null && range.startsWith("bytes=")) {
                String[] r = range.substring(6).split("-", 2);
                long a = r[0].trim().isEmpty() ? 0 : Long.parseLong(r[0].trim());
                long b = (r.length > 1 && !r[1].trim().isEmpty()) ? Long.parseLong(r[1].trim()) : size - 1;
                if (b >= size) b = size - 1;
                if (a > b || a >= size) {
                    h.put("Content-Range", "bytes */" + size);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new ByteArrayInputStream(new byte[0]));
                }
                InputStream in = new FileInputStream(f);
                long skipped = 0;
                while (skipped < a) {
                    long s = in.skip(a - skipped);
                    if (s <= 0) break;
                    skipped += s;
                }
                long len = b - a + 1;
                h.put("Content-Range", "bytes " + a + "-" + b + "/" + size);
                h.put("Content-Length", String.valueOf(len));
                return new WebResourceResponse(mime, null, 206, "Partial Content", h, new Limited(in, len));
            }
            h.put("Content-Length", String.valueOf(size));
            return new WebResourceResponse(mime, null, 200, "OK", h, new FileInputStream(f));
        } catch (IOException | RuntimeException e) {
            return error(500, "Error");
        }
    }

    /** Lê no máximo "left" bytes. */
    static class Limited extends FilterInputStream {
        private long left;
        Limited(InputStream in, long left) { super(in); this.left = left; }
        @Override public int read() throws IOException {
            if (left <= 0) return -1;
            int c = super.read();
            if (c >= 0) left--;
            return c;
        }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(b, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }
        @Override public int available() throws IOException { return (int) Math.min(super.available(), left); }
    }
}

package com.asturcut.editor;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Ponte nativa do AsturCut: importar mídias, salvar projetos, salvar vídeos na galeria e compartilhar. */
@CapacitorPlugin(name = "AsturNative")
public class AsturNativePlugin extends Plugin {

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, Save> saves = new HashMap<>();

    private static class Save {
        Uri uri;
        File file;
        OutputStream out;
    }

    private File dir(String name) {
        File d = new File(getContext().getFilesDir(), name);
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safe(String name) {
        String s = name == null ? "arquivo" : name.replaceAll("[\\\\/:*?\"<>|\\n\\r]", "-").trim();
        if (s.isEmpty()) s = "arquivo";
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    private boolean insideApp(File f) {
        try {
            return f.getCanonicalPath().startsWith(getContext().getFilesDir().getCanonicalPath() + File.separator);
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", pi.versionName);
        } catch (Exception e) {
            r.put("version", "0");
        }
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("model", Build.MODEL);
        r.put("documents", dir("projects").getAbsolutePath());
        r.put("videos", Environment.DIRECTORY_MOVIES + "/AsturCut");
        r.put("userData", getContext().getFilesDir().getAbsolutePath());
        call.resolve(r);
    }

    // ---------- importar mídia (copia para dentro do app, para o projeto continuar funcionando depois) ----------
    @PluginMethod
    public void pickMedia(PluginCall call) {
        boolean font = "font".equals(call.getString("kind", "media"));
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        String[] types = font
            ? new String[] { "font/*", "application/x-font-ttf", "application/x-font-otf", "application/font-sfnt", "application/vnd.ms-opentype", "application/octet-stream" }
            : new String[] { "video/*", "image/*", "audio/*" };
        i.putExtra(Intent.EXTRA_MIME_TYPES, types);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            JSObject r = new JSObject();
            r.put("files", new JSArray());
            call.resolve(r);
            return;
        }
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int k = 0; k < data.getClipData().getItemCount(); k++) uris.add(data.getClipData().getItemAt(k).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        final File target = dir("font".equals(call.getString("kind", "media")) ? "fonts" : "media");
        JSObject ev = new JSObject();
        ev.put("count", uris.size());
        notifyListeners("importStart", ev);
        io.execute(() -> {
            try {
                ContentResolver cr = getContext().getContentResolver();
                JSArray files = new JSArray();
                int n = 0;
                for (Uri u : uris) {
                    String name = "arquivo";
                    try (Cursor c = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                        if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
                    } catch (Exception ignored) {}
                    if (!name.contains(".")) {
                        String type = cr.getType(u);
                        if (type != null && type.contains("/")) name += "." + type.substring(type.indexOf('/') + 1).replace("quicktime", "mov").replace("mpeg", "mp3").replace("jpeg", "jpg");
                    }
                    File out = new File(target, System.currentTimeMillis() + "_" + (n++) + "_" + safe(name));
                    long size = 0;
                    try (InputStream in = cr.openInputStream(u); OutputStream os = new FileOutputStream(out)) {
                        if (in == null) continue;
                        byte[] buf = new byte[256 * 1024];
                        int r;
                        while ((r = in.read(buf)) > 0) {
                            os.write(buf, 0, r);
                            size += r;
                        }
                    }
                    JSObject f = new JSObject();
                    f.put("path", out.getAbsolutePath());
                    f.put("name", name);
                    f.put("size", size);
                    f.put("ext", name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "");
                    files.put(f);
                }
                JSObject r = new JSObject();
                r.put("files", files);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não foi possível importar: " + e.getMessage());
            }
        });
    }

    // ---------- projetos ----------
    @PluginMethod
    public void saveProject(PluginCall call) {
        try {
            String path = call.getString("path");
            File f = path != null ? new File(path) : null;
            if (f == null || !insideApp(f)) {
                String base = safe(call.getString("name", "Projeto"));
                f = new File(dir("projects"), base + ".astur");
                for (int k = 2; f.exists(); k++) f = new File(dir("projects"), base + " (" + k + ").astur");
            }
            try (OutputStream os = new FileOutputStream(f)) {
                os.write(call.getString("data", "{}").getBytes(StandardCharsets.UTF_8));
            }
            JSObject r = new JSObject();
            r.put("path", f.getAbsolutePath());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível salvar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readText(PluginCall call) {
        try {
            File f = new File(call.getString("path", ""));
            if (!insideApp(f) || !f.isFile()) {
                call.reject("Arquivo não encontrado");
                return;
            }
            byte[] b = new byte[(int) f.length()];
            try (InputStream in = new FileInputStream(f)) {
                int off = 0, r;
                while (off < b.length && (r = in.read(b, off, b.length - off)) > 0) off += r;
            }
            JSObject r = new JSObject();
            r.put("text", new String(b, StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    // ---------- salvar vídeo na galeria (Filmes/AsturCut), em pedaços ----------
    @PluginMethod
    public void startSave(PluginCall call) {
        try {
            String name = safe(call.getString("name", "video.mp4"));
            if ("app".equals(call.getString("target", "gallery"))) {
                // arquivo dentro do app (ex.: narração gravada) — vira mídia do projeto
                File f = new File(dir("media"), System.currentTimeMillis() + "_0_" + name);
                Save s = new Save();
                s.file = f;
                s.out = new FileOutputStream(f);
                String id = UUID.randomUUID().toString();
                saves.put(id, s);
                JSObject r = new JSObject();
                r.put("id", id);
                call.resolve(r);
                return;
            }
            String mime = call.getString("mime", "video/mp4");
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            boolean isImage = mime.startsWith("image/"), isVideo = mime.startsWith("video/");
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, (isImage ? Environment.DIRECTORY_PICTURES : isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS) + "/AsturCut");
            cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
            ContentResolver cr = getContext().getContentResolver();
            Uri coll = isImage ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : isVideo ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri uri = cr.insert(coll, cv);
            if (uri == null) throw new Exception("MediaStore");
            Save s = new Save();
            s.uri = uri;
            s.out = cr.openOutputStream(uri);
            String id = UUID.randomUUID().toString();
            saves.put(id, s);
            JSObject r = new JSObject();
            r.put("id", id);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível salvar na galeria: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        Save s = saves.get(call.getString("id", ""));
        if (s == null) {
            call.reject("Gravação não encontrada");
            return;
        }
        try {
            s.out.write(Base64.decode(call.getString("data", ""), Base64.NO_WRAP));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void finishSave(PluginCall call) {
        Save s = saves.remove(call.getString("id", ""));
        if (s == null) {
            call.reject("Gravação não encontrada");
            return;
        }
        try {
            s.out.close();
            if (s.file != null) {
                JSObject r = new JSObject();
                r.put("uri", s.file.getAbsolutePath());
                call.resolve(r);
                return;
            }
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContext().getContentResolver().update(s.uri, cv, null, null);
            JSObject r = new JSObject();
            r.put("uri", s.uri.toString());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void cancelSave(PluginCall call) {
        Save s = saves.remove(call.getString("id", ""));
        if (s != null) {
            try { s.out.close(); } catch (Exception ignored) {}
            if (s.file != null) s.file.delete();
            else try { getContext().getContentResolver().delete(s.uri, null, null); } catch (Exception ignored) {}
        }
        call.resolve();
    }

    // ---------- compartilhar / abrir ----------
    private Uri uriFor(String path) {
        if (path.startsWith("content://")) return Uri.parse(path);
        File f = new File(path);
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
    }

    private String typeFor(String path, Uri u) {
        String t = getContext().getContentResolver().getType(u);
        return t != null ? t : AsturWebViewClient.mimeFor(path);
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            String path = call.getString("path", "");
            Uri u = uriFor(path);
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(typeFor(path, u));
            i.putExtra(Intent.EXTRA_STREAM, u);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(i, "AsturCut").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        try {
            String path = call.getString("path", "");
            Uri u = uriFor(path);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, typeFor(path, u));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("URL inválida");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}

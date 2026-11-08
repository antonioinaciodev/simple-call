package dev.antonioinacio.simplecall;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Atualização de dentro do app: o site mostra "Atualização disponível" e, no clique, o app baixa o
 * APK da Release do GitHub, confere o hash e abre o instalador do Android (que pede confirmação).
 * O site só diz qual versão; o endereço e o hash do APK vêm direto do GitHub.
 * O site chama isto pelo nome "AppUpdate".
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String RELEASES = "https://api.github.com/repos/antonioinaciodev/simple-call/releases/tags/v";
    private static final String ASSET = "SimpleCall-Android.apk";
    private static final Pattern VERSION = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean busy = false;

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            JSObject out = new JSObject();
            out.put("version", info.versionName);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("sem versão");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String version = call.getString("version", "");
        if (version == null || !VERSION.matcher(version).matches()) {
            call.reject("versão inválida");
            return;
        }
        Context ctx = getContext();
        // Android 8+: instalar APK precisa da permissão "instalar apps desconhecidos" pro Simple
        // Call. Sem ela, abre a tela do sistema pra ligar; a pessoa volta e toca de novo.
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(settings);
            JSObject out = new JSObject();
            out.put("status", "permission");
            call.resolve(out);
            return;
        }
        if (busy) {
            call.reject("já está baixando");
            return;
        }
        busy = true;
        io.execute(() -> {
            try {
                JSONObject release = new JSONObject(readText(RELEASES + version));
                JSONArray assets = release.getJSONArray("assets");
                String url = null;
                String digest = "";
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    if (ASSET.equals(a.optString("name"))) {
                        url = a.getString("browser_download_url");
                        digest = a.optString("digest", "");
                    }
                }
                if (url == null) throw new IOException("sem APK nessa versão");

                File dir = new File(ctx.getCacheDir(), "update");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("sem espaço");
                File apk = new File(dir, "SimpleCall.apk");
                String sha256 = download(url, apk);
                // O GitHub publica o hash de cada arquivo da Release: confere antes de instalar.
                if (!digest.isEmpty() && !digest.equals("sha256:" + sha256)) {
                    //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                    throw new IOException("o arquivo baixado não confere");
                }

                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getBridge().executeOnMainThread(() -> ctx.startActivity(install));
                JSObject out = new JSObject();
                out.put("status", "installing");
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "falhou" : e.getMessage());
            } finally {
                busy = false;
            }
        });
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("User-Agent", "SimpleCall-Android");
        conn.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream");
        int code = conn.getResponseCode();
        if (code != 200) throw new IOException("GitHub respondeu " + code);
        return conn;
    }

    private static String readText(String url) throws IOException {
        HttpURLConnection conn = open(url);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } finally {
            conn.disconnect();
        }
    }

    // Baixa avisando o site do progresso (0 a 100) e devolve o SHA-256 do arquivo.
    private String download(String url, File file) throws Exception {
        HttpURLConnection conn = open(url);
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        long total = conn.getContentLengthLong();
        long got = 0;
        int last = -1;
        try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                sha.update(buf, 0, n);
                got += n;
                int pct = total > 0 ? (int) (got * 100 / total) : 0;
                if (pct != last) {
                    last = pct;
                    JSObject ev = new JSObject();
                    ev.put("percent", pct);
                    notifyListeners("progress", ev);
                }
            }
        } finally {
            conn.disconnect();
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : sha.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}

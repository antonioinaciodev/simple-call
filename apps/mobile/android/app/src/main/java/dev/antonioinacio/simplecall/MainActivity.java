package dev.antonioinacio.simplecall;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://simplecall.antonioinaciodev.workers.dev";
    private static final Pattern CODE = Pattern.compile("^[a-z]{3}-[a-z]{4}-[a-z]{3}$");
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins do próprio app precisam ser registrados antes do super.onCreate.
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Tela cheia de verdade (o site esconde as barras pelo plugin SystemBars):
        // puxar da borda mostra as barras só por um instante, e a imagem pode ocupar
        // o espaço do entalhe da câmera (o site deixa os botões fora dele).
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }
    }

    // Link de convite: o https://.../abc-defg-hij ou https://.../sala/galera (App Links, sem
    // perguntar nada) ou o simplecall://... do botão "Abrir no app" do site. Chega aqui tanto com o app
    // fechado (o Capacitor repassa o intent de abertura) quanto com ele já aberto.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String room = intent == null ? null : roomPath(intent.getData());
        if (room == null || bridge == null) return;
        WebView webView = bridge.getWebView();
        String target = SITE + "/" + room;
        // Já está nessa call: só traz o app pra frente.
        if (target.equals(webView.getUrl())) return;
        webView.post(() -> webView.loadUrl(target));
    }

    // Caminho da sala no site: "abc-defg-hij" (call rápida) ou "sala/galera" (sala fixa).
    private static String roomPath(Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme();
        List<String> parts = new ArrayList<>();
        if ("simplecall".equals(scheme)) {
            // simplecall://abc-defg-hij, simplecall://call/abc-defg-hij ou simplecall://sala/galera:
            // o primeiro pedaço chega como "host".
            if (uri.getHost() != null) parts.add(uri.getHost());
            parts.addAll(uri.getPathSegments());
        } else if ("https".equals(scheme) && Uri.parse(SITE).getHost().equals(uri.getHost())) {
            parts.addAll(uri.getPathSegments());
        } else {
            return null;
        }
        if (parts.isEmpty()) return null;
        String last = parts.get(parts.size() - 1).toLowerCase();
        if (parts.size() >= 2 && "sala".equalsIgnoreCase(parts.get(parts.size() - 2)) && SLUG.matcher(last).matches()) {
            return "sala/" + last;
        }
        return CODE.matcher(last).matches() ? last : null;
    }
}

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

import java.util.List;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://simplecall.antonioinaciodev.workers.dev";
    private static final Pattern CODE = Pattern.compile("^[a-z]{3}-[a-z]{4}-[a-z]{3}$");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins do próprio app precisam ser registrados antes do super.onCreate.
        registerPlugin(CallAudioPlugin.class);
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

    // Link de convite: o https://.../abc-defg-hij (App Links, sem perguntar nada) ou o
    // simplecall://abc-defg-hij do botão "Abrir no app" do site. Chega aqui tanto com o app
    // fechado (o Capacitor repassa o intent de abertura) quanto com ele já aberto.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String code = intent == null ? null : roomCode(intent.getData());
        if (code == null || bridge == null) return;
        WebView webView = bridge.getWebView();
        String target = SITE + "/" + code;
        // Já está nessa call: só traz o app pra frente.
        if (target.equals(webView.getUrl())) return;
        webView.post(() -> webView.loadUrl(target));
    }

    private static String roomCode(Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme();
        String code;
        if ("simplecall".equals(scheme)) {
            // simplecall://abc-defg-hij ou simplecall://call/abc-defg-hij
            List<String> path = uri.getPathSegments();
            code = path.isEmpty() ? uri.getHost() : path.get(path.size() - 1);
        } else if ("https".equals(scheme) && Uri.parse(SITE).getHost().equals(uri.getHost())) {
            code = uri.getLastPathSegment();
        } else {
            return null;
        }
        if (code == null) return null;
        code = code.toLowerCase();
        return CODE.matcher(code).matches() ? code : null;
    }
}

package dev.antonioinacio.simplecall;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins do próprio app precisam ser registrados antes do super.onCreate.
        registerPlugin(CallAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

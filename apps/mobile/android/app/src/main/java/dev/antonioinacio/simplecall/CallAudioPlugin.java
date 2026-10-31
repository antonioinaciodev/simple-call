package dev.antonioinacio.simplecall;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Saída de áudio da call (alto-falante, ouvido ou fone) e serviço que mantém
 * a call viva com o app em segundo plano. O site chama isto pelo nome "CallAudio".
 */
@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {

    private AudioManager audio;
    private final Handler main = new Handler(Looper.getMainLooper());
    // O que a pessoa escolheu; reaplicado se o WebView trocar a rota sozinho.
    private String wanted = null;
    private boolean inCall = false;
    private int modeBefore = AudioManager.MODE_NORMAL;
    private long lastReapply = 0;

    private final AudioDeviceCallback deviceCallback = new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
            changed();
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
            changed();
        }
    };

    private AudioManager.OnCommunicationDeviceChangedListener commListener;

    @Override
    public void load() {
        audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        audio.registerAudioDeviceCallback(deviceCallback, main);
        if (Build.VERSION.SDK_INT >= 31) {
            commListener = device -> {
                if (!inCall || wanted == null || wanted.equals(current()) || find(wanted) == null) return;
                // Não briga com o sistema: no máximo uma correção por segundo.
                long now = System.currentTimeMillis();
                if (now - lastReapply < 1000) return;
                lastReapply = now;
                apply(wanted);
            };
            audio.addOnCommunicationDeviceChangedListener(ContextCompat.getMainExecutor(getContext()), commListener);
        }
    }

    @Override
    protected void handleOnDestroy() {
        audio.unregisterAudioDeviceCallback(deviceCallback);
        if (Build.VERSION.SDK_INT >= 31 && commListener != null) audio.removeOnCommunicationDeviceChangedListener(commListener);
        stopService();
    }

    private void changed() {
        // Fone tirado: volta pro padrão em vez de ficar sem som.
        if ("headset".equals(wanted) && find("headset") == null) wanted = null;
        notifyListeners("outputsChanged", new JSObject());
    }

    // ---------- métodos chamados pelo site ----------

    @PluginMethod
    public void getOutputs(PluginCall call) {
        JSArray list = new JSArray();
        list.put(output("speaker", "Alto-falante"));
        if (hasEarpiece()) list.put(output("earpiece", "Ouvido (como numa ligação)"));
        String headset = headsetName();
        if (headset != null) list.put(output("headset", headset));
        JSObject ret = new JSObject();
        ret.put("outputs", list);
        ret.put("current", current());
        call.resolve(ret);
    }

    @PluginMethod
    public void setOutput(PluginCall call) {
        String id = call.getString("id");
        if (id == null || !(id.equals("speaker") || id.equals("earpiece") || id.equals("headset"))) {
            call.reject("Saída desconhecida");
            return;
        }
        wanted = id;
        if (!apply(id)) {
            call.reject("Saída indisponível");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void startCall(PluginCall call) {
        if (!inCall) {
            inCall = true;
            modeBefore = audio.getMode();
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            try {
                ContextCompat.startForegroundService(getContext(), new Intent(getContext(), CallService.class));
            } catch (Exception e) {
                // Sem o serviço a call funciona igual, só pode parar em segundo plano.
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void endCall(PluginCall call) {
        if (inCall) {
            inCall = false;
            if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
            else {
                audio.setSpeakerphoneOn(false);
                stopSco();
            }
            audio.setMode(modeBefore);
            stopService();
        }
        call.resolve();
    }

    // ---------- rotas ----------

    private boolean apply(String id) {
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo device = find(id);
            return device != null && audio.setCommunicationDevice(device);
        }
        // Android 7 a 11: API antiga de viva-voz e Bluetooth SCO.
        switch (id) {
            case "speaker":
                stopSco();
                audio.setSpeakerphoneOn(true);
                return true;
            case "earpiece":
                stopSco();
                audio.setSpeakerphoneOn(false);
                return hasEarpiece();
            default:
                audio.setSpeakerphoneOn(false);
                if (!audio.isWiredHeadsetOn() && hasBluetooth()) {
                    audio.startBluetoothSco();
                    audio.setBluetoothScoOn(true);
                }
                return headsetName() != null;
        }
    }

    private void stopSco() {
        if (audio.isBluetoothScoOn()) {
            audio.setBluetoothScoOn(false);
            audio.stopBluetoothSco();
        }
    }

    private String current() {
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo d = audio.getCommunicationDevice();
            return d == null ? null : kind(d.getType());
        }
        if (audio.isSpeakerphoneOn()) return "speaker";
        if (headsetName() != null) return "headset";
        return hasEarpiece() ? "earpiece" : "speaker";
    }

    private AudioDeviceInfo find(String id) {
        if (Build.VERSION.SDK_INT < 31) return null;
        List<AudioDeviceInfo> devices = audio.getAvailableCommunicationDevices();
        for (AudioDeviceInfo d : devices) {
            if (id.equals(kind(d.getType()))) return d;
        }
        return null;
    }

    private static String kind(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "speaker";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
                return "earpiece";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_HEARING_AID:
                return "headset";
            default:
                return null;
        }
    }

    private boolean hasEarpiece() {
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return true;
        }
        return false;
    }

    private boolean hasBluetooth() {
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
        }
        return false;
    }

    // Nome do fone conectado (com fio ou Bluetooth), ou null se não tiver nenhum.
    private String headsetName() {
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            switch (d.getType()) {
                case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                case AudioDeviceInfo.TYPE_USB_HEADSET:
                    return "Fone com fio";
                case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                case AudioDeviceInfo.TYPE_BLE_HEADSET: {
                    CharSequence name = d.getProductName();
                    return name == null || name.length() == 0 ? "Fone Bluetooth" : "Fone Bluetooth (" + name + ")";
                }
                default:
                    break;
            }
        }
        return null;
    }

    private static JSObject output(String id, String label) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("label", label);
        return o;
    }

    private void stopService() {
        getContext().stopService(new Intent(getContext(), CallService.class));
    }
}

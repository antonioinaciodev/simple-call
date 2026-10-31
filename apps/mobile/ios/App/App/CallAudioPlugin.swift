import AVFoundation
import Capacitor
import UIKit

// Saída de áudio da call (alto-falante, ouvido ou fone). O site chama isto pelo nome "CallAudio".
// O áudio da call toca no WebView, que usa a mesma sessão de áudio do app, então dá pra
// redirecionar o som daqui.
@objc(CallAudioPlugin)
public class CallAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallAudioPlugin"
    public let jsName = "CallAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getOutputs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise)
    ]

    private let session = AVAudioSession.sharedInstance()
    // O que a pessoa escolheu; reaplicado quando a rota muda (WebView reconfigurou o áudio).
    private var wanted: String?
    private var inCall = false

    @objc override public func load() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(routeChanged), name: AVAudioSession.routeChangeNotification, object: nil)
    }

    @objc private func routeChanged(_ note: Notification) {
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt)
            .flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
        // Fone tirado: volta pro padrão em vez de ficar sem som.
        if reason == .oldDeviceUnavailable, wanted == "headset" { wanted = nil }
        if reason == .categoryChange, inCall, let id = wanted { _ = try? apply(id) }
        notifyListeners("outputsChanged", data: [:])
    }

    private var hasEarpiece: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    private func headsetPort() -> AVAudioSessionPortDescription? {
        let kinds: [AVAudioSession.Port] = [.headphones, .headsetMic, .bluetoothHFP, .bluetoothA2DP, .bluetoothLE, .usbAudio]
        if let out = session.currentRoute.outputs.first(where: { kinds.contains($0.portType) }) { return out }
        return session.availableInputs?.first(where: { kinds.contains($0.portType) })
    }

    private func headsetLabel(_ port: AVAudioSessionPortDescription) -> String {
        switch port.portType {
        case .headphones, .headsetMic, .usbAudio: return "Fone com fio"
        default: return "Fone Bluetooth (\(port.portName))"
        }
    }

    private func current() -> String? {
        guard let out = session.currentRoute.outputs.first else { return nil }
        switch out.portType {
        case .builtInSpeaker: return "speaker"
        case .builtInReceiver: return "earpiece"
        default: return headsetPort() != nil ? "headset" : nil
        }
    }

    // O WebView só deixa trocar a saída com a sessão em "tocar e gravar" (mic ligado).
    private func ensureCategory() throws {
        if session.category != .playAndRecord {
            try session.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        }
    }

    private func apply(_ id: String) throws {
        try ensureCategory()
        switch id {
        case "speaker":
            try session.overrideOutputAudioPort(.speaker)
        case "earpiece":
            // Sai do fone usando o mic do aparelho; sem viva-voz, o som vai pro ouvido.
            try session.overrideOutputAudioPort(.none)
            if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                try session.setPreferredInput(builtIn)
            }
        default:
            try session.overrideOutputAudioPort(.none)
            let headsetInputs: [AVAudioSession.Port] = [.headsetMic, .bluetoothHFP, .bluetoothLE, .usbAudio]
            if let port = session.availableInputs?.first(where: { headsetInputs.contains($0.portType) }) {
                try session.setPreferredInput(port)
            }
        }
    }

    @objc func getOutputs(_ call: CAPPluginCall) {
        var outputs: [[String: String]] = [["id": "speaker", "label": "Alto-falante"]]
        if hasEarpiece { outputs.append(["id": "earpiece", "label": "Ouvido (como numa ligação)"]) }
        if let port = headsetPort() { outputs.append(["id": "headset", "label": headsetLabel(port)]) }
        var ret: [String: Any] = ["outputs": outputs]
        if let id = current() { ret["current"] = id } else { ret["current"] = NSNull() }
        call.resolve(ret)
    }

    @objc func setOutput(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), ["speaker", "earpiece", "headset"].contains(id) else {
            return call.reject("Saída desconhecida")
        }
        wanted = id
        do {
            try apply(id)
            call.resolve()
        } catch {
            call.reject("Saída indisponível", nil, error)
        }
    }

    @objc func startCall(_ call: CAPPluginCall) {
        inCall = true
        // Tela não apaga sozinha no meio da call.
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
        call.resolve()
    }

    @objc func endCall(_ call: CAPPluginCall) {
        inCall = false
        wanted = nil
        try? session.overrideOutputAudioPort(.none)
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
        call.resolve()
    }
}

// Tela principal do app: a de sempre do Capacitor, com o plugin acima registrado.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CallAudioPlugin())
    }
}

import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // App aberto por um link de convite.
        if let url = connectionOptions.urlContexts.first?.url { openCall(url) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url { openCall(url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // simplecall://abc-defg-hij (botão "Abrir no app" do site) abre a call no app. O link https
    // direto (Universal Links) precisaria da conta paga da Apple.
    private func openCall(_ url: URL) {
        guard url.scheme == "simplecall" else { return }
        let code = (url.pathComponents.last(where: { $0 != "/" }) ?? url.host ?? "").lowercased()
        guard code.range(of: "^[a-z]{3}-[a-z]{4}-[a-z]{3}$", options: .regularExpression) != nil,
              let target = URL(string: "https://simplecall.antonioinaciodev.workers.dev/\(code)")
        else { return }
        // Depois do carregamento inicial do Capacitor, que abre a página inicial.
        DispatchQueue.main.async { [weak self] in
            guard let webView = (self?.window?.rootViewController as? CAPBridgeViewController)?.webView,
                  webView.url != target
            else { return }
            webView.load(URLRequest(url: target))
        }
    }
}

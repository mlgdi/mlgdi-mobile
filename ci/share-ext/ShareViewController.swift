import UIKit
import MobileCoreServices

/// 分享扩展入口：其它 App 的分享面板里出现「渡己」就是这个 target。
///
/// 数据通道：把 text / url 写进**共享容器**（优先 App Group Defaults，
/// TrollStore 未沙箱环境下退到 /var/mobile/Library 固定文件），然后立刻
/// completeRequest 关掉面板。主 App 下次回前台（AppDelegate 注入的
/// checkSharedSharePayload）会读走并转发给 uni 运行时 → 弹「收下这条分享？」。
///
/// 为什么不走 openURL 直接拉起主 App：iOS 禁止 share extension 调 openURL
/// （私有 selector 在新系统上也会被静默拦截），所以「分享后自动跳转」做不到，
/// 用户分享完要自己切回 App——这是系统限制，不是 bug。
@objc(ShareViewController)
public final class ShareViewController: UIViewController {

    private static let suiteName = "group.com.mlgdi.garden"
    private static let sharedFilePath = "/var/mobile/Library/mlgdi_share.json"

    private var delivered = false

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0, alpha: 0.001)
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        extractAndForward()
    }

    private func extractAndForward() {
        var text = ""
        var link = ""

        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        outer: for item in items {
            for provider in (item.attachments ?? []) {
                if provider.hasItemConformingToTypeIdentifier(kUTTypeURL as String) {
                    _ = provider.loadItem(forTypeIdentifier: kUTTypeURL as String, options: nil) { obj, _ in
                        if let url = obj as? URL { link = url.absoluteString }
                        else if let str = obj as? String, let url = URL(string: str) { link = url.absoluteString }
                    }
                    continue
                }
                if provider.hasItemConformingToTypeIdentifier(kUTTypePlainText as String) {
                    _ = provider.loadItem(forTypeIdentifier: kUTTypePlainText as String, options: nil) { obj, _ in
                        if let s = obj as? String { text = s }
                    }
                    continue
                }
                // 只有图片（连文字都没有）时暂时不收：图片走共享文件通路还没建
                if provider.hasItemConformingToTypeIdentifier(kUTTypeImage as String) { break outer }
            }
        }

        // loadItem 的回调是异步的，但取出的是本地内存对象，跑一圈 runloop 基本就绪
        let deadline = Date().addingTimeInterval(1.0)
        while (text.isEmpty && link.isEmpty) && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }

        if !text.isEmpty || !link.isEmpty {
            savePayload(text: text, link: link)
            delivered = true
        }

        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func savePayload(text: String, link: String) {
        let payload: [String: Any] = [
            "text": text,
            "url": link,
            "ts": Date().timeIntervalSince1970,
        ]

        // 通路 1：App Group Defaults（正规做法，需要 entitlements 生效）
        if let group = UserDefaults(suiteName: Self.suiteName) {
            group.set(payload, forKey: "pendingShare")
            group.synchronize()
        }

        // 通路 2：TrollStore 应用无沙箱，直接写共享文件（绕过 group 失败的情况）
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            try? data.write(to: URL(fileURLWithPath: Self.sharedFilePath))
        }

        _ = delivered
    }
}

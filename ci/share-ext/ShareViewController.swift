import UIKit
import MobileCoreServices

/// 分享扩展入口：其它 App 的分享面板里出现「渡己」就是这个 target。
///
/// 数据通道：把 text / url / name 写进**共享容器**（优先 App Group Defaults，
/// TrollStore 未沙箱环境下退到 /var/mobile/Library 固定文件），然后立刻
/// completeRequest 关掉面板。主 App 下次回前台（AppDelegate 注入的
/// checkSharedSharePayload）会读走并转发给 uni 运行时 → 弹「收下这条分享？」。
///
/// 为什么不走 openURL 直接拉起主 App：iOS 禁止 share extension 调 openURL
/// （私有 selector 在新系统上也会被静默拦截），所以「分享后自动跳转」做不到，
/// 用户分享完要自己切回 App——这是系统限制，不是 bug。
///
/// 从「文件」App 分享 .md 时拿到的是 **file-url**，不是文本内容：
/// 必须自己 open 文件读成字符串。只认文本类文件（.md/.txt/纯文本 UTI），
/// 其它类型（pdf/zip/图片）读出来也是乱码，直接放弃。
@objc(ShareViewController)
public final class ShareViewController: UIViewController {

    private static let suiteName = "group.com.mlgdi.garden"
    private static let sharedFilePath = "/var/mobile/Library/mlgdi_share.json"
    /// 单文件上限：碎片箱是随手记，不是文件柜；512KB 已经远超一篇长文
    private static let maxBytes = 512 * 1024

    private var delivered = false

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0, alpha: 0.001)
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        extractAndForward()
    }

    // MARK: - 取值

    /// 并发计数的锁：loadItem 的回调在不同线程，直接读写布尔会有竞态
    private let lock = NSLock()
    private var pending = 0

    private func beginLoad() {
        lock.lock(); pending += 1; lock.unlock()
    }

    private func endLoad() {
        lock.lock(); pending -= 1; lock.unlock()
    }

    private func pendingCount() -> Int {
        lock.lock(); defer { lock.unlock() }; return pending
    }

    private func extractAndForward() {
        var text = ""
        var link = ""
        var name = ""

        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        for item in items {
            for provider in (item.attachments ?? []) {
                let identifiers = provider.registeredTypeIdentifiers

                // 1) 文件（「文件」App、Obsidian 等文档类 App 走这条）
                if let fileType = Self.firstType(identifiers, conformingTo: kUTTypeFileURL) {
                    beginLoad()
                    provider.loadItem(forTypeIdentifier: fileType, options: nil) { [weak self] obj, _ in
                        defer { self?.endLoad() }
                        guard let url = Self.fileURL(from: obj) else { return }
                        name = url.lastPathComponent
                        if let body = Self.readText(at: url) {
                            text = body
                        }
                    }
                    continue
                }

                // 2) 网页链接
                if let urlType = Self.firstType(identifiers, conformingTo: kUTTypeURL) {
                    beginLoad()
                    provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] obj, _ in
                        defer { self?.endLoad() }
                        if let url = obj as? URL { link = url.absoluteString }
                        else if let str = obj as? String, let url = URL(string: str) {
                            link = url.absoluteString
                        }
                    }
                    continue
                }

                // 3) 纯文本（选一段文字、或某些 App 直接给字符串）
                if let textType = Self.firstType(identifiers, conformingTo: kUTTypeText) {
                    beginLoad()
                    provider.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] obj, _ in
                        defer { self?.endLoad() }
                        if let s = obj as? String { text = s }
                        else if let d = obj as? Data, let s = String(data: d, encoding: .utf8) { text = s }
                        else if let url = obj as? URL, url.isFileURL, let s = Self.readText(at: url) {
                            text = s
                        }
                    }
                    continue
                }
            }

            // 兜底：share sheet 有时把正文放在 attributedContentText 里
            if text.isEmpty, let attr = item.attributedContentText, attr.length > 0 {
                text = attr.string
            }
        }

        // loadItem 的回调是异步的；转 runloop 等到都回来（或 2 秒超时）。
        // 不用 DispatchGroup.wait —— 回调可能落在主队列上，阻塞主线程会死锁。
        let deadline = Date().addingTimeInterval(2.0)
        while pendingCount() > 0 && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }

        if !text.isEmpty || !link.isEmpty {
            let handedOff = savePayload(text: text, link: link, name: name)
            delivered = true
            // handedOff == false 说明只剩剪贴板通道：内容已经在剪贴板里，
            // 但用户必须自己切回 App 才会被问到，所以文案要写清楚这一步
            show(
                title: "已送到渡己",
                detail: handedOff ? "切回 App 即可投递" : "内容已放进剪贴板，切回 App 会自动询问是否投递",
                then: 1.5
            )
        } else {
            show(
                title: "没有可以投递的内容",
                detail: "只支持文本与 Markdown 文件",
                then: 1.8
            )
        }
    }

    // MARK: - 反馈卡片
    /*
     * 为什么要在扩展里画一张卡：iOS 不允许分享扩展拉起宿主 App
     * （openURL 对 share-services 无效），用户点完「渡己」如果什么反馈都没有，
     * 看起来就像功能坏了。这里给一句明确结果 + 下一步该做什么，1.5 秒自动关。
     */
    private func show(title: String, detail: String, then seconds: TimeInterval) {
        view.backgroundColor = UIColor(white: 0, alpha: 0.32)

        let card = UIView()
        card.backgroundColor = .secondarySystemBackground
        card.layer.cornerRadius = 16
        card.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textColor = .label
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 1
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let detailLabel = UILabel()
        detailLabel.text = detail
        detailLabel.font = .systemFont(ofSize: 13)
        detailLabel.textColor = .secondaryLabel
        detailLabel.textAlignment = .center
        detailLabel.numberOfLines = 2
        detailLabel.translatesAutoresizingMaskIntoConstraints = false

        card.addSubview(titleLabel)
        card.addSubview(detailLabel)
        view.addSubview(card)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 260),

            titleLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 20),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            titleLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),

            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            detailLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            detailLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            detailLabel.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20),
        ])

        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    /// 在注册类型里找第一个符合目标 UTI 的（file-url / url / text）
    private static func firstType(_ ids: [String], conformingTo target: CFString) -> String? {
        for id in ids {
            if UTTypeConformsTo(id as CFString, target) { return id }
        }
        return nil
    }

    /// loadItem 给回来的可能是 URL，也可能是「文件路径字符串」
    private static func fileURL(from obj: Any?) -> URL? {
        if let url = obj as? URL { return url }
        if let str = obj as? String {
            if str.hasPrefix("file://"), let url = URL(string: str) { return url }
            if str.hasPrefix("/") { return URL(fileURLWithPath: str) }
        }
        return nil
    }

    /// 只读文本类文件，且限制大小；读不出来就返回 nil（pdf/zip 会走到这里）
    private static func readText(at url: URL) -> String? {
        let ext = url.pathExtension.lowercased()
        let textExts: Set<String> = ["md", "markdown", "mkd", "txt", "text", "org", "csv", "json", "yaml", "yml"]
        // iOS 对 .md 多半只有 dynamic UTI，光靠 UTI 判断会漏，扩展名先兜一层
        if !textExts.contains(ext) {
            let uti = UTTypeCreatePreferredIdentifierForTag(
                kUTTagClassFilenameExtension, ext as CFString, nil
            )?.takeRetainedValue()
            let conforms = uti.map {
                UTTypeConformsTo($0, kUTTypeText) || UTTypeConformsTo($0, kUTTypePlainText)
            } ?? false
            if !conforms { return nil }
        }

        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        if let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? Int, size > maxBytes {
            return nil
        }
        if let s = try? String(contentsOf: url, encoding: .utf8) { return s }
        if let data = try? Data(contentsOf: url), let s = String(data: data, encoding: .utf8) {
            return s
        }
        return nil
    }

    // MARK: - 交接

    @discardableResult
    private func savePayload(text: String, link: String, name: String) -> Bool {
        var payload: [String: Any] = [
            "text": text,
            "url": link,
            "ts": Date().timeIntervalSince1970,
        ]
        // name 只作提示：主 App 拼成碎片标题行的前缀，不参与正文判断
        if !name.isEmpty { payload["name"] = name }

        // 通路 1：App Group Defaults（正规做法，需要 entitlements 生效）
        if let group = UserDefaults(suiteName: Self.suiteName) {
            group.set(payload, forKey: "pendingShare")
            group.synchronize()
        }

        /*
         * 通路 2：TrollStore 应用无沙箱，直接写共享文件。
         *
         * 这次写是要验的：侧载包没有签名，App Group 的 entitlement 不存在，
         * 上面那句 UserDefaults(suiteName:) 其实会**悄悄写回自己的沙箱**，
         * 主 App 读不到也不报错。文件写失败（沙箱拒绝）才说明两条路都不通。
         */
        var handedOff = false
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            do {
                try data.write(to: URL(fileURLWithPath: Self.sharedFilePath))
                handedOff = true
            } catch {
                handedOff = false
            }
        }

        /*
         * 通路 3：剪贴板兜底。
         *
         * 上面两条都不通时，把内容放进系统剪贴板——主 App 回前台本来就有
         * 「读剪贴板 → 问要不要收进碎片箱」的流程，不需要任何 entitlement，
         * 这是侧载环境里唯一一定能送达的通道。
         * 只在确认前两条失败时才动剪贴板，不要平白覆盖用户原来的内容。
         */
        if !handedOff {
            let parts = [name, text.isEmpty ? link : text].filter { !$0.isEmpty }
            let body = parts.joined(separator: "\n")
            if !body.isEmpty { UIPasteboard.general.string = body }
        }
        return handedOff
    }
}

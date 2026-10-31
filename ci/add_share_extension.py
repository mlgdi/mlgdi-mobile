#!/usr/bin/env python3
"""Inject a Share Extension target into the HBuilder-Hello Xcode project.

Why script surgery instead of an .xcodeproj checked into the repo: the iOS
offline SDK is downloaded at build time from the GitHub Release, so the
project only exists on the runner.

What gets added (all hand-rolled pbxproj objects, old-style plist):
  - PBXNativeTarget  "ShareNav" (com.apple.product-type.app-extension)
  - Sources build phase with ShareViewController.swift
  - Debug / Release XCBuildConfiguration
  - PBXCopyFilesBuildPhase (dstSubfolderSpec=13, i.e. PlugIns) appended to
    the main app target so the .appex is embedded into the IPA
  - Main-target AppDelegate.m patch: read the shared payload back and forward
    it into PDRCore as an mlgdi:// URL (uni runtime -> plus.runtime.arguments)

Safety: every step asserts; on ANY failure the injector restores the original
pbxproj / AppDelegate.m and exits non-zero, and assemble-ios.sh continues with
a plain single-target build. A broken extension must never break the base IPA.

Usage: python3 add_share_extension.py <path-to-HBuilder-Hello.xcodeproj> <path-to-HBuilder-Hello-source-dir>
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

def uid(seed: str) -> str:
    """Deterministic 24-hex object ids (stable across re-runs)."""
    import hashlib
    return hashlib.sha1(seed.encode()).hexdigest()[:24].upper()


def main() -> int:
    proj = Path(sys.argv[1])
    src_dir = Path(sys.argv[2])
    pbx = proj / "project.pbxproj"
    orig_pbx = pbx.read_text(encoding="utf-8")
    appdelegate = src_dir / "AppDelegate.m"
    orig_adm = appdelegate.read_text(encoding="utf-8")

    def fail(msg: str) -> int:
        pbx.write_text(orig_pbx, encoding="utf-8")
        appdelegate.write_text(orig_adm, encoding="utf-8")
        print(f"SHARE-EXT ABORT: {msg}", file=sys.stderr)
        return 2

    # ---- locate the main app target --------------------------------------
    # target 名字是 HBuilder（不是 HBuilder-Hello），按 productType 找最稳
    m = re.search(
        r"\n\t\t([A-F0-9]{24}) /\* [\w.-]+ \*/ = \{\s*isa = PBXNativeTarget;"
        r".*?productType = \"com\.apple\.product-type\.application\";",
        orig_pbx,
        re.S,
    )
    if not m:
        return fail("main app target not found")
    main_target_id = m.group(1)

    if "ShareNav" in orig_pbx:
        print("SHARE-EXT: already injected, skip")
        return 0

    # ---- object ids -------------------------------------------------------
    U = {
        "swift_fileref":  uid("share-swift-fileref"),
        "plist_fileref":  uid("share-plist-fileref"),
        "appex_fileref":  uid("share-appex-fileref"),
        "swift_buildfile": uid("share-swift-buildfile"),
        "appex_buildfile": uid("share-appex-buildfile"),
        "group":          uid("share-group"),
        "products_group": uid("share-products-group"),
        "target":         uid("share-native-target"),
        "sources_phase":  uid("share-sources-phase"),
        "embed_phase":    uid("share-embed-phase"),
        "conf_list":      uid("share-conf-list"),
        "conf_debug":     uid("share-conf-debug"),
        "conf_release":   uid("share-conf-release"),
    }

    ext_dir = "ShareNav"  # inside HBuilder-Hello/HBuilder-Hello/
    ext_src = src_dir / ext_dir
    ext_src.mkdir(parents=True, exist_ok=True)
    here = Path(__file__).resolve().parent
    shutil.copy(here / "share-ext" / "ShareViewController.swift", ext_src / "ShareViewController.swift")
    shutil.copy(here / "share-ext" / "Info.plist", ext_src / "Info.plist")

    s = orig_pbx

    def insert_before(marker: str, block: str, text: str) -> str:
        assert marker in text, f"marker missing: {marker}"
        return text.replace(marker, block + marker, 1)

    # ---- PBXBuildFile -----------------------------------------------------
    s = insert_before(
        "/* End PBXBuildFile section */",
        f"""		{U['swift_buildfile']} /* ShareViewController.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {U['swift_fileref']} /* ShareViewController.swift */; }};
		{U['appex_buildfile']} /* ShareNav.appex in Embed App Extensions */ = {{isa = PBXBuildFile; fileRef = {U['appex_fileref']} /* ShareNav.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
""",
        s,
    )

    # ---- PBXFileReference -------------------------------------------------
    s = insert_before(
        "/* End PBXFileReference section */",
        f"""		{U['swift_fileref']} /* ShareViewController.swift */ = {{isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = sourcecode.swift; path = ShareViewController.swift; sourceTree = "<group>"; }};
		{U['plist_fileref']} /* Info.plist */ = {{isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
		{U['appex_fileref']} /* ShareNav.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = ShareNav.appex; sourceTree = BUILT_PRODUCTS_DIR; }};
""",
        s,
    )

    # ---- group: ShareNav/* under the main source group --------------------
    # 主源码组：path = "HBuilder-Hello" 的 PBXGroup
    m = re.search(
        r"\n\t\t([A-F0-9]{24}) /\* HBuilder-Hello \*/ = \{\s*isa = PBXGroup;\s*children = \(\s*\n\t*\t*[A-F0-9]{24} /\* AppDelegate",
        s,
    )
    if not m:
        return fail("main source group not found")
    main_group = m.group(1)
    s = insert_before(
        f"""		{main_group} /* HBuilder-Hello */ = {{""",
        f"""		{U['group']} /* ShareNav */ = {{
			isa = PBXGroup;
			children = (
				{U['swift_fileref']} /* ShareViewController.swift */,
				{U['plist_fileref']} /* Info.plist */,
			);
			path = ShareNav;
			sourceTree = "<group>";
		}};
""",
        s,
    )
    # add ShareNav group + product ref to the main group's children
    idx = s.index(f"{main_group} /* HBuilder-Hello */ = {{")
    idx = s.index("children = (", idx)
    idx = s.index("\n", idx) + 1
    s = s[:idx] + f"\t\t\t\t{U['group']} /* ShareNav */,\n" + s[idx:]

    # ---- products group: add appex ---------------------------------------
    m = re.search(r"([A-F0-9]{24}) /\* Products \*/ = \{", s)
    if not m:
        return fail("Products group not found")
    products_group = m.group(1)
    idx = s.index(f"{products_group} /* Products */ = {{")
    idx = s.index("children = (", idx)
    idx = s.index("\n", idx) + 1
    s = s[:idx] + f"\t\t\t\t{U['appex_fileref']} /* ShareNav.appex */,\n" + s[idx:]

    # ---- sources build phase for the extension ---------------------------
    s = insert_before(
        "/* End PBXSourcesBuildPhase section */",
        f"""		{U['sources_phase']} /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{U['swift_buildfile']} /* ShareViewController.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
""",
        s,
    )

    # ---- embed phase ------------------------------------------------------
    s = insert_before(
        "/* End PBXCopyFilesBuildPhase section */",
        f"""		{U['embed_phase']} /* Embed App Extensions */ = {{
			isa = PBXCopyFilesBuildPhase;
			buildActionMask = 2147483647;
			dstPath = "";
			dstSubfolderSpec = 13;
			files = (
				{U['appex_buildfile']} /* ShareNav.appex in Embed App Extensions */,
			);
			name = "Embed App Extensions";
			runOnlyForDeploymentPostprocessing = 0;
		}};
""",
        s,
    )

    # hook embed phase into the MAIN target's buildPhases
    idx = s.index(f"{main_target_id} /* HBuilder */ = {{")
    idx = s.index("buildPhases = (", idx)
    idx = s.index("\n", idx) + 1
    s = s[:idx] + f"\t\t\t\t{U['embed_phase']} /* Embed App Extensions */,\n" + s[idx:]
    s = s[:idx] + f"\t\t\t\t{U['embed_phase']} /* Embed App Extensions */,\n" + s[idx:]

    # ---- native target + configurations ----------------------------------
    # deployment target：**固定 13.0**，不要从工程里抓——
    # SDK 的 pbxproj 里有历史遗留的 6.0（第一个命中就是它），
    # 而 Swift 最低要求 iOS 7，6.0 会让扩展编译直接失败（真实踩过）。
    m = re.search(r"IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+)", s)
    deployment = "13.0"
    m = re.search(r"MARKETING_VERSION = ([\w.]+);", s)
    marketing = m.group(1) if m else "1.0"
    m = re.search(r"CURRENT_PROJECT_VERSION = (\w+);", s)
    current = m.group(1) if m else "1"

    def conf_block(name: str, cid: str) -> str:
        return f"""		{cid} /* {name} */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				CLANG_ENABLE_MODULES = YES;
				CODE_SIGNING_ALLOWED = NO;
				CODE_SIGN_IDENTITY = "";
				CURRENT_PROJECT_VERSION = {current};
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = HBuilder-Hello/ShareNav/Info.plist;
				INFOPLIST_KEY_NSHumanReadableCopyright = "";
				IPHONEOS_DEPLOYMENT_TARGET = {deployment};
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@executable_path/../../Frameworks",
				);
				MARKETING_VERSION = {marketing};
				PRODUCT_BUNDLE_IDENTIFIER = com.mlgdi.garden.ShareNav;
				PRODUCT_MODULE_NAME = "$(PRODUCT_NAME:c99extidentifier)";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SKIP_INSTALL = YES;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = {name};
		}};
"""

    s = insert_before(
        "/* End XCBuildConfiguration section */",
        conf_block("Debug", U["conf_debug"]) + conf_block("Release", U["conf_release"]),
        s,
    )

    s = insert_before(
        "/* End XCConfigurationList section */",
        f"""		{U['conf_list']} /* Build configuration list for PBXNativeTarget "ShareNav" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{U['conf_debug']} /* Debug */,
				{U['conf_release']} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
""",
        s,
    )

    s = insert_before(
        "/* End PBXNativeTarget section */",
        f"""		{U['target']} /* ShareNav */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = {U['conf_list']} /* Build configuration list for PBXNativeTarget "ShareNav" */;
			buildPhases = (
				{U['sources_phase']} /* Sources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = ShareNav;
			productName = ShareNav;
			productReference = {U['appex_fileref']} /* ShareNav.appex */;
			productType = "com.apple.product-type.app-extension";
		}};
""",
        s,
    )

    # register in targets list of the project object: add after main target's entry
    m = re.search(r"(targets = \(\n\t*\t*" + main_target_id + r" /\* [\w.-]+ \*/,)", s)
    if m:
        s = s.replace(m.group(1), m.group(1) + f"\n\t\t\t\t{U['target']} /* ShareNav */,", 1)

    pbx.write_text(s, encoding="utf-8")

    # validate plist syntax (plutil exists only on macOS; skip elsewhere)
    try:
        r = subprocess.run(["plutil", "-lint", str(pbx)], capture_output=True, text=True)
        if r.returncode != 0:
            return fail(f"pbxproj lint failed: {r.stderr.strip()[:300]}")
    except FileNotFoundError:
        print("SHARE-EXT: plutil not available, skip lint (non-macOS)")

    # ---- AppDelegate.m patch ----------------------------------------------
    adm = orig_adm
    if "checkSharedSharePayload" not in adm:
        anchor = (
            "- (void)applicationDidBecomeActive:(UIApplication *)application\n"
            "{\n"
            "    [PDRCore handleSysEvent:PDRCoreSysEventBecomeActive withObject:nil];"
        )
        if anchor not in adm:
            return fail("applicationDidBecomeActive anchor not found")
        hook = anchor + "\n    [self checkSharedSharePayload];"

        method = """
#pragma mark - Share payload (injected)
/*
 * 分享扩展把 text/url 写进共享容器；这里在回前台时读出来，
 * 以 mlgdi://capture URL 的形式直接递给 PDRCore（等价于外部 scheme 打开），
 * uni 运行时会把它放进 plus.runtime.arguments，JS 侧弹「收下这条分享？」。
 */
- (void)checkSharedSharePayload
{
    @try {
        NSDictionary *payload = nil;
        NSUserDefaults *group = [[NSUserDefaults alloc] initWithSuiteName:@"group.com.mlgdi.garden"];
        if (group) payload = [group dictionaryForKey:@"pendingShare"];
        NSString *sharedPath = @"/var/mobile/Library/mlgdi_share.json";
        if (!payload) {
            NSData *data = [NSData dataWithContentsOfFile:sharedPath];
            if (data) payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        }
        if (!payload) return;

        NSString *text = payload[@"text"] ?: @"";
        NSString *link = payload[@"url"] ?: @"";
        NSString *name = payload[@"name"] ?: @"";
        // 读到就清掉，避免每次回前台重复弹
        [group removeObjectForKey:@"pendingShare"];
        [group synchronize];
        [[NSFileManager defaultManager] removeItemAtPath:sharedPath error:nil];
        if (text.length == 0 && link.length == 0) return;

        NSString *body = text.length ? text : link;
        /*
         * 注意不能直接用 URLQueryAllowedCharacterSet：它把 & = # ? + % 都当合法，
         * 正文里出现一个 & 就会把 text 参数截断、后面的内容错位成别的参数。
         * 分享的是 Markdown 原文，这些都真会出现。
         */
        NSMutableCharacterSet *allowed = [[NSCharacterSet URLQueryAllowedCharacterSet] mutableCopy];
        [allowed removeCharactersInString:@"?&=#+%;"];
        NSString *enc = [body stringByAddingPercentEncodingWithAllowedCharacters:allowed];
        if (!enc) return;
        NSString *query = [NSString stringWithFormat:@"mlgdi://capture?text=%@", enc];
        if (name.length) {
            NSString *encName = [name stringByAddingPercentEncodingWithAllowedCharacters:allowed];
            if (encName.length) {
                query = [NSString stringWithFormat:@"mlgdi://capture?title=%@&text=%@", encName, enc];
            }
        }
        NSURL *url = [NSURL URLWithString:query];
        if (!url) return;
        [PDRCore handleSysEvent:PDRCoreSysEventOpenURL withObject:url];
    } @catch (NSException *e) {
        NSLog(@"[share] payload forward failed: %@", e);
    }
}
"""
        adm = adm.replace(anchor, hook, 1)
        # 方法必须插进 AppDelegate 的 @implementation 里——插到文件末尾的
        # 最后一个 @end 前会落进 UINavigationController(Orient) 分类，
        # 编译报「no visible @interface declares the selector」（真实踩过）。
        # applicationWillResignActive 一定在 AppDelegate 实现内，拿它当界碑。
        boundary = "- (void)applicationWillResignActive:"
        b = adm.index(boundary)
        adm = adm[:b] + method + "\n" + adm[b:]
        appdelegate.write_text(adm, encoding="utf-8")

    # ---- AppDelegate.m: export picker --------------------------------------
    #
    # 为什么这个必须放原生：JS 侧用 plus.ios.invoke 调 presentViewController，
    # 有两件事说不准 —— 回调是不是在主线程、rootViewController 是不是当前
    # 活跃窗口。0.7.28 到 0.7.33 连续几版「点了没反应」都栽在这两点上：
    # present 被系统静默拒绝，既不抛异常、回调也不来，JS 拿不到任何信号，
    # 于是既没法报错也没法重试。
    #
    # 原生侧一次把三件事做对：主线程 dispatch、扫 connectedScenes 找 keyWindow、
    # 顺着 presentedViewController 找到真正能 present 的那一层。
    if "mlgdiPresentExportPicker" not in adm:
        picker_method = """
#pragma mark - Export picker (injected)
- (void)mlgdiPresentExportPicker:(NSString *)path
{
    if (path.length == 0) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        @try {
            NSURL *url = [NSURL fileURLWithPath:path];
            UIDocumentPickerViewController *picker = nil;
            if (@available(iOS 14.0, *)) {
                picker = [[UIDocumentPickerViewController alloc] initForExportingURLs:@[url] asCopy:YES];
            } else {
                picker = [[UIDocumentPickerViewController alloc] initWithURL:url
                                                                      inMode:UIDocumentPickerModeExportToService];
            }
            if (!picker) return;

            UIWindow *win = nil;
            if (@available(iOS 13.0, *)) {
                for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
                    if (scene.activationState != UISceneActivationStateForegroundActive) continue;
                    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
                    for (UIWindow *w in ((UIWindowScene *)scene).windows) {
                        if (w.isKeyWindow) { win = w; break; }
                    }
                    if (win) break;
                }
            }
            if (!win) win = UIApplication.sharedApplication.keyWindow;
            if (!win) return;

            UIViewController *root = win.rootViewController;
            while (root.presentedViewController) root = root.presentedViewController;
            if (!root) return;
            [root presentViewController:picker animated:YES completion:nil];
        } @catch (NSException *e) {
            NSLog(@"[export] picker failed: %@", e);
        }
    });
}
"""
        boundary2 = "- (void)applicationWillResignActive:"
        if boundary2 not in adm:
            return fail("applicationWillResignActive anchor not found (picker)")
        b2 = adm.index(boundary2)
        adm = adm[:b2] + picker_method + "\n" + adm[b2:]
        appdelegate.write_text(adm, encoding="utf-8")

    print("SHARE-EXT: injected (target ShareNav, embeds PlugIns/ShareNav.appex)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

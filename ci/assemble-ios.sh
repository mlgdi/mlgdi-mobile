#!/usr/bin/env bash
# 组装 iOS 离线打包工程并编译出**未签名 .app**（在 macOS runner 上执行）
#
# 为什么走离线打包：HBuilderX 是桌面 GUI（无 Linux 版、CLI 需登录态），
# runner 上装不了；而 iOS 离线 SDK 就是普通 Xcode 工程，
# `CODE_SIGNING_ALLOWED=NO` 编出来的未签名 .app 打成 IPA 后 TrollStore 能直接装，
# 全程不需要 Apple 开发者账号。
#
# 环境变量：
#   SDK_ZIP         iOS 离线 SDK 压缩包（Release 附件）
#   APPID           DCloud appid，如 __UNI__1877F1B
#   BUNDLE_ID       iOS Bundle ID，如 com.mlgdi.garden
#   DCLOUD_APPKEY   离线打包 AppKey
#   APP_NAME        主屏显示名，默认「渡己」
#   VERSION_NAME    版本号，默认取 manifest 的 versionName
#   VERSION_CODE    build 号
#   RES_DIR         uni-app 资源目录（dist/build/app）
#   OUT_DIR         输出目录
#
# 本脚本的结构常量来自离线 SDK（HBuilderX 5.26 版）实测：
#   HBuilder-Hello/                              ← SDK 内工程根
#   HBuilder-Hello/HBuilder-Hello/                ← App target 目录
#   HBuilder-Hello/HBuilder-Hello/Pandora/apps/$APPID/www   ← 资源落地处
#   HBuilder-Hello/HBuilder-Hello/HBuilder-Hello-Info.plist ← 注意文件名带前缀
#   HBuilder-Hello/HBuilder-Hello/control.xml     ← appid / appver 登记
#   HBuilder-Hello/Podfile                        ← uni-app 模块以 subspec 引入
# SDK 升级后若结构变化，脚本会在对应步骤打印目录树再退出，不静默失败。

set -euo pipefail

SDK_ZIP="${SDK_ZIP:?需要 SDK_ZIP}"
APPID="${APPID:?需要 APPID}"
BUNDLE_ID="${BUNDLE_ID:-com.mlgdi.garden}"
DCLOUD_APPKEY="${DCLOUD_APPKEY:-}"
APP_NAME="${APP_NAME:-渡己}"
VERSION_NAME="${VERSION_NAME:-0.2.1}"
VERSION_CODE="${VERSION_CODE:-210}"
RES_DIR="${RES_DIR:-dist/build/app}"
# 后面要 cd 进 SDK 工程，相对路径会失效（曾因此读不到 manifest.json）。
# 这里统一转成绝对路径，读 manifest 与 copy 资源都用它。
case "$RES_DIR" in
  /*) ;;
  *) RES_DIR="$(pwd)/$RES_DIR" ;;
esac
OUT_DIR="${OUT_DIR:-$PWD/ios-out}"
WORK="${WORK:-$PWD/.ios-work}"

log() { printf '\n\033[1m==== %s ====\033[0m\n' "$*"; }

dump_and_die() {
  echo "❌ $1" >&2
  echo "---- 目录树（前 80 行，用于对齐脚本里的结构常量）----" >&2
  find "$WORK" -maxdepth 4 -not -path "*/node_modules/*" 2>/dev/null | head -80 >&2
  exit 1
}

sedi() {
  # macOS 与 GNU sed 的 -i 参数不同，统一封装
  if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi
}

rm -rf "$WORK" "$OUT_DIR"
mkdir -p "$WORK" "$OUT_DIR"

log "1/9 解压离线 SDK"
unzip -q "$SDK_ZIP" -d "$WORK/sdk"
# zip 里带 macOS 元数据：__MACOSX 下有同名目录（AppleDouble），
# 不删掉的话 find 会先命中 __MACOSX/SDK/HBuilder-Hello 这个假目录，后续全错（实测踩过）
rm -rf "$WORK/sdk/__MACOSX"
find "$WORK/sdk" -name ".DS_Store" -delete 2>/dev/null || true

HELLO=$(find "$WORK/sdk" -maxdepth 4 -type d -name "HBuilder-Hello" -not -path "*__MACOSX*" | head -1 || true)
[ -n "$HELLO" ] || dump_and_die "SDK 内未找到 HBuilder-Hello"
echo "工程根: $HELLO"

APP_TARGET="$HELLO/HBuilder-Hello"          # App target 目录
[ -d "$APP_TARGET" ] || dump_and_die "未找到 App target 目录 HBuilder-Hello/HBuilder-Hello"
PLIST="$APP_TARGET/HBuilder-Hello-Info.plist"
CONTROL="$APP_TARGET/control.xml"
PBXPROJ="$HELLO/HBuilder-Hello.xcodeproj/project.pbxproj"
[ -f "$PLIST" ] || dump_and_die "未找到 $PLIST"
[ -f "$PBXPROJ" ] || dump_and_die "未找到 project.pbxproj"

log "2/9 放入 uni-app 资源"
# 清掉 SDK 自带的示例 app，只留我们的
rm -rf "$APP_TARGET"/Pandora/apps/__UNI__*
APPS_DIR="$APP_TARGET/Pandora/apps/$APPID"
mkdir -p "$APPS_DIR"
rm -rf "$APPS_DIR/www"
cp -R "$RES_DIR" "$APPS_DIR/www"
[ -f "$APPS_DIR/www/app-service.js" ] || dump_and_die "资源里没有 app-service.js，检查 RES_DIR 是否指向 dist/build/app"
echo "资源: $(du -sh "$APPS_DIR/www" | cut -f1)"

log "3/9 登记 appid / 版本（control.xml）"
if [ -f "$CONTROL" ]; then
  cat > "$CONTROL" <<XML
<?xml version="1.0" encoding="utf-8"?>
<HBuilder debug="false" syncDebug="false" version="1.9.9.81715">
	<apps>
		<app appid="$APPID" appver="$VERSION_NAME"/>
	</apps>
</HBuilder>
XML
  echo "已写入 $CONTROL"
else
  echo "⚠️ 无 control.xml（新版 SDK 可能不再需要），跳过"
fi

log "4/9 写 Bundle ID"
# 只改主 App target 的 io.dcloud.HBuilder；另一个 target（com.dcloud.XXX）是插件示例，不动
BEFORE=$(grep -c "io.dcloud.HBuilder" "$PBXPROJ" || true)
sedi "s/io\.dcloud\.HBuilder/$BUNDLE_ID/g" "$PBXPROJ"
# 中文全角括号紧跟在变量后面时，bash 会把「（」当成变量名的一部分（实测 unbound variable），
# 所以这里一律用 ${} 包住
echo "替换 io.dcloud.HBuilder → ${BUNDLE_ID}（共 ${BEFORE} 处）"

# Share Extension：分享面板里出现「渡己」。
# 注入失败（脚本断言/plutil 校验不过）会自动还原并按单 target 构建，不阻塞主 App。
log "4.5/9 Share Extension"
if [ "${SKIP_SHARE_EXT:-0}" = "1" ]; then
  echo "SKIP_SHARE_EXT=1：跳过分享扩展"
else
  python3 ci/add_share_extension.py "$HELLO/HBuilder-Hello.xcodeproj" "$APP_TARGET" \
    || echo "⚠️ 分享扩展注入失败，继续无扩展构建（可用 SKIP_SHARE_EXT=1 显式跳过）"
fi

log "5/9 写 AppKey / 显示名 / 版本（Info.plist）"
plist_set() {
  local key="$1" value="$2" type="${3:-string}"
  /usr/libexec/PlistBuddy -c "Delete :$key" "$PLIST" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :$key $type $value" "$PLIST"
}
if [ -n "$DCLOUD_APPKEY" ]; then
  plist_set dcloud_appkey "$DCLOUD_APPKEY"
  echo "dcloud_appkey 已写入"
else
  echo "⚠️ 未提供 DCLOUD_APPKEY：编译能过，但 App 一启动就报 AppKey 错误"
fi
plist_set CFBundleDisplayName "$APP_NAME"

# URL scheme：别的 App 可以通过 mlgdi://capture?text=... 把内容递进来。
# App 端在 onShow 里读 plus.runtime.arguments 处理（src/shared/utils/intake.ts）。
# PlistBuddy 操作嵌套数组里的 dict 很啰嗦，整段用 python 写 plist 最省事。
python3 - "$PLIST" <<'PY'
import plistlib, sys
from pathlib import Path

p = Path(sys.argv[1])
data = plistlib.loads(p.read_bytes())
data["CFBundleURLTypes"] = [
    {
        "CFBundleURLName": "com.mlgdi.garden",
        "CFBundleURLSchemes": ["mlgdi"],
    }
]

# 文档类型：让渡己出现在「文件」App 的共享 / 用其他应用打开列表里。
# 这是「直接接收文件」的唯一无特权通道 —— 分享扩展是独立进程、沙箱不同，
# 写不进主 App 目录，只能退到剪贴板；而声明文档类型后系统会把文件
# **复制到主 App 沙箱的 Documents/Inbox/**，JS 侧随时可读。
data["CFBundleDocumentTypes"] = [
    {
        "CFBundleTypeName": "Markdown",
        "CFBundleTypeRole": "Editor",
        # Alternate：不抢用户默认的 md 编辑器，只在共享/打开方式里出现
        "LSHandlerRank": "Alternate",
        "LSItemContentTypes": [
            "net.daringfireball.markdown",
            "public.plain-text",
        ],
    }
]

# iOS 手机端默认不认识 .md（dynamic UTI），显式声明一次，
# 系统才会把 .md 归到上面那个 document type 里。
data["UTImportedTypeDeclarations"] = [
    {
        "UTTypeIdentifier": "net.daringfireball.markdown",
        "UTTypeDescription": "Markdown 文档",
        "UTTypeConformsTo": ["public.plain-text"],
        "UTTypeTagSpecification": {
            "public.filename-extension": ["md", "markdown", "mdown", "mkd"],
            "public.mime-type": ["text/markdown", "text/x-markdown"],
        },
    }
]

# 必须是 false（也是默认值）：原地打开拿到的是 security-scoped URL，
# 出了 openURL 回调就可能失效；复制进 Inbox 的副本才一直可读。
data["LSSupportsOpeningDocumentsInPlace"] = False

# 让 App 的 Documents 出现在「文件」App → 我的 iPhone → 渡己 下。两个作用：
# 1) 导出的 .md 写在 Documents/Exports/，用户不必每次都走「存储到文件」面板
#    也能拿到文件 —— 这是「下载」该有的样子；
# 2) 共享进来的文件落在 Documents/Inbox/，用户能亲眼看到它到底到没到。
# 注意：不加 LSSupportsOpeningDocumentsInPlace，否则系统会改成原地打开、
# 不再复制进 Inbox，反而把「共享接收」这条路堵死。
data["UIFileSharingEnabled"] = True

p.write_bytes(plistlib.dumps(data))
print("CFBundleURLTypes: mlgdi:// 已注册")
print("CFBundleDocumentTypes: md/txt 可被共享打开（文件复制进 Documents/Inbox）")
print("UIFileSharingEnabled: Documents 在「文件」App 里可见")
PY

# 开屏：用仓库里 Web 入口页风格的 storyboard 覆盖 SDK 自带的
# 「HBuilder Hello + DCloud logo」白屏。LaunchScreen（系统开屏）与
# LaunchScreenAD（DCloud 启动图）都换成同一设计；zh-Hans 的 .strings
# 会把标签文本改回 ${APPNAME}，一并删掉。
log "5.5/9 开屏页（渡己 · Mlgdi）"
for SB in \
  "$APP_TARGET/LaunchScreen.storyboard" \
  "$APP_TARGET/LaunchScreenAD.storyboard" \
  "$APP_TARGET/Base.lproj/LaunchScreen.storyboard"; do
  if [ -f "$SB" ]; then cp ci/splash/LaunchScreen.storyboard "$SB"; fi
done
rm -f "$APP_TARGET"/zh-Hans.lproj/LaunchScreen.strings \
      "$APP_TARGET"/en.lproj/LaunchScreen.strings \
      "$APP_TARGET"/English.lproj/LaunchScreen.strings
echo "开屏 storyboard 已覆盖"

log "6/9 图标与本地化名称"
# 图标：SDK 的 AppIcon.appiconset 是**空目录**，ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon
# 指过去也拿不到图，桌面就显示白图标。图标是构建输入，随仓库一起走。
ASSET_DIR="$HELLO/HBuilder/Images.xcassets/AppIcon.appiconset"
mkdir -p "$ASSET_DIR"
rm -f "$ASSET_DIR"/*.png "$ASSET_DIR"/Contents.json
cp ci/appicon/AppIcon.appiconset/* "$ASSET_DIR"/
echo "图标集: $(ls "$ASSET_DIR" | wc -l) 个文件"

# 旧式 icon/ 目录：模板里若有脚本按文件名取图，一并覆盖
if [ -d "$APP_TARGET/icon" ]; then
  cp ci/appicon/legacy/icon*.png "$APP_TARGET/icon/" 2>/dev/null || echo "⚠️ legacy 图标未复制"
fi

# 名称：*.lproj/InfoPlist.strings 会盖掉 Info.plist 的 CFBundleDisplayName，
# SDK 模板里写的是「HBuilder Hello / HBuilder 你好」——只改 plist 不够。
python3 - "$APP_TARGET" "$APP_NAME" <<'PY'
import sys
from pathlib import Path

target, name = Path(sys.argv[1]), sys.argv[2]
body = (
    "/* Localized versions of Info.plist keys */\n"
    f'CFBundleDisplayName="{name}";\n'
    f'CFBundleName="{name}";\n'
)
count = 0
for p in target.glob("*.lproj/InfoPlist.strings"):
    # 原文就是 UTF-8（不是 UTF-16），保持同编码最稳
    p.write_text(body, encoding="utf-8")
    count += 1
print(f"本地化名称已写入 {count} 个 lproj")
PY

log "7/9 生成共享 Scheme"
# SDK 自带的 xcodeproj 没有 shared scheme，CI 上没法用 Xcode GUI 生成，
# 所以从 pbxproj 里解析出 HBuilder target 的 BlueprintIdentifier 后写一份。
# 用 python3 而不是 grep：pbxproj 里同名 target 有多处引用，
# 只有「24 位 id /* HBuilder */ = { isa = PBXNativeTarget;」这一处是真正的 target 定义。
TARGET_ID=$(PBXPROJ="$PBXPROJ" python3 - <<'PY'
import os, re
s = open(os.environ["PBXPROJ"], encoding="utf-8").read()
m = re.search(r"([0-9A-F]{24}) /\* HBuilder \*/ = \{\s*\n\s*isa = PBXNativeTarget;", s)
print(m.group(1) if m else "")
PY
)
[ -n "$TARGET_ID" ] || dump_and_die "未能从 pbxproj 解析 HBuilder target id"
echo "target id: $TARGET_ID"

SCHEME_DIR="$HELLO/HBuilder-Hello.xcodeproj/xcshareddata/xcschemes"
mkdir -p "$SCHEME_DIR"
sed "s/__TARGET_ID__/$TARGET_ID/g" ci/HBuilder.xcscheme > "$SCHEME_DIR/HBuilder.xcscheme"
echo "scheme: $SCHEME_DIR/HBuilder.xcscheme"

log "8/9 pod install"
cd "$HELLO"
if [ -f Podfile ]; then
  # 裁模块：SDK 默认把二十多个模块全带上，其中 Geolocation-Tencent 是 UTS 版
  # （Swift 6 编译，链接期报 `_swift_coroFrameAlloc` undefined）。
  # 基础集合 = Core + 文件/相册/网络/存储这几块；**再按 manifest 里的
  # app-plus.modules 追加**（如 Share），否则 JS 侧调得到、原生没编进去，
  # 真机报「打包时未添加 xxx 模块」而构建完全成功。
  python3 - "$HELLO/Podfile" "$RES_DIR" <<'PY'
import json
import os
import re
import sys

path, res_dir = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()

# 这些 subspec 是无论如何都要的（运行时底座与现有功能）
keep = [
    "Core",          # 运行时本体，必需
    "File",          # 文件系统（选 .md / plus.io）
    "CameraGallery", # 拍照与相册（碎片投递附图）
    "XMLHttpRequest",# 网络请求
    "Zip",           # Core 的解压依赖
    "Sqlite",        # App 端本地存储后端
    "Log",           # 日志，排障要用
    "Canvas",        # 视图层兜底（mp-html 渲染富文本）
]
# manifest.json 里启用的原生模块 -> Podfile subspec 名。
# 只列「模块名与 subspec 名不同 / 我们真会用到」的几项；其余同名不必映射。
MODULE_TO_POD = {
    "Camera": "CameraGallery",
    "Gallery": "CameraGallery",
    "Share": "Share",
    "Payment": "Payment",
    "Push": "Push",
    "Bluetooth": "Bluetooth",
    "Geolocation": "Geolocation",
}

manifest_path = os.path.join(res_dir, "manifest.json")
if not os.path.isfile(manifest_path):
    sys.exit("找不到 %s：无法按 manifest 追加原生模块（RES_DIR 是否指向 dist/build/app？）" % manifest_path)

with open(manifest_path, encoding="utf-8") as fh:
    cfg = json.load(fh)

# 两个位置都要看：
#   src/manifest.json（开发态）        -> app-plus.modules
#   dist/build/app/manifest.json（构建产物）-> permissions
# 只读其中一处会漏，表现就是「模块没编进去」但脚本一路绿灯。
module_names = set()
module_names.update((cfg.get("app-plus") or {}).get("modules") or {})
module_names.update(cfg.get("permissions") or {})

wanted = []
for name in sorted(module_names):
    pod = MODULE_TO_POD.get(name)
    if pod and pod not in keep and pod not in wanted:
        wanted.append(pod)

if wanted:
    keep = keep + wanted
    print("manifest 追加的 subspec:", ", ".join(wanted))

# 校验：Podfile 里不存在的名字会让 pod install 成功但原生缺模块 ——
# 真机报「打包时未添加 xxx 模块」。这里提前失败并列出可选项。
declared = re.search(r"uniapp_subspecs = \[(.*?)\]", src, re.S)
available = re.findall(r"['\"]([^'\"]+)['\"]", declared.group(1)) if declared else []


def resolve(name):
    """SDK 换版本时 subspec 名可能大小写不同或带前缀（Share / UniShare）。
    精确 -> 忽略大小写 -> 含关键字，三级降级，尽量避免一次白跑 12 分钟 CI。"""
    if not available or name in available:
        return name
    for cand in available:
        if cand.lower() == name.lower():
            return cand
    for cand in available:
        if name.lower() in cand.lower():
            return cand
    return name


keep = [resolve(name) for name in keep]
missing = [name for name in keep if available and name not in available]
if missing:
    sys.exit(
        "Podfile 没有这些 subspec: %s\n可选: %s" % (missing, ", ".join(available))
    )

block = "uniapp_subspecs = [\n" + "".join(f"  '{name}',\n" for name in keep) + "]"
new, count = re.subn(r"uniapp_subspecs = \[.*?\n\]", block, src, count=1, flags=re.S)
if not count:
    sys.exit("Podfile 里没找到 uniapp_subspecs 数组，SDK 结构可能变了")
open(path, "w", encoding="utf-8").write(new)
print("subspecs:", ", ".join(keep))
PY
  # 先直连 CDN 装（快），失败再拉全量 spec 重试（慢但稳）
  pod install || pod install --repo-update
else
  dump_and_die "没有 Podfile：这个 SDK 版本不是 Pod 方式集成，脚本需要改"
fi
cd - >/dev/null

log "9/9 编译（不签名）"
xcodebuild \
  -workspace "$HELLO/HBuilder-Hello.xcworkspace" \
  -scheme HBuilder \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$WORK/build" \
  -destination "generic/platform=iOS" \
  MARKETING_VERSION="$VERSION_NAME" \
  CURRENT_PROJECT_VERSION="$VERSION_CODE" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  build

log "打包成未签名 IPA"
APP_PATH=$(find "$WORK/build/Build/Products" -maxdepth 3 -name "*.app" -type d | head -1 || true)
[ -n "$APP_PATH" ] || dump_and_die "未找到编译产物 .app"
echo "app: $APP_PATH"

mkdir -p "$OUT_DIR/Payload"
cp -R "$APP_PATH" "$OUT_DIR/Payload/"
cd "$OUT_DIR"
# 未签名 IPA 的标准结构：Payload/<name>.app 压成 zip 后改名 .ipa
zip -qry "garden-unsigned.ipa" Payload
cd - >/dev/null

echo
echo "✅ 产物: $OUT_DIR/garden-unsigned.ipa ($(du -h "$OUT_DIR/garden-unsigned.ipa" | cut -f1))"
echo "   安装：传到 iPhone → TrollShare/TrollStore 打开 → Install"

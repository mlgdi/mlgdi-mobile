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

log "1/8 解压离线 SDK"
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

log "2/8 放入 uni-app 资源"
# 清掉 SDK 自带的示例 app，只留我们的
rm -rf "$APP_TARGET"/Pandora/apps/__UNI__*
APPS_DIR="$APP_TARGET/Pandora/apps/$APPID"
mkdir -p "$APPS_DIR"
rm -rf "$APPS_DIR/www"
cp -R "$RES_DIR" "$APPS_DIR/www"
[ -f "$APPS_DIR/www/app-service.js" ] || dump_and_die "资源里没有 app-service.js，检查 RES_DIR 是否指向 dist/build/app"
echo "资源: $(du -sh "$APPS_DIR/www" | cut -f1)"

log "3/8 登记 appid / 版本（control.xml）"
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

log "4/8 写 Bundle ID"
# 只改主 App target 的 io.dcloud.HBuilder；另一个 target（com.dcloud.XXX）是插件示例，不动
BEFORE=$(grep -c "io.dcloud.HBuilder" "$PBXPROJ" || true)
sedi "s/io\.dcloud\.HBuilder/$BUNDLE_ID/g" "$PBXPROJ"
# 中文全角括号紧跟在变量后面时，bash 会把「（」当成变量名的一部分（实测 unbound variable），
# 所以这里一律用 ${} 包住
echo "替换 io.dcloud.HBuilder → ${BUNDLE_ID}（共 ${BEFORE} 处）"

log "5/8 写 AppKey / 显示名 / 版本（Info.plist）"
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

log "6/8 生成共享 Scheme"
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

log "7/8 pod install"
cd "$HELLO"
if [ -f Podfile ]; then
  # Podfile 的 subspec 列表决定本工程集成的模块（CameraGallery / File / XmlHttpRequest…）。
  # 先直连 CDN 装（快），失败再拉全量 spec 重试（慢但稳）。
  pod install || pod install --repo-update
else
  dump_and_die "没有 Podfile：这个 SDK 版本不是 Pod 方式集成，脚本需要改"
fi
cd - >/dev/null

log "8/8 编译（不签名）"
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

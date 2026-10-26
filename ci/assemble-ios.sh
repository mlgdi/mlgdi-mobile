#!/usr/bin/env bash
# 组装 iOS 离线打包工程（在 GitHub Actions 的 macOS runner 上执行）
#
# 输入（环境变量）：
#   SDK_ZIP         DCloud iOS 离线 SDK 压缩包路径
#   APPID           DCloud appid，如 __UNI__1877F1B
#   BUNDLE_ID       iOS Bundle ID，如 com.mlgdi.garden
#   DCLOUD_APPKEY   离线打包 AppKey（dev.dcloud.net.cn 申请）
#   RES_DIR         uni-app 编译产物目录（dist/build/app）
#   OUT_DIR         输出目录（.app 所在）
#
# 为什么不用 kxbuild/uniapp2xcode：那类工具面向 HBuilderX 工程，还要在本机装
# CocoaPods；CI 上直接解压官方 SDK 自带的 HBuilder-Hello 工程更少依赖、更好排查。
#
# 设计原则：**每一处依赖 SDK 目录结构的假设都先探测再使用**，探测不到就打印目录树并退出，
# 让第一次 CI 运行就能把真实结构暴露出来，而不是猜错路径后报一堆莫名其妙的编译错误。

set -euo pipefail

SDK_ZIP="${SDK_ZIP:?需要 SDK_ZIP}"
APPID="${APPID:?需要 APPID}"
BUNDLE_ID="${BUNDLE_ID:-com.mlgdi.garden}"
DCLOUD_APPKEY="${DCLOUD_APPKEY:-}"
RES_DIR="${RES_DIR:-dist/build/app}"
OUT_DIR="${OUT_DIR:-$PWD/ios-out}"
WORK="${WORK:-$PWD/.ios-work}"

log() { printf '\n==== %s ====\n' "$*"; }

fail_with_tree() {
  echo "❌ $1" >&2
  echo "---- 目录树（用于定位真实结构）----" >&2
  find "$WORK" -maxdepth 3 -not -path '*/node_modules/*' | head -80 >&2
  exit 1
}

rm -rf "$WORK" "$OUT_DIR"
mkdir -p "$WORK" "$OUT_DIR"

log "解压离线 SDK"
unzip -q "$SDK_ZIP" -d "$WORK/sdk"
HELLO_DIR=$(find "$WORK/sdk" -maxdepth 4 -type d -name "HBuilder-Hello" | head -1 || true)
[ -n "$HELLO_DIR" ] || fail_with_tree "SDK 里没找到 HBuilder-Hello 工程目录"
echo "HBuilder-Hello: $HELLO_DIR"

SDK_ROOT=$(dirname "$HELLO_DIR")
echo "SDK 根目录: $SDK_ROOT"

log "放入 uni-app 编译产物"
APP_DIR="$HELLO_DIR/apps/$APPID"
mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/www"
cp -R "$RES_DIR" "$APP_DIR/www"
echo "资源大小: $(du -sh "$APP_DIR/www" | cut -f1)"

log "写入 Bundle ID"
# 工程文件里的 PRODUCT_BUNDLE_IDENTIFIER 统一替换成我们的
find "$HELLO_DIR" -name "project.pbxproj" -print0 | while IFS= read -r -d '' pbx; do
  echo "patch $pbx"
  sed -i '' -E "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" "$pbx" 2>/dev/null \
    || sed -i -E "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" "$pbx"
done

log "写入 AppKey"
INFO_PLIST=$(find "$HELLO_DIR" -maxdepth 3 -name "Info.plist" | head -1 || true)
if [ -n "$INFO_PLIST" ] && [ -n "$DCLOUD_APPKEY" ]; then
  echo "patch $INFO_PLIST"
  /usr/libexec/PlistBuddy -c "Delete :dcloud_appkey" "$INFO_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :dcloud_appkey string $DCLOUD_APPKEY" "$INFO_PLIST"
elif [ -z "$DCLOUD_APPKEY" ]; then
  echo "⚠️  未提供 DCLOUD_APPKEY：App 启动会提示 AppKey 错误（编译能过）"
fi

log "同步 control.xml 的 appid"
CONTROL=$(find "$HELLO_DIR" -name "control.xml" | head -1 || true)
if [ -n "$CONTROL" ]; then
  echo "patch $CONTROL"
  sed -i '' -E "s/appid=\"[^\"]*\"/appid=\"$APPID\"/" "$CONTROL" 2>/dev/null \
    || sed -i -E "s/appid=\"[^\"]*\"/appid=\"$APPID\"/" "$CONTROL"
else
  echo "⚠️  未找到 control.xml（新版本 SDK 可能已移除，跳过）"
fi

log "CocoaPods"
cd "$HELLO_DIR"
if [ -f Podfile ]; then
  # 只装离线工程需要的 subspec；网络不稳时重试一次
  pod install --repo-update || pod install
else
  echo "无 Podfile，直接用 .xcodeproj 编译"
fi
cd - >/dev/null

log "编译（不签名）"
PROJ_ARGS=()
WORKSPACE=$(find "$HELLO_DIR" -maxdepth 1 -name "*.xcworkspace" | head -1 || true)
if [ -n "$WORKSPACE" ]; then
  PROJ_ARGS=(-workspace "$WORKSPACE")
else
  XCODEPROJ=$(find "$HELLO_DIR" -maxdepth 1 -name "*.xcodeproj" | head -1 || true)
  PROJ_ARGS=(-project "$XCODEPROJ")
fi

SCHEME=$(find "$HELLO_DIR" -maxdepth 2 -name "*.xcscheme" -exec basename {} .xcscheme \; | head -1)
SCHEME="${SCHEME:-HBuilder}"
echo "scheme: $SCHEME"

xcodebuild "${PROJ_ARGS[@]}" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$WORK/build" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

log "打包成未签名 IPA"
APP_PATH=$(find "$WORK/build" -name "*.app" -type d -maxdepth 5 | head -1 || true)
[ -n "$APP_PATH" ] || fail_with_tree "没找到编译产物 .app"
echo "app: $APP_PATH"

mkdir -p "$OUT_DIR/Payload"
cp -R "$APP_PATH" "$OUT_DIR/Payload/"
cd "$OUT_DIR"
zip -qry "garden-unsigned.ipa" Payload
cd - >/dev/null

echo
echo "✅ 产物: $OUT_DIR/garden-unsigned.ipa ($(du -h "$OUT_DIR/garden-unsigned.ipa" | cut -f1))"
echo "   安装：传到 iPhone → TrollStore 打开 → 安装"

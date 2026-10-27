<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initTheme, recomputeTheme } from './shared/theme'
import { askClipboardIntake, handleExternalOpen } from './shared/utils/intake'

/**
 * 顶部安全区 `--safe-top`：按平台的**真实情况**算，而不是照抄 `env()`。
 *
 * 为什么会出错：`env(safe-area-inset-top)` 在 App 的 WKWebView 里照样返回 59pt，
 * 但页面本身已经被 uni 让到状态栏下方了（`manifest` 没开 `statusbar.immersed`）。
 * 于是顶栏里 `height` 含一次、`padding-top` 又来一次，整整多出一格状态栏的空白。
 *
 * 现在的判据：
 * - App 端先问 `plus.navigator.isImmersedStatusbar()`——**只有沉浸式**才需要自己
 *   让开状态栏，此时按机器的 `statusBarHeight` 垫；
 * - plus 还没就绪（极少见）时退化为看 `windowTop`：`0` 表示 webview 从屏幕顶端
 *   开始，按「可能被遮挡」保守处理；
 * - H5 完全不走这里：浏览器里页面从视口顶端开始，CSS 的 `env()` 才是权威。
 */
function applySafeTop(): void {
  // #ifdef APP-PLUS
  let pad = 0
  try {
    const plusAny = (globalThis as any).plus
    const nav = plusAny?.navigator
    if (typeof nav?.isImmersedStatusbar === 'function') {
      if (nav.isImmersedStatusbar() === true) {
        pad = Number(uni.getSystemInfoSync().statusBarHeight) || 0
      }
    } else {
      // 退化：拿不到沉浸式标记时，只有 windowTop===0 才认为页面是全屏的
      const windowTop = Number((uni.getSystemInfoSync() as any).windowTop)
      if (Number.isFinite(windowTop) && windowTop === 0) {
        pad = Number(uni.getSystemInfoSync().statusBarHeight) || 0
      }
    }
  } catch {
    pad = 0
  }
  try {
    document.documentElement.style.setProperty('--safe-top', `${pad}px`)
  } catch {
    /* DOM 不可用时保持 CSS 里的 0 兜底 */
  }
  // #endif
}

onLaunch(() => {
  initTheme()
  applySafeTop()
})

onShow(() => {
  // 从后台切回来时系统主题可能已变
  recomputeTheme()
  // 分屏 / 转屏 / 窗口尺寸变化后 windowTop 会变，重算一次
  applySafeTop()
  // 别的 App 通过 mlgdi:// scheme 递进来的内容（热启动在这里，冷启动也走这里：
  // plus.runtime.arguments 冷热启动都保留）
  handleExternalOpen()
  // 剪贴板：切回来时发现像样的内容就弹窗问一句要不要收
  void askClipboardIntake()
})
</script>

<style>
/* highlight.js token 配色（从 Web 的 hljs-vscode.css 转换，只改选择器前缀） */
@import './styles/hljs.css';
/* ---------------------------------------------------------------------------
   设计 Token：与网页版 `.app/frontend/src/styles/tokens.css` 同源。
   差异只有单位——这里全部用 rpx（750 画板），网页用 px。改色时两边一起改。

   Apple 式层次：白 / 羊皮纸双色面，近黑墨水字，唯一强调色 Action Blue，
   层次靠面色变化表达，阴影只留给弹层。
   --------------------------------------------------------------------------- */
page {
  background-color: #ffffff;
}

@media (prefers-color-scheme: dark) {
  page {
    background-color: #161617;
  }
}

.theme-light {
  /* 面 */
  --bg: #ffffff;
  --bg-secondary: #f5f5f7;
  --surface: #ffffff;
  --surface-2: #f5f5f7;
  --bg-hover: #e8e8ed;
  --bg-translucent: rgba(255, 255, 255, 0.88);
  /* 线 */
  --line: #e0e0e0;
  --line-strong: #d2d2d7;
  /* 字 */
  --text: #1d1d1f;
  --text-2: #48484a;
  --muted: #6e6e73;
  --faint: #86868b;
  --placeholder: #a1a1a6;
  /* 色 */
  --accent: #0066cc;
  --accent-hover: #0058a3;
  --accent-soft: #e9f2fb;
  --danger: #e30000;
  --ok: #157f3d;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 20rpx 60rpx rgba(0, 0, 0, 0.22);
}

.theme-dark {
  --bg: #161617;
  --bg-secondary: #1d1d1f;
  --surface: #272729;
  --surface-2: #272729;
  --bg-hover: #333336;
  --bg-translucent: rgba(22, 22, 23, 0.88);
  --line: #38383a;
  --line-strong: #48484a;
  --text: #f5f5f7;
  --text-2: #d1d1d6;
  --muted: #a1a1a6;
  --faint: #86868b;
  --placeholder: #6e6e73;
  --accent: #2997ff;
  --accent-hover: #56a9ff;
  --accent-soft: rgba(41, 151, 255, 0.16);
  --danger: #ff453a;
  --ok: #30d158;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 20rpx 60rpx rgba(0, 0, 0, 0.65);
}

/* 顶部安全区：App 端由 App.vue 的 applySafeTop() 写进 <html> 的行内变量
   （按 windowTop 判断是不是沉浸式，不能照抄 env——env 会与已让开的状态栏重复）。
   H5 端不写行内变量，用这里的 env 兜底。两者不会互相覆盖。 */
/* #ifdef H5 */
:root {
  --safe-top: env(safe-area-inset-top, 0px);
}
/* #endif */

/* 圆角三级 + 胶囊（禁止再用 9/12/14 这类中间值） */
.theme-light,
.theme-dark {
  --r-sm: 16rpx;
  --r-md: 22rpx;
  --r-lg: 36rpx;
  --r-full: 9999rpx;
  /* 字号阶梯：正文 34rpx = 17pt，与网页 17px 对齐 */
  --fs-2xl: 52rpx;
  --fs-xl: 44rpx;
  --fs-lg: 38rpx;
  --fs-base: 34rpx;
  --fs-sm: 28rpx;
  --fs-xs: 24rpx;
  --fs-2xs: 20rpx;
  --space-sm: 16rpx;
  --space-md: 32rpx;
  --space-lg: 48rpx;
  --page-gutter: 32rpx;
  /* TabBar 总高（不含安全区）：112rpx = 56pt，比 iOS 49pt 略高，
     目的是让整格命中区更大、视觉更稳 */
  --tabbar-h: 112rpx;
  /* 顶栏内容高度（不含安全区）：96rpx = 48pt，比 iOS 标准 44pt 略松一点，
     图标与标题不贴边。**高度只在这里定义**，页面别再写死 88/96 */
  --topbar-h: 96rpx;
}

.page {
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}

/* 顶部安全区 + 自定义导航栏（navigationStyle: custom） */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0 32rpx;
  padding-top: calc(var(--safe-top, 0px) + 16rpx);
  padding-bottom: 16rpx;
  background-color: var(--bg);
  border-bottom: 1rpx solid transparent;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.topbar-title {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.6rpx;
  /* 长标题必须截断：否则会把右侧「保存」挤出屏幕（编辑器页踩过） */
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-spacer {
  flex: 1;
}

.icon-btn {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  color: var(--text-2);
}

.icon-btn:active {
  background-color: var(--bg-hover);
}

.card {
  background-color: var(--surface);
  border-radius: var(--r-md);
  border: 1rpx solid var(--line);
}

.muted {
  color: var(--muted);
}

.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

/* 按钮：只有四种 —— 主 / 次 / 文字 / 危险文字 */
.btn {
  height: 88rpx;
  border-radius: var(--r-full);
  background-color: var(--accent);
  color: #fff;
  font-size: var(--fs-base);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  /* uni-button 默认 content-box + 自带内边距，不加这句会横向溢出容器 */
  box-sizing: border-box;
}

.btn:active {
  background-color: var(--accent-hover);
}

.btn-ghost {
  background-color: var(--surface-2);
  color: var(--text);
}

.btn-ghost:active {
  background-color: var(--bg-hover);
}

.btn-text {
  background-color: transparent;
  color: var(--accent);
  font-size: var(--fs-sm);
  font-weight: 500;
  height: 88rpx;
  padding: 0;
}

.btn-danger {
  background-color: transparent;
  color: var(--danger);
  font-size: var(--fs-sm);
  font-weight: 500;
  height: 88rpx;
  padding: 0;
}

.btn[disabled] {
  /* 不要用 opacity：白字压在白底的半透明蓝上会彻底看不见（编辑器「保存」踩过） */
  background-color: var(--surface-2);
  color: var(--faint);
  opacity: 1;
}

.field {
  width: 100%;
  height: 88rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
  border-radius: var(--r-sm);
  border: 1rpx solid transparent;
  background-color: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-base);
}

.divider {
  height: 1px;
  background-color: var(--line);
}

/* 正文排版：mp-html 渲染出来的内容统一走这里 */
.md-body {
  font-size: 17px;
  line-height: 1.75;
  color: var(--text-2);
  word-break: break-word;
}

.md-body p {
  margin: 0 0 1.05em;
}

.md-body h1,
.md-body h2,
.md-body h3 {
  color: var(--text);
  line-height: 1.35;
  margin: 1.6em 0 0.7em;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.md-body h1 {
  font-size: 24px;
}

.md-body h2 {
  font-size: 21px;
}

.md-body h3 {
  font-size: 18px;
}

.md-body a {
  color: var(--accent);
  text-decoration: none;
}

.md-body .garden-wikilink {
  border-bottom: 1px dashed var(--accent);
}

.md-body blockquote {
  margin: 0 0 1.1em;
  padding: 2px 0 2px 14px;
  border-left: 3px solid var(--line);
  color: var(--muted);
}

.md-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background-color: var(--surface-2);
  padding: 2px 5px;
  border-radius: 5px;
}

.md-body pre {
  background-color: var(--surface-2);
  padding: 14px;
  border-radius: 12px;
  overflow-x: auto;
  margin: 0 0 1.2em;
}

.md-body pre code {
  background: none;
  padding: 0;
  font-size: 13px;
  line-height: 1.6;
}

.md-body img {
  max-width: 100%;
  border-radius: 10px;
  margin: 0.4em 0 1.2em;
}

.md-body ul,
.md-body ol {
  padding-left: 1.3em;
  margin: 0 0 1.1em;
}

.md-body li {
  margin-bottom: 0.35em;
}

.md-body hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 2em 0;
}

.md-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.2em;
  font-size: 15px;
}

.md-body th,
.md-body td {
  border: 1px solid var(--line);
  padding: 8px 10px;
  text-align: left;
}
</style>

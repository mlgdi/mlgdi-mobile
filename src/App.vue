<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { initTheme, recomputeTheme } from './shared/theme'

onLaunch(() => {
  initTheme()
})

onShow(() => {
  // 从后台切回来时系统主题可能已变
  recomputeTheme()
})
</script>

<style>
/* ---------------------------------------------------------------------------
   全局设计变量。页面根节点挂 .theme-light / .theme-dark，
   变量只定义一次，组件内一律用 var()，不做主题相关的重复样式。
   --------------------------------------------------------------------------- */
page {
  background-color: #f7f7f8;
}

.theme-light {
  --bg: #f7f7f8;
  --surface: #ffffff;
  --surface-2: #f1f1f3;
  --text: #1c1c1e;
  --text-2: #3a3a3c;
  --muted: #6e6e73;
  --line: rgba(0, 0, 0, 0.08);
  --accent: #0066cc;
  --accent-soft: rgba(0, 102, 204, 0.1);
  --danger: #c8322b;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.theme-dark {
  --bg: #0b0b0d;
  --surface: #17171a;
  --surface-2: #202024;
  --text: #f2f2f7;
  --text-2: #d6d6dc;
  --muted: #9a9aa0;
  --line: rgba(255, 255, 255, 0.1);
  --accent: #4c9aff;
  --accent-soft: rgba(76, 154, 255, 0.16);
  --danger: #ff6b63;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
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
  padding: 0 16px;
  padding-top: calc(env(safe-area-inset-top) + 8px);
  padding-bottom: 8px;
  background-color: var(--bg);
  border-bottom: 1px solid transparent;
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.4px;
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
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--muted);
  font-size: 18px;
}

.icon-btn:active {
  background-color: var(--surface-2);
}

.card {
  background-color: var(--surface);
  border-radius: 14px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

.muted {
  color: var(--muted);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn {
  height: 48px;
  border-radius: 12px;
  background-color: var(--accent);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  /* uni-button 默认 content-box + 自带内边距，不加这句会横向溢出容器 */
  box-sizing: border-box;
}

.btn:active {
  opacity: 0.85;
}

.btn-ghost {
  background-color: transparent;
  color: var(--text);
  border: 1px solid var(--line);
}

.btn[disabled] {
  /* 不要用 opacity：白字压在白底的半透明蓝上会彻底看不见（编辑器「保存」踩过） */
  background-color: var(--surface-2);
  color: var(--muted);
  opacity: 1;
}

.field {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--line);
  background-color: var(--surface-2);
  color: var(--text);
  font-size: 16px;
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

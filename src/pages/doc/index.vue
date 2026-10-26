<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back :title="scrolled ? doc?.title || '阅读' : ''" :elevated="scrolled" @back="back">
      <template #actions>
        <view v-if="toc.length > 1" class="icon-btn" @click="openToc">
          <GIcon name="list" :size="38" />
        </view>
        <view v-if="canEdit && doc" class="icon-btn" @click="toEdit">
          <GIcon name="pencil" :size="36" />
        </view>
      </template>
    </GTopBar>

    <!-- 阅读进度：2rpx 细线，用栏目色，不抢视觉 -->
    <view v-if="doc && progress > 0" class="progress">
      <view class="progress-bar" :style="{ width: progress + '%', background: colMain }" />
    </view>

    <view v-if="loading" class="hint">
      <text class="muted">正在打开…</text>
    </view>

    <view v-else-if="error" class="hint">
      <text class="muted">{{ error }}</text>
      <button class="btn btn-ghost retry" @click="load">重试</button>
    </view>

    <view v-else-if="doc" class="article">
      <text class="a-title">{{ doc.title }}</text>

      <view class="a-meta">
        <text
          v-if="col"
          class="a-col"
          :style="{ color: colInk, background: tint(colMain, 0.14) }"
        >
          {{ col.code }} · {{ col.name }}
        </text>
        <text class="a-dim">{{ formatDate(doc.updated_at) }}</text>
        <text class="a-dot">·</text>
        <text class="a-dim">{{ doc.word_count }} 字</text>
        <template v-if="readMinutes">
          <text class="a-dot">·</text>
          <text class="a-dim">约 {{ readMinutes }} 分钟</text>
        </template>
      </view>

      <view class="a-rule" />

      <view class="md" @click="onBodyTap">
        <view class="md-inner" v-html="html"></view>
      </view>

      <!-- 反链：知识中枢的核心，阅读页底部必须能顺着走。
           两个方向都列：谁引用了本篇（带原文上下文），本篇又引了谁。 -->
      <view v-if="incoming.length" class="bl">
        <view class="bl-head">
          <GIcon name="link" :size="28" />
          <text class="bl-title">被 {{ incoming.length }} 篇引用</text>
        </view>
        <view
          v-for="item in incoming"
          :key="item.doc_id"
          class="bl-item"
          @click="openDoc(item.doc_id)"
        >
          <text v-if="item.context" class="bl-ctx">{{ cleanContext(item.context) }}</text>
          <view class="bl-row">
            <text class="bl-name">{{ item.title }}</text>
            <text class="bl-path">{{ shortPath(item.path) }}</text>
          </view>
        </view>
      </view>

      <view v-if="outgoing.length" class="bl">
        <view class="bl-head">
          <GIcon name="chevron-right" :size="26" />
          <text class="bl-title">本篇引用 {{ outgoing.length }} 篇</text>
        </view>
        <view
          v-for="item in outgoing"
          :key="item.doc_id || item.target"
          class="out-item"
          @click="openDoc(item.doc_id || '')"
        >
          <text class="out-name">{{ item.title || item.target }}</text>
          <GIcon name="chevron-right" :size="26" />
        </view>
      </view>

      <view class="a-foot">
        <text class="a-foot-text">以上是全文</text>
      </view>
    </view>

    <!-- 目录：底部抽屉。手机上侧栏目录会挤掉正文，抽屉才是常见解 -->
    <view v-if="tocOpen" class="mask" @click="closeToc" />
    <view :class="['sheet', { 'is-open': tocOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">目录</text>
        <text class="sheet-count">{{ toc.length }} 节</text>
      </view>
      <scroll-view class="sheet-body" scroll-y :show-scrollbar="false">
        <view
          v-for="item in toc"
          :key="item.id"
          :class="['toc-item', `lv${item.level}`, { 'is-on': item.id === activeId }]"
          @click="jump(item.id)"
        >
          <text class="toc-text">{{ item.text }}</text>
        </view>
        <view class="sheet-tail" />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onPageScroll } from '@dcloudio/uni-app'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { doc as apiDoc, type DocDetail } from '../../shared/api/notes'
import { renderMarkdown, type TocItem } from '../../shared/utils/markdown'
import { useNotesStore } from '../../shared/store/notes'
import { columnByPath, tint } from '../../shared/config/columns'
import { resolvedTheme } from '../../shared/theme'
import { capabilities } from '../../shared/capabilities'

const canEdit = capabilities.canEdit

const notes = useNotesStore()
const doc = ref<DocDetail | null>(null)
const html = ref('')
const toc = ref<TocItem[]>([])
const loading = ref(true)
const error = ref('')
const docId = ref('')

const scrolled = ref(false)
const progress = ref(0)
const tocOpen = ref(false)
const activeId = ref('')
/** 标题到文档顶部的距离，只在布局稳定后量一次，滚动时只做比较 */
let offsets: number[] = []

const col = computed(() => (doc.value ? columnByPath(doc.value.path) : undefined))

/** 栏目色按主题取：深色模式下 main/ink 的浅色版在 #161617 上不够亮 */
const colMain = computed(() => {
  const c = col.value
  if (!c) return resolvedTheme.value === 'dark' ? '#2997ff' : '#0066cc'
  return resolvedTheme.value === 'dark' ? c.mainDark : c.main
})
const colInk = computed(() => {
  const c = col.value
  if (!c) return resolvedTheme.value === 'dark' ? '#7cc0ff' : '#0058a3'
  return resolvedTheme.value === 'dark' ? c.inkDark : c.ink
})

const incoming = computed(() => doc.value?.backlinks?.incoming || [])
/** 只看解析成功的出链：未解析的是「还没有这篇」，点进去也没有目标 */
const outgoing = computed(() =>
  (doc.value?.backlinks?.outgoing || []).filter((l) => l.resolved && l.doc_id),
)

const readMinutes = computed(() => {
  const n = doc.value?.word_count || 0
  return n > 400 ? Math.max(1, Math.round(n / 400)) : 0
})

/** 正文里的图片，供左右滑动预览（previewImage 需要完整列表） */
const imageList = computed<string[]>(() => {
  const out: string[] = []
  const re = /<img[^>]+src="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html.value))) out.push(m[1].replace(/&amp;/g, '&'))
  return out
})

function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 引用上下文里带着 `[[标题]]` 原文，展示时剥掉方括号更干净 */
function cleanContext(raw: string): string {
  return (raw || '')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    // 只压「中文 + 空格 + 中文」；`vault 里的` 这种中英混排必须保留空格
    .replace(/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/g, '$1$2')
    .trim()
}

/** 反链路径只留父目录的最后两级，`02_Booklets/…/01-心智模型.md` → `01-认知篇` */
function shortPath(path: string): string {
  const parts = (path || '').split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(1, -1).join(' / ')
}

async function load(): Promise<void> {
  if (!docId.value) return
  loading.value = true
  error.value = ''
  try {
    const detail = await apiDoc(docId.value)
    doc.value = detail
    const result = renderMarkdown(detail.body || '')
    html.value = result.html
    toc.value = result.toc
    uni.setNavigationBarTitle?.({ title: detail.title || '文档' })
    await nextTick()
    // 图片会改变布局，量两次：一次立即，一次等图片落位
    setTimeout(measure, 120)
    setTimeout(measure, 700)
  } catch (err: any) {
    error.value = err?.reason || err?.message || '打开失败'
  } finally {
    loading.value = false
  }
}

/** 量出每个标题相对文档的纵向位置 */
function measure(): void {
  if (typeof document === 'undefined') return
  offsets = toc.value.map((item) => {
    const el = document.getElementById(item.id)
    if (!el) return -1
    return el.getBoundingClientRect().top + window.scrollY
  })
  if (toc.value.length && !activeId.value) activeId.value = toc.value[0].id
}

function back(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/library/index' })
  }
}

function toEdit(): void {
  if (!doc.value) return
  uni.navigateTo({ url: `/pages/edit/index?id=${encodeURIComponent(doc.value.id)}` })
}

function openDoc(id: string): void {
  uni.navigateTo({ url: `/pages/doc/index?id=${encodeURIComponent(id)}` })
}

function openToc(): void {
  tocOpen.value = true
}

function closeToc(): void {
  tocOpen.value = false
}

/**
 * 目录跳转。
 *
 * 不用 selectorQuery：v-html 生成的节点不在 Vue 组件树里，选择器查不到。
 * webview 里就是普通 DOM，直接算位置最可靠。
 */
function jump(id: string): void {
  if (typeof document !== 'undefined') {
    const el = document.getElementById(id)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 96
      uni.pageScrollTo({ scrollTop: Math.max(0, top), duration: 240 })
    }
  }
  activeId.value = id
  tocOpen.value = false
}

onPageScroll((e) => {
  const top = e.scrollTop
  scrolled.value = top > 8

  if (typeof document === 'undefined') return
  const total = document.documentElement.scrollHeight - window.innerHeight
  progress.value = total > 0 ? Math.min(100, Math.max(0, (top / total) * 100)) : 0

  // 当前章节 = 最后一个「已滚过」的标题
  if (!offsets.length) return
  let current = ''
  toc.value.forEach((item, i) => {
    if (offsets[i] >= 0 && offsets[i] - 120 <= top) current = item.id
  })
  if (!current && toc.value.length) current = toc.value[0].id
  if (!current && toc.value.length) current = toc.value[0].id
  if (current && current !== activeId.value) activeId.value = current
})

/**
 * 正文点击统一委托。
 *
 * H5 里 target 是原生节点，用 closest 精确命中；App 端 uni 只给 dataset，
 * 所以链接内部不能有嵌套元素（渲染时就保证是纯文本），dataset 才落在 target 上。
 */
function onBodyTap(e: any): void {
  const target = e?.target

  if (target && typeof target.closest === 'function') {
    const wl = target.closest('[data-wl]') as HTMLElement | null
    if (wl?.dataset.wl) {
      void openWikilink(decodeURIComponent(wl.dataset.wl))
      return
    }
    const ext = target.closest('[data-ext]') as HTMLElement | null
    if (ext?.dataset.ext) {
      copyLink(ext.dataset.ext)
      return
    }
    const img = target.closest('.md-img') as HTMLImageElement | null
    if (img?.src) {
      previewImage(img.src)
      return
    }
    return
  }

  const ds = (target?.dataset || {}) as Record<string, string>
  if (ds.wl) {
    void openWikilink(decodeURIComponent(ds.wl))
    return
  }
  if (ds.ext) {
    copyLink(ds.ext)
    return
  }
  if (ds.img) previewImage(ds.img)
}

async function openWikilink(title: string): Promise<void> {
  if (!notes.docs.length) {
    try {
      await notes.load()
    } catch {
      /* 忽略：下面按未找到处理 */
    }
  }
  const id = notes.findIdByTitle(title)
  if (id) {
    openDoc(id)
  } else {
    uni.showToast({ title: `未找到：${title}`, icon: 'none' })
  }
}

function copyLink(url: string): void {
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '外部链接已复制', icon: 'none' }),
  })
}

function previewImage(src: string): void {
  const urls = imageList.value.length ? imageList.value : [src]
  uni.previewImage({ urls, current: src })
}

onLoad((options: any) => {
  docId.value = String((options && options.id) || '')
  load()
})
</script>

<style scoped>
/* ---------------- 进度条 ---------------- */
.progress {
  position: fixed;
  left: 0;
  right: 0;
  /* 顶栏 88rpx + 安全区：进度条贴在顶栏下沿 */
  top: calc(env(safe-area-inset-top) + 88rpx);
  height: 2rpx;
  z-index: 79;
  background-color: transparent;
}

.progress-bar {
  height: 100%;
  transition: width 120ms linear;
}

/* ---------------- 头部 ---------------- */
.article {
  padding: 16rpx var(--page-gutter) 0;
}

.a-title {
  display: block;
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.32;
  letter-spacing: -0.8rpx;
  color: var(--text);
}

.a-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 20rpx;
}

.a-col {
  font-size: var(--fs-2xs);
  font-weight: 600;
  padding: 4rpx 14rpx;
  border-radius: var(--r-full);
}

.a-dim {
  font-size: var(--fs-xs);
  color: var(--faint);
}

.a-dot {
  font-size: var(--fs-xs);
  color: var(--faint);
}

.a-rule {
  height: 1rpx;
  background-color: var(--line);
  /* 下侧 24rpx：首个标题的 margin-top 被 `*:first-child` 归零，
     不留间距的话标题会贴着分隔线 */
  margin: 28rpx 0 24rpx;
}

/* ---------------- 正文排版（对齐 Web .prose） ----------------
   换算原则：Web 正文 19px / 行高 1.78 → 手机 34rpx（17pt）。
   手机行长只有 40 字左右，19pt 会让折行太密；17pt 是 iOS 正文档位。
   标题用 em 而非固定 rpx：这样改正文基准字号时，整条阶梯自动跟随。 */
.md {
  font-size: var(--fs-base);
  line-height: 1.78;
  letter-spacing: 0.01em;
  color: var(--text);
  word-wrap: break-word;
}

.md-inner :deep(> *:first-child) {
  margin-top: 0;
}

.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4),
.md :deep(h5),
.md :deep(h6) {
  font-weight: 600;
  line-height: 1.32;
  letter-spacing: -0.02em;
  /* Web 是 1.9em：那边行长 40+ 字，标题需要更大的呼吸；手机一行只有 18 字，
     1.9em 会切出一条 40px 的空白沟，降到 1.55em */
  margin: 1.55em 0 0.6em;
  scroll-margin-top: 96rpx;
}

.md :deep(h1) {
  font-size: 1.72em;
}

.md :deep(h2) {
  font-size: 1.36em;
  padding-bottom: 0.28em;
  border-bottom: 1rpx solid var(--line);
}

.md :deep(h3) {
  font-size: 1.14em;
}

.md :deep(h4),
.md :deep(h5),
.md :deep(h6) {
  font-size: 1em;
  color: var(--muted);
}

.md :deep(p) {
  margin: 0 0 1.1em;
}

.md :deep(ul),
.md :deep(ol) {
  margin: 0 0 1.1em;
  padding-left: 1.4em;
}

.md :deep(li) {
  margin: 0.3em 0;
}

.md :deep(li::marker) {
  color: var(--faint);
}

.md :deep(blockquote) {
  margin: 1.4em 0;
  padding: 0.6em 1em;
  border-left: 6rpx solid var(--accent);
  background-color: var(--surface-2);
  color: var(--muted);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}

.md :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.md :deep(hr) {
  border: 0;
  border-top: 1rpx solid var(--line);
  margin: 2.4em 0;
}

.md :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.4em auto;
  border-radius: var(--r-md);
}

/* 宽表在手机上必须能横向滑：table 自身设 overflow 无效，必须外包一层 */
.md :deep(.md-table) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 1.2em 0;
}

.md :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.93em;
}

.md :deep(th),
.md :deep(td) {
  border: 1rpx solid var(--line);
  padding: 14rpx 18rpx;
  text-align: left;
  white-space: nowrap;
}

.md :deep(th) {
  background-color: var(--surface-2);
  font-weight: 600;
}

/* 行内 code；代码块里的 code 由下面单独重置 */
.md :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.86em;
  background-color: var(--surface-2);
  border: 1rpx solid var(--line);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
  color: var(--text);
}

.md :deep(pre) {
  margin: 1.2em 0;
  padding: 22rpx 24rpx;
  background-color: var(--surface-2);
  border: 1rpx solid var(--line);
  border-radius: var(--r-sm);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.md :deep(pre code) {
  display: block;
  background-color: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  font-size: 28rpx;
  line-height: 1.7;
  white-space: pre;
  color: var(--text-2);
}

/* 双链：与 Web 版同一语汇（淡蓝底 + 下划发丝线），但手机上不做 hover 反色 */
.md :deep(.garden-wikilink) {
  color: var(--accent);
  background-color: var(--accent-soft);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
  font-weight: 500;
  box-shadow: inset 0 -1rpx 0 var(--accent);
}

.md :deep(.md-ext) {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: var(--line-strong);
}

.md :deep(mark) {
  background-color: var(--accent-soft);
  color: var(--text);
  border-radius: 4rpx;
  padding: 0 4rpx;
}

.md :deep(strong) {
  font-weight: 600;
}

/* ---------------- 反链 ---------------- */
.bl {
  margin-top: 56rpx;
  padding-top: 28rpx;
  border-top: 1rpx solid var(--line);
}

/* 紧跟着上一个区块时不要再画一条线：上一个 item 已有底边，两条并排很难看 */
.bl + .bl {
  margin-top: 36rpx;
  padding-top: 0;
  border-top: 0;
}

.bl-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: var(--faint);
}

.bl-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.4rpx;
}

.bl-item {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--line);
}

/* 引用上下文：左侧竖线标出「这是别人原话」，两行截断 */
.bl-ctx {
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--muted);
  padding-left: 18rpx;
  border-left: 4rpx solid var(--line-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.bl-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.bl-item:active {
  opacity: 0.6;
}

.bl-name {
  flex: 0 1 auto;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}

.out-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--line);
  color: var(--faint);
}

.out-item:active {
  opacity: 0.6;
}

.out-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bl-path {
  flex: 0 1 auto;
  font-size: var(--fs-2xs);
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 收尾 ---------------- */
.a-foot {
  padding: 48rpx 0 8rpx;
  display: flex;
  justify-content: center;
}

.a-foot-text {
  font-size: var(--fs-2xs);
  color: var(--faint);
  letter-spacing: 0.6rpx;
}

/* ---------------- 目录抽屉 ---------------- */
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.42);
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  padding: 12rpx 0 calc(env(safe-area-inset-bottom) + 12rpx);
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  transform: translateY(110%);
  transition: transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.sheet.is-open {
  transform: translateY(0);
}

.sheet-grip {
  width: 72rpx;
  height: 8rpx;
  border-radius: var(--r-full);
  background-color: var(--line-strong);
  margin: 0 auto 8rpx;
}

.sheet-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  padding: 16rpx var(--page-gutter) 12rpx;
}

.sheet-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}

.sheet-count {
  font-size: var(--fs-xs);
  color: var(--faint);
}

.sheet-body {
  flex: 1 1 auto;
  max-height: 52vh;
  padding: 0 var(--page-gutter);
}

.toc-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.toc-text {
  font-size: var(--fs-base);
  color: var(--text-2);
  line-height: 1.45;
}

/* 三级标题缩进，靠缩进表达层级而不是缩字号——字号一缩就不好读 */
.toc-item.lv3 {
  padding-left: 28rpx;
}

.toc-item.lv4 {
  padding-left: 56rpx;
}

.toc-item.is-on .toc-text {
  color: var(--accent);
  font-weight: 600;
}

.sheet-tail {
  height: 24rpx;
}

/* ---------------- 提示态 ---------------- */
.hint {
  padding: 120rpx var(--page-gutter);
  font-size: var(--fs-sm);
  text-align: center;
}

.retry {
  margin-top: 32rpx;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 80rpx);
}
</style>

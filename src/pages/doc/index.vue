<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back :title="scrolled ? doc?.title || '阅读' : ''" :elevated="scrolled" @back="back">
      <template #actions>
        <view v-if="toc.length > 1" class="icon-btn toc-btn" @click="openToc">
          <GIcon name="list" :size="38" />
        </view>
        <!-- 竖三点：阅读页的全部次要动作收进这里 -->
        <view class="icon-btn more-btn" @click.stop="menuOpen = !menuOpen">
          <GIcon name="ellipsis" :size="38" />
        </view>
      </template>
    </GTopBar>

    <!-- 阅读菜单：分享 / 归档或移动 / 字体 / 深浅切换 / 编辑 / 删除 -->
    <view v-if="menuOpen" class="pop-mask" @click="menuOpen = false" />
    <view v-if="menuOpen" class="menu-pop">
      <view class="menu-item" @click="shareDoc">
        <GIcon name="send" :size="32" />
        <text class="menu-t">分享</text>
      </view>
      <!-- 「归档」和「移动」对用户是同一件事：换个归属地。
           区别只在服务端动作不同（收集箱里的草稿要走 archive，连带收编碎片），
           那是实现细节，不该让用户在菜单里做选择。统一成「移动到…」，
           由 inInbox 决定底下调哪个接口。 -->
      <view v-if="canEdit && doc" class="menu-item" @click="openDirSheet">
        <GIcon name="folder" :size="32" />
        <text class="menu-t">移动到…</text>
      </view>
      <view class="menu-item" @click="openFontSheet">
        <GIcon name="eye" :size="32" />
        <text class="menu-t">字体</text>
      </view>
      <view class="menu-item" @click="toggleTheme">
        <GIcon :name="resolvedTheme === 'dark' ? 'sun' : 'moon'" :size="32" />
        <text class="menu-t">{{ resolvedTheme === 'dark' ? '明亮模式' : '深色模式' }}</text>
      </view>
      <view v-if="canEdit && doc" class="menu-item" @click="toEdit">
        <GIcon name="pencil" :size="32" />
        <text class="menu-t">编辑</text>
      </view>
      <view v-if="canEdit && doc" class="menu-item menu-danger" @click="removeDoc">
        <GIcon name="trash" :size="32" />
        <text class="menu-t">删除</text>
      </view>
    </view>

    <!-- 字号：底部弹出，滑杆四档（小 / 标准 / 大 / 特大） -->
    <view v-if="fontSheet" class="sheet-mask" @click="fontSheet = false" />
    <view :class="['font-sheet', { 'is-open': fontSheet }]">
      <view class="sheet-grip" />
      <view class="fs-head">
        <text class="fs-title">设置字体大小</text>
        <view class="fs-close" @click="fontSheet = false">
          <GIcon name="close" :size="30" />
        </view>
      </view>
      <view class="fs-labels">
        <text
          v-for="(key, i) in FONT_ORDER"
          :key="key"
          :class="['fs-label', fontIdx === i ? 'fs-label-on' : '']"
        >
          {{ FONT_SIZES[key].label }}
        </text>
      </view>
      <slider
        class="fs-slider"
        :min="0"
        :max="3"
        :step="1"
        :value="fontIdx"
        activeColor="#0066cc"
        backgroundColor="var(--line-strong)"
        block-size="22"
        @change="onSlideFont"
      />
      <text class="fs-tip">只影响正文，标题与界面文字不变</text>
      <view class="fs-tail" />
    </view>

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

    <view v-else-if="doc" class="article" :style="{ '--read-fs': FONT_SIZES[fontSize].value }">
      <text class="a-title">{{ doc.title }}</text>

      <view class="a-meta">
        <text
          v-if="col"
          class="a-col a-col-scope"
          :style="{ color: colInk, background: tint(colMain, 0.14) }"
        >
          {{ col.code }} · {{ col.name }}{{ subText ? ` · ${subText}` : '' }}
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

      <view class="md">
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
    <view
      :class="['sheet', { 'is-open': tocOpen, 'is-dragging': dragOffset > 0 }]"
      :style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined"
    >
      <view
        class="sheet-drag"
        @touchstart="onDragStart"
        @touchmove.stop.prevent="onDragMove"
        @touchend="onDragEnd"
        @touchcancel="onDragEnd"
      >
        <view class="sheet-grip" />
        <view class="sheet-head">
          <text class="sheet-title">目录</text>
          <text class="sheet-count">{{ toc.length }} 节</text>
        </view>
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

    <!-- 分享：复制链接 / 生成图片 -->
    <GShareSheet
      :open="shareOpen"
      :title="doc?.title || ''"
      :url="shareUrl"
      :is-public="shareIsPublic"
      @close="shareOpen = false"
      @poster="openPoster"
    />

    <!-- 归档 / 移动：底部抽屉选目标目录，选完立刻执行 -->
    <GDirSheet
      :open="dirSheet"
      title="移动到"
      :current="currentDir"
      :busy="dirBusy"
      @close="dirSheet = false"
      @pick="onPickDir"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad, onPageScroll, onUnload } from '@dcloudio/uni-app'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import GDirSheet from '../../shared/components/GDirSheet.vue'
import GShareSheet from '../../shared/components/GShareSheet.vue'
import {
  archiveDoc,
  doc as apiDoc,
  deleteDoc,
  moveDoc,
  type DocDetail,
} from '../../shared/api/notes'
import { renderMarkdown, type TocItem } from '../../shared/utils/markdown'
import { useNotesStore } from '../../shared/store/notes'
import { columnByPath, tint } from '../../shared/config/columns'
import { resolvedTheme, setThemeMode } from '../../shared/theme'
import { capabilities } from '../../shared/capabilities'
import { useAuthStore } from '../../shared/store/auth'
import { useSiteStore } from '../../shared/store/site'
import { subLevels } from '../../shared/utils/scope'
import { isPublicShare, shareUrlOf } from '../../shared/utils/share'
import { formatDate } from '../../shared/utils/date'
import { getBaseUrl } from '../../shared/config/server'

/** 编辑/删除/归档：既要有平台能力，也要真的登录了（游客能读不能写） */
const canEdit = computed(() => capabilities.canEdit && auth.logged)

const notes = useNotesStore()
const auth = useAuthStore()
const siteStore = useSiteStore()
const doc = ref<DocDetail | null>(null)
const html = ref('')
const toc = ref<TocItem[]>([])
const loading = ref(true)
const error = ref('')
const docId = ref('')

/* ---------------- 正文字号 ----------------
   四档，只作用于正文（`.md`），不动标题与界面文字：
   标题已是 44rpx，跟着放大到最大档会占掉半屏。 */
type FontKey = 'sm' | 'md' | 'lg' | 'xl'
const FONT_ORDER: FontKey[] = ['sm', 'md', 'lg', 'xl']
const FONT_SIZES: Record<FontKey, { label: string; value: string; preview: string }> = {
  sm: { label: '小', value: '30rpx', preview: '22rpx' },
  md: { label: '标准', value: '34rpx', preview: '28rpx' },
  lg: { label: '大', value: '38rpx', preview: '34rpx' },
  xl: { label: '特大', value: '42rpx', preview: '40rpx' },
}
const FONT_OPTIONS = FONT_ORDER.map((key) => ({ key, ...FONT_SIZES[key] }))

const FONT_KEY = 'garden.reader.fs'

function readFont(): FontKey {
  try {
    const raw = String(uni.getStorageSync(FONT_KEY) || '')
    return FONT_ORDER.includes(raw as FontKey) ? (raw as FontKey) : 'md'
  } catch {
    return 'md'
  }
}

const fontSize = ref<FontKey>(readFont())
const fontOpen = ref(false)
/** 竖三点菜单与底部字号面板 */
const menuOpen = ref(false)
const fontSheet = ref(false)
const fontIdx = computed(() => FONT_ORDER.indexOf(fontSize.value))
/** 代码块原文，复制按钮按 data-code 下标取 */
const codeBlocks = ref<string[]>([])
/** 已绑定原生点击监听的容器，避免重复绑 */
let boundEl: HTMLElement | null = null

const scrolled = ref(false)
const progress = ref(0)
const tocOpen = ref(false)
const activeId = ref('')
/** 标题到文档顶部的距离，只在布局稳定后量一次，滚动时只做比较 */
let offsets: number[] = []
/** 当前页面滚动量。App 端 window.scrollY 不可靠，跳转与进度都用这个 */
let pageScrollTop = 0

const col = computed(() => (doc.value ? columnByPath(doc.value.path) : undefined))

/* ---------------- 移动 ----------------
   界面上只有「移动」一个动作。服务端其实有两个接口：收集箱里的草稿要走
   `/inbox/archive`（连带把它收编的碎片标记归档），其它目录走 `/notes/move`
   的纯文件移动。这个区别对用户没有意义，所以由 inInbox 自动选，
   菜单和抽屉都只出现「移动到…」。 */
const dirSheet = ref(false)
const dirBusy = ref(false)

const inInbox = computed(() => (doc.value?.path || '').startsWith('00_Inbox/'))
/** 小类层级显示名（`AI / 检索`），文章页归属标签用 */
const subText = computed(() =>
  subLevels(doc.value?.path || '', siteStore.subAliases)
    .map((l) => l.label)
    .join(' / '),
)
/** 文档所在目录（去掉文件名），抽屉里标成「当前」且点不动 */
const currentDir = computed(() => {
  const p = doc.value?.path || ''
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : p
})

function openDirSheet(): void {
  if (!doc.value) return
  menuOpen.value = false
  dirSheet.value = true
}

/** 目录的显示名：栏目根给中文名，小类给最后一段（Toast 里不出现 03_Articles 这种） */
function dirName(path: string): string {
  const col = columnByPath(path)
  // columnByPath 对子目录也会命中（前缀匹配），必须比是不是根
  if (col && col.path === path) return col.name
  return path.split('/').pop() || path
}

async function onPickDir(path: string): Promise<void> {
  const d = doc.value
  if (!d || dirBusy.value) return
  dirBusy.value = true
  try {
    if (inInbox.value) {
      // 收集箱里的草稿：走 archive，顺带把它收编的碎片标记归档
      const res = await archiveDoc(d.id, path)
      const extra = res.items_archived ? `，${res.items_archived} 条碎片一并归档` : ''
      uni.showToast({ title: `已移动到 ${dirName(path)}${extra}`, icon: 'none' })
    } else {
      // 移动是文件级操作：目标要带文件名，后端不替我们拼
      const name = (d.path || '').split('/').pop() || ''
      await moveDoc(d.id, `${path}/${name}`, d.version)
      uni.showToast({ title: `已移动到 ${dirName(path)}`, icon: 'none' })
    }
    dirSheet.value = false
    // 路径变了：正文要重拉（反链、栏目色都跟着变），列表树也得强制刷 ——
    // notes.load() 有 5 分钟缓存，不 force 的话回到列表还在旧栏目里
    await load()
    void notes.load(true)
  } catch (err: any) {
    uni.showToast({ title: err?.reason || err?.message || '操作失败', icon: 'none' })
  } finally {
    dirBusy.value = false
  }
}

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
    codeBlocks.value = result.codes || []
    uni.setNavigationBarTitle?.({ title: detail.title || '文档' })
  } catch (err: any) {
    error.value = err?.reason || err?.message || '打开失败'
  } finally {
    loading.value = false
  }

  // 必须在 loading 关掉之后再做：`.md` 挂在 v-else-if="doc" 上，
  // loading 为 true 时它还没进 DOM，绑定会静默失败（踩过）
  await nextTick()
  bindBodyTap()
  // 图片会改变布局，量两次：一次立即，一次等图片落位
  setTimeout(measure, 120)
  setTimeout(measure, 700)
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

function openFontSheet(): void {
  menuOpen.value = false
  fontSheet.value = true
}

function toggleTheme(): void {
  setThemeMode(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  menuOpen.value = false
}

/* ---------------- 分享 ----------------
   只保留两条真正能用的路：复制链接、生成带二维码的分享图。
   系统分享面板里能通往的地方大多是半成品（微信要 JS-SDK 卡片、朋友圈没接口），
   先把这两条做扎实，其余渠道之后再补。 */

/**
 * 公开且已发布 → 对外链接 `/p/<slug>`；否则给内部链接（打开需登录）。
 *
 * **必须 encodeURI**：slug 里常带中文（`2026-10-27-25条识人处世智慧`），
 * 微信等 IM 只把 ASCII 当 URL 字符，遇到第一个汉字就断开——
 * `https://…/p/2026-10-27-25` 才是它认的链接，后面全被丢掉。
 * 编码后整条都是 `%E6%9D%A1…` 这种 ASCII，粘贴到哪里都不会被截断，
 * 浏览器打开时自动解码，后端路由不受影响。
 */
const shareUrl = computed(() => shareUrlOf(doc.value, getBaseUrl()))
const shareIsPublic = computed(() => isPublicShare(doc.value))

const shareOpen = ref(false)
/**
 * 「生成图片」开一个独立页面来画。
 *
 * App 端 `<canvas>` 是原生组件，塞在浮层里（fixed + 圆角/overflow 裁剪）
 * 会整块空白：不报错、draw 像没发生、也导不出图。画布只能待在
 * 正常文档流里 —— 所以做成页面，而不是弹层里的一个组件。
 */
function openPoster(): void {
  if (!doc.value) return
  uni.navigateTo({ url: `/pages/share/index?id=${encodeURIComponent(doc.value.id)}` })
}

function shareDoc(): void {
  if (!doc.value) return
  menuOpen.value = false
  shareOpen.value = true
}

/** 删除：二次确认，删完回列表 */
function removeDoc(): void {
  if (!doc.value) return
  menuOpen.value = false
  uni.showModal({
    title: '删除这篇文档？',
    content: `「${doc.value.title}」会进回收站，可在网页端恢复`,
    confirmText: '删除',
    cancelText: '取消',
    success: (res) => {
      if (!res.confirm) return
      deleteDoc(docId.value)
        .then(() => {
          uni.showToast({ title: '已删除', icon: 'none' })
          setTimeout(() => {
            const pages = getCurrentPages()
            if (pages.length > 1) uni.navigateBack()
            else uni.reLaunch({ url: '/pages/library/index' })
          }, 500)
        })
        .catch((err: any) =>
          uni.showToast({ title: err?.reason || '删除失败', icon: 'none' }),
        )
    },
  })
}

/** 滑杆回调：index → FontKey */
function onSlideFont(e: any): void {
  const idx = Number(e?.detail?.value ?? 1)
  setFont(FONT_ORDER[idx] || 'md')
}

function setFont(key: FontKey): void {
  fontSize.value = key
  try {
    uni.setStorageSync(FONT_KEY, key)
  } catch {
    /* 存不进也不影响本次阅读 */
  }
  // 字号变了整篇高度都变，目录位置必须重量
  void nextTick().then(() => {
    setTimeout(measure, 120)
    setTimeout(measure, 600)
  })
}

function openToc(): void {
  tocOpen.value = true
}

function closeToc(): void {
  tocOpen.value = false
  dragOffset.value = 0
}

/* ---------------- 抽屉下拉关闭 ----------------
   只绑在头部（手柄 + 标题行）：绑整个抽屉会和内部的 scroll-view 抢手势。
   阈值 90px ≈ 屏高 1/9，比「拖一点点就关」稳，也比「必须拖到底」省力。 */
const dragOffset = ref(0)
let dragStartY = 0
let dragging = false

function onDragStart(e: any): void {
  if (!tocOpen.value) return
  dragging = true
  dragStartY = e?.touches?.[0]?.clientY ?? 0
  dragOffset.value = 0
}

function onDragMove(e: any): void {
  if (!dragging) return
  const y = e?.touches?.[0]?.clientY ?? 0
  const dy = y - dragStartY
  // 往下跟手；往上给强阻尼——抽屉本来就已经在底部，往上拖没有意义
  dragOffset.value = dy > 0 ? dy : Math.max(-16, dy * 0.25)
}

function onDragEnd(): void {
  if (!dragging) return
  dragging = false
  const shouldClose = dragOffset.value > 90
  dragOffset.value = 0
  if (shouldClose) closeToc()
}

/**
 * 目录跳转。
 *
 * 不用 selectorQuery：v-html 生成的节点不在 Vue 组件树里，选择器查不到。
 * webview 里就是普通 DOM，直接算位置最可靠。
 */
/**
 * 跳到某一节。
 *
 * 不用 `window.scrollY`：App 端它不可靠（常见是一直为 0），
 * `rect.top + 0` 会把「目视偏移」当成文档偏移，只要当前不在顶部，
 * 落点就会偏——表现就是「点了目录但没跳对地方」。
 * 这里用 onPageScroll 记录的真实滚动量算绝对位置。
 *
 * 再兜一层：跳完 320ms 复核，若没到位就退回 `scrollIntoView`。
 */
function jump(id: string): void {
  activeId.value = id
  // 先收起抽屉再滚：抽屉是 fixed 全屏层，正在做 transform 动画时发起的滚动
  // 在 App 端有概率被吃掉（点了没反应就是这个）
  tocOpen.value = false
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null
  if (!el) return

  setTimeout(() => {
    const target = Math.max(0, el.getBoundingClientRect().top + pageScrollTop - 96)
    uni.pageScrollTo({ scrollTop: target, duration: 240 })
    setTimeout(() => {
      // 已经到位就不管；差得远说明这次没生效，换一种方式再试一次
      if (Math.abs(pageScrollTop - target) > 48) {
        try {
          el.scrollIntoView({ block: 'start' })
          uni.pageScrollTo({ scrollTop: Math.max(0, target - 96), duration: 200 })
        } catch {
          /* 兜底也失败就算了，不弹错 */
        }
      }
    }, 320)
  }, 30)
}

onPageScroll((e) => {
  const top = e.scrollTop
  pageScrollTop = top
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

/** 复制代码块。改按钮文字只在真 DOM 上做，App 端靠 toast 提示 */
function copyCode(index: number, el?: any): void {
  const text = codeBlocks.value[index] || ''
  if (!text) return
  uni.setClipboardData({
    data: text,
    success: () => {
      uni.showToast({ title: '代码已复制', icon: 'none' })
      try {
        if (el && typeof el.textContent === 'string') {
          const prev = el.textContent
          el.textContent = '已复制'
          setTimeout(() => {
            el.textContent = prev
          }, 1200)
        }
      } catch {
        /* 非真 DOM 就算了 */
      }
    },
  })
}

/**
 * 正文点击：**绑原生 DOM 事件**，不用模板的 `@click`。
 *
 * 为什么：uni 在 H5/App 里传给 `@click` 的 `e.target` 是它自己的包装对象
 * （`{ id, dataset, ... }`），不是真实 DOM 节点——`tagName` 为空、`closest`
 * 不存在，`v-html` 里生成的双链/代码复制按钮全都点不动（实测过）。
 * 直接给 `.md` 元素 addEventListener，`e.target` 就是真节点。
 */
function bindBodyTap(): void {
  if (typeof document === 'undefined') return
  const el = document.querySelector('.md') as HTMLElement | null
  if (!el || el === boundEl) return
  if (boundEl) boundEl.removeEventListener('click', onBodyTap as EventListener)
  boundEl = el
  el.addEventListener('click', onBodyTap as EventListener)
}

function onBodyTap(e: Event): void {
  const target = e.target as HTMLElement | null
  if (!target || typeof target.closest !== 'function') return

  const copyBtn = target.closest('[data-code]') as HTMLElement | null
  if (copyBtn) {
    copyCode(Number(copyBtn.dataset.code), copyBtn)
    return
  }

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
  if (img?.src) previewImage(img.src)
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

onUnload(() => {
  if (boundEl) {
    boundEl.removeEventListener('click', onBodyTap as EventListener)
    boundEl = null
  }
})
</script>

<style scoped>
/* ---------------- 进度条 ---------------- */
.progress {
  position: fixed;
  left: 0;
  right: 0;
  /* 顶栏高 + 安全区：进度条贴在顶栏下沿（高度走统一变量，别写死） */
  top: calc(var(--safe-top, 0px) + var(--topbar-h));
  height: 2rpx;
  z-index: 79;
  background-color: transparent;
}

.progress-bar {
  height: 100%;
  transition: width 120ms linear;
}

/* ---------------- 竖三点菜单 ---------------- */
.pop-mask {
  position: fixed;
  inset: 0;
  z-index: 77;
  background-color: rgba(0, 0, 0, 0.12);
}

.menu-pop {
  position: fixed;
  /* 顶栏下沿再留一点点：菜单不要和标题贴在一起 */
  top: calc(var(--safe-top, 0px) + var(--topbar-h) + 8rpx);
  right: 24rpx;
  z-index: 78;
  width: 380rpx;
  padding: 10rpx;
  background-color: var(--surface);
  border: 1rpx solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  height: 88rpx;
  padding: 0 22rpx;
  border-radius: var(--r-sm);
  color: var(--text);
}

.menu-item:active {
  background-color: var(--bg-hover);
}

.menu-t {
  font-size: 29rpx;
  font-weight: 500;
}

.menu-danger,
.menu-danger .menu-t {
  color: #d64541;
}

/* ---------------- 字号底部面板（滑杆四档） ---------------- */
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.4);
}

.font-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: 14rpx 36rpx 0;
  transform: translateY(105%);
  transition: transform 240ms cubic-bezier(0.3, 0.9, 0.4, 1);
}

.font-sheet.is-open {
  transform: translateY(0);
}

.sheet-grip {
  width: 72rpx;
  height: 8rpx;
  border-radius: 9999rpx;
  background-color: var(--line-strong);
  margin: 0 auto 18rpx;
}

.fs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fs-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text);
}

.fs-close {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

/* 四档标签与滑杆刻度对齐：两端 justify-between + 中间均分 */
.fs-labels {
  display: flex;
  justify-content: space-between;
  margin: 26rpx 6rpx 0;
}

.fs-label {
  flex: 1 1 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--faint);
  transition: color 150ms ease;
}

.fs-label-on {
  color: var(--accent);
  font-weight: 600;
}

.fs-slider {
  margin: 4rpx 6rpx 0;
}

.fs-tip {
  display: block;
  padding: 10rpx 0 26rpx;
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.fs-tail {
  height: calc(env(safe-area-inset-bottom) + 10rpx);
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

/* 带上小类之后标签会变长（`M · 观悟 · AI / 检索`）：限宽并省略，
   不把日期和字数挤到下一行 */
.a-col-scope {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  /* 字号由「Aa」控制，回落到全局正文基准 */
  font-size: var(--read-fs, var(--fs-base));
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

/* 视频：与图片同一套版式，但给 16:9 占位避免加载后整篇跳动 */
.md :deep(video),
.md :deep(.md-video) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1.2em 0;
  border-radius: var(--r-md);
  background-color: #000;
  aspect-ratio: 16 / 9;
  object-fit: contain;
}

.md :deep(img),
.md :deep(.md-img) {
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
  min-width: 100%;
  font-size: 0.93em;
}

.md :deep(th),
.md :deep(td) {
  border: 1rpx solid var(--line);
  padding: 14rpx 18rpx;
  text-align: left;
}

/* 表头不换行（列宽由它定，多列时自然超过屏宽 → 外层横向滚动）；
   单元格允许换行：中文表格内容都很短，硬 nowrap 会在大字号下把字切出屏外 */
.md :deep(th) {
  background-color: var(--surface-2);
  font-weight: 600;
  white-space: nowrap;
}

.md :deep(td) {
  white-space: normal;
  word-break: break-word;
}

/* 首列给个下限：auto layout 下中文可以逐字断行，浏览器会把首列压到
   刚好等于表头宽度，「20 个以上」这种 5 字内容就会被拆成 4+1 */
.md :deep(th:first-child),
.md :deep(td:first-child) {
  min-width: 200rpx;
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

/* 代码块：外壳负责边框圆角，pre 只负责滚动。
   这样顶部的语言标签与复制按钮才能和代码贴在同一张卡片里。 */
.md :deep(.md-code) {
  margin: 1.2em 0;
  background-color: var(--surface-2);
  border: 1rpx solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.md :deep(.md-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 20rpx;
  border-bottom: 1rpx solid var(--line);
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.md :deep(.md-code-lang) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.4rpx;
}

.md :deep(.md-code-copy) {
  color: var(--muted);
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  background-color: var(--bg);
}

.md :deep(.md-code-copy:active) {
  background-color: var(--bg-hover);
  color: var(--accent);
}

.md :deep(.md-code > pre) {
  margin: 0;
  padding: 20rpx 22rpx;
  background-color: transparent;
  border: 0;
  border-radius: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* 兜底：没有 fence 包裹的裸 pre */
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
  /* 抽屉统一用无回弹曲线：overshoot 会让元素瞬时高过视口 */
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
}

.sheet.is-open {
  transform: translateY(0);
}

.sheet-drag {
  /* 手势只在这个区域生效，避免和内部 scroll-view 抢 */
  padding-bottom: 4rpx;
  touch-action: none;
}

.sheet.is-dragging {
  transition: none;
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
  box-sizing: border-box;
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

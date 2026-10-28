<template>
  <view
    :class="['page', `theme-${resolvedTheme}`]"
    @touchstart="onSwipeStart"
    @touchmove="onSwipeMove"
    @touchend="onSwipeEnd"
  >
    <!-- 顶栏：品牌左对齐；右侧依次 搜索 / 碎片箱 / 设置 -->
    <view class="top-fixed">
            <GTopBar :elevated="scrolled" menu @menu="sideOpen = true">
        <template #actions>
          <view class="icon-btn" @click="toggleSearch">
            <GIcon :name="searching ? 'close' : 'search'" :size="40" />
          </view>
          <view class="icon-btn" @click="toInbox">
            <GIcon name="inbox" :size="40" />
            <view v-if="pendingCount > 0" class="dot" />
          </view>
          <view class="icon-btn" @click="toSettings">
            <GIcon name="settings" :size="40" />
          </view>
        </template>
      </GTopBar>
    </view>

    <!-- 下拉刷新：内容整体下移，指示器从顶栏下沿露出来。
         不用原生刷新：导航栏是 navigationStyle: custom，webview 通到屏幕顶端，
         系统指示器画在状态栏后面被盖住——手势有反应但什么都看不见。 -->
    <view
      :class="[
        'body',
        {
          'is-pulling': pullPhase === 'pull' || pullPhase === 'ready',
          'slide-right': feedDir === 'right',
          'slide-left': feedDir === 'left',
        },
      ]"
      :style="pullOffset ? { transform: `translate3d(0, ${pullOffset}px, 0)` } : undefined"
    >
      <view v-if="pullOffset > 0" class="pull" :style="{ opacity: Math.min(1, pullOffset / 26) }">
        <view :class="['pull-ico', pullPhase === 'loading' ? 'is-spin' : '']">
          <GIcon name="refresh" :size="26" :weight="2.2" />
        </view>
        <text class="pull-t">{{ pullText }}</text>
      </view>

      <!-- 搜索条：点顶栏放大镜才出现，不占常驻空间 -->
      <view v-if="searching" class="search-row">
        <input
          v-model="keyword"
          class="field"
          placeholder="搜索标题 / 摘要"
          placeholder-class="ph"
          confirm-type="search"
          :focus="searchFocus"
        />
      </view>

      <!-- 首页 = 直接铺最新内容。
           首页卡只留关键信息：一行概况 + 新建。房子图标、「自留地」、引言都撤了——
           用户点进首页要的是内容，不是再看一遍门户介绍；
           而且这行概况和下面「最近更新」列表紧挨着，大卡片只会把内容推到Fold 以下。 -->
      <view v-if="!searching && isHome" class="home">
        <view class="home-bar" :style="homeHeroStyle">
          <text class="home-bar-sub">{{ homeSub }}</text>
          <view class="home-new" @click.stop="openNew">
            <GIcon name="plus" :size="24" :weight="2.6" />
            <text class="home-new-t">新建</text>
          </view>
        </view>

        <view v-if="pagedTotal" class="section-head">
          <text class="section-title">最近更新</text>
          <text class="section-more">{{ pagedTotal }}</text>
        </view>
        <GDocItem
          v-for="item in pagedItems"
          :key="item.id"
          :doc="item"
          show-column
          @open="open"
        />

      </view>

      <!-- 栏目头部：栏目色浸染的卡片 + 水印字母 + 介绍 -->
      <view v-if="!searching && !isHome && activeCol" class="col-hero" :style="heroStyle">
        <view class="col-head">
          <view class="col-badge">
            <text class="col-badge-letter">{{ activeCol.code }}</text>
          </view>
          <view class="col-titles">
            <view class="col-name-row">
              <text class="col-name">{{ activeCol.name }}</text>
              <text class="col-pill">{{ activeSub ? `本目录 ${pagedTotal} 篇` : `${pagedTotal} 篇` }}</text>
              <view class="col-new" @click.stop="openNew">
                <GIcon name="plus" :size="24" :weight="2.6" />
                <text class="col-new-t">新建</text>
              </view>
            </view>
            <text class="col-sub">
              {{ activeCol.brief }}<template v-if="colUpdated"> · {{ colUpdated }}</template>
            </text>
          </view>
        </view>
        <text v-if="colDesc" class="col-desc">{{ colDesc }}</text>
      </view>

      <!-- 当前进的是某个小类：一条可清除的筛选条。
           侧栏点进来后没有它的话，页面看着还停在栏目根（空目录时尤其像「点了没反应」）。 -->
      <view v-if="!searching && !isHome && activeSub" class="sub-filter" :style="heroStyle">
        <GIcon name="folder" :size="28" :weight="2" class="sub-filter-ico" />
        <view class="sub-filter-main">
          <text class="sub-filter-name">{{ activeSubLabel }}</text>
          <text class="sub-filter-path">{{ activeSub }}</text>
        </view>
        <view class="sub-filter-x" @click="clearSub">
          <GIcon name="close" :size="26" :weight="2.4" />
        </view>
      </view>

      <!-- 列表 -->
      <view v-if="notes.loading && !notes.docs.length" class="state">
        <text class="state-text">正在加载…</text>
      </view>

      <view v-else-if="notes.error" class="state">
        <text class="state-text">{{ notes.error }}</text>
        <view class="btn btn-ghost retry" @click="reload">重试</view>
      </view>

      <view v-else-if="!items.length" class="state">
        <text class="state-strong">{{ emptyTitle }}</text>
        <text class="state-text">{{ emptyHint }}</text>
      </view>

      <view v-else-if="!isHome" class="list">
        <GDocItem
          v-for="item in pagedItems"
          :key="item.id"
          :doc="item"
          :show-column="searching"
          :strip="activeSubName"
          @open="open"
        />
      </view>

      <!-- 底部分页提示：本地分页没有网络等待，所以「加载更多」是可点的，
           而不是无限滚动——用户知道自己滚到第几页了 -->
      <view v-if="pagedTotal" class="pager-foot">
        <text v-if="pagedHasMore" class="pager-more" @click="loadMore">
          加载更多（{{ pagedShown }}/{{ pagedTotal }}）
        </text>
        <text v-else class="pager-end">没有更多了 · 共 {{ pagedTotal }} 篇</text>
      </view>

      <view class="tail" />
    </view>

    <!-- 新建：默认落在当前栏目（首页 → 收集箱），与 Web 的 NewDocDialog 同一行为 -->
    <view v-if="newOpen" class="mask" @click="closeNew" />
    <view :class="['new-sheet', { 'is-open': newOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">新建文档</text>
        <text class="sheet-sub">{{ activeCol ? `默认落在「${activeCol.name}」` : '默认落在收集箱' }}</text>
      </view>

      <!-- focus 不能绑「弹层是否打开」这个常驻布尔：
           它在每次输入重渲染时都还是 true，uni 会反复调 focus()，
           键盘跟着抖，页面就像卡死。autoFocus 只在上场动画结束后置一次 true，
           关闭时再置回 false —— 注意不能在 @focus 里改回 false，
           uni 把 focus 属性当指令用，false 会直接 blur()，聚焦后立刻掉。
           注意 adjust-position 保持默认（true）：iOS 的键盘是覆盖层，
           关掉上推会把底部弹层直接埋在键盘下面。 -->
      <input
        v-model="newTitle"
        class="new-input"
        placeholder="标题"
        placeholder-class="ph"
        :focus="autoFocus"
        :maxlength="80"
        confirm-type="done"
        @confirm="doCreate"
      />

      <!-- 目录不再用原生 picker：它是一列滚轮，条目一多（几个栏目 × 各自小类）
           翻起来又慢又看不到层级。改成树选择抽屉，与移动/归档共用同一个组件 -->
      <view class="new-row" @click="dirSheet = true">
        <text class="new-label">目录</text>
        <text class="new-value">{{ dirLabel(newDir) }}</text>
        <GIcon name="chevron-right" :size="28" />
      </view>

      <view class="new-row">
        <text class="new-label">可见性</text>
        <view class="vis-opts">
          <view :class="['vis', newVisibility === 'private' ? 'vis-on' : '']" @click="newVisibility = 'private'">
            私有
          </view>
          <view :class="['vis', newVisibility === 'public' ? 'vis-on' : '']" @click="newVisibility = 'public'">
            公开
          </view>
        </view>
      </view>

      <view :class="['btn', 'new-submit', canCreate ? '' : 'btn-off']" @click="doCreate">
        {{ creating ? '创建中…' : '创建并编辑' }}
      </view>
    </view>

    <!-- 新建的目录选择：树形抽屉，允许选收集箱（草稿本来就该落这里） -->
    <GDirSheet
      :open="dirSheet"
      title="新建到"
      :current="newDir"
      allow-inbox
      @close="dirSheet = false"
      @pick="onPickNewDir"
    />

    <GTabBar :active="activeTab" :disabled="!loggedIn" @select="switchColumn" />

    <!-- 侧栏：Web 左栏移植，完整目录树 -->
    <GSideNav
      :open="sideOpen"
      :active="activeTab"
      :active-sub="activeSub"
      @close="sideOpen = false"
      @select="onSideSelect"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPageScroll, onReachBottom, onShow, onUnload } from '@dcloudio/uni-app'
import { useNotesStore, type FlatDoc } from '../../shared/store/notes'
import { useAuthStore } from '../../shared/store/auth'
import { useSiteStore } from '../../shared/store/site'
import { createDoc } from '../../shared/api/notes'
import { usePagedList } from '../../shared/composables/usePagedList'
import { hasSession } from '../../shared/auth/session'
import { resolvedTheme } from '../../shared/theme'
import { capture, items as apiInboxItems } from '../../shared/api/inbox'
import { COLUMNS, columnByCode, columnByPath, tint } from '../../shared/config/columns'
import GIcon from '../../shared/components/GIcon.vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GSideNav from '../../shared/components/GSideNav.vue'
import GDocItem from '../../shared/components/GDocItem.vue'
import GDirSheet from '../../shared/components/GDirSheet.vue'
import GTabBar, { type TabCode } from '../../shared/components/GTabBar.vue'

const notes = useNotesStore()
const auth = useAuthStore()
const siteStore = useSiteStore()

const keyword = ref('')
const searching = ref(false)
const scrolled = ref(false)
const pendingCount = ref(0)
const activeTab = ref<TabCode>('HOME')
/** 子类（子目录）过滤；空串 = 全部 */
const activeSub = ref('')
/** 侧栏抽屉（Web 左栏移植）：完整目录树从这里进 */
const sideOpen = ref(false)

const loggedIn = computed(() => hasSession())

const isHome = computed(() => activeTab.value === 'HOME')
const activeCol = computed(() => (isHome.value ? null : columnByCode(activeTab.value) || COLUMNS[0]))

/* 抬头色：首页用强调蓝（跟顶栏一个语汇），栏目用栏目色 */
const heroMain = computed(() =>
  activeCol.value ? activeCol.value.main : resolvedTheme.value === 'dark' ? '#2997ff' : '#0066cc',
)
const heroInk = computed(() =>
  activeCol.value ? activeCol.value.ink : resolvedTheme.value === 'dark' ? '#7cc0ff' : '#0058a3',
)

/** 当前栏目下的文档；搜索时跨栏目 */
function byUpdatedDesc(a: FlatDoc, b: FlatDoc): number {
  return (b.updated_at || '').localeCompare(a.updated_at || '')
}

/**
 * 子类：栏目根下的一级子目录。
 *
 * 为什么只取一级：手机竖屏宽度 375pt，chip 条已经很挤；再往下钻一层，
 * 用户会在「栏目 > 子类 > 子类的子类」里迷路，而实际层级只有 2 层。
 * 更深的层级仍在列表元信息里以 `A / B` 的形式露出。
 */
const columnDocs = computed<FlatDoc[]>(() => {
  // 搜索与首页都是跨栏目；首页按更新时间倒序，等于「最近更新」
  if (isHome.value || (searching.value && keyword.value.trim())) {
    return [...notes.docs].sort(byUpdatedDesc)
  }
  let list = notes.docs.filter((d) => columnByPath(d.path)?.code === activeTab.value)
  if (activeSub.value) {
    list = list.filter((d) => d.path === activeSub.value || d.path.startsWith(`${activeSub.value}/`))
  }
  return list
})

const items = computed<FlatDoc[]>(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = columnDocs.value
  if (!q) return base
  return base.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      (d.excerpt || '').toLowerCase().includes(q) ||
      d.path.toLowerCase().includes(q),
  )
})

/** 首页直接铺全部内容，按更新时间倒序——打开就是「今天有什么新的」 */
const latestDocs = computed<FlatDoc[]>(() => [...notes.docs].sort(byUpdatedDesc))

/** 当前要渲染的完整集合：首页 / 搜索 / 栏目（含子类） */
const feed = computed<FlatDoc[]>(() => (isHome.value ? latestDocs.value : items.value))

/** 每页 15 条，触底加载 */
const paged = usePagedList(feed, 15)
const { items: pagedItems, total: pagedTotal, shown: pagedShown, hasMore: pagedHasMore, loadMore } = paged

/** 栏目完整介绍（site.yaml 的 desc），头部用 */
const colDesc = computed(() => {
  const col = activeCol.value
  if (!col) return ''
  return siteStore.info.columns?.find((c) => c.code === col.code)?.desc || ''
})

/** 该栏目最近一次更新的相对时间，给头部做「活跃度」提示 */
/** 一组文档里最近一次更新距今多久，给卡片副行用 */
function updatedLabel(list: FlatDoc[]): string {
  if (!list.length) return ''
  const latest = list.reduce((a, b) => ((b.updated_at || '') > (a.updated_at || '') ? b : a))
  const d = new Date((latest.updated_at || '').replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 86400000
  if (diff < 1) return '今天更新'
  if (diff < 30) return `${Math.floor(diff)} 天前更新`
  return `${d.getMonth() + 1} 个月前更新`
}

const colUpdated = computed(() => {
  const col = activeCol.value
  if (!col) return ''
  return updatedLabel(notes.docs.filter((d) => columnByPath(d.path)?.code === col.code))
})

/** 已选子类的目录名，用于在列表元信息里去掉重复的那一层 */
const activeSubName = computed(() => (activeSub.value ? activeSub.value.split('/').pop() || '' : ''))

/** 当前小类的显示名：站点配置里有别名就用别名（与侧栏一致） */
const activeSubLabel = computed(() => {
  if (!activeSub.value) return ''
  const col = siteStore.info.columns?.find((c) => c.code === activeTab.value)
  const hit = col?.subs?.find((x) => x.path === activeSub.value)
  return (hit?.name || '').trim() || activeSubName.value
})

/** 空态分三种：搜索无结果 / 这个小类没文章 / 整个栏目没文章 */
const emptyTitle = computed(() => {
  if (keyword.value) return '没有匹配的内容'
  if (activeSub.value) return `「${activeSubLabel.value}」里还没有文章`
  return '这个栏目还是空的'
})

const emptyHint = computed(() => {
  if (keyword.value) return '换个词试试，或清空搜索'
  if (activeSub.value) return '投一条碎片，或从本机导入 .md；点上方筛选条右侧的 ✕ 可回到栏目全部'
  return '投一条碎片，或从本机导入 .md'
})

/** 退出小类筛选，回到整个栏目 */
function clearSub(): void {
  activeSub.value = ''
  paged.reset()
}

/** 栏目头卡配色：浅色模式淡，深色模式加重，否则近黑底上看不出浸染 */
const heroStyle = computed(() => {
  const dark = resolvedTheme.value === 'dark'
  const base = heroMain.value
  return {
    '--c-soft': tint(base, dark ? 0.2 : 0.1),
    '--c-line': tint(base, dark ? 0.34 : 0.18),
    '--c-glow': tint(base, dark ? 0.34 : 0.26),
    '--c-ink': heroInk.value,
  } as Record<string, string>
})

/** 首页卡配色：与目录/编辑页的强调蓝一致 */
const homeHeroStyle = computed(() => {
  const dark = resolvedTheme.value === 'dark'
  const base = dark ? '#2997ff' : '#0066cc'
  return {
    '--c-soft': tint(base, dark ? 0.2 : 0.1),
    '--c-line': tint(base, dark ? 0.34 : 0.18),
    '--c-glow': tint(base, dark ? 0.34 : 0.26),
    '--c-ink': dark ? '#7cc0ff' : '#0058a3',
  } as Record<string, string>
})

/** 首页卡片副行的「N 天前更新」，按全站最近一次改动算 */
const homeUpdated = computed(() => updatedLabel(notes.docs))

/** 副行：栏目数 · 篇数 · 更新时间。用「·」串，缺项自动消失（不留「· 」尾巴） */
const homeSub = computed(() =>
  ['五个栏目', `${notes.docs.length} 篇`, homeUpdated.value].filter(Boolean).join(' · '),
)

/** 子类 chip 的配色跟随当前栏目 */
/* ---------------- 横滑手势 ----------------
   侧栏关着时：
   · 左缘起右滑 → 开侧栏；主页左滑 → 到 M
   · 栏目页左右滑 → 相邻栏目（顺序 首页 M L G D I）
   阈值：横向 60px 起效，且 |dx| > 1.5|dy|（避免吃掉纵向滚动）。 */
const SWIPE_ORDER: TabCode[] = ['HOME', 'M', 'L', 'G', 'D', 'I']
let swipeX = 0
let swipeY = 0
/** 页面纵向滚动位置：只有已经在顶端才可能触发下拉 */
let pageTop = 0

/* ---------------- 下拉刷新 ----------------
   为什么自己画：导航栏是 navigationStyle: custom，webview 通到屏幕顶端，
   系统刷新指示器画在状态栏区域内，被状态栏和我们自己的顶栏盖住 ——
   手势其实生效，但屏幕上什么也看不到，看上去就是「没有下拉刷新」。
   自己实现后，位置（顶栏下沿）、文案、回弹节奏都在我们手里。
   阈值 58pt、最大 88pt、跟手阻尼 0.45。 */
const PULL_TRIGGER = 58
const PULL_MAX = 88
const pullOffset = ref(0)
const pullPhase = ref<'idle' | 'pull' | 'ready' | 'loading'>('idle')
const pullText = computed(() => {
  if (pullPhase.value === 'loading') return '正在刷新…'
  return pullPhase.value === 'ready' ? '松手刷新' : '下拉刷新'
})
let pullStartY = 0
let pullArmed = false

/** 栏目切换时的滑动特效：新内容从滑入的方向进来 */
const feedDir = ref<'' | 'left' | 'right'>('')
let feedDirTimer: ReturnType<typeof setTimeout> | null = null

function playSlide(dir: 1 | -1): void {
  feedDir.value = dir > 0 ? 'right' : 'left'
  if (feedDirTimer) clearTimeout(feedDirTimer)
  feedDirTimer = setTimeout(() => {
    feedDir.value = ''
  }, 260)
}

function onSwipeStart(e: any): void {
  const t = e?.touches?.[0]
  if (!t) return
  swipeX = t.clientX
  swipeY = t.clientY
  pullStartY = t.clientY
  // 已有浮层、搜索态、或者在页面中段，都不接管下拉
  pullArmed = !sideOpen.value && !searching.value && pageTop <= 0 && pullPhase.value === 'idle'
}

/** 跟手下拉：横向为主就交给栏目切换，纵向向下才拉指示器 */
function onSwipeMove(e: any): void {
  if (!pullArmed || pullPhase.value === 'loading') return
  const t = e?.touches?.[0]
  if (!t) return
  const dy = t.clientY - pullStartY
  if (Math.abs(t.clientX - swipeX) > Math.abs(dy)) return
  if (dy <= 0) {
    if (pullOffset.value !== 0) {
      pullOffset.value = 0
      pullPhase.value = 'idle'
    }
    return
  }
  const next = Math.min(PULL_MAX, dy * 0.45)
  pullOffset.value = next
  pullPhase.value = next >= PULL_TRIGGER ? 'ready' : 'pull'
}

async function refreshByPull(): Promise<void> {
  pullPhase.value = 'loading'
  pullOffset.value = 46
  const started = Date.now()
  try {
    await Promise.all([notes.load(true), loadPending(), siteStore.load(true)])
  } catch {
    /* 失败也要把指示器收回去，不能卡在半空 */
  } finally {
    // 结束太快会「闪一下」，让「正在刷新」至少停留 400ms
    const wait = Math.max(0, 400 - (Date.now() - started))
    setTimeout(() => {
      pullPhase.value = 'idle'
      pullOffset.value = 0
    }, wait)
  }
}

function onSwipeEnd(e: any): void {
  const wasPulling = pullArmed
  pullArmed = false
  if (wasPulling) {
    if (pullPhase.value === 'ready') {
      void refreshByPull()
      return
    }
    if (pullPhase.value === 'pull') {
      pullOffset.value = 0
      pullPhase.value = 'idle'
      return
    }
  }
  if (sideOpen.value || searching.value) return
  const t = e?.changedTouches?.[0]
  if (!t) return
  const dx = t.clientX - swipeX
  const dy = t.clientY - swipeY
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return

  if (dx > 0 && swipeX < 48) {
    sideOpen.value = true
    return
  }
  const idx = SWIPE_ORDER.indexOf(activeTab.value)
  const next = idx + (dx < 0 ? 1 : -1)
  if (next < 0 || next >= SWIPE_ORDER.length) return
  switchColumn(SWIPE_ORDER[next])
}

function switchColumn(code: TabCode): void {
  const from = SWIPE_ORDER.indexOf(activeTab.value)
  const to = SWIPE_ORDER.indexOf(code)
  // 换栏目时把下拉状态归零，否则会停在下拉一半的位置
  pullOffset.value = 0
  pullPhase.value = 'idle'
  if (from >= 0 && to >= 0 && from !== to) playSlide(to > from ? 1 : -1)
  activeTab.value = code
  activeSub.value = ''
  keyword.value = ''
  searching.value = false
  paged.reset()
  uni.setStorageSync('garden.column', code)
}

/** 搜索框的一次性聚焦（与新建弹层同一个道理：不能把 focus 绑在一个常驻布尔上） */
const searchFocus = ref(false)

function toggleSearch(): void {
  searching.value = !searching.value
  if (!searching.value) {
    keyword.value = ''
    searchFocus.value = false
    try {
      uni.hideKeyboard()
    } catch {
      /* 忽略 */
    }
  } else {
    setTimeout(() => {
      if (searching.value) searchFocus.value = true
    }, 60)
  }
  paged.reset()
}

function pickSub(path: string): void {
  activeSub.value = path
  paged.reset()
}

/** 侧栏选中：任意深度的目录都能直达（columnDocs 的前缀匹配对深层路径同样成立） */
function onSideSelect(payload: { code: TabCode; sub: string; stayOpen?: boolean }): void {
  activeTab.value = payload.code
  activeSub.value = payload.sub
  keyword.value = ''
  searching.value = false
  // 点有子层的目录以展开为主，抽屉保持打开；点叶子/栏目才收
  sideOpen.value = Boolean(payload.stayOpen)
  paged.reset()
  try {
    uni.setStorageSync('garden.column', payload.code)
  } catch {
    /* 存不进就本次会话有效 */
  }
}

function open(item: FlatDoc): void {
  uni.navigateTo({ url: `/pages/doc/index?id=${encodeURIComponent(item.id)}` })
}

function toSettings(): void {
  uni.navigateTo({ url: '/pages/settings/index' })
}

/* ---------------- 新建文档 ----------------
   默认目录跟当前栏目走（Web 的 NewDocDialog 也是这个行为）。
   首页不属于任何栏目，落到 00_Inbox —— 符合「服务端只写 Inbox」的既有约定。 */
const newOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)
const newDir = ref('00_Inbox')
const newVisibility = ref<'private' | 'public'>('private')
/** 目录树抽屉：候选由组件自己拉 /notes/dirs（含空目录），这里不再维护候选列表 */
const dirSheet = ref(false)

/**
 * 目录的显示名：栏目根换成中文名，小类保留原名。
 *
 * 旧实现这里是个 computed 候选列表，数据源是 `notes.roots`（**文档树**）——
 * 文档树只含有文章的目录，于是「后台刚建、还没文章的小类」怎么都选不到。
 * 现在候选统一交给 GDirSheet 从磁盘目录取。
 */
function dirLabel(path: string): string {
  const parts = path.split('/').filter(Boolean)
  const col = COLUMNS.find((c) => c.path === parts[0])
  if (!col) return path
  // 多级小类用 ` / ` 连：与目录树里的完整路径写法一致
  return parts.length > 1 ? `${col.name} · ${parts.slice(1).join(' / ')}` : col.name
}

const canCreate = computed(() => newTitle.value.trim().length > 0 && !creating.value)

const autoFocus = ref(false)
let focusTimer: ReturnType<typeof setTimeout> | null = null

function openNew(): void {
  // 连点不重入：重复 open 会把入场动画与聚焦再排一遍
  if (newOpen.value) return
  newDir.value = activeCol.value?.path || '00_Inbox'
  newTitle.value = ''
  newOpen.value = true
  // 等入场动画走完再聚焦。键盘与 transform 同时动，是「点新建整屏卡住」的头号嫌疑
  autoFocus.value = false
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = setTimeout(() => {
    focusTimer = null
    if (newOpen.value) autoFocus.value = true
  }, 280)
}

function closeNew(): void {
  if (focusTimer) {
    clearTimeout(focusTimer)
    focusTimer = null
  }
  autoFocus.value = false
  newOpen.value = false
  // 弹层收起时主动收键盘：不然键盘挂在那儿，页面看着像没反应
  try {
    uni.hideKeyboard()
  } catch {
    /* 不支持就忽略 */
  }
}

function onPickNewDir(path: string): void {
  newDir.value = path
  dirSheet.value = false
}

async function doCreate(): Promise<void> {
  const title = newTitle.value.trim()
  if (!title || creating.value) return
  creating.value = true
  try {
    const isBooklet = newDir.value.split('/')[0] === '02_Booklets'
    const res = await createDoc({
      dir: newDir.value,
      title,
      template: isBooklet ? 'booklet' : 'post',
      visibility: newVisibility.value,
    })
    closeNew()
    await notes.load(true)
    uni.navigateTo({ url: `/pages/edit/index?id=${encodeURIComponent(res.doc.id)}` })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '创建失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

// 页面卸掉时清掉聚焦定时器，别让回调打到已销毁的组件上
onUnload(() => {
  if (focusTimer) {
    clearTimeout(focusTimer)
    focusTimer = null
  }
})

function toInbox(): void {
  uni.navigateTo({ url: '/pages/inbox/index' })
}

function reload(): void {
  notes.load(true)
  void loadPending()
}

async function loadPending(): Promise<void> {
  if (!loggedIn.value) return
  try {
    const res = await apiInboxItems('captured', 1)
    pendingCount.value = res.total || 0
  } catch {
    /* 角标失败不打扰用户 */
  }
}

onPageScroll((e) => {
  const top = e.scrollTop
  pageTop = top
  scrolled.value = top > 4
  // 往下滚时把残留的下拉位移清掉（键盘/惯性滚动会打断手势，收不到 touchend）
  if (top > 0 && pullOffset.value !== 0 && pullPhase.value !== 'loading') {
    pullOffset.value = 0
    pullPhase.value = 'idle'
  }
})

onShow(() => {
  // 库页是应用入口页（pages.json 第一项），未登录必须在这里挡一次，
  // 否则会先渲染空列表再去打接口，出现「request:fail」的误导性报错
  if (!hasSession()) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  const saved = uni.getStorageSync('garden.column')
  if (saved === 'HOME' || (saved && columnByCode(saved))) activeTab.value = saved as TabCode
  notes.load()
  void siteStore.load()
  void loadPending()
})

onReachBottom(() => {
  loadMore()
})

</script>

<style scoped>
.top-fixed {
  position: sticky;
  top: 0;
  z-index: 80;
  background-color: var(--bg);
}

.body {
  padding: 0 var(--page-gutter);
  position: relative;
  /* 下拉回弹 / 松手复位 */
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* 跟手拖动时不能有过渡，否则手指和内容不同步 */
.body.is-pulling {
  transition: none;
}

/* 下拉指示器：贴在内容上沿之外，内容下移多少就露出多少 */
.pull {
  position: absolute;
  left: 0;
  right: 0;
  top: -92rpx;
  height: 92rpx;
  padding-bottom: 12rpx;
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10rpx;
  color: var(--faint);
}

.pull-ico {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pull-ico.is-spin {
  animation: pullSpin 900ms linear infinite;
}

.pull-t {
  font-size: 24rpx;
  color: var(--faint);
}

@keyframes pullSpin {
  to {
    transform: rotate(360deg);
  }
}

/* 栏目切换：新内容从滑入的方向进来，240ms 与 TabBar 胶囊同步 */
.body.slide-right {
  animation: feedFromRight 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.body.slide-left {
  animation: feedFromLeft 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes feedFromRight {
  from {
    opacity: 0;
    transform: translate3d(56rpx, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes feedFromLeft {
  from {
    opacity: 0;
    transform: translate3d(-56rpx, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.search-row {
  padding: 8rpx 0 16rpx;
}

.ph {
  color: var(--placeholder);
}

/* ---------------- 栏目头部 ---------------- */
/* 空态：标题与说明必须分两行 —— uni 的 <text> 默认 inline，
   两个 text 挨着写会连成一句话（「…里还没有文章投一条碎片…」就是这么来的）。 */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 88rpx 40rpx;
  text-align: center;
}

.state-strong {
  font-size: 32rpx;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text);
}

.state-text {
  font-size: 26rpx;
  line-height: 1.7;
  color: var(--muted);
}

/* 小类筛选条：说明「现在只看这个目录」，并给一键退回栏目 */
.sub-filter {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 18rpx 0 2rpx;
  padding: 16rpx 20rpx;
  border-radius: var(--r-md);
  background-color: var(--c-soft);
  border: 1rpx solid var(--c-line);
}

.sub-filter-ico {
  flex: 0 0 auto;
  color: var(--c-ink);
}

.sub-filter-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.sub-filter-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-filter-path {
  font-size: 21rpx;
  color: var(--c-ink);
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-filter-x {
  flex: 0 0 auto;
  width: 56rpx;
  height: 56rpx;
  margin-right: -8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-full);
  color: var(--c-ink);
}

.sub-filter-x:active {
  background-color: var(--bg-hover);
}

.col-hero {
  position: relative;
  overflow: hidden;
  margin: 8rpx 0 24rpx;
  padding: 30rpx 32rpx 32rpx;
  border-radius: var(--r-lg);
  background-color: var(--c-soft);
  border: 1rpx solid var(--c-line);
}

/* 超大字母水印：给栏目一个视觉指纹，不抢正文 */
/* 右上角柔光斑：替代原来的字母水印。
   字母水印的问题：L / I 被裁切后只剩一条竖线，形态依赖字形，无法统一。
   光斑与字形无关，且能和网页入口页的 blob 呼应。 */
.col-hero::after {
  content: '';
  position: absolute;
  right: -110rpx;
  top: -150rpx;
  width: 340rpx;
  height: 340rpx;
  border-radius: 50%;
  background: radial-gradient(circle, var(--c-glow) 0%, transparent 68%);
  pointer-events: none;
}

.col-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.col-badge {
  width: 88rpx;
  height: 88rpx;
  border-radius: 26rpx;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface);
  border: 1rpx solid var(--c-line);
}

.col-badge-letter {
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1;
  color: var(--c-ink);
}

.col-titles {
  flex: 1 1 auto;
  min-width: 0;
}

.col-name-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  /* 名称 + 篇数 pill 不能再撑宽：右上角还有新建按钮 */
  padding-right: 150rpx;
}

/* 新建：贴在卡片右上角，不参与内容流——participating 的话「自留地」+pill+按钮
   会把 3 个字的名字挤成两行 */
.col-new {
  position: absolute;
  top: 26rpx;
  right: 26rpx;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 58rpx;
  padding: 0 20rpx;
  border-radius: var(--r-full);
  background-color: var(--surface);
  border: 1rpx solid var(--c-line);
  color: var(--c-ink);
}

/* 视觉 58rpx，热区补到 88rpx（否则手指按不准） */
.col-new::after {
  content: '';
  position: absolute;
  inset: -15rpx;
}

.col-new:active {
  background-color: var(--bg-hover);
}

.col-new-t {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--c-ink);
  line-height: 1;
}

.col-name {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -1.2rpx;
  color: var(--text);
}

.col-pill {
  flex: 0 0 auto;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--c-ink);
  background-color: var(--surface);
  padding: 4rpx 16rpx;
  border-radius: 9999rpx;
}

.col-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: var(--muted);
  /* 右上角是「新建」，副行不许钻到它下面 */
  padding-right: 150rpx;
}

.col-desc {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 22rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: var(--text-2);
}

/* ---------------- 分页脚 ---------------- */
.pager-foot {
  padding: 40rpx 0 8rpx;
  display: flex;
  justify-content: center;
}

.pager-more {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--accent);
  padding: 16rpx 40rpx;
  border-radius: 9999rpx;
  background-color: var(--surface-2);
}

.pager-more:active {
  background-color: var(--bg-hover);
}

.pager-end {
  font-size: var(--fs-xs);
  color: var(--faint);
}

/* ---------------- 首页条 ----------------
   只剩「概况一行 + 新建」：图标/名称/引言全部撤掉。
   这行的任务是在滚动开始前交代一句「库现在什么样」，
   一行的高度刚好——再高就是把「最近更新」往 Fold 以下推。 */
.home-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin: 8rpx 0 20rpx;
  padding: 20rpx 26rpx;
  border-radius: var(--r-md);
  background-color: var(--c-soft);
  border: 1rpx solid var(--c-line);
}

.home-bar-sub {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 500;
  color: var(--c-ink);
}

/* 新建：这行只有两个元素，不再需要绝对定位贴角 */
.home-new {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 58rpx;
  padding: 0 20rpx;
  border-radius: var(--r-full);
  background-color: var(--surface);
  border: 1rpx solid var(--c-line);
}

.home-new:active {
  background-color: var(--bg-hover);
}

.home-new-t {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--c-ink);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 40rpx 0 2rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text);
}

.section-more {
  font-size: var(--fs-xs);
  color: var(--faint);
}

/* ---------------- 新建面板 ---------------- */
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.42);
}

.new-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  padding: 12rpx 32rpx calc(env(safe-area-inset-bottom) + 24rpx);
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  transform: translateY(110%);
  /* 不用带回弹的曲线：overshoot 会让元素瞬时高过视口，
     和键盘弹出的 viewport 变化撞在一起（iOS 上会整屏卡住） */
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
}

.new-sheet.is-open {
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
  padding: 16rpx 0 20rpx;
}

.sheet-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}

.sheet-sub {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.new-input {
  height: 96rpx;
  padding: 0 26rpx;
  box-sizing: border-box;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-base);
}

.new-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 96rpx;
  border-bottom: 1rpx solid var(--line);
  color: var(--faint);
}

.new-label {
  font-size: var(--fs-sm);
  color: var(--muted);
}

.new-value {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vis-opts {
  flex: 1 1 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10rpx;
}

.vis {
  height: 56rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  font-size: var(--fs-2xs);
  color: var(--text-2);
}

.vis-on {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.new-submit {
  margin-top: 28rpx;
}

.btn-off {
  background-color: var(--surface-2);
  color: var(--faint);
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
  padding: 16rpx 0 20rpx;
}

.sheet-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}

.sheet-sub {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.new-input {
  height: 96rpx;
  padding: 0 26rpx;
  box-sizing: border-box;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-base);
}

.new-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 96rpx;
  border-bottom: 1rpx solid var(--line);
  color: var(--faint);
}

.new-label {
  font-size: var(--fs-sm);
  color: var(--muted);
}

.new-value {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vis-opts {
  flex: 1 1 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10rpx;
}

.vis {
  height: 56rpx;
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  font-size: var(--fs-2xs);
  color: var(--text-2);
}

.vis-on {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.new-submit {
  margin-top: 28rpx;
}

.btn-off {
  background-color: var(--surface-2);
  color: var(--faint);
}

.tail {
  /* TabBar（--tabbar-h）+ FAB 104 + 留白，否则最后一条会被悬浮按钮压住 */
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 200rpx);
}
</style>

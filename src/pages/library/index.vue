<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
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

    <view class="body">
      <!-- 搜索条：点顶栏放大镜才出现，不占常驻空间 -->
      <view v-if="searching" class="search-row">
        <input
          v-model="keyword"
          class="field"
          placeholder="搜索标题 / 摘要"
          placeholder-class="ph"
          confirm-type="search"
          :focus="searching"
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
              <text class="col-pill">{{ pagedTotal }} 篇</text>
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

      <!-- 列表 -->
      <view v-if="notes.loading && !notes.docs.length" class="state">
        <text class="state-text">正在加载…</text>
      </view>

      <view v-else-if="notes.error" class="state">
        <text class="state-text">{{ notes.error }}</text>
        <view class="btn btn-ghost retry" @click="reload">重试</view>
      </view>

      <view v-else-if="!items.length" class="state">
        <text class="state-strong">{{ keyword ? '没有匹配的内容' : '这个栏目还是空的' }}</text>
        <text class="state-text">{{ keyword ? '换个词试试，或清空搜索' : '投一条碎片，或从本机导入 .md' }}</text>
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
    <view v-if="newOpen" class="mask" @click="newOpen = false" />
    <view :class="['new-sheet', { 'is-open': newOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">新建文档</text>
        <text class="sheet-sub">{{ activeCol ? `默认落在「${activeCol.name}」` : '默认落在收集箱' }}</text>
      </view>

      <input
        v-model="newTitle"
        class="new-input"
        placeholder="标题"
        placeholder-class="ph"
        :focus="newOpen"
        :maxlength="80"
        confirm-type="done"
        @confirm="doCreate"
      />

      <picker :range="dirLabels" :value="dirIndex" @change="onDirChange">
        <view class="new-row">
          <text class="new-label">目录</text>
          <text class="new-value">{{ dirLabel(newDir) }}</text>
          <GIcon name="chevron-right" :size="28" />
        </view>
      </picker>

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
import { onPageScroll, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
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
function switchColumn(code: TabCode): void {
  activeTab.value = code
  activeSub.value = ''
  keyword.value = ''
  searching.value = false
  paged.reset()
  uni.setStorageSync('garden.column', code)
}

function toggleSearch(): void {
  searching.value = !searching.value
  if (!searching.value) keyword.value = ''
  paged.reset()
}

function pickSub(path: string): void {
  activeSub.value = path
  paged.reset()
}

/** 侧栏选中：任意深度的目录都能直达（columnDocs 的前缀匹配对深层路径同样成立） */
function onSideSelect(payload: { code: TabCode; sub: string }): void {
  activeTab.value = payload.code
  activeSub.value = payload.sub
  keyword.value = ''
  searching.value = false
  sideOpen.value = false
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

/** 目录候选：五个根 + 子目录（vault 最多两层） */
const dirOptions = computed<string[]>(() => {
  const out: string[] = []
  const walk = (node: any, depth: number): void => {
    if (depth > 2) return
    out.push(node.path)
    for (const f of node.folders || []) walk(f, depth + 1)
  }
  for (const r of notes.roots) walk(r, 1)
  return out.length ? out : ['00_Inbox']
})

/** 目录的显示名：根目录换成栏目中文名，子目录保留原名 */
function dirLabel(path: string): string {
  const root = path.split('/')[0]
  const col = COLUMNS.find((c) => c.path === root)
  if (!col) return path
  const rest = path.slice(root.length).replace(/^\//, '')
  return rest ? `${col.name} · ${rest}` : col.name
}

/** picker 里也用友好名，否则用户面对一串 00_Inbox 得自己猜 */
const dirLabels = computed(() => dirOptions.value.map(dirLabel))
const dirIndex = computed(() => Math.max(0, dirOptions.value.indexOf(newDir.value)))
const canCreate = computed(() => newTitle.value.trim().length > 0 && !creating.value)

function openNew(): void {
  newDir.value = activeCol.value?.path || '00_Inbox'
  newTitle.value = ''
  newOpen.value = true
}

function onDirChange(e: any): void {
  newDir.value = dirOptions.value[Number(e.detail.value)] || newDir.value
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
    newOpen.value = false
    await notes.load(true)
    uni.navigateTo({ url: `/pages/edit/index?id=${encodeURIComponent(res.doc.id)}` })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '创建失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

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
  scrolled.value = top > 4
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

onPullDownRefresh(async () => {
  await notes.load(true)
  await loadPending()
  uni.stopPullDownRefresh()
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
}

.search-row {
  padding: 8rpx 0 16rpx;
}

.ph {
  color: var(--placeholder);
}

/* ---------------- 栏目头部 ---------------- */
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
  transition: transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
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
  transition: transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
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

.tail {
  /* TabBar（--tabbar-h）+ FAB 104 + 留白，否则最后一条会被悬浮按钮压住 */
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 200rpx);
}
</style>

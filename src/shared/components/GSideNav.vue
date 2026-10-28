<script setup lang="ts">
/**
 * 侧栏抽屉（移植 Web 左栏）。
 *
 * 为什么要移植：移动端原来的分类是一排「一级子目录」chip，但库里的小类下面
 * 还有分类（认知篇 > 健康篇 / 2026 > 10），chip 装不下就永远到不了深层。
 * Web 左栏的树是唯一能完整表达层级的形态，手机上做成左侧抽屉——
 * 结构与 Web 完全同源：导航三入口 + 五栏目 + 各自的目录树（递归、带计数）。
 *
 * 数据：notes.roots 本来就是完整递归树，过滤不再受「只取一级」限制
 * （columnDocs 的 startsWith 前缀匹配对任意深度都成立）。
 */
import { computed, ref, watch } from 'vue'
import { COLUMNS, columnByCode, tint, type ColumnCode } from '../config/columns'
import { useNotesStore } from '../store/notes'
import { useSiteStore } from '../store/site'
import { resolvedTheme } from '../theme'
import GIcon from './GIcon.vue'
import type { TabCode } from './GTabBar.vue'

const props = defineProps<{
  open: boolean
  active: TabCode
  /** 当前选中的目录完整路径（空串 = 栏目全部） */
  activeSub: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  /** stayOpen：点的是「有子层的目录」，展开/收起为主，抽屉不关 */
  (e: 'select', payload: { code: TabCode; sub: string; stayOpen?: boolean }): void
}>()

const notes = useNotesStore()
const siteStore = useSiteStore()
const isDark = computed(() => resolvedTheme.value === 'dark')

/** 收起/展开状态：key 是目录完整路径。默认收起，选中路径的祖先自动展开 */
const collapsed = ref<Set<string>>(new Set())

/** 站点配置里登记过的小类（含空目录；/site 已经按磁盘过滤掉残影） */
function cfgSubs(code: ColumnCode): Array<{ path: string; name: string }> {
  const col = siteStore.info.columns?.find((c) => c.code === code)
  return (col?.subs ?? [])
    .map((x) => ({
      path: String(x.path || '').replace(/^\/+|\/+$/g, ''),
      name: String(x.name || ''),
    }))
    .filter((x) => x.path)
}

const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/')

/**
 * 「有下级」的路径集合：文档树里的 + 站点配置里的。
 *
 * 空目录不进 notes.roots（树只含带文章的目录），但它可能在 subs 登记过、
 * 下面还挂着更小的空目录 —— 只看树的话连展开箭头都不给。
 */
const parentsWithChildren = computed(() => {
  const set = new Set<string>()
  for (const col of COLUMNS) {
    for (const x of cfgSubs(col.code)) set.add(parentOf(x.path))
    const root = notes.roots.find((r) => r.path === col.path)
    const walkTree = (folders: any[]): void => {
      for (const f of folders) {
        if ((f.folders ?? []).length) set.add(f.path)
        walkTree(f.folders ?? [])
      }
    }
    if (root) walkTree(root.folders ?? [])
  }
  return set
})

function hasChildren(path: string): boolean {
  return parentsWithChildren.value.has(path)
}

function toggleFold(path: string): void {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}

/** 打开抽屉时，把当前选中路径的祖先目录全部展开（否则深层选中项看不见） */
function expandAncestorsOf(sub: string): void {
  if (!sub) return
  const parts = sub.split('/')
  for (let i = 1; i < parts.length; i++) {
    collapsed.value.delete(parts.slice(0, i).join('/'))
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) expandAncestorsOf(props.activeSub)
  },
)

function countDocs(node: { docs: unknown[]; folders: any[] }): number {
  return node.docs.length + node.folders.reduce((s: number, f: any) => s + countDocs(f), 0)
}

/* 显示名逻辑已收进 rows 的 cfgName（同一个 Map 既要排序又要取名，再走一遍 find 是浪费） */

interface Row {
  key: string
  code: ColumnCode
  /** 栏目行（depth 0）还是目录行 */
  isCol: boolean
  name: string
  desc: string
  path: string
  depth: number
  count: number
  main: string
  ink: string
}

const rows = computed<Row[]>(() =>
  COLUMNS.flatMap((col) => {
    const root = notes.roots.find((r) => r.path === col.path)
    const main = isDark.value ? col.mainDark : col.main
    const ink = isDark.value ? col.inkDark : col.ink
    const colRow: Row = {
      key: col.code,
      code: col.code,
      isCol: true,
      name: col.name,
      desc: col.brief,
      path: '',
      depth: 0,
      // 栏目行始终显示（五个栏目是固定的）；没有文章时计数就是 0
      count: root ? countDocs(root) : 0,
      main,
      ink,
    }

    const cfg = cfgSubs(col.code)
    const cfgName = new Map(cfg.map((x) => [x.path, x.name]))

    /**
     * 逐层展开：**顺序以站点配置为准**，树里有但配置没登记的追加在后面。
     *
     * 关键点：空目录不进文档树。后台建完空目录若只看树，侧栏一点变化都没有，
     * 用户会以为没建成功 —— subs 里有登记，所以把「配置有、树里没有」的
     * 补成 count=0 的行（截图里那种「建了 2 个目录但栏目里不显示」就是缺这一步）。
     */
    const walk = (parent: string, treeFolders: any[], depth: number): Row[] => {
      const byPath = new Map(treeFolders.map((f) => [f.path, f]))
      const cfgKids = cfg.filter((x) => parentOf(x.path) === parent).map((x) => x.path)
      const extra = treeFolders
        .map((f: any) => String(f.path))
        .filter((p: string) => !cfgKids.includes(p))
      return [...cfgKids, ...extra].flatMap((p: string) => {
        const node = byPath.get(p)
        const name = (cfgName.get(p) || '').trim() || p.split('/').pop() || p
        const row: Row = {
          key: p,
          code: col.code,
          isCol: false,
          name,
          desc: '',
          path: p,
          depth,
          count: node ? countDocs(node) : 0,
          main,
          ink,
        }
        // 被收起的目录不再下钻
        if (collapsed.value.has(p)) return [row]
        return [row, ...walk(p, node?.folders ?? [], depth + 1)]
      })
    }

    return [colRow, ...walk(col.path, root?.folders ?? [], 1)]
  }),
)

function pickCol(row: { code: ColumnCode; path: string; isCol: boolean }): void {
  const expandable = !row.isCol && hasChildren(row.path)
  if (expandable) toggleFold(row.path)
  emit('select', { code: row.code, sub: row.path, stayOpen: expandable })
}

/** 侧栏手势：从右往左滑（横向位移 > 60px 且明显大于纵向）收起 */
let sx = 0
let sy = 0
function onTS(e: any): void {
  sx = e?.touches?.[0]?.clientX ?? 0
  sy = e?.touches?.[0]?.clientY ?? 0
}

function onTE(e: any): void {
  const dx = (e?.changedTouches?.[0]?.clientX ?? 0) - sx
  const dy = (e?.changedTouches?.[0]?.clientY ?? 0) - sy
  if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) emit('close')
}

function rowStyle(row: { code: ColumnCode; main: string; ink: string }): Record<string, string> {
  const col = columnByCode(row.code)
  const main = isDark.value ? col?.mainDark || row.main : row.main
  return {
    '--c': main,
    '--ink': row.ink,
    '--c-soft': tint(main, isDark.value ? 0.2 : 0.1),
  }
}

/** 选中判断：栏目行看 activeTab，目录行看 activeSub 精确匹配 */
function isOn(row: Row): boolean {
  if (row.isCol) return props.active === row.code && !props.activeSub
  return props.active === row.code && props.activeSub === row.path
}
</script>

<template>
  <view v-if="open" class="mask" @click="emit('close')" />
  <view
    :class="['sidenav', { 'is-open': open }]"
    @touchstart="onTS"
    @touchend="onTE"
  >
    <view class="head">
      <text class="brand">渡己・Mlgdi</text>
      <view class="close" @click="emit('close')">
        <GIcon name="close" :size="34" :weight="2" />
      </view>
    </view>

    <scroll-view class="tree" scroll-y>
      <view
        v-for="row in rows"
        :key="row.key"
        :class="['row', row.isCol ? 'row-col' : 'row-folder', isOn(row) ? 'row-on' : '']"
        :style="[rowStyle(row), row.isCol ? {} : { paddingLeft: 76 + row.depth * 44 + 'rpx' }]"
        @click="pickCol(row)"
      >
        <view v-if="row.isCol" class="badge">
          <text class="badge-t">{{ row.code }}</text>
        </view>
        <GIcon v-else name="folder" :size="30" :weight="2" class="folder-ico" />
        <view class="row-main">
          <text :class="row.isCol ? 'row-name' : 'row-folder-name'">{{ row.name }}</text>
          <text v-if="row.isCol && row.desc" class="row-desc">{{ row.desc }}</text>
        </view>
        <text class="row-count">{{ row.count }}</text>
        <GIcon
          v-if="!row.isCol && hasChildren(row.path)"
          name="chevron-down"
          :size="26"
          :weight="2.2"
          :class="['fold-ico', collapsed.has(row.path) ? 'is-folded' : '']"
        />
      </view>
      <view class="tree-tail" />
    </scroll-view>
  </view>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  background-color: rgba(0, 0, 0, 0.4);
}

.sidenav {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 111;
  width: 640rpx;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  border-right: 1rpx solid var(--line);
  transform: translateX(-105%);
  transition: transform 260ms cubic-bezier(0.3, 0.9, 0.4, 1);
}

.sidenav.is-open {
  transform: translateX(0);
}

.head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--safe-top, 0px) + 20rpx) 28rpx 20rpx 36rpx;
}

.brand {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.6rpx;
  color: var(--text);
}

.close {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.tree {
  flex: 1 1 auto;
  padding: 0 20rpx;
  box-sizing: border-box;
}

.row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 72rpx;
  padding: 4rpx 16rpx;
  border-radius: var(--r-sm);
}

.row:active {
  background-color: var(--bg-hover);
}

.row-col {
  margin-top: 10rpx;
}

.row-col:first-child {
  margin-top: 0;
}

/* 折叠指示：收起时指向右 */
.fold-ico {
  flex: 0 0 auto;
  color: var(--faint);
  transition: transform 160ms ease;
}

.fold-ico.is-folded {
  transform: rotate(-90deg);
}

.row-on {
  background-color: var(--c-soft);
}

.row-on .row-name,
.row-on .row-folder-name {
  color: var(--ink);
}

.badge {
  flex: 0 0 auto;
  width: 52rpx;
  height: 52rpx;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--c);
}

.badge-t {
  font-size: 26rpx;
  font-weight: 700;
  color: #ffffff;
}

.folder-ico {
  flex: 0 0 auto;
  color: var(--text-2);
  opacity: 0.7;
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10rpx;
}

.row-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text);
}

.row-desc {
  font-size: 22rpx;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-folder-name {
  font-size: 27rpx;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-count {
  flex: 0 0 auto;
  font-size: 22rpx;
  color: var(--faint);
}

.tree-tail {
  height: calc(env(safe-area-inset-bottom) + 120rpx);
}
</style>

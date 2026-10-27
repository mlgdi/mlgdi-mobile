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
import { computed } from 'vue'
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
  (e: 'select', payload: { code: TabCode; sub: string }): void
  (e: 'nav', target: 'inbox' | 'settings'): void
}>()

const notes = useNotesStore()
const siteStore = useSiteStore()
const isDark = computed(() => resolvedTheme.value === 'dark')

function countDocs(node: { docs: unknown[]; folders: any[] }): number {
  return node.docs.length + node.folders.reduce((s: number, f: any) => s + countDocs(f), 0)
}

/** site.yaml 的 subs[].name 优先（「认知篇」优先于 how-to-live-better-1），同 Web 左栏 */
const displayName = (code: ColumnCode, path: string, fallback: string): string => {
  const siteCol = siteStore.info.columns?.find((c) => c.code === code)
  const hit = siteCol?.subs?.find((x) => x.path === path)
  return (hit?.name || '').trim() || fallback
}

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
    if (!root) return []
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
      count: countDocs(root),
      main,
      ink,
    }
    // 递归摊平，深度决定缩进
    const walk = (folders: any[], depth: number): Row[] =>
      folders.flatMap((f) => [
        {
          key: f.path,
          code: col.code,
          isCol: false,
          name: displayName(col.code, f.path, f.name),
          desc: '',
          path: f.path,
          depth,
          count: countDocs(f),
          main,
          ink,
        },
        ...walk(f.folders ?? [], depth + 1),
      ])
    return [colRow, ...walk(root.folders, 1)]
  }),
)

function pickCol(row: { code: ColumnCode; path: string }): void {
  emit('select', { code: row.code, sub: row.path })
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
  <view :class="['sidenav', { 'is-open': open }]">
    <view class="head">
      <text class="brand">渡己・Mlgdi</text>
      <view class="close" @click="emit('close')">
        <GIcon name="close" :size="34" :weight="2" />
      </view>
    </view>

    <view class="nav">
      <view :class="['nav-item', active === 'HOME' ? 'nav-on' : '']" @click="emit('select', { code: 'HOME', sub: '' })">
        <GIcon name="home" :size="34" :weight="2" />
        <text class="nav-t">知识库</text>
      </view>
      <view class="nav-item" @click="emit('nav', 'inbox')">
        <GIcon name="inbox" :size="34" :weight="2" />
        <text class="nav-t">碎片箱</text>
      </view>
      <view class="nav-item" @click="emit('nav', 'settings')">
        <GIcon name="settings" :size="34" :weight="2" />
        <text class="nav-t">设置</text>
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
  padding: calc(env(safe-area-inset-top) + 20rpx) 28rpx 20rpx 36rpx;
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

.nav {
  flex: 0 0 auto;
  padding: 0 20rpx;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  height: 92rpx;
  padding: 0 22rpx;
  border-radius: var(--r-sm);
  color: var(--text);
}

.nav-item:active {
  background-color: var(--bg-hover);
}

.nav-item.nav-on {
  background-color: var(--c-soft, var(--accent-soft));
}

.nav-t {
  font-size: 30rpx;
  font-weight: 500;
}

.tree {
  flex: 1 1 auto;
  margin-top: 20rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  border-top: 1rpx solid var(--line);
}

.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 84rpx;
  padding: 8rpx 18rpx;
  border-radius: var(--r-sm);
}

.row:active {
  background-color: var(--bg-hover);
}

.row-col {
  margin-top: 14rpx;
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

<script setup lang="ts">
/**
 * 目录选择抽屉：新建文章 / 移动 / 归档共用同一套交互。
 *
 * 两条硬规则（都踩过坑）：
 * 1) 候选来自 `/notes/dirs`（磁盘真实目录、**含空目录**），不是文档树 ——
 *    树只含有文章的目录，刚建好的空小类恰恰最需要被选到，用它就会出现
 *    「后台建了目录，新建时选不到」。
 * 2) 目录多到十几行时平铺列表就读不动了，所以做成**可折叠树** +
 *    搜索兜底：默认只展开栏目那一层，深层小类靠搜索直接落。
 *
 * 交互分工：点行 = 选中；点行首箭头 = 展开/收起。不合并成「点整行展开」——
 * 那样选栏目根就没有入口了。
 */
import { computed, ref, watch } from 'vue'
import GIcon from './GIcon.vue'
import { dirs as apiDirs, type VaultDir } from '../api/notes'
import { columnByPath } from '../config/columns'
import { resolvedTheme } from '../theme'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 标题：「新建到」/「移动到」/「归档到」 */
    title?: string
    /** 当前目录：标出来且不可再选——移到原地是空动作 */
    current?: string
    /** 执行中：锁住点击，避免连点发出两次请求 */
    busy?: boolean
    /**
     * 是否允许把收集箱（00_Inbox）作为目标。
     * 新建文章允许（草稿就该落在收集箱）；移动/归档不允许（挪回收箱等于没挪）。
     */
    allowInbox?: boolean
  }>(),
  { title: '选择目录', current: '', busy: false, allowInbox: false },
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'pick', path: string): void }>()

interface Node {
  path: string
  depth: number
  label: string
  children: Node[]
}

const items = ref<VaultDir[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
/** 展开状态按路径记；每次重新加载目录就整体重置，不用维护一致性 */
const expanded = ref<Record<string, boolean>>({})

function isInbox(path: string): boolean {
  return path === '00_Inbox' || path.startsWith('00_Inbox/')
}

function aliasOf(path: string): string {
  return items.value.find((d) => d.path === path)?.alias || ''
}

/** 一级用栏目中文名；小类优先 site.yaml 登记的显示名，没有才用目录名 */
function labelOf(d: VaultDir): string {
  const col = columnByPath(d.path)
  if (col && col.path === d.path) return col.name
  return d.alias || d.name
}

/** 带层级的完整友好路径：`观悟 / AI / 检索`，供搜索结果与「当前」用 */
function friendlyPath(path: string): string {
  const parts = (path || '').split('/').filter(Boolean)
  return parts
    .map((seg, i) => {
      const p = parts.slice(0, i + 1).join('/')
      const col = columnByPath(p)
      if (col && col.path === p) return col.name
      return aliasOf(p) || seg
    })
    .join(' / ')
}

/**
 * 默认只展开「当前所在的那条分支」，其余栏目收起。
 *
 * 为什么不全部展开：目录多起来（一个栏目十几个小类）时，全展开等于回到
 * 平铺列表，树就白做了。收起状态下一屏能看到所有栏目，想进哪层点哪层；
 * 同时又保证打开时能直接看见自己现在在哪。
 */
function initExpanded(): void {
  const ex: Record<string, boolean> = {}
  const parts = (props.current || '').split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i += 1) ex[parts.slice(0, i).join('/')] = true
  // 当前目录为空或不在列表里（比如收集箱被排除）时，至少展开第一个栏目，
  // 否则一进来是五个折起的标题，像个打不开的目录
  if (!Object.keys(ex).length && tree.value.length) ex[tree.value[0].path] = true
  expanded.value = ex
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await apiDirs()
    items.value = (res.items || []).filter((d) => d.path && (props.allowInbox || !isInbox(d.path)))
  } catch (err: any) {
    items.value = []
    error.value = err?.reason || '目录读取失败'
  } finally {
    loading.value = false
    keyword.value = ''
    initExpanded()
  }
}

const tree = computed<Node[]>(() => {
  const nodes = new Map<string, Node>()
  for (const d of items.value) {
    nodes.set(d.path, {
      path: d.path,
      depth: d.path.split('/').length - 1,
      label: labelOf(d),
      children: [],
    })
  }
  const roots: Node[] = []
  for (const node of nodes.values()) {
    const cut = node.path.lastIndexOf('/')
    const parent = cut > 0 ? nodes.get(node.path.slice(0, cut)) : undefined
    // 父目录被过滤掉（收集箱子树）时自己也不该出现，更不能悄悄变成根
    if (cut > 0 && !parent) continue
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (arr: Node[]): void => {
    arr.sort((a, b) => a.path.localeCompare(b.path))
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
})

interface Row {
  path: string
  depth: number
  label: string
  /** 搜索结果里的上级路径提示；树模式下为空 */
  trail: string
  hasChildren: boolean
  open: boolean
}

const rows = computed<Row[]>(() => {
  const q = keyword.value.trim().toLowerCase()
  const out: Row[] = []
  if (q) {
    // 搜索模式：扁平命中列表，不受折叠状态影响
    const walk = (nodes: Node[]): void => {
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)) {
          out.push({
            path: n.path,
            depth: 0,
            label: n.label,
            trail: friendlyPath(n.path.split('/').slice(0, -1).join('/')),
            hasChildren: false,
            open: false,
          })
        }
        walk(n.children)
      }
    }
    walk(tree.value)
    return out
  }
  const walk = (nodes: Node[]): void => {
    for (const n of nodes) {
      const hasChildren = n.children.length > 0
      const open = expanded.value[n.path] === true
      out.push({ path: n.path, depth: n.depth, label: n.label, trail: '', hasChildren, open })
      if (hasChildren && open) walk(n.children)
    }
  }
  walk(tree.value)
  return out
})

function toggle(path: string): void {
  expanded.value = { ...expanded.value, [path]: !expanded.value[path] }
}

function pick(row: Row): void {
  if (props.busy || row.path === props.current) return
  emit('pick', row.path)
}

watch(
  () => props.open,
  (v) => {
    if (v) void load()
  },
  { immediate: true },
)

const currentTrail = computed(() => friendlyPath(props.current || ''))
</script>

<template>
  <view v-if="open" class="dmask" @click="emit('close')" />
  <view :class="['dsheet', `theme-${resolvedTheme}`, { 'is-open': open }]">
    <view class="dgrip" />
    <view class="dhead">
      <view class="dhead-text">
        <text class="dtitle">{{ title }}</text>
        <text class="dsub">{{ current ? '当前：' + currentTrail : '选一个目录' }}</text>
      </view>
      <view class="dclose" @click="emit('close')">
        <GIcon name="close" :size="30" />
      </view>
    </view>

    <!-- 搜索：目录一多，翻树不如直接搜；输入即切成扁平结果 -->
    <view class="dsearch">
      <GIcon name="search" :size="28" />
      <input
        v-model="keyword"
        class="dsearch-in"
        placeholder="搜索小类名"
        placeholder-class="dph"
        confirm-type="search"
      />
      <view v-if="keyword" class="dsearch-x" @click="keyword = ''">
        <GIcon name="close" :size="24" />
      </view>
    </view>

    <scroll-view class="dbody" scroll-y :show-scrollbar="false">
      <view v-if="loading" class="dhint">
        <text class="dhint-t">正在读取目录…</text>
      </view>
      <view v-else-if="error" class="dhint" @click="load">
        <text class="dhint-t">{{ error }}</text>
        <text class="dhint-a">点击重试</text>
      </view>
      <view v-else-if="!rows.length" class="dhint">
        <text class="dhint-t">{{ keyword ? '没有匹配的目录' : '还没有可选的目录' }}</text>
        <text v-if="!keyword" class="dhint-a">先在设置里建一个小类</text>
      </view>

      <template v-else>
        <view
          v-for="(row, i) in rows"
          :key="row.path"
          :class="[
            'drow',
            {
              'is-root': row.depth === 0 && !row.trail,
              'is-group': row.depth === 0 && !row.trail && i > 0,
              'is-current': row.path === current,
              'is-busy': busy,
            },
          ]"
          :style="{ paddingLeft: 16 + (row.trail ? 0 : row.depth) * 32 + 'rpx' }"
          @click="pick(row)"
        >
          <!-- 有子目录才给箭头；叶子留同宽占位，各行文字左边缘才对得齐 -->
          <view
            v-if="row.hasChildren"
            class="dchev"
            :class="{ 'is-open': row.open }"
            @click.stop="toggle(row.path)"
          >
            <GIcon name="chevron-right" :size="24" :weight="2.2" />
          </view>
          <view v-else class="dchev is-empty" />

          <view class="drow-lead">
            <view
              v-if="row.depth === 0 && !row.trail"
              class="ddot"
              :style="{ background: columnByPath(row.path)?.main }"
            />
            <GIcon v-else name="folder" :size="26" :weight="1.8" />
          </view>

          <view class="drow-main">
            <text class="drow-t">{{ row.label }}</text>
            <text v-if="row.trail" class="drow-h">{{ row.trail }}</text>
          </view>

          <GIcon v-if="row.path === current" name="check" :size="30" :weight="2.4" />
        </view>
        <view class="dtail" />
      </template>
    </scroll-view>
  </view>
</template>

<style scoped>
.dmask {
  position: fixed;
  inset: 0;
  /* 100/101：这层要盖在「新建文档」弹层（90/91）与阅读页目录抽屉之上 */
  z-index: 100;
  background-color: rgba(0, 0, 0, 0.4);
}

.dsheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 101;
  display: flex;
  flex-direction: column;
  max-height: 78vh;
  box-sizing: border-box;
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: 14rpx 0 0;
  transform: translateY(105%);
  transition: transform 240ms cubic-bezier(0.3, 0.9, 0.4, 1);
}

.dsheet.is-open {
  transform: translateY(0);
}

.dgrip {
  flex: 0 0 auto;
  width: 72rpx;
  height: 8rpx;
  border-radius: 9999rpx;
  background-color: var(--line-strong);
  margin: 0 auto 18rpx;
}

.dhead {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0 36rpx 12rpx;
}

.dhead-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dtitle {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.4rpx;
}

/* 把「当前在哪」写在这里：省得用户在树里找自己的位置 */
.dsub {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dclose {
  flex: 0 0 auto;
  width: 60rpx;
  height: 60rpx;
  margin-right: -12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.dsearch {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 72rpx;
  margin: 4rpx 36rpx 12rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--faint);
}

.dsearch-in {
  flex: 1 1 auto;
  min-width: 0;
  height: 72rpx;
  font-size: 28rpx;
  color: var(--text);
}

.dph {
  color: var(--placeholder);
}

.dsearch-x {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
}

.dbody {
  flex: 1 1 auto;
  min-height: 0;
}

.dhint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 72rpx 40rpx;
}

.dhint-t {
  font-size: 28rpx;
  color: var(--muted);
}

.dhint-a {
  font-size: 26rpx;
  color: var(--accent);
}

/* 行高 88rpx：树行比普通列表密，但仍高于 44pt 最小热区 */
.drow {
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 88rpx;
  padding-right: 36rpx;
  box-sizing: border-box;
  color: var(--text-2);
}

.drow:active {
  background-color: var(--bg-hover);
}

.dchev {
  flex: 0 0 auto;
  width: 56rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
  transition: transform 180ms ease;
}

.dchev.is-open {
  transform: rotate(90deg);
}

.dchev.is-empty {
  /* 叶子节点也占这一格，文字才不会参差不齐 */
  visibility: hidden;
}

.drow-lead {
  flex: 0 0 auto;
  width: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint);
}

.ddot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 9999rpx;
}

.drow-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.drow-t {
  font-size: 30rpx;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drow.is-root .drow-t {
  font-weight: 600;
  font-size: 32rpx;
}

/* 栏目之间一条发丝线：靠它扫读分组，比多留白省纵向空间 */
.drow.is-group {
  margin-top: 10rpx;
  border-top: 1rpx solid var(--line);
}

.drow-h {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 22rpx;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 当前目录：可见但点不动，用「已在此处」而不是隐藏，避免用户以为丢了 */
.drow.is-current .drow-t,
.drow.is-current .dchev {
  color: var(--accent);
}

.drow.is-busy {
  opacity: 0.6;
}

.dtail {
  height: calc(env(safe-area-inset-bottom, 0px) + 24rpx);
}
</style>

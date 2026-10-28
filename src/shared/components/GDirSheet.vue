<script setup lang="ts">
/**
 * 目录选择抽屉：移动 / 归档共用。
 *
 * 为什么是底部抽屉而不是跳新页面：这个动作永远从「某篇文章」发起，
 * 选完立刻回到正文看结果，跳页会把人从阅读里拽出去再走回来。
 *
 * 候选来自 `/notes/dirs`（磁盘真实目录、**含空目录**），不是文档树——
 * 刚建的小类还没有文章，恰恰最需要在这里被选到。
 * 收集箱 `00_Inbox` 整棵子树排除：草稿本来就在里面，挪回收箱等于没挪。
 */
import { computed, ref, watch } from 'vue'
import GIcon from './GIcon.vue'
import { dirs as apiDirs, type VaultDir } from '../api/notes'
import { columnByPath } from '../config/columns'
import { resolvedTheme } from '../theme'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 标题：「移动到」/「归档到」 */
    title?: string
    /** 文档当前目录，标记出来且不可选——移到原地是空动作 */
    current?: string
    /** 执行中：锁住点击，避免连点发出两次移动 */
    busy?: boolean
  }>(),
  { title: '移动到', current: '', busy: false },
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'pick', path: string): void }>()

interface Row {
  path: string
  depth: number
  label: string
  hint: string
  /** 分组第一条：上面拉一条发丝线，长列表里靠它分栏目 */
  groupStart: boolean
}

const items = ref<VaultDir[]>([])
const loading = ref(false)
const error = ref('')

/** 收集箱不参与：草稿挪回草稿箱没有意义 */
const EXCLUDED = ['00_Inbox']

function isExcluded(path: string): boolean {
  return EXCLUDED.some((p) => path === p || path.startsWith(`${p}/`))
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await apiDirs()
    items.value = (res.items || []).filter((d) => d.path && !isExcluded(d.path))
  } catch (err: any) {
    items.value = []
    error.value = err?.reason || '目录读取失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) void load()
  },
  { immediate: true },
)

const rows = computed<Row[]>(() => {
  const sorted = items.value
    .map((d) => {
      const depth = d.path.split('/').length - 1
      const col = columnByPath(d.path)
      // 一级用栏目中文名（磁盘名是 03_Articles 这种，不该给人看）；
      // 小类优先 site.yaml 登记的显示名，没有才用目录名
      const label = depth === 0 && col ? col.name : d.alias || d.name
      const hint = depth === 0 ? '栏目' : ''
      return { path: d.path, depth, label, hint }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
  return sorted.map((r, i) => ({ ...r, groupStart: r.depth === 0 && i > 0 }))
})

/** 「当前」用友好名：磁盘路径（00_Inbox）对用户没有意义 */
const currentLabel = computed(() => {
  const p = props.current
  if (!p) return ''
  const col = columnByPath(p)
  // columnByPath 是前缀匹配，子目录也会命中栏目 —— 只有根才用栏目名
  if (col && col.path === p) return col.brief || col.name
  return p.split('/').pop() || p
})

function pick(row: Row): void {
  if (props.busy || row.path === props.current) return
  emit('pick', row.path)
}
</script>

<template>
  <view v-if="open" class="dmask" @click="emit('close')" />
  <view :class="['dsheet', `theme-${resolvedTheme}`, { 'is-open': open }]">
    <view class="dgrip" />
    <view class="dhead">
      <view class="dhead-text">
        <text class="dtitle">{{ title }}</text>
        <text class="dsub">{{ current ? '当前：' + currentLabel : '选一个目录' }}</text>
      </view>
      <view class="dclose" @click="emit('close')">
        <GIcon name="close" :size="30" />
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
        <text class="dhint-t">还没有可选的目录</text>
        <text class="dhint-a">先在设置里建一个小类</text>
      </view>

      <template v-else>
        <view
          v-for="row in rows"
          :key="row.path"
          :class="[
            'drow',
            {
              'is-root': row.depth === 0,
              'is-group': row.groupStart,
              'is-current': row.path === current,
              'is-busy': busy,
            },
          ]"
          :style="{ paddingLeft: 32 + row.depth * 32 + 'rpx' }"
          @click="pick(row)"
        >
          <view class="drow-lead">
            <view
              v-if="row.depth === 0"
              class="ddot"
              :style="{ background: columnByPath(row.path)?.main }"
            />
            <GIcon v-else name="folder" :size="28" :weight="1.8" />
          </view>
          <view class="drow-main">
            <text class="drow-t">{{ row.label }}</text>
            <text v-if="row.hint" class="drow-h">{{ row.hint }}</text>
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
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.4);
}

.dsheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  display: flex;
  flex-direction: column;
  max-height: 76vh;
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

/* 把「当前在哪」写在这里：省得用户在长列表里找自己的位置 */
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

/* 行高 96rpx：比列表项高一点，目录名长短不一，太挤会点错 */
.drow {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 96rpx;
  padding-right: 36rpx;
  box-sizing: border-box;
  color: var(--text-2);
}

.drow:active {
  background-color: var(--bg-hover);
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

.drow.is-root {
  margin-top: 8rpx;
}

/* 栏目之间一条发丝线：14 行以上时靠它扫读分组，比空白更省纵向空间 */
.drow.is-group {
  margin-top: 12rpx;
  border-top: 1rpx solid var(--line);
}

.drow-h {
  flex: 0 0 auto;
  font-size: 22rpx;
  color: var(--faint);
}

/* 当前目录：可见但点不动，用「已在此处」而不是隐藏，避免用户以为丢了 */
.drow.is-current {
  color: var(--accent);
}

.drow.is-current .drow-t {
  color: var(--accent);
}

.drow.is-busy {
  opacity: 0.6;
}

.dtail {
  height: calc(env(safe-area-inset-bottom, 0px) + 24rpx);
}
</style>

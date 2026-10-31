<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="碎片箱" :elevated="true" @back="back">
      <template #actions>
        <view class="icon-btn" @click="openImport">
          <GIcon name="import" :size="40" />
        </view>
        <view class="icon-btn" @click="reload">
          <GIcon name="refresh" :size="38" />
        </view>
      </template>
    </GTopBar>

    <!-- 快速投递 -->
    <view class="compose card">
      <textarea
        v-model="draft"
        class="compose-input"
        placeholder="想到什么就写下来，或粘贴链接…"
        placeholder-class="ph"
        :maxlength="-1"
        :auto-height="true"
        :show-confirm-bar="false"
      />
      <view v-if="images.length" class="thumbs">
        <view v-for="(img, i) in images" :key="i" class="thumb">
          <image :src="img" mode="aspectFill" class="thumb-img" />
          <view class="thumb-x" @click="removeImage(i)">
            <GIcon name="close" :size="22" :weight="2.6" />
          </view>
        </view>
      </view>
      <view class="compose-bar">
        <view class="chip" @click="addImages">
          <GIcon name="image" :size="28" />
          <text class="chip-text">图片{{ images.length ? ` ${images.length}` : '' }}</text>
        </view>
        <view class="chip" @click="pasteClipboard">
          <GIcon name="clipboard" :size="28" />
          <text class="chip-text">粘贴</text>
        </view>
        <view class="chip" @click="parseUrl">
          <GIcon name="link" :size="28" />
          <text class="chip-text">解析链接</text>
        </view>
        <view class="topbar-spacer" />
        <button class="btn send" :disabled="!canSend || sending" @click="submit">
          {{ sending ? '投递中…' : '投递' }}
        </button>
      </view>
    </view>

    <!-- 状态筛选 -->
    <view class="filters">
      <view
        v-for="f in filters"
        :key="f.value || 'all'"
        :class="['filter', activeStatus === f.value ? 'filter-on' : '']"
        @click="switchStatus(f.value)"
      >
        {{ f.label }}
      </view>
    </view>

    <view v-if="loading && !list.length" class="hint muted">加载中…</view>
    <view v-else-if="!list.length" class="hint muted">
      {{ activeStatus ? '这个状态下没有碎片' : '还没有碎片，上面投一条试试' }}
    </view>

    <view v-else class="list">
      <view
        v-for="item in list"
        :key="item.id"
        :class="['item', selected.includes(item.id) ? 'item-on' : '']"
        @click="toggleSelect(item)"
        @longpress="remove(item)"
      >
        <view class="item-head">
          <text class="item-type">{{ typeLabel(item.source_type) }}</text>
          <text class="muted item-time">{{ shortTime(item.created_at) }}</text>
          <text v-if="item.status === 'processed'" class="badge">已成文</text>
          <text v-else-if="item.status === 'queued'" class="badge">整理中</text>
        </view>
        <text class="item-text">{{ item.content }}</text>
        <view v-if="item.source_meta && item.source_meta['url']" class="item-link muted">
          {{ item.source_meta['url'] }}
        </view>
        <view class="item-actions">
          <view v-if="item.doc_id" class="action" @click.stop="openDoc(item.doc_id)">
            <GIcon name="doc" :size="26" />
            <text class="action-text">打开草稿</text>
          </view>
          <view
            v-if="item.status === 'captured' || item.status === 'queued'"
            class="action"
            @click.stop="dispatchOne(item)"
          >
            <GIcon name="sparkle" :size="26" />
            <text class="action-text">整理成文</text>
          </view>
          <view class="action danger" @click.stop="remove(item)">
            <GIcon name="trash" :size="26" />
            <text class="action-text">删除</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 分页脚 -->
    <view v-if="list.length" class="pager-foot">
      <text v-if="hasMore" class="pager-more" @click="loadMore">
        {{ loadingMore ? '加载中…' : `加载更多（${list.length}/${total}）` }}
      </text>
      <text v-else class="pager-end">没有更多了 · 共 {{ total }} 条</text>
      <text class="pager-clear" @click="clearCurrent">清除</text>
    </view>

    <!-- 批量条 -->
    <view v-if="selected.length" class="batch">
      <text class="batch-info">已选 {{ selected.length }} 条</text>
      <view class="topbar-spacer" />
      <view class="batch-cancel" @click="selected = []">
        <GIcon name="close" :size="26" />
        <text class="action-text">取消</text>
      </view>
      <view :class="['btn', 'batch-btn', working ? 'btn-off' : '']" @click="working ? null : dispatchSelected()">
        <GIcon name="sparkle" :size="28" />
        <text class="batch-btn-text">{{ selected.length > 1 ? '合并成文' : '整理成文' }}</text>
      </view>
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { requireLogin } from '../../shared/utils/guard'
import {
  capture,
  dispatch,
  items as apiItems,
  removeItem,
  type InboxItem,
  type InboxStatus,
} from '../../shared/api/inbox'
import { pickImages, readClipboard } from '../../shared/utils/file'
import { resolvedTheme } from '../../shared/theme'

import { toast, confirmDialog, promptDialog } from '../../shared/ui/feedback'
const draft = ref('')
const images = ref<string[]>([])
const list = ref<InboxItem[]>([])
const loading = ref(false)
const sending = ref(false)
const working = ref(false)
const activeStatus = ref<InboxStatus | ''>('captured')
/** 分页：接口支持 limit/offset，这里 15 条一页，触底追加 */
const PAGE_SIZE = 15
const total = ref(0)
const loadingMore = ref(false)
const selected = ref<string[]>([])

const filters: Array<{ value: InboxStatus | ''; label: string }> = [
  { value: 'captured', label: '待整理' },
  { value: 'processed', label: '已成文' },
  { value: '', label: '全部' },
]

const canSend = computed(() => Boolean(draft.value.trim() || images.value.length))

function typeLabel(t: string): string {
  return ({ text: '文本', url: '链接', image: '图片', voice: '语音' } as Record<string, string>)[t] || t
}

function shortTime(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(5, 16)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `今天 ${hh}:${mi}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mi}`
}

function back(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

async function load(append = false): Promise<void> {
  if (append) loadingMore.value = true
  else loading.value = true
  try {
    const offset = append ? list.value.length : 0
    const res = await apiItems(activeStatus.value || undefined, PAGE_SIZE, offset)
    const incoming = res.items || []
    list.value = append ? [...list.value, ...incoming] : incoming
    total.value = res.total || list.value.length
    // 追加后仍要保持选中项与列表一致（被删掉的不再保留）
    selected.value = selected.value.filter((id) => list.value.some((i) => i.id === id))
  } catch (err: any) {
    if (!append) toast(err?.reason || '加载失败')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const hasMore = computed(() => list.value.length < total.value)

function loadMore(): void {
  if (loadingMore.value || !hasMore.value) return
  void load(true)
}

function reload(): void {
  load()
}

function switchStatus(status: InboxStatus | ''): void {
  activeStatus.value = status
  selected.value = []
  load()
}

async function addImages(): Promise<void> {
  const picked = await pickImages(4 - images.value.length)
  if (picked.length) images.value = [...images.value, ...picked].slice(0, 4)
}

function removeImage(index: number): void {
  images.value = images.value.filter((_, i) => i !== index)
}

async function pasteClipboard(): Promise<void> {
  const text = await readClipboard()
  if (!text) {
    toast('剪贴板是空的')
    return
  }
  draft.value = draft.value ? `${draft.value}\n${text}` : text
}

async function submit(): Promise<void> {
  if (!canSend.value || sending.value) return
  sending.value = true
  try {
    const content = draft.value.trim()
    const isUrl = /^https?:\/\/\S+$/i.test(content)
    await capture({
      content,
      source_type: isUrl ? 'url' : 'text',
      source_url: isUrl ? content : '',
      images: images.value,
    })
    draft.value = ''
    images.value = []
    toast('已投递')
    if (activeStatus.value === 'processed') activeStatus.value = 'captured'
    await load()
  } catch (err: any) {
    toast(err?.reason || '投递失败')
  } finally {
    sending.value = false
  }
}

function toggleSelect(item: InboxItem): void {
  // 已成文的碎片不参与批量整理
  if (item.status === 'processed') return
  const index = selected.value.indexOf(item.id)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(item.id)
}

/**
 * 解析链接：投一条 source_type=url 的碎片，后端会自动
 * 抓网页 → AI 清理成正文 → 图片落盘（webclip.clip_url 后台任务）。
 * 弹窗输入框预填剪贴板里的 URL（有就用）。
 */
function parseUrl(): void {
  void (async () => {
    let prefill = ''
    try {
      const text = String(await readClipboard()).trim()
      if (/^https?:\/\//i.test(text)) prefill = text
    } catch {
      /* 读不到就不预填 */
    }
    const res = await promptDialog({
      title: '解析网页链接',
      input: { value: prefill, placeholder: '粘贴 URL，正文与图片会被抓回来' },
      confirmText: '抓取',
    })
    if (!res.confirm) return
    const url = res.content.trim()
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast('不是有效的链接')
      return
    }
    try {
      await capture({ content: url, source_type: 'url', source_url: url })
      toast('开始抓取，稍候刷新查看')
      if (activeStatus.value !== 'captured' && activeStatus.value !== '') {
        activeStatus.value = 'captured'
      }
      await load()
    } catch (err: any) {
      toast(err?.reason || '投递失败')
    }
  })()
}

/** 清除：把当前筛选下的碎片全部删除（逐条调删除接口），先确认 */
function clearCurrent(): void {
  void confirmDialog({
    title: '清空当前列表？',
    content: `将删除${activeStatus.value ? '「' + (filters.find((f) => f.value === activeStatus.value)?.label || '') + '」状态下' : '全部'}的 ${total.value} 条碎片，不可恢复`,
    confirmText: '清除',
    cancelText: '取消',
    danger: true,
  }).then(async (ok) => {
    if (!ok) return
    working.value = true
    let n = 0
    try {
      // 分页拉全量再逐条删（接口只有单条删除）
      for (let offset = 0; ; offset += 200) {
        const page = await apiItems(activeStatus.value || undefined, 200, offset)
        const batch = page.items.filter((i) => !selected.value.includes(i.id))
        if (!batch.length) break
        for (const it of batch) {
          await removeItem(it.id)
          n += 1
        }
        if (offset + 200 >= page.total) break
      }
      toast(`已清除 ${n} 条`)
      selected.value = []
      await load()
    } catch (err: any) {
      toast(err?.reason || `清除失败（已删 ${n} 条）`)
    } finally {
      working.value = false
    }
  })
}

function remove(item: InboxItem): void {
  void confirmDialog({
    title: '删除碎片',
    content: '删除后不可恢复，确定吗？',
    confirmText: '删除',
    danger: true,
  }).then(async (ok) => {
    if (!ok) return
    try {
      await removeItem(item.id)
      list.value = list.value.filter((i) => i.id !== item.id)
      toast('已删除')
    } catch (err: any) {
      toast(err?.reason || '删除失败')
    }
  })
}

async function runDispatch(ids: string[]): Promise<void> {
  if (working.value) return
  working.value = true
  let docId = ''
  try {
    const res = await dispatch(ids)
    docId = res.doc_id || (res.doc && res.doc.id) || ''
    selected.value = []
    await load()
  } catch (err: any) {
    toast(err?.reason || '整理失败')
    return
  } finally {
    // 锁只圈住「请求 + 刷新」这一段。等待用户点确认框的那几秒不该占着锁——
    // 否则用户不点、或者中途按返回，working 会永远卡在 true，整页再也点不动
    working.value = false
  }
  // 结果需要一个选择而不是提示：做成确认框，顺手把「去编辑」变成一条路径
  void confirmDialog({
    title: '已整理成草稿',
    content: '草稿已生成，去编辑还是留在碎片箱？',
    confirmText: '去编辑',
    cancelText: '留下',
  }).then((goEdit) => {
    if (goEdit && docId) {
      uni.navigateTo({ url: `/pages/edit/index?id=${encodeURIComponent(docId)}` })
    }
  })
}

function dispatchOne(item: InboxItem): void {
  runDispatch([item.id])
}

function dispatchSelected(): void {
  if (!selected.value.length) return
  runDispatch([...selected.value])
}

function openDoc(docId: string): void {
  uni.navigateTo({ url: `/pages/doc/index?id=${encodeURIComponent(docId)}` })
}

function openImport(): void {
  uni.navigateTo({ url: '/pages/import/index' })
}

onReachBottom(() => {
  loadMore()
})

/** 下拉刷新：之前没注册处理器，开了 enablePullDownRefresh 也一直没响应 */
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})

onShow(() => {
  // 碎片箱是私有数据（/inbox/items 未登录直接 401），游客进来只会有报错
  if (!requireLogin('碎片箱是你的私人收件箱')) {
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  load()
})
</script>

<style scoped>
.pager-foot {
  display: flex;
  justify-content: center;
  padding: 28rpx 0 8rpx;
}

.pager-more {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--accent);
  padding: 14rpx 36rpx;
  border-radius: 9999rpx;
  background-color: var(--surface-2);
}

.pager-end {
  font-size: 24rpx;
  color: var(--faint);
}

.pager-clear {
  font-size: 24rpx;
  color: #d64541;
  padding: 10rpx 24rpx;
}

.compose {
  margin: 4px 16px 0;
  padding: 12px 14px 10px;
}

.compose-input {
  width: 100%;
  min-height: 72px;
  max-height: 220px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text);
  background: transparent;
}

.ph {
  color: var(--muted);
}

.thumbs {
  display: flex;
  gap: 8px;
  padding: 8px 0 4px;
  flex-wrap: wrap;
}

.thumb {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  background-color: var(--surface-2);
}

.thumb-img {
  width: 64px;
  height: 64px;
}

.thumb-x {
  position: absolute;
  top: 0;
  right: 0;
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.55);
  border-bottom-left-radius: var(--r-sm);
}

.compose-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 60rpx;
  padding: 0 22rpx;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  color: var(--text-2);
}

.chip-text {
  font-size: 26rpx;
}

.chip:active {
  opacity: 0.7;
}

.send {
  height: 34px;
  padding: 0 18px;
  font-size: 14px;
  border-radius: 9px;
}

.filters {
  display: flex;
  gap: 8px;
  padding: 12px 16px 6px;
}

.filter {
  font-size: 13px;
  color: var(--muted);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid var(--line);
}

.filter-on {
  color: var(--accent);
  border-color: transparent;
  background-color: var(--accent-soft);
  font-weight: 600;
}

.list {
  padding: 6px 16px 0;
}

.item {
  padding: 12px 14px;
  margin-bottom: 10px;
  border-radius: 14px;
  background-color: var(--surface);
  border: 1px solid var(--line);
}

.item-on {
  border-color: var(--accent);
  background-color: var(--accent-soft);
}

.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.item-type {
  color: var(--accent);
}

.item-time {
  flex: 1;
}

.badge {
  font-size: 11px;
  color: var(--muted);
  background-color: var(--surface-2);
  padding: 2px 6px;
  border-radius: 6px;
}

.item-text {
  display: block;
  margin-top: 6px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-2);
  max-height: 9.6em;
  overflow: hidden;
}

.item-link {
  margin-top: 4px;
  font-size: 12px;
  word-break: break-all;
}

.item-actions {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}

.action {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  height: 56rpx;
  color: var(--accent);
}

.action-text {
  font-size: 26rpx;
}

.action.danger {
  color: var(--danger);
}

.batch {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  background-color: var(--surface);
  border: 1px solid var(--line);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}

.batch-info {
  font-size: 13px;
  color: var(--muted);
}

.batch-cancel {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  color: var(--muted);
}

.batch-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 68rpx;
  padding: 0 28rpx;
  border-radius: var(--r-full);
}

.batch-btn-text {
  font-size: 28rpx;
}

/* 禁用态不用 opacity 压白字：白字在半透明蓝上会彻底看不见 */
.btn-off {
  background-color: var(--surface-2);
  color: var(--faint);
}

.hint {
  padding: 40px 22px;
  font-size: 14px;
  text-align: center;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 90px);
}
</style>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <view class="topbar">
      <view class="icon-btn" @click="back">‹</view>
      <text class="topbar-title">碎片箱</text>
      <view class="topbar-spacer" />
      <view class="icon-btn" @click="openImport">↥</view>
      <view class="icon-btn" @click="reload">⟳</view>
    </view>

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
          <view class="thumb-x" @click="removeImage(i)">×</view>
        </view>
      </view>
      <view class="compose-bar">
        <view class="chip" @click="addImages">图片{{ images.length ? ` ${images.length}` : '' }}</view>
        <view class="chip" @click="pasteClipboard">粘贴</view>
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
          <text v-if="item.doc_id" class="action" @click.stop="openDoc(item.doc_id)">打开草稿</text>
          <text
            v-if="item.status === 'captured' || item.status === 'queued'"
            class="action"
            @click.stop="dispatchOne(item)"
          >
            整理成文
          </text>
          <text class="action danger" @click.stop="remove(item)">删除</text>
        </view>
      </view>
    </view>

    <!-- 批量条 -->
    <view v-if="selected.length" class="batch">
      <text class="batch-info">已选 {{ selected.length }} 条</text>
      <view class="topbar-spacer" />
      <text class="batch-cancel" @click="selected = []">取消</text>
      <button class="btn batch-btn" :disabled="working" @click="dispatchSelected">
        {{ selected.length > 1 ? '合并成文' : '整理成文' }}
      </button>
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
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

const draft = ref('')
const images = ref<string[]>([])
const list = ref<InboxItem[]>([])
const loading = ref(false)
const sending = ref(false)
const working = ref(false)
const activeStatus = ref<InboxStatus | ''>('captured')
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

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await apiItems(activeStatus.value || undefined, 100)
    list.value = res.items || []
    selected.value = selected.value.filter((id) => list.value.some((i) => i.id === id))
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
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
    uni.showToast({ title: '剪贴板是空的', icon: 'none' })
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
    uni.showToast({ title: '已投递', icon: 'none' })
    if (activeStatus.value === 'processed') activeStatus.value = 'captured'
    await load()
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '投递失败', icon: 'none' })
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

function remove(item: InboxItem): void {
  uni.showModal({
    title: '删除碎片',
    content: '删除后不可恢复，确定吗？',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await removeItem(item.id)
        list.value = list.value.filter((i) => i.id !== item.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err: any) {
        uni.showToast({ title: err?.reason || '删除失败', icon: 'none' })
      }
    },
  })
}

async function runDispatch(ids: string[]): Promise<void> {
  if (working.value) return
  working.value = true
  try {
    const res = await dispatch(ids)
    const docId = res.doc_id || (res.doc && res.doc.id) || ''
    selected.value = []
    await load()
    uni.showModal({
      title: '已整理成草稿',
      content: '草稿已生成，去编辑还是留在碎片箱？',
      confirmText: '去编辑',
      cancelText: '留下',
      success: (r) => {
        if (r.confirm && docId) {
          uni.navigateTo({ url: `/pages/edit/index?id=${encodeURIComponent(docId)}` })
        }
      },
    })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '整理失败', icon: 'none' })
  } finally {
    working.value = false
  }
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

onShow(() => {
  load()
})
</script>

<style scoped>
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
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  font-size: 14px;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.55);
  border-bottom-left-radius: 8px;
}

.compose-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
}

.chip {
  font-size: 13px;
  color: var(--text-2);
  background-color: var(--surface-2);
  padding: 6px 12px;
  border-radius: 8px;
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
  font-size: 13px;
  color: var(--accent);
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
  font-size: 13px;
  color: var(--muted);
}

.batch-btn {
  height: 34px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 9px;
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

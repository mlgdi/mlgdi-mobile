<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <view class="topbar">
      <text class="topbar-title">渡己</text>
      <view class="topbar-spacer" />
      <view class="icon-btn" @click="reload">⟳</view>
      <view class="icon-btn" @click="toSettings">⚙</view>
    </view>

    <view class="search-wrap">
      <input
        v-model="keyword"
        class="field"
        placeholder="搜索标题 / 摘要"
        placeholder-class="ph"
        confirm-type="search"
      />
    </view>

    <!-- 剪贴板检测：App 从后台回来时，若检测到新链接/文本就问一句要不要收进碎片箱 -->
    <view v-if="clipHint" class="clip card">
      <view class="clip-main">
        <text class="clip-title">检测到剪贴板内容</text>
        <text class="clip-text">{{ clipHint }}</text>
      </view>
      <view class="clip-actions">
        <text class="clip-cancel" @click="dismissClip">忽略</text>
        <text class="clip-do" @click="captureClip">收进碎片箱</text>
      </view>
    </view>

    <view v-if="notes.loading && !notes.docs.length" class="hint muted">正在加载…</view>

    <view v-else-if="notes.error" class="hint">
      <text class="muted">{{ notes.error }}</text>
      <button class="btn btn-ghost retry" @click="reload">重试</button>
    </view>

    <view v-else-if="!items.length" class="hint muted">
      {{ keyword ? '没有匹配的内容' : '这里还没有文章' }}
    </view>

    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="item" @click="open(item)">
        <view class="row item-head">
          <text class="item-title">{{ item.title }}</text>
          <text v-if="item.pinned" class="pin">置顶</text>
        </view>
        <text v-if="item.excerpt" class="item-excerpt">{{ item.excerpt }}</text>
        <view class="row item-meta">
          <text class="muted">{{ item.folderLabel }}</text>
          <text class="dot muted">·</text>
          <text class="muted">{{ formatDate(item.updated_at) }}</text>
          <text v-if="item.word_count" class="dot muted">·</text>
          <text v-if="item.word_count" class="muted">{{ item.word_count }} 字</text>
        </view>
      </view>
    </view>

    <view class="tail" />

    <!-- 投递入口：手机上最高频的动作，放右下角一按可达 -->
    <view class="fab" @click="toInbox">＋</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useNotesStore, type FlatDoc } from '../../shared/store/notes'
import { useAuthStore } from '../../shared/store/auth'
import { hasSession } from '../../shared/auth/session'
import { resolvedTheme } from '../../shared/theme'
import { capabilities } from '../../shared/capabilities'
import { readClipboard } from '../../shared/utils/file'
import { capture } from '../../shared/api/inbox'

const notes = useNotesStore()
const auth = useAuthStore()
const keyword = ref('')
const clipHint = ref('')
let lastClip = ''

/** 剪贴板只在 App 端主动读；H5 浏览器没有免授权读取，读了也是空 */
async function checkClipboard(): Promise<void> {
  if (!capabilities.canCapture || !hasSession()) return
  const text = (await readClipboard()).trim()
  if (!text || text === lastClip) return
  // 只对「像链接 / 像一段正文」的内容提示，避免复制密码、验证码也弹
  const looksUseful =
    /^https?:\/\/\S{6,}$/i.test(text) || (text.length >= 12 && /\s/.test(text) && text.length < 2000)
  if (!looksUseful) return
  lastClip = text
  clipHint.value = text.length > 60 ? `${text.slice(0, 60)}…` : text
}

async function captureClip(): Promise<void> {
  const text = lastClip
  clipHint.value = ''
  if (!text) return
  try {
    await capture({ content: text, source_type: /^https?:\/\//i.test(text) ? 'url' : 'text' })
    uni.showToast({ title: '已收进碎片箱', icon: 'none' })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '投递失败', icon: 'none' })
  }
}

function dismissClip(): void {
  clipHint.value = ''
}

function toInbox(): void {
  uni.navigateTo({ url: '/pages/inbox/index' })
}

const items = computed<FlatDoc[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return notes.docs
  return notes.docs.filter(
    (d) =>
      d.title.toLowerCase().includes(kw) ||
      (d.excerpt || '').toLowerCase().includes(kw) ||
      d.path.toLowerCase().includes(kw),
  )
})

function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return sameYear ? `${mm}-${dd}` : `${d.getFullYear()}-${mm}-${dd}`
}

async function ensureLogin(): Promise<boolean> {
  if (hasSession()) return true
  uni.reLaunch({ url: '/pages/login/index' })
  return false
}

async function load(force = false): Promise<void> {
  if (!(await ensureLogin())) return
  try {
    await notes.load(force)
  } catch (err: any) {
    if (auth.handleFatal(err)) return
    // 游客可读接口出错时保持静默，页面已有错误态
  }
}

function reload(): void {
  load(true)
}

function open(doc: FlatDoc): void {
  uni.navigateTo({ url: `/pages/doc/index?id=${encodeURIComponent(doc.id)}` })
}

function toSettings(): void {
  uni.navigateTo({ url: '/pages/settings/index' })
}

onShow(() => {
  load()
  checkClipboard()
})

onPullDownRefresh(async () => {
  await load(true)
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.search-wrap {
  padding: 4px 16px 12px;
}

.ph {
  color: var(--muted);
}

.list {
  padding: 0 16px;
}

.item {
  padding: 14px 16px;
  margin-bottom: 10px;
  border-radius: 14px;
  background-color: var(--surface);
  border: 1px solid var(--line);
}

.item:active {
  background-color: var(--surface-2);
}

.item-head {
  justify-content: space-between;
}

.item-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
  flex: 1;
}

.pin {
  font-size: 11px;
  color: var(--accent);
  background-color: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 6px;
}

.item-excerpt {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--muted);
}

.item-meta {
  margin-top: 10px;
  font-size: 12px;
  gap: 6px;
  flex-wrap: wrap;
}

.dot {
  font-size: 12px;
}

.hint {
  padding: 40px 22px;
  font-size: 14px;
  text-align: center;
}

.retry {
  margin-top: 16px;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 88px);
}

.clip {
  margin: 0 16px 12px;
  padding: 12px 14px;
}

.clip-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.clip-text {
  font-size: 12px;
  color: var(--muted);
  word-break: break-all;
}

.clip-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 10px;
  font-size: 13px;
}

.clip-cancel {
  color: var(--muted);
}

.clip-do {
  color: var(--accent);
  font-weight: 600;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: calc(env(safe-area-inset-bottom) + 24px);
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background-color: var(--accent);
  color: #fff;
  font-size: 28px;
  line-height: 54px;
  text-align: center;
  box-shadow: 0 8px 22px rgba(0, 102, 204, 0.35);
}

.fab:active {
  transform: scale(0.94);
}
</style>

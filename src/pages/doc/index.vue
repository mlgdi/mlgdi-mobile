<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <view class="topbar">
      <view class="icon-btn" @click="back">‹</view>
      <text class="topbar-title doc-title">{{ doc?.title || '' }}</text>
      <view class="topbar-spacer" />
      <view v-if="canEdit && doc" class="icon-btn" @click="toEdit">✎</view>
    </view>

    <view v-if="loading" class="hint muted">正在打开…</view>

    <view v-else-if="error" class="hint">
      <text class="muted">{{ error }}</text>
      <button class="btn btn-ghost retry" @click="load">重试</button>
    </view>

    <view v-else-if="doc" class="content">
      <text class="title">{{ doc.title }}</text>
      <view class="row meta">
        <text class="muted">{{ formatDate(doc.updated_at) }}</text>
        <text class="dot muted">·</text>
        <text class="muted">{{ doc.word_count }} 字</text>
        <text v-if="doc.backlinks && doc.backlinks.length" class="dot muted">·</text>
        <text v-if="doc.backlinks && doc.backlinks.length" class="muted">
          {{ doc.backlinks.length }} 条反链
        </text>
      </view>

      <MpHtml
        class="md-body"
        :content="html"
        :selectable="true"
        :preview-img="true"
        :lazy-load="true"
        @linktap="onLinkTap"
      />
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
// mp-html 走显式 import 而不是 easycom：npm 包路径下 easycom 解析不到（实测渲染成空元素）
import MpHtml from 'mp-html/dist/uni-app/components/mp-html/mp-html.vue'
import { doc as apiDoc, type DocDetail } from '../../shared/api/notes'
import { renderMarkdown, parseWikilinkHref } from '../../shared/utils/markdown'
import { useNotesStore } from '../../shared/store/notes'
import { resolvedTheme } from '../../shared/theme'
import { capabilities } from '../../shared/capabilities'

const canEdit = capabilities.canEdit

const notes = useNotesStore()
const doc = ref<DocDetail | null>(null)
const html = ref('')
const loading = ref(true)
const error = ref('')
const docId = ref('')

function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

async function load(): Promise<void> {
  if (!docId.value) return
  loading.value = true
  error.value = ''
  try {
    const detail = await apiDoc(docId.value)
    doc.value = detail
    html.value = renderMarkdown(detail.body || '')
    uni.setNavigationBarTitle?.({ title: detail.title || '文档' })
  } catch (err: any) {
    error.value = err?.reason || err?.message || '打开失败'
  } finally {
    loading.value = false
  }
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

/** 双链与外链分开处理：站内按标题解析 id，外链复制走人（WebView 里不要直接跳出去） */
async function onLinkTap(e: any): Promise<void> {
  const href = String((e && e.href) || '')
  if (!href) return

  const target = parseWikilinkHref(href)
  if (target !== null) {
    if (!notes.docs.length) {
      try {
        await notes.load()
      } catch {
        /* 忽略：下面按未找到处理 */
      }
    }
    const id = notes.findIdByTitle(target)
    if (id) {
      uni.navigateTo({ url: `/pages/doc/index?id=${encodeURIComponent(id)}` })
    } else {
      uni.showToast({ title: `未找到：${target}`, icon: 'none' })
    }
    return
  }

  if (/^https?:\/\//i.test(href)) {
    uni.setClipboardData({
      data: href,
      success: () => uni.showToast({ title: '链接已复制', icon: 'none' }),
    })
  }
}

onLoad((options: any) => {
  docId.value = String((options && options.id) || '')
  load()
})
</script>

<style scoped>
.doc-title {
  font-size: 16px;
  font-weight: 500;
}

.content {
  padding: 8px 20px 0;
}

.title {
  display: block;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.7px;
  line-height: 1.3;
  color: var(--text);
}

.meta {
  margin: 10px 0 22px;
  font-size: 12px;
  gap: 6px;
  flex-wrap: wrap;
}

.dot {
  font-size: 12px;
}

.hint {
  padding: 60px 22px;
  font-size: 14px;
  text-align: center;
}

.retry {
  margin-top: 16px;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 60px);
}
</style>

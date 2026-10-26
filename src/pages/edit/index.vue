<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <view class="topbar">
      <view class="icon-btn" @click="back">‹</view>
      <text class="topbar-title">{{ title || '编辑' }}</text>
      <view class="topbar-spacer" />
      <!-- 用 view 而不是 button：uni-button 的默认样式会抢走 flex 宽度，
           标题一长「保存」就被挤成一条缝（截图里根本看不见） -->
      <view :class="['btn', 'save', dirty && !saving ? '' : 'save-off']" @click="save">
        {{ saving ? '保存中' : '保存' }}
      </view>
    </view>

    <view v-if="loading" class="hint muted">加载中…</view>

    <template v-else>
      <view class="meta-bar">
        <text class="meta-chip">{{ statusLabel }}</text>
        <text class="meta-chip">{{ visibilityLabel }}</text>
        <text class="muted meta-v">v{{ version }}</text>
        <view class="topbar-spacer" />
        <text v-if="dirty" class="dirty">未保存</text>
      </view>

      <textarea
        v-model="body"
        class="editor"
        placeholder="正文（Markdown）。front-matter 归 Obsidian，这里只改正文。"
        placeholder-class="ph"
        :maxlength="-1"
        :show-confirm-bar="false"
        :adjust-position="false"
      />

      <view class="footer">
        <view class="footer-row">
          <text class="footer-label muted">状态</text>
          <picker :range="statusOptions" range-key="label" :value="statusIndex" @change="onStatus">
            <view class="picker">{{ statusLabel }} ▾</view>
          </picker>
          <text class="footer-label muted">可见性</text>
          <picker :range="visibilityOptions" range-key="label" :value="visibilityIndex" @change="onVisibility">
            <view class="picker">{{ visibilityLabel }} ▾</view>
          </picker>
        </view>
        <view class="footer-row">
          <button class="btn btn-ghost flex1" @click="saveMeta">只存元数据</button>
          <button class="btn flex1" @click="publish">发布</button>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  doc as apiDoc,
  patchMeta,
  publishDoc,
  updateBody,
  type DocDetail,
} from '../../shared/api/notes'
import { ApiError } from '../../shared/api/client'
import { resolvedTheme } from '../../shared/theme'

const docId = ref('')
const title = ref('')
const body = ref('')
const original = ref('')
const version = ref(0)
const status = ref<'draft' | 'reviewed' | 'published'>('draft')
const visibility = ref<'private' | 'member' | 'public'>('public')
const loading = ref(true)
const saving = ref(false)

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'reviewed', label: '已确认' },
  { value: 'published', label: '已发布' },
]
const visibilityOptions = [
  { value: 'private', label: '私有' },
  { value: 'member', label: '成员可见' },
  { value: 'public', label: '公开' },
]

const statusIndex = computed(() => Math.max(0, statusOptions.findIndex((o) => o.value === status.value)))
const visibilityIndex = computed(() =>
  Math.max(0, visibilityOptions.findIndex((o) => o.value === visibility.value)),
)
const statusLabel = computed(() => statusOptions[statusIndex.value].label)
const visibilityLabel = computed(() => visibilityOptions[visibilityIndex.value].label)
const dirty = computed(() => body.value !== original.value)

function back(): void {
  if (!dirty.value) {
    uni.navigateBack()
    return
  }
  uni.showModal({
    title: '放弃修改？',
    content: '正文有未保存的改动。',
    confirmText: '放弃',
    cancelText: '继续编辑',
    success: (res) => {
      if (res.confirm) uni.navigateBack()
    },
  })
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const detail: DocDetail = await apiDoc(docId.value)
    title.value = detail.title
    body.value = detail.body || ''
    original.value = detail.body || ''
    version.value = detail.version
    status.value = (detail.status as any) || 'draft'
    visibility.value = (detail.visibility as any) || 'public'
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '打开失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function onStatus(e: any): void {
  status.value = statusOptions[Number(e.detail.value)].value as any
}

function onVisibility(e: any): void {
  visibility.value = visibilityOptions[Number(e.detail.value)].value as any
}

/**
 * 乐观锁冲突的统一处理。
 * 绝不自动覆盖：同一篇可能刚在 Obsidian 或网页端改过，
 * 覆盖等于静默丢别人的编辑，所以只提供「重新加载」。
 */
function handleConflict(err: unknown): boolean {
  if (err instanceof ApiError && (err.code === 'DOC_VERSION_CONFLICT' || err.status === 409)) {
    uni.showModal({
      title: '内容已在别处修改',
      content: `${err.reason || '版本不一致'}。建议重新加载后再改。`,
      confirmText: '重新加载',
      cancelText: '留着',
      success: (res) => {
        if (res.confirm) load()
      },
    })
    return true
  }
  return false
}

async function save(): Promise<void> {
  if (!dirty.value || saving.value) return
  saving.value = true
  try {
    const res = await updateBody(docId.value, body.value, version.value)
    version.value = res.doc.version
    original.value = body.value
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err: any) {
    if (!handleConflict(err)) uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function saveMeta(): Promise<void> {
  saving.value = true
  try {
    const res = await patchMeta(docId.value, {
      status: status.value,
      visibility: visibility.value,
      base_version: version.value,
    })
    version.value = res.doc.version
    uni.showToast({ title: '元数据已更新', icon: 'none' })
  } catch (err: any) {
    if (!handleConflict(err)) uni.showToast({ title: err?.reason || '更新失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function publish(): Promise<void> {
  uni.showModal({
    title: '发布这篇',
    content: `状态置为「已发布」，可见性「${visibilityLabel.value}」，缺 slug 会自动生成。`,
    success: async (res) => {
      if (!res.confirm) return
      saving.value = true
      try {
        const r = await publishDoc(docId.value, {
          status: 'published',
          visibility: visibility.value,
          base_version: version.value,
        })
        version.value = r.doc.version
        status.value = 'published'
        uni.showToast({ title: '已发布', icon: 'none' })
      } catch (err: any) {
        if (!handleConflict(err)) uni.showToast({ title: err?.reason || '发布失败', icon: 'none' })
      } finally {
        saving.value = false
      }
    },
  })
}

onLoad((options: any) => {
  docId.value = String((options && options.id) || '')
  if (!docId.value) {
    uni.showToast({ title: '缺少文档 id', icon: 'none' })
    return
  }
  load()
})
</script>

<style scoped>
.save {
  height: 32px;
  padding: 0 14px;
  font-size: 14px;
  border-radius: 9px;
  flex: 0 0 auto;
  min-width: 62px;
}

.save-off {
  background-color: var(--surface-2);
  color: var(--muted);
}

.meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 8px;
  font-size: 12px;
}

.meta-chip {
  color: var(--muted);
  background-color: var(--surface-2);
  padding: 3px 8px;
  border-radius: 7px;
}

.meta-v {
  font-size: 12px;
}

.dirty {
  font-size: 12px;
  color: var(--danger);
}

.editor {
  width: calc(100% - 32px);
  margin: 0 16px;
  height: calc(100vh - 230px);
  padding: 14px;
  box-sizing: border-box;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text);
  background-color: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

.ph {
  color: var(--muted);
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 16px calc(env(safe-area-inset-bottom) + 10px);
  background-color: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-label {
  font-size: 12px;
}

.picker {
  font-size: 14px;
  color: var(--text);
  background-color: var(--surface-2);
  padding: 7px 12px;
  border-radius: 9px;
}

.flex1 {
  flex: 1;
  height: 42px;
  font-size: 15px;
}

.hint {
  padding: 60px 22px;
  text-align: center;
  font-size: 14px;
}
</style>

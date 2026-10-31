<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="导入 Markdown" :elevated="true" @back="back" />

    <view class="section">
      <view class="row actions">
        <button class="btn btn-ghost flex1" @click="chooseFile">选择 .md 文件</button>
        <button class="btn btn-ghost flex1" @click="paste">从剪贴板</button>
      </view>
      <text class="note muted">
        App 端可以直接从「文件」App 或 iCloud 里选 .md；也可以先复制内容再点剪贴板。
      </text>
    </view>

    <view class="section">
      <text class="section-label muted">标题</text>
      <view class="card">
        <input v-model="title" class="line-input" placeholder="导入后用作文件名与标题" placeholder-class="ph" />
      </view>
    </view>

    <view class="section">
      <text class="section-label muted">落到哪个目录</text>
      <view class="card">
        <picker :range="dirOptions" :value="dirIndex" @change="onDir">
          <view class="cell">
            <text class="cell-title">{{ dirOptions[dirIndex] }}</text>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </picker>
      </view>
      <text class="note muted">默认进 00_Inbox，符合「服务端只写 Inbox」的约定；之后可整理到正式目录。</text>
    </view>

    <view class="section">
      <text class="section-label muted">可见性</text>
      <view class="card">
        <picker :range="visibilityOptions" range-key="label" :value="visibilityIndex" @change="onVisibility">
          <view class="cell">
            <text class="cell-title">{{ visibilityOptions[visibilityIndex].label }}</text>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </picker>
      </view>
      <text class="note muted">导入的草稿默认私有，确认内容后再改公开。</text>
    </view>

    <view class="section">
      <view class="row section-head">
        <text class="section-label muted">内容预览</text>
        <text class="section-label muted">{{ charCount }} 字</text>
      </view>
      <view class="card preview">
        <textarea
          v-model="content"
          class="preview-input"
          placeholder="点上面按钮选文件，或直接在这里粘贴 Markdown"
          placeholder-class="ph"
          :maxlength="-1"
          :show-confirm-bar="false"
        />
      </view>
    </view>

    <view class="section">
      <button class="btn" :disabled="!canSubmit || submitting" @click="submit">
        {{ submitting ? '导入中…' : '导入' }}
      </button>
      <text v-if="fileName" class="note muted">来源文件：{{ fileName }}</text>
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onLoad } from '@dcloudio/uni-app'
import { createDoc } from '../../shared/api/notes'
import { guessTitle, pickMarkdownFile, readClipboard } from '../../shared/utils/file'
import { useNotesStore } from '../../shared/store/notes'
import { resolvedTheme } from '../../shared/theme'

import { toast } from '../../shared/ui/feedback'
const notes = useNotesStore()

const content = ref('')
const title = ref('')
const fileName = ref('')
const submitting = ref(false)
const dirs = ref<string[]>(['00_Inbox'])
const dirIndex = ref(0)

const visibilityOptions = [
  { value: 'private', label: '私有' },
  { value: 'member', label: '成员可见' },
  { value: 'public', label: '公开' },
]
const visibilityIndex = ref(0)

const dirOptions = computed(() => dirs.value)
const charCount = computed(() => content.value.length)
const canSubmit = computed(() => Boolean(content.value.trim() && title.value.trim() && dirOptions.value.length))

/** 目录候选：树的根 + 各级子目录（去重、只保留字符串路径） */
function collectDirs(): void {
  const set = new Set<string>(['00_Inbox', '01_Journal', '03_Articles'])
  const walk = (nodes: any[], ) => {
    for (const node of nodes || []) {
      if (node.path) set.add(node.path)
      walk(node.folders)
    }
  }
  for (const root of notes.roots) {
    if (root.path) set.add(root.path)
    walk(root.folders)
  }
  dirs.value = Array.from(set).sort()
  const inboxIndex = dirs.value.indexOf('00_Inbox')
  dirIndex.value = inboxIndex >= 0 ? inboxIndex : 0
}

function back(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

function onDir(e: any): void {
  dirIndex.value = Number(e.detail.value)
}

function onVisibility(e: any): void {
  visibilityIndex.value = Number(e.detail.value)
}

async function chooseFile(): Promise<void> {
  const file = await pickMarkdownFile()
  if (!file) {
    toast('没读到文件（可改用剪贴板）')
    return
  }
  fileName.value = file.name
  content.value = file.content
  if (!title.value.trim()) title.value = guessTitle(file.content, file.name)
}

async function paste(): Promise<void> {
  const text = await readClipboard()
  if (!text.trim()) {
    toast('剪贴板是空的')
    return
  }
  content.value = content.value ? `${content.value}\n${text}` : text
  if (!title.value.trim()) title.value = guessTitle(text)
}

async function submit(): Promise<void> {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const res = await createDoc({
      dir: dirOptions.value[dirIndex.value],
      title: title.value.trim(),
      visibility: visibilityOptions[visibilityIndex.value].value as any,
      template: 'post',
      body: content.value,
    })
    const id = res.doc && res.doc.id
    toast('已导入')
    notes.load(true).catch(() => undefined)
    setTimeout(() => {
      if (id) {
        uni.redirectTo({ url: `/pages/edit/index?id=${encodeURIComponent(id)}` })
      } else {
        back()
      }
    }, 400)
  } catch (err: any) {
    toast(err?.reason || err?.message || '导入失败', 2600)
  } finally {
    submitting.value = false
  }
}

onLoad(async () => {
  try {
    if (!notes.roots.length) await notes.load()
  } catch {
    /* 目录拿不到就用默认三个根 */
  }
  collectDirs()
})
</script>

<style scoped>
.section {
  padding: 14px 16px 0;
}

.section-head {
  justify-content: space-between;
}

.section-label {
  display: block;
  font-size: 12px;
  padding: 0 2px 8px;
  letter-spacing: 0.3px;
}

.card {
  overflow: hidden;
}

.actions {
  gap: 10px;
}

.flex1 {
  flex: 1;
  height: 42px;
  font-size: 15px;
}

.line-input {
  height: 46px;
  padding: 0 14px;
  font-size: 16px;
  color: var(--text);
}

.cell {
  height: 46px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.cell:active {
  background-color: var(--surface-2);
}

.cell-title {
  flex: 1;
  font-size: 15px;
  color: var(--text);
}

.chev {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--faint);
}

.preview {
  padding: 12px 14px;
}

.preview-input {
  width: 100%;
  height: 200px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
}

.ph {
  color: var(--muted);
}

.note {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 4px 0;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 40px);
}
</style>

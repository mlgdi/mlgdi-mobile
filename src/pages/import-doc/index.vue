<script setup lang="ts">
/**
 * 导入从其他 App 分享过来的 Markdown。
 *
 * 入口在 `App.vue` 的 onShow：扫到 `Documents/Inbox/` 有文件就跳到这里。
 * 页面只做一件事 —— 让用户选「碎片」还是「文章」，选完删掉源文件继续下一篇。
 *
 * 为什么不像 Obsidian 那样直接弹一个 ActionSheet：存为文章还要选目录，
 * 二级弹层在 ActionSheet 上叠着不成立；这里用一个页面承载，
 * 顺带能显示文件名、字数和正文预览，用户能确认自己要导的是哪一份。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import GDirSheet from '../../shared/components/GDirSheet.vue'
import { resolvedTheme } from '../../shared/theme'
import {
  inboxDiagnostics,
  listInboxDocs,
  removeInboxDoc,
  titleFromName,
  type InboxDoc,
  type InboxDiagnostics,
} from '../../shared/utils/inbox-import'
import { capture } from '../../shared/api/inbox'
import { createDoc } from '../../shared/api/notes'
import { useNotesStore } from '../../shared/store/notes'
import { requireLogin } from '../../shared/utils/guard'

const notes = useNotesStore()

/** 待处理队列：处理完一篇就出队，全部处理完才返回 */
const queue = ref<InboxDoc[]>([])
/** 空态时显示的目录实况，用来区分「系统没拷进来」和「拷进来了但读不出」 */
const diag = ref<InboxDiagnostics | null>(null)
const loading = ref(true)
const busy = ref(false)
const dirOpen = ref(false)

const current = computed(() => queue.value[0] || null)
const rest = computed(() => Math.max(0, queue.value.length - 1))
const docTitle = computed(() => (current.value ? titleFromName(current.value.name) : ''))
const wordCount = computed(() =>
  current.value ? current.value.text.replace(/\s/g, '').length : 0,
)

/**
 * 预览只留开头：这是给人确认「是不是这篇」的，不是阅读器。
 *
 * 顺手剥掉 Markdown 标记（`#` 标题、`>` 引用、列表符号）：原文里的 `## 户型`
 * 摆在卡片上是语法噪音，用户要认的是内容。剥完把连续空行压成一个，
 * 否则前 240 字可能全被空行吃掉。
 */
const previewText = computed(() => {
  const t = (current.value?.text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s*/, '')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(/^\s{0,3}[-*+]\s+/, '')
        .replace(/^\s{0,3}\d+[.)]\s+/, ''),
    )
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return t.length > 240 ? `${t.slice(0, 240)}…` : t
})

onLoad(() => {
  // 导入要写权限：游客先登录，文件留在 Inbox 不会丢，登录后回前台还会被扫到
  if (!requireLogin('导入文件需要登录')) {
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  try {
    queue.value = await listInboxDocs()
  } finally {
    loading.value = false
  }
  // 队列空了才需要诊断信息：没有文件时告诉用户「这里确实没有东西」，
  // 而不是一句「没有待导入的文件」让人不知道是功能坏了还是真没有
  if (!queue.value.length) {
    diag.value = await inboxDiagnostics().catch(() => null)
  }
}

/** 一篇处理完：删源文件、出队；队列空了刷新列表并返回 */
async function finishOne(): Promise<void> {
  const cur = current.value
  if (cur) await removeInboxDoc(cur.path)
  queue.value = queue.value.slice(1)
  busy.value = false

  if (queue.value.length) return
  // 存为文章后首页要立刻看得到：notes 有 5 分钟缓存，必须 force
  await notes.load(true)
  uni.showToast({ title: '已导入', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 500)
}

async function saveAsFragment(): Promise<void> {
  if (!current.value || busy.value) return
  busy.value = true
  try {
    await capture({
      content: current.value.text,
      source_meta: { name: current.value.name, from: 'file-import' },
    })
    uni.showToast({ title: '已存进碎片箱', icon: 'none' })
    await finishOne()
  } catch (e) {
    busy.value = false
    uni.showToast({ title: (e as Error)?.message || '投递失败', icon: 'none' })
  }
}

function openDir(): void {
  if (!current.value || busy.value) return
  dirOpen.value = true
}

async function saveAsDoc(path: string): Promise<void> {
  if (!current.value || busy.value) return
  dirOpen.value = false
  busy.value = true
  try {
    // body 直接给原文：服务端会剥掉里面自带的 front-matter 再生成自己的
    await createDoc({
      dir: path,
      title: docTitle.value,
      template: 'post',
      body: current.value.text,
    })
    uni.showToast({ title: `已存到 ${path.split('/').pop()}`, icon: 'none' })
    await finishOne()
  } catch (e) {
    busy.value = false
    uni.showToast({ title: (e as Error)?.message || '创建失败', icon: 'none' })
  }
}

/** 跳过：直接删掉，不留痕迹（用户明确说不要了） */
async function skip(): Promise<void> {
  if (!current.value || busy.value) return
  busy.value = true
  await finishOne()
}

function back(): void {
  uni.navigateBack()
}
</script>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="导入文件" :elevated="true" @back="back" />

    <view class="body">
      <view v-if="loading" class="hint">
        <text class="muted">正在读取…</text>
      </view>

      <view v-else-if="!current" class="hint">
        <text class="muted">没有待导入的文件</text>
        <text v-if="diag" class="diag">
          {{ diag.dir }}：{{ diag.total }} 个文件{{ diag.total && !diag.usable ? '（都不是 md / txt）' : '' }}
        </text>
        <text class="diag-h">
          从「文件」App 里长按 .md → 共享 → 渡己，文件会出现在这里
        </text>
      </view>

      <template v-else>
        <view class="fcard">
          <view class="frow">
            <GIcon name="doc" :size="34" :weight="2" />
            <text class="fname">{{ current.name }}</text>
          </view>
          <text class="fmeta">{{ wordCount }} 字 · 来自系统分享</text>
          <text class="fpreview">{{ previewText }}</text>
        </view>

        <text class="section-label muted">存到哪里</text>

        <view class="acts">
          <view :class="['act', busy ? 'is-busy' : '']" @click="saveAsFragment">
            <view class="act-ico"><GIcon name="inbox" :size="36" :weight="2" /></view>
            <view class="act-main">
              <text class="act-t">存为碎片</text>
              <text class="act-h">进碎片箱，之后和别的碎片一起整理成文</text>
            </view>
            <GIcon name="chevron-right" :size="26" />
          </view>

          <view :class="['act', busy ? 'is-busy' : '']" @click="openDir">
            <view class="act-ico"><GIcon name="folder" :size="36" :weight="2" /></view>
            <view class="act-main">
              <text class="act-t">存为文章</text>
              <text class="act-h">选一个目录，正文原样写进去</text>
            </view>
            <GIcon name="chevron-right" :size="26" />
          </view>
        </view>

        <view class="tail">
          <text class="skip" @click="skip">跳过这篇</text>
          <text v-if="rest" class="rest">还有 {{ rest }} 篇待处理</text>
        </view>
      </template>
    </view>

    <GDirSheet
      :open="dirOpen"
      title="存到"
      :busy="busy"
      allow-inbox
      @close="dirOpen = false"
      @pick="saveAsDoc"
    />
  </view>
</template>

<style scoped>
.body {
  padding: 24rpx var(--page-gutter) 60rpx;
}

.hint {
  padding: 120rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  text-align: center;
}

.diag {
  font-size: var(--fs-xs);
  color: var(--faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.diag-h {
  max-width: 520rpx;
  font-size: var(--fs-xs);
  line-height: 1.7;
  color: var(--faint);
}

.fcard {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 32rpx;
  background-color: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
}

.frow {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.fname {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text);
  /* 文件名可能很长，一行内省略，不要把卡片撑高 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fmeta {
  font-size: var(--fs-xs);
  color: var(--faint);
}

.fpreview {
  margin-top: 8rpx;
  font-size: var(--fs-sm);
  line-height: 1.7;
  color: var(--text-2);
  /* 预览最多 240 字，限制在 6 行内，超出省略 */
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.section-label {
  display: block;
  margin: 40rpx 0 16rpx;
  padding-left: 8rpx;
  font-size: var(--fs-xs);
}

.acts {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.act {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx 26rpx;
  background-color: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
}

.act.is-busy {
  opacity: 0.5;
}

.act-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--accent);
}

.act-main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  flex: 1;
  min-width: 0;
}

.act-t {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text);
}

.act-h {
  font-size: var(--fs-xs);
  color: var(--faint);
  line-height: 1.5;
}

.tail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  margin-top: 48rpx;
}

.skip {
  padding: 16rpx 24rpx;
  font-size: var(--fs-sm);
  color: var(--faint);
}

.rest {
  font-size: var(--fs-xs);
  color: var(--faint);
}
</style>

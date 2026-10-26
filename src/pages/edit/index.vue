<template>
  <view :class="['page', 'editor-page', `theme-${resolvedTheme}`]">
    <GTopBar back :title="title || '编辑'" :elevated="true" @back="back">
      <template #actions>
        <view class="icon-btn preview-btn" @click="togglePreview">
          <GIcon :name="preview ? 'pencil' : 'eye'" :size="38" />
        </view>
        <view :class="['icon-btn', 'save-btn', saving ? 'is-busy' : '']" @click="saveAll">
          <GIcon name="check" :size="40" :weight="2.4" />
        </view>
      </template>
    </GTopBar>

    <!-- 属性行：点 chip 切换，比原来的底部按钮区省一整块高度 -->
    <view class="meta">
      <picker :range="statusOptions" range-key="label" :value="statusIndex" @change="onStatus">
        <view :class="['meta-chip', status === 'published' ? 'is-live' : '']">{{ statusLabel }}</view>
      </picker>
      <picker
        :range="visibilityOptions"
        range-key="label"
        :value="visibilityIndex"
        @change="onVisibility"
      >
        <view class="meta-chip">{{ visibilityLabel }}</view>
      </picker>
      <text class="meta-ver">v{{ version }}</text>
      <view class="meta-spacer" />
      <text v-if="dirty || metaDirty" class="meta-dirty">未保存</text>
      <view v-if="status !== 'published'" class="meta-pub" @click="publish">发布</view>
    </view>

    <view v-if="loading" class="hint">
      <text class="muted">加载中…</text>
    </view>

    <template v-else>
      <textarea
        v-if="!preview"
        v-model="body"
        class="editor"
        placeholder="正文（Markdown）。front-matter 归 Obsidian，这里只改正文。"
        placeholder-class="ph"
        :maxlength="-1"
        :show-confirm-bar="false"
        :adjust-position="false"
        @input="onInput"
        @focus="onCaret"
        @blur="onCaret"
      />

      <!-- 预览：与阅读页同一套语义，但只求「看得懂结构」，不追像素一致 -->
      <scroll-view v-else class="preview" scroll-y>
        <view class="pmd">
          <view class="pmd-inner" v-html="previewHtml"></view>
        </view>
        <view class="preview-tail" />
      </scroll-view>

      <!-- 工具栏：符号类用排版字符（B / H1 / •），动作类用 SVG（撤销 / 链接 / 图片 / AI）。
           这两类语义不同，混成一类反而谁都不清楚。 -->
      <scroll-view v-if="!preview" class="toolbar" scroll-x :show-scrollbar="false">
        <view class="tb-row">
          <view class="tb" @click="undo">
            <GIcon name="undo" :size="32" />
          </view>
          <view class="tb" @click="redo">
            <GIcon name="redo" :size="32" />
          </view>

          <view class="tb-sep" />

          <view class="tb tb-w" @click="toggleHeading(1)"><text class="tb-t">H1</text></view>
          <view class="tb tb-w" @click="toggleHeading(2)"><text class="tb-t">H2</text></view>
          <view class="tb tb-w" @click="toggleHeading(3)"><text class="tb-t">H3</text></view>

          <view class="tb-sep" />

          <view class="tb" @click="surround('**', '粗体')"><text class="tb-t is-bold">B</text></view>
          <view class="tb" @click="surround('*', '斜体')"><text class="tb-t is-italic">I</text></view>
          <view class="tb" @click="surround('~~', '删除线')"><text class="tb-t is-strike">S</text></view>
          <view class="tb" @click="surround('==', '高亮')"><text class="tb-t is-mark">H</text></view>
          <view class="tb" @click="surround('`', 'code')">
            <GIcon name="code" :size="30" />
          </view>

          <view class="tb-sep" />

          <view class="tb" @click="toggleLine('- ', ['- ', '* ', '+ ', '- [ ] '])">
            <text class="tb-t">•</text>
          </view>
          <view class="tb" @click="toggleLine('1. ', ['1. ', '2. ', '3. '])">
            <text class="tb-t">1.</text>
          </view>
          <view class="tb" @click="toggleLine('- [ ] ', ['- [ ] ', '- [x] '])">
            <text class="tb-t">☑</text>
          </view>
          <view class="tb" @click="toggleLine('> ', ['> '])"><text class="tb-t">❝</text></view>

          <view class="tb-sep" />

          <view class="tb" @click="insertLink">
            <GIcon name="link" :size="30" />
          </view>
          <view class="tb" @click="pickImage">
            <GIcon name="image" :size="30" />
          </view>
          <view class="tb" @click="insertTable">
            <GIcon name="table" :size="30" />
          </view>
          <view class="tb" @click="insertCodeBlock">
            <GIcon name="code" :size="30" />
          </view>
          <view class="tb" @click="insertBlock('---')">
            <GIcon name="hr" :size="30" />
          </view>

          <view class="tb-sep" />

          <view class="tb tb-ai" @click="openAi">
            <GIcon name="sparkle" :size="32" />
            <text class="tb-t tb-ai-t">AI</text>
          </view>
        </view>
      </scroll-view>
    </template>

    <!-- 浮动 AI 球：可拖动，位置记在本地。面板打开时收起，
         由面板头部那个同样的头像承担「关闭」——右下角在面板覆盖范围内，
         留着也点不到，不如把关闭放在看得见的地方。 -->
    <view
      v-if="!loading && !aiOpen"
      :class="['ai-fab', { 'is-drag': fabDragging }]"
      :style="fabStyle"
      @touchstart="onFabStart"
      @touchmove.stop.prevent="onFabMove"
      @touchend="onFabEnd"
      @touchcancel="onFabEnd"
      @click="onFabTap"
    >
      <image class="ai-fab-img" :src="aiIcon" mode="aspectFit" />
    </view>

    <!-- AI 面板 -->
    <view v-if="aiOpen" class="mask" @click="closeAi" />
    <view :class="['ai-sheet', { 'is-open': aiOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">AI 助手</text>
        <text class="sheet-sub">{{ aiScopeText }}</text>
        <view class="sheet-spacer" />
        <view class="sheet-x" @click="closeAi">
          <image class="sheet-x-img" :src="aiIcon" mode="aspectFit" />
        </view>
      </view>

      <view v-if="aiLoading" class="ai-loading">
        <text class="ai-loading-t">{{ aiRunningLabel }}…</text>
        <text class="ai-loading-s">{{ aiScopeText }}</text>
      </view>

      <template v-else-if="aiResult">
        <scroll-view class="ai-result" scroll-y>
          <view class="ai-result-box">
            <text class="ai-result-t">{{ aiResult }}</text>
          </view>
        </scroll-view>
        <view class="ai-actions">
          <view class="btn btn-ghost flex1" @click="closeAi">放弃</view>
          <view class="btn flex1" @click="applyAi">替换正文</view>
        </view>
        <view class="ai-sub-actions">
          <text class="ai-sub" @click="copyAi">复制结果</text>
        </view>
      </template>

      <scroll-view v-else class="ai-body" scroll-y>
        <text class="ai-group">对选中文字</text>
        <view class="ai-acts">
          <view v-for="a in selectionActions" :key="a.key" class="ai-act" @click="runAi(a)">
            {{ a.label }}
          </view>
        </view>
        <text class="ai-group">对整篇</text>
        <view class="ai-acts">
          <view v-for="a in docActions" :key="a.key" class="ai-act" @click="runAi(a)">
            {{ a.label }}
          </view>
        </view>
        <text class="ai-tip">
          移动端拿不到长按选区，所以上面的动作都作用全文；结果可整体替换或先复制。
        </text>
        <view class="ai-tail" />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import {
  doc as apiDoc,
  patchMeta,
  publishDoc,
  updateBody,
  type DocDetail,
} from '../../shared/api/notes'
import { aiActions, aiAssist, type AiAction } from '../../shared/api/ai'
import { ApiError } from '../../shared/api/client'
import { readSession } from '../../shared/auth/session'
import { getBaseUrl } from '../../shared/config/server'
import { renderMarkdown } from '../../shared/utils/markdown'
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
const preview = ref(false)

/** 打开时的属性快照，用来判断元数据有没有改过 */
const initStatus = ref<string>('draft')
const initVisibility = ref<string>('public')

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
const metaDirty = computed(
  () => status.value !== initStatus.value || visibility.value !== initVisibility.value,
)

const previewHtml = computed(() => (preview.value ? renderMarkdown(body.value).html : ''))

/* ============================ 载入与保存 ============================ */

function back(): void {
  if (!dirty.value && !metaDirty.value) {
    uni.navigateBack()
    return
  }
  uni.showModal({
    title: '放弃修改？',
    content: '正文或属性有未保存的改动。',
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
    status.value = (detail.status as typeof status.value) || 'draft'
    visibility.value = (detail.visibility as typeof visibility.value) || 'public'
    initStatus.value = status.value
    initVisibility.value = visibility.value
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '打开失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function onStatus(e: any): void {
  status.value = statusOptions[Number(e.detail.value)].value as typeof status.value
}

function onVisibility(e: any): void {
  visibility.value = visibilityOptions[Number(e.detail.value)].value as typeof visibility.value
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

/** 一个按钮存完所有东西：用户不该为了改个可见性再找第二个按钮 */
async function saveAll(): Promise<void> {
  if (!dirty.value && !metaDirty.value) {
    uni.showToast({ title: '没有改动', icon: 'none' })
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    if (dirty.value) {
      const res = await updateBody(docId.value, body.value, version.value)
      version.value = res.doc.version
      original.value = body.value
    }
    if (metaDirty.value) {
      const res = await patchMeta(docId.value, {
        status: status.value,
        visibility: visibility.value,
        base_version: version.value,
      })
      version.value = res.doc.version
      initStatus.value = status.value
      initVisibility.value = visibility.value
    }
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch (err: any) {
    if (!handleConflict(err)) uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function publish(): void {
  uni.showModal({
    title: '发布这篇',
    content: `状态置为「已发布」，可见性「${visibilityLabel.value}」，缺 slug 会自动生成。`,
    success: async (res) => {
      if (!res.confirm) return
      saving.value = true
      try {
        // 先落正文再切状态：顺序反了会把旧正文一起发出去
        if (dirty.value) {
          const r = await updateBody(docId.value, body.value, version.value)
          version.value = r.doc.version
          original.value = body.value
        }
        const r = await publishDoc(docId.value, {
          status: 'published',
          visibility: visibility.value,
          base_version: version.value,
        })
        version.value = r.doc.version
        status.value = 'published'
        initStatus.value = 'published'
        uni.showToast({ title: '已发布', icon: 'none' })
      } catch (err: any) {
        if (!handleConflict(err)) uni.showToast({ title: err?.reason || '发布失败', icon: 'none' })
      } finally {
        saving.value = false
      }
    },
  })
}

/* ============================ 编辑操作 ============================
   光标：uni 的 textarea 不返回 selectionStart/End，只能靠 input/focus/blur
   事件里的 cursor。H5 上额外用 setSelectionRange 精确落位；
   App 端（原生 textarea）拿不到选区，插入后需用户自己点一下定位。 */

const cursor = ref(0)

function onCaret(e: any): void {
  const c = e?.detail?.cursor
  if (typeof c === 'number') cursor.value = c
}

function onInput(e: any): void {
  const before = body.value
  body.value = e.detail.value as string
  if (typeof e.detail.cursor === 'number') cursor.value = e.detail.cursor
  scheduleHistory(before)
}

/** 一次改动落定后，「改动前」的文本进历史；H5 上顺手把光标放到目标位置 */
function applyEdit(next: string, caret: number): void {
  pushHistory(body.value)
  body.value = next
  cursor.value = caret
  void nextTick(() => {
    if (typeof document === 'undefined') return
    const el = document.querySelector('.editor textarea, textarea') as HTMLTextAreaElement | null
    try {
      el?.setSelectionRange(caret, caret)
    } catch {
      /* 拿不到就靠用户自己点 */
    }
  })
}

/* ---------------- 撤销 / 重做（自管历史） ----------------
   格式按钮直接改 v-model，不进浏览器原生 undo 栈——这就是
   「点撤销没反应」的根因，所以历史必须自己记。 */
const HISTORY_LIMIT = 80
const undoStack: string[] = []
const redoStack: string[] = []
let historyTimer: ReturnType<typeof setTimeout> | null = null

function pushHistory(before: string): void {
  if (undoStack[undoStack.length - 1] === before) return
  undoStack.push(before)
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
}

function scheduleHistory(before: string): void {
  if (historyTimer) clearTimeout(historyTimer)
  // 连续键入合并成一条：600ms 内只记第一次
  historyTimer = setTimeout(() => {
    if (body.value !== before) pushHistory(before)
  }, 600)
}

function undo(): void {
  const prev = undoStack.pop()
  if (prev === undefined) return
  redoStack.push(body.value)
  body.value = prev
}

function redo(): void {
  const next = redoStack.pop()
  if (next === undefined) return
  undoStack.push(body.value)
  body.value = next
}

/** 光标所在行的 [起, 止) */
function lineRange(pos: number): [number, number] {
  const text = body.value
  const start = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  let end = text.indexOf('\n', pos)
  if (end === -1) end = text.length
  return [start, end]
}

/** 标题：同一级别再点一次就取消（H2 → 普通段落） */
function toggleHeading(level: 1 | 2 | 3): void {
  const prefix = `${'#'.repeat(level)} `
  const siblings = ['# ', '## ', '### ', '#### ']
  const [start, end] = lineRange(cursor.value)
  const line = body.value.slice(start, end)
  const hit = siblings.find((p) => line.startsWith(p))
  const next = hit === prefix ? line.slice(prefix.length) : prefix + line.replace(/^#{1,6}\s/, '')
  applyEdit(body.value.slice(0, start) + next + body.value.slice(end), start + next.length)
}

/** 列表 / 引用：同类前缀互相顶替，不做叠加 */
function toggleLine(prefix: string, siblings: string[]): void {
  const [start, end] = lineRange(cursor.value)
  const line = body.value.slice(start, end)
  // 行首可能有缩进（嵌套列表），前缀要插在缩进之后
  const indent = (line.match(/^\s*/) || [''])[0]
  const rest = line.slice(indent.length)
  const hit = siblings.find((p) => rest.startsWith(p))
  const next = hit
    ? indent + rest.slice(hit.length)
    : indent + prefix + rest.replace(/^([-*+]\s(\[[ x]\]\s)?|\d+\.\s|>\s)/, '')
  applyEdit(body.value.slice(0, start) + next + body.value.slice(end), start + next.length)
}

/** 行内包裹：没有选中就插一段占位，光标落在占位之后、结束标记之前 */
function surround(wrap: string, placeholder: string): void {
  const s = cursor.value
  const next = body.value.slice(0, s) + wrap + placeholder + wrap + body.value.slice(s)
  applyEdit(next, s + wrap.length + placeholder.length)
}

function insertBlock(block: string): void {
  const s = cursor.value
  const before = body.value.slice(0, s)
  const lead = before && !before.endsWith('\n') ? '\n\n' : ''
  const chunk = `${lead}${block}\n`
  applyEdit(before + chunk + body.value.slice(s), s + chunk.length)
}

function insertLink(): void {
  const s = cursor.value
  const chunk = '[链接文字](https://)'
  applyEdit(body.value.slice(0, s) + chunk + body.value.slice(s), s + chunk.length)
}

function insertTable(): void {
  insertBlock('| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n|  |  |  |')
}

function insertCodeBlock(): void {
  insertBlock('```text\n\n```')
}

/**
 * 图片：选图 → 上传 → 插入 markdown。
 * 上传接口要求 `Authorization` + `X-Device-Key`（设备绑定的 token 缺后者必 401），
 * 所以不能裸用 uni.uploadFile，必须把 session 里两样都带上。
 */
function pickImage(): void {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: (res) => {
      const path = (res.tempFilePaths || [])[0]
      if (path) void uploadImage(path)
    },
  })
}

async function uploadImage(localPath: string): Promise<void> {
  const session = readSession()
  uni.showLoading({ title: '上传中…', mask: true })
  try {
    const data = await new Promise<any>((resolve, reject) => {
      uni.uploadFile({
        url: `${getBaseUrl()}/api/v1/assets/upload`,
        filePath: localPath,
        name: 'file',
        header: {
          Authorization: `Bearer ${session.token}`,
          'X-Device-Key': session.deviceSecret,
        },
        success: (r) => {
          try {
            const payload = JSON.parse(r.data || '{}')
            if (r.statusCode >= 400) reject(new Error(payload?.detail?.reason || '上传失败'))
            else resolve(payload)
          } catch {
            reject(new Error('上传响应解析失败'))
          }
        },
        fail: () => reject(new Error('上传失败（网络）')),
      })
    })
    insertBlock(`![](${data.url || ''})`)
    uni.showToast({ title: '图片已插入', icon: 'none' })
  } catch (err: any) {
    uni.showToast({ title: err?.message || '上传失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

function togglePreview(): void {
  preview.value = !preview.value
}

/* ============================ AI ============================ */

const selectionActions = ref<AiAction[]>([])
const docActions = ref<AiAction[]>([])
const aiOpen = ref(false)
const aiLoading = ref(false)
const aiResult = ref('')
const aiRunningLabel = ref('')

const aiScopeText = computed(() =>
  aiLoading.value || aiResult.value ? '结果可替换或复制' : '动作来自 .garden/workflows.yaml',
)

async function openAi(): Promise<void> {
  aiOpen.value = true
  aiResult.value = ''
  if (selectionActions.value.length || docActions.value.length) return
  try {
    const res = await aiActions()
    selectionActions.value = res.groups.selection || []
    docActions.value = res.groups.doc || []
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '动作清单加载失败', icon: 'none' })
  }
}

function closeAi(): void {
  if (aiLoading.value) return
  aiOpen.value = false
  aiResult.value = ''
}

async function runAi(action: AiAction): Promise<void> {
  const source = body.value.trim()
  if (!source) {
    uni.showToast({ title: '正文为空', icon: 'none' })
    return
  }
  aiRunningLabel.value = action.label
  aiLoading.value = true
  aiResult.value = ''
  try {
    const res = await aiAssist(action.key, source)
    aiResult.value = res.result || ''
  } catch (err: any) {
    // 后端把「为什么失败」（未配模型 / 上游网关）放在 detail.reason，必须优先展示
    uni.showToast({ title: err?.reason || err?.message || 'AI 调用失败', icon: 'none' })
  } finally {
    aiLoading.value = false
  }
}

function applyAi(): void {
  if (!aiResult.value) return
  pushHistory(body.value)
  body.value = aiResult.value
  aiOpen.value = false
  aiResult.value = ''
  uni.showToast({ title: '已替换正文', icon: 'none' })
}

function copyAi(): void {
  if (!aiResult.value) return
  uni.setClipboardData({
    data: aiResult.value,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}

/* ============================ 浮动 AI 球 ============================
   位置用 px 存（不是 rpx）：拖动是物理位移，混用单位会导致换机型后跑偏。
   图标跟主题走：明亮 ai_dog、黑暗 ai_cat。 */
const AI_FAB_KEY = 'garden.editor.aifab'

const sysInfo = uni.getSystemInfoSync()
const winW = Number(sysInfo.windowWidth) || 375
const winH = Number(sysInfo.windowHeight) || 667
/** 750 设计稿单位 → 物理 px */
const rpx2px = (n: number): number => (n * winW) / 750
const FAB_SIZE = rpx2px(88)

const aiIcon = computed(() =>
  resolvedTheme.value === 'dark' ? '/static/ai_cat.png' : '/static/ai_dog.png',
)

/** 默认落在右下角、底部工具栏上方 */
const fabPos = ref({
  x: winW - rpx2px(32) - FAB_SIZE,
  y: winH - rpx2px(150) - FAB_SIZE,
})
const fabDragging = ref(false)
const fabStyle = computed(() => ({ left: `${fabPos.value.x}px`, top: `${fabPos.value.y}px` }))

let dragOrigin = { x: 0, y: 0, ox: 0, oy: 0 }
let dragMoved = false
let lastDragEnd = 0

function clampFab(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, x), winW - FAB_SIZE),
    y: Math.min(Math.max(0, y), winH - FAB_SIZE),
  }
}

function loadFabPos(): void {
  try {
    const raw = uni.getStorageSync(AI_FAB_KEY)
    if (raw && typeof raw === 'object' && typeof raw.x === 'number' && typeof raw.y === 'number') {
      fabPos.value = clampFab(raw.x, raw.y)
    }
  } catch {
    /* 用默认位置 */
  }
}

function onFabStart(e: any): void {
  const t = e?.touches?.[0]
  if (!t) return
  dragOrigin = { x: t.clientX, y: t.clientY, ox: fabPos.value.x, oy: fabPos.value.y }
  dragMoved = false
  fabDragging.value = true
}

function onFabMove(e: any): void {
  if (!fabDragging.value) return
  const t = e?.touches?.[0]
  if (!t) return
  const dx = t.clientX - dragOrigin.x
  const dy = t.clientY - dragOrigin.y
  // 6px 死区：手指微抖不算拖，否则点按永远点不动
  if (!dragMoved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
  dragMoved = true
  fabPos.value = clampFab(dragOrigin.ox + dx, dragOrigin.oy + dy)
}

function onFabEnd(): void {
  if (!fabDragging.value) return
  fabDragging.value = false
  if (!dragMoved) return
  lastDragEnd = Date.now()
  try {
    uni.setStorageSync(AI_FAB_KEY, { ...fabPos.value })
  } catch {
    /* 存不进就本次有效 */
  }
}

/** 拖动结束后的 click 要吃掉，否则松手就弹出面板 */
function onFabTap(): void {
  if (Date.now() - lastDragEnd < 320) return
  void openAi()
}

onLoad((options: any) => {
  docId.value = String((options && options.id) || '')
  loadFabPos()
  if (!docId.value) {
    uni.showToast({ title: '缺少文档 id', icon: 'none' })
    return
  }
  void load()
})
</script>

<style scoped>
.editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}

/* ---------------- 属性行 ---------------- */
.meta {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx var(--page-gutter) 16rpx;
  flex: 0 0 auto;
}

.meta-chip {
  height: 56rpx;
  padding: 0 22rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  font-size: var(--fs-2xs);
  color: var(--text-2);
}

.meta-chip.is-live {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.meta-ver {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.meta-spacer {
  flex: 1 1 auto;
}

.meta-dirty {
  font-size: var(--fs-2xs);
  color: var(--danger);
}

.meta-pub {
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-full);
  background-color: var(--accent-soft);
  color: var(--accent);
  font-size: var(--fs-2xs);
  font-weight: 600;
}

/* ---------------- 正文 ---------------- */
.editor {
  flex: 1 1 auto;
  width: 100%;
  padding: 8rpx var(--page-gutter);
  box-sizing: border-box;
  background-color: var(--bg);
  color: var(--text);
  font-size: 30rpx;
  line-height: 1.72;
}

.ph {
  color: var(--placeholder);
}

.preview {
  flex: 1 1 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 8rpx var(--page-gutter) 0;
}

.preview-tail {
  height: 48rpx;
}

/* 预览排版：比阅读页简化，只保证「看得懂结构」 */
.pmd {
  font-size: 32rpx;
  line-height: 1.75;
  color: var(--text);
  word-wrap: break-word;
}

.pmd-inner :deep(> *:first-child) {
  margin-top: 0;
}

.pmd :deep(h1),
.pmd :deep(h2),
.pmd :deep(h3),
.pmd :deep(h4) {
  font-weight: 600;
  line-height: 1.35;
  margin: 1.4em 0 0.55em;
  letter-spacing: -0.02em;
}

.pmd :deep(h1) {
  font-size: 1.5em;
}

.pmd :deep(h2) {
  font-size: 1.26em;
  padding-bottom: 0.24em;
  border-bottom: 1rpx solid var(--line);
}

.pmd :deep(h3) {
  font-size: 1.1em;
}

.pmd :deep(p) {
  margin: 0 0 0.9em;
}

.pmd :deep(ul),
.pmd :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.3em;
}

.pmd :deep(blockquote) {
  margin: 1.1em 0;
  padding: 0.5em 0.9em;
  border-left: 6rpx solid var(--accent);
  background-color: var(--surface-2);
  color: var(--muted);
}

.pmd :deep(.md-table) {
  overflow-x: auto;
  margin: 1em 0;
}

.pmd :deep(th),
.pmd :deep(td) {
  border: 1rpx solid var(--line);
  padding: 10rpx 14rpx;
}

.pmd :deep(.md-code) {
  margin: 1em 0;
  background-color: var(--surface-2);
  border: 1rpx solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.pmd :deep(.md-code-head) {
  display: flex;
  justify-content: space-between;
  padding: 6rpx 18rpx;
  border-bottom: 1rpx solid var(--line);
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.pmd :deep(.md-code-copy) {
  display: none;
}

.pmd :deep(.md-code > pre) {
  margin: 0;
  padding: 18rpx 20rpx;
  overflow-x: auto;
}

.pmd :deep(pre code) {
  font-size: 26rpx;
  line-height: 1.65;
}

.pmd :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background-color: var(--surface-2);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
}

.pmd :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--r-md);
  margin: 1em 0;
}

.pmd :deep(.garden-wikilink) {
  color: var(--accent);
  background-color: var(--accent-soft);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
}

/* ---------------- 工具栏 ---------------- */
.toolbar {
  flex: 0 0 auto;
  width: 100%;
  /* 右缘渐隐：不提示的话用户不知道还有撤销/图片/AI 在后面 */
  -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 44rpx), transparent 100%);
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 44rpx), transparent 100%);
  background-color: var(--surface);
  border-top: 1rpx solid var(--line);
  padding: 8rpx 0 calc(env(safe-area-inset-bottom) + 8rpx);
  white-space: nowrap;
}

.tb-row {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  padding: 0 16rpx;
}

.tb {
  flex: 0 0 auto;
  min-width: 76rpx;
  height: 76rpx;
  padding: 0 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  border-radius: var(--r-sm);
  color: var(--text-2);
}

.tb:active {
  background-color: var(--bg-hover);
}

.tb-w {
  min-width: 68rpx;
}

.tb-t {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text);
}

.tb-t.is-bold {
  font-weight: 800;
}

.tb-t.is-italic {
  font-style: italic;
  font-family: Georgia, serif;
}

.tb-t.is-strike {
  text-decoration: line-through;
}

.tb-t.is-mark {
  background-color: var(--accent-soft);
  padding: 0 6rpx;
  border-radius: 4rpx;
}

.tb-sep {
  flex: 0 0 auto;
  width: 1rpx;
  height: 36rpx;
  margin: 0 8rpx;
  background-color: var(--line);
}

.tb-ai {
  color: var(--accent);
}

.tb-ai-t {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--accent);
}

.is-busy {
  opacity: 0.4;
}

/* ---------------- 浮动 AI 球 ---------------- */
.ai-fab {
  position: fixed;
  z-index: 92;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.18);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
  /* 拖动时不要让页面跟着滚 */
  touch-action: none;
}

.ai-fab.is-drag {
  transform: scale(1.06);
  box-shadow: 0 14rpx 36rpx rgba(0, 0, 0, 0.3);
  transition: none;
}

.ai-fab-img {
  display: block;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
}

/* 深色下两张图的浅色圆底会发亮，加一圈冷白描边让它们像「夜间模式的头像」 */
.theme-dark .ai-fab {
  box-shadow:
    0 0 0 2rpx rgba(255, 255, 255, 0.16),
    0 8rpx 24rpx rgba(0, 0, 0, 0.5);
}

/* ---------------- AI 面板 ---------------- */
.mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.42);
}

.ai-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 91;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  padding: 12rpx 0 calc(env(safe-area-inset-bottom) + 20rpx);
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  transform: translateY(110%);
  transition: transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.ai-sheet.is-open {
  transform: translateY(0);
}

.sheet-grip {
  width: 72rpx;
  height: 8rpx;
  border-radius: var(--r-full);
  background-color: var(--line-strong);
  margin: 0 auto 8rpx;
}

.sheet-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  padding: 16rpx var(--page-gutter) 12rpx;
}

.sheet-title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text);
}

.sheet-sub {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

.sheet-spacer {
  flex: 1 1 auto;
}

.sheet-x {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 1rpx solid var(--line);
  overflow: hidden;
}

.sheet-x-img {
  display: block;
  width: 64rpx;
  height: 64rpx;
}

.ai-body {
  flex: 1 1 auto;
  width: 100%;
  max-height: 56vh;
  box-sizing: border-box;
  padding: 0 var(--page-gutter);
}

.ai-group {
  display: block;
  margin: 16rpx 0 12rpx;
  font-size: var(--fs-2xs);
  color: var(--faint);
  letter-spacing: 0.4rpx;
}

.ai-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.ai-act {
  height: 68rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  font-size: var(--fs-sm);
  color: var(--text);
}

.ai-act:active {
  background-color: var(--bg-hover);
}

.ai-tip {
  display: block;
  margin-top: 24rpx;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--faint);
}

.ai-tail {
  height: 24rpx;
}

.ai-loading {
  padding: 60rpx var(--page-gutter) 80rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.ai-loading-t {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text);
}

.ai-loading-s {
  font-size: var(--fs-2xs);
  color: var(--faint);
}

/* uni 的 scroll-view 自带 width:100%，再叠 margin / padding 就会撑出屏幕
   （实测 415 > 390，文字右侧被裁）。所以外框只管内缩，灰底交给内层块。 */
.ai-result {
  flex: 1 1 auto;
  width: 100%;
  max-height: 48vh;
  box-sizing: border-box;
  padding: 0 var(--page-gutter);
}

.ai-result-box {
  padding: 20rpx 24rpx;
  background-color: var(--surface-2);
  border-radius: var(--r-sm);
}

.ai-result-t {
  /* uni 的 text 默认 display:inline，配合 pre-wrap 时长行不会在容器内换行，
     会直接横着溢出被裁掉（截图里右侧每行都缺字）。必须显式 block。 */
  display: block;
  width: 100%;
  box-sizing: border-box;
  font-size: var(--fs-sm);
  line-height: 1.75;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ai-actions {
  display: flex;
  gap: 16rpx;
  padding: 20rpx var(--page-gutter) 0;
}

.flex1 {
  flex: 1 1 0;
}

.ai-sub-actions {
  display: flex;
  justify-content: center;
  padding-top: 16rpx;
}

.ai-sub {
  font-size: var(--fs-2xs);
  color: var(--accent);
}

/* ---------------- 提示态 ---------------- */
.hint {
  flex: 1 1 auto;
  padding: 120rpx var(--page-gutter);
  font-size: var(--fs-sm);
  text-align: center;
}
</style>

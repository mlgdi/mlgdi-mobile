<template>
  <view :class="['page', 'editor-page', `theme-${resolvedTheme}`]">
    <!-- 顶栏只显示「编辑 / 预览」：标题已经挪进编辑区，
         两处都显示会让「我正在改哪一篇」这件事出现两个来源 -->
    <GTopBar
      back
      :title="preview ? '预览' : '编辑'"
      :sub="version ? `v${version}` : ''"
      :elevated="true"
      @back="back"
    >
      <template #actions>
        <view class="icon-btn preview-btn" @click="togglePreview">
          <GIcon :name="preview ? 'pencil' : 'eye'" :size="38" />
        </view>
        <view :class="['icon-btn', 'save-btn', saving ? 'is-busy' : '']" @click="saveAll()">
          <GIcon name="check" :size="40" :weight="2.4" />
        </view>
      </template>
    </GTopBar>

    <!-- 属性行：chips 横滚（手机竖屏放不下五个 chip + 发布），发布固定在右端 -->
    <view class="meta">
      <scroll-view class="meta-scroll" scroll-x :show-scrollbar="false">
        <view class="meta-inner">
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

          <view :class="['meta-chip', 'meta-btn', coverImage ? 'is-on' : '']" @click="openCover">
            <GIcon name="cover" :size="26" />
            <text class="meta-btn-t">封面</text>
          </view>
          <view :class="['meta-chip', 'meta-btn', tags.length ? 'is-on' : '']" @click="openTags">
            <GIcon name="tag" :size="26" />
            <text class="meta-btn-t">{{ tags.length ? `标签 ${tags.length}` : '标签' }}</text>
          </view>

        </view>
      </scroll-view>
      <text v-if="dirtyAll" class="meta-dirty">未保存</text>
      <view v-if="status !== 'published'" class="meta-pub" @click="publish">发布</view>
    </view>

    <!-- 工具栏：两行。
         行 1 固定（高频：撤销、标题级别、行内强调），行 2 横滚（插入类 + AI）。
         放顶部而不是底部：标题已经占了编辑区第一行，工具栏贴着属性行才读得顺；
         底部留给键盘，避免输入时工具条被键盘顶起又落下。 -->
    <view v-if="!preview" class="tools">
      <view class="tools-row tools-fixed">
        <view class="tb" @click="undo"><GIcon name="undo" :size="30" /></view>
        <view class="tb" @click="redo"><GIcon name="redo" :size="30" /></view>
        <view class="tb-sep" />
        <view class="tb tb-w" @click="toggleHeading(1)"><text class="tb-t">H1</text></view>
        <view class="tb tb-w" @click="toggleHeading(2)"><text class="tb-t">H2</text></view>
        <view class="tb tb-w" @click="toggleHeading(3)"><text class="tb-t">H3</text></view>
        <view class="tb-sep" />
        <view class="tb tb-w" @click="surround('**', '粗体')"><text class="tb-t is-bold">B</text></view>
        <view class="tb tb-w" @click="surround('*', '斜体')"><text class="tb-t is-italic">I</text></view>
        <view class="tb tb-w" @click="surround('~~', '删除线')"><text class="tb-t is-strike">S</text></view>
        <view class="tb tb-w" @click="surround('==', '高亮')"><text class="tb-t is-mark">H</text></view>
        <view class="tb" @click="surround('`', 'code')"><GIcon name="code" :size="28" /></view>
      </view>

      <scroll-view class="tools-scroll" scroll-x :show-scrollbar="false">
        <view class="tools-row">
          <view class="tb tb-w" @click="toggleLine('- ', ['- ', '* ', '+ ', '- [ ] '])">
            <text class="tb-t">•</text>
          </view>
          <view class="tb tb-w" @click="toggleLine('1. ', ['1. ', '2. ', '3. '])">
            <text class="tb-t">1.</text>
          </view>
          <view class="tb tb-w" @click="toggleLine('- [ ] ', ['- [ ] ', '- [x] '])">
            <text class="tb-t">☑</text>
          </view>
          <view class="tb tb-w" @click="toggleLine('> ', ['> '])"><text class="tb-t">❝</text></view>

          <view class="tb-sep" />

          <view class="tb" @click="insertLink"><GIcon name="link" :size="28" /></view>
          <view class="tb" @click="pickImage"><GIcon name="image" :size="28" /></view>
          <view class="tb" @click="pickVideo"><GIcon name="video" :size="28" /></view>
          <view class="tb" @click="insertTable"><GIcon name="table" :size="28" /></view>
          <view class="tb tb-w" @click="insertCodeBlock"><text class="tb-t tb-mono">{ }</text></view>
          <view class="tb" @click="insertBlock('---')"><GIcon name="hr" :size="28" /></view>
          <view class="tb" @click="insertDate"><GIcon name="clock" :size="28" /></view>
          <view class="tb" @click="emojiOpen = true"><GIcon name="smile" :size="28" /></view>

          <view class="tb-sep" />

          <view class="tb tb-ai" @click="openAi">
            <GIcon name="sparkle" :size="30" />
            <text class="tb-t tb-ai-t">AI</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <view v-if="loading" class="hint">
      <text class="muted">加载中…</text>
    </view>

    <!-- 编辑区：标题 + 正文在同一张「纸」里。
         技术上仍是两个输入元素——textarea 无法在一段文本里混排两种字号；
         但同一个背景、同一个左右边距、标题无边框，视觉上是一整块。 -->
    <view v-else-if="!preview" class="paper">
      <input
        v-model="title"
        class="paper-title"
        placeholder="标题"
        placeholder-class="ph"
        :maxlength="200"
        :adjust-position="false"
      />
      <textarea
        v-model="body"
        class="paper-body"
        placeholder="正文（Markdown）。front-matter 归 Obsidian，这里只改正文。"
        placeholder-class="ph"
        :maxlength="-1"
        :show-confirm-bar="false"
        :adjust-position="false"
        :cursor-spacing="24"
        @input="onInput"
        @focus="onCaret"
        @blur="onCaret"
      />
    </view>

    <!-- 预览：与阅读页同一套语义，但只求「看得懂结构」，不追像素一致 -->
    <scroll-view v-else class="preview" scroll-y>
      <view class="pmd">
        <text v-if="title" class="pmd-title">{{ title }}</text>
        <view class="pmd-inner" v-html="previewHtml"></view>
      </view>
      <view class="preview-tail" />
    </scroll-view>

    <!-- 浮动 AI 球：可拖动，位置记在本地。面板打开时收起，
         由面板头部那个同样的头像承担「关闭」——右下角在面板覆盖范围内，
         留着也点不到，不如把关闭放在看得见的地方。 -->
    <view
      v-if="!loading && !anySheetOpen"
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

      <!-- 标题候选：点一条直接替换，不需要「应用到」这一步 -->
      <template v-else-if="aiMeta === 'title' && titleCands.length">
        <scroll-view class="ai-result" scroll-y>
          <view class="tt-list">
            <view
              v-for="t in titleCands"
              :key="t"
              :class="['tt-item', t === title ? 'is-cur' : '']"
              @click="pickTitle(t)"
            >
              <text class="tt-text">{{ t }}</text>
              <text v-if="t === title" class="tt-tag">当前</text>
            </view>
          </view>
        </scroll-view>
        <view class="ai-sub-actions">
          <text class="ai-sub" @click="runMeta('title')">换一批</text>
          <text class="ai-sub" @click="closeAi">关闭</text>
        </view>
      </template>

      <!-- 标签：先看再决定加不加 -->
      <template v-else-if="aiMeta === 'tags' && aiTagCands.length">
        <scroll-view class="ai-result" scroll-y>
          <view class="tt-list">
            <view class="tag-list">
              <view v-for="t in aiTagCands" :key="t" class="tag-chip">
                <text class="tag-t">{{ t }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="ai-actions">
          <view class="btn btn-ghost flex1" @click="closeAi">放弃</view>
          <view class="btn flex1" @click="applyMetaTags">加入标签</view>
        </view>
      </template>

      <!-- 正文类：替换 or 复制 -->
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

        <!-- 元数据类：结果不是正文，不能「替换正文」，所以单独一组 -->
        <text class="ai-group">标题与标签</text>
        <view class="ai-acts">
          <view class="ai-act" @click="runMeta('title')">AI 标题</view>
          <view class="ai-act" @click="runMeta('tags')">AI 标签</view>
        </view>

        <text class="ai-tip">
          移动端拿不到长按选区，所以上面的动作都作用全文；结果可整体替换或先复制。
        </text>
        <view class="ai-tail" />
      </scroll-view>
    </view>

    <!-- ==================== 封面 ==================== -->
    <view v-if="coverOpen" class="mask" @click="coverOpen = false" />
    <view :class="['ai-sheet', { 'is-open': coverOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">封面</text>
        <text class="sheet-sub">列表卡片的缩略图</text>
        <view class="sheet-spacer" />
        <view class="sheet-close" @click="coverOpen = false">完成</view>
      </view>

      <view class="cov-body">
        <view v-if="coverImage" class="cov-preview">
          <image class="cov-img" :src="assetUrl(coverImage)" mode="aspectFill" />
          <view class="cov-badge">{{ coverIsVideo ? '视频帧' : '当前封面' }}</view>
        </view>
        <view v-else class="cov-empty">
          <GIcon name="cover" :size="56" />
          <text class="cov-empty-t">还没有封面</text>
          <text class="cov-empty-s">上传一张，或从正文里的图片挑一张</text>
        </view>

        <view class="cov-acts">
          <view class="btn btn-ghost cov-btn" @click="pickCover">
            <GIcon name="image" :size="28" />
            <text class="cov-btn-t">上传封面</text>
          </view>
          <view v-if="bodyImages.length" class="btn btn-ghost cov-btn" @click="coverPick = true">
            <GIcon name="cover" :size="28" />
            <text class="cov-btn-t">从正文选（{{ bodyImages.length }}）</text>
          </view>
        </view>

        <!-- 从正文里挑：直接复用已上传的资产，不重复占空间 -->
        <scroll-view v-if="coverPick && bodyImages.length" class="cov-strip" scroll-x :show-scrollbar="false">
          <view class="cov-strip-inner">
            <view
              v-for="img in bodyImages"
              :key="img"
              class="cov-thumb"
              @click="useCover(img)"
            >
              <image class="cov-thumb-img" :src="assetUrl(img)" mode="aspectFill" />
            </view>
          </view>
        </scroll-view>

        <view v-if="coverImage" class="cov-remove" @click="clearCover">
          <GIcon name="trash" :size="26" />
          <text class="cov-btn-t">移除封面</text>
        </view>
        <text class="cov-note">
          写入 front-matter 的 cover_image。移除后列表卡片会回落到纯文字卡。
        </text>
      </view>
    </view>

    <!-- ==================== 标签 ==================== -->
    <view v-if="tagsOpen" class="mask" @click="tagsOpen = false" />
    <view :class="['ai-sheet', { 'is-open': tagsOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">标签</text>
        <text class="sheet-sub">{{ tags.length }} 个</text>
        <view class="sheet-spacer" />
        <view class="sheet-close" @click="tagsOpen = false">完成</view>
      </view>

      <view class="tag-body">
        <!-- AI 标签：与 Web 阅读页「AI 标签」同一个 action（tags） -->
        <view :class="['ai-gen', tagAiRunning ? 'is-busy' : '']" @click="genTags">
          <GIcon name="sparkle" :size="28" />
          <text class="ai-gen-t">{{ tagAiRunning ? '正在生成…' : '让 AI 生成标签' }}</text>
        </view>

        <view v-if="tags.length" class="tag-list">
          <view v-for="(t, i) in tags" :key="t + i" class="tag-chip">
            <text class="tag-t">{{ t }}</text>
            <view class="tag-x" @click="removeTag(i)"><GIcon name="close" :size="22" :weight="2.6" /></view>
          </view>
        </view>
        <text v-else class="tag-empty">还没有标签</text>

        <view class="tag-add">
          <input
            v-model="tagInput"
            class="tag-input"
            placeholder="输入标签后回车"
            placeholder-class="ph"
            :maxlength="30"
            confirm-type="done"
            @confirm="addTag"
          />
          <view :class="['tag-add-btn', tagInput.trim() ? '' : 'is-off']" @click="addTag">添加</view>
        </view>

      </view>
    </view>


    <!-- ==================== 表情 ==================== -->
    <view v-if="emojiOpen" class="mask" @click="emojiOpen = false" />
    <view :class="['ai-sheet', { 'is-open': emojiOpen }]">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <text class="sheet-title">插入符号</text>
        <text class="sheet-sub">常用表情与排版符号</text>
      </view>
      <scroll-view class="emoji-body" scroll-y>
        <view class="emoji-grid">
          <view v-for="e in EMOJIS" :key="e" class="emoji" @click="insertEmoji(e)">{{ e }}</view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onBackPress, onLoad } from '@dcloudio/uni-app'
import {
  doc as apiDoc,
  patchMeta,
  publishDoc,
  updateBody,
  type DocDetail,
  type MetaPatchPayload,
} from '../../shared/api/notes'
import { aiActions, aiAssist, type AiAction } from '../../shared/api/ai'
import { ApiError } from '../../shared/api/client'
import { readSession } from '../../shared/auth/session'
import { getBaseUrl } from '../../shared/config/server'
import { renderMarkdown } from '../../shared/utils/markdown'
import { resolvedTheme } from '../../shared/theme'
import { assetUrl } from '../../shared/utils/asset'

const docId = ref('')
const title = ref('')
/** 打开时的标题，用来判断标题有没有改过（不改就不发 title 字段） */
const titleOriginal = ref('')
const body = ref('')
const original = ref('')
const version = ref(0)
const status = ref<'draft' | 'reviewed' | 'published'>('draft')
const visibility = ref<'private' | 'member' | 'public'>('public')
const loading = ref(true)
const saving = ref(false)
const preview = ref(false)
/** 最近一次保存失败的原因，返回时用它把话说清（否则只剩一句「没能保存」） */
const saveError = ref('')

/** 打开时的属性快照，用来判断元数据有没有改过 */
const initStatus = ref<string>('draft')
const initVisibility = ref<string>('public')

/* ---------------- 封面 ---------------- */
const coverImage = ref('')
const initCover = ref('')
const coverOpen = ref(false)
/** 是否展开「从正文挑」的缩略图条 */
const coverPick = ref(false)

/* ---------------- 标签 ---------------- */
const tags = ref<string[]>([])
const initTagsKey = ref('')
const tagsOpen = ref(false)
const tagInput = ref('')

/* ---------------- AI 标题 / AI 标签 ----------------
   Web 端这两个能力在阅读页的文档菜单里（`DocView` 的「AI 标题 / AI 标签」），
   action key 都是后端 `workflows_def.py` 里的 system scope（title / tags）。

   入口**不挂在标题旁边**：标题行右侧多一颗 ✨，等于给「改标题」凭空加了个悬浮控件，
   和正文的主体性打架。统一收进 AI 助手（浮动球）的第三组——要用 AI 就点 AI。 */
/** 本轮 AI 动作属于哪一类，决定结果区怎么渲染 */
const aiMeta = ref<'' | 'title' | 'tags'>('')
const titleCands = ref<string[]>([])
const aiTagCands = ref<string[]>([])
/** 标签面板里的「让 AI 生成标签」自己的 loading，与 AI 助手互不干扰 */
const tagAiRunning = ref(false)

/* ---------------- 符号面板 ---------------- */
const emojiOpen = ref(false)

/** 任何一个底部面板打开时都要收起浮动球——它 z-index 更高，会压住面板上的按钮 */
const anySheetOpen = computed(
  () =>
    aiOpen.value ||
    coverOpen.value ||
    tagsOpen.value ||
    emojiOpen.value,
)

/** 常用表情与排版符号。手机上打不出这些，只能点。 */
const EMOJIS = [
  '😀', '😅', '🙂', '😍', '🤔', '😐', '😴', '😮', '😭', '😡',
  '👍', '👎', '👌', '🙏', '👏', '💪', '✨', '🔥', '💡', '⭐',
  '❤️', '💔', '✅', '❌', '⚠️', '❓', '❗', '📌', '📎', '🔗',
  '→', '←', '↑', '↓', '·', '—', '…', '§', '¶', '†',
  '≤', '≥', '≠', '≈', '×', '÷', '±', '∞', '√', '∑',
]

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
/** 正文有没有改（尾随空白不算：textarea 在部分机型上会补一个尾换行） */
const dirty = computed(() => body.value.replace(/\s+$/, '') !== original.value.replace(/\s+$/, ''))

const tagsKey = computed(() => tags.value.join('\u0001'))

/** 元数据有没有改：标题 / 状态 / 可见性 / 封面 / 标签 */
const metaDirty = computed(
  () =>
    title.value.trim() !== titleOriginal.value ||
    status.value !== initStatus.value ||
    visibility.value !== initVisibility.value ||
    coverImage.value !== initCover.value ||
    tagsKey.value !== initTagsKey.value,
)

/** 任何一个角落有改动 */
const dirtyAll = computed(() => dirty.value || metaDirty.value)

const previewHtml = computed(() => (preview.value ? renderMarkdown(body.value).html : ''))

/**
 * 把资产地址归一成 vault 相对路径。
 *
 * 正文里的图片地址有两种历史写法：早期插的是资产端点
 * `/api/v1/assets?path=Assets%2Fx.png`，现在插的是 `Assets/x.png`。
 * 「从正文挑封面」两种都得认。
 */
function normalizeAssetRef(raw: string): string {
  const v = (raw || '').trim()
  if (!v) return ''
  const m = v.match(/\/api\/v1\/assets\?path=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      return m[1]
    }
  }
  return v
}

/* ============================ 载入与保存 ============================ */

/**
 * 退出编辑页。
 *
 * `navigateBack` 在页面栈只有一层时会**静默失败**（直接打开链接、刷新、
 * 或从外部跳进来都属于这种），用户会看到「点了返回没反应」。
 * 所以必须判栈，兜底 reLaunch 回库列表。
 */
function leave(): void {
  const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (stack.length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/library/index' })
  }
}

/**
 * 返回：有改动就先静默保存，存成功直接走——**不弹窗打断**。
 *
 * 原来的做法是「有改动就弹确认框」，但移动端用户点了返回就是想走，
 * 一个「放弃 / 继续编辑」的二选一既容易误触，又让每次返回都变成一次决策。
 * 存不下（冲突 / 断网）才弹窗，此时用户确实需要知道「东西没保住」。
 */
async function back(): Promise<void> {
  if (saving.value) return
  if (!dirtyAll.value) {
    leave()
    return
  }
  const ok = await saveAll({ silent: true })
  if (ok) {
    leave()
    return
  }
  uni.showModal({
    title: '没能保存',
    // 把具体原因说出来：只写「没能保存」，用户不知道该改哪
    content: `${saveError.value || '改动还没写进 vault'}。要放弃这些改动退出吗？`,
    confirmText: '放弃退出',
    cancelText: '继续编辑',
    success: (res) => {
      if (res.confirm) leave()
    },
  })
}

/** 安卓物理返回键 / 手势返回：走和顶栏箭头同一条路径 */
onBackPress(() => {
  if (saving.value) return true
  if (!dirtyAll.value) return false
  void back()
  return true
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const detail: DocDetail = await apiDoc(docId.value)
    title.value = detail.title || ''
    titleOriginal.value = detail.title || ''
    body.value = detail.body || ''
    original.value = detail.body || ''
    version.value = detail.version
    status.value = (detail.status as typeof status.value) || 'draft'
    visibility.value = (detail.visibility as typeof visibility.value) || 'public'
    initStatus.value = status.value
    initVisibility.value = visibility.value

    // 封面与标签也进快照：不然一进页面就显示「未保存」。
    // tags 不在响应顶层，只在 frontmatter 里（后端把整份 front-matter 一起返回），
    // 所以要往下钻一层——踩过一次「标签永远为空」。
    coverImage.value = (detail.cover_image || '').trim()
    initCover.value = coverImage.value
    const fm = (detail.frontmatter || {}) as Record<string, unknown>
    const fmTags = fm.tags
    tags.value = Array.isArray(fmTags)
      ? fmTags.map((t) => String(t)).filter(Boolean)
      : typeof fmTags === 'string' && fmTags.trim()
        ? fmTags.split(/[,，\s]+/).filter(Boolean)
        : []
    initTagsKey.value = tags.value.join('\u0001')
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

/**
 * 一个按钮存完所有东西：用户不该为了改个可见性再找第二个按钮。
 *
 * 返回 boolean 而不是 void：返回路径要据此判断「存住了没有」，
 * 存住了才静默退出，存不住才打断用户。
 *
 * `silent` 用于返回时的自动保存——不该为一个后台动作弹 toast。
 */
async function saveAll(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!dirtyAll.value) {
    if (!opts.silent) uni.showToast({ title: '没有改动', icon: 'none' })
    return true
  }
  if (saving.value) return false

  // 标题是 front-matter 的指纹，空标题落盘后列表里就是一格空白
  const nextTitle = title.value.trim()
  if (!nextTitle) {
    saveError.value = '标题不能为空'
    if (!opts.silent) uni.showToast({ title: '标题不能为空', icon: 'none' })
    return false
  }

  saving.value = true
  try {
    if (dirty.value) {
      const res = await updateBody(docId.value, body.value, version.value)
      version.value = res.doc.version
      original.value = body.value
    }

    if (metaDirty.value) {
      // 只发真的变了的字段：后端按字段写 front-matter，
      // 把没改的也带上会无谓地重写文件、触发 Obsidian 重新加载
      const patch: MetaPatchPayload = { base_version: version.value }
      if (nextTitle !== titleOriginal.value) patch.title = nextTitle
      if (status.value !== initStatus.value) patch.status = status.value
      if (visibility.value !== initVisibility.value) patch.visibility = visibility.value
      if (coverImage.value !== initCover.value) patch.cover_image = coverImage.value
      if (tagsKey.value !== initTagsKey.value) patch.tags = [...tags.value]

      if (Object.keys(patch).length > 1) {
        const res = await patchMeta(docId.value, patch)
        version.value = res.doc.version
      }
      title.value = nextTitle
      titleOriginal.value = nextTitle
      initStatus.value = status.value
      initVisibility.value = visibility.value
      initCover.value = coverImage.value
      initTagsKey.value = tags.value.join('\u0001')
    }

    if (!opts.silent) uni.showToast({ title: '已保存', icon: 'none' })
    return true
  } catch (err: any) {
    saveError.value = err?.reason || '保存失败'
    if (!handleConflict(err)) uni.showToast({ title: saveError.value, icon: 'none' })
    return false
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
        // 先落正文（和标题）再切状态：顺序反了会把旧正文一起发出去
        if (dirty.value) {
          const r = await updateBody(docId.value, body.value, version.value)
          version.value = r.doc.version
          original.value = body.value
        }
        const nextTitle = title.value.trim()
        if (nextTitle && nextTitle !== titleOriginal.value) {
          const r = await patchMeta(docId.value, {
            title: nextTitle,
            base_version: version.value,
          })
          version.value = r.doc.version
          title.value = nextTitle
          titleOriginal.value = nextTitle
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
    const el = document.querySelector('.paper-body textarea, textarea') as HTMLTextAreaElement | null
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

/** 行内插入（不补空行）：日期、符号这类不该把段落切开 */
function insertText(text: string): void {
  const s = cursor.value
  applyEdit(body.value.slice(0, s) + text + body.value.slice(s), s + text.length)
}

function insertTable(): void {
  insertBlock('| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n|  |  |  |')
}

function insertCodeBlock(): void {
  insertBlock('```text\n\n```')
}

/* ---------------- 上传（图片 / 视频 / 封面共用） ---------------- */

/**
 * 上传本地文件到 Assets/，返回 `{ path, url }`。
 *
 * 两个 header 缺一不可：设备绑定的 token 少了 `X-Device-Key` 会 401
 * （Web 端只带 Authorization 也能过，所以这个坑只有在 App 上才暴露）。
 */
async function uploadAsset(localPath: string): Promise<{ path: string; url: string }> {
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
            if (r.statusCode >= 400) {
              reject(new Error(payload?.detail?.reason || payload?.detail?.message_key || '上传失败'))
            } else {
              resolve(payload)
            }
          } catch {
            reject(new Error('上传响应解析失败'))
          }
        },
        fail: () => reject(new Error('上传失败（网络）')),
      })
    })
    return { path: data.path || '', url: data.url || '' }
  } finally {
    // 必须先关 loading 再 toast：uni 的 loading 与 toast 是同一个组件，
    // 顺序反了 toast 会被 hideLoading 立刻抹掉（老代码踩过）
    uni.hideLoading()
  }
}

/** 插入用的地址：优先 vault 相对路径（两端都能自己拼资产端点），没有才退回完整 url */
function assetRefOf(data: { path: string; url: string }): string {
  return data.path || data.url
}

/**
 * 图片：选图 → 上传 → 插入 markdown。
 * 存相对路径而不是资产端点 url：url 带域名和查询串，换域名后整篇图全废。
 */
function pickImage(): void {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const localPath = (res.tempFilePaths || [])[0]
      if (!localPath) return
      try {
        const data = await uploadAsset(localPath)
        insertBlock(`![](${assetRefOf(data)})`)
        uni.showToast({ title: '图片已插入', icon: 'none' })
      } catch (err: any) {
        uni.showToast({ title: err?.message || '上传失败', icon: 'none' })
      }
    },
  })
}

/**
 * 视频：相册或相机 → 上传 → 插入 `![](Assets/x.mp4)`。
 *
 * Markdown 没有视频语法，所以两端靠同一份约定：`![]()` 的地址是视频扩展名时
 * 渲染成 `<video controls>`（Web 的 image 规则与移动端 markdown.ts 都已对齐）。
 */
function pickVideo(): void {
  uni.chooseVideo({
    sourceType: ['album', 'camera'],
    compressed: true,
    maxDuration: 180,
    success: async (res: any) => {
      const localPath = res?.tempFilePath
      if (!localPath) return
      try {
        const data = await uploadAsset(localPath)
        insertBlock(`![](${assetRefOf(data)})`)
        uni.showToast({ title: '视频已插入', icon: 'none' })
      } catch (err: any) {
        uni.showToast({ title: err?.message || '上传失败', icon: 'none' })
      }
    },
  })
}

/* ---------------- 小插入 ---------------- */

function insertDate(): void {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  insertText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
}

function insertEmoji(e: string): void {
  insertText(e)
  emojiOpen.value = false
}

/* ---------------- 封面 ---------------- */

/** 正文里出现过的图片（视频不算），用来「从正文挑封面」 */
const bodyImages = computed<string[]>(() => {
  const out: string[] = []
  const push = (raw: string): void => {
    const v = normalizeAssetRef(raw)
    if (!v) return
    // 视频当封面渲染不出来，直接排除
    if (/\.(mp4|webm|m4v|mov|ogg)$/i.test(v)) return
    if (!out.includes(v)) out.push(v)
  }

  const inline = /!\[[^\]]*\]\(([^)\s]+)/g
  let m: RegExpExecArray | null
  while ((m = inline.exec(body.value))) push(m[1])

  const embed = /!\[\[([^\]]+)\]\]/g
  while ((m = embed.exec(body.value))) {
    const name = m[1].trim()
    push(/^Assets\//.test(name) ? name : `Assets/${name}`)
  }
  return out
})

function openCover(): void {
  coverPick.value = false
  coverOpen.value = true
}

function pickCover(): void {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const localPath = (res.tempFilePaths || [])[0]
      if (!localPath) return
      try {
        const data = await uploadAsset(localPath)
        if (!data.path) throw new Error('上传未返回路径')
        coverImage.value = data.path
        uni.showToast({ title: '封面已更新', icon: 'none' })
      } catch (err: any) {
        uni.showToast({ title: err?.message || '上传失败', icon: 'none' })
      }
    },
  })
}

function useCover(img: string): void {
  coverImage.value = img
  coverPick.value = false
  uni.showToast({ title: '已设为封面', icon: 'none' })
}

function clearCover(): void {
  coverImage.value = ''
}

const coverIsVideo = computed(() => /\.(mp4|webm|m4v|mov|ogg)$/i.test(coverImage.value))

/* ---------------- 标签 ---------------- */

function openTags(): void {
  tagsOpen.value = true
}

function addTag(): void {
  // 顺手剥掉用户习惯性输入的 #（Obsidian 里标签带 #，front-matter 里不带）
  const t = tagInput.value.trim().replace(/^#+/, '')
  if (!t) return
  if (!tags.value.includes(t)) tags.value = [...tags.value, t]
  tagInput.value = ''
}

function removeTag(i: number): void {
  tags.value = tags.value.filter((_, idx) => idx !== i)
}

/* ---------------- AI 标题 / AI 标签 ----------------

   两个 action 都在后端 `workflows_def.py` 的 system scope 里：
   - `title`：拟 5 个中文标题，一行一个
   - `tags` ：生成 3–5 个短标签，英文逗号分隔一行

   与 Web 的差别只在**结果怎么用**：Web 是把结果塞进剪贴板/弹窗让用户自己处理，
   移动端直接把标题换成选中的那条、把标签合并进列表——多一步复制粘贴没有意义。 */

/** AI 至少要有点素材：两个字的正文生成不出有信息量的标题 */
const AI_MIN_CHARS = 20

function aiSource(): string {
  // 正文优先；正文太短时把标题也带上，至少让模型知道这篇在讲什么
  const bodyText = (body.value || '').trim()
  if (bodyText.length >= AI_MIN_CHARS) return bodyText
  return [title.value.trim(), bodyText].filter(Boolean).join('\n\n')
}

/**
 * 清洗模型的标题输出。
 *
 * 即使 prompt 写了「不要编号、不要引号」，模型仍会时不时加 `1.` 或「」——
 * 直接当成标题会让用户拿到一个带序号的标题。所以按行切、去前缀、去包裹符号。
 */
function parseTitleCands(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:\d+\s*[.、)）]|[-*·•])\s*/, '')
        .replace(/^[「『"'“‘]+|[」』"'”’]+$/g, '')
        .replace(/^#+\s*/, '')
        .trim(),
    )
    .filter((line) => line.length >= 2 && line.length <= 60)
    .slice(0, 6)
}

/** 标签输出是一行逗号分隔；顺手剥掉 # 前缀和句号 */
function parseTagList(raw: string): string[] {
  return raw
    .split(/[,，、;；\s]+/)
    .map((t) => t.replace(/^#+/, '').replace(/[。.]$/, '').trim())
    .filter((t) => t.length >= 1 && t.length <= 12)
}

/**
 * 跑一个「元数据」类动作（title / tags）。
 *
 * 与 runAi 分开的原因：这两类的结果不是正文，按钮语义也不同——
 * 正文是「替换正文」，标题是「点一条就换」，标签是「加入标签」。
 */
async function runMeta(kind: 'title' | 'tags'): Promise<void> {
  if (aiLoading.value) return
  const source = aiSource()
  if (source.length < AI_MIN_CHARS) {
    uni.showToast({ title: '内容太短，AI 缺素材', icon: 'none' })
    return
  }
  aiMeta.value = kind
  aiRunningLabel.value = kind === 'title' ? 'AI 标题' : 'AI 标签'
  aiLoading.value = true
  aiResult.value = ''
  titleCands.value = []
  aiTagCands.value = []
  try {
    const r = await aiAssist(kind, source)
    const text = r.result || ''
    aiResult.value = text
    if (kind === 'title') {
      titleCands.value = parseTitleCands(text)
      if (!titleCands.value.length) uni.showToast({ title: '没有解析出标题', icon: 'none' })
    } else {
      aiTagCands.value = parseTagList(text)
      if (!aiTagCands.value.length) uni.showToast({ title: '没有生成有效标签', icon: 'none' })
    }
  } catch (err: any) {
    uni.showToast({ title: err?.reason || err?.message || '生成失败', icon: 'none' })
    aiMeta.value = ''
    aiResult.value = ''
  } finally {
    aiLoading.value = false
  }
}

/** 点候选 = 立刻替换标题，并收起面板（不需要再点一次「应用」） */
function pickTitle(t: string): void {
  title.value = t
  aiOpen.value = false
  aiMeta.value = ''
  titleCands.value = []
  uni.showToast({ title: '标题已替换', icon: 'none' })
}

/** 把 AI 生成的标签合并进现有（去重，不覆盖手写的） */
function applyMetaTags(): void {
  const before = tags.value.length
  tags.value = [...new Set([...tags.value, ...aiTagCands.value])]
  const added = tags.value.length - before
  aiOpen.value = false
  aiMeta.value = ''
  aiTagCands.value = []
  uni.showToast({ title: added ? `新增 ${added} 个标签` : '这些标签已经有了', icon: 'none' })
}

async function genTags(): Promise<void> {
  if (tagAiRunning.value) return
  const source = aiSource()
  if (source.length < AI_MIN_CHARS) {
    uni.showToast({ title: '内容太短，AI 缺素材', icon: 'none' })
    return
  }
  tagAiRunning.value = true
  try {
    const r = await aiAssist('tags', source)
    const list = parseTagList(r.result || '')
    if (!list.length) {
      uni.showToast({ title: '没有生成有效标签', icon: 'none' })
      return
    }
    const before = tags.value.length
    // 合并而不是覆盖：用户手写的标签不该被 AI 冲掉
    tags.value = [...new Set([...tags.value, ...list])]
    const added = tags.value.length - before
    uni.showToast({
      title: added ? `新增 ${added} 个标签` : '这些标签已经有了',
      icon: 'none',
    })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || err?.message || '生成失败', icon: 'none' })
  } finally {
    tagAiRunning.value = false
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

const aiScopeText = computed(() => {
  if (aiLoading.value) return '正在处理'
  if (aiMeta.value === 'title') return `${titleCands.value.length} 个候选 · 点一条替换`
  if (aiMeta.value === 'tags') return `${aiTagCands.value.length} 个标签`
  if (aiResult.value) return '结果可替换或复制'
  return '动作来自 .garden/workflows.yaml'
})

async function openAi(): Promise<void> {
  aiOpen.value = true
  aiResult.value = ''
  aiMeta.value = ''
  titleCands.value = []
  aiTagCands.value = []
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
  aiMeta.value = ''
  titleCands.value = []
  aiTagCands.value = []
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
  padding: 8rpx var(--page-gutter) 10rpx;
  flex: 0 0 auto;
}

/* scroll-view 自带 width:100%，在 flex 行里必须显式 width:0 才肯收缩，
   否则它会把右侧「发布」顶出屏幕（同类坑在 AI 结果区踩过） */
.meta-scroll {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  white-space: nowrap;
}

.meta-inner {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
}

.meta-btn {
  gap: 6rpx;
}

.meta-btn-t {
  font-size: var(--fs-2xs);
}

.meta-btn.is-on {
  background-color: var(--accent-soft);
  color: var(--accent);
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

/* ---------------- 编辑区（标题 + 正文 = 一张纸） ----------------
   两个输入元素、同一块背景、同一个左右边距、都没有边框：
   textarea 无法在一段文本里混排两种字号，所以标题只能单独一个 input，
   但视觉上它和正文是一整块，而不是「顶栏之外还有一个标题框」。 */
.paper {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10rpx var(--page-gutter) 0;
  background-color: var(--bg);
}

.paper-title {
  flex: 0 0 auto;
  width: 100%;
  min-height: 96rpx;
  padding: 14rpx 0 16rpx;
  box-sizing: border-box;
  background-color: transparent;
  font-size: 46rpx;
  font-weight: 700;
  line-height: 1.32;
  letter-spacing: -0.8rpx;
  color: var(--text);
}

.paper-body {
  flex: 1 1 auto;
  width: 100%;
  /* flex 子项要能收缩，必须给个确定高度；min-height 兜住小屏键盘弹起 */
  height: 0;
  min-height: 220rpx;
  padding: 6rpx 0 0;
  box-sizing: border-box;
  background-color: transparent;
  color: var(--text);
  font-size: 32rpx;
  line-height: 1.76;
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

/* 预览里的标题：编辑时它就是第一行，预览没有理由藏起来 */
.pmd-title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.6rpx;
  margin: 4rpx 0 22rpx;
  color: var(--text);
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

/* ---------------- 工具栏（顶部两行） ----------------
   行 1 固定均分：撤销 / 标题级别 / 行内强调 —— 这几个是写作时手最常伸的地方，
   不该让用户为了点一个 H2 先横滑半屏。
   行 2 横滚：插入类 + AI —— 低频但要全，挤在一行里必然要滚。 */
.tools {
  flex: 0 0 auto;
  width: 100%;
  padding: 2rpx 0 6rpx;
  background-color: var(--surface);
  border-bottom: 1rpx solid var(--line);
}

.tools-row {
  display: inline-flex;
  align-items: center;
  gap: 2rpx;
  padding: 0 12rpx;
}

/* 行 1 用 flex 均分，12 个格子刚好铺满 750rpx，一步不用滑 */
.tools-fixed {
  display: flex;
  width: 100%;
  box-sizing: border-box;
}

.tools-fixed .tb {
  flex: 1 1 0;
  min-width: 0;
  padding: 0;
}

.tools-scroll {
  width: 100%;
  white-space: nowrap;
  /* 右缘渐隐：不提示的话用户不知道后面还有图片/视频/表格 */
  -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 40rpx), transparent 100%);
  mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 40rpx), transparent 100%);
}

.tb {
  flex: 0 0 auto;
  min-width: 68rpx;
  height: 68rpx;
  padding: 0 8rpx;
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
  min-width: 60rpx;
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
  /* 荧光笔划下半部分，而不是整块蓝底——色块 pill 会被读成「选中态」 */
  background: linear-gradient(transparent 58%, var(--accent-soft) 58%);
  padding: 0 4rpx;
}

.tb-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 26rpx;
}

.tb-sep {
  flex: 0 0 auto;
  width: 1rpx;
  height: 30rpx;
  margin: 0 4rpx;
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
  /* 抽屉统一用无回弹曲线：overshoot 会让元素瞬时高过视口 */
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
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

/* 纯文字关闭：封面/标签面板用「完成」比放一个叉更符合语义 */
.sheet-close {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--accent);
  padding: 8rpx 0 8rpx 16rpx;
}

/* ---------------- 封面面板 ---------------- */
.cov-body {
  padding: 8rpx var(--page-gutter) 0;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.cov-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-md);
  overflow: hidden;
  background-color: var(--surface-2);
}

.cov-img {
  display: block;
  width: 100%;
  height: 100%;
}

.cov-badge {
  position: absolute;
  left: 16rpx;
  bottom: 16rpx;
  padding: 4rpx 16rpx;
  border-radius: var(--r-full);
  background-color: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--fs-2xs);
}

.cov-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 240rpx;
  border-radius: var(--r-md);
  border: 1rpx dashed var(--line-strong);
  color: var(--faint);
}

.cov-empty-t {
  font-size: var(--fs-sm);
  color: var(--text-2);
}

.cov-empty-s {
  font-size: var(--fs-2xs);
}

.cov-acts {
  display: flex;
  gap: 12rpx;
}

.cov-btn {
  flex: 1 1 0;
  height: 84rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: var(--r-sm);
}

.cov-btn-t {
  font-size: var(--fs-sm);
}

.cov-strip {
  width: 100%;
  white-space: nowrap;
}

.cov-strip-inner {
  display: inline-flex;
  gap: 12rpx;
}

.cov-thumb {
  width: 150rpx;
  height: 100rpx;
  border-radius: var(--r-sm);
  overflow: hidden;
  background-color: var(--surface-2);
  border: 2rpx solid transparent;
}

.cov-thumb-img {
  display: block;
  width: 100%;
  height: 100%;
}

.cov-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 72rpx;
  color: var(--danger);
}

.cov-note {
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--faint);
  padding-bottom: calc(env(safe-area-inset-bottom) + 8rpx);
}

/* ---------------- 标签面板 ---------------- */
.tag-body {
  padding: 8rpx var(--page-gutter) calc(env(safe-area-inset-bottom) + 20rpx);
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 60rpx;
  padding: 0 6rpx 0 20rpx;
  border-radius: var(--r-full);
  background-color: var(--accent-soft);
  color: var(--accent);
}

.tag-t {
  font-size: var(--fs-sm);
  font-weight: 500;
}

.tag-x {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tag-empty {
  font-size: var(--fs-sm);
  color: var(--faint);
}

.tag-add {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tag-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 80rpx;
  padding: 0 22rpx;
  box-sizing: border-box;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-sm);
}

.tag-add-btn {
  flex: 0 0 auto;
  height: 80rpx;
  padding: 0 28rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-sm);
  background-color: var(--accent);
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: 600;
}

/* 禁用态不用 opacity：白字压在半透明蓝上会看不见 */
.tag-add-btn.is-off {
  background-color: var(--surface-2);
  color: var(--faint);
}

/* AI 生成按钮（标签面板顶部） */
.ai-gen {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 80rpx;
  border-radius: var(--r-sm);
  background-color: var(--accent-soft);
  color: var(--accent);
}

.ai-gen-t {
  font-size: var(--fs-sm);
  font-weight: 600;
}

.ai-gen.is-busy {
  opacity: 0.55;
}

/* ---------------- AI 标题候选（AI 助手第三组的结果区） ---------------- */
.tt-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 4rpx 0 8rpx;
}

/* 候选：整行可点，标题允许两行——截断看不清就不叫候选了 */
.tt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 22rpx 24rpx;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
}

.tt-item:active {
  background-color: var(--bg-hover);
}

.tt-item.is-cur {
  background-color: var(--accent-soft);
}

.tt-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-base);
  line-height: 1.5;
  color: var(--text);
}

.tt-tag {
  flex: 0 0 auto;
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: var(--accent);
}

/* ---------------- 符号面板 ---------------- */
.emoji-body {
  width: 100%;
  max-height: 52vh;
  box-sizing: border-box;
  padding: 0 var(--page-gutter);
}

.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  padding-bottom: calc(env(safe-area-inset-bottom) + 20rpx);
}

.emoji {
  width: 84rpx;
  height: 84rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42rpx;
  line-height: 1;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
}

.emoji:active {
  background-color: var(--bg-hover);
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
  /* 两个次要操作（换一批 / 关闭）要能分开点，挤在一起会误触 */
  gap: 56rpx;
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

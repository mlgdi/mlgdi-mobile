<script setup lang="ts">
/**
 * 文档行（列表项）。库列表与首页「最近更新」共用，避免两处各写一遍样式。
 *
 * `showColumn` 为真时，元信息前缀显示所属栏目（带栏目色），用于跨栏目场景。
 */
import { computed } from 'vue'
import type { FlatDoc } from '../store/notes'
import { columnByPath, type Column } from '../config/columns'
import { assetUrl } from '../utils/asset'
import { useSiteStore } from '../store/site'
import { subLevels } from '../utils/scope'

const props = withDefaults(
  defineProps<{
    doc: FlatDoc
    showColumn?: boolean
    /** 已选中的子类名：元信息里不再重复显示这一层 */
    strip?: string
  }>(),
  { showColumn: false, strip: '' },
)

const emit = defineEmits<{ (e: 'open', doc: FlatDoc): void }>()

const col = computed<Column | undefined>(() => columnByPath(props.doc.path))

/**
 * 子目录相对路径。
 * 接口给的 folderLabel 以原始目录名开头（`02_Booklets`），且用 ` · ` 分层：
 * 先剥掉栏目根，再剥掉用户已选中的子类（否则在子类视图里每行都重复同一层）。
 */
const siteStore = useSiteStore()

/**
 * 小类层级（已换成显示名）。直接从 path 算，不用 folderLabel ——
 * folderLabel 是树里的原始目录名，拿不到 site.yaml 登记的小类显示名。
 * 用户已选中的那一层要剥掉，否则在子类视图里每行都重复同一层。
 */
const levels = computed(() => {
  const list = subLevels(props.doc.path, siteStore.subAliases)
  const first = list[0]
  if (props.strip && first && (first.key === props.strip || first.label === props.strip)) {
    return list.slice(1)
  }
  return list
})

const dateText = computed(() => {
  const raw = props.doc.updated_at
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(5, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  // 全量「2026-10-26 23:10」：跨天的碎片靠「今天」分不清先后（用户指定）
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

/**
 * 归属标签：跨栏目场景显示「大类 · 小类」，栏目内只显示小类（大类由 Tab 表达，
 * 再写一遍是噪音）。多级小类之间用 ` / `。
 */
const leadLabel = computed(() => {
  const sub = levels.value.map((l) => l.label).join(' / ')
  const head = props.showColumn ? col.value?.name || props.doc.rootName : ''
  return [head, sub].filter(Boolean).join(' · ')
})

/** 封面缩略图地址。没有封面就不渲染占位——空格子比没有更难看。 */
const coverSrc = computed(() => assetUrl(props.doc.cover_image || ''))
</script>

<template>
  <view class="doc" @click="emit('open', doc)">
    <view class="doc-main">
      <view class="doc-head">
        <text class="doc-title">{{ doc.title }}</text>
        <text v-if="doc.pinned" class="pin">置顶</text>
      </view>
      <text v-if="doc.excerpt" class="doc-excerpt">{{ doc.excerpt }}</text>
      <view class="doc-meta">
        <text v-if="leadLabel" :class="showColumn ? 'doc-cat' : 'doc-folder'">{{ leadLabel }}</text>
        <text v-if="leadLabel" class="meta-dot">·</text>
        <text>{{ dateText }}</text>
        <template v-if="doc.word_count">
          <text class="meta-dot">·</text>
          <text>{{ doc.word_count }} 字</text>
        </template>
      </view>
    </view>
    <image
      v-if="coverSrc"
      class="doc-cover"
      :src="coverSrc"
      mode="aspectFill"
      :lazy-load="true"
    />
  </view>
</template>

<style scoped>
.doc {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.doc:active {
  opacity: 0.6;
}

/* 封面缩略图：4:3 小图放右侧（用户指定）。image 必须显式宽高（uni 不会按比例撑） */
.doc-cover {
  flex: 0 0 auto;
  width: 168rpx;
  height: 126rpx;
  margin-left: 4rpx;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
}

/* 没封面的行没有缩略图，内容列自然占满；有封面时内容列要能收缩换行 */
.doc-main {
  flex: 1 1 auto;
  min-width: 0;
}

.doc-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.doc-title {
  flex: 1 1 auto;
  font-size: var(--fs-lg);
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.4rpx;
  color: var(--text);
}

.pin {
  flex: 0 0 auto;
  font-size: var(--fs-2xs);
  color: var(--accent);
  border: 1rpx solid var(--accent);
  border-radius: 8rpx;
  padding: 2rpx 8rpx;
}

.doc-excerpt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 10rpx;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--muted);
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 14rpx;
  font-size: var(--fs-xs);
  color: var(--faint);
}

.doc-cat {
  color: var(--accent);
}

.doc-folder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380rpx;
}

.meta-dot {
  color: var(--line-strong);
}
</style>

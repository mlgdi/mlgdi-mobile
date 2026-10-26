<script setup lang="ts">
/**
 * 文档行（列表项）。库列表与首页「最近更新」共用，避免两处各写一遍样式。
 *
 * `showColumn` 为真时，元信息前缀显示所属栏目（带栏目色），用于跨栏目场景。
 */
import { computed } from 'vue'
import type { FlatDoc } from '../store/notes'
import { columnByPath, type Column } from '../config/columns'

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
const relFolder = computed(() => {
  const parts = (props.doc.folderLabel || '').split(' · ').filter(Boolean).slice(1)
  if (props.strip && parts[0] === props.strip) parts.shift()
  return parts.join(' / ')
})

const dateText = computed(() => {
  const raw = props.doc.updated_at
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(5, 10)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '今天'
  const diff = (now.getTime() - d.getTime()) / 86400000
  if (diff < 1) return '今天'
  if (diff < 7) return `${Math.floor(diff)} 天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
})

const leadLabel = computed(() => {
  if (props.showColumn) return col.value?.name || props.doc.rootName
  return relFolder.value
})
</script>

<template>
  <view class="doc" @click="emit('open', doc)">
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
</template>

<style scoped>
.doc {
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.doc:active {
  opacity: 0.6;
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

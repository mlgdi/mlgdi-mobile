<script setup lang="ts">
/**
 * 顶栏：品牌名左对齐 + 右侧动作图标。
 *
 * 二级页用法：`<GTopBar back title="文章标题" />`，品牌名让位给页面标题。
 * 滚动后加磨砂底与发丝线，靠 `elevated` 由页面控制（页面才知道自己有没有滚动）。
 */
import GIcon from './GIcon.vue'

withDefaults(
  defineProps<{
    /** 品牌名或页面标题 */
    title?: string
    /** 标题后的小字副信息（版本号、篇数之类）。刻意做成同一个文本块，不单独占位 */
    sub?: string
    /** 是否二级页：显示返回箭头、标题居中 */
    back?: boolean
    /** 内容已滚动：显示磨砂底与下边框 */
    elevated?: boolean
  }>(),
  { title: '渡己・Mlgdi', sub: '', back: false, elevated: false },
)

const emit = defineEmits<{ (e: 'back'): void }>()
</script>

<template>
  <view :class="['gtop', { 'is-elevated': elevated, 'is-sub': back }]">
    <view v-if="back" class="lead" @click="emit('back')">
      <GIcon name="chevron-left" :size="48" :weight="2.3" />
    </view>
    <view :class="['title-wrap', { 'is-brand': !back }]">
      <text class="title">{{ title }}</text>
      <text v-if="sub" class="sub">{{ sub }}</text>
    </view>
    <view class="spacer" />
    <view class="actions">
      <slot name="actions" />
    </view>
  </view>
</template>

<style scoped>
.gtop {
  position: sticky;
  top: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 8rpx;
  height: 88rpx;
  padding: 0 32rpx;
  background-color: transparent;
  border-bottom: 1rpx solid transparent;
  transition:
    background-color 200ms ease,
    border-color 200ms ease;
}

.gtop.is-elevated {
  background-color: var(--bg-translucent);
  border-bottom-color: var(--line);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
}

.title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 品牌名：Apple 式紧字距，比正文略重 */
.title.is-brand {
  font-size: 34rpx;
  letter-spacing: -0.6rpx;
}

/* 标题 + 副信息（版本号之类）同一个文本块。
   flex 放在包装层而不是 .title 上：两层都 flex:1 会把副信息挤没。 */
.title-wrap {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
}

.sub {
  flex: 0 0 auto;
  margin-left: 12rpx;
  font-size: 22rpx;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--faint);
  white-space: nowrap;
}

.gtop.is-sub .title {
  /* 左对齐：手机窄，居中时左侧 96rpx、右侧动作数量不定，
     标题的「视觉中心」会跟着漂；左对齐与品牌名同一套语言 */
  text-align: left;
}

.lead {
  /* 96rpx：返回箭头放大到 48rpx 后，88rpx 的格子里两侧几乎贴边 */
  width: 96rpx;
  height: 88rpx;
  margin-left: -28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 中性色而不是强调色：返回是导航动作，不该比正文里的链接更抢眼 */
  color: var(--text-2);
}

.lead:active {
  opacity: 0.5;
}

.spacer {
  flex: 1 1 auto;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 0 0 auto;
}
</style>

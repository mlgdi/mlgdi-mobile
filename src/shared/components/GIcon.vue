<script setup lang="ts">
/**
 * 线性图标（24 网格 / stroke 2 / 圆头圆角），全部用 path 描述。
 *
 * 为什么不用 unicode 字符（‹ ✎ ↥ ⟳）：
 * 字形由系统字体决定，描边粗细、圆角、视觉重量都不可控，与网页版内联 SVG
 * 完全不是一套语言——这就是「图标不统一」的根因。
 *
 * 为什么不分「实心版」单独一套：只有 check 需要实心；
 * 其余靠 CSS 的 stroke/fill 切换即可（fill: currentColor + stroke: none）。
 */
import { computed } from 'vue'

interface Props {
  /** 图标名，见下方 ICONS */
  name: keyof typeof ICONS | string
  /** 显示尺寸（rpx），默认 40 */
  size?: number | string
  /** 实心版：用 currentColor 填充（仅 check 等少数图标有意义） */
  filled?: boolean
  /** 描边粗细，默认 2（24 网格下的视觉标准） */
  weight?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 40,
  filled: false,
  weight: 2,
})

/** 每个图标 = 一组 path 的 d 字符串 */
const ICONS: Record<string, string[]> = {
  inbox: [
    'M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z',
    'M3 13h5l1.5 2.5h5L16 13h5',
  ],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16.5 16.5 21 21'],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
  'chevron-left': ['M15 5 8 12l7 7'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-right': ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 4v5h-5'],
  import: ['M12 3v10', 'M16 9l-4 4-4-4', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  pencil: ['M4 20h4L18.5 9.5a2.83 2.83 0 1 0-4-4L4 16z'],
  check: ['M4.5 12.5 9.5 17.5 20 6.5'],
  trash: [
    'M4 7h16',
    'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12',
  ],
  image: [
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M9 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M21 15l-5-5L5 20',
  ],
  clipboard: ['M9 4h6v3H9z', 'M8 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2'],
  plus: ['M12 5v14', 'M5 12h14'],
  home: ['M3.5 9.5 12 2.8l8.5 6.7V20a1.2 1.2 0 0 1-1.2 1.2H4.7A1.2 1.2 0 0 1 3.5 20z', 'M9.5 21.2v-7.4h5v7.4'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  link: [
    'M10.5 13.5a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 0 0-5.66-5.66l-1.2 1.2',
    'M13.5 10.5a4 4 0 0 0-5.66 0L5.34 13a4 4 0 0 0 5.66 5.66l1.2-1.2',
  ],
  ellipsis: [
    'M6 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
    'M11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
    'M16 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
  ],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20.5 14.5A9 9 0 1 1 9.5 3.5a7 7 0 0 0 11 11z'],
  device: ['M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M11 19h2'],
  server: ['M4 5h16v5H4z', 'M4 14h16v5H4z', 'M7.5 7.5h.01M7.5 16.5h.01'],
}

const paths = computed(() => ICONS[props.name] || [])
const style = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}rpx` : props.size,
  height: typeof props.size === 'number' ? `${props.size}rpx` : props.size,
}))
</script>

<template>
  <svg
    class="gicon"
    :class="{ 'is-filled': filled }"
    :style="style"
    viewBox="0 0 24 24"
    :stroke-width="weight"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.gicon {
  display: block;
  flex: 0 0 auto;
}

/* 实心版：细线图标填色会糊，只对纯轮廓图标（如 check）使用 */
.gicon.is-filled {
  fill: currentColor;
  stroke: none;
}
</style>

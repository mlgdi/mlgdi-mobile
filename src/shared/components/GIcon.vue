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
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  folder: ['M4 6a1 1 0 0 1 1-1h4.6l2 2H19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6z'],
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
  doc: [
    'M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M13 3v5h5',
    'M8.5 13h7M8.5 17h5',
  ],
  /** AI：四角星芒，比「闪电/魔法棒」更中性 */
  sparkle: [
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
    'M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  ],
  eye: ['M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  /** 视频：播放三角 + 外框 */
  video: [
    'M3.5 6.5h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
    'M16.5 11l5-3.2v8.4l-5-3.2z',
  ],
  /** 封面：相框 + 山与太阳 */
  cover: [
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M3.5 16.5 9 11l4 4 2.5-2.5 4.5 4.5',
    'M8.6 9.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z',
  ],
  /** 标签 */
  tag: [
    'M11.6 3.6H20a.6.6 0 0 1 .6.6v8.4a1 1 0 0 1-.3.7l-8 8a1 1 0 0 1-1.4 0l-7.6-7.6a1 1 0 0 1 0-1.4l8-8a1 1 0 0 1 .7-.3z',
    'M16.4 7.6h.01',
  ],
  /** 附件：回形针 */
  clip: [
    'M20.3 11.5 11.6 20a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9',
  ],
  /** 日期时间 */
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3.2 1.9'],
  /** 表情 */
  smile: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M8.5 14.2a4.2 4.2 0 0 0 7 0',
    'M9 9.5h.01M15 9.5h.01',
  ],
  /** 专注：四角外扩 */
  expand: ['M9 4H4v5', 'M15 4h5v5', 'M15 20h5v-5', 'M9 20H4v-5'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  table: [
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M3 10h18M3 14.5h18M9.5 5v14M15 5v14',
  ],
  code: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  hr: ['M4 12h16'],
  send: ['M4.5 12 20 4l-5.5 16-3.2-6.4z', 'M11.3 13.6 20 4'],
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

/**
 * 渲染方式：**mask + data URI**，不是内联 <svg>。
 *
 * App 端（vue3）的页面由 uni 运行时渲染成 uni-view/uni-text 等自定义元素，
 * `<svg>`/`<path>` 这种原生标签会被整个丢掉——这就是 iOS 打包后图标全空的原因
 * （H5 端能渲染任意标签，所以开发时看不出来）。
 *
 * mask 方案的好处：形状进 background，颜色仍走 currentColor——
 * 调用方「跟文字变色」的用法一行都不用改。
 */
const style = computed(() => {
  const size = typeof props.size === 'number' ? `${props.size}rpx` : props.size
  const body = paths.value.map((d) => `<path d='${d}'/>`).join('')
  const fill = props.filled ? 'black' : 'none'
  const stroke = props.filled ? 'none' : 'black'
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${fill}' ` +
    `stroke='${stroke}' stroke-width='${props.weight}' ` +
    `stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`
  return {
    width: size,
    height: size,
    '--gicon': `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  }
})
</script>

<template>
  <view class="gicon" :class="{ 'is-filled': filled }" :style="style" />
</template>

<style scoped>
.gicon {
  display: block;
  flex: 0 0 auto;
  background-color: currentColor;
  -webkit-mask: var(--gicon) center / contain no-repeat;
  mask: var(--gicon) center / contain no-repeat;
}
</style>

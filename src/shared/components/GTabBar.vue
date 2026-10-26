<script setup lang="ts">
/**
 * 自定义 TabBar：首页 + 五栏目，共 6 格。
 *
 * 选中态语言统一：未选中是「符号」，选中在同一位置「溶」成中文——
 *  - 首页：房子图标 → 「首页」
 *  - 栏目：字母 M/L/G/D/I → 「魔笺 / 灵溯 / 观悟 / 道寻 / 逸隅」
 *
 * 为什么宽度锁死：底部横排 750rpx 分 6 格，每格 125rpx。若选中项变宽去挤邻居，
 * 文字会抖；所以变化只发生在胶囊内部（72 → 108rpx），格子宽度恒定。
 *
 * 为什么不用 uni 原生 tabBar：原生只支持静态图标 + 文案，做不了这种形变，
 * 也没法让每项带自己的栏目色。
 */
import { computed } from 'vue'
import { COLUMNS, tint, type ColumnCode } from '../config/columns'
import { resolvedTheme } from '../theme'
import GIcon from './GIcon.vue'

/** 首页不是栏目，单独给一个 code，避免和 M/L/G/D/I 混淆 */
export type TabCode = ColumnCode | 'HOME'

interface TabItem {
  code: TabCode
  name: string
  /** 未选中态：栏目用字母 */
  letter?: string
  /** 未选中态：首页用图标 */
  icon?: string
  main: string
  ink: string
}

const props = defineProps<{
  active: TabCode
  /** 未登录时整条降为不可用态 */
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'select', code: TabCode): void }>()

const isDark = computed(() => resolvedTheme.value === 'dark')

/** 首页沿用强调蓝；栏目沿用各自栏目色 */
const tabs = computed<TabItem[]>(() => [
  {
    code: 'HOME' as TabCode,
    name: '首页',
    icon: 'home',
    main: isDark.value ? '#2997ff' : '#0066cc',
    ink: isDark.value ? '#7cc0ff' : '#0058a3',
  },
  ...COLUMNS.map((col) => ({
    code: col.code as TabCode,
    name: col.name,
    letter: col.code,
    main: isDark.value ? col.mainDark : col.main,
    ink: isDark.value ? col.inkDark : col.ink,
  })),
])

function pick(code: TabCode): void {
  if (props.disabled) return
  if (code === props.active) return
  emit('select', code)
}

function tabStyle(item: TabItem): Record<string, string> {
  return {
    '--c': item.main,
    '--ink': item.ink,
    '--c-soft': tint(item.main, isDark.value ? 0.22 : 0.12),
    '--c-line': tint(item.main, isDark.value ? 0.45 : 0.3),
  }
}
</script>

<template>
  <view :class="['gtab', { 'is-disabled': disabled }]">
    <view
      v-for="item in tabs"
      :key="item.code"
      class="tab"
      :style="tabStyle(item)"
      @click="pick(item.code)"
    >
      <view :class="['cap', { on: active === item.code }]">
        <!-- 未选中符号：图标 / 字母共用同一块位置，形变时中心不动 -->
        <view class="sym">
          <GIcon v-if="item.icon" :name="item.icon" :size="38" :weight="1.9" />
          <text v-else class="letter">{{ item.letter }}</text>
        </view>
        <!-- 选中态中文 -->
        <text class="name">{{ item.letter ? `${item.letter}·${item.name}` : item.name }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.gtab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--surface);
  border-top: 1rpx solid var(--line);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}

.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* 6 格等分：750 / 6 = 125rpx（62.5pt），仍远超 44pt 触摸下限 */
.tab {
  flex: 1 1 0;
  height: var(--tabbar-h);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab:active {
  background-color: var(--surface-2);
}

.cap {
  position: relative;
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: transparent;
  border: 1rpx solid transparent;
  transition:
    width 240ms cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 200ms ease,
    border-color 200ms ease,
    transform 80ms ease;
}

.tab:active .cap {
  transform: scale(0.94);
}

/* 6 格时 120rpx 会顶满格子，收到 108rpx 留出呼吸 */
.cap.on {
  width: 116rpx;
  background-color: var(--c-soft);
  border-color: var(--c-line);
}

.sym {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c);
  opacity: 0.8;
  transition:
    opacity 90ms ease,
    transform 90ms ease;
}

.letter {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1;
}

.cap.on .sym {
  opacity: 0;
  transform: translateY(-10rpx) scale(0.86);
}

.name {
  position: absolute;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  color: var(--ink);
  opacity: 0;
  transform: translateY(10rpx);
  transition:
    opacity 160ms ease 90ms,
    transform 160ms ease 90ms;
  white-space: nowrap;
}

.cap.on .name {
  opacity: 1;
  transform: translateY(0);
}
</style>

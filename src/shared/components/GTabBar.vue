<script setup lang="ts">
/**
 * 自定义 TabBar：首页 + 五栏目，共 6 格。
 *
 * 选中态（V2.2，对齐 Web 入口页导航）：**选中胶囊是一整颗滑动指示器**，
 * 点某个格子，胶囊从上一个位置滑过来——不是每格自己长胶囊。
 * 胶囊滑到哪，哪格的「符号（房子/字母）」溶成「中文名」，同 Web 入口页的效果。
 *
 * 高度：`--tabbar-h` 是**纯格子高度**，安全区只通过 padding-bottom 追加一次。
 * （之前 height 里算了一遍 inset、padding 又算了一遍，底部凭空多出一条空白。）
 *
 * 为什么不用 uni 原生 tabBar：原生只支持静态图标 + 文案，做不了滑动形变，
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

/** 每格自己的色（符号用）；胶囊的配色跟随「当前选中」的那格 */
function tabStyle(item: TabItem): Record<string, string> {
  return {
    '--c': item.main,
    '--ink': item.ink,
    '--c-soft': tint(item.main, isDark.value ? 0.22 : 0.12),
    '--c-line': tint(item.main, isDark.value ? 0.45 : 0.3),
  }
}

/** 选中格的下标：胶囊滑动位置 = 下标 × 格宽 + 居中偏移 */
const activeIndex = computed(() => tabs.value.findIndex((t) => t.code === props.active))

/** 滑动胶囊：left 用百分比走格心，再往回挪半个胶囊宽 */
const gliderStyle = computed(() => {
  const item = tabs.value[activeIndex.value] ?? tabs.value[0]
  const left = `calc(${((activeIndex.value + 0.5) * 100) / 6}% - 58rpx)`
  return {
    left,
    '--c': item.main,
    '--ink': item.ink,
    '--c-soft': tint(item.main, isDark.value ? 0.22 : 0.12),
    '--c-line': tint(item.main, isDark.value ? 0.45 : 0.3),
  }
})
</script>

<template>
  <view :class="['gtab', { 'is-disabled': disabled }]">
    <!-- 滑动选中胶囊：一整颗，随 active 在 6 格之间滑 -->
    <view class="glider" :style="gliderStyle">
      <text v-for="item in tabs" v-show="active === item.code" :key="item.code" class="glider-name">
        {{ item.letter ? `${item.letter}·${item.name}` : item.name }}
      </text>
    </view>

    <view
      v-for="item in tabs"
      :key="item.code"
      class="tab"
      :style="tabStyle(item)"
      @click="pick(item.code)"
    >
      <view :class="['sym', { on: active === item.code }]">
        <GIcon v-if="item.icon" :name="item.icon" :size="38" :weight="1.9" />
        <text v-else class="letter">{{ item.letter }}</text>
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
  /* 纯格子高度；安全区只在 padding 里追加一次（修复底部双倍空白） */
  height: var(--tabbar-h);
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

/* 滑动选中胶囊：宽度恒定 116rpx，left 由内联样式驱动 */
.glider {
  position: absolute;
  top: calc((var(--tabbar-h) - 72rpx) / 2);
  width: 116rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background-color: var(--c-soft);
  border: 1rpx solid var(--c-line);
  transition: left 260ms cubic-bezier(0.34, 1.3, 0.5, 1);
}

.glider-name {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  margin-top: -12rpx;
  text-align: center;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
  animation: glider-name-in 180ms ease both;
}

@keyframes glider-name-in {
  from {
    opacity: 0;
    transform: translateY(8rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 符号（房子/字母）：未选中常亮，被胶囊盖住时淡出 */
.sym {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c);
  opacity: 0.8;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.letter {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1;
}

.sym.on {
  opacity: 0;
  transform: scale(0.86);
}
</style>

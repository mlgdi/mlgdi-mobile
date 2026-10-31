<script setup lang="ts">
/**
 * 运行日志页。
 *
 * 给「真机出问题但说不清」准备的工具：把最近 400 条运行记录摆出来，
 * 一键复制就能整段发给开发者。级别可筛，错误一眼能认出。
 */
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { resolvedTheme } from '../../shared/theme'
import { APP_VERSION } from '../../shared/version'
import {
  clearLogs,
  exportLogs,
  readLogs,
  type LogEntry,
  type LogLevel,
} from '../../shared/utils/logger'

const logs = ref<LogEntry[]>([])
const filter = ref<'all' | LogLevel>('all')

const shown = computed(() =>
  filter.value === 'all' ? logs.value : logs.value.filter((e) => e.lvl === filter.value),
)

const counts = computed(() => ({
  all: logs.value.length,
  error: logs.value.filter((e) => e.lvl === 'error').length,
  warn: logs.value.filter((e) => e.lvl === 'warn').length,
}))

onShow(() => {
  logs.value = readLogs()
})

function copy(): void {
  const text = exportLogs()
  if (!text) {
    uni.showToast({ title: '还没有日志', icon: 'none' })
    return
  }
  // 头部加上版本与时间：排查时先要知道这是哪个包、什么时候的
  const head = `渡己 v${APP_VERSION} · ${new Date().toLocaleString()}\n----\n`
  uni.setClipboardData({
    data: head + text,
    success: () => uni.showToast({ title: '已复制，可直接粘贴发送', icon: 'none' }),
  })
}

function clear(): void {
  uni.showModal({
    title: '清空日志',
    content: '清空后不可恢复，确定吗？',
    success: (res) => {
      if (!res.confirm) return
      clearLogs()
      logs.value = []
      uni.showToast({ title: '已清空', icon: 'none' })
    },
  })
}

function back(): void {
  uni.navigateBack()
}
</script>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="运行日志" :elevated="true" @back="back" />

    <view class="body">
      <view class="bar">
        <view :class="['chip', filter === 'all' ? 'is-on' : '']" @click="filter = 'all'">
          全部 {{ counts.all }}
        </view>
        <view :class="['chip', filter === 'error' ? 'is-on' : '']" @click="filter = 'error'">
          错误 {{ counts.error }}
        </view>
        <view :class="['chip', filter === 'warn' ? 'is-on' : '']" @click="filter = 'warn'">
          警告 {{ counts.warn }}
        </view>
      </view>

      <view v-if="!logs.length" class="hint">
        <text class="muted">还没有日志</text>
        <text class="hint-h">
          去用一下出问题的功能（比如分享 → 下载 Markdown），再回来看这里
        </text>
      </view>

      <view v-else-if="!shown.length" class="hint">
        <text class="muted">这个级别下没有记录</text>
      </view>

      <view v-else class="list">
        <view v-for="(e, i) in shown" :key="i" :class="['row', `is-${e.lvl}`]">
          <view class="row-top">
            <text class="time">{{ e.t }}</text>
            <text class="tag">{{ e.tag }}</text>
            <text v-if="e.lvl !== 'info'" class="lvl">{{ e.lvl === 'error' ? '错误' : '警告' }}</text>
          </view>
          <text class="msg">{{ e.msg }}</text>
        </view>
      </view>
    </view>

    <view class="foot">
      <view :class="['fbtn', 'fbtn-main']" @click="copy">
        <GIcon name="clipboard" :size="30" :weight="2" />
        <text class="fbtn-t">复制全部</text>
      </view>
      <view class="fbtn" @click="clear">清空</view>
    </view>
  </view>
</template>

<style scoped>
.body {
  /* 底部固定按钮条，正文要留出空间 */
  padding: 20rpx var(--page-gutter) 200rpx;
}

.bar {
  display: flex;
  gap: 14rpx;
  margin-bottom: 20rpx;
}

.chip {
  padding: 12rpx 24rpx;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  font-size: var(--fs-xs);
  color: var(--muted);
}

.chip.is-on {
  background-color: var(--accent);
  color: #fff;
}

.hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 120rpx 40rpx;
  text-align: center;
}

.hint-h {
  max-width: 480rpx;
  font-size: var(--fs-xs);
  line-height: 1.7;
  color: var(--faint);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

.row {
  padding: 16rpx 20rpx;
  border-radius: var(--r-sm);
  background-color: var(--surface);
  /* 错误/警告左侧一条色条，扫读时不用逐字看 */
  border-left: 6rpx solid transparent;
}

.row.is-error {
  border-left-color: #ff3b30;
  background-color: rgba(255, 59, 48, 0.06);
}

.row.is-warn {
  border-left-color: #ff9f0a;
}

.row-top {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 6rpx;
}

.time {
  flex: 0 0 auto;
  font-size: var(--fs-xs);
  color: var(--faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tag {
  /* 模块名可能较长，允许收缩，但不能把「错误」挤走 */
  flex: 0 1 auto;
  min-width: 0;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lvl {
  /* 必须不缩不换行：flex 行里默认 shrink:1 会把「错误」压成竖排两行 */
  flex: 0 0 auto;
  white-space: nowrap;
  margin-left: auto;
  font-size: var(--fs-xs);
  color: #ff3b30;
}

.msg {
  display: block;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  /* 优先在空格/标点处折行，实在放不下才硬断，读起来不费劲 */
  overflow-wrap: anywhere;
  word-break: normal;
}

.foot {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  gap: 16rpx;
  padding: 20rpx var(--page-gutter) calc(20rpx + env(safe-area-inset-bottom));
  background-color: var(--surface);
  border-top: 1px solid var(--line);
}

.fbtn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  min-width: 160rpx;
  padding: 22rpx 28rpx;
  border-radius: var(--r-md);
  background-color: var(--surface-2);
  font-size: var(--fs-sm);
  color: var(--text);
}

.fbtn-main {
  flex: 1;
  background-color: var(--accent);
  color: #fff;
  font-weight: 600;
}

.fbtn-t {
  font-size: var(--fs-sm);
  font-weight: 600;
}
</style>

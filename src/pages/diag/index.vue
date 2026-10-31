<script setup lang="ts">
/**
 * 诊断页：把 App 内部状态摊开。
 *
 * 只解决一个问题 —— 真机上「点了没反应 / 跳转了没动作」时，不用连电脑看日志，
 * 截一张图就能判断问题出在平台判断、文件系统、还是系统根本没把文件交过来。
 */
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { resolvedTheme } from '../../shared/theme'
import { APP_VERSION } from '../../shared/version'
import { toast } from '../../shared/ui/feedback'
import {
  clearErrors,
  collectEnv,
  readErrors,
  type DiagEnv,
  type DiagError,
} from '../../shared/utils/diag'
import { storageSelfTest, type SelfTestRow } from '../../shared/utils/native-fs'

const env = ref<DiagEnv | null>(null)
const errors = ref<DiagError[]>([])
const busy = ref(false)

/**
 * 存储自检结果。
 *
 * 「共享收不到 / 下载没反应」这两条已经连续四轮没解决，靠现象描述无法定位：
 * 到底是路径推错了、原生桥接调不通、还是系统压根没把文件交过来？
 * 这个按钮把每条通道挨个跑一遍，一张截图就能说清楚。
 */
const testRows = ref<SelfTestRow[]>([])
const testing = ref(false)

function runSelfTest(): void {
  testing.value = true
  try {
    testRows.value = storageSelfTest()
  } finally {
    testing.value = false
  }
}

onShow(() => {
  void refresh()
})

async function refresh(): Promise<void> {
  busy.value = true
  try {
    env.value = await collectEnv()
    errors.value = readErrors()
  } finally {
    busy.value = false
  }
}

function clear(): void {
  clearErrors()
  errors.value = []
  toast('已清空')
}

function back(): void {
  uni.navigateBack()
}
</script>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="诊断" :elevated="true" @back="back" />

    <view class="body">
      <text class="section-label muted">环境</text>
      <view class="card">
        <view class="row">
          <text class="k">版本</text>
          <text class="v">v{{ APP_VERSION }}</text>
        </view>
        <view class="row">
          <text class="k">plus.os.name</text>
          <!-- 原样打印：平台判断失败的原因往往就在这个值的实际形态上 -->
          <text class="v mono">{{ env?.osName || '读取中…' }}</text>
        </view>
        <view class="row">
          <text class="k">系统版本</text>
          <text class="v mono">{{ env?.osVersion || '…' }}</text>
        </view>
        <view class="row">
          <text class="k">plus.ios</text>
          <text :class="['v', env?.hasPlusIOS ? 'ok' : 'bad']">
            {{ env?.hasPlusIOS ? '可用' : '不可用' }}
          </text>
        </view>
        <view class="row">
          <text class="k">FileSystemManager</text>
          <!-- 不是「坏了」：uni.getFileSystemManager 是小程序 API，App 端本来就没有。
               写文件走 plus.io，这一行只留作参考，所以用灰字而不是红字。 -->
          <text :class="['v', env?.hasFsm ? 'ok' : 'muted']">
            {{ env?.hasFsm ? '可用' : '不适用（走 plus.io）' }}
          </text>
        </view>
      </view>

      <text class="section-label muted">导入目录</text>
      <view class="card">
        <view class="row">
          <text class="k">路径</text>
          <text class="v mono">{{ env?.inbox.dir || '…' }}</text>
        </view>
        <view v-if="env?.inbox.absDir" class="abs">
          <text class="abs-t mono">{{ env.inbox.absDir }}</text>
        </view>
        <view class="row">
          <text class="k">文件数</text>
          <text :class="['v', env?.inbox.total ? 'ok' : 'warn']">
            {{ env?.inbox.total ?? 0 }}（可导入 {{ env?.inbox.usable ?? 0 }}）
          </text>
        </view>
        <view v-if="env?.inbox.names.length" class="names">
          <text v-for="n in env.inbox.names" :key="n" class="name">{{ n }}</text>
        </view>
        <!-- 兜底目录：文件被放进别处时，这里会显示条目数 -->
        <view v-for="o in env?.inbox.others || []" :key="o.dir" class="row">
          <text class="k mono ellip">{{ o.dir }}</text>
          <text :class="['v', o.total ? 'warn' : 'muted']">{{ o.total }} 个</text>
        </view>
        <text v-if="!env?.inbox.total" class="hint-line">
          目录为空。从「文件」App 长按 .md → 共享 → 渡己，系统会把文件复制到
          Documents/Inbox，这里就能看到
        </text>
      </view>

      <text class="section-label muted">最近导出</text>
      <view class="card">
        <view v-if="!env?.lastExport" class="row">
          <text class="v muted">还没有导出过</text>
        </view>
        <template v-else>
          <view class="row">
            <text class="k">文件</text>
            <text class="v ellip">{{ env.lastExport.name }}</text>
          </view>
          <view class="row">
            <text class="k">大小</text>
            <text :class="['v', env.lastExport.size > 0 ? 'ok' : 'bad']">
              {{ env.lastExport.size >= 0 ? env.lastExport.size + ' 字节' : '读不到' }}
            </text>
          </view>
          <view class="abs">
            <text class="abs-t mono">{{ env.lastExport.path }}</text>
          </view>
          <text class="hint-line">
            {{ env.lastExport.at }} · 正文 {{ env.lastExport.expect }} 字
          </text>
        </template>
      </view>

      <text class="section-label muted">最近剪贴板</text>
      <view class="card">
        <view v-if="!env?.lastClip" class="row">
          <text class="v muted">还没有检测过</text>
        </view>
        <template v-else>
          <view class="row">
            <text class="k">判定</text>
            <text class="v">{{ env.lastClip.verdict }}</text>
          </view>
          <view class="row">
            <text class="k">长度</text>
            <text class="v mono">{{ env.lastClip.len }} 字</text>
          </view>
          <view v-if="env.lastClip.head" class="abs">
            <text class="abs-t mono">{{ env.lastClip.head }}</text>
          </view>
          <text class="hint-line">{{ env.lastClip.at }} · 切回前台时读取</text>
        </template>
      </view>

      <view class="section-head">
        <text class="section-label muted">存储自检</text>
        <text class="clear" @click="runSelfTest">{{ testing ? '检测中…' : '运行' }}</text>
      </view>
      <view class="card">
        <view v-if="!testRows.length" class="row">
          <text class="v muted">点「运行」，逐项检查每一条读写通道</text>
        </view>
        <view v-for="r in testRows" :key="r.step" class="test-row">
          <view class="test-top">
            <text class="k">{{ r.step }}</text>
            <text :class="['badge', r.ok ? 'ok' : 'bad']">{{ r.ok ? '通过' : '失败' }}</text>
          </view>
          <text class="test-detail mono">{{ r.detail }}</text>
        </view>
      </view>

      <view class="section-head">
        <text class="section-label muted">最近错误</text>
        <text v-if="errors.length" class="clear" @click="clear">清空</text>
      </view>
      <view class="card">
        <view v-if="!errors.length" class="row">
          <text class="v muted">还没有记录</text>
        </view>
        <view v-for="(e, i) in errors" :key="i" class="err">
          <view class="err-top">
            <text class="err-scope">{{ e.scope }}</text>
            <text class="err-at">{{ e.at }}</text>
          </view>
          <text class="err-msg">{{ e.message }}</text>
        </view>
      </view>

      <view :class="['btn', 'btn-ghost', 'refresh', busy ? 'is-busy' : '']" @click="refresh">
        <GIcon name="refresh" :size="30" :weight="2" />
        <text class="refresh-t">重新检测</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.body {
  padding: 24rpx var(--page-gutter) 80rpx;
}

.section-label {
  display: block;
  margin: 36rpx 0 14rpx;
  padding-left: 8rpx;
  font-size: var(--fs-xs);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.clear {
  padding: 0 12rpx;
  font-size: var(--fs-xs);
  color: var(--faint);
}

.card {
  padding: 8rpx 28rpx;
  background-color: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24rpx;
  padding: 22rpx 0;
  border-bottom: 1px solid var(--line);
}

.row:last-child {
  border-bottom: none;
}

.k {
  flex: 0 0 auto;
  font-size: var(--fs-sm);
  color: var(--muted);
}

.v {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text);
  text-align: right;
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--fs-xs);
}

.ellip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 绝对路径这种长串：单独一层灰底，别挤在 key-value 行里把两列都撑变形 */
.abs {
  padding: 14rpx 0 16rpx;
  border-bottom: 1px solid var(--line);
}

.card > .abs:last-child {
  border-bottom: none;
}

.abs-t {
  display: block;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--faint);
  word-break: break-all;
}

.ok {
  color: #34c759;
}

.bad {
  color: #ff3b30;
}

.warn {
  color: #ff9f0a;
}

.names {
  padding: 8rpx 0 20rpx;
}

.name {
  display: block;
  padding: 6rpx 0;
  font-size: var(--fs-xs);
  color: var(--text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.hint-line {
  display: block;
  padding: 12rpx 0 24rpx;
  font-size: var(--fs-xs);
  line-height: 1.7;
  color: var(--faint);
}

.err {
  padding: 20rpx 0;
  border-bottom: 1px solid var(--line);
}

.test-row {
  padding: 18rpx 0;
  border-bottom: 1px solid var(--line);
}

.test-row:last-child {
  border-bottom: none;
}

.test-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.badge {
  flex: 0 0 auto;
  padding: 2rpx 12rpx;
  border-radius: var(--r-full);
  font-size: var(--fs-2xs);
  background-color: var(--surface-2);
}

.test-detail {
  display: block;
  margin-top: 6rpx;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--faint);
  word-break: break-all;
}

.err:last-child {
  border-bottom: none;
}

.err-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6rpx;
}

.err-scope {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--accent);
}

.err-at {
  font-size: var(--fs-xs);
  color: var(--faint);
}

.err-msg {
  display: block;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--text-2);
  word-break: break-all;
}

.refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-top: 44rpx;
}

.refresh.is-busy {
  opacity: 0.5;
}

.refresh-t {
  font-size: var(--fs-sm);
}
</style>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="服务器" :elevated="true" @back="back" />

    <view class="section">
      <text class="section-label muted">地址</text>
      <view class="card">
        <input
          v-model="input"
          class="addr-input"
          placeholder="https://www.mlgdi.com"
          placeholder-class="ph"
          :adjust-position="true"
          confirm-type="done"
        />
      </view>
      <text v-if="isHttp" class="warn">⚠️ 明文 HTTP 仅适合局域网调试；正式环境请用 HTTPS。</text>
      <text class="note muted">
        只填协议 + 主机 + 端口，不要带路径。保存后会用新地址重新要求登录。
      </text>
    </view>

    <view class="section">
      <view class="row actions">
        <button class="btn btn-ghost flex1" :disabled="probing" @click="probe">
          {{ probing ? '测试中…' : '测试连接' }}
        </button>
        <button class="btn flex1" :disabled="!dirty || !valid" @click="save">保存</button>
      </view>
      <view v-if="probeResult" class="card probe">
        <text :class="['probe-title', probeResult.ok ? 'ok' : 'bad']">
          {{ probeResult.ok ? '连接正常' : '连接失败' }}
        </text>
        <text class="muted probe-line">
          耗时 {{ probeResult.latency }} ms
          <template v-if="probeResult.version"> · 服务端 {{ probeResult.version }}</template>
          <template v-if="probeResult.error"> · {{ probeResult.error }}</template>
        </text>
      </view>
    </view>

    <view class="section">
      <button class="btn btn-ghost" @click="useDefault">恢复默认（{{ DEFAULT_BASE_URL }}）</button>
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  DEFAULT_BASE_URL,
  getBaseUrl,
  isPlainHttp,
  isValidBaseUrl,
  normalizeBaseUrl,
  probeServer,
  setBaseUrl,
  type ProbeResult,
} from '../../shared/config/server'
import { resolvedTheme } from '../../shared/theme'

const input = ref(getBaseUrl())
const probing = ref(false)
const probeResult = ref<ProbeResult | null>(null)

const valid = computed(() => isValidBaseUrl(input.value))
const isHttp = computed(() => valid.value && isPlainHttp(input.value))
const dirty = computed(() => normalizeBaseUrl(input.value) !== getBaseUrl())

function back(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

async function probe(): Promise<void> {
  if (!valid.value) {
    uni.showToast({ title: '地址格式不对', icon: 'none' })
    return
  }
  probing.value = true
  probeResult.value = null
  try {
    probeResult.value = await probeServer(input.value)
  } finally {
    probing.value = false
  }
}

function save(): void {
  if (!valid.value) return
  const url = normalizeBaseUrl(input.value)
  const changed = url !== getBaseUrl()

  uni.showModal({
    title: '切换服务器',
    content: changed
      ? `切换到 ${url}\n\n各服务器的登录态独立保存，切回来时原来的登录仍有效。`
      : '地址没有变化。',
    showCancel: changed,
    success: (res) => {
      if (changed && !res.confirm) return
      try {
        setBaseUrl(url)
      } catch (err: any) {
        uni.showToast({ title: err?.message || '保存失败', icon: 'none' })
        return
      }
      // 换服务器相当于换了身份域：回登录页让用户用新地址重新认证
      uni.reLaunch({ url: '/pages/login/index' })
    },
  })
}

function useDefault(): void {
  input.value = DEFAULT_BASE_URL
  probeResult.value = null
}

onLoad(() => {
  input.value = getBaseUrl()
})
</script>

<style scoped>
.section {
  padding: 16px 16px 0;
}

.section-label {
  display: block;
  font-size: 12px;
  padding: 0 2px 8px;
  letter-spacing: 0.3px;
}

.card {
  overflow: hidden;
  padding: 4px 14px;
}

.addr-input {
  height: 48px;
  font-size: 16px;
  color: var(--text);
}

.ph {
  color: var(--muted);
}

.warn {
  display: block;
  font-size: 12px;
  color: var(--danger);
  padding: 8px 4px 0;
  line-height: 1.6;
}

.note {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 4px 0;
}

.actions {
  gap: 10px;
}

.flex1 {
  flex: 1;
}

.probe {
  margin-top: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.probe-title {
  font-size: 14px;
  font-weight: 600;
}

.ok {
  color: #2f9e63;
}

.bad {
  color: var(--danger);
}

.probe-line {
  font-size: 12px;
  line-height: 1.6;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 40px);
}
</style>

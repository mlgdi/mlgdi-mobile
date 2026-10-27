<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="设置" :elevated="true" @back="back" />

    <view class="section">
      <text class="section-label muted">服务器</text>
      <view class="card cell" @click="toServer">
        <view class="cell-main">
          <text class="cell-title">服务器地址</text>
          <text class="cell-sub muted">{{ baseUrl }}</text>
        </view>
        <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
      </view>
    </view>

    <view class="section">
      <text class="section-label muted">外观</text>
      <view class="card">
        <view class="seg">
          <view
            v-for="opt in themeOptions"
            :key="opt.value"
            :class="['seg-item', themeMode === opt.value ? 'seg-on' : '']"
            @click="pickTheme(opt.value)"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>
      <text class="note muted">主题只存在本机，不会改动网页端（与 Web「偏好跟账号」刻意不同）。</text>
    </view>

    <view class="section">
      <text class="section-label muted">捕捉</text>
      <view class="card">
        <view class="cell">
          <view class="cell-main">
            <text class="cell-title">剪贴板投递弹窗</text>
            <text class="cell-sub muted">切回 App 时检测剪贴板，有内容就询问是否收进碎片箱</text>
          </view>
          <switch :checked="clipAsk" color="#0066cc" @change="toggleClip" />
        </view>
      </view>
      <text class="note muted">iOS 系统会在首次读取时弹「允许粘贴」授权；关掉这个开关就完全不读剪贴板。</text>
    </view>

    <view class="section">
      <text class="section-label muted">账号</text>
      <view class="card">
        <view class="cell">
          <view class="cell-main">
            <text class="cell-title">{{ auth.displayName }}</text>
            <text class="cell-sub muted">{{ auth.isAdmin ? '管理员' : '成员' }}</text>
          </view>
        </view>
        <view class="divider" />
        <view class="cell" @click="logout">
          <text class="cell-title danger">退出登录</text>
        </view>
      </view>
    </view>

    <view class="section">
      <view class="row section-head">
        <text class="section-label muted">已登记设备</text>
        <text class="section-label muted">{{ devices.length }}</text>
      </view>
      <view class="card">
        <view v-if="!devices.length" class="cell">
          <text class="muted">没有设备记录（Web 端不登记设备）</text>
        </view>
        <template v-for="(d, i) in devices" :key="d.id">
          <view v-if="i > 0" class="divider" />
          <view class="cell">
            <view class="cell-main">
              <view class="row">
                <text class="cell-title">{{ d.name || d.platform || '未知设备' }}</text>
                <text v-if="d.current" class="badge">本机</text>
              </view>
              <text class="cell-sub muted">{{ d.platform }} · 最近 {{ shortTime(d.last_seen_at) }}</text>
            </view>
            <text v-if="!d.current" class="revoke" @click="revoke(d)">吊销</text>
          </view>
        </template>
      </view>
      <text class="note muted">吊销后该设备的下一个请求即失效；换机丢手机时用得上。</text>
    </view>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../shared/store/auth'
import { getBaseUrl } from '../../shared/config/server'
import { listDevices, revokeDevice, type DeviceRow } from '../../shared/api/auth'
import { resolvedTheme, themeMode, setThemeMode, type ThemeMode } from '../../shared/theme'

const auth = useAuthStore()
const baseUrl = ref(getBaseUrl())
const devices = ref<DeviceRow[]>([])

/** 剪贴板询问开关：默认开；intake.ts 每次回前台现读，改完立即生效 */
const clipAsk = ref(uni.getStorageSync('garden.intake.clip') !== 'off')

function toggleClip(e: any): void {
  clipAsk.value = Boolean(e?.detail?.value)
  try {
    uni.setStorageSync('garden.intake.clip', clipAsk.value ? 'on' : 'off')
  } catch {
    /* 存不进就本次会话有效 */
  }
}

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

function back(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

function toServer(): void {
  uni.navigateTo({ url: '/pages/server/index' })
}

function pickTheme(mode: ThemeMode): void {
  setThemeMode(mode)
}

function shortTime(raw: string | null): string {
  if (!raw) return '未记录'
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

async function loadDevices(): Promise<void> {
  try {
    const res = await listDevices()
    devices.value = res.devices || []
  } catch {
    devices.value = []
  }
}

function revoke(d: DeviceRow): void {
  uni.showModal({
    title: '吊销设备',
    content: `吊销后「${d.name || d.platform}」需要重新登录，确定吗？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await revokeDevice(d.id)
        uni.showToast({ title: '已吊销', icon: 'none' })
        loadDevices()
      } catch (err: any) {
        uni.showToast({ title: err?.reason || '吊销失败', icon: 'none' })
      }
    },
  })
}

function logout(): void {
  uni.showModal({
    title: '退出登录',
    content: '本机将清除令牌（设备登记保留，可在列表里吊销）。',
    success: (res) => {
      if (!res.confirm) return
      auth.logout()
      uni.reLaunch({ url: '/pages/login/index' })
    },
  })
}

onShow(() => {
  baseUrl.value = getBaseUrl()
  loadDevices()
})
</script>

<style scoped>
.section {
  padding: 16px 16px 0;
}

.section-head {
  justify-content: space-between;
  padding: 0 2px;
}

.section-label {
  display: block;
  font-size: 12px;
  padding: 0 2px 8px;
  letter-spacing: 0.3px;
}

.card {
  overflow: hidden;
}

.cell {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.cell:active {
  background-color: var(--surface-2);
}

.cell-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-title {
  font-size: 16px;
  color: var(--text);
}

.cell-sub {
  font-size: 12px;
  word-break: break-all;
}

.chev {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--faint);
}

.danger {
  color: var(--danger);
}

.badge {
  font-size: 10px;
  color: var(--accent);
  background-color: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 6px;
}

.revoke {
  font-size: 13px;
  color: var(--danger);
  padding: 6px 10px;
  border-radius: 8px;
  background-color: var(--surface-2);
}

.seg {
  display: flex;
  padding: 6px;
  gap: 4px;
}

.seg-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: 14px;
  color: var(--muted);
  border-radius: 9px;
}

.seg-on {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.note {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 4px 0;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 40px);
}
</style>

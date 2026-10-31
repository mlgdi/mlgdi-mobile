<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <view class="wrap">
      <view class="brand">
        <text class="brand-name">渡己</text>
        <text class="brand-sub">自留地 · 移动端</text>
      </view>

      <view class="form card">
        <input
          v-model="username"
          class="field"
          placeholder="用户名"
          placeholder-class="ph"
          :adjust-position="true"
          confirm-type="next"
        />
        <input
          v-model="password"
          class="field"
          type="text"
          :password="true"
          placeholder="密码"
          placeholder-class="ph"
          confirm-type="done"
          @confirm="submit"
        />
        <button class="btn" :disabled="!canSubmit || auth.logging" @click="submit">
          {{ auth.logging ? '登录中…' : '登录' }}
        </button>
      </view>

      <view class="server-row" @click="toServer">
        <text class="muted">服务器</text>
        <text class="server-val">{{ baseUrl }}</text>
        <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
      </view>

      <text class="tip muted">首次登录会把这台设备登记到账号下，之后令牌长期有效；换机或泄漏可在设置里吊销。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../shared/store/auth'
import { getBaseUrl } from '../../shared/config/server'
import { hasSession } from '../../shared/auth/session'
import { resolvedTheme } from '../../shared/theme'

import { toast } from '../../shared/ui/feedback'
const auth = useAuthStore()
const username = ref('')
const password = ref('')
const baseUrl = ref(getBaseUrl())

const canSubmit = computed(() => Boolean(username.value.trim() && password.value))

/** 登录成功后回到来的地方：从设置/文档页进来就退回去，冷启动才落库页 */
function leaveLogin(): void {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

onShow(() => {
  baseUrl.value = getBaseUrl()
  if (hasSession()) leaveLogin()
})

function toServer(): void {
  uni.navigateTo({ url: '/pages/server/index' })
}

async function submit(): Promise<void> {
  if (!canSubmit.value || auth.logging) return
  try {
    await auth.login(username.value, password.value)
    toast('已登录')
    setTimeout(leaveLogin, 300)
  } catch (err: any) {
    // 后端 detail.reason 更具体（例如「设备标识已被其他账号占用」），优先展示它
    toast(err?.reason || err?.message || '登录失败', 2600)
  }
}
</script>

<style scoped>
.wrap {
  padding: 0 22px;
  padding-top: calc(var(--safe-top, 0px) + 96px);
  display: flex;
  flex-direction: column;
}

.brand {
  margin-bottom: 34px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brand-name {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -1.4px;
  color: var(--text);
}

.brand-sub {
  font-size: 14px;
  color: var(--muted);
  letter-spacing: 0.4px;
}

.form {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form .btn {
  margin-top: 4px;
}

.ph {
  color: var(--muted);
}

.server-row {
  margin-top: 18px;
  padding: 12px 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.server-val {
  flex: 1;
  color: var(--accent);
  word-break: break-all;
}

.chev {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--faint);
}

.tip {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
}
</style>

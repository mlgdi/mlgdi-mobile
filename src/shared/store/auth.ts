import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin, logout as logoutApi } from '../api/auth'
import {
  clearSession,
  getDeviceMeta,
  getOrCreateDeviceId,
  hasSession,
  readSession,
  writeSession,
  type SessionUser,
} from '../auth/session'
import { ApiError } from '../api/client'
import { getPrefs } from '../api/prefs'
import { applyServerTheme } from '../theme'

export const useAuthStore = defineStore('auth', () => {
  const session = readSession()
  const user = ref<SessionUser | null>(session.user)
  const logged = ref(hasSession())
  const logging = ref(false)

  const displayName = computed(() => user.value?.username || '未登录')
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string): Promise<void> {
    logging.value = true
    try {
      const deviceId = getOrCreateDeviceId()
      const meta = getDeviceMeta()
      const res = await apiLogin({
        username: username.trim(),
        password,
        device: { id: deviceId, name: meta.name, platform: meta.platform },
      })

      writeSession({
        token: res.access_token,
        refreshToken: res.refresh_token || '',
        // 服务端返回的 device_id 与本地生成的一致；以服务端为准，避免两边漂移
        deviceId: res.device_id || deviceId,
        deviceSecret: res.device_secret || '',
        user: res.user,
      })

      user.value = res.user
      logged.value = true
      // 界面偏好跟账号走：登录后拉一次并应用（失败不挡登录）
      try {
        const prefs = await getPrefs()
        applyServerTheme(prefs?.theme)
      } catch {
        /* 偏好拿不到就用本地缓存 */
      }
    } finally {
      logging.value = false
    }
  }

  function logout(): void {
    // 先把 refresh_token 交给服务端吊销本设备，再清本地；网络失败也照常退出
    const session = readSession()
    if (session?.refreshToken) {
      void logoutApi(session.refreshToken).catch(() => undefined)
    }
    clearSession()
    user.value = null
    logged.value = false
  }

  /** DEVICE_MISMATCH 时清干净，避免拿着死凭证反复 401 */
  function handleFatal(err: unknown): boolean {
    if (err instanceof ApiError && err.code === 'DEVICE_MISMATCH') {
      logout()
      return true
    }
    return false
  }

  return { user, logged, logging, displayName, isAdmin, login, logout, handleFatal }
})

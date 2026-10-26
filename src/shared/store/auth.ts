import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin } from '../api/auth'
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
    } finally {
      logging.value = false
    }
  }

  function logout(): void {
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

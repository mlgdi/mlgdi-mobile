/**
 * 主题：**仅本地**存储，不写账号。
 *
 * 这是与 Web 端刻意的差异：Web 的界面偏好跟账号走（`users.ui_prefs`），
 * 但移动端 App 是「一个人的手机」，跟随系统 + 手动三态就够，
 * 不必让手机上的深色偏好反过来改掉网页端。
 */
import { ref } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'garden.theme'
export const themeMode = ref<ThemeMode>('system')
export const resolvedTheme = ref<'light' | 'dark'>('light')

function readMode(): ThemeMode {
  try {
    const raw = String(uni.getStorageSync(KEY) || '')
    return raw === 'light' || raw === 'dark' || raw === 'system' ? (raw as ThemeMode) : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme(): 'light' | 'dark' {
  // #ifdef APP-PLUS
  try {
    const info = uni.getSystemInfoSync()
    if (info.theme === 'dark') return 'dark'
    if (info.theme === 'light') return 'light'
  } catch {
    /* ignore */
  }
  // #endif
  // #ifdef H5
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  // #endif
  return 'light'
}

export function recomputeTheme(): void {
  resolvedTheme.value = themeMode.value === 'system' ? systemTheme() : themeMode.value
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode
  try {
    uni.setStorageSync(KEY, mode)
  } catch {
    /* ignore */
  }
  recomputeTheme()
}

export function initTheme(): void {
  themeMode.value = readMode()
  recomputeTheme()
  // 系统在 App 里切换深浅色时跟着走（仅 system 模式下有意义）
  try {
    uni.onThemeChange?.((res: any) => {
      if (themeMode.value === 'system' && res && res.theme) {
        resolvedTheme.value = res.theme === 'dark' ? 'dark' : 'light'
      }
    })
  } catch {
    /* 平台不支持就算了 */
  }
}

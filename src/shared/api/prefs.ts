import { request } from './client'

/** 界面偏好（跟账号走）。字段与 Web 端 users.ui_prefs 共用一个结构。 */
export interface UiPrefs {
  theme?: 'system' | 'light' | 'dark'
  accent?: string
  font?: number
  layout?: string
}

export function getPrefs(): Promise<UiPrefs> {
  return request({ path: '/api/v1/auth/prefs', silent: true })
}

export function savePrefs(prefs: UiPrefs): Promise<{ ok: boolean }> {
  // 切主题/字号顺手回写，属于背景同步：为它闪一个 loading 太吵
  return request({ method: 'PUT', path: '/api/v1/auth/prefs', body: prefs, silent: true })
}

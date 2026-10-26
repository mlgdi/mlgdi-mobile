/**
 * 登录态与设备凭证的本地存取。
 *
 * 两条硬约束：
 * 1. **所有凭证键都带服务器指纹**——切服不串 token；
 * 2. `device_secret` 是长期 JWT 的绑定凭证（服务端只存 sha256），
 *    丢了等于要重新登录，所以它必须和 token 存在一起，且不能进日志。
 *
 * 存储介质选择：App 端后续接入 iOS Keychain（见 docs 方案 3.2），
 * 当前版本先用 uni 的本地存储，属于已知的安全欠账，不在首版阻塞。
 */
import { serverFingerprint } from '../config/server'

const TOKEN = 'garden.auth.token'
const REFRESH = 'garden.auth.refresh'
const DEVICE_ID = 'garden.auth.deviceId'
const DEVICE_SECRET = 'garden.auth.deviceSecret'
const USER = 'garden.auth.user'

export interface SessionUser {
  id: string
  username: string
  email?: string
  role: string
  preferred_lang?: string
}

export interface Session {
  token: string
  refreshToken: string
  deviceId: string
  deviceSecret: string
  user: SessionUser | null
}

function scoped(key: string): string {
  return `${key}@${serverFingerprint()}`
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = uni.getStorageSync(scoped(key))
    return raw === '' || raw === null || raw === undefined ? fallback : (raw as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    uni.setStorageSync(scoped(key), value)
  } catch {
    /* 存储满了/被禁用了：宁可只影响当前会话，也不要让页面崩掉 */
  }
}

export function readSession(): Session {
  return {
    token: String(read(TOKEN, '')),
    refreshToken: String(read(REFRESH, '')),
    deviceId: String(read(DEVICE_ID, '')),
    deviceSecret: String(read(DEVICE_SECRET, '')),
    user: read<SessionUser | null>(USER, null),
  }
}

export function writeSession(session: Partial<Session>): void {
  if (session.token !== undefined) write(TOKEN, session.token)
  if (session.refreshToken !== undefined) write(REFRESH, session.refreshToken)
  if (session.deviceId !== undefined) write(DEVICE_ID, session.deviceId)
  if (session.deviceSecret !== undefined) write(DEVICE_SECRET, session.deviceSecret)
  if (session.user !== undefined) write(USER, session.user)
}

export function clearSession(): void {
  for (const key of [TOKEN, REFRESH, DEVICE_ID, DEVICE_SECRET, USER]) {
    try {
      uni.removeStorageSync(scoped(key))
    } catch {
      /* ignore */
    }
  }
}

export function hasSession(): boolean {
  return Boolean(readSession().token)
}

/**
 * 设备标识：安装周期内稳定，用于服务端登记设备。
 * 不放进按服务器隔离的命名空间——同一台设备在多个服务器上复用同一个 id 没有副作用，
 * 反而便于日后排查「这台机器连过哪些环境」。
 */
export function getOrCreateDeviceId(): string {
  const KEY = 'garden.device.id'
  try {
    const existing = String(uni.getStorageSync(KEY) || '')
    if (existing) return existing
  } catch {
    /* fall through */
  }
  const created = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    uni.setStorageSync(KEY, created)
  } catch {
    /* ignore */
  }
  return created
}

/** 上报给服务端做设备列表展示用，取不到就留空。 */
export function getDeviceMeta(): { name: string; platform: string } {
  try {
    const info = uni.getSystemInfoSync()
    const platform = String(info.platform || '').toLowerCase()
    const normalized =
      platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : platform || 'unknown'
    const model = String(info.model || '')
    return { name: model ? `${info.brand ? info.brand + ' ' : ''}${model}` : '移动端', platform: normalized }
  } catch {
    return { name: '移动端', platform: 'unknown' }
  }
}

/** 接口层：只做「路径 + 类型」，不掺业务判断。影响端范围：全端。 */
import { request } from './client'
import type { SessionUser } from '../auth/session'

export interface LoginPayload {
  username: string
  password: string
  device: { id: string; name: string; platform: string }
}

export interface LoginResult {
  access_token: string
  refresh_token: string
  device_id?: string
  device_secret?: string
  expires_in?: number
  user: SessionUser
}

export function login(payload: LoginPayload): Promise<LoginResult> {
  // 登录按钮自己有 submitting 状态
  return request<LoginResult>({
    method: 'POST',
    path: '/api/v1/auth/login',
    body: payload,
    auth: false,
    silent: true,
  })
}

/** 退出登录：把 refresh_token 交回服务端，它会吊销本设备（之后的请求 401） */
export function logout(refreshToken: string | null): Promise<{ ok: boolean; device_revoked: boolean }> {
  return request({ method: 'POST', path: '/api/v1/auth/logout', body: { refresh_token: refreshToken } })
}

export function me(): Promise<SessionUser & { device_id?: string | null }> {
  return request({ path: '/api/v1/auth/me', silent: true })
}

export interface DeviceRow {
  id: string
  name: string
  platform: string
  created_at: string
  last_seen_at: string | null
  current: boolean
}

export function listDevices(): Promise<{ devices: DeviceRow[] }> {
  return request({ path: '/api/v1/auth/devices', silent: true })
}

export function revokeDevice(id: string): Promise<{ ok: boolean }> {
  return request({ method: 'DELETE', path: `/api/v1/auth/devices/${encodeURIComponent(id)}` })
}

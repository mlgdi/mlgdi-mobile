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
  return request<LoginResult>({ method: 'POST', path: '/api/v1/auth/login', body: payload, auth: false })
}

export function me(): Promise<SessionUser & { device_id?: string | null }> {
  return request({ path: '/api/v1/auth/me' })
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
  return request({ path: '/api/v1/auth/devices' })
}

export function revokeDevice(id: string): Promise<{ ok: boolean }> {
  return request({ method: 'DELETE', path: `/api/v1/auth/devices/${encodeURIComponent(id)}` })
}

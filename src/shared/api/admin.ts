/** 站点管理接口（admin）。Web 设置页「站点 / 栏目」两个 tab 的同款后端。 */
import { request } from './client'

export interface AdminSub {
  path: string
  name: string
  [key: string]: unknown
}

export interface AdminColumn {
  code: string
  name: string
  path: string
  desc: string
  brief: string
  order: number
  subs: AdminSub[]
}

export interface AdminFull {
  name: string
  tagline: string
  description: string
  author: string
  icp: string
  page_size: number
  items: AdminColumn[]
  entry: Record<string, unknown>
}

/** 品牌字段 + 全部栏目（含小类） */
export function adminColumns(): Promise<AdminFull> {
  return request({ path: '/api/v1/admin/columns' })
}

/** 只保存站点品牌字段（栏目原样保留，不会互相覆盖） */
export function saveSite(body: {
  name: string
  tagline: string
  description: string
  author: string
  icp: string
  page_size?: number
}): Promise<{ ok: boolean; message?: string }> {
  return request({ method: 'PUT', path: '/api/v1/admin/site', body })
}

/** 只保存栏目与小类配置（品牌字段原样保留） */
export function saveColumns(items: AdminColumn[]): Promise<{ ok: boolean; message?: string }> {
  return request({ method: 'PUT', path: '/api/v1/admin/columns', body: { items } })
}

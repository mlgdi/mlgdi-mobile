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

/* ---------------- AI 引擎与工作流（admin） ---------------- */

export interface AdminAi {
  workflow_engine: string
  llm_api_base: string
  llm_model: string
  llm_image_model: string
  llm_timeout: number
  has_key: boolean
  key_hint: string
}

export interface AdminAiTestResult {
  ok: boolean
  latency_ms?: number
  reply?: string
  reason?: string
}

export interface AdminWorkflow {
  key: string
  name: string
  description: string
  prompt: string
  scope: string
  enabled: boolean
  builtin: boolean
}

export function adminAi(): Promise<AdminAi> {
  return request({ path: '/api/v1/admin/ai' })
}

/** 密钥传空 = 保持原值（后端不明文回传，前端也不该回传） */
export function saveAdminAi(body: {
  workflow_engine?: string
  llm_api_base?: string
  llm_model?: string
  llm_image_model?: string
  llm_timeout?: number
  llm_api_key?: string
}): Promise<{ ok: boolean; message?: string }> {
  return request({ method: 'PUT', path: '/api/v1/admin/ai', body })
}

export function testAdminAi(): Promise<AdminAiTestResult> {
  return request({ method: 'POST', path: '/api/v1/admin/ai/test' })
}

export function adminWorkflows(): Promise<{ engine: string; items: AdminWorkflow[] }> {
  return request({ path: '/api/v1/admin/workflows' })
}

/** 整份回写 workflows.yaml（原子写 + 立即热加载） */
export function saveWorkflows(items: AdminWorkflow[]): Promise<{ ok: boolean; message?: string }> {
  return request({ method: 'PUT', path: '/api/v1/admin/workflows', body: { items } })
}

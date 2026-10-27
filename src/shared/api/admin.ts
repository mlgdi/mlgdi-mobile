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

/* ---------------- 小类（目录）增删改查 ---------------- */

/** 磁盘上的一个子目录。`alias` 是 site.yaml 里的显示名（空 = 用目录名） */
export interface AdminSubDir {
  /** 目录名（物理） */
  name: string
  /** 栏目内全路径，如 03_Articles/深度思考/推理链 */
  path: string
  alias: string
  /** 空目录（可以安全删除） */
  empty: boolean
  /** 直接下级目录数 */
  child_count: number
  has_children: boolean
}

/** 列某个目录的直接子目录。parent 可以是栏目根，也可以是任意层级的小类 */
export function listSubs(parent: string): Promise<{ items: AdminSubDir[]; column: string }> {
  return request({ path: '/api/v1/admin/subs', query: { parent } })
}

/** 新建小类目录（parent 任意层级，mkdir 不写文件） */
export function createSub(parent: string, name: string): Promise<{ ok: boolean; path: string }> {
  return request({ method: 'POST', path: '/api/v1/admin/subs', body: { parent, name } })
}

/** 删除小类目录（只允许空目录；非空一律拒绝） */
export function deleteSub(path: string): Promise<{ ok: boolean }> {
  return request({ method: 'DELETE', path: '/api/v1/admin/subs', query: { path } })
}

/** 改显示名（只写 site.yaml 呈现层，不动磁盘） */
export function setSubAlias(
  path: string,
  name: string,
): Promise<{ ok: boolean; name: string; message?: string }> {
  return request({ method: 'PATCH', path: '/api/v1/admin/subs', body: { path, name } })
}

/**
 * 重命名**目录本身**（物理改名）。会打断正文里指向旧路径的双链——
 * 后端只搬目录 + 同步 site.yaml，绝不改正文，所以前端必须先让用户确认。
 */
export function renameSubDir(
  path: string,
  name: string,
): Promise<{ ok: boolean; path: string; message?: string }> {
  return request({ method: 'POST', path: '/api/v1/admin/subs/rename', body: { path, name } })
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

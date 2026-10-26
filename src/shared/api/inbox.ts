/** 碎片箱接口。影响端范围：App / H5（小程序端不提供写入能力）。 */
import { request } from './client'

export type SourceType = 'text' | 'url' | 'image' | 'voice'
export type InboxStatus = 'captured' | 'queued' | 'processed' | 'merged' | 'archived'

export interface InboxItem {
  id: string
  content: string
  excerpt: string
  source_type: SourceType
  source_meta: Record<string, unknown>
  status: InboxStatus
  doc_id: string | null
  digest_batch_id: string | null
  created_at: string
  doc_status?: string | null
  doc_visibility?: string | null
  doc_slug?: string | null
}

export interface CapturePayload {
  content: string
  source_type?: SourceType
  source_url?: string
  source_meta?: Record<string, unknown>
  /** data URL 或裸 base64，最多 4 张 */
  images?: string[]
}

export function capture(payload: CapturePayload): Promise<{ item?: InboxItem; duplicate?: boolean }> {
  return request({
    method: 'POST',
    path: '/api/v1/inbox/capture',
    body: { source_type: 'text', ...payload },
  })
}

export function items(status?: InboxStatus, limit = 50): Promise<{ items: InboxItem[]; total: number }> {
  return request({ path: '/api/v1/inbox/items', query: { status, limit } })
}

export function removeItem(id: string): Promise<{ ok: boolean }> {
  return request({ method: 'DELETE', path: `/api/v1/inbox/items/${encodeURIComponent(id)}` })
}

export interface DispatchResult {
  doc_id?: string
  doc?: { id: string }
  duplicate?: boolean
  task_type?: string
  [key: string]: unknown
}

/** 整理成文：1 条=碎片成文，≥2 条=分节合并。同步返回 doc_id。 */
export function dispatch(itemIds: string[], hints?: Record<string, unknown>): Promise<DispatchResult> {
  return request({
    method: 'POST',
    path: '/api/v1/inbox/dispatch',
    body: { item_ids: itemIds, hints: hints || null },
  })
}

/** 归档：把草稿从收集箱挪到正式目录 */
export function archive(docId: string, targetDir: string): Promise<{ [key: string]: unknown }> {
  return request({
    method: 'POST',
    path: '/api/v1/inbox/archive',
    body: { doc_id: docId, target_dir: targetDir },
  })
}

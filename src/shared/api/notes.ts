/** 内容接口。影响端范围：全端。 */
import { request } from './client'

export interface DocBrief {
  id: string
  path: string
  title: string
  slug: string | null
  doc_type: string
  template: string
  status: string
  visibility: string
  lang: string
  word_count: number
  excerpt: string
  cover_image: string
  pinned: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface TreeNode {
  path: string
  name: string
  folders: TreeNode[]
  docs: DocBrief[]
}

export interface DocDetail extends DocBrief {
  body: string
  backlinks: Array<{ id: string; title: string; path: string }>
  frontmatter?: Record<string, unknown>
}

export function tree(): Promise<{ roots: TreeNode[] }> {
  return request({ path: '/api/v1/notes/tree' })
}

export function doc(id: string): Promise<DocDetail> {
  return request({ path: '/api/v1/notes/doc', query: { id } })
}

export interface SearchHit {
  id: string
  title: string
  path: string
  snippet: string
}

export interface SearchResult {
  query: string
  terms: string[]
  total: number
  items: SearchHit[]
}

export function search(q: string, limit = 20): Promise<SearchResult> {
  return request({ path: '/api/v1/search', query: { q, limit } })
}

// ---------------------------------------------------------------------------
// 写入：新建 / 导入 / 改正文 / 改元数据 / 发布
// ---------------------------------------------------------------------------

export interface CreateDocPayload {
  dir: string
  title: string
  slug?: string
  template?: 'post' | 'stream' | 'booklet'
  tags?: string[]
  visibility?: 'private' | 'member' | 'public'
  lang?: string
  /** 整份 Markdown 文本（导入 .md 用）。自带 front-matter 会被服务端剥离。 */
  body?: string
}

export function createDoc(payload: CreateDocPayload): Promise<{ doc: DocDetail }> {
  return request({ method: 'POST', path: '/api/v1/notes/doc', body: payload })
}

/**
 * 保存正文。`base_version` 是乐观锁：与当前版本不符会返回 409
 * `DOC_VERSION_CONFLICT`（detail.current_version 给最新版本号），
 * **绝不覆盖**——Obsidian 那边可能刚改过同一篇。
 */
export function updateBody(
  id: string,
  body: string,
  baseVersion?: number,
): Promise<{ doc: DocDetail }> {
  return request({
    method: 'PUT',
    path: '/api/v1/notes/doc',
    query: { id },
    body: { body, base_version: baseVersion ?? null },
  })
}

export interface MetaPatchPayload {
  title?: string
  status?: 'draft' | 'reviewed' | 'published'
  visibility?: 'private' | 'member' | 'public'
  template?: 'post' | 'stream' | 'booklet'
  tags?: string[]
  pinned?: boolean
  base_version?: number
}

export function patchMeta(id: string, patch: MetaPatchPayload): Promise<{ doc: DocDetail }> {
  return request({ method: 'PATCH', path: '/api/v1/notes/meta', query: { id }, body: patch })
}

export function publishDoc(
  id: string,
  opts: { status?: string; visibility?: string; base_version?: number } = {},
): Promise<{ doc: DocDetail }> {
  return request({
    method: 'POST',
    path: '/api/v1/notes/publish',
    query: { id },
    body: { status: opts.status || 'published', visibility: opts.visibility || 'public', base_version: opts.base_version ?? null },
  })
}

export function deleteDoc(id: string): Promise<{ ok?: boolean }> {
  return request({ method: 'DELETE', path: '/api/v1/notes/doc', query: { id } })
}

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

/**
 * 反链。
 *
 * 注意结构是 `{ incoming, outgoing }` 两个方向，**不是数组**。
 * 早期把它当成数组，`backlinks.length` 恰好等于 2（两个 key），
 * 于是每篇文章都显示「2 条反链」——数据一直错，界面上看不出来。
 */
export interface IncomingLink {
  doc_id: string
  title: string
  path: string
  /** 引用处的原文片段，用于在反链列表里展示上下文 */
  context?: string
  link_type?: string
}

export interface OutgoingLink {
  target: string
  link_type: string
  resolved: boolean
  doc_id?: string | null
  title?: string
  path?: string
}

export interface DocLinks {
  incoming: IncomingLink[]
  outgoing: OutgoingLink[]
}

export interface DocDetail extends DocBrief {
  body: string
  backlinks: DocLinks
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
  /**
   * 封面：vault 相对路径（`Assets/xxx.png`）或外链。
   * 上传接口返回的 `path` 就是要存的值，**不是 `url`**——`url` 是资产端点的临时地址，
   * 存进去将来换域名就全废了。
   */
  cover_image?: string
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

// ---------------------------------------------------------------------------
// 目录 / 移动 / 归档
// ---------------------------------------------------------------------------

export interface VaultDir {
  /** vault 相对路径，如 `03_Articles/AI` */
  path: string
  /** 最后一个路径段，磁盘真实名字 */
  name: string
  /** site.yaml 里登记的显示名，没有则为空串 */
  alias: string
}

/**
 * 可选目录列表：**磁盘真实目录，含空目录**。
 *
 * 不能用 `tree()` 的目录树代替 —— 树只含有文章的目录，刚建好的空小类
 * 恰恰最需要出现在「移到这里」的列表里。
 */
export function dirs(): Promise<{ items: VaultDir[] }> {
  return request({ path: '/api/v1/notes/dirs' })
}

/**
 * 移动：纯文件级移动，`targetPath` **必须带文件名**。
 *
 * 服务端不做「帮我补文件名」这种体贴，因为它是文件操作的直通口；
 * 目录 + '/原名' 由调用方拼。
 */
export function moveDoc(
  source: string,
  targetPath: string,
  baseVersion?: number,
): Promise<{ doc: DocBrief; message: string }> {
  return request({
    method: 'POST',
    path: '/api/v1/notes/move',
    body: { source, target_path: targetPath, base_version: baseVersion ?? null },
  })
}

/**
 * 归档：只对 `00_Inbox/` 下的草稿有效（服务端强校验），
 * 除了挪目录，还会把这篇草稿收编的碎片一起标记归档。
 */
export function archiveDoc(
  id: string,
  targetDir: string,
): Promise<{ doc: DocBrief; items_archived: number; message: string }> {
  return request({
    method: 'POST',
    path: '/api/v1/inbox/archive',
    body: { doc_id: id, target_dir: targetDir },
  })
}

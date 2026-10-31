/** 站点品牌信息（名称、标语、简介）。数据源：.garden/site.yaml，后端热加载。 */
import { request } from './client'

export interface SiteSub {
  path: string
  name?: string
}

export interface SiteColumn {
  code: string
  name: string
  path: string
  desc?: string
  brief?: string
  /** 子类的显示名。name 为空时回退到目录名 */
  subs?: SiteSub[]
}

export interface SiteInfo {
  name?: string
  tagline?: string
  description?: string
  author?: string
  columns?: SiteColumn[]
  /** 站点是否允许游客浏览（后端 garden.yaml 的 guest_mode，默认 true） */
  guest_mode?: boolean
  /** = !guest_mode。站点主关了游客模式时才需要强制登录 */
  login_required?: boolean
  /** 游客是否看不到草稿（更严格的公开口径） */
  guest_hide_drafts?: boolean
  /** 游客可见的文档数，首页概况用得上 */
  public_documents?: number
}

export function site(): Promise<SiteInfo> {
  // 启动与首页都会拉，界面自己会渲染，不该弹浮层
  return request({ path: '/api/v1/site', silent: true })
}

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
}

export function site(): Promise<SiteInfo> {
  return request({ path: '/api/v1/site' })
}

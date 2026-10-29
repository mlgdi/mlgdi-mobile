/**
 * 分享链接的口径，两处（复制链接 / 分享图二维码）必须一致。
 */
import type { DocBrief } from '../api/notes'

/** 公开且已发布 → 才有对外链接。其它情况给需要登录的内部链接 */
export function isPublicShare(d: DocBrief | null | undefined): boolean {
  return Boolean(d && d.slug && d.visibility === 'public' && d.status === 'published')
}

/**
 * 分享用的链接。
 *
 * **必须 encodeURI**：slug 里常带中文（`/p/2026-10-27-25条识人处世智慧`），
 * 微信等 IM 只把 ASCII 当 URL 字符，遇到第一个汉字就断开 —— 只有
 * `…/p/2026-10-27-25` 能被点开。编码后整条都是 `%E6%9D%A1…` 这种 ASCII，
 * 粘贴到哪里都不会被截断，浏览器打开时自动解码（后端路由不受影响）。
 *
 * 同一份字符串也进二维码：印在纸上被相机识别时，中文同样容易被
 * 某些扫码器截断，统一成编码形态更稳。
 */
export function shareUrlOf(d: DocBrief | null | undefined, baseUrl: string): string {
  if (!d) return ''
  const base = (baseUrl || '').replace(/\/$/, '')
  if (isPublicShare(d)) return encodeURI(`${base}/p/${d.slug}`)
  return `${base}/doc/${d.id}`
}

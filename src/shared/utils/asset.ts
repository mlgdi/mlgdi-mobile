/**
 * 资产地址收敛。
 *
 * Web 端的教训：vault 相对路径（`Assets/x.png`）直接塞进 `<img src>` 会被解析成
 * 相对 URL 而 404。移动端同样只能走资产端点，所以所有图片/封面都必须经过这里。
 */
import { getBaseUrl, normalizeBaseUrl } from '../config/server'

export function assetUrl(path: string): string {
  const raw = (path || '').trim()
  if (!raw) return ''
  // 已经是绝对地址（外链图床）就直通
  if (/^https?:\/\//i.test(raw)) return raw
  // 兜底：协议相对
  if (raw.startsWith('//')) return `https:${raw}`
  const base = normalizeBaseUrl(getBaseUrl())
  return `${base}/api/v1/assets?path=${encodeURIComponent(raw.replace(/^\/+/, ''))}`
}

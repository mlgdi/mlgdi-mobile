/**
 * 时间显示：列表、文章页、分享图共用一套口径（`2026-10-29 11:30`）。
 *
 * 后端给的是 `YYYY-MM-DD HH:MM:SS`（空格分隔），iOS 的 `new Date()` 对
 * 空格分隔的字符串解析不可靠，必须先换成 `T`；解析失败就退回截取日期部分，
 * 不把 `Invalid Date` 摆到界面上。
 */
export function formatDate(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`
}

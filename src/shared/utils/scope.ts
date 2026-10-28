/**
 * 归属的显示层级：把文档路径拆成「栏目之下」的逐层小类。
 *
 * `03_Articles/AI/检索/xxx.md` → [{ key: 'AI', label: 'AI' }, { key: '检索', label: '检索' }]
 *
 * - 第一段是栏目根目录（`03_Articles`），最后一段是文件名，都剥掉；
 * - label 优先取 site.yaml 登记过的小类名（alias），没登记就用目录名；
 * - key 永远是真实目录名，用来和「当前选中的小类」做比较（别拿 alias 比，
 *   两者不一致时会把该去掉的那层留下来）。
 */
export function subLevels(
  path: string,
  aliases: Record<string, string>,
): Array<{ key: string; label: string }> {
  const parts = (path || '').split('/').filter(Boolean)
  if (parts.length <= 2) return [] // 只有「栏目/文件名」，没有小类
  const root = parts[0]
  const dirs = parts.slice(1, -1)

  const out: Array<{ key: string; label: string }> = []
  let acc = root
  for (const dir of dirs) {
    acc = `${acc}/${dir}`
    out.push({ key: dir, label: aliases[acc] || dir })
  }
  return out
}

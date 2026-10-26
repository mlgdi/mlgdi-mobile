/**
 * Markdown 渲染（markdown-it + mp-html）。
 *
 * 与 Web 端保持同一套语义：
 * - `[[目标]]` / `[[目标|别名]]` → 站内文档链接（href 用 `garden://doc/...` 协议，
 *   由页面在 linktap 里拦截后按标题查 id 跳转）
 * - `![[图.png]]` → 图片（走资产端点）
 * - 普通图片的相对路径同样走 assetUrl
 *
 * 不启用 `html: true`：vault 里的原文可能带任意 HTML，
 * Web 端也不放行，移动端更没必要开这个口子。
 */
import MarkdownIt from 'markdown-it'
import { assetUrl } from './asset'

export const WIKILINK_SCHEME = 'garden://doc/'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

/** `[[目标]]`、`[[目标|别名]]`、`[[目标#锚点]]` */
md.inline.ruler.before('link', 'garden_wikilink', (state, silent) => {
  const start = state.pos
  const src = state.src
  if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false

  const end = src.indexOf(']]', start + 2)
  if (end < 0) return false

  const inner = src.slice(start + 2, end)
  if (!inner || inner.length > 200 || inner.includes('[') || inner.includes('\n')) return false

  if (!silent) {
    const [targetRaw, alias] = inner.split('|')
    const target = targetRaw.split('#')[0].trim()
    const label = (alias || targetRaw).trim()

    const open = state.push('link_open', 'a', 1)
    open.attrs = [
      ['href', WIKILINK_SCHEME + encodeURIComponent(target)],
      ['class', 'garden-wikilink'],
    ]
    const text = state.push('text', '', 0)
    text.content = label
    state.push('link_close', 'a', -1)
  }

  state.pos = end + 2
  return true
})

/** `![[文件]]`（Obsidian 嵌入）：图片按资产解析，其他类型先退化成链接文字 */
const embedRe = /!\[\[([^\]\n]{1,200})\]\]/g
md.inline.ruler.before('link', 'garden_embed', (state, silent) => {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x21 /* ! */) return false
  if (state.src.slice(start, start + 3) !== '![[') return false

  const end = state.src.indexOf(']]', start + 3)
  if (end < 0) return false

  const name = state.src.slice(start + 3, end).trim()
  if (!name) return false

  if (!silent) {
    const isImage = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name)
    if (isImage) {
      const token = state.push('image', 'img', 0)
      token.attrs = [
        ['src', assetUrl(`Assets/${name}`)],
        ['alt', name],
      ]
      token.children = []
      token.content = name
    } else {
      const open = state.push('link_open', 'a', 1)
      open.attrs = [['href', WIKILINK_SCHEME + encodeURIComponent(name)]]
      const text = state.push('text', '', 0)
      text.content = name
      state.push('link_close', 'a', -1)
    }
  }

  state.pos = end + 2
  return true
})

/** 普通图片：相对路径一律走资产端点 */
const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const srcIndex = token.attrIndex('src')
  if (srcIndex >= 0 && token.attrs) {
    token.attrs[srcIndex][1] = assetUrl(token.attrs[srcIndex][1])
  }
  return defaultImage
    ? defaultImage(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

/** 外链统一新窗口语义由宿主决定，这里只补 target，避免 WebView 内跳走 */
const defaultLink = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') || ''
  if (/^https?:\/\//i.test(href)) {
    token.attrSet('class', 'garden-external')
  }
  return defaultLink
    ? defaultLink(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

export function renderMarkdown(body: string): string {
  return md.render(body || '')
}

/** 从 `garden://doc/xxx` 里取出目标标题（解码后） */
export function parseWikilinkHref(href: string): string | null {
  if (!href || !href.startsWith(WIKILINK_SCHEME)) return null
  try {
    return decodeURIComponent(href.slice(WIKILINK_SCHEME.length))
  } catch {
    return href.slice(WIKILINK_SCHEME.length)
  }
}

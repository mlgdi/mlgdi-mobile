/**
 * Markdown 渲染（markdown-it + v-html）。
 *
 * 与 Web 端保持同一套语义（`frontend/src/markdown/index.ts`）：
 * - `[[目标]]` / `[[目标|别名]]` → 站内文档链接
 * - `![[图.png]]` → 图片（走资产端点）
 * - 普通图片的相对路径同样走 assetUrl
 *
 * 两个与 Web 对齐的关键配置：
 * - `breaks: false`：Web 端是 false，此前这里是 true —— 同一篇笔记在手机上
 *   每行都断、在网页上合段，是最刺眼的「两端不一致」。
 * - `html: false`：vault 里的原文可能带任意 HTML，Web 端也不放行。
 *
 * 为什么输出 `data-wl` / `data-ext` 而不是 href：
 * 正文用 v-html 渲染（需要 CSS 排版，mp-html 的 rich-text 在 App 端不认页面 CSS），
 * 真实的 `<a href>` 在 webview 里会触发系统跳转。改成 data 属性后，
 * 点击由页面统一委托处理：站内按标题解析 id，站外复制链接。
 */
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { assetUrl } from './asset'

export const WIKILINK_SCHEME = 'garden://doc/'

export interface TocItem {
  level: number
  text: string
  id: string
}

/** 与后端 assets.py 的 VIDEO_EXT、Web 端 VIDEO_EXT_RE 保持同一份清单 */
const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mov|ogg)$/i

export interface RenderResult {
  html: string
  toc: TocItem[]
  /** 代码块原文，按 fence 出现顺序；复制按钮靠下标取，避免把全文塞进 data 属性 */
  codes: string[]
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
})

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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

    const open = state.push('html_inline', '', 0)
    open.content = `<a class="garden-wikilink" data-wl="${esc(encodeURIComponent(target))}">${esc(
      label,
    )}</a>`
  }

  state.pos = end + 2
  return true
})

/** `![[文件]]`（Obsidian 嵌入）：图片按资产解析，其他类型先退化成链接文字 */
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
    const isVideo = VIDEO_EXT_RE.test(name)
    const token = state.push('html_inline', '', 0)
    if (isVideo) {
      // 与 Web 端同一个约定：嵌入视频渲染成原生 video，不当作双链
      token.content = `<video class="md-video" src="${esc(assetUrl(`Assets/${name}`))}" controls preload="metadata" playsinline></video>`
    } else {
      token.content = isImage
        ? `<img class="md-img" src="${esc(assetUrl(`Assets/${name}`))}" alt="${esc(name)}" />`
        : `<a class="garden-wikilink" data-wl="${esc(encodeURIComponent(name))}">${esc(name)}</a>`
    }
  }

  state.pos = end + 2
  return true
})

/**
 * 标题：加锚点 id 并收集目录。
 *
 * id 用序号（`sec-3`）而不是标题 slug：中文标题转 slug 会得到一长串百分号编码，
 * 既难读也容易撞车；目录只关心「第几个标题」，序号最稳。
 */
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const inline = tokens[idx + 1]
  const text = ((inline && inline.content) || '').replace(/\s+/g, ' ').trim()
  const envObj = env as { toc?: TocItem[] }
  if (!envObj.toc) envObj.toc = []
  const id = `sec-${envObj.toc.length + 1}`
  token.attrSet('id', id)
  if (text) envObj.toc.push({ level: Number(token.tag.slice(1)), text, id })
  return self.renderToken(tokens, idx, options)
}

/**
 * 代码块：hljs 高亮 + 语言标签 + 复制。
 *
 * 与 Web 的差异：**不做行号**。手机上代码本来就横向滚动，行号列会再吃掉 40rpx
 * 的可用宽度，而「第几行」在移动阅读里几乎没有用；语言和复制才是真需要的。
 * 配色沿用 `src/styles/hljs.css`（从 Web 的 hljs-vscode.css 转换，token 颜色一致）。
 */
md.renderer.rules.fence = (tokens, idx, options, env) => {
  const token = tokens[idx]
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text'
  const code = token.content.replace(/\n$/, '')
  const envObj = env as { codes?: string[] }
  if (!envObj.codes) envObj.codes = []
  const codeIndex = envObj.codes.push(code) - 1

  let inner = esc(code)
  if (lang && hljs.getLanguage(lang)) {
    try {
      inner = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      /* 高亮失败回落纯文本 */
    }
  }

  return (
    `<div class="md-code"><div class="md-code-head">` +
    `<span class="md-code-lang">${esc(lang)}</span>` +
    `<span class="md-code-copy" data-code="${codeIndex}">复制</span>` +
    `</div><pre class="hljs"><code>${inner}</code></pre></div>`
  )
}

/** 表格包一层滚动容器：手机上宽表必须能横向滑，`table` 自身设 overflow 无效 */
md.renderer.rules.table_open = () => '<div class="md-table">\n<table>\n'
md.renderer.rules.table_close = () => '</table>\n</div>\n'

/** 普通图片：相对路径一律走资产端点，并加统一 class 便于排版 */
const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const raw = token.attrGet('src') || ''

  // `![](Assets/x.mp4)` 这种写法在 Web 上会渲染成 video，这里必须对齐，
  // 否则同一篇笔记在两端一个是画面、一个是碎图图标。
  if (VIDEO_EXT_RE.test(raw)) {
    return `<video class="md-video" src="${esc(assetUrl(raw))}" controls preload="metadata" playsinline></video>`
  }

  const srcIndex = token.attrIndex('src')
  if (srcIndex >= 0 && token.attrs) {
    token.attrs[srcIndex][1] = assetUrl(token.attrs[srcIndex][1])
  }
  token.attrJoin('class', 'md-img')
  return defaultImage
    ? defaultImage(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

/** 外链：不跳浏览器，记在 data-ext 上由页面复制链接 */
const defaultLink = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') || ''
  if (/^https?:\/\//i.test(href)) {
    token.attrJoin('class', 'md-ext')
    token.attrSet('data-ext', href)
    token.attrSet('href', 'javascript:void(0)')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return defaultLink
    ? defaultLink(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

/** 中日韩汉字 + 全角标点。用于判断软换行两侧是否都是中文 */
const CJK = '\\u4e00-\\u9fa5\\u3000-\\u303f\\uff01-\\uff60\\uffe0-\\uffe6'

/**
 * 压缩中文软换行留下的空格。
 *
 * `breaks: false` 时 markdown 的软换行渲染成 `\n`，浏览器当空格处理：
 * 中文段落里就会出现「组织方式。 两个人」这种莫名其妙的分隔（英文需要空格，
 * 中文不需要）。这里只处理「中文 + 换行 + 中文」，且**跳过 pre/code**——
 * 代码块里的换行是有意义的。
 */
function tightenCjk(html: string): string {
  const seg = new RegExp(`([${CJK}])[ \\t]*\\n[ \\t]*([${CJK}])`, 'g')
  // 奇偶交替：split 带捕获组时，奇数下标是被保护的原样片段
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(seg, '$1$2')))
    .join('')
}

export function renderMarkdown(body: string): RenderResult {
  const env: { toc?: TocItem[]; codes?: string[] } = {}
  const html = tightenCjk(md.render(body || '', env))
  return { html, toc: env.toc || [], codes: env.codes || [] }
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

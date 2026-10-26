/**
 * 外部内容入口：剪贴板 + 外部分享（URL scheme）。
 *
 * 两个入口共同的原则：**内容先问再收**。
 * - 剪贴板：从后台切回前台时检测，有像样的内容就弹窗问「收进碎片箱？」。
 *   不再在页面上铺一块提示条——那个浮条压在列表上，内容全文可见，
 *   用户没点头就已经被展示了一遍，既碍眼又扰人。
 * - 分享：其它 App 通过 `mlgdi://capture?...` 把内容递进来（冷启动走启动参数，
 *   热启动走 `plus.runtime.arguments`），同样弹窗确认后投递。
 *
 * 弹窗确认是唯一的展示方式：用户点「投递」才落库，点「忽略」什么都不发生。
 */
import { capture } from '../api/inbox'
import { hasSession } from '../auth/session'
import { readClipboard } from './file'

/** 上一次问过的内容：同一段内容只在切换回来时问一次，不反复弹 */
let lastClip = ''

/**
 * 值不值得问：一个 URL，或一段 12~2000 字、带空白的有结构文本。
 * 单个词、超长纯文本（整页复制）都不弹——后者用户自己会去粘贴。
 */
export function looksUseful(text: string): boolean {
  return (
    /^https?:\/\/\S{6,}$/i.test(text) ||
    (text.length >= 12 && /\s/.test(text) && text.length < 2000)
  )
}

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text)
}

/** 弹窗里只露前 80 字：确认用的摘要，不是正文展示 */
function preview(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

async function doCapture(text: string): Promise<void> {
  try {
    await capture({
      content: text,
      source_type: isUrl(text) ? 'url' : 'text',
      source_url: isUrl(text) ? text : '',
    })
    uni.showToast({ title: '已收进碎片箱', icon: 'none' })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '投递失败', icon: 'none' })
  }
}

/** 确认弹窗：投递 or 忽略，没有第三种结局 */
function askCapture(text: string, from: string): void {
  uni.showModal({
    title: from === 'share' ? '收下这条分享？' : '收进碎片箱？',
    content: preview(text),
    cancelText: '忽略',
    confirmText: '投递',
    success: (res) => {
      if (res.confirm) void doCapture(text)
    },
  })
}

/**
 * 从后台切回前台：检测剪贴板。
 * 只在 App 端启用——H5 浏览器读剪贴板要么报错要么弹系统授权，得不偿失。
 */
export async function askClipboardIntake(): Promise<void> {
  // #ifdef APP-PLUS
  if (!hasSession()) return
  try {
    const text = (await readClipboard()).trim()
    if (!text || text === lastClip || !looksUseful(text)) return
    lastClip = text
    askCapture(text, 'clip')
  } catch {
    /* 读不到就算了，别为这个打扰用户 */
  }
  // #endif
}

/**
 * 外部分享 / scheme 打开：`mlgdi://capture?title=&text=&url=`
 *
 * - 冷启动：参数在 onShow 的 options 里？不在——scheme 的实参只在
 *   `plus.runtime.arguments`（冷热启动都是），所以统一从这里读。
 * - 只在 App 端有 plus；H5 / 小程序直接跳过。
 */
export function handleExternalOpen(): void {
  // #ifdef APP-PLUS
  const plusAny = (globalThis as any).plus
  const args: string = String(plusAny?.runtime?.arguments || '')
  if (!args.startsWith('mlgdi://')) return
  const text = parseSchemePayload(args)
  if (text) askCapture(text, 'share')
  // #endif
}

/** 把 scheme 的 query 参数拼成一条碎片文本；认不出的格式原样返回 query 值 */
function parseSchemePayload(raw: string): string {
  try {
    const url = new URL(raw.replace(/^mlgdi:\/\//i, 'http://x/'))
    const title = (url.searchParams.get('title') || '').trim()
    const text = (url.searchParams.get('text') || '').trim()
    const link = (url.searchParams.get('url') || '').trim()
    return [title, text, link].filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

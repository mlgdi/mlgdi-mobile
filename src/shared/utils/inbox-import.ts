/**
 * 接收「其他 App 分享过来的文件」。
 *
 * ## 为什么这条能通，而 share extension 只能走剪贴板
 *
 * App 在 Info.plist 里声明 `CFBundleDocumentTypes` 之后，用户在「文件」App 里
 * 长按 `.md` → 共享 / 用其他应用打开 → 渡己，**系统会把文件复制到本 App 沙箱的
 * `Documents/Inbox/`**，然后把 URL 交给 App。
 *
 * 这个目录属于我们自己：没有 security-scoped「只在回调期间可读」的限制，
 * 也不需要通过 App Group 跨进程交接（分享扩展是独立进程，沙箱不同，
 * 想写主 App 的目录会被拒，所以那边只能退到剪贴板）。
 *
 * 于是整条链路不需要任何 entitlement、不需要改 AppDelegate：
 *   系统复制文件 → 我们回前台时扫 Inbox → 弹选择框（碎片 / 文章）→ 处理后删文件。
 *
 * ## 为什么不用 openURL 回调
 *
 * 冷启动时 `application:openURL:` 里那个 URL 是 security-scoped 的，
 * 出了回调就可能失效；而 Inbox 里的副本一直都在。少一个原生补丁，
 * 也少一个「基座版本变了锚点对不上」的构建风险。
 */

import { log, logError } from './logger'
import { sandboxInbox } from './paths'
import {
  documentsDir,
  fileExists,
  listDir,
  nativeReady,
  readText,
  removeFileAt,
} from './native-fs'

export interface InboxDoc {
  /** 原始文件名（含扩展名） */
  name: string
  /** plus.io 路径，删除时用 */
  path: string
  /** 正文（已按 UTF-8 读入） */
  text: string
}

/** Inbox 里可能混入任何文件类型，只认文本类 */
const TEXT_EXT = /\.(md|markdown|mkd|txt|text)$/i

/** 单篇上限：Inbox 里出现几 MB 的文本，多半是用户选错了文件 */
const MAX_CHARS = 4 * 1024 * 1024

/**
 * 系统接收外来文件的位置：**`<sandbox>/Documents/Inbox/`**。
 *
 * 这个路径翻过两次车，写清楚免得再犯：
 * 1. 最早写的 `_doc/Inbox/` —— `_doc` 是 `Library/Pandora/apps/<appid>/doc`；
 * 2. 第二版换成 `_documents/Inbox/`（`plus.io.PUBLIC_DOCUMENTS`）—— 结果它在
 *    iOS 上解析到 `Library/Pandora/documents`，**仍然不是** `<sandbox>/Documents`。
 * 两者都不是系统复制文件的地方，所以两次都是 0 个文件。
 *
 * 真路径只能靠 `paths.ts` 里「从 `_doc` 绝对路径切掉 `/Library/`」推出来。
 */
const DOCS_INBOX_LABEL = 'Documents/Inbox'

/** uni 前缀落在 `Library/Pandora/documents`，兜底用（不是正确位置，但可能残留旧文件） */
const LEGACY_DOCUMENTS_INBOX = '_documents/Inbox/'

/** DCloud 私有目录，只在极端情况下才可能有东西 */
const LEGACY_INBOX = '_doc/Inbox/'

function plusIO(): any {
  return (globalThis as any).plus?.io
}

let cachedInboxDirs: string[] | null = null

/**
 * 要扫描的目录，第一个是权威位置（真 `Documents/Inbox` 的绝对路径）。
 * 后面的只作兜底：旧版本可能在这两处留下过文件。
 */
async function inboxDirs(): Promise<string[]> {
  if (cachedInboxDirs) return cachedInboxDirs
  const real = await sandboxInbox()
  // 拿到绝对路径才缓存。冷启动时 plus.io 可能还没完全就绪，
  // 把「没拿到」缓存下来会让整个会话都扫错位置
  if (real) {
    cachedInboxDirs = [real, LEGACY_DOCUMENTS_INBOX, LEGACY_INBOX]
    return cachedInboxDirs
  }
  return [LEGACY_DOCUMENTS_INBOX, LEGACY_INBOX]
}

/** 列目录。`readEntries` 一次最多返回 100 条，必须循环读到空数组为止 */
function listEntries(dirPath: string): Promise<any[]> {
  return new Promise((resolve) => {
    const io = plusIO()
    if (!io) {
      resolve([])
      return
    }
    io.resolveLocalFileSystemURL(
      dirPath,
      (entry: any) => {
        const reader = entry.createReader()
        const all: any[] = []
        const next = (): void => {
          reader.readEntries(
            (batch: any[]) => {
              if (!batch.length) {
                resolve(all)
                return
              }
              all.push(...batch)
              next()
            },
            () => resolve(all),
          )
        }
        next()
      },
      // 目录不存在 = 从没被分享过，正常情况
      () => resolve([]),
    )
  })
}

function readTextViaIO(entry: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const io = plusIO()
    entry.file(
      (file: any) => {
        const reader = new io.FileReader()
        reader.onloadend = (e: any) => resolve(String(e?.target?.result || ''))
        reader.onerror = () => reject(new Error('读取失败'))
        // 明确 utf-8：不传时 iOS 会按本地编码猜，中文文件容易变乱码
        reader.readAsText(file, 'utf-8')
      },
      () => reject(new Error('读取失败')),
    )
  })
}

/** 扫 Inbox，返回可以导入的文本文件（按名字排序，顺序稳定便于「跳过」） */
export async function listInboxDocs(): Promise<InboxDoc[]> {
  // #ifdef APP-PLUS
  const docs: InboxDoc[] = []
  const seen = new Set<string>()

  const take = (name: string, absPath: string, text: string): void => {
    if (seen.has(name)) return
    if (!text.trim() || text.length > MAX_CHARS) {
      log('inbox', `${name} 跳过（${text ? '超过大小上限' : '内容为空'}）`)
      return
    }
    seen.add(name)
    docs.push({ name, path: absPath, text })
  }

  // ---- 主通道：原生读真 `<sandbox>/Documents/Inbox` ----
  // plus.io 解不了这个绝对路径（0.7.27 实测），只能走 plus.ios
  const base = await documentsDir()
  const primary = base ? `${base}/Inbox` : ''
  if (primary) {
    const names = listDir(primary)
    // exists 一定要打：0 个条目和「目录根本不存在」是两种完全不同的故障
    log('inbox', `[原生] 扫描 ${primary}：${names.length} 个条目（exists=${fileExists(primary)}）`)
    for (const name of names) {
      if (!TEXT_EXT.test(name)) continue
      const abs = `${primary}/${name}`
      // 目录也会被列出来，按文件是否存在过滤
      if (!fileExists(abs)) continue
      take(name, abs, readText(abs))
    }
  } else {
    log('inbox', '[原生] 拿不到 Documents 路径')
  }

  // ---- 兜底：plus.io 的旧目录（历史残留，或 native 不可用时） ----
  for (const dir of await inboxDirs()) {
    const entries = await listEntries(dir)
    log('inbox', `扫描 ${dir}：${entries.length} 个条目`)
    for (const entry of entries) {
      if (!entry?.isFile) continue
      const name = String(entry.name || '')
      if (!TEXT_EXT.test(name) || seen.has(name)) continue
      const text = await readTextViaIO(entry).catch((e) => {
        logError('inbox', `${name} 读取失败：${e?.message || e}`)
        return ''
      })
      take(name, String(entry.fullPath || `${dir}${name}`), text)
    }
  }

  docs.sort((a, b) => a.name.localeCompare(b.name))
  log('inbox', `可导入 ${docs.length} 个`)
  return docs
  // #endif
  return []
}

/** 删掉已导入（或已跳过）的文件，避免下次回前台又弹一遍 */
export function removeInboxDoc(path: string): Promise<void> {
  // 原生路径（`/var/...` 开头）优先：plus.io 解不了它
  if (path.startsWith('/') && nativeReady()) {
    removeFileAt(path)
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const io = plusIO()
    if (!io || !path) {
      resolve()
      return
    }
    io.resolveLocalFileSystemURL(
      path,
      (entry: any) => entry.remove(() => resolve(), () => resolve()),
      () => resolve(),
    )
  })
}

/** 文件名 → 标题：去掉扩展名，保留原样（不做 slug，标题可以是中文） */
export function titleFromName(name: string): string {
  return name.replace(TEXT_EXT, '').trim() || '未命名'
}

/**
 * 等 `plus.io` 就绪。
 *
 * 冷启动被文档打开拉起时，`App.onShow` 有可能早于 plus 初始化 —— 那时
 * `plus.io` 是 undefined，扫描直接返回空数组，看起来就像「什么都没发生」。
 * 这是「能跳转但 App 没反应」最常见的原因。
 */
function whenPlusReady(timeout = 3000): Promise<void> {
  return new Promise((resolve) => {
    if ((globalThis as any).plus?.io) {
      resolve()
      return
    }
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      resolve()
    }
    try {
      document.addEventListener('plusready', finish, false)
    } catch {
      /* 非 H5 环境忽略 */
    }
    const started = Date.now()
    const timer = setInterval(() => {
      if ((globalThis as any).plus?.io || Date.now() - started > timeout) {
        clearInterval(timer)
        finish()
      }
    }, 150)
  })
}

/** Inbox 目录，导入页在空态里显示它，便于判断「系统有没有把文件拷进来」 */
export const INBOX_PATH = DOCS_INBOX_LABEL

export interface InboxDirStat {
  dir: string
  total: number
}

export interface InboxDiagnostics {
  /** 实际扫描的主目录 */
  dir: string
  /** 主目录解析出的绝对路径；拿不到为空串 */
  absDir: string
  total: number
  usable: number
  names: string[]
  /** 其余兜底目录的条目数：用来判断「文件到底进了哪个位置」 */
  others: InboxDirStat[]
}

/**
 * 诊断用：Inbox 里到底有什么。
 *
 * 「跳转到 App 后没有反应」只有三种可能 —— 系统没把文件拷进来（total=0）、
 * 拷到了另一个目录（others 里有数）、或者拷进来了但不是文本
 * （total>0 / usable=0）。把三组数字摆出来就不用猜了。
 */
export async function inboxDiagnostics(): Promise<InboxDiagnostics> {
  // #ifdef APP-PLUS
  await whenPlusReady()
  const names: string[] = []
  const others: InboxDirStat[] = []

  // 主通道：原生列真 `<sandbox>/Documents/Inbox`
  const base = await documentsDir()
  const primary = base ? `${base}/Inbox` : ''
  if (primary) {
    const files = listDir(primary).filter((n) => fileExists(`${primary}/${n}`))
    names.push(...files)
  }

  // 兜底目录：plus.io 能读的几个历史位置，顺便把「文件到底进了哪」暴露出来
  for (const dir of await inboxDirs()) {
    const entries = await listEntries(dir)
    const files = entries.filter((e) => e?.isFile).map((e) => String(e.name || ''))
    others.push({ dir, total: files.length })
    for (const n of files) if (!names.includes(n)) names.push(n)
  }

  return {
    dir: primary || DOCS_INBOX_LABEL,
    absDir: primary,
    total: names.length,
    usable: names.filter((n) => TEXT_EXT.test(n)).length,
    names,
    others,
  }
  // #endif
  return { dir: DOCS_INBOX_LABEL, absDir: '', total: 0, usable: 0, names: [], others: [] }
}

let lastCheck = 0

/**
 * 回前台时检查有没有待导入的文件，有就进导入页。
 *
 * 三个防抖，缺一个就会出现「开了两层导入页」：
 * 1. 页面栈顶已经是导入页 → 不跳；
 * 2. 1.5s 内重复调用 → 不跳（navigateTo 的动画期间 onShow 可能再次触发）；
 * 3. 游客不处理（导入要写权限），但也不要吞文件 —— 文件留在 Inbox，登录后仍会被扫到。
 */
export function checkInboxImport(hasSession: boolean): void {
  // #ifdef APP-PLUS
  if (!hasSession) return
  const now = Date.now()
  if (now - lastCheck < 1500) return
  lastCheck = now

  try {
    const pages = getCurrentPages()
    const top = pages[pages.length - 1] as any
    const route = String(top?.route || '')
    // 已经在导入页：别叠第二层
    if (route.includes('import-doc')) return
    // 正在编辑：编辑器里可能有没保存的改动，跳过去会打断写了一半的东西。
    // 文件留在 Inbox 不会丢，等用户退出编辑器回前台时再问
    if (route.includes('pages/edit')) return
  } catch {
    /* 取页面栈失败就不做这层判断 */
  }

  void (async () => {
    await whenPlusReady()
    // 冷启动时文件可能刚被系统拷进来，扫两轮：立刻一次、1.2s 后再一次
    for (let round = 0; round < 3; round += 1) {
      const docs = await listInboxDocs()
      log('inbox', `第 ${round + 1} 轮：${docs.length} 个待导入`)
      if (docs.length) {
        uni.navigateTo({
          url: '/pages/import-doc/index',
          // 冷启动时页面栈可能还没就绪，失败就等一会儿再来
          fail: () => {
            setTimeout(() => uni.navigateTo({ url: '/pages/import-doc/index' }), 600)
          },
        })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  })()
  // #endif
}

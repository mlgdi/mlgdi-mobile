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
 * ⚠️ 这里曾经写成 `_doc/Inbox/`，是**错的**，也是「共享进来永远 0 个文件」的根因。
 *
 * `_doc` 是 DCloud 自己的私有目录，iOS 上实际落在
 * `Library/Pandora/apps/<appid>/doc`（下载 Markdown 的日志里能看到这个绝对路径）。
 * 而系统做 document interaction 时，只会把外来的文件复制进
 * **`<sandbox>/Documents/Inbox/`** —— 也就是 `_documents/Inbox/`。
 * 两者隔着好几层目录，扫前者永远扫不到东西。
 *
 * App 在 Info.plist 里声明了 `CFBundleDocumentTypes` 且
 * `LSSupportsOpeningDocumentsInPlace = false`，所以「文件」App 里长按 .md →
 * 共享 → 渡己，系统走的就是「复制到 Documents/Inbox」这条路。
 */
const DOCS_INBOX = '_documents/Inbox/'

/**
 * 历史路径，留作兜底。
 *
 * 不直接删：万一某个基座把 `_doc` 映射到了 Documents，或者用户手上还有
 * 旧版本残留在那里，多扫一处不会错 —— 代价只是一次目录读取。
 */
const LEGACY_INBOX = '_doc/Inbox/'

function plusIO(): any {
  return (globalThis as any).plus?.io
}

/**
 * App 的 Documents 绝对路径（iOS：`/var/mobile/.../Documents`）。
 *
 * 为什么要拿绝对路径而不是只用 `_documents/` 前缀：诊断页要把真实位置印出来，
 * 而且 `resolveLocalFileSystemURL` 对前缀的解析在不同基座上不完全一致，
 * 用绝对路径最没歧义。
 */
function publicDocumentsRoot(): Promise<string> {
  return new Promise((resolve) => {
    const io = plusIO()
    if (!io?.requestFileSystem || io.PUBLIC_DOCUMENTS === undefined) {
      resolve('')
      return
    }
    // plus.io 的回调在个别基座上不回来，而这里挡在「扫 Inbox」的最前面：
    // 一旦挂住，导入页会一直空白，比拿错目录更难查。1.5 秒没结果就走兜底。
    let done = false
    const finish = (value: string): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(''), 1500)
    try {
      io.requestFileSystem(
        io.PUBLIC_DOCUMENTS,
        (fs: any) => finish(String(fs?.root?.fullPath || '').replace(/\/+$/, '')),
        () => finish(''),
      )
    } catch {
      finish('')
    }
  })
}

let cachedInboxDirs: string[] | null = null

/** 要扫描的目录（绝对路径优先，`_doc/Inbox` 兜底）。 */
async function inboxDirs(): Promise<string[]> {
  if (cachedInboxDirs) return cachedInboxDirs
  const root = await publicDocumentsRoot()
  // 只认真正的绝对路径。拿到 "/" 或相对串时拼出来的是系统根或错误位置，
  // 宁可退回 `_documents/Inbox/` 这个 uni 前缀
  if (root.startsWith('/') && root.length > 1) {
    // 拿到绝对路径才缓存。冷启动时 plus.io 可能还没完全就绪，
    // 把「没拿到」的结果缓存下来，会让整个会话都扫错位置
    cachedInboxDirs = [`${root}/Inbox`, LEGACY_INBOX]
    return cachedInboxDirs
  }
  return [DOCS_INBOX, LEGACY_INBOX]
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

function readText(entry: any): Promise<string> {
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
  const dirs = await inboxDirs()
  const docs: InboxDoc[] = []
  const seen = new Set<string>()

  for (const dir of dirs) {
    const entries = await listEntries(dir)
    log('inbox', `扫描 ${dir}：${entries.length} 个条目`)
    for (const entry of entries) {
      if (!entry?.isFile) continue
      const name = String(entry.name || '')
      if (!TEXT_EXT.test(name)) continue
      // 两个目录都可能是真的，同名只认先扫到的那个（Documents 优先）
      if (seen.has(name)) continue
      seen.add(name)
      const text = await readText(entry).catch((e) => {
        logError('inbox', `${name} 读取失败：${e?.message || e}`)
        return ''
      })
      if (!text.trim() || text.length > MAX_CHARS) {
        log('inbox', `${name} 跳过（${text ? '超过大小上限' : '内容为空'}）`)
        continue
      }
      docs.push({
        name,
        path: String(entry.fullPath || `${dir}${name}`),
        text,
      })
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
export const INBOX_PATH = DOCS_INBOX

export interface InboxDirStat {
  dir: string
  total: number
}

export interface InboxDiagnostics {
  /** 实际扫描的主目录（正常情况下是 Documents/Inbox） */
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
  const dirs = await inboxDirs()
  const names: string[] = []
  const others: InboxDirStat[] = []

  for (let i = 0; i < dirs.length; i += 1) {
    const entries = await listEntries(dirs[i])
    const files = entries.filter((e) => e?.isFile).map((e) => String(e.name || ''))
    if (i === 0) {
      names.push(...files)
    } else {
      others.push({ dir: dirs[i], total: files.length })
      for (const n of files) if (!names.includes(n)) names.push(n)
    }
  }

  const main = dirs[0] || DOCS_INBOX
  return {
    dir: main,
    absDir: main.startsWith('/') ? main : '',
    total: names.length,
    usable: names.filter((n) => TEXT_EXT.test(n)).length,
    names,
    others,
  }
  // #endif
  return { dir: DOCS_INBOX, absDir: '', total: 0, usable: 0, names: [], others: [] }
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

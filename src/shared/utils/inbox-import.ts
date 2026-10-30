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

/** uni 的 `_doc` 就是 App 的 Documents 目录，iOS 的 Inbox 在它下面 */
const INBOX_DIR = '_doc/Inbox/'

function plusIO(): any {
  return (globalThis as any).plus?.io
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
  const entries = await listEntries(INBOX_DIR)
  const docs: InboxDoc[] = []

  for (const entry of entries) {
    if (!entry?.isFile) continue
    const name = String(entry.name || '')
    if (!TEXT_EXT.test(name)) continue
    const text = await readText(entry).catch(() => '')
    if (!text.trim() || text.length > MAX_CHARS) continue
    docs.push({
      name,
      path: String(entry.fullPath || `${INBOX_DIR}${name}`),
      text,
    })
  }

  docs.sort((a, b) => a.name.localeCompare(b.name))
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

  void listInboxDocs().then((docs) => {
    if (!docs.length) return
    uni.navigateTo({ url: '/pages/import-doc/index' })
  })
  // #endif
}

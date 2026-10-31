/**
 * 直接用 `plus.ios` 调 `NSFileManager` —— 绕开 plus.io 的路径问题。
 *
 * ## 为什么放弃 `plus.io`
 *
 * 0.7.27 的实测结果：`plus.io` 能算出正确的 `<sandbox>/Documents` 绝对路径
 * （诊断页显示的 Inbox 路径是对的），但 **`resolveLocalFileSystemURL` 解不了
 * 这个绝对路径** —— 写入静默失败、退回 DCloud 的
 * `Library/Pandora/documents`，而 `contentsOfDirectoryAtPath` 那边也读不到。
 *
 * 换句话说：plus.io 只在自己的文件系统常量（`_doc` / `_documents`）里可信，
 * 一旦要碰系统的 `Documents`（那是它没注册过的「文件系统」），它的表现
 * 就变成「回调不回来 / 静默失败」—— 这和最初 `uni.getFileSystemManager`
 * 那条死路是同一类问题：**中间隔了一层不可控的封装**。
 *
 * `plus.ios` 是直接调 Objective-C，没有中间层，也没有路径白名单。
 * 诊断页已经确认它在当前包上可用（「plus.ios 可用」）。
 *
 * ## 约定
 *
 * 这里所有函数**都不抛异常**：失败返回空串 / false / []。
 * 调用方负责决定要不要退回 plus.io。
 */

function ios(): any {
  return (globalThis as any).plus?.ios
}

export function nativeReady(): boolean {
  return Boolean(ios()?.importClass)
}

function fileManager(): any {
  const i = ios()
  const NSFileManager = i.importClass('NSFileManager')
  return NSFileManager.defaultManager()
}

/** `NSDocumentDirectory` */
const NS_DOCUMENT_DIRECTORY = 9
/** `NSUserDomainMask` */
const NS_USER_DOMAIN = 1
/** `NSUTF8StringEncoding` */
const NS_UTF8 = 4

/**
 * 真正的 `<sandbox>/Documents`。
 *
 * 问系统要，而不是自己拼 —— 这是唯一不会有歧义的来源。
 */
export function documentsPath(): string {
  try {
    const i = ios()
    if (!i?.importClass) return ''
    const fm = fileManager()
    const url = i.invoke(
      fm,
      'URLForDirectory:inDomain:appropriateForURL:create:error:',
      NS_DOCUMENT_DIRECTORY,
      NS_USER_DOMAIN,
      null,
      false,
      null,
    )
    if (!url) return ''
    const path = String(i.invoke(url, 'path') || '')
    return path ? path.replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

export function fileExists(absPath: string): boolean {
  try {
    const i = ios()
    const fm = fileManager()
    const ok = i.invoke(fm, 'fileExistsAtPath:', absPath)
    return ok === true || ok === 1
  } catch {
    return false
  }
}

/** 列目录，返回文件名（不含路径）。目录不存在返回 []。 */
export function listDir(absPath: string): string[] {
  try {
    const i = ios()
    const fm = fileManager()
    const arr = i.invoke(fm, 'contentsOfDirectoryAtPath:error:', absPath, null)
    if (!arr) return []
    const count = Number(i.invoke(arr, 'count')) || 0
    const out: string[] = []
    for (let k = 0; k < count; k += 1) {
      const item = i.invoke(arr, 'objectAtIndex:', k)
      if (item) out.push(String(item))
    }
    return out
  } catch {
    return []
  }
}

/** 建目录（含中间层）。已存在也算成功。 */
export function ensureDir(absPath: string): boolean {
  try {
    const i = ios()
    const fm = fileManager()
    const ok = i.invoke(
      fm,
      'createDirectoryAtPath:withIntermediateDirectories:attributes:error:',
      absPath,
      true,
      null,
      null,
    )
    return ok === true || ok === 1 || fileExists(absPath)
  } catch {
    return false
  }
}

/** 写 UTF-8 文本（原子写）。 */
export function writeText(absPath: string, text: string): boolean {
  try {
    const i = ios()
    const NSString = i.importClass('NSString')
    const str = NSString.stringWithString(text)
    const ok = i.invoke(
      str,
      'writeToFile:atomically:encoding:error:',
      absPath,
      true,
      NS_UTF8,
      null,
    )
    return ok === true || ok === 1
  } catch {
    return false
  }
}

/** 读 UTF-8 文本。失败返回空串。 */
export function readText(absPath: string): string {
  try {
    const i = ios()
    const NSString = i.importClass('NSString')
    const str = i.invoke(NSString, 'stringWithContentsOfFile:encoding:error:', absPath, NS_UTF8, null)
    return str ? String(str) : ''
  } catch {
    return ''
  }
}

/** 文件字节数；读不到返回 -1。 */
export function fileSizeAt(absPath: string): number {
  try {
    const i = ios()
    const fm = fileManager()
    const attrs = i.invoke(fm, 'attributesOfItemAtPath:error:', absPath, null)
    if (!attrs) return -1
    const size = i.invoke(attrs, 'objectForKey:', 'NSFileSize')
    const n = Number(size)
    return Number.isFinite(n) ? n : -1
  } catch {
    return -1
  }
}

export function removeFileAt(absPath: string): boolean {
  try {
    const i = ios()
    const fm = fileManager()
    const ok = i.invoke(fm, 'removeItemAtPath:error:', absPath, null)
    return ok === true || ok === 1
  } catch {
    return false
  }
}

/**
 * 拿 `rootViewController` 的类名。
 *
 * 「下载没反应」还有一种可能不是写入失败，而是系统面板 present 不出去：
 * `keyWindow` 在 iOS 13+ 多场景下可能为空，拿不到 root 就什么都弹不出来。
 * 把类名打出来，一眼能分清是「没写文件」还是「弹不出面板」。
 */
export function presenterClass(): string {
  try {
    const i = ios()
    if (!i?.importClass) return '(无 plus.ios)'
    const UIApplication = i.importClass('UIApplication')
    const app = UIApplication.sharedApplication()
    let win = i.invoke(app, 'keyWindow')
    if (!win) {
      const delegate = i.invoke(app, 'delegate')
      win = i.invoke(delegate, 'window')
    }
    const root = i.invoke(win, 'rootViewController')
    if (!root) return '(取不到 root)'
    const cls = i.invoke(root, 'class')
    const name = String(i.invoke(cls, 'description') || cls || '?')
    const presented = i.invoke(root, 'presentedViewController')
    return presented ? `${name} · 已在展示模态` : name
  } catch (e) {
    return `(异常：${(e as Error)?.message || e})`
  }
}

/* ========================================================================== *
 * 自检：一次性把所有候选通道的结果摊开
 * ========================================================================== */

export interface SelfTestRow {
  step: string
  ok: boolean
  detail: string
}

/**
 * 存储自检。
 *
 * 为什么需要它：这一路已经连续四轮「改完还是不行」，而每次能拿到的
 * 只有一句「没反应」。与其再猜第五次，不如让 App 自己把每条通道跑一遍、
 * 把结果打印出来 —— 哪条通、哪条断，一张截图就说完。
 */
export function storageSelfTest(): SelfTestRow[] {
  const rows: SelfTestRow[] = []
  const push = (step: string, ok: boolean, detail: string): void => {
    rows.push({ step, ok, detail })
  }

  push('plus.ios', nativeReady(), nativeReady() ? '可用' : '不可用')
  if (!nativeReady()) return rows

  const docs = documentsPath()
  push('NSDocumentDirectory', Boolean(docs), docs || '(取不到)')
  if (!docs) return rows

  push('Documents 目录', fileExists(docs), fileExists(docs) ? '存在' : '不存在')

  const items = listDir(docs)
  push('Documents 内容', true, items.length ? items.join(' / ') : '(空)')

  const inbox = `${docs}/Inbox`
  push('Inbox 目录', fileExists(inbox), fileExists(inbox) ? '存在' : '不存在（系统还没复制过文件）')
  if (fileExists(inbox)) {
    const inboxItems = listDir(inbox)
    push('Inbox 内容', true, inboxItems.length ? inboxItems.join(' / ') : '(空)')
  }

  const exportsDir = `${docs}/Exports`
  push('建 Exports', ensureDir(exportsDir), exportsDir)
  const probe = `${exportsDir}/__selftest.txt`
  const wrote = writeText(probe, `selftest ${new Date().toISOString()}`)
  push('写测试文件', wrote, probe)
  const size = fileSizeAt(probe)
  push('读回大小', size > 0, `${size} 字节`)
  const back = readText(probe)
  push('读回内容', back.startsWith('selftest'), back.slice(0, 40) || '(空)')

  // 弹面板用的 rootViewController —— 决定「下载」有没有反应
  const presenter = presenterClass()
  push('rootViewController', Boolean(presenter) && !presenter.startsWith('('), presenter)

  // plus.io 对照：不作为方案，只为确认它当前的实际表现
  const io = (globalThis as any).plus?.io
  let ioDoc = ''
  try {
    ioDoc = String(io?.convertLocalFileSystemURL?.('_doc') || '')
  } catch {
    ioDoc = ''
  }
  push('plus.io _doc', Boolean(ioDoc), ioDoc || '(解不出)')

  return rows
}

/**
 * 直接用 `plus.ios` 调 `NSFileManager` / `NSData` —— 绕开 plus.io 的路径问题。
 *
 * ## 为什么放弃 `plus.io`
 *
 * 0.7.27 实测：`plus.io` 能算出正确的 `<sandbox>/Documents` 绝对路径，但
 * **`resolveLocalFileSystemURL` 解不了它** —— 写入静默失败、退回 DCloud 的
 * `Library/Pandora/documents`。plus.io 只在自己注册过的文件系统常量里可信，
 * 碰到系统的 `Documents` 就失灵。和最初 `uni.getFileSystemManager` 一样：
 * 中间隔了一层不可控的封装。
 *
 * ## 三条从 0.7.28 日志里学到的规则
 *
 * 0.7.28 的日志写着 `.../Documents/Exports/xxx.md 写入失败`，而
 * `documentsPath()` 同时是成功的。同一套 `invoke`，一个成一个败，差别在：
 *
 * 1. **类方法一律用 `i.invoke(Class, 'selector:', ...)`**，不要
 *    `Class.method(...)`。`importClass` 返回的是动态包装，点出来只对
 *    少数常用方法（如 `NSURL.fileURLWithPath`）有效，其余静默返回 undefined。
 * 2. **能用不带 `NSError**` 的 API 就用不带的那版**：
 *    写文件用 `NSData.writeToFile:atomically:`（两个参数），
 *    建目录用 `createDirectoryAtPath:attributes:`，
 *    列目录用 `enumeratorAtPath:` + `nextObject`。
 *    二级指针参数（`NSError **`）在桥接层是最大的不确定来源。
 * 3. **不信 BOOL 返回值，只信结果**。写完用 `fileExistsAtPath:` 查一遍，
 *    建完目录查一遍 —— BOOL 在不同基座上可能是 `true` / `1` / 包装对象。
 *
 * ## 约定
 *
 * 这里所有函数**都不抛异常**：失败返回空串 / false / [] / -1。
 */
import { sandboxDocuments } from './paths'

function ios(): any {
  return (globalThis as any).plus?.ios
}

export function nativeReady(): boolean {
  return Boolean(ios()?.importClass)
}

/**
 * 拿 NSFileManager 单例。
 *
 * **两种调用方式都要试，不能只认一种。** 这是踩出来的：
 * - 0.7.28 用 `NSFileManager.defaultManager()`（点语法）→ 拿到对象，目录建成了；
 * - 0.7.29 换成 `i.invoke(NSFileManager, 'defaultManager')` → null，
 *   `NSDocumentDirectory` 直接变成「取不到」，整条链路全灭。
 *
 * 和 `NSString.stringWithString` 的教训合起来只能得出一个结论：
 * **桥接层对「哪些方法点语法有效」没有稳定规律，逐个试才是唯一靠谱的做法。**
 */
function fileManager(): any {
  const i = ios()
  if (!i?.importClass) return null
  const NSFileManager = i.importClass('NSFileManager')
  try {
    const viaDot = NSFileManager?.defaultManager?.()
    if (viaDot) return viaDot
  } catch {
    /* 试下一种 */
  }
  try {
    return i.invoke(NSFileManager, 'defaultManager')
  } catch {
    return null
  }
}

/** BOOL 返回值在桥接层可能是 true / 1 / '1'，统一判一次 */
function truthy(v: any): boolean {
  return v === true || v === 1 || v === '1'
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
 * 这一条在 0.7.27/0.7.28 都是成功的，说明 `NSError **` 传 null 对
 * `URLForDirectory:` 没问题（但对 `writeToFile:...error:` 就有问题）。
 */
export function documentsPath(): string {
  try {
    const i = ios()
    if (!i?.importClass) return ''
    const fm = fileManager()
    if (!fm) return ''
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
    if (!fm) return false
    return truthy(i.invoke(fm, 'fileExistsAtPath:', absPath))
  } catch {
    return false
  }
}

let cachedDocs: string | null = null

/**
 * 真正的 `<sandbox>/Documents`，**两条来源**：
 *
 * 1. 问系统：`NSFileManager URLForDirectory:inDomain:...`（最权威）；
 * 2. `plus.io` 推导：`_doc` 绝对路径切掉 `/Library/` 再接 `/Documents`。
 *
 * 第二条不是备胎心理安慰 —— 0.7.27 / 0.7.28 的诊断页显示的正是它算出来的
 * 绝对路径（`.../Application/<UUID>/Documents/Inbox`），说明它一直是对的。
 * 而第一条在 0.7.29 因为 `defaultManager` 换了调用方式直接失败。
 *
 * 两条都拿不到才返回空串。只缓存成功结果。
 */
export async function documentsDir(): Promise<string> {
  if (cachedDocs) return cachedDocs
  const viaNative = documentsPath()
  if (viaNative) {
    cachedDocs = viaNative
    return cachedDocs
  }
  const viaIO = await sandboxDocuments()
  if (viaIO) {
    cachedDocs = viaIO
    return cachedDocs
  }
  return ''
}

/**
 * 列目录，返回直接子项的名字。目录不存在返回 []。
 *
 * 用 `enumeratorAtPath:` 而不是 `contentsOfDirectoryAtPath:error:`：
 * 前者不带 `NSError **`。代价是它会递归子目录，所以要把带 `/` 的相对路径滤掉。
 */
export function listDir(absPath: string): string[] {
  try {
    if (!fileExists(absPath)) return []
    const i = ios()
    const fm = fileManager()
    if (!fm) return []
    const en = i.invoke(fm, 'enumeratorAtPath:', absPath)
    if (!en) return []
    const out: string[] = []
    // 上限只防桥接层返回异常值把循环卡死，正常目录远到不了
    for (let n = 0; n < 500; n += 1) {
      const item = i.invoke(en, 'nextObject')
      if (!item) break
      const name = String(item)
      if (name.indexOf('/') >= 0) continue
      out.push(name)
    }
    return out
  } catch {
    return []
  }
}

/**
 * 建目录（只建一层）。
 *
 * 调用方要的都是 `Documents/Exports` 这种「父级已存在」的情况，
 * 所以用不带 `NSError**` 的 `createDirectoryAtPath:attributes:` 就够了。
 */
export function ensureDir(absPath: string): boolean {
  try {
    if (fileExists(absPath)) return true
    const i = ios()
    const fm = fileManager()
    if (!fm) return false
    i.invoke(fm, 'createDirectoryAtPath:attributes:', absPath, null)
    return fileExists(absPath)
  } catch {
    return false
  }
}

/**
 * 写 UTF-8 文本。
 *
 * 链路：`NSString stringWithString:` → `dataUsingEncoding:` → `NSData writeToFile:atomically:`。
 * 最后一步只有两个参数、没有 `NSError **`，是这条链上最稳的一环。
 * 写完不看返回值，直接查文件是否存在。
 */
export function writeText(absPath: string, text: string): boolean {
  try {
    const i = ios()
    const NSString = i.importClass('NSString')
    const str = i.invoke(NSString, 'stringWithString:', text)
    if (!str) return false
    const data = i.invoke(str, 'dataUsingEncoding:', NS_UTF8)
    if (!data) return false
    i.invoke(data, 'writeToFile:atomically:', absPath, true)
    return fileExists(absPath)
  } catch {
    return false
  }
}

/** 读 UTF-8 文本。失败返回空串。 */
export function readText(absPath: string): string {
  try {
    const i = ios()
    const NSData = i.importClass('NSData')
    const NSString = i.importClass('NSString')
    const data = i.invoke(NSData, 'dataWithContentsOfFile:', absPath)
    if (!data) return ''
    // initWithData:encoding: 没有 NSError**，比 stringWithContentsOfFile:encoding:error: 稳
    const obj = i.invoke(NSString, 'alloc')
    const str = i.invoke(obj, 'initWithData:encoding:', data, NS_UTF8)
    return str ? String(str) : ''
  } catch {
    return ''
  }
}

/** 文件字节数；读不到返回 -1。 */
export function fileSizeAt(absPath: string): number {
  try {
    const i = ios()
    const NSData = i.importClass('NSData')
    const data = i.invoke(NSData, 'dataWithContentsOfFile:', absPath)
    if (!data) return -1
    const n = Number(i.invoke(data, 'length'))
    return Number.isFinite(n) ? n : -1
  } catch {
    return -1
  }
}

export function removeFileAt(absPath: string): boolean {
  try {
    const i = ios()
    const fm = fileManager()
    if (!fm) return false
    i.invoke(fm, 'removeItemAtPath:error:', absPath, null)
    return !fileExists(absPath)
  } catch {
    return false
  }
}

/**
 * 复制文件。目标已存在会先删掉。
 *
 * 为什么需要它：`NSData writeToFile:atomically:` 在这个基座上写不进去
 * （0.7.30 自检：`建 Exports` 通过、`写测试文件` 失败，说明 NSFileManager
 * 本身是通的，断的只是「写」这一环）。而 `plus.io` 写 `_doc` 是可靠的
 * ——0.7.28 的日志里它就成功写出了 3036 字节。
 *
 * 于是分工：**plus.io 负责「写」，NSFileManager 负责「搬到 Documents」**。
 * 两条都是各自验证过的能力，不去赌没验证过的那一半。
 */
export function copyFile(srcAbs: string, destAbs: string): boolean {
  try {
    const i = ios()
    const fm = fileManager()
    if (!fm || !srcAbs || !destAbs) return false
    if (fileExists(destAbs)) removeFileAt(destAbs)
    i.invoke(fm, 'copyItemAtPath:toPath:error:', srcAbs, destAbs, null)
    if (fileExists(destAbs)) return true
    // copyItem 也带 NSError**，万一它不认，再用 move 试一次
    i.invoke(fm, 'moveItemAtPath:toPath:error:', srcAbs, destAbs, null)
    return fileExists(destAbs)
  } catch {
    return false
  }
}

/**
 * 拿 `rootViewController` 的类名。
 *
 * 「下载没反应」的直接原因就在这里：0.7.30 自检显示 `rootViewController 失败
 * （取不到 root）`——present 都进不去，面板自然不出现，而 present 的失败
 * 又被 catch 吞了，用户看到的就是「什么都没发生」。
 *
 * 根因还是那条规律：`UIApplication.sharedApplication` 与 `defaultManager`
 * 一样，**点语法有效、invoke 返回 null**。所以这里两种都试。
 */
function sharedApplication(): any {
  try {
    const i = ios()
    if (!i?.importClass) return null
    const UIApplication = i.importClass('UIApplication')
    try {
      const viaDot = UIApplication?.sharedApplication?.()
      if (viaDot) return viaDot
    } catch {
      /* 试下一种 */
    }
    return i.invoke(UIApplication, 'sharedApplication')
  } catch {
    return null
  }
}

/** 读 rootViewController：keyWindow 在 iOS 13+ 多场景下可能为空，退回 delegate.window */
function rootVC(): any {
  try {
    const i = ios()
    const app = sharedApplication()
    if (!app) return null
    let win = null
    try {
      win = app.keyWindow?.() || i.invoke(app, 'keyWindow')
    } catch {
      win = i.invoke(app, 'keyWindow')
    }
    if (!win) {
      const delegate = i.invoke(app, 'delegate')
      win = i.invoke(delegate, 'window')
    }
    if (!win) return null
    return i.invoke(win, 'rootViewController')
  } catch {
    return null
  }
}

export function presenterClass(): string {
  try {
    const i = ios()
    if (!i?.importClass) return '(无 plus.ios)'
    const root = rootVC()
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
 * 为什么需要它：这一路已经连续五轮「改完还是不行」，而每次能拿到的
 * 只有一句「没反应」。与其再猜第六次，不如让 App 自己把每条通道跑一遍、
 * 把结果打印出来 —— 哪条通、断在哪一步，一张截图就说完。
 */
export async function storageSelfTest(): Promise<SelfTestRow[]> {
  const rows: SelfTestRow[] = []
  const push = (step: string, ok: boolean, detail: string): void => {
    rows.push({ step, ok, detail })
  }

  push('plus.ios', nativeReady(), nativeReady() ? '可用' : '不可用')
  if (!nativeReady()) return rows

  // 两条来源分开报：0.7.28 是 URLForDirectory 能通、0.7.29 换了调用方式就不通，
  // 混在一起看根本分不出是哪一条断的
  const viaNative = documentsPath()
  push('URLForDirectory', Boolean(viaNative), viaNative || '(取不到)')

  const docs = await documentsDir()
  push('Documents（最终）', Boolean(docs), docs || '(两条来源都失败)')
  if (!docs) {
    push('请检查', false, '拿不到 Documents 路径，读写都无从谈起')
    return rows
  }

  push('Documents 目录', fileExists(docs), fileExists(docs) ? '存在' : '不存在')

  const items = listDir(docs)
  push('Documents 内容', true, items.length ? items.join(' / ') : '(空)')

  const inbox = `${docs}/Inbox`
  const inboxExists = fileExists(inbox)
  push('Inbox 目录', inboxExists, inboxExists ? '存在' : '不存在（系统还没复制过文件）')
  if (inboxExists) {
    const inboxItems = listDir(inbox)
    push('Inbox 内容', true, inboxItems.length ? inboxItems.join(' / ') : '(空)')
  }

  const exportsDir = `${docs}/Exports`
  const dirOk = ensureDir(exportsDir)
  push('建 Exports', dirOk, dirOk ? exportsDir : `${exportsDir}（建不成功）`)

  if (dirOk) {
    const probe = `${exportsDir}/__selftest.txt`
    const wrote = writeText(probe, `selftest ${new Date().toISOString()} 中文`)
    push('写测试文件', wrote, probe)
    push('文件是否存在', fileExists(probe), probe)
    const size = fileSizeAt(probe)
    push('读回大小', size > 0, `${size} 字节`)
    const back = readText(probe)
    push('读回内容', back.startsWith('selftest'), back.slice(0, 30) || '(空)')
  }

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

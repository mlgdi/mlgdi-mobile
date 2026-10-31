import { log, logError } from './logger'
import { recordExport } from './diag'

/**
 * 把正文导出成 `.md` 文件，存到用户自己能找到的地方（App 端是「文件」App）。
 *
 * 为什么不用 `plus.share.sendWithSystem`：它的 `ShareMessage` 只定义了
 * `text` 与 `image` 两种 type（官方文档原文：「仅支持 type 类型为 "text"、
 * "image" 的消息」），`filePath` / `files` 这类字段根本不存在。硬传 file 的后果
 * 不是报错，而是**静默退化成文本分享** —— DCloud 插件文档的原话是
 * 「存出内容为路径字符串的 txt」，也就是对方收到一行文件路径。
 *
 * 所以 iOS 上直接构造 `UIActivityViewController`，用 `NSURL.fileURLWithPath`
 * 把真实文件交给系统面板。Obsidian 分享笔记走的也是同一条路。
 *
 * 已知限制：文件分享的目标由系统面板按 UTI 过滤，`.md` 在 iOS 上是 dynamic UTI，
 * 微信是否出现取决于它自己的分享扩展，不是这段代码能决定的。
 */

/** 文件名里不能出现的字符（iOS 会拒绝写盘或显示异常） */
const ILLEGAL = /[\\/:*?"<>|\r\n\t]/g

/** 标题 → 安全的文件名。过长的标题截断，避免某些系统组件截断报错 */
export function markdownFileName(title: string, fallback = '未命名'): string {
  const base = (title || '')
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return `${base || fallback}.md`
}

/** 统一换行：Windows 侧编辑过的文件带 \r\n，发出去对方编辑器会多出空行 */
export function markdownText(body: string): string {
  return (body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 给任何一步加超时：plus.io 的回调偶尔不回来，不能让它把整个流程挂住 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error(message))
    }, ms)
    p.then(
      (v) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        if (done) return
        done = true
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** uni 的本地路径（`_doc/x.md`）→ 绝对路径，文件选择器只认绝对路径 */
function toAbsolute(local: string): string {
  const plusAny = (globalThis as any).plus
  try {
    // 注意方法名是 convertLocalFileSystemURL（带 System）。
    // 之前写成 convertLocalFileURL，可选链拿到 undefined 就静默退回原值，
    // 于是把 `_doc/xx.md` 当绝对路径交给了系统面板 —— 面板照弹，但指向不存在的文件。
    const url = String(plusAny?.io?.convertLocalFileSystemURL?.(local) || local)
    return url.replace(/^file:\/\//, '')
  } catch {
    return local
  }
}

/** 读文件真实字节数；读不到返回 -1 */
function fileSize(entry: any): Promise<number> {
  return new Promise((resolve) => {
    try {
      entry.file(
        (f: any) => resolve(Number(f?.size) || 0),
        () => resolve(-1),
      )
    } catch {
      resolve(-1)
    }
  })
}

/**
 * 往某个文件系统根下写文件，返回绝对路径与实际大小。
 *
 * `dirName` 为空表示直接写在根下；否则先建（或复用）这个子目录。
 */
function writeOne(
  fsConst: number,
  dirName: string,
  name: string,
  text: string,
): Promise<{ abs: string; size: number }> {
  return new Promise((resolve, reject) => {
    const io = plusIO()
    io.requestFileSystem(
      fsConst,
      (fs: any) => {
        const putFile = (dirEntry: any): void => {
          // 先删再建，而不是 truncate 后重写：新建的空文件上 truncate(0)
          // 有时不触发 onwrite；而同名文件不清空，短内容会把上一次的字留在尾部。
          const create = (): void => {
            dirEntry.getFile(
              name,
              { create: true },
              (entry: any) => {
                entry.createWriter(
                  (writer: any) => {
                    writer.onwrite = () => {
                      const raw = String(entry.fullPath || '')
                      const abs = raw.startsWith('/') ? raw : toAbsolute(raw)
                      void fileSize(entry).then((size) => resolve({ abs, size }))
                    }
                    writer.onerror = () => reject(new Error('写入 Markdown 失败'))
                    writer.write(text)
                  },
                  () => reject(new Error('无法创建文件')),
                )
              },
              () => reject(new Error('无法创建文件')),
            )
          }
          dirEntry.getFile(name, { create: false }, (old: any) => old.remove(create, create), create)
        }

        if (!dirName) {
          putFile(fs.root)
          return
        }
        fs.root.getDirectory(
          dirName,
          { create: true },
          (d: any) => putFile(d),
          () => reject(new Error('无法创建导出目录')),
        )
      },
      () => reject(new Error('无法访问应用目录')),
    )
  })
}

function plusIO(): any {
  return (globalThis as any).plus?.io
}

/**
 * 把正文写成一个 .md 文件，返回绝对路径与真实字节数。
 *
 * 落点**优先 Documents/Exports/**，不是 `_doc/`：
 * - `_doc` 在 iOS 上是 `Library/Pandora/apps/<appid>/doc`，用户根本看不到；
 * - Documents 是系统认可的用户目录，配合 Info.plist 的
 *   `UIFileSharingEnabled`，「文件」App → 我的 iPhone → 渡己 → Exports
 *   里直接就能看到这个文件。**「下载」的第一诉求是拿到文件，
 *   而不是每次都过一遍「存储到文件」面板**；
 * - 弹选择器保留，作为「另存到 iCloud / 其他 App」的第二条路。
 * 写不进 Documents 时退回 `_doc/`，至少还能交给选择器。
 *
 * 不再尝试 `uni.getFileSystemManager()`：那是小程序 API，App 端根本不存在
 * （诊断页一直显示「不可用」就是这个原因），先调它只是白试一次。
 */
async function writeDocFile(name: string, text: string): Promise<{ abs: string; size: number }> {
  const io = plusIO()
  if (!io) throw new Error('当前环境不支持写入文件')

  const targets: { fsConst: number; dir: string }[] = []
  if (io.PUBLIC_DOCUMENTS !== undefined) {
    targets.push({ fsConst: io.PUBLIC_DOCUMENTS, dir: 'Exports' })
  }
  targets.push({ fsConst: io.PRIVATE_DOC, dir: '' })

  let lastError: Error | null = null
  for (const target of targets) {
    try {
      return await withTimeout(
        writeOne(target.fsConst, target.dir, name, text),
        8000,
        '写入文件超时，请重试',
      )
    } catch (e) {
      lastError = e as Error
      logError('md', `写入 ${target.dir || '根目录'} 失败：${lastError?.message || lastError}`)
    }
  }
  throw lastError || new Error('写入文件失败')
}

/**
 * 弹出系统分享面板（iOS）。
 *
 * `plus.ios.invoke` 的第三个参数是 Obj-C 选择器原文，方法名必须与
 * `initWithActivityItems:applicationActivities:` 这种写法完全一致 —— 写成
 * 驼峰拼接（`initWithActivityItemsApplicationActivities`）在部分基座上不生效，
 * 表现是面板根本不出现、也没有报错。
 */
function presentShareSheet(absPath: string): void {
  const plusAny = (globalThis as any).plus
  const ios = plusAny?.ios
  if (!ios?.importClass) throw new Error('当前环境不支持系统分享')

  const NSURL = ios.importClass('NSURL')
  const NSMutableArray = ios.importClass('NSMutableArray')
  const items = NSMutableArray.array()
  items.addObject(NSURL.fileURLWithPath(absPath))

  // 实例化走两条路：多数基座上 importClass 的结果可以直接 new，
  // 个别基座只返回"类对象"，此时退回 newObject。没这条兜底会直接抛异常，
  // 用户看到的是「点了分享没反应」。
  const VCClass = ios.importClass('UIActivityViewController')
  let vc: any
  try {
    vc = new (VCClass as any)()
  } catch {
    vc = ios.newObject?.('UIActivityViewController')
  }
  if (!vc) throw new Error('无法创建分享面板')
  ios.invoke(vc, 'initWithActivityItems:applicationActivities:', items, null)

  const root = rootViewController(ios)
  // iPad 上不设 popover 会崩（UIPopoverPresentationController 必须有锚点）；
  // iPhone 无影响，这里顺手补上，免得以后在平板上踩。
  const popover = ios.invoke(vc, 'popoverPresentationController')
  if (popover) {
    const view = ios.invoke(root, 'view')
    ios.invoke(popover, 'setSourceView:', view)
  }

  ios.invoke(root, 'presentViewController:animated:completion:', vc, true, null)
}

/** 取当前可用窗口的 rootViewController —— 所有系统面板都从这里 present */
function rootViewController(ios: any): any {
  const UIApplication = ios.importClass('UIApplication')
  const app = UIApplication.sharedApplication()
  let win = ios.invoke(app, 'keyWindow')
  if (!win) {
    // iOS 13+ 多场景：keyWindow 可能为空，退回 delegate.window
    const delegate = ios.invoke(app, 'delegate')
    win = ios.invoke(delegate, 'window')
  }
  const root = ios.invoke(win, 'rootViewController')
  if (!root) throw new Error('找不到可用的窗口')
  return root
}

/**
 * 弹出「存储到文件」——就是系统文件 App 的保存位置选择器。
 *
 * 为什么不用分享面板：用户要的是「下载」，也就是把文件放到自己能看到的地方，
 * 再由他自己决定怎么处理（发微信、丢网盘、留着）。分享面板是「立刻发出去」的
 * 语义，而且微信收不收 .md 由它的分享扩展决定，那个面板里可能根本没有微信。
 *
 * `initForExportingURLs:asCopy:` 是 iOS 14+ 的构造器；老系统退回
 * `initWithURL:inMode:`（UIDocumentPickerModeExportToService = 1）。
 * 传错构造器不会报错，而是拿到一个没初始化的控制器 —— present 时直接崩，
 * 所以按版本号选，不靠 try/catch。
 */
function presentFilePicker(absPath: string): void {
  const plusAny = (globalThis as any).plus
  const ios = plusAny?.ios
  if (!ios?.importClass) throw new Error('当前环境不支持存储文件')

  const NSURL = ios.importClass('NSURL')
  const url = NSURL.fileURLWithPath(absPath)

  const PickerClass = ios.importClass('UIDocumentPickerViewController')
  let picker: any
  try {
    picker = new (PickerClass as any)()
  } catch {
    picker = ios.newObject?.('UIDocumentPickerViewController')
  }
  if (!picker) throw new Error('无法创建文件选择器')

  // NSArray 的类方法在某些基座上拿不到包装（返回 undefined 而不是抛错），
  // 那样 initForExportingURLs:asCopy: 会收到 nil —— 面板照弹，但里面是空的。
  // 拿不到就退回单 URL 的构造器，宁可少一个参数，也别给一个空面板。
  let urls: any = null
  try {
    const NSArray = ios.importClass('NSArray')
    urls = NSArray.arrayWithObject(url)
  } catch {
    urls = null
  }

  const major = parseInt(String(plusAny.os?.version || '0'), 10) || 0
  if (major >= 14 && urls) {
    ios.invoke(picker, 'initForExportingURLs:asCopy:', urls, true)
  } else {
    // 1 = UIDocumentPickerModeExportToService
    ios.invoke(picker, 'initWithURL:inMode:', url, 1)
  }

  const root = rootViewController(ios)
  ios.invoke(root, 'presentViewController:animated:completion:', picker, true, null)
}

/** H5：直接下载一个 .md 文件 */
function downloadBlob(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // 立刻 revoke 会让部分浏览器来不及取数据，等一帧再释放
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 下载 Markdown 文件（App 端存储到「文件」App，H5 端直接下载）。
 *
 * @returns `'picker'` 已弹出保存位置选择器 / `'downloaded'` 已触发下载
 */
export async function saveMarkdownFile(
  title: string,
  body: string,
  opts: { onFileReady?: () => void } = {},
): Promise<'picker' | 'downloaded'> {
  const name = markdownFileName(title)
  const text = markdownText(body)

  // #ifdef APP-PLUS
  const plusAny = (globalThis as any).plus
  log('md', `开始：${name} · ${text.length} 字`)
  /*
   * 判「是不是 iOS」不要看 plus.os.name。
   * 它的文档值是 "iOS"，但不同基座返回过不同大小写甚至别的串，
   * 一旦比较失败就会误报「当前平台暂不支持保存文件」——这个坑已经踩过一次。
   * plus.ios 是 iOS 平台独有的桥接对象，它的存在性比字符串可靠。
   */
  if (!plusAny?.ios?.importClass) {
    // Android 上要落到公共目录得写 MediaStore / SAF，另做
    logError('md', `平台不支持：plus=${Boolean(plusAny)} ios=${Boolean(plusAny?.ios)}`)
    throw new Error('当前平台暂不支持保存文件')
  }
  let written: { abs: string; size: number }
  try {
    written = await writeDocFile(name, text)
  } catch (e) {
    logError('md', `写入失败：${(e as Error)?.message || e}`)
    throw e
  }
  log('md', `写入成功：${written.abs}（${written.size} 字节 / 正文 ${text.length} 字）`)
  // 留在诊断页：用户下次说「下载没成功」时，这一行能直接指出是写入、还是面板的问题
  recordExport({ name, path: written.abs, size: written.size, expect: text.length })
  // plus.io 偶尔「onwrite 回调成功、内容却没落盘」：文件存在但 0 字节。
  // 这种时候弹选择器只会让用户存下一个空文件，不如当场报错。
  if (text.length > 0 && written.size === 0) {
    logError('md', '文件写入为空（0 字节）')
    throw new Error('文件写入为空，请重试')
  }
  const abs = written.abs
  // 文件落地了：让调用方先收掉 loading，再弹系统选择器。
  // 系统选择器是 modal，loading 压在它下面会一直转，看起来像卡死。
  opts.onFileReady?.()
  await new Promise((resolve) => setTimeout(resolve, 60))
  try {
    presentFilePicker(abs)
    log('md', '已弹出「存储到文件」选择器')
  } catch (e) {
    // 文件选择器在某些越狱 / 老系统上可能拿不到；
    // 退回分享面板，至少让文件能出去，而不是点了毫无反应
    logError('md', `选择器失败，退回分享面板：${(e as Error)?.message || e}`)
    presentShareSheet(abs)
  }
  return 'picker'
  // #endif

  // #ifdef H5
  downloadBlob(name, text)
  return 'downloaded'
  // #endif

  throw new Error('当前环境不支持保存文件')
}

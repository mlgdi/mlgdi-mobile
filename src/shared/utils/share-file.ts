import { log, logError } from './logger'
import { recordExport } from './diag'
import { documentsDir, copyFile, ensureDir, fileSizeAt, nativeReady } from './native-fs'

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
 * 往某个目录 entry 里写文件，返回绝对路径与实际大小。
 *
 * 先删再建，而不是 truncate 后重写：新建的空文件上 truncate(0)
 * 有时不触发 onwrite；而同名文件不清空，短内容会把上一次的字留在尾部。
 */
function writeIntoDir(
  dirEntry: any,
  name: string,
  text: string,
): Promise<{ abs: string; size: number }> {
  return new Promise((resolve, reject) => {
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
  })
}

/** 往某个文件系统常量下写，`dirName` 为空表示直接写在根下。兜底用。 */
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
        if (!dirName) {
          writeIntoDir(fs.root, name, text).then(resolve, reject)
          return
        }
        fs.root.getDirectory(
          dirName,
          { create: true },
          (d: any) => writeIntoDir(d, name, text).then(resolve, reject),
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
 * 落点**优先真 `<sandbox>/Documents/Exports/`**：
 * - 那是 `UIFileSharingEnabled` 暴露给「文件」App 的目录，
 *   用户能在「我的 iPhone → 渡己 → Exports」里直接拿到文件 ——
 *   **「下载」的第一诉求是拿到文件，而不是每次都过一遍「存储到文件」面板**；
 * - 注意不是 `_documents` / `PUBLIC_DOCUMENTS`：那两个在 iOS 上落在
 *   `Library/Pandora/documents`，文件 App 根本看不见（0.7.26 踩过，
 *   诊断页显示导出路径是 `.../Library/Pandora/documents/Exports/...`）；
 * - 弹选择器保留，作为「另存到 iCloud / 其他 App」的第二条路。
 * 真 Documents 写不进时退回 DCloud 目录，至少还能交给选择器。
 *
 * 不再尝试 `uni.getFileSystemManager()`：那是小程序 API，App 端根本不存在
 * （诊断页一直显示「不可用」就是这个原因），先调它只是白试一次。
 */
async function writeDocFile(name: string, text: string): Promise<{ abs: string; size: number }> {
  const io = plusIO()
  if (!io && !nativeReady()) throw new Error('当前环境不支持写入文件')

  let lastError: Error | null = null
  let staging: { abs: string; size: number } | null = null

  /*
   * 分工写：plus.io 负责「写」，NSFileManager 负责「搬到 Documents」。
   *
   * 两份能力各自都被实测验证过：
   * - plus.io 写 `_doc` 是可靠的（0.7.28 日志里成功写出 3036 字节）；
   * - NSFileManager 的建目录 / 查文件 / 复制都通（0.7.30 自检：`Documents 目录`
   *   通过、`建 Exports` 通过、`Documents 内容` 里已经能看到 Exports），
   *   **唯独 `NSData writeToFile:atomically:` 写不进去**。
   *
   * 所以不去赌那个没验证过的一半，改成「先写到能写的地方，再搬过去」。
   */
  if (io) {
    try {
      staging = await withTimeout(writeOne(io.PRIVATE_DOC, '', name, text), 8000, '写入文件超时，请重试')
      log('md', `暂存成功：${staging.abs}（${staging.size} 字节）`)
    } catch (e) {
      lastError = e as Error
      logError('md', `写 _doc 失败：${lastError?.message || lastError}`)
    }
  }

  const docs = await documentsDir()
  if (staging && docs) {
    const dir = `${docs}/Exports`
    if (!ensureDir(dir)) {
      logError('md', `建 ${dir} 失败`)
    } else {
      const dest = `${dir}/${name}`
      const src = staging.abs.startsWith('/') ? staging.abs : toAbsolute(staging.abs)
      if (copyFile(src, dest)) {
        const size = fileSizeAt(dest)
        if (size > 0 || text.length === 0) {
          log('md', `已搬到 ${dest}（${size} 字节）`)
          return { abs: dest, size }
        }
        logError('md', `${dest} 复制后为 ${size} 字节`)
      } else {
        logError('md', `复制 ${src} -> ${dest} 失败`)
      }
    }
  } else if (!docs) {
    logError('md', '拿不到 Documents 路径')
  }

  // 退回 DCloud 目录：用户看不见，但文件真的在，还能交给面板
  if (staging) {
    log('md', '留在 DCloud 目录（Documents 不可写）')
    return staging
  }

  // 连 plus.io 都写不了，最后再试一次 DCloud 的 PUBLIC_DOCUMENTS
  if (io) {
    const targets: { fsConst: number; dir: string }[] = []
    if (io.PUBLIC_DOCUMENTS !== undefined) {
      targets.push({ fsConst: io.PUBLIC_DOCUMENTS, dir: 'Exports' })
    }
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
 * 弹出「存储到文件」——系统文件 App 的保存位置选择器。
 *
 * ⚠️ 当前**没有接入**（见 `saveMarkdownFile` 里的 `openPicker` 说明）：
 * 在这个侧载包上 present 之后没有任何可见反应，不抛异常、回调也不来，
 * 调用方拿不到任何信号。保留实现是因为它本身没有问题 —— 等确认了
 * rootViewController 的表现随时可以切回来。
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
    // 光非空不够：拿到一个 count 为 0 的数组同样会让面板空白
    if (urls && Number(ios.invoke(urls, 'count')) !== 1) urls = null
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

/** 最近一次成功导出的绝对路径。给「下载完成 → 打开」用。 */
let lastSavedPath = ''

/**
 * 打开最近一次导出的文件。
 *
 * 用系统分享面板（`UIActivityViewController`）而不是「存储到文件」
 * （`UIDocumentPickerViewController`）：前者验证过能弹，后者在 0.7.28 上
 * present 之后没有任何反应。分享面板里同样有「存储到文件」，能选目录、
 * 也能直接发出去或用别的 App 打开 —— 一个面板覆盖「另存到指定目录」和
 * 「打开看看」两件事。
 */
export async function openLastSaved(): Promise<void> {
  if (!lastSavedPath) throw new Error('还没有导出过文件')
  presentShareSheet(lastSavedPath)
}

/**
 * 下载 Markdown 文件（App 端存储到「文件」App，H5 端直接下载）。
 *
 * @returns `'picker'` 已弹出保存位置选择器 / `'downloaded'` 已触发下载
 */
export async function saveMarkdownFile(
  title: string,
  body: string,
  opts: { onFileReady?: () => void; openPicker?: boolean } = {},
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
  lastSavedPath = abs
  // 文件落地了：让调用方先收掉 loading，再弹系统选择器。
  // 系统选择器是 modal，loading 压在它下面会一直转，看起来像卡死。
  opts.onFileReady?.()

  /*
   * `openPicker` 默认 false —— 不再自动弹「存储到文件」。
   *
   * 理由（0.7.27 实测）：`UIDocumentPickerViewController` 在这个侧载包上
   * present 之后没有任何可见反应，而它失败时不抛异常、回调也不会来，
   * 调用方拿不到任何信号。结果就是用户点了「下载」看到的是「什么都没发生」。
   * 文件其实已经写进 `<sandbox>/Documents/Exports`（「文件」App 里可见），
   * 所以正确的反馈是把位置说清楚，而不是再弹一个大概率不出现的面板。
   *
   * 需要「另存到 iCloud / 发出去」时，可以显式传 openPicker: true
   * ——分享面板（UIActivityViewController）这条路是验证过能弹的。
   */
  if (opts.openPicker) {
    await new Promise((resolve) => setTimeout(resolve, 60))
    try {
      presentShareSheet(abs)
      log('md', '已弹出系统面板')
    } catch (e) {
      logError('md', `分享面板失败：${(e as Error)?.message || e}`)
    }
  }
  return 'picker'
  // #endif

  // #ifdef H5
  downloadBlob(name, text)
  return 'downloaded'
  // #endif

  throw new Error('当前环境不支持保存文件')
}

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
    const url = String(plusAny?.io?.convertLocalFileURL?.(local) || local)
    return url.replace(/^file:\/\//, '')
  } catch {
    return local
  }
}

/**
 * 写 `_doc/<name>`，返回绝对路径。
 *
 * 优先 `uni.getFileSystemManager().writeFile`：它是 uni 封装的 fs 接口，
 * 成功/失败回调用法明确，`encoding: 'utf8'` 也直白。**plus.io 那套
 * （requestFileSystem → getFile → createWriter）在 iOS 上有回调不回来的情况 ——
 * 表现就是你看到的「点了下载毫无反应」**：既没报错也没面板，Promise 永远挂着。
 * 所以在它下面还加了一层超时，任何一步不回来都会在 8 秒后变成可读的错误。
 */
function writeDocFile(name: string, text: string): Promise<string> {
  const local = `_doc/${name}`

  const viaFsm = (): Promise<void> => {
    const fsm: any = (uni as any).getFileSystemManager?.()
    if (!fsm?.writeFile) return Promise.reject(new Error('no-fsm'))
    return new Promise<void>((resolve, reject) => {
      fsm.writeFile({
        filePath: local,
        data: text,
        encoding: 'utf8',
        success: () => resolve(),
        fail: (e: any) => reject(new Error(String(e?.errMsg || '写入失败'))),
      })
    })
  }

  const viaPlusIO = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const plusAny = (globalThis as any).plus
      if (!plusAny?.io) {
        reject(new Error('当前环境不支持写入文件'))
        return
      }
      plusAny.io.requestFileSystem(
        plusAny.io.PRIVATE_DOC,
        (fs: any) => {
          // 先删再建，而不是 truncate 后重写：新建的空文件上 truncate(0)
          // 有时不触发 onwrite；而同名文件不清空，短内容会把上一次的字留在尾部。
          const create = (): void => {
            fs.root.getFile(
              name,
              { create: true },
              (entry: any) => {
                entry.createWriter(
                  (writer: any) => {
                    writer.onwrite = () => {
                      const raw = String(entry.fullPath || '')
                      resolve(raw.startsWith('/') ? raw : toAbsolute(raw))
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

          fs.root.getFile(
            name,
            { create: false },
            (old: any) => old.remove(create, create),
            create, // 不存在才算正常，直接建
          )
        },
        () => reject(new Error('无法访问应用目录')),
      )
    })
  }

  return (async () => {
    try {
      await withTimeout(viaFsm(), 8000, '写入文件超时，请重试')
      return toAbsolute(local)
    } catch (e) {
      // FileSystemManager 不可用才退回 plus.io；它自身失败（含超时）直接上抛，
      // 不要用第二套大概率同样卡住的实现再等 8 秒
      if (String((e as Error)?.message || '') !== 'no-fsm') throw e
    }
    return withTimeout(viaPlusIO(), 8000, '写入文件超时，请重试')
  })()
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
  const NSArray = ios.importClass('NSArray')
  const urls = NSArray.arrayWithObject(url)

  const PickerClass = ios.importClass('UIDocumentPickerViewController')
  let picker: any
  try {
    picker = new (PickerClass as any)()
  } catch {
    picker = ios.newObject?.('UIDocumentPickerViewController')
  }
  if (!picker) throw new Error('无法创建文件选择器')

  const major = parseInt(String(plusAny.os?.version || '0'), 10) || 0
  if (major >= 14) {
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
  // plus.os.name 返回的是 'iOS'（首字母大写），直接跟 'ios' 比较会永远不等 ——
  // 表现就是 iOS 上点下载弹「当前平台暂不支持保存文件」。统一转小写再比。
  if (!plusAny || String(plusAny.os?.name || '').toLowerCase() !== 'ios') {
    // Android 上要落到公共目录得写 MediaStore / SAF，另做
    throw new Error('当前平台暂不支持保存文件')
  }
  const abs = await writeDocFile(name, text)
  // 文件落地了：让调用方先收掉 loading，再弹系统选择器。
  // 系统选择器是 modal，loading 压在它下面会一直转，看起来像卡死。
  opts.onFileReady?.()
  await new Promise((resolve) => setTimeout(resolve, 60))
  try {
    presentFilePicker(abs)
  } catch {
    // 文件选择器在某些越狱 / 老系统上可能拿不到；
    // 退回分享面板，至少让文件能出去，而不是点了毫无反应
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

/**
 * iOS 沙盒路径解析 —— 找到**真正的** `<sandbox>/Documents`。
 *
 * ## 为什么不能直接用 `_documents` 或 `plus.io.PUBLIC_DOCUMENTS`
 *
 * 这两个在 iOS 上都解析到 DCloud 自己的目录
 * `Library/Pandora/documents`（0.7.26 诊断页实测的绝对路径：
 * `/var/mobile/.../Application/<UUID>/Library/Pandora/documents/Inbox`），
 * **不是**系统的 `<sandbox>/Documents`。
 *
 * 而两件事只认后者：
 * 1. iOS 的 document interaction（「用某某打开」）只会把外来文件复制进
 *    `<sandbox>/Documents/Inbox/`；
 * 2. Info.plist 的 `UIFileSharingEnabled` 只把 `<sandbox>/Documents`
 *    暴露到「文件」App → 我的 iPhone → 渡己。
 *
 * 所以「共享收不到」和「下载的文件在文件 App 里找不到」是同一个根因：
 * 一直在跟 `Library/Pandora/documents` 打交道。
 *
 * ## 怎么拿到真路径
 *
 * `plus.io` 只接受文件系统常量，给不了任意绝对路径；但它能给出 `_doc` 的
 * 绝对路径（`.../Application/<UUID>/Library/Pandora/apps/<appid>/doc`）。
 * 把 `/Library/` 之后整段切掉，剩下的就是沙盒根 —— 不依赖任何私有 API，
 * 也不受 DCloud 改子目录布局的影响（只要它仍在 `Library/` 下）。
 */

/** plus.io，非 App 端为 undefined */
export function plusIO(): any {
  return (globalThis as any).plus?.io
}

/**
 * `plus.io.requestFileSystem` 的 `root.fullPath`。
 *
 * 带超时：这个回调在个别基座上不回来，而它挡在所有文件操作的最前面，
 * 一旦挂住，导入页会一直空白、下载会一直转，比拿错目录更难查。
 */
export function fsRoot(fsConst: number, timeout = 1500): Promise<string> {
  return new Promise((resolve) => {
    const io = plusIO()
    if (!io?.requestFileSystem || fsConst === undefined) {
      resolve('')
      return
    }
    let done = false
    const finish = (value: string): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(''), timeout)
    try {
      io.requestFileSystem(
        fsConst,
        (fs: any) => finish(String(fs?.root?.fullPath || '').replace(/\/+$/, '')),
        () => finish(''),
      )
    } catch {
      finish('')
    }
  })
}

let cachedRoot: string | null = null

/**
 * 真正的沙盒根目录：`/var/mobile/Containers/Data/Application/<UUID>`。
 * 拿不到返回空串（调用方各自退回旧路径，不能因此崩掉）。
 *
 * 只缓存成功结果：冷启动时 plus.io 可能还没完全就绪，
 * 把「没拿到」缓存下来会让整个会话都走错分支。
 */
export async function sandboxRoot(): Promise<string> {
  if (cachedRoot !== null) return cachedRoot
  const io = plusIO()
  if (!io || io.PRIVATE_DOC === undefined) return ''
  const docRoot = await fsRoot(io.PRIVATE_DOC)
  const idx = docRoot.indexOf('/Library/')
  if (idx > 0) {
    cachedRoot = docRoot.slice(0, idx)
    return cachedRoot
  }
  return ''
}

/** 真正的 `<sandbox>/Documents`。拿不到返回空串。 */
export async function sandboxDocuments(): Promise<string> {
  const root = await sandboxRoot()
  return root ? `${root}/Documents` : ''
}

/** 真正的 `<sandbox>/Documents/Inbox`（系统接收外来文件的位置）。 */
export async function sandboxInbox(): Promise<string> {
  const docs = await sandboxDocuments()
  return docs ? `${docs}/Inbox` : ''
}

/**
 * 文件与图片读取（跨端）。
 *
 * 影响端范围：App / H5。小程序端不开放导入（域名白名单 + 无文件系统）。
 *
 * 为什么不用 uni.chooseFile 一把梭：H5 端的 chooseFile 依赖 `input[type=file]`，
 * App 端在部分基座版本上不可用；两条路各写一段比到处 try/catch 更好排查。
 */

export interface PickedFile {
  name: string
  content: string
}

/** 从 Markdown 文本里推断标题：先找一级标题，退化为文件名。 */
export function guessTitle(content: string, fileName = ''): string {
  const text = content || ''
  // 跳过 front-matter，避免把 `title:` 之外的键误当标题
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const heading = body.match(/^\s*#\s+(.+)$/m)
  if (heading) return heading[1].trim().slice(0, 200)
  if (fileName) {
    return fileName.replace(/\.(md|markdown|txt)$/i, '').trim().slice(0, 200)
  }
  const firstLine = body.trim().split(/\r?\n/)[0] || ''
  return firstLine.replace(/^#+\s*/, '').trim().slice(0, 200) || '未命名导入'
}

function fileNameFromPath(path: string): string {
  const parts = String(path || '').split(/[\\/]/)
  return parts[parts.length - 1] || 'import.md'
}

// #ifdef H5
function pickOnH5(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    // 部分系统只认 MIME 不认扩展名，两个都给
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    let settled = false
    const finish = (value: PickedFile | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return finish(null)
      const reader = new FileReader()
      reader.onload = () => finish({ name: file.name || 'import.md', content: String(reader.result || '') })
      reader.onerror = () => finish(null)
      reader.readAsText(file, 'utf-8')
    }
    // 用户取消时不会触发 change，靠 focus 兜底避免 Promise 永远挂着
    window.addEventListener('focus', () => setTimeout(() => finish(null), 1500), { once: true })
    input.click()
  })
}
// #endif

// #ifdef APP-PLUS
function readAppTextFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const plusAny = (window as any).plus
    plusAny.io.resolveLocalFileSystemURL(
      path,
      (entry: any) => {
        entry.file(
          (file: any) => {
            const reader = new plusAny.io.FileReader()
            reader.onloadend = (e: any) => resolve(String(e.target.result || ''))
            reader.onerror = () => reject(new Error('读取文件失败'))
            reader.readAsText(file, 'utf-8')
          },
          () => reject(new Error('读取文件失败')),
        )
      },
      () => reject(new Error('无法打开文件')),
    )
  })
}

function pickOnApp(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    uni.chooseFile({
      count: 1,
      type: 'all',
      extension: ['.md', '.markdown', '.txt'],
      success: async (res: any) => {
        const path = (res.tempFilePaths && res.tempFilePaths[0]) || ''
        if (!path) return resolve(null)
        try {
          const content = await readAppTextFile(path)
          resolve({ name: fileNameFromPath(path), content })
        } catch {
          resolve(null)
        }
      },
      fail: () => resolve(null),
    })
  })
}
// #endif

export async function pickMarkdownFile(): Promise<PickedFile | null> {
  // #ifdef H5
  return pickOnH5()
  // #endif
  // #ifdef APP-PLUS
  return pickOnApp()
  // #endif
  // #ifdef MP-WEIXIN
  return null
  // #endif
  return null
}

/** 剪贴板读取：可能是链接、一段 Markdown，也可能什么都没有 */
export function readClipboard(): Promise<string> {
  return new Promise((resolve) => {
    uni.getClipboardData({
      success: (res: any) => resolve(String(res.data || '')),
      fail: () => resolve(''),
    })
  })
}

// #ifdef APP-PLUS
function readAppImageAsDataUrl(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const plusAny = (window as any).plus
    plusAny.io.resolveLocalFileSystemURL(
      path,
      (entry: any) => {
        entry.file(
          (file: any) => {
            const reader = new plusAny.io.FileReader()
            reader.onloadend = (e: any) => resolve(String(e.target.result || ''))
            reader.onerror = () => reject(new Error('读取图片失败'))
            reader.readAsDataURL(file)
          },
          () => reject(new Error('读取图片失败')),
        )
      },
      () => reject(new Error('无法打开图片')),
    )
  })
}
// #endif

/** 选图并转成 data URL（后端 capture 接受 data URL / 裸 base64，最多 4 张） */
export function pickImages(count = 4): Promise<string[]> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      success: async (res: any) => {
        const paths: string[] = res.tempFilePaths || []
        const out: string[] = []
        for (const path of paths) {
          try {
            // #ifdef H5
            const blob = await fetch(path).then((r) => r.blob())
            const dataUrl = await new Promise<string>((done) => {
              const reader = new FileReader()
              reader.onload = () => done(String(reader.result || ''))
              reader.onerror = () => done('')
              reader.readAsDataURL(blob)
            })
            if (dataUrl) out.push(dataUrl)
            // #endif
            // #ifdef APP-PLUS
            out.push(await readAppImageAsDataUrl(path))
            // #endif
          } catch {
            /* 单张失败不影响其他张 */
          }
        }
        resolve(out)
      },
      fail: () => resolve([]),
    })
  })
}

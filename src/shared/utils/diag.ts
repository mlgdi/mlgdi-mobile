/**
 * 运行时诊断。
 *
 * 背景：真机上的失败是「静默」的 —— 点了没反应、跳转了没动作，而日志要
 * 连 Mac 才能看。与其反复猜，不如把几项关键状态摆到页面上：
 * 平台判断依据、文件系统 API 在不在、Inbox 里到底有没有文件、上次操作为什么失败。
 *
 * 这个模块只做「记录 + 读取」，不参与任何业务判断，失败也绝不抛错。
 */
import { INBOX_PATH, inboxDiagnostics, type InboxDiagnostics } from './inbox-import'

export interface DiagError {
  /** 本地时间字符串，够用即可 */
  at: string
  /** 哪个动作失败的，如 'save-md' */
  scope: string
  message: string
}

/** 最近一次「下载 Markdown」的结果：直接回答「文件到底写没写出来」 */
export interface DiagExport {
  at: string
  name: string
  /** 绝对路径。不是绝对路径就说明 plus.io 没解析成功 */
  path: string
  /** 真实字节数；-1 = 读不到（文件不存在或 entry.file 失败） */
  size: number
  /** 写入的字符数。中文一字三字节，所以不和 size 直接比 */
  expect: number
}

export interface DiagEnv {
  osName: string
  osVersion: string
  /** 有没有 plus.ios —— 我们现在用它判断「是不是 iOS」，比 os.name 可靠 */
  hasPlusIOS: boolean
  /**
   * uni.getFileSystemManager 是否可用。
   * App 端实测**不可用**（那是小程序 API），下载改走 plus.io 后这一项只作参考。
   */
  hasFsm: boolean
  inbox: InboxDiagnostics
  lastExport: DiagExport | null
}

const ERROR_KEY = 'garden.diag.errors'
const EXPORT_KEY = 'garden.diag.export'
const MAX_ERRORS = 8

export function recordError(scope: string, message: string): void {
  try {
    const raw = uni.getStorageSync(ERROR_KEY)
    const list: DiagError[] = Array.isArray(raw) ? raw : []
    list.unshift({
      at: new Date().toLocaleTimeString(),
      scope,
      message: message || '(空)',
    })
    uni.setStorageSync(ERROR_KEY, list.slice(0, MAX_ERRORS))
  } catch {
    /* 诊断本身不能成为新的故障点 */
  }
}

export function readErrors(): DiagError[] {
  try {
    const raw = uni.getStorageSync(ERROR_KEY)
    return Array.isArray(raw) ? (raw as DiagError[]) : []
  } catch {
    return []
  }
}

export function clearErrors(): void {
  try {
    uni.removeStorageSync(ERROR_KEY)
  } catch {
    /* 忽略 */
  }
}

/**
 * 记下最近一次导出的结果。
 *
 * 为什么值得单独存一条：`plus.io` 的 `onwrite` 回调成功、内容却没落盘的情况
 * 是真实存在的，而弹「存储到文件」面板时我们拿不到用户有没有真的保存。
 * 把「写了多少字节」摆出来，`size=0` 与 `size>0` 就是两种完全不同的故障。
 */
export function recordExport(info: Omit<DiagExport, 'at'>): void {
  try {
    uni.setStorageSync(EXPORT_KEY, { at: new Date().toLocaleString(), ...info })
  } catch {
    /* 诊断本身不能成为新的故障点 */
  }
}

export function readExport(): DiagExport | null {
  try {
    const raw = uni.getStorageSync(EXPORT_KEY)
    return raw && typeof raw === 'object' ? (raw as DiagExport) : null
  } catch {
    return null
  }
}

export async function collectEnv(): Promise<DiagEnv> {
  const plusAny = (globalThis as any).plus
  const inbox = await inboxDiagnostics().catch(() => ({
    dir: INBOX_PATH,
    absDir: '',
    total: 0,
    usable: 0,
    names: [] as string[],
    others: [] as { dir: string; total: number }[],
  }))

  return {
    // 原样输出：字符串比较失败的原因，往往就在这个值的实际形态上
    osName: plusAny?.os?.name ?? '(无 plus.os)',
    osVersion: plusAny?.os?.version ?? '(未知)',
    hasPlusIOS: Boolean(plusAny?.ios?.importClass),
    hasFsm: Boolean((uni as any).getFileSystemManager),
    inbox,
    lastExport: readExport(),
  }
}

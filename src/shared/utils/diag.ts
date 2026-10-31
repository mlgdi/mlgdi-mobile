/**
 * 运行时诊断。
 *
 * 背景：真机上的失败是「静默」的 —— 点了没反应、跳转了没动作，而日志要
 * 连 Mac 才能看。与其反复猜，不如把几项关键状态摆到页面上：
 * 平台判断依据、文件系统 API 在不在、Inbox 里到底有没有文件、上次操作为什么失败。
 *
 * 这个模块只做「记录 + 读取」，不参与任何业务判断，失败也绝不抛错。
 */
import { INBOX_PATH, inboxDiagnostics } from './inbox-import'

export interface DiagError {
  /** 本地时间字符串，够用即可 */
  at: string
  /** 哪个动作失败的，如 'save-md' */
  scope: string
  message: string
}

export interface DiagEnv {
  osName: string
  osVersion: string
  /** 有没有 plus.ios —— 我们现在用它判断「是不是 iOS」，比 os.name 可靠 */
  hasPlusIOS: boolean
  /** uni.getFileSystemManager 是否可用（下载 md 的第一条写文件路径） */
  hasFsm: boolean
  inbox: { dir: string; total: number; usable: number; names: string[] }
}

const ERROR_KEY = 'garden.diag.errors'
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

export async function collectEnv(): Promise<DiagEnv> {
  const plusAny = (globalThis as any).plus
  const inbox = await inboxDiagnostics().catch(() => ({
    dir: INBOX_PATH,
    total: 0,
    usable: 0,
    names: [] as string[],
  }))

  return {
    // 原样输出：字符串比较失败的原因，往往就在这个值的实际形态上
    osName: plusAny?.os?.name ?? '(无 plus.os)',
    osVersion: plusAny?.os?.version ?? '(未知)',
    hasPlusIOS: Boolean(plusAny?.ios?.importClass),
    hasFsm: Boolean((uni as any).getFileSystemManager),
    inbox,
  }
}

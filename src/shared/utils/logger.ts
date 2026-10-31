/**
 * 运行时日志。
 *
 * 目的只有一个：真机出问题时，用户能把「发生了什么」复制给我，而不是只描述
 * 「点了没反应」。所以它必须满足三点 ——
 *
 * 1. **极轻**：写内存数组 + 400ms 防抖落 storage，绝不 await、绝不阻塞主流程；
 * 2. **有界**：环形缓冲 400 条，写满就丢最旧的，不会把 storage 撑爆；
 * 3. **可脱敏**：token / 密码一律替换成 `***`，日志是拿去贴给人看的。
 *
 * 埋点原则：只记「跨进程/跨文件」这类看不出来的动作（写文件、弹面板、
 * 扫目录、请求失败），不记纯 UI 事件 —— 否则日志很快被噪音填满。
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  /** HH:mm:ss.SSS */
  t: string
  lvl: LogLevel
  tag: string
  msg: string
}

const KEY = 'garden.logs'
const MAX = 400
const FLUSH_MS = 400

let buf: LogEntry[] = []
let loaded = false
let timer: ReturnType<typeof setTimeout> | null = null

function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** 日志会被人复制粘贴出去，token 不能出现在里面 */
function scrub(s: string): string {
  return (
    s
      // 请求头
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
      // JSON 里的敏感字段
      .replace(/"(token|deviceSecret|password|secret)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
      // 路径里的签名（分享卡片的 URL 一类）
      .replace(/([?&](?:token|key|sig)=)[^&\s]+/gi, '$1***')
  )
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = uni.getStorageSync(KEY)
    if (Array.isArray(raw)) buf = raw as LogEntry[]
  } catch {
    buf = []
  }
}

/** 防抖落盘：写 storage 是同步 IO，不能在每次 log 时都做 */
function scheduleFlush(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    try {
      uni.setStorageSync(KEY, buf)
    } catch {
      // 存储满 / 不可写：日志本身不能成为故障源
    }
  }, FLUSH_MS)
}

function push(level: LogLevel, tag: string, raw: string): void {
  ensureLoaded()
  const msg = scrub(String(raw))
  // 最新的在最前，页面直接顺序渲染即可
  buf.unshift({ t: stamp(), lvl: level, tag, msg })
  if (buf.length > MAX) buf.length = MAX
  // 同时打到控制台：连 Mac 远程调试时也能看到
  try {
    if (level === 'error') console.error(`[${tag}] ${msg}`)
    else if (level === 'warn') console.warn(`[${tag}] ${msg}`)
    else console.log(`[${tag}] ${msg}`)
  } catch {
    /* 控制台不可用忽略 */
  }
  scheduleFlush()
}

export function log(tag: string, msg: string): void {
  push('info', tag, msg)
}

export function logWarn(tag: string, msg: string): void {
  push('warn', tag, msg)
}

/** 错误一律走这里：`Error` 只留 message，其他类型原样转字符串 */
export function logError(tag: string, err: unknown): void {
  const msg =
    err instanceof Error
      ? err.message || err.name
      : typeof err === 'string'
        ? err
        : JSON.stringify(err)
  push('error', tag, msg || '(空错误)')
}

export function readLogs(): LogEntry[] {
  ensureLoaded()
  return [...buf]
}

export function clearLogs(): void {
  buf = []
  loaded = true
  try {
    uni.removeStorageSync(KEY)
  } catch {
    /* 忽略 */
  }
}

/** 导出成纯文本（时间正序），便于整段复制 */
export function exportLogs(): string {
  ensureLoaded()
  if (!buf.length) return ''
  return [...buf]
    .reverse()
    .map((e) => `${e.t} [${e.lvl}] ${e.tag}: ${e.msg}`)
    .join('\n')
}

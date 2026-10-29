import { indexVersion } from '../api/notes'
import { useNotesStore } from '../store/notes'

/**
 * 索引变更自动同步（与 Web 端 useAutoSync 同一套思路）。
 *
 * 移动端 notes.load() 有 5 分钟缓存：在 Web / Obsidian 那边改了东西，
 * 手机上五分钟内看不到。这里每 15 秒问一次版本号，变了就强制重拉。
 *
 * 用轮询不用 SSE：省掉跨线程/断线重连/代理 buffering，代价是最多 15 秒延迟。
 * 应用切到后台时应该停掉（onHide/onShow 由调用方控制 start/stop）。
 */
const POLL_MS = 15_000

let timer: ReturnType<typeof setInterval> | undefined
let baseline: number | null = null

async function tick(): Promise<void> {
  try {
    const { version } = await indexVersion()
    if (baseline === null) {
      baseline = version
      return
    }
    if (version === baseline) return
    baseline = version
    const notes = useNotesStore()
    await notes.load(true)
  } catch {
    // 网络抖动 / 后端重启：下一轮自己追上
  }
}

export function startAutoSync(): void {
  if (timer !== undefined) return
  void tick()
  timer = setInterval(() => void tick(), POLL_MS)
}

export function stopAutoSync(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }
}

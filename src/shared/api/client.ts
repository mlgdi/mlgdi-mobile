/**
 * HTTP 客户端：统一鉴权、错误归一、无感续期。
 *
 * 三条规则：
 * 1. 每个请求带 `Authorization` + `X-Device-Key`（设备绑定的 token 缺后者必 401）；
 * 2. 错误统一抛 ApiError，**reason 优先取 detail.reason**（与 Web 端约定一致），
 *    页面只负责展示，不再各自解析响应体；
 * 3. `DEVICE_MISMATCH` 不做续期重试——那是凭证/设备被吊销，只能重新登录；
 *    `UNAUTHORIZED` 才尝试用 refresh_token 换一次。
 */
import { logError } from '../utils/logger'
import { getBaseUrl } from '../config/server'
import { clearSession, readSession, writeSession } from '../auth/session'
import { beginLoading, endLoading, toast } from '../ui/feedback'

export class ApiError extends Error {
  status: number
  code: string
  reason: string

  constructor(status: number, code: string, message: string, reason = '') {
    super(message)
    this.status = status
    this.code = code
    this.reason = reason || message
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** 默认 true；游客可读接口传 false 以免过期 token 把请求变成 401 */
  auth?: boolean
  timeout?: number
  /**
   * 不挂「延迟加载」浮层。
   *
   * 什么时候传 true：
   * - 后台轮询（每 15 秒问一次版本号），它压根不是用户发起的；
   * - 页面自己已经有可见的加载态（列表骨架、正文「正在打开…」、按钮转圈），
   *   再叠一个全屏浮层就是双重指示，反而更乱。
   *
   * 默认 **false**：用户点一下之后没有任何可见反馈，是最难受的等待。
   */
  silent?: boolean
}

type Query = RequestOptions['query']

function buildUrl(opts: RequestOptions): string {
  const base = getBaseUrl()
  const search: string[] = []
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === undefined || value === null || value === '') continue
      search.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return `${base}${opts.path}${search.length ? `?${search.join('&')}` : ''}`
}

function send(opts: RequestOptions): Promise<{ status: number; data: any }> {
  const session = readSession()
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false && session.token) {
    header.Authorization = `Bearer ${session.token}`
  }
  if (session.deviceSecret) {
    header['X-Device-Key'] = session.deviceSecret
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url: buildUrl(opts),
      // uni 的类型声明缺 PATCH（运行时 H5/App 都支持），这里放宽
      method: (opts.method || 'GET') as any,
      data: opts.body as any,
      header,
      timeout: opts.timeout ?? 15000,
      success: (res: any) => resolve({ status: res.statusCode, data: res.data }),
      fail: (err: any) =>
        reject(new ApiError(0, 'NETWORK_ERROR', (err && err.errMsg) || '网络请求失败')),
    })
  })
}

/**
 * 下载二进制资源（图片）到本地临时文件。
 *
 * `<image src>` 带不了 Authorization 头，所以先用带鉴权的请求把图取回来，
 * 拿到 tempFilePath 再交给 `<image>` 显示 / `saveImageToPhotosAlbum` 保存。
 */
export async function download(opts: {
  path: string
  query?: Query
  timeout?: number
  silent?: boolean
}): Promise<string> {
  const session = readSession()
  const header: Record<string, string> = {}
  if (session.token) header.Authorization = `Bearer ${session.token}`
  if (session.deviceSecret) header['X-Device-Key'] = session.deviceSecret
  const quiet = opts.silent === true
  if (!quiet) beginLoading()

  try {
    return await new Promise<string>((resolve, reject) => {
      uni.downloadFile({
        url: buildUrl({ path: opts.path, query: opts.query }),
        header,
        timeout: opts.timeout ?? 20000,
        success: (res: any) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            resolve(res.tempFilePath)
            return
          }
          reject(new ApiError(res.statusCode || 0, 'DOWNLOAD_FAILED', '图片生成失败'))
        },
        fail: (err: any) =>
          reject(new ApiError(0, 'NETWORK_ERROR', (err && err.errMsg) || '网络请求失败')),
      })
    })
  } finally {
    if (!quiet) endLoading()
  }
}

function toApiError(status: number, data: any): ApiError {
  const body = data && typeof data === 'object' ? data : {}
  const code = String(body.code || `HTTP_${status}`)
  const message = String(body.message || '请求失败')
  const reason = String((body.detail && body.detail.reason) || '')
  return new ApiError(status, code, message, reason)
}

let refreshing: Promise<boolean> | null = null

/** 单飞续期：并发请求同时 401 时只打一次 refresh。 */
function refreshOnce(): Promise<boolean> {
  if (refreshing) return refreshing
  const session = readSession()
  if (!session.refreshToken) return Promise.resolve(false)

  refreshing = (async () => {
    try {
      const res = await send({
        method: 'POST',
        path: '/api/v1/auth/refresh',
        body: { refresh_token: session.refreshToken },
        auth: false,
      })
      if (res.status !== 200 || !res.data || !res.data.access_token) return false
      writeSession({
        token: String(res.data.access_token),
        deviceId: res.data.device_id ? String(res.data.device_id) : session.deviceId,
      })
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

let redirecting = false

function goLogin(reason: string): void {
  if (redirecting) return
  redirecting = true
  clearSession()
  toast(reason)
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/index' })
    redirecting = false
  }, 300)
}

export async function request<T>(opts: RequestOptions): Promise<T> {
  const label = `${opts.method || 'GET'} ${opts.path}`
  const quiet = opts.silent === true
  // 0.5 秒后才出现，且并发请求只算一个 —— 具体逻辑在 ui/feedback.ts
  if (!quiet) beginLoading()

  try {
    let res
    try {
      res = await send(opts)
    } catch (e) {
      // 网络层直接失败（断网、地址错、超时）：这条最容易「看起来没反应」
      logError('api', `${label} 网络失败：${(e as Error)?.message || e}`)
      throw e
    }

    if (res.status === 401) {
      const err = toApiError(res.status, res.data)
      // 设备凭证问题：重试没意义，直接回登录
      if (err.code === 'DEVICE_MISMATCH') {
        goLogin(err.reason)
        throw err
      }
      // 只对普通过期做一次续期
      if (opts.auth !== false && err.code === 'UNAUTHORIZED') {
        if (await refreshOnce()) {
          res = await send(opts)
        }
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return res.data as T
    }
    const err = toApiError(res.status, res.data)
    // 只记失败：成功的请求太吵，会把日志冲掉
    logError('api', `${label} -> ${res.status} ${err.code}${err.reason ? ` · ${err.reason}` : ''}`)
    throw err
  } finally {
    if (!quiet) endLoading()
  }
}

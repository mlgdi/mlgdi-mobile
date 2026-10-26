/**
 * 服务器地址：默认线上域名，允许用户在客户端修改。
 *
 * 为什么不做成写死的常量：上线前要用局域网地址联调（http://192.168.1.88:8010），
 * 上线后是 https://www.mlgdi.com，中间还可能挂反代。写死意味着每换一次环境重新打包。
 *
 * 影响端范围：全端（但小程序端不暴露修改入口——request 合法域名是后台白名单，
 * 改了也发不出去）。
 */

export const DEFAULT_BASE_URL = 'https://www.mlgdi.com'

const STORAGE_KEY = 'garden.server'

/** 去掉首尾空白与末尾斜杠：拼接路径时少一个 `/` 会变成 `//api`，部分服务端会 404。 */
export function normalizeBaseUrl(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '')
}

export function isValidBaseUrl(raw: string): boolean {
  const url = normalizeBaseUrl(raw)
  // 只认 http/https，且必须带主机名；不接受仅协议或带空格的串
  return /^https?:\/\/[^\s/]+$/i.test(url)
}

export function isPlainHttp(raw: string): boolean {
  return normalizeBaseUrl(raw).toLowerCase().startsWith('http://')
}

export function getBaseUrl(): string {
  let saved = ''
  try {
    saved = normalizeBaseUrl(String(uni.getStorageSync(STORAGE_KEY) || ''))
  } catch {
    saved = ''
  }
  return isValidBaseUrl(saved) ? saved : DEFAULT_BASE_URL
}

export function setBaseUrl(raw: string): string {
  const url = normalizeBaseUrl(raw)
  if (!isValidBaseUrl(url)) {
    throw new Error('地址需形如 https://example.com，且不能带路径')
  }
  uni.setStorageSync(STORAGE_KEY, url)
  return url
}

export function resetBaseUrl(): void {
  uni.removeStorageSync(STORAGE_KEY)
}

/**
 * 服务器指纹，用于给本地凭证的存储键加命名空间。
 *
 * **这是整套多环境设计里最关键的一行**：登录态如果只存一个 key，
 * 从测试服切到正式服时会把 A 服的 token 发给 B 服，表现为莫名其妙的 401。
 */
export function serverFingerprint(base: string = getBaseUrl()): string {
  return normalizeBaseUrl(base)
    .replace(/^https?:\/\//i, '')
    .replace(/[^A-Za-z0-9.:-]/g, '-')
}

export interface ProbeResult {
  ok: boolean
  latency: number
  version?: string
  error?: string
}

/** 连接测试：打 `/healthz`（公开接口，不需要登录）。 */
export function probeServer(base: string): Promise<ProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    uni.request({
      url: `${normalizeBaseUrl(base)}/healthz`,
      method: 'GET',
      timeout: 6000,
      success: (res: any) => {
        const data = res.data
        const ok = res.statusCode === 200
        resolve({
          ok,
          latency: Date.now() - started,
          version: ok && data && typeof data === 'object' ? data.version : undefined,
          error: ok ? undefined : `HTTP ${res.statusCode}`,
        })
      },
      fail: (err: any) => {
        resolve({
          ok: false,
          latency: Date.now() - started,
          error: (err && err.errMsg) || '网络不可达',
        })
      },
    })
  })
}

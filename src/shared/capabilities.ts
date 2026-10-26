/** 各端能力表：差异集中在这一处，页面里不写平台判断。影响端范围：全端。 */

export type Platform = 'app' | 'h5' | 'mp-weixin' | 'unknown'

function detectPlatform(): Platform {
  let platform: Platform = 'unknown'
  // #ifdef APP-PLUS
  platform = 'app'
  // #endif
  // #ifdef H5
  platform = 'h5'
  // #endif
  // #ifdef MP-WEIXIN
  platform = 'mp-weixin'
  // #endif
  return platform
}

export const PLATFORM: Platform = detectPlatform()

export interface Capabilities {
  /** 碎片捕获（投递文本/链接/图片） */
  canCapture: boolean
  /** 正文轻编辑 */
  canEdit: boolean
  /** 微信转发分享（小程序专属） */
  canShare: boolean
  /** 碎片整理成文 / 发布 */
  canManage: boolean
  /** 客户端内改服务器地址（小程序域名白名单写死，不支持） */
  canEditServer: boolean
}

export const capabilities: Capabilities = {
  canCapture: PLATFORM !== 'mp-weixin',
  canEdit: PLATFORM !== 'mp-weixin',
  canShare: PLATFORM === 'mp-weixin',
  canManage: PLATFORM !== 'mp-weixin',
  canEditServer: PLATFORM !== 'mp-weixin',
}

export function isApp(): boolean {
  return PLATFORM === 'app'
}

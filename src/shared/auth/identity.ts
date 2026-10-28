/**
 * 当前身份指纹：`guest` 或用户 id。
 *
 * 用途：给「与身份相关的缓存」做归属判断。游客看到的是**只有公开内容**，
 * 登录后是全量——两者共用一个缓存就会出现「登录了却看不到自己的草稿」，
 * 反过来退出登录也可能把私有内容留在列表里。
 *
 * 为什么不用 `hasSession()` 当判断：登录态是布尔，切换账号时布尔值不变，
 * 缓存就串了。这里用用户 id，切号也能识别。
 */
import { readSession } from './session'

export function currentIdentity(): string {
  const session = readSession()
  return session.user?.id || 'guest'
}

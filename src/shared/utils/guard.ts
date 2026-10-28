/**
 * 写操作门禁：浏览不需要登录，**动作**才需要。
 *
 * 为什么不再全站强制登录：后端的读接口本来就是「游客可见」的
 * （`get_viewer` + `access.visible_where`），站点还可以用 `guest_mode`
 * 配成必须登录。移动端之前无条件 reLaunch 到登录页，比后端更严，
 * 于是「只想看看」的人也进不来。
 *
 * 现在只有两类地方要拦：写操作（新建/编辑/投递/管理）和私有数据（碎片箱）。
 */
import { hasSession } from '../auth/session'

/**
 * 需要登录才能继续的动作入口。
 *
 * @returns true = 已登录，可以继续；false = 未登录，已经弹了引导，调用方直接 return
 */
export function requireLogin(message = '这个操作需要登录'): boolean {
  if (hasSession()) return true
  uni.showModal({
    title: '需要登录',
    content: `${message}。仅浏览公开文章不需要登录。`,
    confirmText: '去登录',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) uni.navigateTo({ url: '/pages/login/index' })
    },
  })
  return false
}

export function isLoggedIn(): boolean {
  return hasSession()
}

/**
 * 统一的反馈层：延迟加载、轻提示、确认框。
 *
 * 三者的共同点：**都是自绘的**，颜色跟着 App 主题走。
 * 底层为什么不用原生 API 写在 `overlay.ts` 头部，这里只讲对外契约。
 *
 * 一条硬规则：这些函数**永远不会抛异常**。浮层只是锦上添花，
 * 挂不出来（DOM 不可用、元素被回收）就安静地什么都不做，
 * 绝不能因为它把业务流程带崩。
 */
import { getHost, node } from './overlay'

/* ========================================================================== *
 * 一、延迟加载
 * ========================================================================== */

/** 超过这个时长才把它显示出来。绝大多数请求 100~300ms 就回来了，不该闪。 */
export const SHOW_DELAY = 500
/** 一旦显示，至少停这么久。否则 520ms 的请求只露 20ms，比不显示还晃眼。 */
export const MIN_VISIBLE = 420

let depth = 0
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let loadingEl: HTMLElement | null = null
let shownAt = 0

function alive(el: HTMLElement | null): el is HTMLElement {
  return !!el && !!el.parentNode
}

function paintLoading(text: string): void {
  const host = getHost()
  if (!host) return
  // 页面切换过：旧元素跟着旧 webview 一起没了，引用是废的，重建
  if (!alive(loadingEl)) loadingEl = null
  if (!loadingEl) {
    loadingEl = node('div', 'go-loading')
    loadingEl.appendChild(node('span', 'go-spin'))
    loadingEl.appendChild(node('span', 'go-loading-text'))
    host.appendChild(loadingEl)
    shownAt = Date.now()
  }
  const label = loadingEl.querySelector('.go-loading-text')
  if (label && label.textContent !== text) label.textContent = text
}

function removeLoading(): void {
  if (!alive(loadingEl)) {
    loadingEl = null
    return
  }
  const el = loadingEl
  loadingEl = null
  el.style.transition = 'opacity .12s ease-out'
  el.style.opacity = '0'
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }, 140)
}

/**
 * 一个请求开始。**引用计数**，并发多个请求只显示一个浮层。
 *
 * 例：首页同时发 tree + version 两个请求，只出现一个「加载中」；
 * 先回来的那个不会把浮层关掉，要等两个都结束。
 *
 * `delay` 默认 500ms（网络请求用）。传 0 表示立刻出现 —— 只有那种
 * 「用户明确按了一个按钮、后面接着一段本地耗时动作」的场景才该这么用。
 */
export function beginLoading(text = '加载中…', opts: { delay?: number } = {}): void {
  const wait = opts.delay === undefined ? SHOW_DELAY : opts.delay
  depth += 1
  if (depth > 1) return
  // 上一轮的淡出倒计时还没走完、元素还在屏幕上：直接留着用，别再建一个
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
    return
  }
  if (pendingTimer) return
  if (wait <= 0) {
    try {
      paintLoading(text)
    } catch {
      /* 画不出来就算了 */
    }
    return
  }
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    // 500ms 内已经结束了的话，endLoading 会把 depth 归零，
    // 这里再检查一次，避免「请求已完、浮层才冒出来」
    if (depth < 1) return
    try {
      paintLoading(text)
    } catch {
      /* 画不出来就算了 */
    }
  }, wait)
}

/** 一个请求结束。计数归零时才收尾，并且补足最短停留时间。 */
export function endLoading(): void {
  if (depth > 0) depth -= 1
  if (depth > 0) return

  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (!alive(loadingEl)) {
    loadingEl = null
    return
  }
  const rest = MIN_VISIBLE - (Date.now() - shownAt)
  if (rest <= 0) {
    removeLoading()
    return
  }
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    hideTimer = null
    removeLoading()
  }, rest)
}

/** 包一层：业务代码里不用记 try/finally */
export async function withLoading<T>(task: () => Promise<T>, text?: string): Promise<T> {
  beginLoading(text)
  try {
    return await task()
  } finally {
    endLoading()
  }
}

/* ========================================================================== *
 * 二、轻提示
 * ========================================================================== */

let toastEl: HTMLElement | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function drop(el: HTMLElement, ms = 140): void {
  try {
    // 淡出期间立刻放开点击：H5 是单页应用，确认后往往紧跟一次页面跳转，
    // 残留 140ms 的遮罩会把新页面前的第一次点击吞掉
    el.style.pointerEvents = 'none'
    el.style.transition = 'opacity .14s ease-out'
    el.style.opacity = '0'
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el)
    }, ms)
  } catch {
    if (el.parentNode) el.parentNode.removeChild(el)
  }
}

/**
 * 替换掉 `uni.showToast({ title, icon: 'none' })`。
 *
 * 第二条参数是展示时长（毫秒）。字多的时候给长一点，
 * 但内容仍应控制在 20 字以内 —— 这不是给用户读长文的地方。
 */
export function toast(text: string, duration = 2200): void {
  const msg = String(text || '').trim()
  if (!msg) return
  const host = getHost()
  if (!host) return
  try {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    if (toastEl) {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl)
      toastEl = null
    }
    const el = node('div', 'go-toast', msg)
    host.appendChild(el)
    toastEl = el
    toastTimer = setTimeout(
      () => {
        toastTimer = null
        if (toastEl === el) toastEl = null
        drop(el)
      },
      Math.max(1200, duration),
    )
  } catch {
    /* ignore */
  }
}

/* ========================================================================== *
 * 三、确认框 / 输入框
 * ========================================================================== */

export interface DialogOptions {
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  /** 只给一个按钮（纯告知，用户只能点掉） */
  alertOnly?: boolean
  /** 确认按钮用危险色（删除、清空、吊销这类不可逆动作） */
  danger?: boolean
  /** 带输入框。返回值里的 `content` 是用户输入的内容。 */
  input?: { value?: string; placeholder?: string; password?: boolean }
}

export interface DialogResult {
  /** true = 点了确认（或单按钮的「知道了」） */
  confirm: boolean
  /** 输入框里的内容；没有输入框时为空串 */
  content: string
}

/** 当前正在显示的那一个。同一时刻只留一个 —— 两层遮罩叠起来是灾难。 */
let activeClose: ((result: DialogResult) => void) | null = null

/** DOM 不可用时的兜底：宁可丑，不能没有 */
function nativeDialog(opts: DialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    try {
      uni.showModal({
        title: opts.title || '',
        content: opts.content || '',
        editable: !!opts.input,
        placeholderText: opts.input?.placeholder || '',
        confirmText: opts.confirmText || '确定',
        cancelText: opts.cancelText || '取消',
        showCancel: !opts.alertOnly,
        success: (res: any) => resolve({ confirm: !!res.confirm, content: String(res.content || '') }),
        fail: () => resolve({ confirm: false, content: '' }),
      })
    } catch {
      resolve({ confirm: false, content: '' })
    }
  })
}

/**
 * 替代 `uni.showModal`。
 *
 * 与原生版的差别（都是有意的）：
 * - 背景色是 `--go-card`，比页面背景深（或亮）一档，标题正文不再和页面糊在一起；
 * - 出现时有一点点弹入动效，消失有淡出，不是硬切；
 * - 点遮罩空白**不关闭** —— 确认类操作必须明确点按钮。
 */
export function showDialog(opts: DialogOptions): Promise<DialogResult> {
  if (typeof document === 'undefined') return nativeDialog(opts)
  const host = getHost()
  if (!host) return nativeDialog(opts)

  // 前一个还没关：按「取消」收掉，别让两层遮罩叠着
  if (activeClose) {
    const prev = activeClose
    activeClose = null
    prev({ confirm: false, content: '' })
  }

  return new Promise<DialogResult>((resolve) => {
    let done = false
    let inputEl: HTMLInputElement | null = null

    const layer = node('div', 'go-dialog-layer')
    const box = node('div', 'go-dialog')
    const body = node('div', 'go-dialog-body')

    if (opts.title) body.appendChild(node('div', 'go-dialog-title', opts.title))
    if (opts.content) body.appendChild(node('div', 'go-dialog-text', opts.content))

    if (opts.input) {
      inputEl = document.createElement('input')
      inputEl.className = 'go-dialog-input'
      inputEl.type = opts.input.password ? 'password' : 'text'
      if (opts.input.placeholder) inputEl.placeholder = opts.input.placeholder
      inputEl.value = opts.input.value || ''
      body.appendChild(inputEl)
    }

    const actions = node('div', 'go-dialog-actions')

    const finish = (confirm: boolean): void => {
      if (done) return
      done = true
      if (activeClose === closeRef) activeClose = null
      const content = inputEl ? inputEl.value : ''
      drop(layer)
      resolve({ confirm, content })
    }
    const closeRef = (r: DialogResult): void => finish(r.confirm)

    if (!opts.alertOnly) {
      const cancel = node('div', 'go-dialog-btn', opts.cancelText || '取消')
      cancel.addEventListener('click', () => finish(false))
      actions.appendChild(cancel)
    }

    const ok = node(
      'div',
      `go-dialog-btn is-strong${opts.danger ? ' is-danger' : ''}`,
      opts.confirmText || '确定',
    )
    ok.addEventListener('click', () => finish(true))
    actions.appendChild(ok)

    box.appendChild(body)
    box.appendChild(actions)
    layer.appendChild(box)
    host.appendChild(layer)
    activeClose = closeRef

    if (inputEl) {
      // 自动聚焦会同时拉起键盘，这是输入框该有的样子。
      // 延迟一帧多：Safari 对「刚插入就 focus」不给键盘。
      const field = inputEl
      setTimeout(() => {
        try {
          field.focus()
        } catch {
          /* ignore */
        }
      }, 80)
      field.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') finish(true)
      })
    }
  })
}

/** 纯告知：一个「知道了」按钮 */
export function alertDialog(text: string, opts: Partial<DialogOptions> = {}): Promise<void> {
  return showDialog({ content: text, alertOnly: true, ...opts }).then(() => undefined)
}

/** 二选一：返回用户是否点了确认 */
export async function confirmDialog(opts: DialogOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { content: opts } : opts
  const res = await showDialog(o)
  return res.confirm
}

/** 带输入框的确认；取消时 `content` 为空串 */
export function promptDialog(opts: DialogOptions): Promise<DialogResult> {
  return showDialog({ ...opts, input: opts.input || {} })
}

/**
 * 浮层行为断言（loading / toast / dialog），**不依赖后端**。
 *
 * 为什么要单独一个脚本：`smoke-h5.mjs` 要先登录、要有后端，
 * 而这套浮层最容易坏的恰恰是「时序」——500ms 阈值、最短停留、并发计数、
 * 弹窗 Promise 的返回值。这些用肉眼看不出来，必须靠断言。
 *
 * 运行（需要先起 dev server，因为要按源码路径动态 import）：
 *   npm run dev:h5 &
 *   node scripts/overlay-test.mjs
 */
import { chromium } from 'playwright'

const APP = 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

await page.addInitScript(() => {
  window.__ui = null
  window.__loadUI = async () => {
    if (!window.__ui) window.__ui = await import('/src/shared/ui/feedback.ts')
    return window.__ui
  }
})

const fails = []
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) fails.push(name)
}

await page.goto(`${APP}/#/pages/library/index`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3200)

// ---- 1. 500ms 内结束的请求：不该出现浮层 ----
const fast = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  ui.beginLoading()
  await new Promise((r) => setTimeout(r, 200))
  const during = !!document.querySelector('.go-loading')
  ui.endLoading()
  await new Promise((r) => setTimeout(r, 600))
  return { during, after: !!document.querySelector('.go-loading') }
})
check('200ms 的请求不显示浮层', fast.during === false && fast.after === false, JSON.stringify(fast))

// ---- 2. 超过 500ms：出现 ----
const slow = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  ui.beginLoading()
  await new Promise((r) => setTimeout(r, 620))
  const shown = document.querySelector('.go-loading')?.textContent || ''
  return { shown }
})
check('650ms 的请求显示浮层', slow.shown.includes('加载中'), slow.shown)
await page.waitForTimeout(700)
await page.evaluate(async () => (await window.__loadUI()).endLoading())

// ---- 3. 并发只算一个 + 最短停留 ----
const conc = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  ui.beginLoading()
  ui.beginLoading()
  ui.beginLoading()
  await new Promise((r) => setTimeout(r, 620))
  const count1 = document.querySelectorAll('.go-loading').length
  const shownAt = Date.now()
  ui.endLoading()
  ui.endLoading()
  const stillTwo = !!document.querySelector('.go-loading')
  ui.endLoading()
  // 刚结束的瞬间应当还在（最短停留），等 500ms 后应消失
  const rightAfter = !!document.querySelector('.go-loading')
  await new Promise((r) => setTimeout(r, 620))
  const gone = !document.querySelector('.go-loading')
  return { count1, stillTwo, rightAfter, gone, cost: Date.now() - shownAt }
})
check('并发 3 个请求只显示一个浮层', conc.count1 === 1, JSON.stringify(conc))
check('未全部结束时浮层不收', conc.stillTwo === true, JSON.stringify(conc))
check('显示后至少停留 420ms', conc.rightAfter === true && conc.gone === true, JSON.stringify(conc))

// ---- 4. 确认框：点确定返回 true ----
const dlgOk = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  const p = ui.confirmDialog({ title: '删除？', content: '不可恢复' })
  await new Promise((r) => setTimeout(r, 260))
  const layer = document.querySelector('.go-dialog-layer')
  const title = document.querySelector('.go-dialog-title')?.textContent
  const btns = document.querySelectorAll('.go-dialog-btn').length
  document.querySelector('.go-dialog-btn.is-strong').click()
  const r = await p
  await new Promise((res) => setTimeout(res, 300))
  return { r, title, btns, gone: !document.querySelector('.go-dialog-layer') }
})
check('confirm 点主按钮返回 true', dlgOk.r === true, JSON.stringify(dlgOk))
check('确认框标题/按钮数量正确', dlgOk.title === '删除？' && dlgOk.btns === 2, JSON.stringify(dlgOk))
check('确认后遮罩被移除', dlgOk.gone === true, JSON.stringify(dlgOk))

// ---- 5. 取消返回 false ----
const dlgNo = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  const p = ui.confirmDialog({ title: '删除？' })
  await new Promise((r) => setTimeout(r, 260))
  document.querySelectorAll('.go-dialog-btn')[0].click()
  return await p
})
check('confirm 点取消返回 false', dlgNo === false, String(dlgNo))

// ---- 6. 单按钮：只有一个按钮，点掉返回 true ----
const alertRes = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  const p = ui.showDialog({ title: '同步完成', content: '共扫描 3 个文件', alertOnly: true })
  await new Promise((r) => setTimeout(r, 260))
  const n = document.querySelectorAll('.go-dialog-btn').length
  document.querySelector('.go-dialog-btn').click()
  const r = await p
  return { n, confirm: r.confirm }
})
check('alert 只有 1 个按钮且返回 confirm', alertRes.n === 1 && alertRes.confirm === true, JSON.stringify(alertRes))

// ---- 7. 输入框：回传输入内容 ----
const prompt = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  const p = ui.promptDialog({ title: '新的目录名', input: { value: '旧名字' } })
  await new Promise((r) => setTimeout(r, 320))
  const input = document.querySelector('.go-dialog-input')
  const prefill = input ? input.value : ''
  input.value = '新名字'
  document.querySelector('.go-dialog-btn.is-strong').click()
  const r = await p
  return { prefill, r }
})
check('输入框预填 + 回传新值', prompt.prefill === '旧名字' && prompt.r.content === '新名字', JSON.stringify(prompt))

// ---- 8. 连开两个：旧的按取消收尾，不会叠两层 ----
const replace = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  const p1 = ui.confirmDialog({ title: '第一个' })
  await new Promise((r) => setTimeout(r, 260))
  const p2 = ui.confirmDialog({ title: '第二个' })
  await new Promise((r) => setTimeout(r, 260))
  const layers = document.querySelectorAll('.go-dialog-layer').length
  document.querySelector('.go-dialog-btn.is-strong').click()
  const r1 = await p1
  const r2 = await p2
  return { layers, r1, r2 }
})
check('新框顶掉旧框（不留两层）', replace.layers === 1 && replace.r1 === false, JSON.stringify(replace))

// ---- 9. toast ----
const toastRes = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  ui.toast('已保存')
  await new Promise((r) => setTimeout(r, 120))
  const el = document.querySelector('.go-toast')
  const text = el?.textContent
  ui.toast('第二条')
  await new Promise((r) => setTimeout(r, 120))
  return { text, count: document.querySelectorAll('.go-toast').length, second: document.querySelector('.go-toast')?.textContent }
})
check('toast 显示且替换旧的', toastRes.text === '已保存' && toastRes.count === 1 && toastRes.second === '第二条', JSON.stringify(toastRes))

// ---- 10. 空文案不弹 ----
const empty = await page.evaluate(async () => {
  const ui = await window.__loadUI()
  // 等上一条 toast 自然消失，否则数到的是它
  await new Promise((r) => setTimeout(r, 2600))
  const before = document.querySelectorAll('.go-toast').length
  ui.toast('   ')
  await new Promise((r) => setTimeout(r, 150))
  return { before, after: document.querySelectorAll('.go-toast').length }
})
check('空 toast 不显示', empty.before === 0 && empty.after === 0, JSON.stringify(empty))

console.log(fails.length ? `\nFAILED: ${fails.join(' / ')}` : '\nALL PASS')
await browser.close()
process.exit(fails.length ? 1 : 0)

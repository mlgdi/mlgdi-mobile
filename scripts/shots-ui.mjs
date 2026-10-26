/**
 * 截图脚本：给设计走查用（浅色/深色/切栏目）。
 * 依赖 dev server（默认 5273）与本地后端，账号密码同 smoke-h5。
 *
 *   APP_URL=http://127.0.0.1:5273 node scripts/shots-ui.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.APP_URL || 'http://127.0.0.1:5273'
const API = process.env.API_URL || 'http://192.168.1.88:8010'
const USER = process.env.GARDEN_USER || 'admin'
const PASS = process.env.GARDEN_PASS || 'admin12345'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

async function login() {
  await page.goto(`${APP}/#/pages/server/index`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.locator('input').first().fill(API)
  await page.getByText('保存', { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.locator('.uni-modal__btn_primary').last().click()
  await page.waitForTimeout(1000)
  const inputs = page.locator('uni-input input, input')
  await inputs.nth(0).fill(USER)
  await inputs.nth(1).fill(PASS)
  await page.locator('.form .btn').first().click()
  await page.waitForTimeout(2600)
}

await login()
// 首次进入要等树接口回来（大 vault 约 1-2s），否则截到「正在加载」
await page.waitForTimeout(3200)
await page.screenshot({ path: 'shots/10-library-light.png' })

// 切到「灵溯」看选中态形变
const tabs = page.locator('.gtab .tab')
if ((await tabs.count()) >= 2) {
  await tabs.nth(1).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'shots/11-tab-switch.png' })
}

// 栏目页（带孩子类 chip 条）：灵溯有两个子目录
await page.locator('.gtab .tab').nth(2).click()
await page.waitForTimeout(900)
await page.screenshot({ path: 'shots/13-column-subs.png' })

// 往下滚到底，看分页脚
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(700)
await page.screenshot({ path: 'shots/14-pager.png' })

// 阅读页：正文排版 / 目录抽屉 / 反链
await page.goto(`${APP}/#/pages/library/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
if ((await page.locator('.doc').count()) > 0) {
  await page.locator('.doc').first().click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: 'shots/20-doc-light.png' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'shots/22-doc-backlink.png' })
  await page.evaluate(() => window.scrollTo(0, 300))
  await page.waitForTimeout(400)
  if ((await page.locator('.toc-btn').count()) > 0) {
    await page.locator('.toc-btn').click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'shots/23-doc-toc.png' })
    await page.locator('.mask').click()
    await page.waitForTimeout(300)
  }
}

// 深色
await page.goto(`${APP}/#/pages/settings/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.getByText('深色', { exact: true }).first().click()
await page.waitForTimeout(600)
await page.goto(`${APP}/#/pages/library/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.screenshot({ path: 'shots/12-library-dark.png' })

// 深色下的栏目页（看浸染卡与光斑是否成立）
await page.locator('.gtab .tab').nth(2).click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'shots/16-column-dark.png' })

// 深色阅读页
await page.goto(`${APP}/#/pages/library/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
if ((await page.locator('.doc').count()) > 0) {
  await page.locator('.doc').first().click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'shots/24-doc-dark.png' })
}

// 还原浅色，别把用户偏好改脏
await page.goto(`${APP}/#/pages/settings/index`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByText('跟随系统', { exact: true }).first().click()
await page.waitForTimeout(400)

console.log('shots written')
await browser.close()

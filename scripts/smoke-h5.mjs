/**
 * H5 冒烟：登录 → 库列表 → 文章 → 设置/主题 → 碎片投递 → 整理成文 → 编辑发布 → 导入 md。
 *
 * 为什么是脚本而不是完整 e2e 工程：uni-app 的 H5 产物与 Web 前端完全独立，
 * 这里只验证「请求层 / 设备绑定 / 渲染 / 写入闭环」这条主链路没断。
 *
 * 运行：
 *   npm run dev:h5 &
 *   npx playwright install chromium   # 首次
 *   node scripts/smoke-h5.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.APP_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://192.168.1.88:8010'
const USER = process.env.GARDEN_USER || 'admin'
const PASS = process.env.GARDEN_PASS || 'admin12345'
const SHOT_DIR = process.env.SHOT_DIR || 'shots'
const FINGERPRINT = API.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9.:-]/g, '-')

const errors = []
const steps = []
const createdDocIds = []

function log(step, ok, extra = '') {
  steps.push({ step, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${extra ? '  ' + extra : ''}`)
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
}

/**
 * uni-app 的 <textarea> 会被编译成 <uni-textarea> 包一个内部 <textarea>，
 * 直接对 .compose-input 调 fill 会报「不是 input/textarea」。
 */
async function fillTextarea(page, selector, value) {
  const inner = page.locator(`${selector} textarea`).first()
  if (await inner.count()) {
    await inner.fill(value)
    return
  }
  await page.locator(selector).first().fill(value)
}

async function confirmModal(page) {
  const primary = page.locator('.uni-modal__btn_primary').last()
  if (await primary.count()) {
    await primary.click()
  } else {
    const buttons = page.locator('.uni-modal__btn')
    const count = await buttons.count()
    if (!count) throw new Error('modal 里没有按钮')
    await buttons.nth(count - 1).click()
  }
  // 遮罩必须真的消失，否则后续断言会被「挡住了但仍然可见」骗过去
  await page.locator('.uni-modal').first().waitFor({ state: 'hidden', timeout: 5000 })
}

/** 用 App 自己存的凭证调接口（清理测试数据用） */
async function pageApi(page, path, method = 'GET', body) {
  const creds = await page
    .evaluate((fp) => {
      const u = window.uni
      if (!u) return null
      return {
        token: u.getStorageSync(`garden.auth.token@${fp}`),
        key: u.getStorageSync(`garden.auth.deviceSecret@${fp}`),
        id: u.getStorageSync(`garden.auth.deviceId@${fp}`),
      }
    }, FINGERPRINT)
    .catch(() => null)
  if (!creds || !creds.token) return null

  return page
    .evaluate(
      async ({ base, creds: c, path: p, method: m, body: b }) => {
        const res = await fetch(`${base}${p}`, {
          method: m,
          headers: {
            Authorization: `Bearer ${c.token}`,
            'X-Device-Key': c.key,
            'Content-Type': 'application/json',
          },
          body: b ? JSON.stringify(b) : undefined,
        })
        return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
      },
      { base: API, creds, path, method, body },
    )
    .catch(() => null)
}

/** 吊销并删除本次冒烟登记的设备，避免库里越堆越多「PC」 */
async function cleanupDevice(page) {
  const creds = await page
    .evaluate((fp) => {
      const u = window.uni
      return u ? { id: u.getStorageSync(`garden.auth.deviceId@${fp}`) } : null
    }, FINGERPRINT)
    .catch(() => null)
  if (!creds || !creds.id) return
  const res = await pageApi(page, `/api/v1/auth/devices/${creds.id}`, 'DELETE')
  log('清理冒烟设备', Boolean(res && res.ok))
}

/** 冒烟造出来的文档丢进回收站（后端软删除，符合「绝不物理删除」约定） */
async function cleanupDocs(page) {
  let removed = 0
  for (const id of createdDocIds) {
    const res = await pageApi(page, `/api/v1/notes/doc?id=${encodeURIComponent(id)}`, 'DELETE')
    if (res && res.ok) removed += 1
  }
  if (createdDocIds.length) log(`清理冒烟文档（${removed}/${createdDocIds.length}）`, removed === createdDocIds.length)
}

const browser = await chromium.launch({ args: ['--disable-web-security'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

try {
  // ---- 1. 登录页 + 服务器切换 ----
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, '01-login')
  log('登录页渲染', await page.locator('text=渡己').first().isVisible())

  await page.locator('text=服务器').first().click()
  await page.waitForTimeout(800)
  const addr = page.locator('input').first()
  await addr.click()
  await addr.fill('')
  await addr.fill(API)
  await page.waitForTimeout(300)
  await page.locator('text=测试连接').first().click()
  await page.waitForTimeout(1500)
  log('服务器连通性测试', await page.locator('text=连接正常').first().isVisible())
  await shot(page, '02-server')

  // 精确匹配：说明文字里也含「保存」二字
  await page.getByText('保存', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await confirmModal(page)
  await page.waitForTimeout(1200)
  // showModal 关闭后节点仍在 DOM 里（隐藏），文案含「登录」，所以用表单按钮定位
  log('保存后回到登录页', await page.locator('.form .btn').first().isVisible())

  // ---- 2. 设备绑定登录 ----
  const inputs = page.locator('uni-input input, input')
  await inputs.nth(0).fill(USER)
  await inputs.nth(1).fill(PASS)
  await page.waitForTimeout(200)
  await page.locator('.form .btn').first().click()
  await page.waitForTimeout(2500)
  log('设备绑定登录', await page.locator('text=渡己').first().isVisible())
  await shot(page, '03-library')

  // ---- 3. 阅读 ----
  // 第一篇可能是几字的短碎片（正文断言会误报）：挑字数 ≥ 30 的第一篇
  const pickDoc = page.evaluate(() => {
    const items = [...document.querySelectorAll('.doc')]
    for (let i = 0; i < items.length; i++) {
      const meta = items[i].querySelector('.doc-meta')?.textContent || ''
      const m = meta.match(/(\d+) 字/)
      if (m && Number(m[1]) >= 30) return i
    }
    return 0
  })
  const docIndex = await pickDoc
  const firstItem = page.locator('.doc').nth(docIndex)
  const hasItem = (await firstItem.count()) > 0
  log('库列表有内容', hasItem)
  if (hasItem) {
    await firstItem.click()
    await page.waitForTimeout(2200)
    log('文章页渲染', await page.locator('.a-title').first().isVisible())
    // 正文排版与目录：v-html 路径一旦被改回富文本组件，这两条会先红
    const bodyLen = await page.evaluate(() => {
      const el = document.querySelector('.md-inner')
      return el ? (el.textContent || '').length : 0
    })
    log('正文渲染成 DOM', bodyLen > 20)

    // 代码高亮：有 fence 的文档才断言，避免拿碎片当样本时误报
    const codeBlocks = await page.locator('.md-code').count()
    if (codeBlocks > 0) {
      log('代码块有高亮', (await page.locator('.md-code [class^="hljs-"]').count()) > 0)
      log('代码块有复制按钮', (await page.locator('.md-code-copy').count()) > 0)
    }

    if ((await page.locator('.toc-btn').count()) > 0) {
      await page.locator('.toc-btn').click()
      await page.waitForTimeout(500)
      const sheet = await page.locator('.sheet.is-open').count()
      log('目录抽屉可开', sheet > 0)
      await page.locator('.mask').click()
      await page.waitForTimeout(400)
    }

    // 竖三点菜单 + 底部字号面板：切「大」后正文基准字号必须真的变
    const fsBefore = await page.evaluate(() => getComputedStyle(document.querySelector('.md')).fontSize)
    await page.locator('.gtop .more-btn').click()
    await page.waitForTimeout(400)
    log(
      '阅读菜单五项齐全',
      (await page.locator('.menu-item', { hasText: '分享' }).count()) === 1 &&
        (await page.locator('.menu-item', { hasText: '字体' }).count()) === 1 &&
        (await page.locator('.menu-item', { hasText: '模式' }).count()) === 1 &&
        (await page.locator('.menu-item', { hasText: '编辑' }).count()) === 1 &&
        (await page.locator('.menu-item', { hasText: '删除' }).count()) === 1,
    )
    await page.locator('.menu-item', { hasText: '字体' }).click()
    await page.waitForTimeout(600)
    // 滑杆在 H5 上不好点精确档位：直接把存储值拨到「大」再重载验证
    await page.evaluate(() => {
      window.uni?.setStorageSync?.('garden.reader.fs', 'lg')
    })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const fsAfter = await page.evaluate(() => getComputedStyle(document.querySelector('.md')).fontSize)
    log('字号切换生效', fsBefore !== fsAfter, `${fsBefore} → ${fsAfter}`)
    // 还原，别把偏好写脏
    await page.evaluate(() => {
      window.uni?.setStorageSync?.('garden.reader.fs', 'md')
    })
    await page.waitForTimeout(300)

    await shot(page, '04-doc')
  }

  // ---- 4. 碎片投递（M3）----
  const stamp = Date.now().toString().slice(-6)
  const captureText = `冒烟碎片 ${stamp}：移动端捕获闭环验证，这条应该能在碎片箱里看到。`
  await page.goto(`${APP}/#/pages/inbox/index`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await fillTextarea(page, '.compose-input', captureText)
  await page.waitForTimeout(300)
  await page.locator('.send').click()
  await page.waitForTimeout(2000)
  const capturedVisible = await page.locator(`text=${stamp}`).first().isVisible()
  log('碎片投递', capturedVisible)
  await shot(page, '05-inbox')

  // ---- 5. 整理成文（M4）----
  const item = page.locator('.item').filter({ hasText: stamp }).first()
  await item.locator('text=整理成文').click()
  await page.waitForTimeout(2500)
  await page.locator('.uni-modal__btn_primary').last().click() // 去编辑
  await page.waitForTimeout(2500)
  const inEdit = await page.locator('.paper-body').first().isVisible()
  log('整理成文 → 进入编辑器', inEdit)
  createdDocIds.push(new URL(page.url()).hash.split('id=')[1]?.split('&')[0] || '')

  // ---- 6. 编辑正文 + 发布（M4）----
  if (inEdit) {
    await fillTextarea(page, '.paper-body', `${captureText}\n\n编辑追加：这段是冒烟写进去的。`)
    await page.waitForTimeout(400)
    log('编辑器记录改动', await page.locator('text=未保存').first().isVisible())
    await page.locator('.save-btn').click()
    await page.waitForTimeout(2000)
    log('保存正文', !(await page.locator('text=未保存').first().isVisible()))
    // 版本号在顶栏标题后面、小字；属性行不再有 vN
    const topSub = await page.locator('.gtop .sub').first().innerText().catch(() => '')
    log('顶栏显示版本号', /^v\d+/.test(topSub.trim()), topSub.trim())
    log('属性行不再重复版本', (await page.locator('.meta-ver').count()) === 0)

    log('编辑工具栏', (await page.locator('.tb').count()) >= 20)
    log('工具栏双行', (await page.locator('.tools-row').count()) === 2)

    // 标题现在是编辑区第一行（不再是顶栏里不可改的文字）
    const titleInput = page.locator('.paper-title input').first()
    log('标题可编辑', await titleInput.isVisible())
    await titleInput.click()
    await page.keyboard.press('End')
    await page.keyboard.type('·冒烟')
    await page.waitForTimeout(300)
    const titleNow = await page.evaluate(
      () => document.querySelector('.paper-title input')?.value || '',
    )
    log('标题改动生效', titleNow.endsWith('·冒烟'))

    // 封面 / 标签面板能开（不校验上传：冒烟不该往 Assets 里塞文件）
    await page.locator('.meta-btn').nth(0).click()
    await page.waitForTimeout(600)
    log('封面面板可开', (await page.locator('.ai-sheet.is-open').count()) > 0)
    await page.locator('.ai-sheet.is-open .sheet-close').click()
    await page.waitForTimeout(300)

    // AI 标题/标签已收进 AI 助手：标题行不再挂 ✨，入口在浮动球面板的第三组。
    // 只验入口存在，不真跑——冒烟不该每次都花一次模型调用
    log('标题行不再挂 AI 按钮', (await page.locator('.title-ai').count()) === 0)
    await page.locator('.ai-fab').first().click()
    await page.waitForTimeout(700)
    log(
      'AI 助手有「标题与标签」组',
      (await page.locator('.ai-group', { hasText: '标题与标签' }).count()) === 1,
    )
    log(
      'AI 助手含 AI 标题 / AI 标签',
      (await page.locator('.ai-act', { hasText: 'AI 标题' }).count()) === 1 &&
        (await page.locator('.ai-act', { hasText: 'AI 标签' }).count()) === 1,
    )
    await page.locator('.ai-sheet.is-open .sheet-x').click()
    await page.waitForTimeout(300)
    await page.locator('.meta-btn').nth(1).click()
    await page.waitForTimeout(600)
    log('标签有 AI 入口', (await page.locator('.ai-gen').count()) === 1)
    await page.locator('.ai-sheet.is-open .sheet-close').click()
    await page.waitForTimeout(300)
    await page.locator('.tb-w').nth(1).click()
    await page.waitForTimeout(400)
    const editedVal = await page.evaluate(() => {
      const el = document.querySelector('.paper-body textarea')
      return el ? el.value : ''
    })
    log('格式按钮生效', editedVal.includes('## '))
    await shot(page, '06-edit')

    await page.getByText('发布', { exact: true }).first().click()
    await page.waitForTimeout(600)
    await confirmModal(page)
    await page.waitForTimeout(1800)
    log('发布', await page.locator('.meta-chip', { hasText: '已发布' }).first().isVisible())

    // 最后再验返回：此时已保存干净，应当直接退出、不弹任何确认
    await page.locator('.gtop .lead').click()
    await page.waitForTimeout(2200)
    const leftEdit = await page.evaluate(() => !location.hash.includes('/pages/edit/'))
    log('编辑器返回可退出', leftEdit)
  }

  // ---- 7. 导入 .md 文件 ----
  await page.goto(`${APP}/#/pages/import/index`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const mdBuffer = Buffer.from(`# 冒烟导入 ${stamp}\n\n这是从本机导入的 Markdown。\n\n- 一条列表\n`, 'utf-8')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.getByText('选择 .md 文件').click(),
  ])
  await chooser.setFiles({ name: `smoke-${stamp}.md`, mimeType: 'text/markdown', buffer: mdBuffer })
  await page.waitForTimeout(1200)
  const titleFilled = await page.locator('input').first().inputValue()
  log('选文件后自动填标题', titleFilled.includes(`冒烟导入 ${stamp}`), titleFilled)
  await shot(page, '07-import')

  await page.getByText('导入', { exact: true }).first().click()
  await page.waitForTimeout(3000)
  const importedDocId = new URL(page.url()).hash.split('id=')[1]?.split('&')[0] || ''
  if (importedDocId) createdDocIds.push(importedDocId)
  log('导入后进入编辑器', Boolean(importedDocId) && (await page.locator('.paper-body').first().isVisible()))

  // ---- 8. 深色主题 ----
  await page.goto(`${APP}/#/pages/settings/index`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  // 二级菜单：偏好 → 主题 seg → 深色
  await page.getByText('偏好', { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.getByText('深色', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '08-settings-dark')
  log('深色主题切换', (await page.locator('.theme-dark').first().count()) > 0)

  // ---- 9. 清理 ----
  await cleanupDocs(page)
  await cleanupDevice(page)
} catch (err) {
  log('执行异常', false, String(err).slice(0, 200))
  await shot(page, '99-error')
} finally {
  await browser.close()
}

const failed = steps.filter((s) => !s.ok)
if (errors.length) {
  console.log('\n控制台错误：')
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  -', e)
}
console.log(`\n${steps.length - failed.length}/${steps.length} 通过`)
process.exit(failed.length ? 1 : 0)

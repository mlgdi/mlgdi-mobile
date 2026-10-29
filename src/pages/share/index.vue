<script setup lang="ts">
/**
 * 分享图（独立页面，不是弹层里的组件）
 *
 * 为什么必须单独开一页：App 端 `<canvas>` 是**原生组件**。原生组件被放进
 * `position: fixed` 的浮层、或被「圆角 + overflow: hidden」的容器裁剪时，
 * iOS 上会整块空白 —— 不报错、`draw` 像没发生、也导不出图。
 * 之前那版就是「卡片里一张白板 + 按钮压着正文」的样子。
 * 这一版把画布放在正常文档流里，页面上只有它和两个按钮，没有别的遮挡。
 *
 * 版式与旧版一致：宽度 320，高度跟内容走，二维码 165（29 模块时 5px/模块）。
 */
import { computed, nextTick, ref } from 'vue'
import { onLoad, onReady } from '@dcloudio/uni-app'
import QRCode from 'qrcode'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { doc as apiDoc, shareCard, type DocDetail } from '../../shared/api/notes'
import { columnByPath } from '../../shared/config/columns'
import { getBaseUrl } from '../../shared/config/server'
import { resolvedTheme } from '../../shared/theme'
import { useSiteStore } from '../../shared/store/site'
import { isPublicShare, shareUrlOf } from '../../shared/utils/share'
import { formatDate } from '../../shared/utils/date'

/* 卡片逻辑尺寸（px），导出按 3 倍放大，手机上才够锐 */
const W = 320
const PAD = 24
const QR_BOX = 165
const TITLE_LH = 29
const EXCERPT_LH = 19
const TITLE_TOP = 66

const docId = ref('')
const doc = ref<DocDetail | null>(null)
const error = ref('')
/** 服务端出错时的说明。有值就不再画 canvas：空白画布只会让人以为「又坏了」 */
const serverError = ref<{ title: string; desc: string } | null>(null)

const h = ref(430)
const imgPath = ref('')
const failed = ref('')
const drawing = ref(false)

/** 320 窄屏也要放得下：整体按可视宽度等比缩（画布坐标仍是 320 宽） */
const winW = ref(375)
const scale = computed(() => Math.min(1, (winW.value - 32) / W))
const cssW = computed(() => Math.round(W * scale.value))
const cssH = computed(() => Math.round(h.value * scale.value))

const site = useSiteStore()
const brand = computed(() => site.info.name || '渡己・Mlgdi')
const url = computed(() => shareUrlOf(doc.value, getBaseUrl()))
const col = computed(() => (doc.value ? columnByPath(doc.value.path) : undefined))
const dateText = computed(() =>
  doc.value ? formatDate(doc.value.updated_at || doc.value.created_at) : '',
)
const tip = computed(() => {
  if (failed.value) return failed.value
  if (!doc.value) return ''
  // 不给一个别人打不开的地址还装作正常
  return isPublicShare(doc.value) ? '扫码或长按图片即可打开这篇' : '这篇还没公开，扫码打开的人需要登录'
})

/* ---------------- 绘制 ---------------- */

/**
 * 量字宽。App 端个别机型 `measureText` 返回 0 / NaN，
 * 那时按「中文 1em、西文 0.55em」估算 —— 排版略不精确，但不会崩成每字一行。
 */
function textWidth(ctx: any, text: string, fontSize: number): number {
  const w = Number(ctx.measureText(text)?.width)
  if (Number.isFinite(w) && w > 0) return w
  let est = 0
  for (const ch of Array.from(text)) {
    est += /[\x00-\xff]/.test(ch) ? fontSize * 0.55 : fontSize
  }
  return est
}

/** 按行宽折行；超过行数就在最后一行截断加省略号 */
function wrap(ctx: any, text: string, maxWidth: number, maxLines: number, fontSize: number): string[] {
  const chars = Array.from(text || '')
  const lines: string[] = []
  let cur = ''
  for (const ch of chars) {
    const next = cur + ch
    if (cur && textWidth(ctx, next, fontSize) > maxWidth) {
      lines.push(cur)
      cur = ch
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && textWidth(ctx, `${last}…`, fontSize) > maxWidth) {
    last = last.slice(0, -1)
  }
  kept[maxLines - 1] = `${last}…`
  return kept
}

interface Layout {
  titleLines: string[]
  exLines: string[]
  qrTop: number
  h: number
}

/** 量字 → 定行数 → 定高度 */
function measure(ctx: any): Layout {
  const d = doc.value
  ctx.setFontSize(20)
  const titleLines = wrap(ctx, d?.title || '无标题', W - PAD * 2, 3, 20)
  let y = TITLE_TOP + titleLines.length * TITLE_LH

  const excerpt = d?.excerpt || ''
  let exLines: string[] = []
  if (excerpt) {
    ctx.setFontSize(12.5)
    exLines = wrap(ctx, excerpt, W - PAD * 2, 2, 12.5)
    y += 6 + exLines.length * EXCERPT_LH
  }

  // 文字块下 34px 起放二维码；更下方依次是域名与品牌，各留 22 / 26
  const qrTop = y + 34
  return { titleLines, exLines, qrTop, h: qrTop + QR_BOX + 22 + 26 + 26 }
}

function drawQr(ctx: any, payload: string, qrTop: number): void {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const margin = 2 // 静区：少于 2 个模块时扫码不稳
  const total = n + margin * 2
  const px = Math.max(2, Math.floor(QR_BOX / total))
  const box = px * total
  const ox = Math.round((W - box) / 2)
  const oy = qrTop + Math.round((QR_BOX - box) / 2)

  ctx.setFillStyle('#ffffff')
  ctx.fillRect(ox, oy, box, box)
  ctx.setFillStyle('#1d1d1f')
  for (let r = 0; r < n; r += 1) {
    // 同一行连续的模块合成一条：App 端每次 fillRect 都有开销
    let start = -1
    for (let c = 0; c < n; c += 1) {
      const on = qr.modules.get(r, c)
      if (on && start < 0) start = c
      if ((!on || c === n - 1) && start >= 0) {
        const end = on && c === n - 1 ? c : c - 1
        ctx.fillRect(ox + (start + margin) * px, oy + (r + margin) * px, (end - start + 1) * px, px)
        start = -1
      }
    }
  }
}

/** 一次完整绘制；`draw` 的回调里再导出（顺序不能反） */
function paint(lay: Layout): void {
  const ctx = uni.createCanvasContext('poster')
  const total = lay.h

  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, W, total)

  // 顶行：左栏目、右日期
  ctx.setFontSize(11)
  if (col.value) {
    ctx.setFillStyle(col.value.main || '#0066cc')
    ctx.setTextAlign('left')
    ctx.fillText(col.value.name, PAD, 34)
  }
  if (dateText.value) {
    ctx.setFillStyle('#86868b')
    ctx.setTextAlign('right')
    ctx.fillText(dateText.value, W - PAD, 34)
  }

  ctx.setTextAlign('left')
  ctx.setFillStyle('#1d1d1f')
  ctx.setFontSize(20)
  lay.titleLines.forEach((line, i) => {
    ctx.fillText(line, PAD, TITLE_TOP + i * TITLE_LH)
  })

  if (lay.exLines.length) {
    ctx.setFillStyle('#6e6e73')
    ctx.setFontSize(12.5)
    const base = TITLE_TOP + lay.titleLines.length * TITLE_LH + 6
    lay.exLines.forEach((line, i) => {
      ctx.fillText(line, PAD, base + i * EXCERPT_LH)
    })
  }

  drawQr(ctx, url.value, lay.qrTop)

  // 二维码下方：域名；底部：品牌（都贴下沿，卡片高低不同也保持同一收尾）
  let host = ''
  try {
    host = new URL(url.value).host
  } catch {
    host = url.value.replace(/^https?:\/\//, '').split('/')[0]
  }
  ctx.setTextAlign('center')
  ctx.setFillStyle('#a1a1a6')
  ctx.setFontSize(10.5)
  ctx.fillText(host, W / 2, total - 52)

  ctx.setFillStyle('#1d1d1f')
  ctx.setFontSize(11)
  ctx.fillText(brand.value, W / 2, total - 26)

  ctx.draw(false, () => {
    // App 端 draw 回调时画面可能还没上屏，立刻导出会得到空白图
    setTimeout(exportImage, 80)
  })
}

function exportImage(): void {
  uni.canvasToTempFilePath({
    canvasId: 'poster',
    x: 0,
    y: 0,
    width: W,
    height: h.value,
    destWidth: W * 3,
    destHeight: h.value * 3,
    success: (res: any) => {
      stopLoop()
      imgPath.value = res.tempFilePath
      drawing.value = false
    },
    fail: () => {
      // 单次失败不判死：可能只是画布还没就绪，让重试循环再来一次
    },
  })
}

/**
 * 绘制 + 重试。
 *
 * App 端 canvas 有两个坑：原生画布没真正上屏时 `draw` 回调可能不触发；
 * 页面刚渲染时立刻绘制，画布还没就绪，这次绘制会被静默丢掉。
 * 所以没出图就隔一会儿重画，最多 3 次，之后翻成失败态让人能重试，
 * 绝不停在「正在生成…」。
 */
let loopTimer: ReturnType<typeof setTimeout> | null = null

function stopLoop(): void {
  if (loopTimer) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
}

async function generate(): Promise<void> {
  if (!doc.value) return
  stopLoop()
  drawing.value = true
  failed.value = ''
  imgPath.value = ''

  let lay: Layout
  try {
    lay = measure(uni.createCanvasContext('poster'))
  } catch {
    failed.value = '生成失败，请重试'
    drawing.value = false
    return
  }

  // 高度跟着内容走；改了尺寸要等画布重新排版再画
  if (h.value !== lay.h) {
    h.value = lay.h
    await nextTick()
    await new Promise((r) => setTimeout(r, 120))
  }

  let tries = 0
  const tick = (): void => {
    if (imgPath.value) return
    if (tries >= 3) {
      failed.value = '导出图片失败，可直接截图保存'
      drawing.value = false
      return
    }
    tries += 1
    try {
      paint(lay)
    } catch {
      failed.value = '生成失败，请重试'
      drawing.value = false
      return
    }
    loopTimer = setTimeout(tick, 1200)
  }
  loopTimer = setTimeout(tick, 60)
}

/* ---------------- 页面 ---------------- */

async function load(): Promise<void> {
  if (!docId.value) {
    error.value = '缺少文档参数'
    return
  }
  serverError.value = null
  failed.value = ''
  imgPath.value = ''
  void site.load()
  try {
    doc.value = await apiDoc(docId.value)
  } catch {
    error.value = '加载失败，请返回重试'
    return
  }

  /*
   * 优先让服务端画：各端同一张图，也不用赌 canvas 在 iOS 上能不能渲染。
   * 服务端画不了（没装中文字体、离线）才退回本机 canvas —— 那条路在老机型上
   * 仍可能空白，所以只在必要时才走。
   */
  drawing.value = true
  try {
    imgPath.value = await shareCard(doc.value.id, col.value?.name || '', col.value?.main || '')
    drawing.value = false
    return
  } catch (e) {
    const status = Number((e as { status?: number })?.status || 0)

    /*
     * 只有「连不上服务器」（status 0）才退回本机 canvas —— 那种情况服务端帮不上忙。
     * 其余一律把服务端的问题说清楚：
     * 空白画布会让人以为「又坏了」，而真正原因（版本太旧 / 缺依赖 / 缺字体）
     * 只写在服务端日志里，用户在手机上永远看不到。
     */
    if (status !== 0) {
      serverError.value =
        status === 404
          ? {
              title: '服务端还没有分享图接口',
              desc: '把服务器上的程序更新到 1.75 及以上（分享图改由服务端渲染）后重试。当前仍可以用「复制链接」分享这篇。',
            }
          : {
              title: `服务端生成失败（${status}）`,
              desc: '原因在服务器日志里（缺依赖 / 缺字体都会写明）。修好后点重试即可，文章本身不受影响。',
            }
      drawing.value = false
      return
    }
    /* 网络不通：本机 canvas 兜底，能抢一次是一次 */
  }

  await nextTick()
  setTimeout(() => void generate(), 80)
}

onLoad((opt: any) => {
  docId.value = String((opt && opt.id) || '')
})

onReady(() => {
  try {
    winW.value = uni.getSystemInfoSync().windowWidth || 375
  } catch {
    /* 拿不到就按 375 算 */
  }
  void load()
})

/** 重试：从服务端重新拉一次图（不是重画本机 canvas） */
function reload(): void {
  void load()
}

function back(): void {
  uni.navigateBack()
}

/**
 * 分享至应用（微信 / QQ / 备忘录…）。
 *
 * 走 **系统分享面板**（UIActivityViewController）：微信等应用在 iOS 上注册了
 * 分享扩展，图片会经过「选应用 → 选会话」两步发出，效果就是一张卡片图进聊天。
 * 这是未上架 App 唯一合规的路 —— 直接调微信 SDK 需要开放平台审核过的移动应用
 * （要「已上架信息」和 Universal Links），TrollStore 侧载包过不了审核。
 */
function shareToWechat(): void {
  if (!imgPath.value) return
  // #ifdef APP-PLUS
  const plusAny = (globalThis as any).plus
  if (!plusAny?.share?.sendWithSystem) {
    uni.showToast({ title: '当前环境不支持系统分享', icon: 'none' })
    return
  }
  plusAny.share.sendWithSystem(
    { type: 'image', pictures: [imgPath.value] },
    () => {
      /* 面板关闭即回调，不区分是否真的发出去 */
    },
    () => {
      // 常见原因：没装微信、微信扩展不接受该类型、系统面板被取消
      uni.showToast({ title: '没调起分享面板，可先保存到相册再发', icon: 'none' })
    },
  )
  // #endif
}

function save(): void {
  if (!imgPath.value) return
  // #ifdef APP-PLUS
  uni.saveImageToPhotosAlbum({
    filePath: imgPath.value,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'none' }),
    fail: (err: any) => {
      const msg = String(err?.errMsg || '')
      uni.showToast({
        title: msg.includes('auth') || msg.includes('denied') ? '需要相册权限' : '保存失败',
        icon: 'none',
      })
    },
  })
  return
  // #endif
  // #ifdef H5
  const a = document.createElement('a')
  a.href = imgPath.value
  a.download = `${doc.value?.title || 'share'}.png`
  a.click()
  uni.showToast({ title: '已下载图片', icon: 'none' })
  // #endif
}
</script>

<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back title="分享图" :elevated="true" @back="back" />

    <view v-if="error" class="hint">{{ error }}</view>

    <!-- 服务端的问题就说服务端：本机 canvas 兜底只会画出空白，看着更像坏了 -->
    <view v-else-if="serverError" class="hint">
      <text class="hint-t">{{ serverError.title }}</text>
      <text class="hint-s">{{ serverError.desc }}</text>
      <view class="hint-retry" @click="reload">重试</view>
    </view>

    <template v-else>
      <!-- 画布即预览：必须是普通文档流里的一层，不能套 fixed / 圆角+overflow -->
      <view class="stage">
        <canvas
          v-if="!imgPath"
          canvas-id="poster"
          id="poster"
          class="poster"
          :style="{ width: `${cssW}px`, height: `${cssH}px` }"
        />
        <image
          v-else
          :src="imgPath"
          mode="widthFix"
          class="shot"
          :style="{ width: `${cssW}px` }"
          :show-menu-by-longpress="true"
        />
      </view>

      <view class="acts">
        <!-- #ifdef APP-PLUS -->
        <!-- 走系统分享面板：iOS 上微信作为分享扩展出现，选它再挑聊天即可发送图片。
             真正的「微信 SDK 分享卡片」需要开放平台审核过的移动应用，侧载包拿不到。 -->
        <view :class="['btn', 'save-btn', imgPath ? '' : 'is-off']" @click="shareToWechat">
          <GIcon name="send" :size="30" :weight="2.2" />
          <text class="save-t">{{ drawing ? '生成中…' : '分享至应用' }}</text>
        </view>
        <view :class="['btn', 'btn-ghost', 'save-btn', imgPath ? '' : 'is-off']" @click="save">
          <text class="save-t">保存到相册</text>
        </view>
        <!-- #endif -->
        <!-- #ifdef H5 -->
        <view :class="['btn', 'save-btn', imgPath ? '' : 'is-off']" @click="save">
          <GIcon name="image" :size="30" :weight="2.2" />
          <text class="save-t">{{ drawing ? '生成中…' : '下载图片' }}</text>
        </view>
        <!-- #endif -->
        <view v-if="failed" class="btn btn-ghost retry-btn" @click="generate">重试</view>
      </view>

      <text class="tip">{{ tip }}</text>
      <!-- #ifdef APP-PLUS -->
      <!-- 提前说清这一步，否则用户会疑惑「怎么先弹了个系统面板」 -->
      <text class="tip tip-sub">「分享至应用」会先打开系统分享面板，选微信等应用后再挑要发的聊天</text>
      <!-- #endif -->
    </template>
  </view>
</template>

<style scoped>
.stage {
  display: flex;
  justify-content: center;
  padding: 16px 0 20px;
}

/* 圆角只能加在图片上；canvas 是原生组件，被裁会整块空白 */
.poster {
  display: block;
  background-color: #fff;
}

.shot {
  display: block;
  border-radius: 10px;
  /* 卡片是白的，页面底色也浅：没有边界会像一张飘着的白纸 */
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
}

.acts {
  display: flex;
  gap: 10px;
  padding: 0 16px;
}

.save-btn {
  flex: 1 1 auto;
  gap: 8px;
}

.save-btn.is-off {
  opacity: 0.45;
}

.save-t {
  font-size: var(--fs-base);
  font-weight: 600;
}

.retry-btn {
  flex: 0 0 auto;
  padding: 0 18px;
  font-size: var(--fs-base);
}

.tip {
  display: block;
  padding: 14px 20px calc(20px + env(safe-area-inset-bottom));
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--faint);
  text-align: center;
}

.tip-sub {
  padding-top: 0;
  color: var(--faint);
  opacity: 0.8;
}

.hint {
  padding: 40px 20px;
  font-size: var(--fs-sm);
  color: var(--faint);
  text-align: center;
}

.hint-t {
  display: block;
  margin-bottom: 10px;
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--text);
}

.hint-s {
  display: block;
  line-height: 1.7;
}

.hint-retry {
  display: inline-block;
  margin-top: 18px;
  padding: 10px 26px;
  border-radius: var(--r-full);
  background-color: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 600;
}
</style>

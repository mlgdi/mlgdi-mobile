<script setup lang="ts">
/**
 * 分享图：标题 / 栏目 / 日期 / 摘要 + 二维码，画成一张卡片导出 @3x。
 *
 * 为什么用 canvas 而不是拼 HTML 截图：App 端没有 html2canvas 那类能力，
 * 而 `<canvas>` + `uni.canvasToTempFilePath` 是两端都认的写法；
 * 二维码矩阵用 `qrcode` 库现算（纯 JS，不请求外部服务，链接不出本机）。
 *
 * 版式规则：
 * - 宽度固定 340，**高度跟着内容走**（最短 ~390，最长 470）——
 *   固定高度遇到短标题会在中间空出一大块，整张图重心就不对了；
 * - 文字按行宽折行并限制行数，超出的截断加省略号：分享图必须是确定的版式；
 * - 二维码固定在文字块下方 34px，尺寸 165（29 模块时正好 5px/模块，不糊）。
 */
import { getCurrentInstance, nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import GIcon from './GIcon.vue'
import { resolvedTheme } from '../theme'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    url: string
    /** 栏目中文名，画在左上角 */
    columnName?: string
    /** 栏目色（浅色模式的 main） */
    columnColor?: string
    dateText?: string
    excerpt?: string
  }>(),
  { columnName: '', columnColor: '#0066cc', dateText: '', excerpt: '' },
)

const emit = defineEmits<{ (e: 'close'): void }>()

/* 卡片逻辑尺寸（px），导出按 3 倍放大，手机上才够锐 */
const W = 340
const PAD = 24
const QR_BOX = 165
const TITLE_LH = 29
const EXCERPT_LH = 19
const TITLE_TOP = 66

const instance = getCurrentInstance()
const imgPath = ref('')
const busy = ref(false)
const failed = ref('')
/** canvas 高度随内容变，先测量再定 */
const canvasH = ref(470)

/**
 * 量字宽。App 端个别机型 `measureText` 返回 0 / NaN，
 * 那时按「中文 1em、西文 0.55em」估算 —— 排版略微不精确，但不会崩成每字一行。
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
function wrap(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
  fontSize: number,
): string[] {
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

/** 量字 → 定行数 → 定高度。测量用的 ctx 与正式绘制分开取，互不影响 */
function measure(ctx: any): Layout {
  ctx.setFontSize(20)
  const titleLines = wrap(ctx, props.title || '无标题', W - PAD * 2, 3, 20)
  let y = TITLE_TOP + titleLines.length * TITLE_LH

  let exLines: string[] = []
  if (props.excerpt) {
    ctx.setFontSize(12.5)
    exLines = wrap(ctx, props.excerpt, W - PAD * 2, 2, 12.5)
    y += 6 + exLines.length * EXCERPT_LH
  }

  // 文字块下 34px 起放二维码；更下方依次是域名与品牌，各留 22 / 26
  const qrTop = y + 34
  const h = qrTop + QR_BOX + 22 + 26 + 26
  return { titleLines, exLines, qrTop, h }
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

function paint(lay: Layout): void {
  const ctx = uni.createCanvasContext('sharePoster', instance?.proxy as any)
  const h = lay.h

  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, W, h)

  // 顶行：左栏目、右日期
  ctx.setFontSize(11)
  if (props.columnName) {
    ctx.setFillStyle(props.columnColor)
    ctx.setTextAlign('left')
    ctx.fillText(props.columnName, PAD, 34)
  }
  if (props.dateText) {
    ctx.setFillStyle('#86868b')
    ctx.setTextAlign('right')
    ctx.fillText(props.dateText, W - PAD, 34)
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

  drawQr(ctx, props.url, lay.qrTop)

  // 二维码下方：域名；底部：品牌（都贴着下沿，卡片高低不同也保持同一收尾）
  let host = ''
  try {
    host = new URL(props.url).host
  } catch {
    host = props.url.replace(/^https?:\/\//, '').split('/')[0]
  }
  ctx.setTextAlign('center')
  ctx.setFillStyle('#a1a1a6')
  ctx.setFontSize(10.5)
  ctx.fillText(host, W / 2, h - 52)

  ctx.setFillStyle('#1d1d1f')
  ctx.setFontSize(11)
  ctx.fillText('渡己 · Mlgdi', W / 2, h - 26)

  ctx.draw(false, () => {
    // App 端 draw 回调时画面可能还没上屏，直接导出会得到空白图
    setTimeout(() => uni.canvasToTempFilePath(
      {
        canvasId: 'sharePoster',
        x: 0,
        y: 0,
        width: W,
        height: h,
        destWidth: W * 3,
        destHeight: h * 3,
        success: (res: any) => {
          imgPath.value = res.tempFilePath
          busy.value = false
        },
        fail: () => {
          failed.value = '生成失败，请重试'
          busy.value = false
        },
      },
      instance?.proxy as any,
    ), 80)
  })
}

async function run(): Promise<void> {
  if (!props.url) {
    failed.value = '没有可分享的地址'
    return
  }
  busy.value = true
  failed.value = ''
  imgPath.value = ''
  try {
    const lay = measure(uni.createCanvasContext('sharePoster', instance?.proxy as any))
    // 高度变了要等 canvas 重新排版，再画
    canvasH.value = lay.h
    await nextTick()
    setTimeout(() => paint(lay), 60)
  } catch {
    failed.value = '生成失败，请重试'
    busy.value = false
  }
}

function retry(): void {
  void run()
}

watch(
  () => [props.open, props.url] as const,
  ([open]) => {
    if (!open) return
    imgPath.value = ''
    failed.value = ''
    // canvas 是 v-if 渲染的，等它进 DOM 再量；App 端还要一点时间拿到底层画布
    void nextTick().then(() => setTimeout(() => void run(), 40))
  },
  { immediate: true },
)

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
  a.download = `${props.title || 'share'}.png`
  a.click()
  uni.showToast({ title: '已下载图片', icon: 'none' })
  // #endif
}
</script>

<template>
  <view v-if="open" class="pmask" @click="emit('close')">
    <view class="pwrap" @click.stop>
      <view class="pcard">
        <!-- uni 的 image 组件里才是真 <img>，src 用 dataURL（H5）或临时文件（App） -->
        <image v-if="imgPath" :src="imgPath" mode="widthFix" class="pimg" />
        <view v-else class="pstate">
          <text class="pstate-t">{{ failed || '正在生成…' }}</text>
          <text v-if="failed" class="pstate-a" @click="retry">重试</text>
        </view>
      </view>

      <view class="pacts">
        <view class="pbtn pbtn-main" @click="save">
          <GIcon name="image" :size="30" :weight="2.2" />
          <text class="pbtn-t">保存到相册</text>
        </view>
        <view class="pbtn" @click="emit('close')">关闭</view>
      </view>
    </view>
  </view>

  <!-- 离屏画布：App 端 canvas 是原生层，必须放到屏幕外，否则会盖住页面 -->
  <canvas
    v-if="open"
    canvas-id="sharePoster"
    id="sharePoster"
    class="pcanvas"
    :style="{ width: W + 'px', height: canvasH + 'px' }"
  />
</template>

<style scoped>
.pmask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.72);
}

.pwrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32rpx;
  width: 100%;
  padding: 0 64rpx;
  box-sizing: border-box;
}

.pcard {
  width: 100%;
  border-radius: var(--r-md);
  overflow: hidden;
  background-color: #fff;
  box-shadow: var(--shadow-lg);
}

.pimg {
  display: block;
  width: 100%;
}

.pstate {
  height: 480rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.pstate-t {
  font-size: 28rpx;
  color: #6e6e73;
}

.pstate-a {
  font-size: 28rpx;
  color: #0066cc;
}

.pacts {
  display: flex;
  gap: 20rpx;
  width: 100%;
}

.pbtn {
  flex: 1 1 0;
  height: 92rpx;
  border-radius: var(--r-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #f5f5f7;
  background-color: rgba(255, 255, 255, 0.16);
}

.pbtn:active {
  background-color: rgba(255, 255, 255, 0.26);
}

.pbtn-main {
  flex: 1.6 1 0;
  background-color: #f5f5f7;
  color: #1d1d1f;
}

.pbtn-t {
  font-size: 28rpx;
  font-weight: 600;
}

.pcanvas {
  position: fixed;
  left: -9999px;
  top: 0;
}
</style>

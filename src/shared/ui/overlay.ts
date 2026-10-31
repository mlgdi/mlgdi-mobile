/**
 * 页面级浮层内核：DOM 宿主、主题跟随、样式注入。
 *
 * ## 为什么不用 uni.showLoading / showToast / showModal
 *
 * 1. **颜色改不了**。App 端这三个都是原生 UI（MBProgressHUD / 原生吐司 /
 *    UIAlertController），背景色由系统写死。浅色模式下弹框几乎是白的，
 *    压在同样白的页面上只剩一圈阴影，标题和正文糊成一片 —— 这正是
 *    「提示框和 App 色调没有反差」的根因，改 API 参数是改不掉的。
 * 2. **没有「延迟出现」这个概念**。请求 80ms 就回来时不该闪一下 loading；
 *    超过 0.5 秒才该出现。原生 API 只有「立刻显示」，只能靠调用方自己
 *    setTimeout，而调用方又不知道请求什么时候结束。
 * 3. **showLoading 是全局单例**。并发请求下第二次 show 会覆盖第一次，
 *    一次 hide 就把所有都关掉。四个请求同时飞时必然错乱。
 *
 * ## 为什么 DOM 方案在 App 端可行
 *
 * uni-app 的 vue 页面在 App 端就是 webview 渲染（只有 nvue 是原生渲染，
 * 本项目没有用 nvue）。所以 `document.createElement` 这条路径和 H5 完全一致。
 * 每个页面是**独立的 webview**，浮层随页面一起销毁，不需要在 onUnload 里
 * 手动打扫 —— 这也是把宿主挂在 `document.body` 而不是页面内容容器里的原因：
 * 避开页面内容上的 transform / overflow 裁剪，同时天然拥有独立层级。
 *
 * ## 主题怎么进来
 *
 * 宿主自己带 `.theme-light` / `.theme-dark` 类，变量写在本文件的 CSS 里
 * （`--go-*`），**不依赖** App.vue 的 `--bg/--text`。
 * 理由有两条：
 * - 浮层需要「一档明度差」而不是与页面同色，本来就得单独调；
 * - 页面根节点切主题时，浮层可能正在显示，独立变量不会因为 DOM 层级
 *   （宿主在 body 下、页面根节点在 body 内的另一棵树）而丢值。
 */

const HOST_CLASS = 'go-host'
const STYLE_ID = 'garden-overlay-style'

let host: HTMLElement | null = null
let styleReady = false

/**
 * 当前主题：以页面根节点上真实存在的类为准。
 *
 * 不 import `theme.ts` 的 resolvedTheme —— 那会形成
 * theme → api/prefs → api/client → ui/feedback → theme 的循环依赖。
 * 而且「看到什么就是什么」更可靠：DOM 上的类才是真正生效的那一套。
 */
function themeClass(): string {
  try {
    if (document.querySelector('.theme-dark')) return 'theme-dark'
    if (document.querySelector('.theme-light')) return 'theme-light'
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'theme-dark'
    }
  } catch {
    /* ignore */
  }
  return 'theme-light'
}

const CSS = `
.go-host{
  position:fixed;top:0;left:0;right:0;bottom:0;z-index:9990;
  pointer-events:none;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.go-host *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}

/* 浮层自带一套主题变量。关键在前两组色：
   --go-card  = 弹框面，与页面背景**差一档明度**（浅色下比纯白深、深色下比近黑亮），
                能浮起来但不会像「反色」那样突兀；
   --go-invert= 吐司/加载片，走强反差（浅色下深底白字、深色下浅底黑字），
                因为它是短暂掠过的东西，需要一眼看见。 */
.go-host.theme-light{
  --go-card:#e6e9ef;
  --go-ink:#1d1d1f;
  --go-ink2:#55555e;
  --go-line:rgba(0,0,0,.10);
  --go-fill:rgba(0,0,0,.06);
  --go-accent:#0066cc;
  --go-danger:#d70015;
  --go-scrim:rgba(18,18,20,.22);
  --go-invert:#26262a;
  --go-invert-ink:#f7f7f8;
  --go-shadow:0 24px 60px rgba(0,0,0,.26);
}
.go-host.theme-dark{
  --go-card:#35363c;
  --go-ink:#f5f5f7;
  --go-ink2:#b9b9c1;
  --go-line:rgba(255,255,255,.13);
  --go-fill:rgba(255,255,255,.09);
  --go-accent:#2997ff;
  --go-danger:#ff453a;
  --go-scrim:rgba(0,0,0,.56);
  --go-invert:#e9e9ee;
  --go-invert-ink:#161617;
  --go-shadow:0 24px 60px rgba(0,0,0,.6);
}

/* ---- 加载：轻遮罩 + 反色胶囊，不拦点击 ----
   拦点击是不敢的：历史上 uni.showLoading 卡住过一次没 hide，
   整屏点不动，只能杀进程。这里宁可让用户能继续操作。 */
.go-loading{
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  display:flex;align-items:center;gap:10px;
  max-width:78vw;padding:13px 18px;border-radius:16px;
  background:var(--go-invert);color:var(--go-invert-ink);
  box-shadow:0 12px 34px rgba(0,0,0,.24);
  font-size:15px;line-height:1.35;
  animation:go-fade .16s ease-out both;
}
.go-spin{
  width:16px;height:16px;flex:0 0 auto;border-radius:50%;
  border:2px solid currentColor;border-top-color:transparent;
  animation:go-rot .7s linear infinite;
}
.go-loading-text{min-width:0;word-break:break-word;}

/* ---- 轻提示 ---- */
.go-toast{
  position:fixed;left:50%;bottom:16%;transform:translateX(-50%);
  max-width:80vw;padding:11px 18px;border-radius:14px;
  background:var(--go-invert);color:var(--go-invert-ink);
  font-size:14.5px;line-height:1.45;text-align:center;word-break:break-word;
  box-shadow:0 10px 28px rgba(0,0,0,.22);
  animation:go-rise .2s ease-out both;
}

/* ---- 确认框 ---- */
.go-dialog-layer{
  position:fixed;top:0;left:0;right:0;bottom:0;
  display:flex;align-items:center;justify-content:center;
  padding:0 24px;background:var(--go-scrim);pointer-events:auto;
  animation:go-fade .16s ease-out both;
}
.go-dialog{
  width:84vw;max-width:330px;border-radius:20px;overflow:hidden;
  background:var(--go-card);color:var(--go-ink);
  border:1px solid var(--go-line);box-shadow:var(--go-shadow);
  animation:go-pop .2s cubic-bezier(.2,.9,.3,1.08) both;
}
.go-dialog-body{padding:22px 20px 18px;text-align:center;}
.go-dialog-title{margin:0 0 8px;font-size:17px;font-weight:600;line-height:1.35;letter-spacing:-.2px;color:var(--go-ink);}
.go-dialog-text{margin:0;font-size:14.5px;line-height:1.6;color:var(--go-ink2);white-space:pre-wrap;word-break:break-word;}
.go-dialog-input{
  display:block;width:100%;margin-top:14px;height:44px;padding:0 12px;
  border-radius:11px;border:1px solid var(--go-line);background:var(--go-fill);
  color:var(--go-ink);font-size:15px;font-family:inherit;outline:none;
}
.go-dialog-actions{display:flex;border-top:1px solid var(--go-line);}
.go-dialog-btn{
  flex:1 1 0;min-width:0;height:50px;line-height:50px;text-align:center;
  font-size:16px;font-weight:500;color:var(--go-accent);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.go-dialog-btn+.go-dialog-btn{border-left:1px solid var(--go-line);}
.go-dialog-btn:active{background:var(--go-fill);}
.go-dialog-btn.is-danger{color:var(--go-danger);}
.go-dialog-btn.is-strong{font-weight:600;}

@keyframes go-rot{to{transform:rotate(360deg)}}
@keyframes go-fade{from{opacity:0}to{opacity:1}}
@keyframes go-rise{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes go-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
`

function injectStyle(): void {
  if (styleReady) return
  styleReady = true
  try {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    // head 还没解析完时挂到 documentElement，总之只挂一次
    ;(document.head || document.documentElement).appendChild(style)
  } catch {
    /* 注入失败就从 getHost 的返回 null 走降级 */
  }
}

/**
 * 取当前页面的浮层宿主，没有就建一个。
 *
 * 每次调用都重刷主题类：用户可能刚在设置里切了深浅色，
 * 而浮层宿主是长期存在的 DOM，不刷新就会一直用旧配色。
 */
export function getHost(): HTMLElement | null {
  try {
    if (host && document.body && document.body.contains(host)) {
      const cls = `${HOST_CLASS} ${themeClass()}`
      if (host.className !== cls) host.className = cls
      return host
    }
    injectStyle()
    host = document.createElement('div')
    host.className = `${HOST_CLASS} ${themeClass()}`
    // aria：让读屏软件知道这是一层状态提示
    host.setAttribute('role', 'presentation')
    document.body.appendChild(host)
    return host
  } catch {
    return null
  }
}

/** 建元素的小工具，统一 tag + class，省掉一串 createElement/className */
export function node(tag: string, cls = '', text?: string): HTMLElement {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text !== undefined) el.textContent = text
  return el
}

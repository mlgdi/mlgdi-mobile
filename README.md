# 渡己 · 移动端（`.app-mobile`）

uni-app（Vue3 + vite CLI）一套代码，**首发 iOS**（巨魔侧载 IPA），小程序后置。
与 Web 前端 `.app/frontend` **完全独立**：不共享构建，也不共享 node_modules。

方案与决策背景见 `docs/移动端方案-uni-app.md`；本文只讲怎么跑。

---

## 为什么不是 HBuilderX 工程

`uni-app` 的 Vue3 版本可以纯 CLI 编译（`uni` 命令来自 `@dcloudio/vite-plugin-uni`），
所以**写码、编译、上传全流程不需要 HBuilderX**。HBuilderX 只在最后一步
App 云打包（APK/IPA）时用到，它不参与日常开发。

---

## 目录

```
src/
  shared/                 共享业务层（各端一份，差异不在这里）
    api/client.ts         请求层：鉴权头、错误归一、无感续期
    api/{auth,notes,inbox}.ts  接口定义（含写入：新建/导入/改正文/发布）
    auth/session.ts       登录态 + 设备凭证存取（★按服务器命名空间隔离）
    config/server.ts      服务器地址（默认线上域名，可改）+ 连接探测
    store/{auth,notes}.ts Pinia
    utils/markdown.ts     markdown-it + wikilink/embed 规则
    utils/file.ts         .md 选文件/剪贴板/选图转 data URL（H5 与 App 两套实现）
    utils/asset.ts        资产地址收敛（相对路径 → 资产端点）
    capabilities.ts       各端能力表（★页面里禁止写平台判断）
    theme.ts              主题（仅本地，不写账号）
  pages/
    library/              知识库列表（含剪贴板检测、投递 FAB）
    doc/                  阅读
    inbox/                碎片箱：投递 / 筛选 / 整理成文 / 删除
    edit/                 正文编辑（乐观锁）+ 状态可见性 + 发布
    import/               导入 .md（选文件 / 剪贴板）
    settings/ server/ login/
```

---

## 本地跑起来

```bash
# H5（日常调试、手机浏览器可通过局域网访问）
npm run dev:h5              # http://192.168.1.88:5173

# 构建
npm run build:h5            # → dist/build/h5
npm run build:app           # → dist/build/app（HBuilderX 云打包用）
npm run type-check
```

**首次打开默认连 `https://www.mlgdi.com`**（域名尚未上线时会连不通）：
登录页 →「服务器」→ 填 `http://192.168.1.88:8010` → 测试连接 → 保存。

局域网联调的前提在后端那侧：`garden.local.yaml` 里 `server.host: 0.0.0.0`、
`cors_origins` 放行手机来源、Windows 防火墙放行 8010。

---

## 三条不能破的约定

1. **凭证键必须带服务器指纹**（`garden.auth.token@{host}`）。否则切测试服再切回来，
   会把 A 服的 token 发给 B 服，表现为莫名其妙的 401。
2. **每个请求带 `X-Device-Key`**。后端 1.57.0 起，设备绑定的 JWT 缺这个头必 401
   （`DEVICE_MISMATCH`）；这个错误**不做续期重试**，直接回登录页。
3. **平台差异只写进 `capabilities.ts`**，不在业务代码里散落 `if (platform === ...)`。

---

## 导入本机 Markdown 的三条路

| 方式 | 支持端 | 说明 |
|---|---|---|
| App 内「选择 .md 文件」 | App / H5 | iOS 从「文件」App、iCloud Drive 里选；H5 走 `input[type=file]` |
| 从剪贴板导入 | 全端 | 复制正文 → 导入页「从剪贴板」 |
| 系统分享菜单（分享到渡己） | **未支持** | 需要原生 Share Extension（`CFBundleDocumentTypes`），uni-app 无法只靠 JS 实现；见下 |

**关于「从别的 App 直接分享 md 过来」**：这需要给 App 加原生 Share Extension target，
HBuilderX 云打包无法只靠 manifest 配置完成，得单独做原生插件。当前替代路径：

- 在「文件」App 里长按 md → 存储到本机/iCloud → 在渡己里「选择 .md 文件」
- 或用**快捷指令**：取文件内容 → `POST /api/v1/inbox/capture`（后端 1.53 起支持 PAT
  `inbox:write`），可以从任何 App 的分享菜单触发，零客户端代码

---

## 冒烟测试

```bash
npm run dev:h5 &
node scripts/smoke-h5.mjs     # 需要先 npx playwright install chromium
```

覆盖 16 步：登录页 → 切服务器 + 连通性 → 设备绑定登录 → 库列表 → 文章渲染 →
碎片投递 → 整理成文 → 编辑器改动/保存 → 发布 → 选 .md 文件自动填标题 → 导入 →
深色主题 → 清理（软删文档、吊销设备）。截图落在 `shots/`（不入库）。

---

## 出包：GitHub Actions 打未签名 IPA

本仓库是**独立的私有仓库**（不包含 vault 的任何笔记内容）。iOS 出包走离线打包，
**不需要 Apple 开发者账号**：`CODE_SIGNING_ALLOWED=NO` 编出来的未签名 `.app`
打成 IPA 后，TrollStore 直接装。

```bash
gh workflow run ios-unsigned.yml -f sdk_asset=SDK.zip
gh run watch && gh run download --name garden-unsigned-ipa
```

### 实测性能（2026-10-26，macos-15）

| 阶段 | 耗时 |
|---|---|
| npm ci + build:app | ~40 s |
| 拉 SDK（缓存命中则跳过） | 0–90 s |
| 组装资源 + 改工程 | ~20 s |
| `pod install`（含 uniapp 子规格） | 6–7 min |
| `xcodebuild`（8 个模块，Release/arm64） | 4–5 min |
| **合计** | **约 12 分钟** |

产物 33 MB，`Payload/HBuilder.app`，arm64，`MinimumOSVersion 13.0`。

### 五个坑（都是实测踩出来的，别重犯）

1. **SDK zip 里有 `__MACOSX/`**：同名目录会让 `find` 命中 AppleDouble 假目录，
   必须先 `rm -rf __MACOSX`
2. **bash 变量后紧跟中文全角括号**（`$VAR（…`）会被当成变量名 → `unbound variable`，
   一律写 `${VAR}`
3. **SDK 没有 shared scheme**：CI 上没法用 Xcode GUI 生成，必须自己写一份，
   target id 要用 python 精确解析 pbxproj（`grep`/`awk` 会取到 build phase 的 id）
4. **默认模块列表里 `Geolocation-Tencent` 链接不过**：UTS 版 Swift 6 产物报
   `_swift_coroFrameAlloc` undefined。我们不用定位，直接裁 subspec 到
   `Core/File/CameraGallery/XMLHttpRequest/Zip/Sqlite/Log/Canvas`
5. **artifact 下载会 302 到预签名 URL**，带着 `Authorization` 头跟随会被 Azure 拒（401）。
   要取 `redirect_url` 后**不带认证头**再下

### 一次性准备（已完成）

1. Release tag `sdk` 存 `SDK.zip`（688 MB，HBuilderX 5.26 对应版）
2. Secret `DCLOUD_APPKEY`

---

## 里程碑状态

| 项 | 状态 |
|---|---|
| M1 工程基建（请求层 / 设备绑定 / 服务器切换） | ✅ |
| M2 阅读（列表 / 文章 / 搜索筛选 / 深色） | ✅ |
| M3 捕获（投递 / 图片 / 剪贴板检测 / md 导入） | ✅ |
| M4 轻管理（整理成文 / 编辑 / 发布 / 设备吊销） | ✅ |
| M5 iOS 出包（HBuilderX + 免费证书 + 巨魔） | ✅ GitHub Actions 离线打包（12 分钟/次，免证书） |
| M6 小程序端 | 后置 |
| 系统分享扩展（Share Extension） | 未开始（需原生插件） |
| 设备密钥存 Keychain/Keystore | 当前用本地存储，已知欠账 |

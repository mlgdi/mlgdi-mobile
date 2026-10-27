<template>
  <view :class="['page', `theme-${resolvedTheme}`]">
    <GTopBar back :title="panelTitle" :elevated="true" @back="back" />

    <!-- ============ 一级：菜单 ============ -->
    <template v-if="panel === 'root'">
      <view class="section">
        <view class="card">
          <view class="cell" @click="openPanel('general')">
            <view class="cell-main">
              <text class="cell-title">偏好</text>
              <text class="cell-sub muted">主题 · 剪贴板投递 · 版本</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="toServer">
            <view class="cell-main">
              <text class="cell-title">服务器</text>
              <text class="cell-sub muted">{{ baseUrl }}</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </view>
      </view>

      <view v-if="auth.isAdmin" class="section">
        <text class="section-label muted">管理（改动直接写入站点配置）</text>
        <view class="card">
          <view class="cell" @click="openPanel('site')">
            <view class="cell-main">
              <text class="cell-title">站点信息</text>
              <text class="cell-sub muted">名称 · 标语 · 描述 · 作者</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="openPanel('columns')">
            <view class="cell-main">
              <text class="cell-title">栏目与小类</text>
              <text class="cell-sub muted">五个栏目的名称、简介与小类别名</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="openPanel('ai')">
            <view class="cell-main">
              <text class="cell-title">AI 动作</text>
              <text class="cell-sub muted">查看当前启用的动作清单</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="card">
          <view class="cell" @click="openPanel('account')">
            <view class="cell-main">
              <text class="cell-title">账号与设备</text>
              <text class="cell-sub muted">{{ auth.displayName }} · {{ devices.length }} 台设备</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </view>
      </view>
    </template>

    <!-- ============ 二级：偏好 ============ -->
    <template v-else-if="panel === 'general'">
      <view class="section">
        <text class="section-label muted">主题</text>
        <view class="card">
          <view class="seg">
            <view
              v-for="opt in themeOptions"
              :key="opt.value"
              :class="['seg-item', themeMode === opt.value ? 'seg-on' : '']"
              @click="pickTheme(opt.value)"
            >
              {{ opt.label }}
            </view>
          </view>
        </view>
        <text class="note muted">主题只存在本机，不会改动网页端（与 Web「偏好跟账号」刻意不同）。</text>
      </view>

      <view class="section">
        <text class="section-label muted">捕捉</text>
        <view class="card">
          <view class="cell">
            <view class="cell-main">
              <text class="cell-title">剪贴板投递弹窗</text>
              <text class="cell-sub muted">切回 App 时检测剪贴板，有内容就询问是否收进碎片箱</text>
            </view>
            <switch :checked="clipAsk" color="#0066cc" @change="toggleClip" />
          </view>
        </view>
        <text class="note muted">iOS 系统会在首次读取时弹「允许粘贴」授权；关掉这个开关就完全不读剪贴板。</text>
      </view>

      <view class="section">
        <text class="section-label muted">关于</text>
        <view class="card">
          <view class="cell">
            <text class="cell-title">版本</text>
            <text class="cell-sub muted">v{{ appVersion }}</text>
          </view>
        </view>
      </view>
    </template>

    <!-- ============ 二级：站点信息 ============ -->
    <template v-else-if="panel === 'site'">
      <view class="section">
        <text class="section-label muted">品牌字段（写入 site.yaml，保存后立即生效）</text>
        <view class="card form">
          <view class="field">
            <text class="field-label">站点名称</text>
            <input v-model="site.name" class="field-input" placeholder="渡己" />
          </view>
          <view class="field">
            <text class="field-label">标语</text>
            <input v-model="site.tagline" class="field-input" placeholder="一念入笺…" />
          </view>
          <view class="field">
            <text class="field-label">描述</text>
            <textarea
              v-model="site.description"
              class="field-input field-area"
              :maxlength="-1"
              :auto-height="true"
              placeholder="站点一句话介绍"
            />
          </view>
          <view class="field">
            <text class="field-label">作者</text>
            <input v-model="site.author" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">备案号</text>
            <input v-model="site.icp" class="field-input" placeholder="留空则不显示" />
          </view>
          <view class="field">
            <text class="field-label">每页条数</text>
            <input v-model="site.pageSize" class="field-input" type="number" placeholder="15" />
          </view>
        </view>
        <button :class="['btn', 'save-btn', siteSaving ? 'btn-off' : '']" @click="submitSite">
          {{ siteSaving ? '保存中…' : '保存站点信息' }}
        </button>
        <text v-if="siteNotice" class="note muted">{{ siteNotice }}</text>
      </view>
    </template>

    <!-- ============ 二级：栏目与小类 ============ -->
    <template v-else-if="panel === 'columns'">
      <view v-for="(col, i) in cols" :key="col.code" class="section">
        <view class="row section-head">
          <text class="section-label muted">{{ col.code }} · {{ col.path }}</text>
          <text class="section-label muted">序号 {{ col.order }}</text>
        </view>
        <view class="card form">
          <view class="field">
            <text class="field-label">栏目名</text>
            <input v-model="col.name" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">简介（列表卡副行）</text>
            <input v-model="col.brief" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">描述（栏目页）</text>
            <textarea
              v-model="col.desc"
              class="field-input field-area"
              :maxlength="-1"
              :auto-height="true"
            />
          </view>
          <view v-if="col.subs.length" class="subs-edit">
            <text class="field-label">小类别名（留空 = 用目录名）</text>
            <view v-for="sub in col.subs" :key="sub.path" class="sub-row">
              <text class="sub-path">{{ sub.path }}</text>
              <input v-model="sub.name" class="field-input sub-input" :placeholder="dirName(sub.path)" />
            </view>
          </view>
        </view>
        <view v-if="i === cols.length - 1" class="section">
          <button :class="['btn', 'save-btn', colsSaving ? 'btn-off' : '']" @click="submitColumns">
            {{ colsSaving ? '保存中…' : '保存栏目配置' }}
          </button>
          <text v-if="colsNotice" class="note muted">{{ colsNotice }}</text>
        </view>
      </view>
      <view v-if="!cols.length" class="section">
        <view class="card cell"><text class="muted">加载中…</text></view>
      </view>
    </template>

    <!-- ============ 二级：AI 动作 ============ -->
    <template v-else-if="panel === 'ai'">
      <view class="section">
        <text class="section-label muted">编辑页 · 对选中文字</text>
        <view class="card">
          <view v-if="!aiSel.length" class="cell"><text class="muted">（空）</text></view>
          <view v-for="a in aiSel" :key="a.key" class="cell">
            <text class="cell-title">{{ a.label }}</text>
          </view>
        </view>
      </view>
      <view class="section">
        <text class="section-label muted">编辑页 · 对整篇</text>
        <view class="card">
          <view v-if="!aiDoc.length" class="cell"><text class="muted">（空）</text></view>
          <view v-for="a in aiDoc" :key="a.key" class="cell">
            <text class="cell-title">{{ a.label }}</text>
          </view>
        </view>
      </view>
      <view class="section">
        <text class="note muted">
          动作的人设、作用域与启停统一在仓库的 .garden/workflows.yaml 里维护（用 Obsidian
          编辑），保存后按指纹自动热加载——这里只读展示，不做编辑，避免两端各改一份。
        </text>
      </view>
    </template>

    <!-- ============ 二级：账号与设备 ============ -->
    <template v-else-if="panel === 'account'">
      <view class="section">
        <view class="card">
          <view class="cell">
            <view class="cell-main">
              <text class="cell-title">{{ auth.displayName }}</text>
              <text class="cell-sub muted">{{ auth.isAdmin ? '管理员' : '成员' }}</text>
            </view>
          </view>
          <view class="divider" />
          <view class="cell" @click="logout">
            <text class="cell-title danger">退出登录</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="row section-head">
          <text class="section-label muted">已登记设备</text>
          <text class="section-label muted">{{ devices.length }}</text>
        </view>
        <view class="card">
          <view v-if="!devices.length" class="cell">
            <text class="muted">没有设备记录（Web 端不登记设备）</text>
          </view>
          <template v-for="(d, i) in devices" :key="d.id">
            <view v-if="i > 0" class="divider" />
            <view class="cell">
              <view class="cell-main">
                <view class="row">
                  <text class="cell-title">{{ d.name || d.platform || '未知设备' }}</text>
                  <text v-if="d.current" class="badge">本机</text>
                </view>
                <text class="cell-sub muted">{{ d.platform }} · 最近 {{ shortTime(d.last_seen_at) }}</text>
              </view>
              <text v-if="!d.current" class="revoke" @click="revoke(d)">吊销</text>
            </view>
          </template>
        </view>
        <text class="note muted">吊销后该设备的下一个请求即失效；换机丢手机时用得上。</text>
      </view>
    </template>

    <view class="tail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GTopBar from '../../shared/components/GTopBar.vue'
import GIcon from '../../shared/components/GIcon.vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../shared/store/auth'
import { getBaseUrl } from '../../shared/config/server'
import { listDevices, revokeDevice, type DeviceRow } from '../../shared/api/auth'
import { resolvedTheme, themeMode, setThemeMode, type ThemeMode } from '../../shared/theme'
import { APP_VERSION } from '../../shared/version'
import {
  adminColumns,
  saveColumns,
  saveSite,
  type AdminColumn,
} from '../../shared/api/admin'
import { aiActions, type AiAction } from '../../shared/api/ai'

type Panel = 'root' | 'general' | 'site' | 'columns' | 'ai' | 'account'

const auth = useAuthStore()
const appVersion = APP_VERSION
const baseUrl = ref(getBaseUrl())
const devices = ref<DeviceRow[]>([])
const panel = ref<Panel>('root')

const PANEL_TITLES: Record<Panel, string> = {
  root: '设置',
  general: '偏好',
  site: '站点信息',
  columns: '栏目与小类',
  ai: 'AI 动作',
  account: '账号与设备',
}
const panelTitle = computed(() => PANEL_TITLES[panel.value])

function openPanel(p: Panel): void {
  panel.value = p
  if (p === 'site' || p === 'columns') void loadAdmin()
  if (p === 'ai') void loadAi()
}

function back(): void {
  if (panel.value !== 'root') {
    panel.value = 'root'
    return
  }
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/library/index' })
}

/** 剪贴板询问开关：默认开；intake.ts 每次回前台现读，改完立即生效 */
const clipAsk = ref(uni.getStorageSync('garden.intake.clip') !== 'off')

function toggleClip(e: any): void {
  clipAsk.value = Boolean(e?.detail?.value)
  try {
    uni.setStorageSync('garden.intake.clip', clipAsk.value ? 'on' : 'off')
  } catch {
    /* 存不进就本次会话有效 */
  }
}

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

function pickTheme(mode: ThemeMode): void {
  setThemeMode(mode)
}

/* ---------------- 站点信息（admin） ---------------- */
const site = ref({
  name: '',
  tagline: '',
  description: '',
  author: '',
  icp: '',
  pageSize: '',
})
const siteSaving = ref(false)
const siteNotice = ref('')

/* ---------------- 栏目与小类（admin） ---------------- */
const cols = ref<AdminColumn[]>([])
const colsSaving = ref(false)
const colsNotice = ref('')

/** 小类别名留空时回退的目录名 = 路径最后一段 */
function dirName(path: string): string {
  return path.split('/').pop() || path
}

async function loadAdmin(): Promise<void> {
  colsNotice.value = ''
  siteNotice.value = ''
  try {
    const full = await adminColumns()
    site.value = {
      name: full.name || '',
      tagline: full.tagline || '',
      description: full.description || '',
      author: full.author || '',
      icp: full.icp || '',
      pageSize: String(full.page_size ?? ''),
    }
    cols.value = full.items || []
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '站点配置加载失败', icon: 'none' })
  }
}

function submitSite(): void {
  const pageSize = parseInt(site.value.pageSize, 10)
  siteSaving.value = true
  saveSite({
    name: site.value.name.trim(),
    tagline: site.value.tagline.trim(),
    description: site.value.description.trim(),
    author: site.value.author.trim(),
    icp: site.value.icp.trim(),
    page_size: Number.isFinite(pageSize) ? pageSize : undefined,
  })
    .then((res) => {
      siteNotice.value = res.message || '已保存'
      uni.showToast({ title: '已保存', icon: 'none' })
    })
    .catch((err: any) => {
      siteNotice.value = err?.reason || '保存失败'
    })
    .finally(() => {
      siteSaving.value = false
    })
}

function submitColumns(): void {
  colsSaving.value = true
  // 小类别名空串回退为目录名——后端留空等价于「不设别名」，这里显式归一
  const items = cols.value.map((c) => ({
    ...c,
    name: c.name.trim(),
    brief: c.brief.trim(),
    desc: c.desc.trim(),
    subs: c.subs.map((sub) => ({ ...sub, name: (sub.name || '').trim() || dirName(sub.path) })),
  }))
  saveColumns(items)
    .then((res) => {
      colsNotice.value = res.message || '已保存'
      uni.showToast({ title: '已保存', icon: 'none' })
    })
    .catch((err: any) => {
      colsNotice.value = err?.reason || '保存失败'
    })
    .finally(() => {
      colsSaving.value = false
    })
}

/* ---------------- AI 动作（只读） ---------------- */
const aiSel = ref<AiAction[]>([])
const aiDoc = ref<AiAction[]>([])

async function loadAi(): Promise<void> {
  try {
    const res = await aiActions()
    aiSel.value = res.groups.selection || []
    aiDoc.value = res.groups.doc || []
  } catch {
    aiSel.value = []
    aiDoc.value = []
  }
}

/* ---------------- 账号与设备 ---------------- */
function shortTime(raw: string | null): string {
  if (!raw) return '未记录'
  const d = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

async function loadDevices(): Promise<void> {
  try {
    const res = await listDevices()
    devices.value = res.devices || []
  } catch {
    devices.value = []
  }
}

function revoke(d: DeviceRow): void {
  uni.showModal({
    title: '吊销设备',
    content: `吊销后「${d.name || d.platform}」需要重新登录，确定吗？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await revokeDevice(d.id)
        uni.showToast({ title: '已吊销', icon: 'none' })
        loadDevices()
      } catch (err: any) {
        uni.showToast({ title: err?.reason || '吊销失败', icon: 'none' })
      }
    },
  })
}

function logout(): void {
  uni.showModal({
    title: '退出登录',
    content: '本机将清除令牌（设备登记保留，可在列表里吊销）。',
    success: (res) => {
      if (!res.confirm) return
      auth.logout()
      uni.reLaunch({ url: '/pages/login/index' })
    },
  })
}

function toServer(): void {
  uni.navigateTo({ url: '/pages/server/index' })
}

onShow(() => {
  baseUrl.value = getBaseUrl()
  loadDevices()
})
</script>

<style scoped>
.section {
  padding: 16px 16px 0;
}

.section-head {
  justify-content: space-between;
  padding: 0 2px;
}

.section-label {
  display: block;
  font-size: 12px;
  padding: 0 2px 8px;
  letter-spacing: 0.3px;
}

.card {
  overflow: hidden;
}

.cell {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.cell:active {
  background-color: var(--surface-2);
}

.cell-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-title {
  font-size: 16px;
  color: var(--text);
}

.cell-sub {
  font-size: 12px;
  word-break: break-all;
}

.chev {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--faint);
}

.danger {
  color: var(--danger);
}

.badge {
  font-size: 10px;
  color: var(--accent);
  background-color: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 6px;
}

.revoke {
  font-size: 13px;
  color: var(--danger);
  padding: 6px 10px;
  border-radius: 8px;
  background-color: var(--surface-2);
}

.seg {
  display: flex;
  padding: 6px;
  gap: 4px;
}

.seg-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: 14px;
  color: var(--muted);
  border-radius: 9px;
}

.seg-on {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.note {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 4px 0;
}

/* ---------------- 二级面板表单 ---------------- */
.form {
  padding: 6px 16px 10px;
}

.field {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field:last-child {
  border-bottom: none;
}

.field-label {
  font-size: 12px;
  color: var(--muted);
}

.field-input {
  font-size: 15px;
  color: var(--text);
  background: transparent;
}

.field-area {
  /* uni 的 auto-height 在滚动容器里会慢一拍，先给足最小高度避免压到下一行 */
  min-height: 84px;
  line-height: 1.6;
}

.subs-edit {
  margin-top: 6px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sub-path {
  flex: 0 0 auto;
  max-width: 44%;
  font-size: 12px;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-input {
  flex: 1;
  font-size: 14px;
  color: var(--text);
  background: transparent;
  border-bottom: 1px solid var(--line);
  padding: 4px 0;
}

.save-btn {
  margin-top: 14px;
}

.tail {
  height: calc(env(safe-area-inset-bottom) + 40px);
}
</style>

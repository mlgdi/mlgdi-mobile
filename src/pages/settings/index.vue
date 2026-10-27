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
              <text class="cell-title">AI 设置</text>
              <text class="cell-sub muted">服务器与密钥 · 工作流启停</text>
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

      <view class="section">
        <view class="card">
          <view class="cell" @click="openPanel('about')">
            <view class="cell-main">
              <text class="cell-title">关于</text>
              <text class="cell-sub muted">渡己・Mlgdi · v{{ appVersion }}</text>
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

    <!-- ============ 二级：栏目与小类 ============
         移动原生：栏目是一行，点进「三级面板」全屏编辑（名称/简介/描述/小类别名），
         每栏单独保存（整份回写，只动这一栏的数据）。 -->
    <template v-else-if="panel === 'columns'">
      <view class="section">
        <text class="section-label muted">点栏目进入编辑；改动在编辑页单独保存</text>
        <view class="card">
          <template v-for="(col, i) in cols" :key="col.code">
            <view v-if="i > 0" class="divider" />
            <view class="cell" @click="openColEditor(i)">
              <view class="col-badge" :style="{ backgroundColor: colColor(col.code) }">
                <text class="col-badge-t">{{ col.code }}</text>
              </view>
              <view class="cell-main">
                <text class="cell-title">{{ col.name }}</text>
                <text class="cell-sub muted">{{ col.brief || dirName(col.path) }} · {{ col.subs.length }} 个小类</text>
              </view>
              <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
            </view>
          </template>
          <view v-if="!cols.length" class="cell"><text class="muted">加载中…</text></view>
        </view>
      </view>
    </template>

    <!-- ============ 三级：栏目编辑 ============ -->
    <template v-else-if="panel === 'columnEdit' && editCol">
      <view class="section">
        <text class="section-label muted">{{ editCol.code }} · {{ editCol.path }}（保存整份回写，只动这一栏）</text>
        <view class="card form">
          <view class="field">
            <text class="field-label">栏目名</text>
            <input v-model="editCol.name" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">简介（列表卡副行）</text>
            <input v-model="editCol.brief" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">描述（栏目页）</text>
            <textarea
              v-model="editCol.desc"
              class="field-input field-area"
              :maxlength="-1"
              :auto-height="true"
            />
          </view>
          <view v-if="editCol.subs.length" class="subs-edit">
            <text class="field-label">小类别名（留空 = 用目录名）</text>
            <view v-for="sub in editCol.subs" :key="sub.path" class="sub-row">
              <text class="sub-path">{{ sub.path }}</text>
              <input v-model="sub.name" class="field-input sub-input" :placeholder="dirName(sub.path)" />
            </view>
          </view>
        </view>
        <button :class="['btn', 'save-btn', colsSaving ? 'btn-off' : '']" @click="submitColumn">
          {{ colsSaving ? '保存中…' : '保存本栏目' }}
        </button>
        <text v-if="colsNotice" class="note muted">{{ colsNotice }}</text>
      </view>
    </template>

    <!-- ============ 二级：AI 设置 ============
         引擎/地址/密钥/模型 + 测试连接；工作流是开关列表，
         拨一下即整份回写并热加载——移动端不做提示词编辑（那是 Obsidian 的事）。 -->
    <template v-else-if="panel === 'ai'">
      <view class="section">
        <text class="section-label muted">引擎与密钥（写入 garden.local.yaml，保存即生效）</text>
        <view class="card form">
          <view class="field">
            <text class="field-label">引擎</text>
            <view class="seg">
              <view
                :class="['seg-item', ai.engine === 'stub' ? 'seg-on' : '']"
                @click="ai.engine = 'stub'"
              >
                stub（不联网）
              </view>
              <view
                :class="['seg-item', ai.engine === 'llm' ? 'seg-on' : '']"
                @click="ai.engine = 'llm'"
              >
                llm（直连模型）
              </view>
            </view>
          </view>
          <view class="field">
            <text class="field-label">接口地址（OpenAI 兼容，留 /v1）</text>
            <input v-model="ai.llm_api_base" class="field-input" placeholder="https://api.deepseek.com/v1" />
          </view>
          <view class="field">
            <text class="field-label">API Key{{ aiKeyHint ? `（已设置 ${aiKeyHint}，留空保持）` : '' }}</text>
            <input v-model="aiKeyInput" class="field-input" password placeholder="留空 = 保持原值" />
          </view>
          <view class="field">
            <text class="field-label">对话模型</text>
            <input v-model="ai.llm_model" class="field-input" placeholder="例 deepseek-chat" />
          </view>
          <view class="field">
            <text class="field-label">封面模型（留空 = 不启用）</text>
            <input v-model="ai.llm_image_model" class="field-input" />
          </view>
        </view>
        <view class="btn-row">
          <button :class="['btn', 'flex1', aiSaving ? 'btn-off' : '']" @click="submitAi">
            {{ aiSaving ? '保存中…' : '保存' }}
          </button>
          <button :class="['btn', 'btn-ghost', 'flex1', aiTesting ? 'btn-off' : '']" @click="testAi">
            {{ aiTesting ? '测试中…' : '测试连接' }}
          </button>
        </view>
        <text v-if="aiTestText" :class="['note', 'muted', aiTestOk ? '' : 'test-fail']">{{ aiTestText }}</text>
      </view>

      <view class="section">
        <text class="section-label muted">工作流启停（拨动即保存并热加载）</text>
        <view class="card">
          <template v-for="(wf, i) in wfs" :key="wf.key">
            <view v-if="i > 0" class="divider" />
            <view class="cell" @click="openWfEditor(i)">
              <view class="cell-main">
                <view class="row">
                  <text class="cell-title">{{ wf.name }}</text>
                  <text class="wf-scope">{{ wf.scope }}</text>
                </view>
                <text class="cell-sub muted">{{ wf.description || wf.key }}</text>
              </view>
              <switch
                :checked="wf.enabled"
                color="#0066cc"
                @click.stop
                @change="toggleWorkflow(wf, $event)"
              />
            </view>
          </template>
          <view v-if="!wfs.length" class="cell"><text class="muted">加载中…</text></view>
        </view>
        <text class="note muted">提示词与人设在 .garden/workflows.yaml（用 Obsidian 编辑），这里只做启停。</text>
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

    <!-- ============ 二级：关于 ============ -->
    <template v-else-if="panel === 'about'">
      <view class="section">
        <view class="card about-card">
          <text class="about-brand">渡己・Mlgdi</text>
          <text class="about-ver">v{{ appVersion }}</text>
          <text class="about-p">自托管个人知识中枢 · 移动端。Markdown 文件是唯一数据源（SSOT），
正文中的一切改动最终都落回你自己的 vault，索引只是缓存。</text>
          <text class="about-p">五个栏目（魔笺 / 灵溯 / 观悟 / 道寻 / 逸隅）+ 碎片箱 +
AI 洗稿，与网页端、Obsidian 共用同一份数据。</text>
        </view>
      </view>
      <view class="section">
        <view class="card">
          <view class="cell">
            <text class="cell-title">服务器</text>
            <text class="cell-sub muted">{{ baseUrl }}</text>
          </view>
        </view>
      </view>
      <view class="section">
        <text class="note muted">移动端 UI 规范与变更记录见仓库 docs/ 与 CHANGELOG.md。</text>
      </view>
    </template>

    <!-- ============ 三级：工作流编辑（跳转式，与栏目编辑同一操作语言） ============ -->
    <template v-else-if="panel === 'wfEdit' && editWf">
      <view class="section">
        <text class="section-label muted">{{ editWf.key }} · {{ editWf.scope }}（保存整份回写并热加载）</text>
        <view class="card form">
          <view class="field">
            <text class="field-label">名称</text>
            <input v-model="editWf.name" class="field-input" maxlength="40" />
          </view>
          <view class="field">
            <text class="field-label">描述</text>
            <input v-model="editWf.description" class="field-input" />
          </view>
          <view class="field">
            <text class="field-label">启用</text>
            <switch :checked="editWf.enabled" color="#0066cc" @change="editWf.enabled = Boolean(($event as any)?.detail?.value)" />
          </view>
          <view class="field">
            <text class="field-label">提示词（内置动作留空 = 用默认）</text>
            <textarea
              v-model="editWf.prompt"
              class="field-input field-area"
              :maxlength="-1"
              :auto-height="true"
              placeholder="（空）"
            />
          </view>
        </view>
        <button :class="['btn', 'save-btn', wfSaving ? 'btn-off' : '']" @click="submitWf">
          {{ wfSaving ? '保存中…' : '保存并热加载' }}
        </button>
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
  adminAi,
  adminColumns,
  adminWorkflows,
  saveAdminAi,
  saveColumns,
  saveSite,
  saveWorkflows,
  testAdminAi,
  type AdminColumn,
  type AdminWorkflow,
} from '../../shared/api/admin'
import { columnByCode, tint } from '../../shared/config/columns'

type Panel =
  | 'root'
  | 'general'
  | 'site'
  | 'columns'
  | 'columnEdit'
  | 'ai'
  | 'wfEdit'
  | 'account'
  | 'about'

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
  columnEdit: '编辑栏目',
  ai: 'AI 设置',
  wfEdit: '编辑工作流',
  account: '账号与设备',
  about: '关于',
}
const panelTitle = computed(() => {
  if (panel.value === 'columnEdit' && editCol.value) {
    return `${editCol.value.code} · ${editCol.value.name || '编辑栏目'}`
  }
  if (panel.value === 'wfEdit' && editWf.value) {
    return editWf.value.name || '编辑工作流'
  }
  return PANEL_TITLES[panel.value]
})

function openPanel(p: Panel): void {
  panel.value = p
  if (p === 'site' || p === 'columns') void loadAdmin()
  if (p === 'ai') void loadAiSettings()
}

function back(): void {
  if (panel.value === 'columnEdit') {
    panel.value = 'columns'
    return
  }
  if (panel.value === 'wfEdit') {
    panel.value = 'ai'
    return
  }
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
/** 三级编辑面板：当前编辑的栏目（深拷贝，取消不伤原数据） */
const editIdx = ref<number>(-1)
const editCol = ref<AdminColumn | null>(null)

function openColEditor(index: number): void {
  editCol.value = JSON.parse(JSON.stringify(cols.value[index])) as AdminColumn
  editIdx.value = index
  panel.value = 'columnEdit'
  colsNotice.value = ''
}

/** 只保存正在编辑的这栏：整份回写契约下，替换 items 里对应项即可 */
function submitColumn(): void {
  if (!editCol.value || editIdx.value < 0) return
  const idx = editIdx.value
  const item = {
    ...editCol.value,
    name: editCol.value.name.trim(),
    brief: editCol.value.brief.trim(),
    desc: editCol.value.desc.trim(),
    subs: editCol.value.subs.map((sub) => ({
      ...sub,
      name: (sub.name || '').trim() || dirName(sub.path),
    })),
  }
  colsSaving.value = true
  const items = cols.value.map((c, i) => (i === idx ? item : c))
  saveColumns(items)
    .then(() => {
      cols.value = items
      colsNotice.value = '已保存'
      uni.showToast({ title: '已保存', icon: 'none' })
      panel.value = 'columns' // 存完回栏目列表
    })
    .catch((err: any) => {
      colsNotice.value = err?.reason || '保存失败'
    })
    .finally(() => {
      colsSaving.value = false
    })
}

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

/* ---------------- AI 设置（引擎/密钥 + 工作流启停） ---------------- */
const ai = ref({
  engine: 'stub',
  llm_api_base: '',
  llm_model: '',
  llm_image_model: '',
})
const aiKeyInput = ref('')
const aiKeyHint = ref('')
const aiSaving = ref(false)
const aiTesting = ref(false)
const aiTestText = ref('')
const aiTestOk = ref(false)
const wfs = ref<AdminWorkflow[]>([])

async function loadAiSettings(): Promise<void> {
  try {
    const [cfg, wf] = await Promise.all([adminAi(), adminWorkflows()])
    ai.value = {
      engine: cfg.workflow_engine || 'stub',
      llm_api_base: cfg.llm_api_base || '',
      llm_model: cfg.llm_model || '',
      llm_image_model: cfg.llm_image_model || '',
    }
    aiKeyHint.value = cfg.key_hint || ''
    aiKeyInput.value = ''
    wfs.value = wf.items || []
  } catch (err: any) {
    uni.showToast({ title: err?.reason || 'AI 设置加载失败', icon: 'none' })
  }
}

function submitAi(): void {
  aiSaving.value = true
  saveAdminAi({
    workflow_engine: ai.value.engine,
    llm_api_base: ai.value.llm_api_base.trim(),
    llm_model: ai.value.llm_model.trim(),
    llm_image_model: ai.value.llm_image_model.trim(),
    llm_api_key: aiKeyInput.value.trim() || undefined,
  })
    .then(() => {
      aiKeyInput.value = ''
      uni.showToast({ title: '已保存，立即生效', icon: 'none' })
      void loadAiSettings()
    })
    .catch((err: any) => {
      uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
    })
    .finally(() => {
      aiSaving.value = false
    })
}

function testAi(): void {
  aiTesting.value = true
  aiTestText.value = ''
  testAdminAi()
    .then((res) => {
      aiTestOk.value = res.ok
      aiTestText.value = res.ok
        ? `连通正常（${res.latency_ms ?? 0}ms）：${res.reply || ''}`
        : `失败：${res.reason || '未知原因'}`
    })
    .catch((err: any) => {
      aiTestOk.value = false
      aiTestText.value = err?.reason || '测试失败'
    })
    .finally(() => {
      aiTesting.value = false
    })
}

/** 拨开关 = 只改这一条的 enabled，整份回写（原子写 + 热加载） */
function toggleWorkflow(wf: AdminWorkflow, e: any): void {
  const enabled = Boolean(e?.detail?.value)
  wf.enabled = enabled
  saveWorkflows(wfs.value.map((w) => ({ ...w })))
    .then(() => uni.showToast({ title: `${wf.name} 已${enabled ? '启用' : '停用'}`, icon: 'none' }))
    .catch((err: any) => {
      wf.enabled = !enabled // 回滚 UI
      uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
    })
}

/** 工作流编辑：三级面板（跳转式），深拷贝编辑，保存整份回写 */
const editWf = ref<AdminWorkflow | null>(null)
const wfSaving = ref(false)

function openWfEditor(index: number): void {
  editWf.value = JSON.parse(JSON.stringify(wfs.value[index])) as AdminWorkflow
  panel.value = 'wfEdit'
}

function submitWf(): void {
  const edit = editWf.value
  if (!edit) return
  wfSaving.value = true
  const items = wfs.value.map((w) => (w.key === edit.key ? { ...edit } : w))
  saveWorkflows(items)
    .then(() => {
      wfs.value = items
      uni.showToast({ title: '已保存并热加载', icon: 'none' })
      panel.value = 'ai'
    })
    .catch((err: any) => {
      uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
    })
    .finally(() => {
      wfSaving.value = false
    })
}

/** 栏目徽标配色（与导航同源） */
function colColor(code: string): string {
  const col = columnByCode(code)
  return tint(col?.main || '#0066cc', 0.12)
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

/* ---------------- 表单细节修正 ---------------- */

/* 保存 / 测试连接并排（用户指定） */
.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.btn-row .btn {
  flex: 1 1 0;
  margin: 0;
}

/* seg 在表单里太挤会换行压住下一个字段：缩字号、禁换行 */
.form .seg {
  padding: 4px 0;
  gap: 6px;
}

.form .seg-item {
  font-size: 13px;
  padding: 9px 2px;
  white-space: nowrap;
}

/* 工作流作用域小标 */
.wf-scope {
  font-size: 10px;
  color: var(--accent);
  background-color: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 6px;
}

.test-fail {
  color: var(--danger) !important;
}
</style>

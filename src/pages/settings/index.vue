<template>
  <view
    :class="['page', `theme-${resolvedTheme}`]"
    @touchstart="onSwipeStart"
    @touchend="onSwipeEnd"
  >
    <GTopBar back :title="panelTitle" :elevated="true" @back="back" />

    <!-- ============ 一级：菜单 ============ -->
    <template v-if="panel === 'root'">
      <view v-if="!auth.logged" class="section">
        <view class="card">
          <view class="cell" @click="toLogin">
            <view class="cell-main">
              <text class="cell-title">登录</text>
              <text class="cell-sub muted">编辑与投递需要登录</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="card">
          <view class="cell" @click="openPanel('general')">
            <view class="cell-main">
              <text class="cell-title">偏好</text>
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
        <text class="section-label muted">管理</text>
        <view class="card">
          <view class="cell" @click="openPanel('site')">
            <view class="cell-main">
              <text class="cell-title">站点信息</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="openPanel('columns')">
            <view class="cell-main">
              <text class="cell-title">栏目与小类</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="openPanel('ai')">
            <view class="cell-main">
              <text class="cell-title">AI 设置</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
          <view class="divider" />
          <view class="cell" @click="syncDisk">
            <view class="cell-main">
              <text class="cell-title">同步磁盘</text>
              <!-- 只在真的在扫的时候说话：闲时那行解释属于「说明书」，不是信息 -->
              <text v-if="syncing" class="cell-sub muted">正在重扫…</text>
            </view>
            <view :class="['chev', syncing ? 'is-spin' : '']">
              <GIcon name="refresh" :size="30" :weight="2" />
            </view>
          </view>
        </view>
      </view>

      <!-- 游客没有账号可管，顶部已经有「登录」入口，这里整行隐掉 -->
      <view v-if="auth.logged" class="section">
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
      </view>

      <view class="section">
        <text class="section-label muted">捕捉</text>
        <view class="card">
          <view class="cell">
            <view class="cell-main">
              <text class="cell-title">剪贴板投递弹窗</text>
            </view>
            <switch :checked="clipAsk" color="#0066cc" @change="toggleClip" />
          </view>
        </view>
      </view>
    </template>

    <!-- ============ 二级：站点信息 ============ -->
    <template v-else-if="panel === 'site'">
      <view class="section">
        <text class="section-label muted">品牌字段</text>
        <view class="card padded">
          <view class="fld">
            <text class="fld-label">站点名称</text>
            <input v-model="site.name" class="fld-input" placeholder="渡己" />
          </view>
          <view class="fld">
            <text class="fld-label">标语</text>
            <input v-model="site.tagline" class="fld-input" placeholder="一念入笺…" />
          </view>
          <view class="fld">
            <text class="fld-label">描述</text>
            <textarea
              v-model="site.description"
              class="fld-input fld-area"
              :maxlength="-1"
              :auto-height="true"
              placeholder="站点一句话介绍"
            />
          </view>
          <view class="fld">
            <text class="fld-label">作者</text>
            <input v-model="site.author" class="fld-input" />
          </view>
          <view class="fld">
            <text class="fld-label">备案号</text>
            <input v-model="site.icp" class="fld-input" placeholder="留空则不显示" />
          </view>
          <view class="fld">
            <text class="fld-label">每页条数</text>
            <input v-model="site.pageSize" class="fld-input" type="number" placeholder="15" />
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
        <view class="card">
          <template v-for="(col, i) in cols" :key="col.code">
            <view v-if="i > 0" class="divider" />
            <view class="cell" @click="openColEditor(i)">
              <view class="col-badge" :style="{ backgroundColor: colColor(col.code) }">
                <text class="col-badge-t">{{ col.code }}</text>
              </view>
              <view class="cell-main">
                <text class="cell-title">{{ col.name }}</text>
                <text class="cell-sub muted">{{ col.brief || dirName(col.path) }}</text>
              </view>
              <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
            </view>
          </template>
          <view v-if="!cols.length" class="cell"><text class="muted">加载中…</text></view>
        </view>
      </view>
    </template>

    <!-- ============ 三级：小类管理 ============
         这里**只管小类**：栏目本身的名称/简介/描述归「站点信息」，不在这里改。
         小类是目录，支持多层级——点行进下一级，逐层下钻。 -->
    <template v-else-if="panel === 'columnEdit' && editCol">
      <view class="section">
        <text class="section-label muted">{{ editCol.path }}</text>
        <view class="card">
          <view v-if="subLoading[editCol.path]" class="cell">
            <text class="muted">加载中…</text>
          </view>
          <template v-else-if="subRows.length">
            <template v-for="(row, i) in subRows" :key="row.path">
              <view v-if="i > 0" class="divider" />
              <view
                class="cell sub-cell"
                :style="{ paddingLeft: `${12 + row.depth * 24}px` }"
                @click="openSub(row)"
              >
                <!-- 展开箭头只对「有下级」的行出现，点它只切展开、不进详情 -->
                <view
                  :class="['fold-hit', row.has_children ? '' : 'is-leaf']"
                  @click.stop="row.has_children && toggleSub(row.path)"
                >
                  <GIcon
                    v-if="row.has_children"
                    name="chevron-right"
                    :size="26"
                    :weight="2.2"
                    :class="['fold', expanded.has(row.path) ? 'is-open' : '']"
                  />
                </view>
                <GIcon name="folder" :size="30" :weight="2" class="sub-ico" />
                <view class="cell-main">
                  <text class="cell-title">{{ row.alias || row.name }}</text>
                  <text :class="['cell-sub', row.missing ? 'is-missing' : 'muted']">{{ subHint(row) }}</text>
                </view>
                <view class="chev"><GIcon name="chevron-right" :size="28" /></view>
              </view>
            </template>
          </template>
          <view v-else class="empty-hint">
            <text class="muted">还没有小类，下面新建一个</text>
          </view>
        </view>
      </view>

      <view class="section">
        <button class="btn" @click="createChild(editCol.path)">新建小类</button>
      </view>
    </template>

    <!-- ============ 四级：单个小类 ============ -->
    <template v-else-if="panel === 'subEdit' && curSub">
      <view class="section">
        <text class="section-label muted">{{ curSub.path }}</text>

        <!-- 残影：磁盘上已经没有这个文件夹，只剩配置里的一条显示名 -->
        <text v-if="curSub.missing" class="warn-note">
          这个文件夹在磁盘上已经不存在了，只剩站点配置里的一条显示名。可以直接清理掉。
        </text>

        <view class="card padded">
          <view class="fld">
            <text class="fld-label">显示名</text>
            <input
              v-model="subAlias"
              class="fld-input"
              :disabled="curSub.missing"
              :placeholder="curSub.name"
            />
          </view>
          <view class="fld">
            <text class="fld-label">目录名</text>
            <view class="row-inline">
              <text class="mono">{{ curSub.name }}</text>
              <text v-if="!curSub.missing" class="mini-btn" @click="renameCurSub">重命名</text>
              <text v-else class="mini-btn is-off">已失效</text>
            </view>
          </view>
        </view>
        <button
          v-if="!curSub.missing"
          :class="['btn', 'save-btn', subBusy ? 'btn-off' : '']"
          @click="saveSubAlias"
        >
          {{ subBusy ? '保存中…' : '保存显示名' }}
        </button>
      </view>

      <!-- 同级顺序：顺序只存在站点的 subs 配置里（磁盘枚举是字母序），
           所以上移/下移是改配置并整份回写，不是改目录名。 -->
      <view v-if="siblingList.length > 1" class="section">
        <text class="section-label muted"
          >同级顺序（第 {{ siblingIndex + 1 }} / {{ siblingList.length }}）</text
        >
        <view class="btn-row">
          <button
            :class="['btn', 'btn-ghost', canMoveUp ? '' : 'btn-off']"
            :disabled="!canMoveUp"
            @click="moveSub(curSub.path, -1)"
          >
            上移
          </button>
          <button
            :class="['btn', 'btn-ghost', canMoveDown ? '' : 'btn-off']"
            :disabled="!canMoveDown"
            @click="moveSub(curSub.path, 1)"
          >
            下移
          </button>
        </view>
      </view>

      <view class="section">
        <text class="section-label muted"
          >下级小类（{{ (subLists[curSub.path] || []).length }} 个）</text
        >
        <view class="card">
          <view v-if="subLoading[curSub.path]" class="cell">
            <text class="muted">加载中…</text>
          </view>
          <template v-else-if="(subLists[curSub.path] || []).length">
            <template v-for="(s, i) in subLists[curSub.path]" :key="s.path">
              <view v-if="i > 0" class="divider" />
              <view class="cell" @click="openSub(s)">
                <GIcon name="folder" :size="30" :weight="2" class="sub-ico" />
                <view class="cell-main">
                  <text class="cell-title">{{ s.alias || s.name }}</text>
                  <text :class="['cell-sub', s.missing ? 'is-missing' : 'muted']">{{ subHint(s) }}</text>
                </view>
                <view class="chev"><GIcon name="chevron-right" :size="28" /></view>
              </view>
            </template>
          </template>
          <view v-else class="cell">
            <text class="muted">没有下级小类</text>
          </view>
        </view>
        <view class="btn-row">
          <button class="btn btn-ghost" @click="createChild(curSub.path)">新建下级小类</button>
        </view>
      </view>

      <view class="section">
        <button :class="['btn', curSub.missing ? 'btn-ghost' : 'btn-danger']" @click="removeCurSub">
          {{ curSub.missing ? '清理残留条目' : '删除这个小类' }}
        </button>
        <text class="note muted">{{ deleteHint }}</text>
      </view>
    </template>

    <!-- ============ 二级：AI 设置 ============
         引擎/地址/密钥/模型 + 测试连接；工作流是开关列表，
         拨一下即整份回写并热加载——移动端不做提示词编辑（那是 Obsidian 的事）。 -->
    <template v-else-if="panel === 'ai'">
      <view class="section">
        <text class="section-label muted">引擎与密钥</text>
        <view class="card padded">
          <view class="fld">
            <text class="fld-label">引擎</text>
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
          <view class="fld">
            <text class="fld-label">接口地址</text>
            <input v-model="ai.llm_api_base" class="fld-input" placeholder="https://api.deepseek.com/v1" />
          </view>
          <view class="fld">
            <text class="fld-label">API Key{{ aiKeyHint ? `（已设置 ${aiKeyHint}，留空保持）` : '' }}</text>
            <input v-model="aiKeyInput" class="fld-input" password placeholder="留空 = 保持原值" />
          </view>
          <view class="fld">
            <text class="fld-label">对话模型</text>
            <input v-model="ai.llm_model" class="fld-input" placeholder="例 deepseek-chat" />
          </view>
          <view class="fld">
            <text class="fld-label">封面模型</text>
            <input v-model="ai.llm_image_model" class="fld-input" />
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
        <text class="section-label muted">工作流</text>
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
      </view>
    </template>

    <!-- ============ 二级：账号与设备 ============ -->
    <template v-else-if="panel === 'account'">
      <view v-if="!auth.logged" class="section">
        <view class="card">
          <view class="cell" @click="toLogin">
            <view class="cell-main">
              <text class="cell-title">登录</text>
              <text class="cell-sub muted">当前是游客，只能浏览公开内容</text>
            </view>
            <view class="chev"><GIcon name="chevron-right" :size="30" /></view>
          </view>
        </view>
      </view>

      <view v-if="auth.logged" class="section">
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

      <view v-if="auth.logged" class="section">
        <view class="row section-head">
          <text class="section-label muted">已登记设备</text>
          <text class="section-label muted">{{ devices.length }}</text>
        </view>
        <view class="card">
          <view v-if="!devices.length" class="cell">
            <text class="muted">没有设备记录</text>
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
      </view>
    </template>

    <!-- ============ 二级：关于 ============ -->
    <template v-else-if="panel === 'about'">
      <view class="section">
        <view class="card about-card">
          <text class="about-brand">渡己・Mlgdi</text>
          <text class="about-ver">v{{ appVersion }}</text>
          <text class="about-p">自托管个人知识中枢 · Markdown 是唯一数据源。</text>
        </view>
      </view>
      <view class="section">
        <view class="card">
          <view class="cell">
            <view class="cell-main">
              <text class="cell-title">服务器</text>
              <text class="cell-sub muted">{{ baseUrl }}</text>
            </view>
          </view>
        </view>
      </view>
    </template>

    <!-- ============ 三级：工作流编辑（跳转式，与栏目编辑同一操作语言） ============ -->
    <template v-else-if="panel === 'wfEdit' && editWf">
      <view class="section">
        <text class="section-label muted">{{ editWf.key }} · {{ editWf.scope }}</text>
        <view class="card padded">
          <view class="fld">
            <text class="fld-label">名称</text>
            <input v-model="editWf.name" class="fld-input" maxlength="40" />
          </view>
          <view class="fld">
            <text class="fld-label">描述</text>
            <input v-model="editWf.description" class="fld-input" />
          </view>
          <view class="fld">
            <text class="fld-label">启用</text>
            <switch :checked="editWf.enabled" color="#0066cc" @change="editWf.enabled = Boolean(($event as any)?.detail?.value)" />
          </view>
          <view class="fld">
            <text class="fld-label">提示词</text>
            <textarea
              v-model="editWf.prompt"
              class="fld-input fld-area"
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
import { useSiteStore } from '../../shared/store/site'
import { useNotesStore } from '../../shared/store/notes'
import { getBaseUrl } from '../../shared/config/server'
import { listDevices, revokeDevice, type DeviceRow } from '../../shared/api/auth'
import { resolvedTheme, themeMode, setThemeMode, type ThemeMode } from '../../shared/theme'
import { APP_VERSION } from '../../shared/version'
import {
  adminAi,
  adminColumns,
  adminWorkflows,
  createSub,
  deleteSub,
  listSubs,
  renameSubDir,
  rescan,
  saveAdminAi,
  saveColumns,
  saveSite,
  saveWorkflows,
  setSubAlias,
  testAdminAi,
  type AdminColumn,
  type AdminSubDir,
  type AdminWorkflow,
} from '../../shared/api/admin'
import { columnByCode, tint } from '../../shared/config/columns'

type Panel =
  | 'root'
  | 'general'
  | 'site'
  | 'columns'
  | 'columnEdit'
  | 'subEdit'
  | 'ai'
  | 'wfEdit'
  | 'account'
  | 'about'

const auth = useAuthStore()
const siteStore = useSiteStore()
const notesStore = useNotesStore()
const appVersion = APP_VERSION
const baseUrl = ref(getBaseUrl())
const devices = ref<DeviceRow[]>([])
const panel = ref<Panel>('root')

const PANEL_TITLES: Record<Panel, string> = {
  root: '设置',
  general: '偏好',
  site: '站点信息',
  columns: '栏目与小类',
  columnEdit: '小类管理',
  subEdit: '小类',
  ai: 'AI 设置',
  wfEdit: '编辑工作流',
  account: '账号与设备',
  about: '关于',
}
const panelTitle = computed(() => {
  if (panel.value === 'columnEdit' && editCol.value) {
    return `${editCol.value.code} · ${editCol.value.name || '小类管理'}`
  }
  if (panel.value === 'subEdit' && curSub.value) {
    return curSub.value.alias || curSub.value.name
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
  if (panel.value === 'subEdit') {
    leaveSub()
    return
  }
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

/* ---------------- 右滑返回 ----------------
   设置是多级面板但只有**一个真实页面**，iOS 原生的侧滑返回会把整页 pop 掉，
   于是「三级里右滑」直接回到库列表，而不是上一级。所以 pages.json 里把
   popGesture 关掉（"none"），这里自己按面板层级返回。
   判定：起点靠左 80px 内、横向位移 ≥ 60、纵向抖动 < 70、600ms 内完成。 */
const swipeStart = { x: 0, y: 0, t: 0 }

function onSwipeStart(e: any): void {
  const t = e?.touches?.[0] || e?.changedTouches?.[0]
  if (!t) return
  swipeStart.x = Number(t.clientX ?? t.pageX ?? 0)
  swipeStart.y = Number(t.clientY ?? t.pageY ?? 0)
  swipeStart.t = Date.now()
}

function onSwipeEnd(e: any): void {
  const t = e?.changedTouches?.[0]
  if (!t) return
  const dx = Number(t.clientX ?? t.pageX ?? 0) - swipeStart.x
  const dy = Math.abs(Number(t.clientY ?? t.pageY ?? 0) - swipeStart.y)
  const quick = Date.now() - swipeStart.t < 600
  if (swipeStart.x < 80 && dx >= 60 && dy < 70 && quick) back()
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

/* ---------------- 同步磁盘 ---------------- */
const syncing = ref(false)

/**
 * 全量重扫磁盘并刷新前端。
 *
 * 只调接口不够：scanner 更新的是**后端索引**，前端的 notes.roots / site.info
 * 都是内存快照，不重拉的话界面还是旧的（Web 那边踩过同一个坑）。
 */
async function syncDisk(): Promise<void> {
  if (syncing.value) return
  syncing.value = true
  try {
    const r = await rescan()
    await Promise.all([siteStore.load(true), notesStore.load(true)])
    const parts = [`新增 ${r.created}`, `更新 ${r.updated}`]
    if (r.moved) parts.push(`移动 ${r.moved}`)
    if (r.deleted) parts.push(`删除 ${r.deleted}`)
    const errs = r.errors?.length ? `\n${r.errors.length} 个文件解析失败，详情见后端日志` : ''
    uni.showModal({
      title: '同步完成',
      content: `共扫描 ${r.total} 个文件\n${parts.join(' · ')}${errs}`,
      showCancel: false,
      confirmText: '知道了',
    })
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '同步失败', icon: 'none' })
  } finally {
    syncing.value = false
  }
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

/* ---------------- 栏目与小类（admin） ----------------
   栏目本身的名称/简介/描述不在这里改（用户明确移除）——那属于站点信息。
   这个面板只管**小类**，也就是磁盘目录，支持任意层级：
   栏目根 → 小类 → 小类的小类 …… 逐层下钻。 */
const cols = ref<AdminColumn[]>([])
/** 当前进入的栏目（只读：名称/路径用来做标题与根路径） */
const editCol = ref<AdminColumn | null>(null)

/** 每个目录的子列表缓存，key = 目录全路径 */
const subLists = ref<Record<string, AdminSubDir[]>>({})
const subLoading = ref<Record<string, boolean>>({})
/** 展开状态（只作用于栏目根的那棵树） */
const expanded = ref<Set<string>>(new Set())
/** 下钻栈：栈顶就是当前看的小类 */
const subStack = ref<string[]>([])
const curSub = ref<AdminSubDir | null>(null)
const subAlias = ref('')
const subBusy = ref(false)

/* ---------------- 配置与磁盘对账 ----------------
   小类的「存在」以**磁盘目录**为唯一权威，site.yaml 的 subs 只负责
   「显示什么名字、按什么顺序」。两边对不上的两种情况都要能看见：
   · 磁盘有、配置没有 → 正常显示，按名字排在配置项之后；
   · 配置有、磁盘没了（用户在资源管理器里直接删了文件夹）→ 合成 missing 行，
     可以在详情页清理掉这条配置（只删配置，不动文件）。 */

/** 配置里某个目录的**直接**子项，数组顺序就是侧栏顺序 */
function cfgChildren(dir: string): string[] {
  const subs = editCol.value?.subs ?? []
  return subs.map((s) => s.path).filter((p) => p.split('/').slice(0, -1).join('/') === dir)
}

function cfgAlias(path: string): string {
  const hit = (editCol.value?.subs ?? []).find((s) => s.path === path)
  return String(hit?.name || '').trim()
}

/** 磁盘列表 + 配置残影 → 按配置顺序排好的行 */
function mergeSubs(dir: string, disk: AdminSubDir[]): AdminSubDir[] {
  const order = new Map(cfgChildren(dir).map((p, i) => [p, i] as const))
  const seen = new Set(disk.map((d) => d.path))
  const ghosts: AdminSubDir[] = cfgChildren(dir)
    .filter((p) => !seen.has(p))
    .map((p) => ({
      name: p.split('/').pop() || p,
      path: p,
      alias: cfgAlias(p),
      empty: false,
      child_count: 0,
      has_children: false,
      file_count: 0,
      files: [],
      missing: true,
    }))
  return [...disk, ...ghosts].sort((a, b) => {
    const oa = order.get(a.path)
    const ob = order.get(b.path)
    // 用户调过的顺序不能被磁盘枚举打乱；没登记过的排到后面再按名字
    if (oa === undefined && ob === undefined) return a.name.localeCompare(b.name, 'zh')
    if (oa === undefined) return 1
    if (ob === undefined) return -1
    return oa - ob
  })
}

/** 行副说明：别名与目录名相同时不要重复显示（同名别名是历史配置，很常见） */
function subHint(s: AdminSubDir): string {
  if (s.missing) return '目录已不存在'
  if (s.alias && s.alias !== s.name) return s.name
  if (s.child_count > 0) return `${s.child_count} 个下级`
  if (s.empty) return '空目录'
  return s.file_count ? `${s.file_count} 个文件` : '有内容'
}

/** 栏目根的树拍平成行（缩进靠 depth）——比递归组件简单，展开状态决定下钻到第几层 */
const subRows = computed(() => {
  const out: Array<AdminSubDir & { depth: number }> = []
  const walk = (parent: string, depth: number): void => {
    for (const s of subLists.value[parent] || []) {
      out.push({ ...s, depth })
      if (expanded.value.has(s.path)) walk(s.path, depth + 1)
    }
  }
  walk(editCol.value?.path || '', 0)
  return out
})

/** 同级的兄弟行（含配置残影）：排序按钮的可用性看它在里面的位置 */
const siblingList = computed<AdminSubDir[]>(() => {
  const sub = curSub.value
  if (!sub) return []
  const parent = sub.path.split('/').slice(0, -1).join('/')
  return subLists.value[parent] || []
})

const siblingIndex = computed(() =>
  siblingList.value.findIndex((x) => x.path === curSub.value?.path),
)
const canMoveUp = computed(() => siblingIndex.value > 0)
const canMoveDown = computed(
  () => siblingIndex.value >= 0 && siblingIndex.value < siblingList.value.length - 1,
)

/** 删除按钮下的说明：三种情况三句话，点之前就知道会发生什么 */
const deleteHint = computed(() => {
  const sub = curSub.value
  if (!sub) return ''
  if (sub.missing) return '文件夹已不在磁盘上，清理只删这条显示配置，不动任何文件。'
  if (sub.file_count > 0 || sub.child_count > 0 || !sub.empty) {
    const kids = sub.child_count ? `、${sub.child_count} 个下级目录` : ''
    return `目录里还有 ${sub.file_count} 个文件${kids}，删除会被拒绝 —— 请先移走其中的内容。`
  }
  return '空目录，删除后无法恢复。'
})

/** 小类改动后：侧栏（site）与文档树（notes）必须一起重载，否则页面看着改了、侧栏还是旧的 */
async function refreshNav(): Promise<void> {
  await Promise.all([siteStore.load(true), notesStore.load(true)])
}

/** 重拉栏目配置（含 subs 顺序与别名）。页面上的 editCol 是快照，改完必须换新的 */
async function reloadCol(): Promise<void> {
  try {
    const full = await adminColumns()
    cols.value = full.items || []
    const fresh = cols.value.find((c) => c.path === editCol.value?.path)
    if (fresh) editCol.value = fresh
  } catch {
    /* 拉失败就沿用旧快照，至少不让页面空白 */
  }
}

async function loadSubs(dir: string, force = false): Promise<void> {
  if (!dir) return
  if (!force && subLists.value[dir]) return
  subLoading.value = { ...subLoading.value, [dir]: true }
  try {
    const res = await listSubs(dir)
    subLists.value = { ...subLists.value, [dir]: mergeSubs(dir, res.items || []) }
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '小类加载失败', icon: 'none' })
  } finally {
    subLoading.value = { ...subLoading.value, [dir]: false }
  }
}

function findSub(path: string): AdminSubDir | null {
  const parent = path.split('/').slice(0, -1).join('/')
  return (subLists.value[parent] || []).find((s) => s.path === path) || null
}

/** 进栏目：重置下钻状态，只拉第一层 */
function openColEditor(index: number): void {
  editCol.value = cols.value[index] || null
  subStack.value = []
  curSub.value = null
  expanded.value = new Set()
  subLists.value = {}
  panel.value = 'columnEdit'
  void loadSubs(editCol.value?.path || '')
}

function toggleSub(path: string): void {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else {
    next.add(path)
    void loadSubs(path)
  }
  expanded.value = next
}

function openSub(row: AdminSubDir): void {
  curSub.value = row
  subAlias.value = row.alias || ''
  subStack.value = [...subStack.value, row.path]
  panel.value = 'subEdit'
  void loadSubs(row.path)
}

/** 退一级：栈空就回栏目的小类树 */
function leaveSub(): void {
  const stack = subStack.value.slice(0, -1)
  subStack.value = stack
  const up = stack[stack.length - 1]
  if (!up) {
    curSub.value = null
    panel.value = 'columnEdit'
    void loadSubs(editCol.value?.path || '', true)
    return
  }
  const row = findSub(up)
  if (!row) {
    curSub.value = null
    panel.value = 'columnEdit'
    return
  }
  curSub.value = row
  subAlias.value = row.alias || ''
  panel.value = 'subEdit'
  void loadSubs(up)
}

/** 新建：单字段输入用系统输入弹窗（比再跳一层只有一行输入的面板轻） */
function createChild(parent: string): void {
  if (!parent) return
  uni.showModal({
    title: '新建小类',
    editable: true,
    placeholderText: '目录名',
    success: (res) => {
      if (!res.confirm) return
      const name = (res.content || '').trim()
      if (!name) return
      createSub(parent, name)
        .then(async () => {
          await reloadCol()
          await loadSubs(parent, true)
          if (panel.value === 'columnEdit') {
            const next = new Set(expanded.value)
            next.add(parent)
            expanded.value = next
          }
          await refreshNav()
          uni.showToast({ title: '已新建', icon: 'none' })
        })
        .catch((err: any) => {
          uni.showToast({ title: err?.reason || '新建失败', icon: 'none' })
        })
    },
  })
}

function saveSubAlias(): void {
  const sub = curSub.value
  if (!sub) return
  if (sub.missing) {
    uni.showToast({ title: '目录已不存在，只能清理', icon: 'none' })
    return
  }
  const alias = subAlias.value.trim()
  subBusy.value = true
  setSubAlias(sub.path, alias)
    .then(async (res) => {
      const saved = (res.name ?? alias).trim()
      const parent = sub.path.split('/').slice(0, -1).join('/')
      subLists.value = {
        ...subLists.value,
        [parent]: (subLists.value[parent] || []).map((s) =>
          s.path === sub.path ? { ...s, alias: saved } : s,
        ),
      }
      curSub.value = { ...sub, alias: saved }
      subAlias.value = saved
      await reloadCol()
      await refreshNav()
      uni.showToast({ title: saved ? '显示名已更新' : '已恢复用目录名', icon: 'none' })
    })
    .catch((err: any) => {
      uni.showToast({ title: err?.reason || '保存失败', icon: 'none' })
    })
    .finally(() => {
      subBusy.value = false
    })
}

/**
 * 同级排序：交换配置里这两个 path 的位置，整份回写 site.yaml。
 * 顺序只在配置里有意义（磁盘枚举是字母序），所以不能靠改目录名实现。
 */
const subMoving = ref(false)

/**
 * 把某个父目录下的条目，按 ordered 重排后整体填回原位。
 *
 * 做法是「整块摘出 → 重排 → 从第一个原位置插回」：
 * 这样其它层级的条目顺序一个字都不动，也不会出现「填位置时把某个 path 顶掉」
 * 那种只在特定顺序下才暴露的错位（第一版就是按索引逐个填，漏过一条）。
 */
function reorderSubs(
  col: AdminColumn,
  parent: string,
  ordered: string[],
): Array<{ path: string; name: string }> {
  const subs = [...(col.subs || [])]
  const mine = (path: string): boolean => path.split('/').slice(0, -1).join('/') === parent
  const idxs: number[] = []
  subs.forEach((s, i) => {
    if (mine(s.path)) idxs.push(i)
  })
  const byPath = new Map(subs.map((s) => [s.path, s]))
  // 配置里没登记过的新目录，name 留空 = 用目录名
  const block = ordered.map((p) => byPath.get(p) ?? { path: p, name: '' })
  if (!idxs.length) return [...subs, ...block]
  for (let k = idxs.length - 1; k >= 0; k--) subs.splice(idxs[k], 1)
  subs.splice(idxs[0], 0, ...block)
  return subs
}

function moveSub(path: string, delta: -1 | 1): void {
  const col = editCol.value
  if (!col || subMoving.value) return
  const parent = path.split('/').slice(0, -1).join('/')
  const list = (subLists.value[parent] || []).map((s) => s.path)
  const i = list.indexOf(path)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return

  const swapped = [...list]
  ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]

  const before = col.subs
  const subs = reorderSubs(col, parent, swapped)
  subMoving.value = true
  // 乐观更新：先把顺序换过来，失败再整体回滚
  editCol.value = { ...col, subs }
  cols.value = cols.value.map((c) => (c.path === col.path ? editCol.value! : c))
  subLists.value = {
    ...subLists.value,
    [parent]: swapped.map((p) => (subLists.value[parent] || []).find((s) => s.path === p)!),
  }

  saveColumns(cols.value)
    .then(async () => {
      await refreshNav()
      uni.showToast({ title: '顺序已保存', icon: 'none' })
    })
    .catch(async (err: any) => {
      editCol.value = { ...col, subs: before }
      cols.value = cols.value.map((c) => (c.path === col.path ? editCol.value! : c))
      await loadSubs(parent, true)
      uni.showToast({ title: err?.reason || '排序保存失败', icon: 'none' })
    })
    .finally(() => {
      subMoving.value = false
    })
}

/** 目录改名：两道确认（先讲清代价，再输入新名字），绝不悄悄动 */
function renameCurSub(): void {
  const sub = curSub.value
  if (!sub) return
  if (sub.missing) {
    uni.showToast({ title: '目录已不存在，只能清理', icon: 'none' })
    return
  }
  uni.showModal({
    title: '重命名目录',
    content: `「${sub.name}」会改名。指向旧路径的双链和链接会失效；正文内容本身不会被改写。`,
    confirmText: '继续',
    success: (res) => {
      if (!res.confirm) return
      // 第一个弹窗还没收干净时立刻弹第二个，iOS 上会吞掉——隔一拍
      setTimeout(() => {
        uni.showModal({
          title: '新的目录名',
          editable: true,
          content: sub.name,
          placeholderText: '新目录名',
          success: (r2) => {
            if (r2.confirm) doRenameSub(sub, (r2.content || '').trim())
          },
        })
      }, 320)
    },
  })
}

function doRenameSub(sub: AdminSubDir, name: string): void {
  if (!name || name === sub.name) return
  const oldPath = sub.path
  const oldParent = oldPath.split('/').slice(0, -1).join('/')
  renameSubDir(oldPath, name)
    .then(async (out) => {
      const newPath = out.path || oldPath
      // 旧路径的缓存整片作废（它下面所有层都变了）
      const next = { ...subLists.value }
      for (const key of Object.keys(next)) {
        if (key === oldPath || key.startsWith(oldPath + '/')) delete next[key]
      }
      subLists.value = next
      // 下钻栈里以旧路径为前缀的条目一起搬家
      subStack.value = subStack.value.map((p) =>
        p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p,
      )
      curSub.value = { ...sub, name, path: newPath }
      await reloadCol()
      await loadSubs(oldParent, true)
      await loadSubs(newPath, true)
      await refreshNav()
      uni.showToast({ title: '目录已改名', icon: 'none' })
    })
    .catch((err: any) => {
      uni.showToast({ title: err?.reason || '改名失败', icon: 'none' })
    })
}

/* ---------------- 删除：三分支，绝不给「顺手删正文」的出口 ---------------- */

function removeCurSub(): void {
  const sub = curSub.value
  if (!sub) return

  // ① 配置残影：文件夹早就没了，只清理这条显示配置
  if (sub.missing) {
    uni.showModal({
      title: '清理残留条目',
      content: `「${sub.alias || sub.name}」的文件夹在磁盘上已经不存在了。清理只删这条显示配置，不动任何文件。`,
      confirmText: '清理',
      success: (res) => {
        if (res.confirm) void doRemoveSub(sub)
      },
    })
    return
  }

  // ② 非空：不是「按钮坏了」，是保护。把里面还剩什么说清楚，不给强删出口
  const occupied = sub.file_count > 0 || sub.child_count > 0 || !sub.empty
  if (occupied) {
    const names = sub.files.length ? `（${sub.files.join('、')}${sub.file_count > sub.files.length ? '…' : ''}）` : ''
    const kids = sub.child_count ? `、${sub.child_count} 个下级目录` : ''
    uni.showModal({
      title: '目录非空，不能删除',
      content: `里面还有 ${sub.file_count} 个文件${kids}${names}。请先移走或删除其中的内容 —— 正文是 Markdown 文件，这里不会替你删。`,
      showCancel: false,
      confirmText: '知道了',
    })
    return
  }

  // ③ 空目录：明确说「无法恢复」再删
  uni.showModal({
    title: '删除小类',
    content: `目录「${sub.name}」是空的，确认删除？删完这个目录就没了，无法恢复。`,
    confirmText: '删除',
    success: (res) => {
      if (res.confirm) void doRemoveSub(sub)
    },
  })
}

async function doRemoveSub(sub: AdminSubDir): Promise<void> {
  const parent = sub.path.split('/').slice(0, -1).join('/')
  try {
    await deleteSub(sub.path)
    uni.showToast({ title: sub.missing ? '已清理配置' : '已删除', icon: 'none' })
    await reloadCol()
    await loadSubs(parent, true)
    await refreshNav()
    leaveSub()
  } catch (err: any) {
    uni.showToast({ title: err?.reason || '删除失败', icon: 'none' })
  }
}


function dirName(path: string): string {
  return path.split('/').pop() || path
}

async function loadAdmin(): Promise<void> {
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

function toLogin(): void {
  uni.navigateTo({ url: '/pages/login/index' })
}

function toServer(): void {
  uni.navigateTo({ url: '/pages/server/index' })
}

onShow(() => {
  baseUrl.value = getBaseUrl()
  // 游客没有设备列表可看（/auth/devices 需要登录）
  if (auth.logged) loadDevices()
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

/* ---------------- 二级面板：移动端表单 ----------------
   为什么不用 .field：App.vue 里的 .field 是「输入框本体」（88rpx 高、灰底、圆角），
   直接拿来当包裹层会把整块压成一条灰带，标签与值互相压——这是 0.6.1 截图里的病根。
   这里全部用 fld* 独立命名：无底色、按行分隔、输入区给足触摸高度。 */
.padded {
  padding: 4px 16px;
}

.fld {
  padding: 14px 0 16px;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fld:last-child {
  border-bottom: none;
}

.fld-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.fld-label {
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
}

/* 输入本体：透明底 + 44px 触摸高度，视觉靠「标签 + 下划线」分层 */
.fld-input {
  width: 100%;
  min-height: 44px;
  padding: 0;
  box-sizing: border-box;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text);
  background-color: transparent;
  border-radius: 0;
}

.fld-area {
  min-height: 96px;
  padding: 2px 0 0;
  line-height: 1.7;
}

.subs-edit {
  padding: 14px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed var(--line);
}

/* 小类别名：路径一行、输入一行，手机上不横向硬挤 */
.sub-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 0 6px;
  border-bottom: 1px solid var(--line);
}

.sub-row:last-child {
  border-bottom: none;
}

.sub-path {
  font-size: 12px;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* 引擎切换：两个等宽段，横向排一行（不再换行压住下一字段） */
.padded .seg {
  padding: 0;
  gap: 8px;
}

.padded .seg-item {
  font-size: 14px;
  padding: 12px 4px;
  white-space: nowrap;
  background-color: var(--surface-2);
}

.padded .seg-on {
  background-color: var(--accent-soft);
}

/* 工作流作用域小标 */
.wf-scope {
  font-size: 10px;
  color: var(--accent);
  background-color: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 6px;
}

/* ---------------- 小类树 ----------------
   一行一个目录：展开箭头（只对可展开的行）→ 文件夹 → 名字 → 进详情箭头。
   缩进由内联 padding-left 驱动（depth × 16px），深一层就往里收一格。 */
.sub-cell {
  gap: 10px;
}

/* 箭头热区：点它只切展开/收起，点整行才是进详情 */
.fold-hit {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  margin-left: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 叶子行也占同样的宽度：缩进**只能**由 padding-left 决定，
   否则窄缝会把层级差吃掉，父子行看起来齐平（真实踩过）。 */
.fold-hit.is-leaf {
  width: 30px;
}

.fold {
  color: var(--faint);
  transition: transform 160ms ease;
}

.fold.is-open {
  transform: rotate(90deg);
}

.sub-ico {
  flex: 0 0 auto;
  color: var(--text-2);
}

/* 目录名 + 重命名按钮同一行 */
.row-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 15px;
  color: var(--text);
  word-break: break-all;
}

.mini-btn {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  padding: 6px 14px;
  border-radius: 9999px;
  background-color: var(--accent-soft);
}

.mini-btn:active {
  background-color: var(--bg-hover);
}

.warn-note {
  display: block;
  margin: 8px 0 12px;
  padding: 10px 12px 10px 14px;
  border-left: 3px solid #ff9f0a;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
}

.cell-sub.is-missing {
  color: #ff9f0a;
}

/* ---------------- 关于 ----------------
   `<text>` 在 uni 里是 inline：不加 flex/block，品牌名、版本号、简介会连成一行
   （曾经真的连成「渡己・Mlgdiv0.7.1自托管…」）。整体用列布局一次性解决。 */
.about-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 20px 16px;
}

.about-brand {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.4px;
  color: var(--text);
}

.about-ver {
  font-size: 12px;
  color: var(--faint);
}

.about-p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.mini-btn.is-off {
  color: var(--faint);
  background-color: var(--surface-2);
}

.empty-hint {
  padding: 22px 16px;
  text-align: center;
}

.empty-hint .muted {
  font-size: 14px;
  color: var(--faint);
}

/* 同步中：图标转起来，说明「真的在跑」而不是点了没反应 */
.chev.is-spin {
  animation: gtop-spin 900ms linear infinite;
}

@keyframes gtop-spin {
  to {
    transform: rotate(360deg);
  }
}

.test-fail {
  color: var(--danger) !important;
}
</style>

/** AI 编排接口。动作清单来自 vault 的 `.garden/workflows.yaml`（指纹热加载）。 */
import { request } from './client'

export interface AiAction {
  key: string
  label: string
}

export interface AiActionGroups {
  /** 对选中文字执行的动作 */
  selection: AiAction[]
  /** 对整篇执行的动作（排版美化 / 摘要 / 续写…） */
  doc: AiAction[]
}

export interface AiActionsResult {
  groups: AiActionGroups
  max_chars: number
}

export interface AiAssistResult {
  ok: boolean
  action: string
  result: string
  model: string
  chars: number
}

export function aiActions(): Promise<AiActionsResult> {
  return request({ path: '/api/v1/ai/actions', silent: true })
}

/**
 * 执行一个 AI 动作。
 *
 * 失败原因（未配置模型 / 上游网关 / 文本过长）后端放在 `detail.reason`，
 * 页面必须优先展示它——只显示「请求参数不合法」等于没报错。
 *
 * 不挂全屏浮层：AI 一次几十秒，遮着屏幕更难受；编辑页在对话面板里
 * 自己显示「正在处理」，那才是用户视线所在。
 */
export function aiAssist(action: string, text: string, hint?: string): Promise<AiAssistResult> {
  return request({
    method: 'POST',
    path: '/api/v1/ai/assist',
    body: { action, text, hint },
    silent: true,
  })
}

/**
 * 五个栏目的唯一真源（与 `.garden/site.yaml` 的 columns 一一对应）。
 *
 * 为什么不从接口读：site.yaml 是站点配置，App 启动时先渲染骨架再拉数据；
 * 栏目是「骨架」的一部分，硬编码在这里、把颜色与文案对齐 site.yaml 更稳。
 * 若 site.yaml 改了栏目名，这里同步改——两处不一致会在视觉上立刻暴露。
 *
 * 颜色说明：main 用于面（胶囊底、描边），ink 用于小字（保证 ≥4.5:1 对比度，
 * main 直接写小字只有 4.17:1，不达标）。
 */
export type ColumnCode = 'M' | 'L' | 'G' | 'D' | 'I'

export interface Column {
  code: ColumnCode
  name: string
  /** vault 内目录，作为列表过滤依据 */
  path: string
  brief: string
  /** 主色（浅色模式） */
  main: string
  /** 小字色（浅色模式，加深版） */
  ink: string
  /** 主色（深色模式） */
  mainDark: string
  /** 小字色（深色模式） */
  inkDark: string
}

export const COLUMNS: Column[] = [
  {
    code: 'M',
    name: '魔笺',
    path: '00_Inbox',
    brief: '收集箱',
    main: '#9370db',
    ink: '#6b4bb0',
    mainDark: '#b49bf0',
    inkDark: '#cbb8f7',
  },
  {
    code: 'L',
    name: '灵溯',
    path: '02_Booklets',
    brief: '小册连载',
    main: '#20b2aa',
    ink: '#0f7f79',
    mainDark: '#4fd0c7',
    inkDark: '#8ce4dd',
  },
  {
    code: 'G',
    name: '观悟',
    path: '03_Articles',
    brief: '文章随笔',
    main: '#d29650',
    ink: '#9a6a25',
    mainDark: '#e8b077',
    inkDark: '#f3cd9f',
  },
  {
    code: 'D',
    name: '道寻',
    path: '04_Extensions',
    brief: '技术道场',
    main: '#6495ed',
    ink: '#3b6fcf',
    mainDark: '#8fb3f5',
    inkDark: '#b6cdfa',
  },
  {
    code: 'I',
    name: '逸隅',
    path: '01_Journal',
    brief: '生活日记',
    main: '#db7093',
    ink: '#b34664',
    mainDark: '#ef94b0',
    inkDark: '#f7bed0',
  },
]

export function columnByCode(code: string): Column | undefined {
  return COLUMNS.find((c) => c.code === code)
}

/** 按文档路径找所属栏目（根目录前缀匹配） */
export function columnByPath(path: string): Column | undefined {
  return COLUMNS.find((c) => path === c.path || path.startsWith(`${c.path}/`))
}

/** #rrggbb → rgba(r,g,b,a)，用于胶囊淡底与描边（部分 webview 不支持 color-mix） */
export function tint(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const num = parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

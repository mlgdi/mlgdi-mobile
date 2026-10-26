import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { tree as apiTree, type DocBrief, type TreeNode } from '../api/notes'

export interface FlatDoc extends DocBrief {
  rootName: string
  /** 从根开始的路径，用于列表里显示「栏目 · 子目录」 */
  folderLabel: string
}

function flatten(nodes: TreeNode[], rootName: string, trail: string[], out: FlatDoc[]): void {
  for (const node of nodes) {
    const label = [...trail, node.name].filter(Boolean).join(' · ')
    for (const doc of node.docs) {
      out.push({ ...doc, rootName, folderLabel: label })
    }
    flatten(node.folders, rootName, [...trail, node.name], out)
  }
}

export const useNotesStore = defineStore('notes', () => {
  const roots = ref<TreeNode[]>([])
  const loading = ref(false)
  const error = ref('')
  const loadedAt = ref(0)

  const docs = computed<FlatDoc[]>(() => {
    const out: FlatDoc[] = []
    for (const root of roots.value) {
      for (const doc of root.docs) {
        out.push({ ...doc, rootName: root.name, folderLabel: root.name })
      }
      flatten(root.folders, root.name, [root.name], out)
    }
    return out
  })

  /** 双链跳转用：按标题找文档 id。同一标题多篇时取最近更新的那篇。 */
  function findIdByTitle(title: string): string | null {
    const target = title.trim()
    if (!target) return null
    const hit =
      docs.value.find((d) => d.title === target) ||
      docs.value.find((d) => d.title.toLowerCase() === target.toLowerCase()) ||
      docs.value.find((d) => d.path.endsWith(`/${target}.md`))
    return hit ? hit.id : null
  }

  async function load(force = false): Promise<void> {
    if (loading.value) return
    // 5 分钟内不重复拉：列表是入口页，频繁进出不该反复请求
    if (!force && loadedAt.value && Date.now() - loadedAt.value < 5 * 60 * 1000) return
    loading.value = true
    error.value = ''
    try {
      const res = await apiTree()
      roots.value = res.roots || []
      loadedAt.value = Date.now()
    } catch (err: any) {
      error.value = err?.message || '加载失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { roots, docs, loading, error, load, findIdByTitle }
})

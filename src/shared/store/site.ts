import { defineStore } from 'pinia'
import { currentIdentity } from '../auth/identity'
import { computed, ref } from 'vue'
import { site as apiSite, type SiteInfo } from '../api/site'

/**
 * 站点品牌信息。
 *
 * 为什么单独一个 store 而不是塞进 notes：站点信息是「品牌文案」，
 * 与知识树的加载节奏无关——首页要先渲染标语，不能等树接口。
 */
export const useSiteStore = defineStore('site', () => {
  const info = ref<SiteInfo>({})
  const loadedAt = ref(0)
  const loading = ref(false)

  /** 同上：站点概览里的 public_documents 与登录策略都跟身份有关 */
  let loadedAs = ''

  /**
   * 小类路径 → 显示名。site.yaml 里登记过的用登记名，没登记的由调用方回退成目录名。
   * 磁盘目录始终是归属权威，这张表只管「叫什么」。
   */
  const subAliases = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const col of info.value.columns || []) {
      for (const sub of col.subs || []) {
        if (sub.path && sub.name) map[sub.path] = sub.name
      }
    }
    return map
  })

  async function load(force = false): Promise<void> {
    if (loading.value) return
    const as = currentIdentity()
    if (as !== loadedAs) force = true
    if (!force && loadedAt.value && Date.now() - loadedAt.value < 10 * 60 * 1000) return
    loading.value = true
    try {
      info.value = await apiSite()
      loadedAt.value = Date.now()
      loadedAs = as
    } catch {
      /* 站点信息拿不到不影响浏览，静默降级到硬编码文案 */
    } finally {
      loading.value = false
    }
  }

  return { info, loading, load, subAliases }
})

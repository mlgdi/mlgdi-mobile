import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  async function load(force = false): Promise<void> {
    if (loading.value) return
    if (!force && loadedAt.value && Date.now() - loadedAt.value < 10 * 60 * 1000) return
    loading.value = true
    try {
      info.value = await apiSite()
      loadedAt.value = Date.now()
    } catch {
      /* 站点信息拿不到不影响浏览，静默降级到硬编码文案 */
    } finally {
      loading.value = false
    }
  }

  return { info, loading, load }
})

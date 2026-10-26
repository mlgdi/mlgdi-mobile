import { computed, ref, watch, type Ref } from 'vue'

/**
 * 列表分页（渐进渲染）。
 *
 * 现实约束：`/api/v1/notes/tree` 是一次性全量返回的，没有 limit/offset。
 * 所以这里的「分页」是**渲染分页**——数据早在内存里，每页 15 条，触底再加一页。
 * 它解决的是「一屏塞几百条导致渲染卡顿/找不到重点」，不是「减少网络请求」。
 *
 * 什么时候必须换成接口分页：文档量到几千篇、树接口本身变慢时。
 * 那时把 source 换成 `fetch(offset, limit)`，本组合式函数的对外形态不用改。
 */
export function usePagedList<T>(source: Ref<T[]>, pageSize = 15) {
  const page = ref(1)

  const items = computed(() => source.value.slice(0, page.value * pageSize))
  const total = computed(() => source.value.length)
  const hasMore = computed(() => items.value.length < total.value)
  const shown = computed(() => items.value.length)

  /** 触底调用；返回是否真的加载了（便于页面上做「已经到底」的提示） */
  function loadMore(): boolean {
    if (!hasMore.value) return false
    page.value += 1
    return true
  }

  function reset(): void {
    page.value = 1
  }

  // 数据源变了（切栏目 / 改搜索词）就回到第一页，否则会停在上一页的条数上
  watch(source, reset)

  return { items, total, shown, hasMore, page, loadMore, reset, pageSize }
}

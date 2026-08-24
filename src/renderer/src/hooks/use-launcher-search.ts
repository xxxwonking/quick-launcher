import { useEffect, useMemo, useRef, useState } from 'react'
import { searchLauncher, type LauncherItem, type SearchDisplayOptions } from '../search/search-catalog'

export type SearchResponse = {
  queryId: number
  snapshotVersion: number
  items: LauncherItem[]
}

export type SearchProvider = (query: string, queryId: number) => SearchResponse | Promise<SearchResponse>

type SearchState = {
  items: LauncherItem[]
  loading: boolean
  error: string | null
  queryId: number
  snapshotVersion: number
}

export function useLauncherSearch(query: string, provider?: SearchProvider | undefined, runtimeItems?: readonly LauncherItem[], options?: SearchDisplayOptions): SearchState {
  const latestQueryId = useRef(0)
  const localItems = useMemo(() => searchLauncher(query, runtimeItems, options), [query, runtimeItems, options])
  const [state, setState] = useState<SearchState>(() => ({
    items: localItems,
    loading: false,
    error: null,
    queryId: 0,
    snapshotVersion: 0,
  }))

  useEffect(() => {
    if (!provider) return
    const queryId = latestQueryId.current + 1
    latestQueryId.current = queryId

    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null, queryId }))
    void Promise.resolve(provider(query, queryId)).then((response) => {
      if (cancelled || queryId !== latestQueryId.current || response.queryId !== queryId) return
      setState({ items: response.items, loading: false, error: null, queryId, snapshotVersion: response.snapshotVersion })
    }).catch(() => {
      if (cancelled || queryId !== latestQueryId.current) return
      setState((current) => ({ ...current, loading: false, error: '暂时无法更新搜索结果' }))
    })

    return () => {
      cancelled = true
    }
  }, [provider, query])

  if (!provider) return { items: localItems, loading: false, error: null, queryId: 0, snapshotVersion: 0 }
  return state
}

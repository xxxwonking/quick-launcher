import { useEffect, useRef, useState } from 'react'
import { searchLauncher, type LauncherItem } from '../search/search-catalog'

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

export function useLauncherSearch(query: string, provider?: SearchProvider | undefined): SearchState {
  const latestQueryId = useRef(0)
  const [state, setState] = useState<SearchState>(() => ({
    items: searchLauncher(query),
    loading: false,
    error: null,
    queryId: 0,
    snapshotVersion: 0,
  }))

  useEffect(() => {
    const queryId = latestQueryId.current + 1
    latestQueryId.current = queryId
    if (!provider) {
      setState({ items: searchLauncher(query), loading: false, error: null, queryId, snapshotVersion: 0 })
      return
    }

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

  return state
}

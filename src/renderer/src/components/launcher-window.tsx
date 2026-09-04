import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLauncherSearch, type SearchProvider } from '../hooks/use-launcher-search'
import { useRovingSelection } from '../hooks/use-roving-selection'
import type { LauncherItem } from '../search/search-catalog'
import type { LauncherExecutionResult } from '../../../shared/launcher-ipc'
import { ResultList } from './result-list'
import { resultDomId } from './result-row'
import { SearchInput } from './search-input'

type LauncherWindowProps = {
  onExecute?: (item: LauncherItem) => void | LauncherExecutionResult | Promise<void | LauncherExecutionResult>
  onHide?: () => void
  onOpenSettings?: (options: { tutorial: boolean }) => void
  onCopyGeneratedUrl?: (token: string) => string | Promise<string>
  searchProvider?: SearchProvider
  runtimeItems?: readonly LauncherItem[]
}

const LAUNCHER_PANEL_VERTICAL_MARGIN = 20
export const RECENT_ITEM_IDS_STORAGE_KEY = 'quick-launcher.recent-item-ids'
const MAX_RECENT_ITEM_IDS = 8

function getRecentStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function loadRecentItemIds(): string[] {
  try {
    const storage = getRecentStorage()
    if (!storage) return []
    const value: unknown = JSON.parse(storage.getItem(RECENT_ITEM_IDS_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(value)) return []
    return value
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256 && !id.includes('\0'))
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .slice(0, MAX_RECENT_ITEM_IDS)
  } catch {
    return []
  }
}

function saveRecentItemIds(ids: readonly string[]): void {
  try {
    const storage = getRecentStorage()
    storage?.setItem(RECENT_ITEM_IDS_STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_ITEM_IDS)))
  } catch {
    // Local storage may be unavailable in a restricted renderer context.
  }
}

function canRememberRecentItem(item: LauncherItem): boolean {
  return item.action.type === 'launch-demo' || item.action.type === 'launch-indexed' || item.action.type === 'command-launch-app'
}

export function selectionIndexForQuery(selectedIndex: number, previousQuery: string, query: string, resultLength: number): number {
  if (resultLength <= 0) return -1
  if (previousQuery !== query) return 0
  return Math.min(Math.max(selectedIndex, 0), resultLength - 1)
}

export function LauncherWindow({
  onExecute = () => '已模拟执行',
  onHide = () => undefined,
  onOpenSettings = () => undefined,
  onCopyGeneratedUrl,
  searchProvider,
  runtimeItems,
}: LauncherWindowProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('就绪')
  const [copyToken, setCopyToken] = useState<string | null>(null)
  const [showRecent, setShowRecent] = useState(false)
  const [recentItemIds, setRecentItemIds] = useState<string[]>(loadRecentItemIds)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const previousQueryRef = useRef(query)
  const lastReportedHeight = useRef<number | undefined>(undefined)
  const recentItems = useMemo(() => {
    if (!runtimeItems) return []
    const itemsById = new Map(runtimeItems.map((item) => [item.id, item]))
    return recentItemIds.map((id) => itemsById.get(id)).filter((item): item is LauncherItem => Boolean(item))
  }, [recentItemIds, runtimeItems])
  const searchOptions = useMemo(() => ({ showRecent, recentItems }), [showRecent, recentItems])
  const search = useLauncherSearch(query, searchProvider, runtimeItems, searchOptions)
  const results = search.items
  const { selectedIndex, selectNext, selectPrevious, resetSelection, selectIndex } = useRovingSelection(results.length)
  const visibleSelectedIndex = selectionIndexForQuery(selectedIndex, previousQueryRef.current, query, results.length)
  const selectedItem = visibleSelectedIndex >= 0 ? results[visibleSelectedIndex] : undefined

  const syncSettings = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await window.launcher?.getSettings?.()
      if (snapshot) setShowRecent(snapshot.showRecent)
    } catch {
      // Keep the safe default when settings are unavailable.
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    void syncSettings()
  }, [syncSettings])

  useEffect(() => {
    const panel = panelRef.current
    const resizeSearchWindow = window.launcher?.resizeSearchWindow
    if (!panel || !resizeSearchWindow || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const borderBoxHeight = entry.borderBoxSize[0]?.blockSize ?? panel.getBoundingClientRect().height
      const windowHeight = Math.ceil(borderBoxHeight + LAUNCHER_PANEL_VERTICAL_MARGIN)
      if (windowHeight <= 0 || windowHeight === lastReportedHeight.current) return
      lastReportedHeight.current = windowHeight
      void Promise.resolve(resizeSearchWindow(windowHeight)).catch(() => undefined)
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const unsubscribe = window.launcher?.onFocusRequested?.(() => {
      setQuery('')
      setStatus('就绪')
      setCopyToken(null)
      resetSelection()
      void syncSettings()
      if (inputRef.current) {
        inputRef.current.value = ''
        inputRef.current.focus({ preventScroll: true })
      }
    })
    return () => unsubscribe?.()
  }, [resetSelection, syncSettings])

  useEffect(() => {
    previousQueryRef.current = query
    resetSelection()
    setCopyToken(null)
  }, [query, resetSelection])

  useEffect(() => {
    if (!selectedItem) return
    const selectedElement = document.getElementById(resultDomId(selectedItem))
    if (typeof selectedElement?.scrollIntoView === 'function') selectedElement.scrollIntoView({ block: 'nearest' })
  }, [selectedItem])

  useEffect(() => {
    if (!runtimeItems) return
    const availableIds = new Set(runtimeItems.map((item) => item.id))
    setRecentItemIds((current) => {
      const next = current.filter((id) => availableIds.has(id))
      if (next.length !== current.length) saveRecentItemIds(next)
      return next
    })
  }, [runtimeItems])

  const rememberRecentItem = (item: LauncherItem): void => {
    if (!canRememberRecentItem(item)) return
    setRecentItemIds((current) => {
      const next = [item.id, ...current.filter((id) => id !== item.id)].slice(0, MAX_RECENT_ITEM_IDS)
      saveRecentItemIds(next)
      return next
    })
  }

  const execute = async (item: LauncherItem | undefined): Promise<void> => {
    if (!item || item.disabled) return
    if (item.action.type === 'open-settings') {
      onOpenSettings({ tutorial: false })
      return
    }
    if (item.action.type === 'open-tutorial') {
      onOpenSettings({ tutorial: true })
      return
    }
    const result = await onExecute(item)
    const message = typeof result === 'string' ? result : result && typeof result === 'object' ? result.message : undefined
    setStatus(message ?? `已模拟打开 ${item.title}`)
    setCopyToken(typeof result === 'object' && result ? result.copyToken ?? null : null)
    if ((item.action.type === 'launch-demo' || item.action.type === 'launch-indexed' || item.action.type === 'command-launch-app') && !String(message ?? '').match(/失败|不可用|无效|不存在/u)) {
      rememberRecentItem(item)
    }
  }

  const copyGeneratedUrl = async (): Promise<void> => {
    if (!copyToken || !onCopyGeneratedUrl) return
    const token = copyToken
    setCopyToken(null)
    try {
      setStatus(await onCopyGeneratedUrl(token))
    } catch {
      setStatus('复制网址失败，请稍后重试')
    }
  }

  return (
    <main ref={panelRef} className="launcher-panel launcher-drag-region overflow-hidden rounded-[20px] border border-window bg-panel text-primary shadow-panel">
      <h1 className="sr-only">Quick Launcher</h1>
      <SearchInput
        activeDescendant={selectedItem ? resultDomId(selectedItem) : undefined}
        inputRef={inputRef}
        onChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            selectNext()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            selectPrevious()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const webFallback = event.ctrlKey || event.metaKey
              ? [...results].reverse().find((item) => item.kind === 'web')
              : undefined
            void execute(webFallback ?? selectedItem)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onHide()
          }
        }}
        value={query}
      />
      <ResultList items={results} onExecute={(item) => void execute(item)} onSelect={selectIndex} selectedIndex={visibleSelectedIndex} />
      <footer className={`flex h-[40px] items-center justify-between gap-3 px-5 text-[11px] font-medium text-secondary ${results.length > 0 ? 'border-t border-divider' : ''}`} data-tour="launcher-footer">
        <span className="flex items-center gap-2 truncate" role="status">
          <span className={`inline-block size-1.5 rounded-full ${search.loading ? 'animate-ping bg-accent' : search.error ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="truncate">{search.loading ? '正在搜索…' : search.error ?? status}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3.5">
          {copyToken && onCopyGeneratedUrl ? <button aria-label="复制网址" className="launcher-no-drag rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent transition-colors hover:bg-accent/20" onClick={() => void copyGeneratedUrl()} type="button">复制网址</button> : null}
          <span className="flex items-center gap-1.5"><kbd>↑↓</kbd> 选择</span>
          <span className="flex items-center gap-1.5"><kbd>Enter</kbd> 打开</span>
          <span className="flex items-center gap-1.5"><kbd>Esc</kbd> 关闭</span>
        </span>
      </footer>
    </main>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLauncherSearch, type SearchProvider } from '../hooks/use-launcher-search'
import { useRovingSelection } from '../hooks/use-roving-selection'
import type { LauncherItem } from '../search/search-catalog'
import { ResultList } from './result-list'
import { resultDomId } from './result-row'
import { SearchInput } from './search-input'

type LauncherWindowProps = {
  onExecute?: (item: LauncherItem) => void | string | Promise<void | string>
  onHide?: () => void
  onOpenSettings?: (options: { tutorial: boolean }) => void
  searchProvider?: SearchProvider
  runtimeItems?: readonly LauncherItem[]
}

export function LauncherWindow({
  onExecute = () => '已模拟执行',
  onHide = () => undefined,
  onOpenSettings = () => undefined,
  searchProvider,
  runtimeItems,
}: LauncherWindowProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('就绪')
  const [showRecent, setShowRecent] = useState(false)
  const [recentItems, setRecentItems] = useState<LauncherItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const searchOptions = useMemo(() => ({ showRecent, recentItems }), [showRecent, recentItems])
  const search = useLauncherSearch(query, searchProvider, runtimeItems, searchOptions)
  const results = search.items
  const { selectedIndex, selectNext, selectPrevious, resetSelection, selectIndex } = useRovingSelection(results.length)
  const selectedItem = selectedIndex >= 0 ? results[selectedIndex] : undefined

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
    const unsubscribe = window.launcher?.onFocusRequested?.(() => {
      setQuery('')
      setStatus('就绪')
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
    resetSelection()
  }, [query, resetSelection])

  useEffect(() => {
    if (!selectedItem) return
    const selectedElement = document.getElementById(resultDomId(selectedItem))
    if (typeof selectedElement?.scrollIntoView === 'function') selectedElement.scrollIntoView({ block: 'nearest' })
  }, [selectedItem])

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
    const message = await onExecute(item)
    setStatus(typeof message === 'string' ? message : `已模拟打开 ${item.title}`)
    if ((item.action.type === 'launch-demo' || item.action.type === 'launch-indexed') && !String(message ?? '').match(/失败|不可用|无效|不存在/u)) {
      setRecentItems((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)].slice(0, 8))
    }
  }

  return (
    <main className="launcher-panel launcher-drag-region overflow-hidden rounded-[20px] border border-window bg-panel text-primary shadow-panel">
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
      <ResultList items={results} onExecute={(item) => void execute(item)} onSelect={selectIndex} selectedIndex={selectedIndex} />
      <footer className={`flex h-[40px] items-center justify-between px-5 text-[11px] font-medium text-secondary ${results.length > 0 ? 'border-t border-divider' : ''}`} data-tour="launcher-footer">
        <span className="flex items-center gap-2 truncate" role="status">
          <span className={`inline-block size-1.5 rounded-full ${search.loading ? 'animate-ping bg-accent' : search.error ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="truncate">{search.loading ? '正在搜索…' : search.error ?? status}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3.5">
          <span className="flex items-center gap-1.5"><kbd>↑↓</kbd> 选择</span>
          <span className="flex items-center gap-1.5"><kbd>Enter</kbd> 打开</span>
          <span className="flex items-center gap-1.5"><kbd>Esc</kbd> 关闭</span>
        </span>
      </footer>
    </main>

  )
}

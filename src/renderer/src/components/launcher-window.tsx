import { useEffect, useRef, useState } from 'react'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const search = useLauncherSearch(query, searchProvider, runtimeItems)
  const results = search.items
  const { selectedIndex, selectNext, selectPrevious, resetSelection, selectIndex } = useRovingSelection(results.length)
  const selectedItem = selectedIndex >= 0 ? results[selectedIndex] : undefined

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const unsubscribe = window.launcher?.onFocusRequested?.(() => {
      setQuery('')
      setStatus('就绪')
      resetSelection()
      if (inputRef.current) {
        inputRef.current.value = ''
        inputRef.current.focus({ preventScroll: true })
      }
    })
    return () => unsubscribe?.()
  }, [resetSelection])

  useEffect(() => {
    resetSelection()
  }, [query, resetSelection])

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
  }

  return (
    <main className="launcher-panel overflow-hidden rounded-[18px] border border-window bg-panel text-primary shadow-panel">
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
      <footer className="flex h-[38px] items-center justify-between border-t border-divider px-4 text-[11px] text-secondary" data-tour="launcher-footer">
        <span className="truncate" role="status">{search.loading ? '正在搜索…' : search.error ?? status}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span><kbd>↑↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </span>
      </footer>
    </main>
  )
}

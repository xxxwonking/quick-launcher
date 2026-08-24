import { Search, X } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'

type SearchInputProps = {
  value: string
  inputRef: RefObject<HTMLInputElement | null>
  activeDescendant?: string | undefined
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}
export function SearchInput({ value, inputRef, activeDescendant, onChange, onKeyDown }: SearchInputProps): React.JSX.Element {
  return (
    <div className="flex h-[76px] items-center gap-4 border-b border-divider px-6 transition-colors duration-200" data-tour="launcher-search">
      <Search aria-hidden="true" className={`size-7 shrink-0 transition-colors duration-200 ${value ? 'text-accent' : 'text-secondary'}`} strokeWidth={2} />
      <input
        ref={inputRef}
        autoFocus
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls="launcher-results"
        className="launcher-no-drag min-w-0 flex-1 bg-transparent text-[24px] font-semibold tracking-tight text-primary outline-none placeholder:text-muted"

        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入应用、拼音、命令…"
        role="combobox"
        spellCheck={false}
        value={value}
      />
      {value ? (
        <button
          aria-label="清空搜索"
          className="launcher-no-drag grid size-7 place-items-center rounded-full text-secondary transition-all hover:bg-chip hover:text-primary active:scale-90"
          onClick={() => onChange('')}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <kbd className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
        COMMAND
      </kbd>
    </div>
  )
}

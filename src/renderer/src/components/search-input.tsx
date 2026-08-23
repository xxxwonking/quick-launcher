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
    <div className="flex h-[76px] items-center gap-4 border-b border-divider px-5" data-tour="launcher-search">
      <Search aria-hidden="true" className="size-7 shrink-0 text-secondary" strokeWidth={1.8} />
      <input
        ref={inputRef}
        autoFocus
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls="launcher-results"
        className="min-w-0 flex-1 bg-transparent text-[25px] font-medium tracking-tight text-primary outline-none placeholder:text-muted"
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
          className="grid size-8 place-items-center rounded-lg text-secondary transition hover:bg-hover hover:text-primary"
          onClick={() => onChange('')}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <span className="rounded-md border border-divider bg-chip px-2 py-1 text-[11px] font-semibold tracking-wide text-secondary">
        COMMAND
      </span>
    </div>
  )
}

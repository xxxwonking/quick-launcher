import { BookOpen, Code2, Folder, Globe2, MessageCircle, Settings, TerminalSquare } from 'lucide-react'
import type { LauncherItem } from '../search/search-catalog'

const ICONS = {
  code: Code2,
  message: MessageCircle,
  terminal: TerminalSquare,
  folder: Folder,
  settings: Settings,
  book: BookOpen,
  globe: Globe2,
} as const

type ResultRowProps = {
  item: LauncherItem
  index: number
  selected: boolean
  onSelect: (index: number) => void
  onExecute: (item: LauncherItem) => void
}

export const resultDomId = (item: LauncherItem): string => `launcher-result-${item.id.replace(/[^A-Za-z0-9_-]/g, '-')}`

export function ResultRow({ item, index, selected, onSelect, onExecute }: ResultRowProps): React.JSX.Element {
  const Icon = ICONS[item.icon]
  return (
    <div
      aria-disabled={item.disabled ?? false}
      aria-label={`${item.title} ${item.subtitle}`}
      aria-selected={selected}
      className="group relative flex h-[66px] cursor-default items-center gap-3 rounded-xl border px-3 transition-colors duration-100"
      data-selected={selected ? 'true' : 'false'}
      id={resultDomId(item)}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onExecute(item)}
      role="option"
    >
      <span className="selection-indicator absolute inset-y-3 left-0 w-[3px] rounded-full bg-accent opacity-0" />
      <span className={`grid size-10 shrink-0 place-items-center rounded-[11px] border border-white/15 shadow-sm ${item.kind === 'web' ? 'bg-accent/15 text-accent' : 'bg-icon text-icon-foreground'}`}>
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-5 text-primary">{item.title}</span>
        <span className="mt-1 flex items-center gap-2 text-[12px] leading-4 text-secondary">
          <span>{item.subtitle}</span>
          {item.hint ? <span className="text-muted">{item.hint}</span> : null}
        </span>
      </span>
      <span className="rounded-md border border-divider bg-chip px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-secondary">
        {item.kind === 'web' ? 'WEB' : item.kind === 'builtin' ? 'SYSTEM' : 'APP'}
      </span>
      {selected ? <span aria-hidden="true" className="pr-1 text-lg text-accent">↵</span> : null}
    </div>
  )
}

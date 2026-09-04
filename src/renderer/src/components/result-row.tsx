import { BookOpen, Clipboard, Code2, FileText, Folder, Globe2, MessageCircle, Settings, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import type { LauncherItem } from '../search/search-catalog'

const ICONS = {
  code: Code2,
  message: MessageCircle,
  terminal: TerminalSquare,
  folder: Folder,
  settings: Settings,
  book: BookOpen,
  globe: Globe2,
  clipboard: Clipboard,
  file: FileText,
} as const

type ResultRowProps = {
  item: LauncherItem
  index: number
  selected: boolean
  onSelect: (index: number) => void
  onExecute: (item: LauncherItem) => void
}
export const resultDomId = (item: LauncherItem): string => `launcher-result-${item.id.replace(/[^A-Za-z0-9_-]/g, '-')}`

function applicationMonogram(title: string): string {
  const words = title.trim().split(/\s+/u).filter(Boolean)
  if (words.length > 1) return words.slice(0, 2).map((word) => [...word][0] ?? '').join('').toLocaleUpperCase()
  return [...title.trim()].slice(0, 2).join('').toLocaleUpperCase()
}

function iconStyleForKind(kind: LauncherItem['kind']): string {
  if (kind === 'web') return 'bg-zinc-500/10 border-zinc-500/20 text-zinc-700 dark:text-zinc-300 shadow-sm'
  if (kind === 'builtin') return 'bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300 shadow-sm'
  if (kind === 'command') return 'bg-neutral-500/10 border-neutral-500/20 text-neutral-700 dark:text-neutral-300 shadow-sm'
  if (kind === 'history') return 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 shadow-sm'
  if (kind === 'file') return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-700 dark:text-cyan-300 shadow-sm'
  if (kind === 'hint') return 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 shadow-sm'
  return 'bg-icon border-window text-icon-foreground shadow-sm'
}


export function ResultRow({ item, index, selected, onSelect, onExecute }: ResultRowProps): React.JSX.Element {
  const Icon = ICONS[item.icon]
  const [failedIconData, setFailedIconData] = useState<string | undefined>()
  const canRenderNativeIcon = Boolean(item.iconData && item.iconData !== failedIconData)
  return (
    <div
      aria-disabled={item.disabled ?? false}
      aria-label={`${item.title} ${item.subtitle}`}
      aria-selected={selected}
      className="launcher-no-drag group relative flex h-[66px] cursor-default items-center gap-3.5 rounded-xl border px-3.5 transition-all duration-150"
      data-selected={selected ? 'true' : 'false'}
      id={resultDomId(item)}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onExecute(item)}
      role="option"
    >
      <span className="selection-indicator absolute inset-y-2.5 left-0 w-[3.5px] rounded-r-full bg-accent opacity-0 transition-opacity duration-150" />
      <span className={`grid size-10 shrink-0 place-items-center rounded-[12px] border ${iconStyleForKind(item.kind)}`}>
        {canRenderNativeIcon
          ? <img alt={`${item.title} 图标`} className="size-7 rounded-md object-contain" onError={() => setFailedIconData(item.iconData)} src={item.iconData} />
          : item.kind === 'application'
            ? <span aria-label={`${item.title} 默认图标`} className="launcher-app-monogram" role="img">{applicationMonogram(item.title)}</span>
            : <Icon aria-hidden="true" className="size-5" strokeWidth={2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-5 text-primary tracking-tight">{item.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[12px] leading-4 text-secondary">
          <span className="truncate">{item.subtitle}</span>
          {item.hint ? <span className="shrink-0 text-muted">{item.hint}</span> : null}
        </span>
      </span>
      <span className="rounded-md border border-divider bg-chip px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">
        {item.kind === 'web' ? 'WEB' : item.kind === 'hint' ? 'HINT' : item.kind === 'builtin' ? 'SYSTEM' : item.kind === 'command' ? 'COMMAND' : item.kind === 'history' ? 'HISTORY' : item.kind === 'file' ? 'FILE' : 'APP'}
      </span>
      {selected ? <span aria-hidden="true" className="pr-1 text-sm font-bold text-accent">↵</span> : null}
    </div>
  )
}

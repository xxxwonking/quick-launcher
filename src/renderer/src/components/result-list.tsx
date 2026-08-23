import { Fragment } from 'react'
import type { LauncherItem } from '../search/search-catalog'
import { ResultRow } from './result-row'

type ResultListProps = {
  items: LauncherItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  onExecute: (item: LauncherItem) => void
}

export function ResultList({ items, selectedIndex, onSelect, onExecute }: ResultListProps): React.JSX.Element {
  return (
    <div className="max-h-[410px] overflow-y-auto px-2.5 py-2.5" data-tour="launcher-results" id="launcher-results" role="listbox">
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {item.kind === 'web' && index > 0 ? <div aria-label="网页兜底" className="mx-3 my-1 border-t border-divider" role="separator" /> : null}
          <ResultRow
            index={index}
            item={item}
            onExecute={onExecute}
            onSelect={onSelect}
            selected={index === selectedIndex}
          />
        </Fragment>
      ))}
    </div>
  )
}

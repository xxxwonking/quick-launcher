import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LauncherItem } from '../search/search-catalog'
import { ResultRow } from './result-row'

describe('ResultRow', () => {
  it('renders a native application icon when icon data is available', () => {
    const item: LauncherItem = {
      id: 'shortcut:cursor',
      title: 'Cursor',
      subtitle: '应用程序',
      aliases: ['cursor'],
      icon: 'folder',
      iconData: 'data:image/png;base64,native-icon',
      kind: 'application',
      action: { type: 'launch-indexed', targetId: 'shortcut:cursor' },
    }

    render(<ResultRow index={0} item={item} onExecute={() => undefined} onSelect={() => undefined} selected={false} />)

    expect(screen.getByRole('img', { name: 'Cursor 图标' })).toHaveAttribute('src', item.iconData)
  })
})

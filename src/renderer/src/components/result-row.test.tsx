import { fireEvent, render, screen } from '@testing-library/react'
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

  it('renders a compact application monogram when native icon data is unavailable', () => {
    const item: LauncherItem = {
      id: 'shortcut:shadowrocket',
      title: 'Shadowrocket',
      subtitle: '应用程序',
      aliases: ['shadowrocket'],
      icon: 'code',
      kind: 'application',
      action: { type: 'launch-indexed', targetId: 'shortcut:shadowrocket' },
    }

    render(<ResultRow index={0} item={item} onExecute={() => undefined} onSelect={() => undefined} selected={false} />)

    expect(screen.getByRole('img', { name: 'Shadowrocket 默认图标' })).toHaveTextContent('SH')
  })

  it('falls back to the application monogram when the native image cannot be decoded', () => {
    const item: LauncherItem = {
      id: 'shortcut:qq',
      title: 'QQ',
      subtitle: '应用程序',
      aliases: ['qq'],
      icon: 'message',
      iconData: 'data:image/png;base64,broken-icon',
      kind: 'application',
      action: { type: 'launch-indexed', targetId: 'shortcut:qq' },
    }

    render(<ResultRow index={0} item={item} onExecute={() => undefined} onSelect={() => undefined} selected={false} />)

    fireEvent.error(screen.getByRole('img', { name: 'QQ 图标' }))

    expect(screen.getByRole('img', { name: 'QQ 默认图标' })).toHaveTextContent('QQ')
  })
})

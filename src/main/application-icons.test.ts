import { describe, expect, it, vi } from 'vitest'
import type { LauncherCatalogPayload } from '../shared/launcher-item'
import { withApplicationIcons } from './application-icons'

describe('application icons', () => {
  it('hydrates indexed application items with native icon data', async () => {
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: [{
        id: 'shortcut:cursor',
        title: 'Cursor',
        subtitle: '应用程序',
        aliases: ['cursor'],
        icon: 'folder',
        kind: 'application',
        action: { type: 'launch-indexed', targetId: 'shortcut:cursor' },
      }],
    }
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,native-icon' })

    const result = await withApplicationIcons(catalog, new Map([['shortcut:cursor', '/Applications/Cursor.app']]), getFileIcon)

    expect(getFileIcon).toHaveBeenCalledWith('/Applications/Cursor.app', { size: 'normal' })
    expect(result.items[0]?.iconData).toBe('data:image/png;base64,native-icon')
  })

  it('keeps the catalog usable when the operating system cannot provide an icon', async () => {
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: [{
        id: 'shortcut:cursor',
        title: 'Cursor',
        subtitle: '应用程序',
        aliases: ['cursor'],
        icon: 'folder',
        kind: 'application',
        action: { type: 'launch-indexed', targetId: 'shortcut:cursor' },
      }],
    }

    const result = await withApplicationIcons(
      catalog,
      new Map([['shortcut:cursor', '/Applications/Cursor.app']]),
      vi.fn().mockRejectedValue(new Error('icon unavailable')),
    )

    expect(result.items[0]?.iconData).toBeUndefined()
    expect(result.items[0]?.icon).toBe('folder')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { LauncherCatalogPayload } from '../shared/launcher-item'
import { createCoalescedIconLoader, createSuccessfulIconLoader, hydrateApplicationIconsInBackground, withApplicationIcons } from './application-icons'

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

  it('rejects non-image and oversized icon data before publishing it', async () => {
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: [{
        id: 'shortcut:unsafe-icon',
        title: 'Unsafe Icon',
        subtitle: '应用程序',
        aliases: ['unsafe-icon'],
        icon: 'code',
        kind: 'application',
        action: { type: 'launch-indexed', targetId: 'shortcut:unsafe-icon' },
      }],
    }
    const getFileIcon = vi.fn()
      .mockResolvedValueOnce({ toDataURL: () => 'data:text/html;base64,not-an-image' })
      .mockResolvedValueOnce({ toDataURL: () => `data:image/png;base64,${'a'.repeat(512 * 1024)}` })

    const first = await withApplicationIcons(catalog, new Map([['shortcut:unsafe-icon', '/Applications/Unsafe.app']]), getFileIcon)
    const second = await withApplicationIcons(catalog, new Map([['shortcut:unsafe-icon', '/Applications/Unsafe.app']]), getFileIcon)

    expect(first.items[0]?.iconData).toBeUndefined()
    expect(second.items[0]?.iconData).toBeUndefined()
  })

  it('limits concurrent icon requests while preserving catalog order', async () => {
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `shortcut:app-${index}`,
        title: `App ${index}`,
        subtitle: '应用程序',
        aliases: [`app-${index}`],
        icon: 'folder' as const,
        kind: 'application' as const,
        action: { type: 'launch-indexed' as const, targetId: `shortcut:app-${index}` },
      })),
    }
    const targets = new Map(catalog.items.map((item, index) => [item.id, `/Applications/App ${index}.app`]))
    let active = 0
    let maximumActive = 0
    const getFileIcon = vi.fn(async (path: string) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return { toDataURL: () => `data:image/png;base64,${path}` }
    })

    const result = await withApplicationIcons(catalog, targets, getFileIcon, 2)

    expect(maximumActive).toBeLessThanOrEqual(2)
    expect(result.items.map((item) => item.id)).toEqual(catalog.items.map((item) => item.id))
  })

  it('caches successful icon loads but retries an earlier empty result', async () => {
    const loadIconData = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('data:image/png;base64,recovered')
    const loader = createSuccessfulIconLoader(loadIconData)

    expect((await loader('/Applications/iOS App.app', { size: 'normal' })).toDataURL()).toBe('')
    expect((await loader('/Applications/iOS App.app', { size: 'normal' })).toDataURL()).toBe('data:image/png;base64,recovered')
    expect((await loader('/Applications/iOS App.app', { size: 'normal' })).toDataURL()).toBe('data:image/png;base64,recovered')
    expect(loadIconData).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent icon loads for the same path', async () => {
    let release: ((value: string) => void) | undefined
    const loadIconData = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))
    const loader = createSuccessfulIconLoader(loadIconData)

    const first = loader('/Applications/QQ.app', { size: 'normal' })
    const second = loader('/Applications/QQ.app', { size: 'normal' })

    expect(loadIconData).toHaveBeenCalledOnce()
    release?.('data:image/png;base64,qq-icon')
    await expect((await first).toDataURL()).toBe('data:image/png;base64,qq-icon')
    await expect((await second).toDataURL()).toBe('data:image/png;base64,qq-icon')
  })

  it('coalesces concurrent system fallback requests for the same path', async () => {
    let release: ((value: { toDataURL: () => string }) => void) | undefined
    const loadIcon = vi.fn(() => new Promise<{ toDataURL: () => string }>((resolve) => { release = resolve }))
    const loader = createCoalescedIconLoader(loadIcon)

    const first = loader('/Applications/AssetsOnly.app', { size: 'normal' })
    const second = loader('/Applications/AssetsOnly.app', { size: 'normal' })

    expect(loadIcon).toHaveBeenCalledOnce()
    release?.({ toDataURL: () => 'data:image/png;base64,system-icon' })
    await expect((await first).toDataURL()).toBe('data:image/png;base64,system-icon')
    await expect((await second).toDataURL()).toBe('data:image/png;base64,system-icon')
  })

  it('hydrates icons after the caller has already published the text catalog', async () => {
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: [{
        id: 'shortcut:cursor',
        title: 'Cursor',
        subtitle: '应用程序',
        aliases: ['cursor'],
        icon: 'code',
        kind: 'application',
        action: { type: 'launch-indexed', targetId: 'shortcut:cursor' },
      }],
    }
    let releaseIcon: ((icon: { toDataURL: () => string }) => void) | undefined
    const getFileIcon = vi.fn(() => new Promise<{ toDataURL: () => string }>((resolve) => { releaseIcon = resolve }))
    const onHydrated = vi.fn()

    const hydration = hydrateApplicationIconsInBackground(catalog, new Map([['shortcut:cursor', '/Applications/Cursor.app']]), getFileIcon, onHydrated)

    expect(onHydrated).not.toHaveBeenCalled()
    releaseIcon?.({ toDataURL: () => 'data:image/png;base64,native-icon' })
    await hydration
    expect(onHydrated).toHaveBeenCalledOnce()
    expect(onHydrated.mock.calls[0]?.[0].items[0]?.iconData).toBe('data:image/png;base64,native-icon')
  })

  it('stops scheduling native requests when an icon batch is cancelled', async () => {
    const controller = new AbortController()
    const catalog: LauncherCatalogPayload = {
      snapshotVersion: 1,
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `app:${index}`, title: `App ${index}`, subtitle: '', aliases: [],
        icon: 'code' as const, kind: 'application' as const,
        action: { type: 'launch-indexed' as const, targetId: `app:${index}` },
      })),
    }
    const targets = new Map(catalog.items.map((item) => [item.id, item.id]))
    const getFileIcon = vi.fn(async () => {
      controller.abort()
      return { toDataURL: () => 'data:image/png;base64,icon' }
    })

    const result = await withApplicationIcons(catalog, targets, getFileIcon, 1, controller.signal)

    expect(getFileIcon).toHaveBeenCalledOnce()
    expect(result.items.every((item) => !item.iconData)).toBe(true)
  })

  it('does not publish a cancelled background batch', async () => {
    const controller = new AbortController()
    controller.abort()
    const getFileIcon = vi.fn()
    const onHydrated = vi.fn()

    await hydrateApplicationIconsInBackground(
      { snapshotVersion: 1, items: [] }, new Map(), getFileIcon, onHydrated,
      undefined, controller.signal,
    )

    expect(getFileIcon).not.toHaveBeenCalled()
    expect(onHydrated).not.toHaveBeenCalled()
  })
})

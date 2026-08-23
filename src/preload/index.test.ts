import { describe, expect, it, vi } from 'vitest'
import type { LauncherCatalogPayload } from '../shared/launcher-item'

const preloadState = vi.hoisted(() => ({
  exposedApi: undefined as Record<string, unknown> | undefined,
  listeners: new Map<string, (...args: unknown[]) => void>(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((_name: string, api: Record<string, unknown>) => {
      preloadState.exposedApi = api
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: preloadState.on.mockImplementation((channel: string, handler: (...args: unknown[]) => void) => {
      preloadState.listeners.set(channel, handler)
    }),
    removeListener: preloadState.removeListener,
  },
}))

describe('preload catalog subscription', () => {
  it('exposes catalog changes through the explicit channel and supports cleanup', async () => {
    await import('./index')
    const subscribe = preloadState.exposedApi?.onCatalogChanged as ((listener: (catalog: LauncherCatalogPayload) => void) => () => void) | undefined
    expect(subscribe).toBeTypeOf('function')
    if (!subscribe) return

    const listener = vi.fn()
    const cleanup = subscribe(listener)
    const catalog = { snapshotVersion: 2, items: [] }
    preloadState.listeners.get('launcher:catalog-changed')?.({}, catalog)

    expect(listener).toHaveBeenCalledWith(catalog)
    cleanup()
    expect(preloadState.removeListener).toHaveBeenCalledWith(
      'launcher:catalog-changed',
      preloadState.listeners.get('launcher:catalog-changed'),
    )
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const indexedShortcut = {
  displayName: 'Cursor.lnk',
  path: 'C:\\Start\\Cursor.lnk',
}

const electronState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const windows: Array<{
    hide: ReturnType<typeof vi.fn>
    webContents: { send: ReturnType<typeof vi.fn> }
  }> = []
  const state: {
    readyCallback?: () => Promise<void>
    handlers: typeof handlers
    windows: typeof windows
    isPackaged: boolean
    openExternal: ReturnType<typeof vi.fn>
    openPath: ReturnType<typeof vi.fn>
    spawn: ReturnType<typeof vi.fn>
    BrowserWindow: ReturnType<typeof vi.fn>
    trayTemplate: Array<{ label?: string; click?: () => void }>
  } = {
    handlers,
    windows,
    isPackaged: false,
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
    spawn: vi.fn(() => {
      const child = {
        once: vi.fn((event: string, listener: () => void) => {
          if (event === 'spawn') queueMicrotask(listener)
          return child
        }),
        removeAllListeners: vi.fn(),
        unref: vi.fn(),
      }
      return child
    }),
    BrowserWindow: vi.fn(function BrowserWindow() {
      const window = {
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        isFocused: vi.fn().mockReturnValue(false),
        loadFile: vi.fn().mockResolvedValue(undefined),
        loadURL: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        setPosition: vi.fn(),
        webContents: {
          executeJavaScript: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          send: vi.fn(),
        },
      }
      windows.push(window)
      return window
    }),
    trayTemplate: [],
  }
  return state
})

vi.mock('node:child_process', () => ({ spawn: electronState.spawn }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('C:\\QuickLauncherTest'),
    get isPackaged() {
      return electronState.isPackaged
    },
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
    setAppUserModelId: vi.fn(),
    setLoginItemSettings: vi.fn(),
    whenReady: vi.fn(() => ({
      then: (callback: () => Promise<void>) => {
        electronState.readyCallback = callback
        return { catch: vi.fn() }
      },
    })),
  },
  BrowserWindow: electronState.BrowserWindow,
  globalShortcut: {
    register: vi.fn().mockReturnValue(true),
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      electronState.handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => electronState.handlers.delete(channel)),
  },
  Menu: {
    buildFromTemplate: vi.fn((template: Array<{ label?: string; click?: () => void }>) => {
      electronState.trayTemplate = template
      return {}
    }),
  },
  nativeImage: { createFromDataURL: vi.fn().mockReturnValue({}) },
  nativeTheme: {
    on: vi.fn(),
    shouldUseDarkColors: false,
    themeSource: 'system',
  },
  screen: {
    getCursorScreenPoint: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    getDisplayNearestPoint: vi.fn().mockReturnValue({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  shell: {
    openExternal: electronState.openExternal,
    openPath: electronState.openPath,
  },
  Tray: vi.fn(function Tray() {
    return {
      destroy: vi.fn(),
      on: vi.fn(),
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
    }
  }),
}))

vi.mock('./settings-store', () => ({
  createSettingsStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      hotkey: 'Alt+Space',
      autostart: false,
      theme: 'system',
      searchEngine: { kind: 'bing' },
    }),
    update: vi.fn(),
  })),
}))

vi.mock('./shortcut-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shortcut-index')>()
  return {
    ...actual,
    scanShortcutDirectories: vi.fn().mockResolvedValue(actual.createShortcutIndex([indexedShortcut])),
  }
})

async function invoke(channel: string, value?: unknown): Promise<unknown> {
  const handler = electronState.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return handler({}, value)
}

describe('indexed application execution', () => {
  const originalE2eMode = process.env.QUICK_LAUNCHER_E2E

  beforeAll(async () => {
    await import('./index')
    if (!electronState.readyCallback) throw new Error('Electron bootstrap was not registered')
    await electronState.readyCallback()
  })

  beforeEach(() => {
    delete process.env.QUICK_LAUNCHER_E2E
    electronState.isPackaged = false
    electronState.openExternal.mockClear()
    electronState.openPath.mockClear()
    electronState.spawn.mockClear()
    for (const window of electronState.windows) window.hide.mockClear()
  })

  afterAll(() => {
    if (originalE2eMode === undefined) delete process.env.QUICK_LAUNCHER_E2E
    else process.env.QUICK_LAUNCHER_E2E = originalE2eMode
  })

  it('opens only the path mapped by the current indexed catalog and hides the launcher', async () => {
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ title: string; action: { type: string; targetId?: string } }>
    }
    const item = catalog.items.find((candidate) => candidate.action.type === 'launch-indexed')
    expect(item?.action.targetId).toMatch(/^shortcut:[a-f0-9]{20}$/u)

    const result = await invoke('launcher:execute', {
      id: item?.action.targetId,
      action: { type: 'launch-indexed', targetId: item?.action.targetId },
    })

    expect(electronState.openPath).toHaveBeenCalledOnce()
    expect(electronState.openPath).toHaveBeenCalledWith(indexedShortcut.path)
    expect(electronState.openExternal).not.toHaveBeenCalled()
    expect(electronState.windows[0]?.hide).toHaveBeenCalledOnce()
    expect(result).toBe('Cursor 已打开')
  })

  it('rejects a well-formed but unknown target ID without touching the operating system', async () => {
    const result = await invoke('launcher:execute', {
      id: 'shortcut:ffffffffffffffffffff',
      action: { type: 'launch-indexed', targetId: 'shortcut:ffffffffffffffffffff' },
    })

    expect(electronState.openPath).not.toHaveBeenCalled()
    expect(electronState.openExternal).not.toHaveBeenCalled()
    expect(result).toMatch(/不存在|失效/u)
  })

  it('returns a Chinese error and keeps the launcher visible when Electron rejects the shortcut path', async () => {
    electronState.openPath.mockResolvedValueOnce('shortcut no longer exists')
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ action: { type: string; targetId?: string } }>
    }
    const targetId = catalog.items.find((item) => item.action.type === 'launch-indexed')?.action.targetId

    const result = await invoke('launcher:execute', {
      id: targetId,
      action: { type: 'launch-indexed', targetId },
    })

    expect(electronState.openPath).toHaveBeenCalledWith(indexedShortcut.path)
    expect(electronState.windows[0]?.hide).not.toHaveBeenCalled()
    expect(result).toMatch(/打开失败|无法打开/u)
  })

  it('simulates indexed launch in E2E mode without calling Electron openPath', async () => {
    process.env.QUICK_LAUNCHER_E2E = '1'
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ action: { type: string; targetId?: string } }>
    }
    const targetId = catalog.items.find((item) => item.action.type === 'launch-indexed')?.action.targetId

    const result = await invoke('launcher:execute', {
      id: targetId,
      action: { type: 'launch-indexed', targetId },
    })

    expect(electronState.openPath).not.toHaveBeenCalled()
    expect(electronState.openExternal).not.toHaveBeenCalled()
    expect(electronState.windows[0]?.hide).toHaveBeenCalledOnce()
    expect(result).toBe('Cursor 已打开')
  })

  it('calls Electron openPath in packaged builds even when the E2E environment variable is set', async () => {
    process.env.QUICK_LAUNCHER_E2E = '1'
    electronState.isPackaged = true
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ action: { type: string; targetId?: string } }>
    }
    const targetId = catalog.items.find((item) => item.action.type === 'launch-indexed')?.action.targetId

    const result = await invoke('launcher:execute', {
      id: targetId,
      action: { type: 'launch-indexed', targetId },
    })

    expect(electronState.openPath).toHaveBeenCalledOnce()
    expect(electronState.openPath).toHaveBeenCalledWith(indexedShortcut.path)
    expect(result).toBe('Cursor 已打开')
  })

  it('rejects legacy demo launch actions without touching the operating system', async () => {
    process.env.QUICK_LAUNCHER_E2E = '1'

    const result = await invoke('launcher:execute', {
      id: 'app:cursor',
      action: { type: 'launch-demo', targetId: 'cursor' },
    })

    expect(electronState.openPath).not.toHaveBeenCalled()
    expect(electronState.spawn).not.toHaveBeenCalled()
    expect(result).toMatch(/不可用|无效/u)
  })

  it('publishes the refreshed catalog after an IPC refresh', async () => {
    const result = await invoke('launcher:refresh-applications')

    expect(result).toEqual({ count: 1 })
    expect(electronState.windows[0]?.webContents.send).toHaveBeenCalledWith(
      'launcher:catalog-changed',
      expect.objectContaining({ snapshotVersion: expect.any(Number), items: expect.any(Array) }),
    )
  })

  it('publishes the refreshed catalog after a tray refresh', async () => {
    const refreshItem = electronState.trayTemplate.find((item) => item.label === '刷新应用索引')
    if (!refreshItem?.click) throw new Error('Tray refresh command was not registered')

    refreshItem.click()

    await vi.waitFor(() => expect(electronState.windows[0]?.webContents.send).toHaveBeenCalledWith(
      'launcher:catalog-changed',
      expect.objectContaining({ snapshotVersion: expect.any(Number), items: expect.any(Array) }),
    ))
  })
})

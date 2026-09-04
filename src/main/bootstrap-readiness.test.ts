import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const originalPlatform = process.platform
beforeAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
})

const bootstrapState = vi.hoisted(() => {
  let resolveScan: ((value: { entries: readonly []; find: () => undefined }) => void) | undefined
  let latestWindow: Record<string, unknown> | undefined
  let launcherHotkeyCallback: (() => void) | undefined
  const scanPromise = new Promise<{ entries: readonly []; find: () => undefined }>((resolve) => {
    resolveScan = resolve
  })
  return {
    readyCallback: undefined as (() => Promise<void>) | undefined,
    resolveScan: () => resolveScan?.({ entries: [], find: () => undefined }),
    scanPromise,
    scanSettled: false,
    scanRoots: undefined as readonly string[] | undefined,
    browserWindow: vi.fn(function BrowserWindow() {
      const windowEvents = new Map<string, () => void>()
      const window = {
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        isFocused: vi.fn().mockReturnValue(false),
        loadFile: vi.fn().mockResolvedValue(undefined),
        loadURL: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((event: string, handler: () => void) => windowEvents.set(event, handler)),
        setAlwaysOnTop: vi.fn(),
        setPosition: vi.fn(),
        windowEvents,
        webContents: {
          executeJavaScript: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          send: vi.fn(),
        },
      }
      latestWindow = window
      return window
    }),
    getLatestWindow: () => latestWindow,
    getLauncherHotkeyCallback: () => launcherHotkeyCallback,
    registerHotkey: vi.fn((_accelerator: string, callback: () => void) => {
      launcherHotkeyCallback = callback
      return true
    }),
    scanShortcuts: vi.fn(),
  }
})

bootstrapState.scanPromise.then(() => {
  bootstrapState.scanSettled = true
}).catch(() => undefined)

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => name === 'desktop' ? 'D:\\Profiles\\Me\\Desktop' : 'C:\\QuickLauncherTest'),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
    setAppUserModelId: vi.fn(),
    setLoginItemSettings: vi.fn(),
    whenReady: vi.fn(() => ({
      then: (callback: () => Promise<void>) => {
        bootstrapState.readyCallback = callback
        return { catch: vi.fn() }
      },
    })),
  },
  BrowserWindow: bootstrapState.browserWindow,
  globalShortcut: {
    register: bootstrapState.registerHotkey,
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  Menu: { buildFromTemplate: vi.fn().mockReturnValue({}) },
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
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
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

vi.mock('./user-command-store', () => ({
  createUserCommandStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    update: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
  })),
}))

vi.mock('./activity-history', () => ({
  createActivityHistoryStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockReturnValue([]),
    add: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('./application-index-cache', () => ({
  createApplicationIndexCache: vi.fn(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('./shortcut-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shortcut-index')>()
  bootstrapState.scanShortcuts.mockImplementation((roots: readonly string[] | undefined) => {
    bootstrapState.scanRoots = roots
    return bootstrapState.scanPromise
  })
  return { ...actual, scanShortcutDirectories: bootstrapState.scanShortcuts }
})

describe('main process bootstrap readiness', () => {
  afterEach(() => vi.useRealTimers())

  it('creates the launcher and registers the hotkey before the initial shortcut scan settles', async () => {
    await import('./index')
    if (!bootstrapState.readyCallback) throw new Error('Electron bootstrap was not registered')

    const bootstrapPromise = bootstrapState.readyCallback()
    try {
      await vi.waitFor(() => expect(bootstrapState.scanShortcuts).toHaveBeenCalledOnce())
      expect(bootstrapState.scanSettled).toBe(false)
      expect(bootstrapState.browserWindow).toHaveBeenCalledOnce()
      expect(bootstrapState.registerHotkey).toHaveBeenCalled()
    } finally {
      bootstrapState.resolveScan()
      await bootstrapPromise
    }
  })

  it('does not let an old blur timer hide the launcher after it is shown again', () => {
    vi.useFakeTimers()
    const window = bootstrapState.getLatestWindow() as {
      hide: ReturnType<typeof vi.fn>
      windowEvents: Map<string, () => void>
    }
    const showLauncher = bootstrapState.getLauncherHotkeyCallback()
    if (!showLauncher) throw new Error('Launcher hotkey callback was not registered')

    window.windowEvents.get('blur')?.()
    showLauncher()
    vi.advanceTimersByTime(80)

    expect(window.hide).not.toHaveBeenCalled()
  })

  it('passes the Electron desktop path into the initial shortcut scan', () => {
    expect(bootstrapState.scanRoots).toContain('D:\\Profiles\\Me\\Desktop')
  })

  it('does not hide the launcher when it has regained focus before the blur timer fires', () => {
    vi.useFakeTimers()
    const window = bootstrapState.getLatestWindow() as {
      hide: ReturnType<typeof vi.fn>
      isFocused: ReturnType<typeof vi.fn>
      windowEvents: Map<string, () => void>
    }
    window.hide.mockClear()
    window.isFocused.mockReturnValue(true)

    window.windowEvents.get('blur')?.()
    vi.advanceTimersByTime(80)

    expect(window.hide).not.toHaveBeenCalled()
    window.isFocused.mockReturnValue(false)
  })

  it('clears a pending blur timer when the search window closes', () => {
    vi.useFakeTimers()
    const window = bootstrapState.getLatestWindow() as {
      hide: ReturnType<typeof vi.fn>
      windowEvents: Map<string, () => void>
    }
    window.hide.mockClear()

    window.windowEvents.get('blur')?.()
    window.windowEvents.get('closed')?.()
    vi.advanceTimersByTime(80)

    expect(window.hide).not.toHaveBeenCalled()
  })
})

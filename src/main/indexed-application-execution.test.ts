import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BaseCatalogSnapshot } from '../shared/launcher-ipc'
import type { LauncherCatalogPayload } from '../shared/launcher-item'

const originalPlatform = process.platform

const indexedShortcut = {
  displayName: 'Cursor.lnk',
  path: 'C:\\Start\\Cursor.lnk',
}

const indexedStoreApp = {
  displayName: 'Calculator',
  path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
  metadata: { platform: 'windows' as const, appUserModelId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
}

const electronState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const windows: Array<{
    hide: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    webContents: { send: ReturnType<typeof vi.fn> }
    windowEvents: Map<string, () => void>
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
    launcherHotkey?: () => void
    clipboardText: string
    writeClipboard: ReturnType<typeof vi.fn>
    clearHistory: ReturnType<typeof vi.fn>
    commands: Array<{ id: string; keyword: string; title: string; type: 'site-search' | 'launch-app'; target: string; enabled: boolean }>
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
      windows.push(window)
      return window
    }),
    trayTemplate: [],
    clipboardText: '',
    writeClipboard: vi.fn((value: string) => { state.clipboardText = value }),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    commands: [{
      id: 'bilibili',
      keyword: 'b站',
      title: '哔哩哔哩',
      type: 'site-search',
      target: 'https://search.bilibili.com/all?keyword={query}',
      enabled: true,
    }],
  }
  return state
})

vi.mock('node:child_process', () => ({ spawn: electronState.spawn }))

vi.mock('electron', () => ({
  app: {
    getFileIcon: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,dGVzdA==' }),
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
  clipboard: {
    readText: vi.fn(() => electronState.clipboardText),
    writeText: electronState.writeClipboard,
  },
  globalShortcut: {
    register: vi.fn((_accelerator: string, callback: () => void) => {
      electronState.launcherHotkey = callback
      return true
    }),
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
      clipboardHistoryEnabled: true,
      fileHistoryEnabled: true,
      disabledBaseAppIds: ['chrome'],
      theme: 'system',
      searchEngine: { kind: 'bing' },
    }),
    update: vi.fn(),
  })),
}))

vi.mock('./user-command-store', () => ({
  createUserCommandStore: vi.fn(() => ({
    load: vi.fn().mockImplementation(async () => electronState.commands),
    get: vi.fn().mockImplementation(() => electronState.commands),
    getImportedPackages: vi.fn().mockReturnValue({}),
    create: vi.fn(),
    update: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
    importPackage: vi.fn(),
  })),
}))

vi.mock('./activity-history', () => ({
  createActivityHistoryStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockReturnValue([
      { type: 'clipboard', value: '历史文本', updatedAt: 2 },
      { type: 'file', value: 'C:\\Projects\\history.txt', updatedAt: 1 },
    ]),
    add: vi.fn().mockResolvedValue(undefined),
    clear: electronState.clearHistory,
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
  return {
    ...actual,
    scanShortcutDirectories: vi.fn().mockResolvedValue(actual.createShortcutIndex([indexedShortcut, indexedStoreApp, {
      displayName: 'Google Chrome', path: 'C:\\ZZApps\\chrome.exe',
      metadata: { platform: 'windows', executableName: 'chrome.exe' },
    }])),
  }
})

vi.mock('./windows-application-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./windows-application-index')>()
  return { ...actual, readWindowsExecutablePublisher: vi.fn().mockResolvedValue('Google LLC') }
})

async function invoke(channel: string, value?: unknown): Promise<unknown> {
  const handler = electronState.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return handler({ sender: { id: 42 } }, value)
}

describe('indexed application execution', () => {
  const originalE2eMode = process.env.QUICK_LAUNCHER_E2E

  beforeAll(async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
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
    electronState.writeClipboard.mockClear()
    electronState.clearHistory.mockClear()
    electronState.clipboardText = ''
    for (const window of electronState.windows) window.hide.mockClear()
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
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

  it('launches a validated Store app through explorer AppsFolder activation', async () => {
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ title: string; action: { type: string; targetId?: string } }>
    }
    const targetId = catalog.items.find((candidate) => candidate.title === 'Calculator')?.action.targetId

    const result = await invoke('launcher:execute', {
      id: targetId,
      action: { type: 'launch-indexed', targetId },
    })

    expect(electronState.spawn).toHaveBeenCalledWith(
      'explorer.exe',
      [indexedStoreApp.path],
      { detached: true, stdio: 'ignore' },
    )
    expect(electronState.openPath).not.toHaveBeenCalled()
    expect(result).toBe('Calculator 已打开')
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

  it('opens a validated Douyin site search in the default browser', async () => {
    const result = await invoke('launcher:execute', {
      id: 'site-search:douyin',
      action: { type: 'site-search', provider: 'douyin', query: '海贼王' },
    })

    expect(electronState.openExternal).toHaveBeenCalledWith(
      'https://www.douyin.com/search/%E6%B5%B7%E8%B4%BC%E7%8E%8B?type=general',
    )
    expect(electronState.windows[0]?.hide).toHaveBeenCalledOnce()
    expect(result).toBe('正在打开抖音搜索“海贼王”')
  })

  it('returns a window-bound one-time token when the browser rejects a search URL', async () => {
    electronState.openExternal.mockRejectedValueOnce(new Error('no browser'))

    const result = await invoke('launcher:execute', {
      id: 'site-search:douyin',
      action: { type: 'site-search', provider: 'douyin', query: '海贼王' },
    }) as { message: string; copyToken: string }

    expect(result.message).toBe('浏览器打开失败，请检查默认浏览器设置')
    expect(result.copyToken).toMatch(/^[a-f0-9]{32}$/u)
    expect(JSON.stringify(result)).not.toContain('douyin.com')

    expect(await invoke('launcher:copy-generated-url', result.copyToken)).toBe('网址已复制')
    expect(electronState.writeClipboard).toHaveBeenCalledWith('https://www.douyin.com/search/%E6%B5%B7%E8%B4%BC%E7%8E%8B?type=general')
    expect(await invoke('launcher:copy-generated-url', result.copyToken)).toBe('网址复制失败，请重新搜索')
  })

  it('resolves a configured site-search template in the main process', async () => {
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ id: string; action: { type: string; commandId?: string; query?: string } }>
    }
    expect(catalog.items).toContainEqual(expect.objectContaining({
      id: 'command:bilibili',
      action: { type: 'command-site-search', commandId: 'bilibili', query: '' },
    }))

    const result = await invoke('launcher:execute', {
      id: 'command:bilibili',
      action: { type: 'command-site-search', commandId: 'bilibili', query: '海贼王 剧场版' },
    })

    expect(electronState.openExternal).toHaveBeenCalledWith(
      'https://search.bilibili.com/all?keyword=%E6%B5%B7%E8%B4%BC%E7%8E%8B%20%E5%89%A7%E5%9C%BA%E7%89%88',
    )
    expect(result).toBe('正在打开哔哩哔哩搜索“海贼王 剧场版”')
  })

  it('resolves a launch-app command through the indexed application catalog', async () => {
    electronState.commands.push({
      id: 'launch-cursor',
      keyword: 'cursor-app',
      title: '启动 Cursor',
      type: 'launch-app',
      target: 'cursor',
      enabled: true,
    })

    try {
      await invoke('launcher:refresh-applications')
      const catalog = await invoke('launcher:get-catalog') as {
        items: Array<{ id: string; action: { type: string; commandId?: string } }>
      }
      expect(catalog.items).toContainEqual(expect.objectContaining({
        id: 'command:launch-cursor',
        action: { type: 'command-launch-app', commandId: 'launch-cursor' },
      }))

      const result = await invoke('launcher:execute', {
        id: 'command:launch-cursor',
        action: { type: 'command-launch-app', commandId: 'launch-cursor' },
      })

      expect(electronState.openPath).toHaveBeenCalledWith(indexedShortcut.path)
      expect(result).toBe('Cursor 已打开')
    } finally {
      electronState.commands.pop()
      await invoke('launcher:refresh-applications')
    }
  })

  it('opens a validated absolute path without invoking a command shell', async () => {
    const result = await invoke('launcher:execute', {
      id: 'productivity:path',
      action: { type: 'open-path', path: 'C:\\Projects\\demo' },
    })

    expect(electronState.openPath).toHaveBeenCalledWith('C:\\Projects\\demo')
    expect(electronState.spawn).not.toHaveBeenCalled()
    expect(result).toBe('已打开文件或文件夹')
  })

  it('transforms text and writes only the result to the clipboard', async () => {
    const result = await invoke('launcher:execute', {
      id: 'productivity:clipboard:format-json',
      action: { type: 'clipboard-transform', operation: 'format-json', input: '{"name":"quick"}' },
    })

    expect(electronState.writeClipboard).toHaveBeenCalledWith('{\n  "name": "quick"\n}')
    expect(result).toBe('处理结果已复制到剪贴板')
  })

  it('executes system operations only through their fixed Windows plan', async () => {
    const result = await invoke('launcher:execute', {
      id: 'productivity:system:lock-screen',
      action: { type: 'system-action', operation: 'lock-screen' },
    })

    expect(electronState.spawn).toHaveBeenCalledWith(
      'rundll32.exe',
      ['user32.dll,LockWorkStation'],
      { detached: true, stdio: 'ignore' },
    )
    expect(result).toBe('系统操作已执行')
  })

  it('publishes clipboard and recent-file history as local catalog actions', async () => {
    const catalog = await invoke('launcher:get-catalog') as {
      items: Array<{ id: string; aliases: string[]; action: { type: string; text?: string; path?: string } }>
    }

    expect(catalog.items).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^history:clipboard:/u),
      aliases: expect.arrayContaining(['剪贴板历史']),
      action: { type: 'copy-text', text: '历史文本' },
    }))
    expect(catalog.items).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^history:file:/u),
      aliases: expect.arrayContaining(['最近文件']),
      action: { type: 'open-path', path: 'C:\\Projects\\history.txt' },
    }))
  })

  it('publishes the refreshed catalog after an IPC refresh', async () => {
    const result = await invoke('launcher:refresh-applications')

    expect((result as { count: number }).count).toBeGreaterThanOrEqual(4)
    expect(electronState.windows[0]?.webContents.send).toHaveBeenCalledWith(
      'launcher:catalog-changed',
      expect.objectContaining({ snapshotVersion: expect.any(Number), items: expect.any(Array) }),
    )
  })

  it('keeps a disabled Windows template icon after a fresh scan without restoring its aliases', async () => {
    await invoke('launcher:refresh-applications')
    await vi.waitFor(async () => {
      const templates = await invoke('launcher:get-base-catalog') as BaseCatalogSnapshot
      expect(templates.disabledAppIds).toContain('chrome')
      expect(templates.apps.find((app) => app.id === 'chrome')?.iconData).toBe('data:image/png;base64,dGVzdA==')
    })
    const catalog = await invoke('launcher:get-catalog') as LauncherCatalogPayload
    const chrome = catalog.items.find((item) => item.title === 'Google Chrome')
    expect(chrome).toBeDefined()
    expect(chrome?.aliases).not.toContain('googlechrome')
    expect(chrome?.iconData).toBe('data:image/png;base64,dGVzdA==')
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

  it('clears a supported history category through IPC and rejects unknown categories', async () => {
    await invoke('launcher:clear-history', 'clipboard')

    expect(electronState.clearHistory).toHaveBeenCalledWith('clipboard')
    await expect(invoke('launcher:clear-history', 'all')).rejects.toThrow('INVALID_HISTORY_TYPE')
  })

  it('cancels a pending launcher focus when settings opens', async () => {
    const searchWindow = electronState.windows[0]
    if (!searchWindow) throw new Error('Search window was not created')

    electronState.launcherHotkey?.()
    await invoke('launcher:open-settings')
    searchWindow.show.mockClear()
    searchWindow.windowEvents.get('did-finish-load')?.()

    expect(searchWindow.show).not.toHaveBeenCalled()
  })

  it('keeps the settings and search windows mutually exclusive', async () => {
    const searchWindow = electronState.windows[0]
    if (!searchWindow) throw new Error('Search window was not created')

    await invoke('launcher:open-settings')
    const settingsWindow = electronState.windows[1]
    if (!settingsWindow) throw new Error('Settings window was not created')
    searchWindow.hide.mockClear()
    settingsWindow.hide.mockClear()

    electronState.launcherHotkey?.()

    expect(settingsWindow.hide).toHaveBeenCalledOnce()
    expect(searchWindow.show).toHaveBeenCalled()
  })
})

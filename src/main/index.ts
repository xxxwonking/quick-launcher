import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  Tray,
} from 'electron'
import {
  buildSearchUrl,
  findApplicationDefinition,
  parseExecutableAction,
  type ParsedExecutableAction,
} from './app-catalog'
import { registerLauncherHotkey } from './hotkey-registration'
import { IPC_CHANNELS, parseThemePreference, type ThemePreference } from './ipc-contract'
import { openExternalSafely, openPathSafely, resolveDevelopmentRendererUrl, shouldSimulateOsOpen } from './external-opener'
import { createSettingsStore, type LauncherSettings } from './settings-store'
import { createShortcutIndex, defaultShortcutRoots, scanShortcutDirectories, type ShortcutIndex } from './shortcut-index'
import { centerLauncherInWorkArea } from './window-placement'
import { buildIndexedApplicationCatalog } from './indexed-application-catalog'

const SEARCH_WINDOW_SIZE = { width: 760, height: 560 }
const SETTINGS_WINDOW_SIZE = { width: 960, height: 700 }
const DEFAULT_HOTKEY = 'Alt+Space'
const EMPTY_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let searchWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settingsStore: ReturnType<typeof createSettingsStore> | null = null
let shortcutIndex: ShortcutIndex = createShortcutIndex([])
let indexedCatalog = buildIndexedApplicationCatalog([], 0)
let settings: LauncherSettings
let requestedHotkey = DEFAULT_HOTKEY
let activeHotkey: string | null = null
let hotkeyConflict = false
let rendererReady = false
let focusAfterLoad = false
let bootstrapped = false
let searchWindowBlurTimer: ReturnType<typeof setTimeout> | null = null

const shouldSimulateNativeLaunch = (): boolean => shouldSimulateOsOpen(process.env.QUICK_LAUNCHER_E2E, app.isPackaged)

function preloadPath(): string {
  return join(__dirname, '../preload/index.cjs')
}

function rendererQuery(parameters: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined) query.set(key, value)
  const serialized = query.toString()
  return serialized.length > 0 ? `?${serialized}` : ''
}

async function loadRenderer(window: BrowserWindow, parameters: Record<string, string | undefined> = {}): Promise<void> {
  const query = rendererQuery(parameters)
  const developmentUrl = resolveDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
  if (developmentUrl) {
    await window.loadURL(`${developmentUrl}/${query}`)
    return
  }
  await window.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
}

function resolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function themePayload(): { preference: ThemePreference; resolved: 'light' | 'dark' } {
  return { preference: settings.theme, resolved: resolvedTheme(settings.theme) }
}

function broadcastTheme(): void {
  const payload = themePayload()
  for (const window of [searchWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.themeChanged, payload)
  }
}

function broadcastCatalog(): void {
  for (const window of [searchWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.catalogChanged, indexedCatalog.payload)
  }
}

function applyTheme(preference: ThemePreference): void {
  nativeTheme.themeSource = preference
  broadcastTheme()
}

function clearSearchWindowBlurTimer(): void {
  if (!searchWindowBlurTimer) return
  clearTimeout(searchWindowBlurTimer)
  searchWindowBlurTimer = null
}

function createSearchWindow(): BrowserWindow {
  if (searchWindow && !searchWindow.isDestroyed()) return searchWindow
  const window = new BrowserWindow({
    width: SEARCH_WINDOW_SIZE.width,
    height: SEARCH_WINDOW_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  searchWindow = window
  rendererReady = false
  window.on('closed', () => {
    clearSearchWindowBlurTimer()
    if (searchWindow === window) searchWindow = null
    rendererReady = false
  })
  window.on('blur', () => {
    clearSearchWindowBlurTimer()
    searchWindowBlurTimer = setTimeout(() => {
      searchWindowBlurTimer = null
      if (!window.isDestroyed() && !window.isFocused() && !settingsWindow?.isFocused()) window.hide()
    }, 80)
  })
  window.webContents.on('did-finish-load', () => {
    rendererReady = true
    broadcastTheme()
    if (focusAfterLoad) requestRendererFocus()
  })
  void loadRenderer(window).catch((error: unknown) => console.error('[launcher] search window load failed', error))
  return window
}

function createSettingsWindow(tutorial: boolean): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (tutorial) void loadRenderer(settingsWindow, { window: 'settings', tutorial: '1' }).catch((error: unknown) => console.error('[launcher] settings reload failed', error))
    return settingsWindow
  }
  const window = new BrowserWindow({
    width: SETTINGS_WINDOW_SIZE.width,
    height: SETTINGS_WINDOW_SIZE.height,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Quick Launcher 设置',
    backgroundColor: '#161618',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  settingsWindow = window
  window.on('closed', () => {
    if (settingsWindow === window) settingsWindow = null
  })
  window.webContents.on('did-finish-load', () => broadcastTheme())
  void loadRenderer(window, { window: 'settings', tutorial: tutorial ? '1' : undefined }).catch((error: unknown) => console.error('[launcher] settings window load failed', error))
  return window
}

function requestRendererFocus(): void {
  clearSearchWindowBlurTimer()
  if (!searchWindow || searchWindow.isDestroyed()) return
  if (!rendererReady) {
    focusAfterLoad = true
    return
  }
  focusAfterLoad = false
  searchWindow.show()
  searchWindow.focus()
  searchWindow.webContents.send(IPC_CHANNELS.focusRequested)
  void searchWindow.webContents.executeJavaScript("document.querySelector('[role=combobox]')?.focus()", true).catch(() => undefined)
}

function showLauncher(): void {
  clearSearchWindowBlurTimer()
  const window = createSearchWindow()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const position = centerLauncherInWorkArea(display.workArea, SEARCH_WINDOW_SIZE)
  window.setPosition(position.x, position.y, false)
  window.setAlwaysOnTop(true, 'floating')
  window.show()
  window.focus()
  requestRendererFocus()
}

function hideLauncher(): void {
  if (searchWindow && !searchWindow.isDestroyed()) searchWindow.hide()
}

function openSettings(tutorial = false): void {
  hideLauncher()
  const window = createSettingsWindow(tutorial)
  window.show()
  window.focus()
}

async function launchApplication(targetId: string): Promise<string> {
  if (!findApplicationDefinition(targetId)) return '应用不可用'
  return '应用不可用，请先刷新应用索引'
}

async function launchIndexedApplication(targetId: string): Promise<string> {
  const path = indexedCatalog.targets.get(targetId)
  const item = indexedCatalog.payload.items.find((candidate) => (
    candidate.action.type === 'launch-indexed' && candidate.action.targetId === targetId
  ))
  if (!path || !item) return '应用不存在或索引已失效，请刷新应用索引'

  const opened = await openPathSafely(
    path,
    (shortcutPath) => shell.openPath(shortcutPath),
    shouldSimulateNativeLaunch(),
  )
  if (!opened) return `${item.title} 打开失败，请刷新应用索引后重试`

  hideLauncher()
  return `${item.title} 已打开`
}

async function executeParsedAction(action: ParsedExecutableAction): Promise<string> {
  if (action.kind === 'application') return launchApplication(action.targetId)
  if (action.kind === 'indexed-application') return launchIndexedApplication(action.targetId)
  if (action.kind === 'settings') {
    openSettings(false)
    return '正在打开设置'
  }
  if (action.kind === 'tutorial') {
    openSettings(true)
    return '正在打开教程'
  }
  const opened = await openExternalSafely(
    buildSearchUrl(settings.searchEngine, action.query),
    (url) => shell.openExternal(url),
    shouldSimulateNativeLaunch(),
  )
  if (opened) {
    hideLauncher()
    return action.query ? `正在搜索“${action.query}”` : '正在打开搜索引擎'
  }
  return '浏览器打开失败，请检查默认浏览器设置'
}

async function executeItem(value: unknown): Promise<string> {
  const action = parseExecutableAction(value)
  if (!action) return '动作无效'
  return executeParsedAction(action)
}

async function refreshApplications(): Promise<{ count: number }> {
  shortcutIndex = await scanShortcutDirectories(defaultShortcutRoots(app.getPath('desktop')))
  indexedCatalog = buildIndexedApplicationCatalog(shortcutIndex.entries, indexedCatalog.payload.snapshotVersion + 1)
  broadcastCatalog()
  return { count: indexedCatalog.payload.items.length }
}

function configureAutostart(enabled: boolean): void {
  if (typeof app.setLoginItemSettings !== 'function') return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function registerIpc(): void {
  ipcMainHandle(IPC_CHANNELS.openSettings, async () => openSettings(false))
  ipcMainHandle(IPC_CHANNELS.openTutorial, async () => openSettings(true))
  ipcMainHandle(IPC_CHANNELS.hide, async () => hideLauncher())
  ipcMainHandle(IPC_CHANNELS.getTheme, async () => themePayload())
  ipcMainHandle(IPC_CHANNELS.setTheme, async (value: unknown) => {
    const preference = parseThemePreference(value)
    if (!preference || !settingsStore) throw new Error('INVALID_THEME')
    settings = await settingsStore.update({ theme: preference })
    applyTheme(preference)
  })
  ipcMainHandle(IPC_CHANNELS.execute, async (value: unknown) => executeItem(value))
  ipcMainHandle(IPC_CHANNELS.refreshApplications, async () => refreshApplications())
  ipcMainHandle(IPC_CHANNELS.getHotkeyStatus, async () => ({ requested: requestedHotkey, active: activeHotkey, conflict: hotkeyConflict }))
  ipcMainHandle(IPC_CHANNELS.getCatalog, async () => indexedCatalog.payload)
}

function ipcMainHandle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
  // Electron throws when a handler is registered twice during a hot reload.
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => handler(...args))
}

function createTray(): void {
  if (tray) return
  try {
    tray = new Tray(nativeImage.createFromDataURL(EMPTY_TRAY_ICON))
    tray.setToolTip('Quick Launcher')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开搜索', click: () => showLauncher() },
      { label: '打开设置', click: () => openSettings(false) },
      { label: '刷新应用索引', click: () => { void refreshApplications() } },
      { type: 'separator' },
      { label: '退出 Quick Launcher', click: () => app.quit() },
    ]))
    tray.on('click', () => showLauncher())
  } catch (error) {
    console.warn('[launcher] tray unavailable', error)
  }
}

function registerGlobalHotkey(): void {
  globalShortcut.unregisterAll()
  const result = registerLauncherHotkey(requestedHotkey, (accelerator) => globalShortcut.register(accelerator, showLauncher), () => undefined)
  activeHotkey = result.accelerator
  hotkeyConflict = result.conflict
}

async function bootstrap(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  if (process.platform === 'win32') app.setAppUserModelId('com.quicklauncher.desktop')
  settingsStore = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
  settings = await settingsStore.load()
  requestedHotkey = settings.hotkey || DEFAULT_HOTKEY
  nativeTheme.themeSource = settings.theme
  configureAutostart(settings.autostart)
  registerIpc()
  createSearchWindow()
  createTray()
  registerGlobalHotkey()
  nativeTheme.on('updated', () => broadcastTheme())
  await refreshApplications()
}

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => showLauncher())
  app.whenReady().then(() => bootstrap()).catch((error: unknown) => {
    console.error('[launcher] bootstrap failed', error)
    bootstrapped = false
  })
  app.on('activate', () => showLauncher())
  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
    tray?.destroy()
    tray = null
  })
  app.on('window-all-closed', () => undefined)
}

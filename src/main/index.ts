import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
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
  buildSiteSearchUrl,
  buildUserCommandSiteSearchUrl,
  findApplicationDefinition,
  normalizeSearchEngine,
  parseExecutableAction,
  type ParsedExecutableAction,
} from './app-catalog'
import { registerLauncherHotkey } from './hotkey-registration'
import { IPC_CHANNELS, parseThemePreference, type ThemePreference } from './ipc-contract'
import { openExternalSafely, openPathSafely, resolveDevelopmentRendererUrl, shouldSimulateOsOpen } from './external-opener'
import { createSettingsStore, normalizeFileSearchRoots, type LauncherSettings } from './settings-store'
import { createShortcutIndex, shortcutExecutableName, type ShortcutIndex } from './shortcut-index'
import { centerLauncherInWorkArea } from './window-placement'
import { buildIndexedApplicationCatalog, withBaseTemplateIcons } from './indexed-application-catalog'
import { createCoalescedIconLoader, createSuccessfulIconLoader, hydrateApplicationIconsInBackground } from './application-icons'
import { createPlatformIconLoader } from './application-icon-loader'
import { findApplicationIconPaths } from './application-icon-path'
import { loadFirstMacIconData } from './mac-icon-cache'
import { findMacApplicationsByBundleIds } from './mac-application-index'
import { createActivityHistoryStore, type ActivityHistoryType } from './activity-history'
import { applicationArgumentPlan, systemActionPlan, transformClipboardText, type ProductivityExecutionPlan } from './productivity-actions'
import { defaultApplicationWatchRoots, scanPlatformApplications } from './platform-application-index'
import { isWindowsShellAppPath, readWindowsExecutablePublisher } from './windows-application-index'
import { configureAutostart as configureAutostartAdapter, type AutostartResult } from './autostart'
import { findInvalidApplicationBindings, validateApplicationBinding } from './application-binding'
import { createApplicationIndexCache } from './application-index-cache'
import { launcherHotkeyForPlatform } from '../shared/platform-hotkey'
import { isValidLauncherHotkey } from '../shared/launcher-hotkey'
import type { LauncherSettingsPatch, LauncherSettingsSnapshot } from '../shared/launcher-settings'
import type { LauncherCatalogPayload, LauncherItem } from '../shared/launcher-item'
import { emptyBaseCatalog, parseBaseCatalog, type BaseAppTemplate, type BaseCatalog } from '../shared/base-catalog'
import type { ApplicationRelocationResult, BaseCatalogSnapshot, LauncherExecutionResult } from '../shared/launcher-ipc'
import type { CommandImportDecision, CommandPackagePreview, ImportedPackageSnapshot, UserApplicationBinding, UserCommand, UserCommandDraft, UserCommandPatch } from '../shared/launcher-command'
import { parseCommandPackage, type CommandPackage } from '../shared/command-package'
import { buildCommandPackagePreview } from './command-package-importer'
import { createUserCommandStore } from './user-command-store'
import { buildFileLauncherCatalog, createIncrementalFileIndex, effectiveFileSearchRoots, isFileLauncherItem, scanFileIndex, type FileIndexEntry, type IncrementalFileIndex } from './file-index'
import { createGeneratedUrlRegistry } from './generated-url-registry'
import { createApplicationIndexWatcher, type ApplicationIndexWatcher, type ApplicationWatchChange } from './application-index-watcher'
import { prepareTrayIconForPlatform, resolveTrayIconPath, trayIconCandidates } from './tray-icon'
import { findCommandPackagePath } from './command-package-path'
import {
  normalizeSearchWindowHeight,
  SEARCH_WINDOW_EMPTY_HEIGHT,
  SEARCH_WINDOW_MAX_HEIGHT,
  SEARCH_WINDOW_WIDTH,
} from './search-window-size'

const SEARCH_WINDOW_SIZE = { width: SEARCH_WINDOW_WIDTH, height: SEARCH_WINDOW_MAX_HEIGHT }
const SETTINGS_WINDOW_SIZE = { width: 960, height: 700 }
const DEFAULT_HOTKEY = launcherHotkeyForPlatform(process.platform).accelerator
const EMPTY_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let searchWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let settingsStore: ReturnType<typeof createSettingsStore> | null = null
let userCommandStore: ReturnType<typeof createUserCommandStore> | null = null
let activityHistoryStore: ReturnType<typeof createActivityHistoryStore> | null = null
let userCommands: UserCommand[] = []
let importedPackages: Record<string, ImportedPackageSnapshot> = {}
let shortcutIndex: ShortcutIndex = createShortcutIndex([])
let indexedCatalog = buildIndexedApplicationCatalog([], 0)
let fileSearchCatalog = buildFileLauncherCatalog([], 0)
let baseCatalog: BaseCatalog = emptyBaseCatalog
let settings: LauncherSettings
let requestedHotkey: string = DEFAULT_HOTKEY
let activeHotkey: string | null = null
let hotkeyConflict = false
let hotkeyRecording = false
let rendererReady = false
let focusAfterLoad = false
let bootstrapped = false
let searchWindowBlurTimer: ReturnType<typeof setTimeout> | null = null
let clipboardHistoryTimer: ReturnType<typeof setInterval> | null = null
let lastObservedClipboardText = ''
let applicationRefreshPromise: Promise<{ count: number }> | null = null
let applicationRefreshQueued = false
let applicationIconHydrationGeneration = 0
const pendingApplicationIconHydrations = new Set<Promise<void>>()
let quitCleanupStarted = false
let applicationIndexCache: ReturnType<typeof createApplicationIndexCache> | null = null
let fileIndexRefreshPromise: Promise<void> | null = null
let fileIndexRefreshQueued = false
let fileIndex: IncrementalFileIndex | null = null
let applicationIndexWatcher: ApplicationIndexWatcher | null = null
let fileSearchWatcher: ApplicationIndexWatcher | null = null
let invalidApplicationBindingRefs = new Set<string>()
const generatedUrlRegistry = createGeneratedUrlRegistry()
let pendingCommandPackageFile: string | null = findCommandPackagePath(process.argv) ?? null
let searchWindowHeight = process.platform === 'darwin' ? SEARCH_WINDOW_EMPTY_HEIGHT : SEARCH_WINDOW_MAX_HEIGHT
const commandPackageSessions = new Map<string, { preview: CommandPackagePreview; snapshot: ImportedPackageSnapshot; commands: UserCommand[]; filePath: string }>()
const COMMAND_PACKAGE_MAX_BYTES = 256 * 1024
const COMMAND_PACKAGE_SESSION_TTL_MS = 5 * 60 * 1000

const shouldSimulateNativeLaunch = (): boolean => shouldSimulateOsOpen(process.env.QUICK_LAUNCHER_E2E, app.isPackaged)

function logDiagnostic(message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : error === undefined ? '' : String(error)
  process.stderr.write(`[launcher] ${message}${detail ? `: ${detail}` : ''}\n`)
}

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

function activityHistoryItems(): LauncherItem[] {
  if (!activityHistoryStore) return []
  return activityHistoryStore.get().filter((entry) => (
    entry.type === 'clipboard' ? settings.clipboardHistoryEnabled : settings.fileHistoryEnabled
  )).map((entry) => {
    const id = createHash('sha256').update(`${entry.type}\0${entry.value}`).digest('hex').slice(0, 16)
    const title = entry.type === 'clipboard'
      ? (entry.value.split(/\r?\n/u)[0]?.slice(0, 72) || '空文本')
      : (entry.value.split(/[\\/]/u).at(-1) || entry.value)
    return {
      id: `history:${entry.type}:${id}`,
      title,
      subtitle: entry.type === 'clipboard' ? '剪贴板历史 · Enter 复制' : entry.value,
      aliases: entry.type === 'clipboard' ? ['剪贴板历史', 'clipboard history'] : ['最近文件', 'recent files'],
      icon: entry.type === 'clipboard' ? 'clipboard' : 'folder',
      kind: 'history',
      action: entry.type === 'clipboard' ? { type: 'copy-text', text: entry.value } : { type: 'open-path', path: entry.value },
    }
  })
}

function refreshHistoryCatalog(): void {
  const items = indexedCatalog.payload.items.filter((item) => !item.id.startsWith('history:'))
  indexedCatalog = {
    ...indexedCatalog,
    payload: { ...indexedCatalog.payload, snapshotVersion: indexedCatalog.payload.snapshotVersion + 1, items: [...items, ...activityHistoryItems()] },
  }
  broadcastCatalog()
}

function parseHistoryType(value: unknown): ActivityHistoryType {
  if (value === 'clipboard' || value === 'file') return value
  throw new Error('INVALID_HISTORY_TYPE')
}

async function clearHistory(value: unknown): Promise<void> {
  if (!activityHistoryStore || typeof activityHistoryStore.clear !== 'function') throw new Error('HISTORY_UNAVAILABLE')
  await activityHistoryStore.clear(parseHistoryType(value))
  refreshHistoryCatalog()
}

async function recordActivity(type: ActivityHistoryType, value: string): Promise<void> {
  if (!activityHistoryStore || (type === 'clipboard' ? !settings.clipboardHistoryEnabled : !settings.fileHistoryEnabled)) return
  try {
    await activityHistoryStore.add(type, value)
    refreshHistoryCatalog()
  } catch {
    // History is best-effort and must never block the launcher action.
  }
}

async function captureClipboardHistory(): Promise<void> {
  if (!settings.clipboardHistoryEnabled) return
  const value = clipboard.readText()
  if (!value || value === lastObservedClipboardText) return
  lastObservedClipboardText = value
  await recordActivity('clipboard', value)
}

function configureClipboardHistoryMonitoring(): void {
  if (clipboardHistoryTimer) clearInterval(clipboardHistoryTimer)
  clipboardHistoryTimer = null
  lastObservedClipboardText = ''
  if (!settings.clipboardHistoryEnabled) return
  void captureClipboardHistory()
  clipboardHistoryTimer = setInterval(() => { void captureClipboardHistory() }, 1_500)
  clipboardHistoryTimer.unref()
}

function applyTheme(preference: ThemePreference): void {
  nativeTheme.themeSource = preference
  broadcastTheme()
}

function settingsSnapshot(): LauncherSettingsSnapshot {
  return {
    ...settings,
    searchEngine: { ...settings.searchEngine },
    activeHotkey,
    hotkeyConflict,
  }
}

function clearSearchWindowBlurTimer(): void {
  if (!searchWindowBlurTimer) return
  clearTimeout(searchWindowBlurTimer)
  searchWindowBlurTimer = null
}

const loadMacApplicationIcon = createSuccessfulIconLoader(async (path) => {
  const iconPaths = await findApplicationIconPaths(path)
  if (iconPaths.length === 0) return undefined

  return loadFirstMacIconData(
    iconPaths,
    join(app.getPath('userData'), 'icon-cache'),
    (renderablePath) => nativeImage.createFromPath(renderablePath),
  )
})

function applicationIconLoader(): ((path: string, options: { size: 'normal' }) => Promise<{ toDataURL: () => string }>) | undefined {
  if (process.platform === 'darwin') {
    if (typeof app.getFileIcon !== 'function') return loadMacApplicationIcon
    const systemIconLoader = createCoalescedIconLoader((path, options) => app.getFileIcon(path, options))
    return async (path, options) => {
      const bundledIcon = await loadMacApplicationIcon(path, options)
      if (bundledIcon.toDataURL()) return bundledIcon
      return systemIconLoader(path, options)
    }
  }
  if (typeof app.getFileIcon !== 'function') return undefined
  const platformIconLoader = createPlatformIconLoader(
    process.platform,
    (path, options) => app.getFileIcon(path, options),
    process.platform === 'win32' && typeof shell.readShortcutLink === 'function'
      ? (path) => shell.readShortcutLink(path)
      : undefined,
  )
  return platformIconLoader ? createCoalescedIconLoader(platformIconLoader) : undefined
}

function createSearchWindow(): BrowserWindow {
  if (searchWindow && !searchWindow.isDestroyed()) return searchWindow
  const window = new BrowserWindow({
    width: SEARCH_WINDOW_SIZE.width,
    height: searchWindowHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: process.platform !== 'darwin',
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const webContentsId = window.webContents.id
  searchWindow = window
  rendererReady = false
  window.on('closed', () => {
    clearSearchWindowBlurTimer()
    generatedUrlRegistry.removeWindow(webContentsId)
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
  void loadRenderer(window).catch((error: unknown) => logDiagnostic('search window load failed', error))
  return window
}

function createSettingsWindow(tutorial: boolean): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const currentUrl = typeof settingsWindow.webContents.getURL === 'function' ? settingsWindow.webContents.getURL() : ''
    let currentTutorial = false
    try {
      currentTutorial = new URL(currentUrl).searchParams.get('tutorial') === '1'
    } catch {
      currentTutorial = false
    }
    if (currentTutorial !== tutorial) {
      void loadRenderer(settingsWindow, { window: 'settings', tutorial: tutorial ? '1' : undefined }).catch((error: unknown) => logDiagnostic('settings reload failed', error))
    }
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
  const webContentsId = window.webContents.id
  settingsWindow = window
  window.on('closed', () => {
    generatedUrlRegistry.removeWindow(webContentsId)
    if (hotkeyRecording) {
      hotkeyRecording = false
      registerGlobalHotkey()
    }
    if (settingsWindow === window) settingsWindow = null
  })
  window.webContents.on('did-finish-load', () => {
    broadcastTheme()
    if (pendingCommandPackageFile) window.webContents.send(IPC_CHANNELS.commandPackagePending)
  })
  void loadRenderer(window, { window: 'settings', tutorial: tutorial ? '1' : undefined }).catch((error: unknown) => logDiagnostic('settings window load failed', error))
  return window
}

function requestRendererFocus(): void {
  clearSearchWindowBlurTimer()
  if (!searchWindow || searchWindow.isDestroyed()) return
  if (settingsWindow && !settingsWindow.isDestroyed() && typeof settingsWindow.isVisible === 'function' && settingsWindow.isVisible()) return
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
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.hide()
  const window = createSearchWindow()
  if (process.platform === 'darwin' && searchWindowHeight !== SEARCH_WINDOW_EMPTY_HEIGHT) {
    searchWindowHeight = SEARCH_WINDOW_EMPTY_HEIGHT
    window.setSize(SEARCH_WINDOW_WIDTH, searchWindowHeight, false)
  }
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const position = centerLauncherInWorkArea(display.workArea, { width: SEARCH_WINDOW_WIDTH, height: searchWindowHeight })
  window.setPosition(position.x, position.y, false)
  window.setAlwaysOnTop(true, 'floating')
  window.show()
  window.focus()
  requestRendererFocus()
  void captureClipboardHistory()
}

function hideLauncher(): void {
  if (searchWindow && !searchWindow.isDestroyed()) searchWindow.hide()
}

function openSettings(tutorial = false): void {
  clearSearchWindowBlurTimer()
  focusAfterLoad = false
  hideLauncher()
  const window = createSettingsWindow(tutorial)
  window.show()
  window.focus()
  hideLauncher()
}

function queueCommandPackageFile(filePath: string): boolean {
  if (!filePath.toLocaleLowerCase().endsWith('.quickcmd.json')) return false
  pendingCommandPackageFile = filePath
  if (bootstrapped) {
    const currentUrl = settingsWindow && !settingsWindow.isDestroyed() && typeof settingsWindow.webContents.getURL === 'function'
      ? settingsWindow.webContents.getURL()
      : ''
    let currentIsReadyNormalSettings = false
    try {
      currentIsReadyNormalSettings = Boolean(currentUrl) && new URL(currentUrl).searchParams.get('window') === 'settings' && new URL(currentUrl).searchParams.get('tutorial') !== '1'
    } catch {
      currentIsReadyNormalSettings = false
    }
    openSettings(false)
    if (currentIsReadyNormalSettings && settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send(IPC_CHANNELS.commandPackagePending)
  }
  return true
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

  const opened = process.platform === 'win32' && isWindowsShellAppPath(path)
    ? await spawnDetached('explorer.exe', [path])
    : await openPathSafely(path, (shortcutPath) => shell.openPath(shortcutPath), shouldSimulateNativeLaunch())
  if (!opened) return `${item.title} 打开失败，请刷新应用索引后重试`

  hideLauncher()
  return `${item.title} 已打开`
}

async function launchCommandApplication(commandId: string): Promise<string> {
  const command = userCommands.find((candidate) => (
    candidate.id === commandId && candidate.enabled && candidate.type === 'launch-app'
  ))
  if (!command) return '应用启动命令已失效，请在设置中检查'
  if (await isApplicationBindingInvalid(command.target)) return '应用路径已失效，请在命令包预览中重新定位'

  const targetId = indexedCatalog.templateTargets.get(command.target)
  if (!targetId) return '目标应用未识别，请先刷新应用索引或确认应用已安装'
  return launchIndexedApplication(targetId)
}

function enabledApplicationTemplates(): BaseAppTemplate[] {
  const disabledBaseAppIds = new Set(settings.disabledBaseAppIds ?? [])
  const baseApps = baseCatalog.apps.filter((app) => !disabledBaseAppIds.has(app.id))
  const packageApps = Object.values(importedPackages).flatMap((snapshot) => snapshot.apps.map((app) => ({
    ...app,
    id: `package:${snapshot.packageId}/${app.id}`,
  })))
  return [...baseApps, ...packageApps]
}

function applicationBindings(): Record<string, UserApplicationBinding> {
  if (typeof userCommandStore?.getAppBindings !== 'function') return {}
  const platform = process.platform === 'win32' ? 'windows' : 'macos'
  return Object.fromEntries(Object.entries(userCommandStore.getAppBindings()).filter(([appRef, binding]) => binding.platform === platform && !invalidApplicationBindingRefs.has(appRef)))
}

async function refreshApplicationBindingStatus(): Promise<void> {
  if (typeof userCommandStore?.getAppBindings !== 'function') {
    invalidApplicationBindingRefs = new Set()
    return
  }
  invalidApplicationBindingRefs = new Set(await findInvalidApplicationBindings(
    userCommandStore.getAppBindings(),
    process.platform,
    async (path) => stat(path),
    async (path) => access(path),
  ))
}

async function isApplicationBindingInvalid(appRef: string): Promise<boolean> {
  if (invalidApplicationBindingRefs.has(appRef)) return true
  if (typeof userCommandStore?.getAppBindings !== 'function') return false
  const binding = userCommandStore.getAppBindings()[appRef]
  if (!binding) return false
  const invalid = await findInvalidApplicationBindings(
    { [appRef]: binding },
    process.platform,
    async (path) => stat(path),
    async (path) => access(path),
  )
  if (invalid.has(appRef)) invalidApplicationBindingRefs.add(appRef)
  return invalid.has(appRef)
}

function availableCommandPackageAppRefs(commandPackage: CommandPackage): ReadonlySet<string> {
  const packageApps = commandPackage.apps.map((app) => ({
    ...app,
    id: `package:${commandPackage.packageId}/${app.id}`,
  }))
  const previewCatalog = buildIndexedApplicationCatalog(
    shortcutIndex.entries,
    indexedCatalog.payload.snapshotVersion,
    [...enabledApplicationTemplates(), ...packageApps],
    applicationBindings(),
  )
  return new Set(previewCatalog.templateTargets.keys())
}

function isSafeApplicationRef(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (/^[A-Za-z0-9._-]{1,96}$/u.test(value)) return !['__proto__', 'constructor', 'prototype'].includes(value.toLocaleLowerCase())
  const match = /^package:([A-Za-z0-9._-]{1,96})\/([A-Za-z0-9._-]{1,96})$/u.exec(value)
  return Boolean(match && !['__proto__', 'constructor', 'prototype'].includes(match[1]?.toLocaleLowerCase() ?? '') && !['__proto__', 'constructor', 'prototype'].includes(match[2]?.toLocaleLowerCase() ?? ''))
}

async function relocateApplication(appRefValue: unknown): Promise<ApplicationRelocationResult> {
  if (!isSafeApplicationRef(appRefValue) || !userCommandStore) throw new Error('INVALID_APP_REF')
  if (typeof dialog?.showOpenDialog !== 'function') throw new Error('BINDING_UNAVAILABLE')
  const platform = process.platform === 'win32' ? 'Windows' : 'macOS'
  const extensions = process.platform === 'win32' ? ['exe', 'lnk'] : ['app']
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: `${platform} 应用`, extensions }],
  }
  const result = settingsWindow && !settingsWindow.isDestroyed()
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return { status: 'cancelled', appRef: appRefValue }
  const selectedPath = result.filePaths[0]
  if (!selectedPath) throw new Error('BINDING_INVALID')
  let fileStat
  try {
    fileStat = await stat(selectedPath)
  } catch {
    throw new Error('BINDING_NOT_FOUND')
  }
  const binding = await validateApplicationBinding(
    process.platform,
    selectedPath,
    fileStat,
    async (path) => access(path),
  )
  await userCommandStore.setAppBinding(appRefValue, binding)
  invalidApplicationBindingRefs.delete(appRefValue)
  await refreshApplications()
  return { status: 'bound', appRef: appRefValue }
}

async function selectFileSearchRoot(): Promise<string | undefined> {
  if (typeof dialog?.showOpenDialog !== 'function') throw new Error('FILE_SEARCH_ROOT_UNAVAILABLE')
  const options: Electron.OpenDialogOptions = {
    properties: ['openDirectory'],
    title: '选择文件搜索目录',
  }
  const result = settingsWindow && !settingsWindow.isDestroyed()
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return undefined
  const selectedPath = result.filePaths[0]
  if (!selectedPath) throw new Error('FILE_SEARCH_ROOT_INVALID')
  const roots = normalizeFileSearchRoots([selectedPath])
  if (roots.length !== 1) throw new Error('FILE_SEARCH_ROOT_INVALID')
  try {
    if (!(await stat(selectedPath)).isDirectory()) throw new Error('FILE_SEARCH_ROOT_INVALID')
  } catch (error) {
    if (error instanceof Error && error.message === 'FILE_SEARCH_ROOT_INVALID') throw error
    throw new Error('FILE_SEARCH_ROOT_NOT_FOUND')
  }
  return roots[0]
}

async function launchIndexedPath(targetId: string): Promise<string> {
  const path = indexedCatalog.targets.get(targetId)
  const item = indexedCatalog.payload.items.find((candidate) => (
    candidate.action.type === 'open-indexed-path' && candidate.action.targetId === targetId
  ))
  if (!path || !item) return '文件不存在或索引已失效，请稍后刷新索引'

  const opened = await openPathSafely(path, (targetPath) => shell.openPath(targetPath), shouldSimulateNativeLaunch())
  if (!opened) return `${item.title} 打开失败，请检查文件是否仍然存在`

  void recordActivity('file', path)
  hideLauncher()
  return `${item.title} 已打开`
}

function resolvedUserPath(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

async function spawnDetached(file: string, args: readonly string[]): Promise<boolean> {
  if (shouldSimulateNativeLaunch()) return true
  return new Promise((resolve) => {
    try {
      const child = spawn(file, [...args], { detached: true, stdio: 'ignore' })
      const complete = (opened: boolean): void => {
        child.removeAllListeners()
        if (opened) child.unref()
        resolve(opened)
      }
      child.once('spawn', () => complete(true))
      child.once('error', () => complete(false))
    } catch {
      resolve(false)
    }
  })
}

async function executeProductivityPlan(plan: ProductivityExecutionPlan): Promise<boolean> {
  if (plan.kind === 'external') {
    return openExternalSafely(plan.url, (url) => shell.openExternal(url), shouldSimulateNativeLaunch())
  }
  return spawnDetached(plan.file, plan.args)
}

function browserOpenFailure(url: string, webContentsId: number): LauncherExecutionResult {
  return {
    message: '浏览器打开失败，请检查默认浏览器设置',
    copyToken: generatedUrlRegistry.issue(url, webContentsId),
  }
}

async function executeParsedAction(action: ParsedExecutableAction, webContentsId: number): Promise<LauncherExecutionResult> {
  if (action.kind === 'application') return launchApplication(action.targetId)
  if (action.kind === 'indexed-application') return launchIndexedApplication(action.targetId)
  if (action.kind === 'command-launch-app') return launchCommandApplication(action.commandId)
  if (action.kind === 'indexed-path') return launchIndexedPath(action.targetId)
  if (action.kind === 'settings') {
    openSettings(false)
    return '正在打开设置'
  }
  if (action.kind === 'tutorial') {
    openSettings(true)
    return '正在打开教程'
  }
  if (action.kind === 'open-url') {
    const opened = await openExternalSafely(action.url, (url) => shell.openExternal(url), shouldSimulateNativeLaunch())
    if (opened) {
      hideLauncher()
      return '正在打开网页'
    }
    return browserOpenFailure(action.url, webContentsId)
  }
  if (action.kind === 'site-search') {
    const opened = await openExternalSafely(
      buildSiteSearchUrl(action.provider, action.query),
      (url) => shell.openExternal(url),
      shouldSimulateNativeLaunch(),
    )
    if (opened) {
      hideLauncher()
      return `正在打开抖音搜索“${action.query}”`
    }
    return browserOpenFailure(buildSiteSearchUrl(action.provider, action.query), webContentsId)
  }
  if (action.kind === 'command-site-search') {
    const url = buildUserCommandSiteSearchUrl(userCommands, action.commandId, action.query)
    if (!url) return '站点搜索命令已失效，请在设置中检查模板'
    const opened = await openExternalSafely(
      url,
      (externalUrl) => shell.openExternal(externalUrl),
      shouldSimulateNativeLaunch(),
    )
    if (opened) {
      hideLauncher()
      const command = userCommands.find((candidate) => candidate.id === action.commandId)
      return `正在打开${command?.title ?? '站点'}搜索“${action.query}”`
    }
    return browserOpenFailure(url, webContentsId)
  }
  if (action.kind === 'open-path') {
    const path = resolvedUserPath(action.path)
    const opened = await openPathSafely(path, (targetPath) => shell.openPath(targetPath), shouldSimulateNativeLaunch())
    if (!opened) return '文件或文件夹打开失败，请检查路径是否存在'
    void recordActivity('file', path)
    hideLauncher()
    return '已打开文件或文件夹'
  }
  if (action.kind === 'copy-text') {
    clipboard.writeText(action.text)
    lastObservedClipboardText = action.text
    void recordActivity('clipboard', action.text)
    return '结果已复制到剪贴板'
  }
  if (action.kind === 'clipboard-transform') {
    try {
      const source = action.input ?? clipboard.readText()
      if (!source) return '剪贴板中没有可处理的文本'
      const result = transformClipboardText(action.operation, source)
      clipboard.writeText(result)
      lastObservedClipboardText = result
      void recordActivity('clipboard', result)
      return '处理结果已复制到剪贴板'
    } catch {
      return '处理失败，请检查输入格式'
    }
  }
  if (action.kind === 'application-argument') {
    const path = resolvedUserPath(action.path)
    if (!shouldSimulateNativeLaunch()) {
      try {
        await access(path)
      } catch {
        return '目标路径不存在'
      }
    }
    const plan = applicationArgumentPlan(process.platform, action.application, path)
    if (!plan || !await executeProductivityPlan(plan)) return '应用启动失败，请确认应用已安装'
    void recordActivity('file', path)
    hideLauncher()
    return action.application === 'vscode' ? '正在使用 VS Code 打开路径' : '正在终端中打开路径'
  }
  if (action.kind === 'system-action') {
    const plan = systemActionPlan(process.platform, action.operation)
    if (!plan || !await executeProductivityPlan(plan)) return '系统操作失败或当前平台不支持'
    hideLauncher()
    return '系统操作已执行'
  }
  if (action.kind !== 'web-search') return '动作不可用'
  const opened = await openExternalSafely(
    buildSearchUrl(settings.searchEngine, action.query),
    (url) => shell.openExternal(url),
    shouldSimulateNativeLaunch(),
  )
  if (opened) {
    hideLauncher()
    return action.query ? `正在搜索“${action.query}”` : '正在打开搜索引擎'
  }
  return browserOpenFailure(buildSearchUrl(settings.searchEngine, action.query), webContentsId)
}

async function executeItem(value: unknown, webContentsId: number): Promise<LauncherExecutionResult> {
  const action = parseExecutableAction(value)
  if (!action) return '动作无效'
  return executeParsedAction(action, webContentsId)
}

function copyGeneratedUrl(value: unknown, webContentsId: number): string {
  if (typeof value !== 'string') return '网址复制失败，请重新搜索'
  const result = generatedUrlRegistry.consume(value, webContentsId)
  if (!result.ok) return result.reason === 'expired' ? '网址已过期，请重新搜索' : '网址复制失败，请重新搜索'
  try {
    clipboard.writeText(result.url)
    return '网址已复制'
  } catch {
    return '复制网址失败，请稍后重试'
  }
}

async function publishApplicationRefresh(
  scannedApplications: ShortcutIndex,
  snapshotVersion: number,
  persistCache: boolean,
): Promise<{ count: number }> {
  const enabledBaseApps = enabledApplicationTemplates()
  // Identity metadata is needed for settings icons even when search aliases are disabled.
  const discoveryApps = [...new Map([...baseCatalog.apps, ...enabledBaseApps].map((app) => [app.id, app])).values()]
  const enrichmentStarted = Date.now()
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application metadata: start (${scannedApplications.entries.length} entries)`)
  shortcutIndex = await enrichMacApplicationIndex(await enrichWindowsShortcutIndex(scannedApplications, discoveryApps), discoveryApps)
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application metadata: finished in ${Date.now() - enrichmentStarted}ms`)
  const indexed = buildIndexedApplicationCatalog(shortcutIndex.entries, snapshotVersion, enabledBaseApps, applicationBindings())
  const iconHydrationGeneration = ++applicationIconHydrationGeneration
  publishIndexedCatalog(indexed.payload, indexed.targets, indexed.templateTargets)
  const iconLoader = applicationIconLoader()
  if (iconLoader) {
    const hydrationStarted = Date.now()
    if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application icons: start (generation ${iconHydrationGeneration}, ${indexed.payload.items.length} items)`)
    const hydration = hydrateApplicationIconsInBackground(
      indexed.payload,
      indexed.targets,
      iconLoader,
      (hydratedCatalog) => {
        if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application icons: finished (generation ${iconHydrationGeneration}) in ${Date.now() - hydrationStarted}ms`)
        if (iconHydrationGeneration !== applicationIconHydrationGeneration) return
        publishIndexedCatalog(hydratedCatalog, indexed.targets, indexed.templateTargets)
      },
      (error) => logDiagnostic('application icon hydration failed', error),
    )
    pendingApplicationIconHydrations.add(hydration)
    void hydration.then(
      () => pendingApplicationIconHydrations.delete(hydration),
      () => pendingApplicationIconHydrations.delete(hydration),
    )
  }
  if (persistCache && applicationIndexCache) {
    try {
      await applicationIndexCache.save(shortcutIndex.entries, snapshotVersion)
    } catch (error) {
      logDiagnostic('application index cache unavailable', error)
    }
  }
  void refreshFileSearchIndex().catch(() => undefined)
  return { count: indexedCatalog.payload.items.length }
}

async function waitForApplicationIconHydrations(): Promise<void> {
  applicationIconHydrationGeneration += 1
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`quit: waiting for ${pendingApplicationIconHydrations.size} icon batches`)
  while (pendingApplicationIconHydrations.size > 0) {
    await Promise.allSettled([...pendingApplicationIconHydrations])
  }
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic('quit: icon batches settled')
}

function commandCatalogItems(): LauncherItem[] {
  const commandItems: LauncherItem[] = userCommands.filter((command) => command.enabled).map((command) => {
    const action: LauncherItem['action'] = command.type === 'open-url'
      ? { type: 'open-url', url: command.target }
      : command.type === 'site-search'
        ? { type: 'command-site-search', commandId: command.id, query: '' }
        : command.type === 'launch-app'
          ? { type: 'command-launch-app', commandId: command.id }
          : { type: 'web-search', query: command.target }
    return {
      id: `command:${command.id}`,
      title: command.title,
      subtitle: command.type === 'open-url' ? '固定网址' : command.type === 'site-search' ? '站点搜索' : command.type === 'launch-app' ? '启动应用' : '网页搜索',
      aliases: [command.keyword],
      icon: command.type === 'launch-app' ? 'code' : 'globe',
      kind: 'command',
      action,
    }
  })
  return commandItems
}

function publishIndexedCatalog(
  applicationPayload: LauncherCatalogPayload,
  applicationTargets: ReadonlyMap<string, string>,
  templateTargets: ReadonlyMap<string, string>,
): void {
  const commandItems = commandCatalogItems()
  indexedCatalog = {
    payload: { ...applicationPayload, items: [...applicationPayload.items, ...fileSearchCatalog.payload.items, ...commandItems, ...activityHistoryItems()] },
    targets: new Map([...applicationTargets, ...fileSearchCatalog.targets]),
    templateTargets,
  }
  broadcastCatalog()
}

async function performApplicationRefresh(): Promise<{ count: number }> {
  const refreshStarted = Date.now()
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic('application refresh: start')
  await refreshApplicationBindingStatus()
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic('application discovery: start')
  const scannedApplications = await scanPlatformApplications(process.platform, app.getPath('desktop'))
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application discovery: finished (${scannedApplications.entries.length} entries) in ${Date.now() - refreshStarted}ms`)
  const result = await publishApplicationRefresh(scannedApplications, indexedCatalog.payload.snapshotVersion + 1, true)
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`application refresh: finished in ${Date.now() - refreshStarted}ms`)
  return result
}

function refreshFileSearchIndex(): Promise<void> {
  if (fileIndexRefreshPromise) {
    fileIndexRefreshQueued = true
    const runningRefresh = fileIndexRefreshPromise
    return runningRefresh.then(() => {
      if (!fileIndexRefreshQueued) return
      fileIndexRefreshQueued = false
      return refreshFileSearchIndex()
    }, (error: unknown) => {
      fileIndexRefreshQueued = false
      throw error
    })
  }
  const effectiveRoots = effectiveFileSearchRoots(settings.fileSearchRoots)
  if (!fileIndex) fileIndex = createIncrementalFileIndex(effectiveRoots)
  const refreshIndex = fileIndex
  const refresh = scanFileIndex(effectiveRoots).then((entries) => {
    if (fileIndex !== refreshIndex) return
    refreshIndex.setEntries(entries)
    publishFileSearchEntries(entries)
  })
  fileIndexRefreshPromise = refresh
  refresh.then(
    () => { if (fileIndexRefreshPromise === refresh) fileIndexRefreshPromise = null },
    () => { if (fileIndexRefreshPromise === refresh) fileIndexRefreshPromise = null },
  )
  return refresh
}

function publishFileSearchEntries(entries: readonly FileIndexEntry[]): void {
  fileSearchCatalog = buildFileLauncherCatalog(entries, indexedCatalog.payload.snapshotVersion + 1)
  const items = indexedCatalog.payload.items.filter((item) => !isFileLauncherItem(item))
  const targets = new Map([...indexedCatalog.targets].filter(([targetId]) => !targetId.startsWith('path:')))
  for (const [targetId, path] of fileSearchCatalog.targets) targets.set(targetId, path)
  indexedCatalog = {
    payload: {
      ...indexedCatalog.payload,
      snapshotVersion: indexedCatalog.payload.snapshotVersion + 1,
      items: [...items, ...fileSearchCatalog.payload.items],
    },
    targets,
    templateTargets: indexedCatalog.templateTargets,
  }
  broadcastCatalog()
}

async function applyFileSearchChanges(changes: readonly ApplicationWatchChange[]): Promise<void> {
  if (changes.length === 0) return
  if (fileIndexRefreshPromise) {
    await refreshFileSearchIndex()
    return
  }
  if (!fileIndex) {
    await refreshFileSearchIndex()
    return
  }

  let changed = false
  for (const change of changes) {
    const result = await fileIndex.applyChange(change)
    if (result === 'fallback') {
      await refreshFileSearchIndex()
      return
    }
    changed ||= result === 'changed'
  }
  if (changed) publishFileSearchEntries(fileIndex.entries())
}

function configureFileSearchWatcher(): void {
  fileSearchWatcher?.close()
  const roots = effectiveFileSearchRoots(settings.fileSearchRoots)
  fileIndex = createIncrementalFileIndex(roots)
  fileSearchWatcher = createApplicationIndexWatcher(
    roots,
    (changes) => { void applyFileSearchChanges(changes).catch((error) => logDiagnostic('file index refresh after filesystem change failed', error)) },
  )
}

async function enrichWindowsShortcutIndex(index: ShortcutIndex, baseApps: readonly BaseAppTemplate[]): Promise<ShortcutIndex> {
  if (process.platform !== 'win32') return index
  const templateExecutableNames = new Set(baseApps.flatMap((app) => app.platforms.windows?.executables ?? []).map((name) => name.toLocaleLowerCase()))
  const publisherPromises = new Map<string, Promise<string | undefined>>()
  const readPublisher = (path: string): Promise<string | undefined> => {
    const key = path.toLocaleLowerCase()
    const existing = publisherPromises.get(key)
    if (existing) return existing
    const promise = readWindowsExecutablePublisher(path)
    publisherPromises.set(key, promise)
    return promise
  }

  const entries = await Promise.all(index.entries.map(async (entry) => {
    let details: Record<string, unknown> = {}
    if (/\.lnk$/iu.test(entry.path) && typeof shell.readShortcutLink === 'function') {
      try { details = shell.readShortcutLink(entry.path) as unknown as Record<string, unknown> } catch { details = {} }
    }
    const target = typeof details.target === 'string' ? details.target.trim() : undefined
    const executableName = target ? shortcutExecutableName(target) : entry.metadata?.executableName
    const directAppUserModelId = typeof details.appUserModelId === 'string' ? details.appUserModelId.trim() : undefined
    const args = typeof details.args === 'string' ? details.args : ''
    const appUserModelId = directAppUserModelId || /shell:AppsFolder[\\/]([A-Za-z0-9._-]+![A-Za-z0-9._-]+)/iu.exec(`${target ?? ''} ${args}`)?.[1]
    let publisher = typeof details.publisher === 'string' ? details.publisher.trim() : entry.metadata?.publisher
    const executablePath = target && /^(?:[A-Za-z]:[\\/]|\\\\).+\.exe$/iu.test(target)
      ? target
      : /^(?:[A-Za-z]:[\\/]|\\\\).+\.exe$/iu.test(entry.path) ? entry.path : undefined
    if (!publisher && executableName && executablePath && templateExecutableNames.has(executableName.toLocaleLowerCase())) {
      publisher = await readPublisher(executablePath)
    }
    if (!executableName && !appUserModelId && !publisher) return entry
    return {
      ...entry,
      metadata: {
        platform: 'windows' as const,
        ...(executableName ? { executableName } : {}),
        ...(publisher ? { publisher } : {}),
        ...(appUserModelId ? { appUserModelId } : {}),
      },
    }
  }))
  return createShortcutIndex(entries)
}

async function enrichMacApplicationIndex(index: ShortcutIndex, baseApps: readonly BaseAppTemplate[]): Promise<ShortcutIndex> {
  if (process.platform !== 'darwin') return index
  const bundleIds = baseApps.flatMap((app) => app.platforms.macos?.bundleIds ?? [])
  if (bundleIds.length === 0) return index
  const matches = await findMacApplicationsByBundleIds(bundleIds)
  const entries = index.entries.map((entry) => {
    const bundleId = matches.get(entry.path)
    return bundleId ? { ...entry, metadata: { platform: 'macos' as const, bundleId } } : entry
  })
  return createShortcutIndex(entries)
}

async function loadBaseCatalog(): Promise<BaseCatalog> {
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const candidates = [
    typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'catalog', 'base.json') : undefined,
    join(appPath, 'resources', 'catalog', 'base.json'),
    join(__dirname, '../../resources/catalog/base.json'),
  ].filter((path): path is string => Boolean(path))
  for (const path of candidates) {
    try {
      const parsed = parseBaseCatalog(JSON.parse(await readFile(path, 'utf8')) as unknown)
      if (parsed) return parsed
    } catch {
      // A missing or invalid optional catalog should not prevent the launcher from starting.
    }
  }
  return emptyBaseCatalog
}

function parseCommandImportDecisions(value: unknown): CommandImportDecision[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('INVALID_IMPORT')
  const decisions: CommandImportDecision[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) throw new Error('INVALID_IMPORT')
    const record = candidate as Record<string, unknown>
    if (Object.keys(record).some((key) => !['incomingId', 'action', 'keyword'].includes(key)) || typeof record.incomingId !== 'string' || !/^[A-Za-z0-9._-]{1,96}$/u.test(record.incomingId) || typeof record.action !== 'string' || !['replace', 'rename', 'skip'].includes(record.action) || seen.has(record.incomingId)) throw new Error('INVALID_IMPORT')
    if (record.action === 'rename' && (typeof record.keyword !== 'string' || !/^[\p{L}\p{N}\p{Script=Han}_-]{1,32}$/u.test(record.keyword))) throw new Error('INVALID_IMPORT')
    if (record.action !== 'rename' && record.keyword !== undefined) throw new Error('INVALID_IMPORT')
    seen.add(record.incomingId)
    decisions.push({
      incomingId: record.incomingId,
      action: record.action as CommandImportDecision['action'],
      ...(typeof record.keyword === 'string' ? { keyword: record.keyword } : {}),
    })
  }
  return decisions
}

async function previewCommandPackageFile(filePath: string): Promise<CommandPackagePreview> {
  if (!filePath.toLocaleLowerCase().endsWith('.quickcmd.json')) throw new Error('INVALID_PACKAGE_FILE')
  const fileStat = await stat(filePath)
  if (!fileStat.isFile() || fileStat.size > COMMAND_PACKAGE_MAX_BYTES) throw new Error('PACKAGE_TOO_LARGE')
  const raw = await readFile(filePath)
  const commandPackage = parseCommandPackage(JSON.parse(raw.toString('utf8')) as unknown)
  if (!commandPackage) throw new Error('INVALID_PACKAGE')
  const packageDigest = createHash('sha256').update(raw).digest('hex')
  const previewId = randomUUID()
  const previousPackage = typeof userCommandStore?.getImportedPackages === 'function'
    ? userCommandStore.getImportedPackages()[commandPackage.packageId]
    : undefined
  const preview = buildCommandPackagePreview(
    commandPackage,
    packageDigest,
    userCommands,
    previewId,
    userCommandStore?.getVersion() ?? 0,
    new Date(Date.now() + COMMAND_PACKAGE_SESSION_TTL_MS).toISOString(),
    previousPackage,
    new Set(baseCatalog.apps.map((baseApp) => baseApp.id)),
    availableCommandPackageAppRefs(commandPackage),
  )
  commandPackageSessions.set(previewId, {
    preview,
    snapshot: { ...commandPackage, digest: packageDigest },
    commands: preview.commands.map((command) => ({ ...command })),
    filePath,
  })
  return preview
}

async function selectCommandPackage(): Promise<CommandPackagePreview | undefined> {
  if (typeof dialog?.showOpenDialog !== 'function') throw new Error('IMPORT_UNAVAILABLE')
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'Quick Command Package', extensions: ['quickcmd.json'] }],
  }
  const result = settingsWindow && !settingsWindow.isDestroyed()
    ? await dialog.showOpenDialog(settingsWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return undefined
  const filePath = result.filePaths[0]
  if (!filePath) throw new Error('INVALID_PACKAGE_FILE')
  return previewCommandPackageFile(filePath)
}

async function consumePendingCommandPackage(): Promise<CommandPackagePreview | undefined> {
  if (!pendingCommandPackageFile) return undefined
  const filePath = pendingCommandPackageFile
  pendingCommandPackageFile = null
  return previewCommandPackageFile(filePath)
}

async function commitCommandPackage(previewId: unknown, decisionsValue: unknown): Promise<UserCommand[]> {
  if (typeof previewId !== 'string') throw new Error('INVALID_IMPORT')
  const session = commandPackageSessions.get(previewId)
  commandPackageSessions.delete(previewId)
  if (!session || Date.parse(session.preview.expiresAt) <= Date.now() || !userCommandStore) throw new Error('IMPORT_EXPIRED')
  if (userCommandStore.getVersion() !== session.preview.expectedConfigVersion) throw new Error('CONFIG_CONFLICT')
  try {
    const fileStat = await stat(session.filePath)
    if (!fileStat.isFile() || fileStat.size > COMMAND_PACKAGE_MAX_BYTES) throw new Error('PACKAGE_CHANGED')
    const currentDigest = createHash('sha256').update(await readFile(session.filePath)).digest('hex')
    if (currentDigest !== session.preview.packageDigest) throw new Error('PACKAGE_CHANGED')
  } catch (error) {
    if (error instanceof Error && error.message === 'PACKAGE_CHANGED') throw error
    throw new Error('PACKAGE_CHANGED')
  }
  if (session.preview.packageStatus === 'already-imported') throw new Error('PACKAGE_ALREADY_IMPORTED')
  if (session.preview.packageStatus === 'downgrade') throw new Error('PACKAGE_VERSION_OLD')
  if (session.preview.packageStatus === 'version-conflict') throw new Error('PACKAGE_VERSION_CONFLICT')
  const decisions = parseCommandImportDecisions(decisionsValue)
  const imported = await userCommandStore.importPackage(session.snapshot, session.commands, decisions)
  userCommands = userCommandStore.get()
  importedPackages = typeof userCommandStore.getImportedPackages === 'function' ? userCommandStore.getImportedPackages() : {}
  await refreshApplications()
  return imported
}

function refreshApplications(): Promise<{ count: number }> {
  if (applicationRefreshPromise) {
    applicationRefreshQueued = true
    const runningRefresh = applicationRefreshPromise
    return runningRefresh.then((result) => {
      if (!applicationRefreshQueued) return result
      applicationRefreshQueued = false
      return refreshApplications()
    }, (error: unknown) => {
      applicationRefreshQueued = false
      throw error
    })
  }
  const refresh = performApplicationRefresh()
  applicationRefreshPromise = refresh
  refresh.then(
    () => { if (applicationRefreshPromise === refresh) applicationRefreshPromise = null },
    () => { if (applicationRefreshPromise === refresh) applicationRefreshPromise = null },
  )
  return refresh
}

function configureAutostart(enabled: boolean): AutostartResult {
  const result = configureAutostartAdapter(enabled, {
    platform: process.platform,
    packaged: app.isPackaged,
    ...(typeof app.setLoginItemSettings === 'function' ? { setLoginItemSettings: (value: boolean) => app.setLoginItemSettings({ openAtLogin: value }) } : {}),
    ...(typeof app.getLoginItemSettings === 'function' ? {
      getLoginItemSettings: () => {
        const snapshot = app.getLoginItemSettings()
        return { openAtLogin: snapshot.openAtLogin, status: snapshot.status }
      },
    } : {}),
  })
  if (result.ok) return result
  logDiagnostic(`unable to configure autostart (${result.reason})`)
  return result
}

function autostartError(result: AutostartResult): Error {
  if (result.ok) return new Error('AUTOSTART_FAILED')
  return new Error(result.reason === 'approval-required' ? 'AUTOSTART_APPROVAL_REQUIRED' : result.reason === 'permission-denied' ? 'AUTOSTART_PERMISSION_DENIED' : 'AUTOSTART_FAILED')
}

function parseSettingsPatch(value: unknown): LauncherSettingsPatch {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_SETTINGS')
  const record = value as Record<string, unknown>
  const patch: LauncherSettingsPatch = {}
  if (record.hotkey !== undefined) {
    if (!isValidLauncherHotkey(record.hotkey)) throw new Error('INVALID_HOTKEY')
    patch.hotkey = record.hotkey
  }
  if (record.onboardingCompleted !== undefined) {
    if (typeof record.onboardingCompleted !== 'boolean') throw new Error('INVALID_ONBOARDING')
    patch.onboardingCompleted = record.onboardingCompleted
  }
  if (record.autostart !== undefined) {
    if (typeof record.autostart !== 'boolean') throw new Error('INVALID_AUTOSTART')
    patch.autostart = record.autostart
  }
  if (record.showRecent !== undefined) {
    if (typeof record.showRecent !== 'boolean') throw new Error('INVALID_SHOW_RECENT')
    patch.showRecent = record.showRecent
  }
  if (record.clipboardHistoryEnabled !== undefined) {
    if (typeof record.clipboardHistoryEnabled !== 'boolean') throw new Error('INVALID_CLIPBOARD_HISTORY')
    patch.clipboardHistoryEnabled = record.clipboardHistoryEnabled
  }
  if (record.fileHistoryEnabled !== undefined) {
    if (typeof record.fileHistoryEnabled !== 'boolean') throw new Error('INVALID_FILE_HISTORY')
    patch.fileHistoryEnabled = record.fileHistoryEnabled
  }
  if (record.fileSearchRoots !== undefined) {
    if (!Array.isArray(record.fileSearchRoots) || record.fileSearchRoots.length > 12 || record.fileSearchRoots.some((root) => typeof root !== 'string')) throw new Error('INVALID_FILE_SEARCH_ROOTS')
    const roots = normalizeFileSearchRoots(record.fileSearchRoots)
    if (roots.length !== record.fileSearchRoots.length) throw new Error('INVALID_FILE_SEARCH_ROOTS')
    patch.fileSearchRoots = roots
  }
  if (record.disabledBaseAppIds !== undefined) {
    if (!Array.isArray(record.disabledBaseAppIds) || record.disabledBaseAppIds.length > 256) throw new Error('INVALID_BASE_APP_IDS')
    const ids = record.disabledBaseAppIds.filter((id): id is string => typeof id === 'string')
    if (ids.length !== record.disabledBaseAppIds.length || ids.some((id) => !/^[A-Za-z0-9._-]{1,96}$/u.test(id))) throw new Error('INVALID_BASE_APP_IDS')
    patch.disabledBaseAppIds = [...new Set(ids)]
  }
  if (record.theme !== undefined) {
    const preference = parseThemePreference(record.theme)
    if (!preference) throw new Error('INVALID_THEME')
    patch.theme = preference
  }
  if (record.searchEngine !== undefined) {
    if (typeof record.searchEngine !== 'object' || record.searchEngine === null) throw new Error('INVALID_SEARCH_ENGINE')
    const engine = record.searchEngine as Record<string, unknown>
    if (engine.kind === 'bing' || engine.kind === 'baidu' || engine.kind === 'google') patch.searchEngine = { kind: engine.kind }
    else if (engine.kind === 'custom' && typeof engine.template === 'string') {
      const normalized = normalizeSearchEngine(engine)
      if (normalized.kind !== 'custom') throw new Error('INVALID_SEARCH_ENGINE')
      patch.searchEngine = normalized
    }
    else throw new Error('INVALID_SEARCH_ENGINE')
  }
  return patch
}

async function updateSettings(patch: LauncherSettingsPatch): Promise<LauncherSettingsSnapshot> {
  if (!settingsStore) throw new Error('SETTINGS_UNAVAILABLE')
  const previousSettings = settings
  const previousHotkey = requestedHotkey
  const previousConflict = hotkeyConflict
  const previousActive = activeHotkey
  const restoreHotkey = (): void => {
    requestedHotkey = previousHotkey
    activeHotkey = previousActive
    hotkeyConflict = previousConflict
    registerGlobalHotkey()
  }
  if (patch.hotkey !== undefined && patch.hotkey !== requestedHotkey) {
    requestedHotkey = patch.hotkey
    registerGlobalHotkey()
    if (hotkeyConflict) {
      restoreHotkey()
      throw new Error('HOTKEY_CONFLICT')
    }
  }
  const autostartResult = patch.autostart === undefined ? { ok: true as const } : configureAutostart(patch.autostart)
  if (!autostartResult.ok) {
    restoreHotkey()
    if (patch.autostart !== undefined && patch.autostart !== previousSettings.autostart) configureAutostart(previousSettings.autostart)
    throw autostartError(autostartResult)
  }
  try {
    settings = await settingsStore.update(patch)
  } catch (error) {
    restoreHotkey()
    if (patch.autostart !== undefined && patch.autostart !== previousSettings.autostart) configureAutostart(previousSettings.autostart)
    throw error
  }
  if (patch.theme !== undefined) applyTheme(settings.theme)
  if (patch.clipboardHistoryEnabled !== undefined || patch.fileHistoryEnabled !== undefined) {
    refreshHistoryCatalog()
    if (patch.clipboardHistoryEnabled !== undefined) configureClipboardHistoryMonitoring()
  }
  if (patch.disabledBaseAppIds !== undefined) void refreshApplications().catch(() => undefined)
  if (patch.fileSearchRoots !== undefined) {
    configureFileSearchWatcher()
    void refreshFileSearchIndex().catch(() => undefined)
  }
  return settingsSnapshot()
}

function baseCatalogSnapshot(): BaseCatalogSnapshot {
  const knownIds = new Set(baseCatalog.apps.map((app) => app.id))
  const disabledBaseAppIds = settings.disabledBaseAppIds ?? []
  return {
    catalogVersion: baseCatalog.catalogVersion,
    apps: withBaseTemplateIcons(baseCatalog.apps, shortcutIndex.entries, indexedCatalog.payload, applicationBindings()).map((app) => ({
      ...app,
      defaultAliases: [...app.defaultAliases],
      platforms: {
        ...(app.platforms.windows ? { windows: { ...app.platforms.windows } } : {}),
        ...(app.platforms.macos ? { macos: { bundleIds: [...app.platforms.macos.bundleIds] } } : {}),
      },
    })),
    disabledAppIds: disabledBaseAppIds.filter((id) => knownIds.has(id)),
  }
}

async function setBaseAppEnabled(id: unknown, enabled: unknown): Promise<BaseCatalogSnapshot> {
  if (typeof id !== 'string' || typeof enabled !== 'boolean') throw new Error('INVALID_BASE_APP')
  if (!baseCatalog.apps.some((app) => app.id === id)) throw new Error('BASE_APP_NOT_FOUND')
  const disabled = new Set(settings.disabledBaseAppIds ?? [])
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  await updateSettings({ disabledBaseAppIds: [...disabled] })
  return baseCatalogSnapshot()
}

function registerIpc(): void {
  ipcMainHandle(IPC_CHANNELS.openSettings, async () => openSettings(false))
  ipcMainHandle(IPC_CHANNELS.openTutorial, async () => openSettings(true))
  ipcMainHandle(IPC_CHANNELS.hide, async () => hideLauncher())
  ipcMainHandle(IPC_CHANNELS.resizeSearchWindow, async (value: unknown) => {
    if (process.platform !== 'darwin' || !searchWindow || searchWindow.isDestroyed()) return
    const height = normalizeSearchWindowHeight(value)
    if (height === undefined || height === searchWindowHeight) return
    searchWindowHeight = height
    searchWindow.setSize(SEARCH_WINDOW_WIDTH, height, false)
  })
  ipcMainHandle(IPC_CHANNELS.getTheme, async () => themePayload())
  ipcMainHandle(IPC_CHANNELS.setTheme, async (value: unknown) => {
    const preference = parseThemePreference(value)
    if (!preference || !settingsStore) throw new Error('INVALID_THEME')
    settings = await settingsStore.update({ theme: preference })
    applyTheme(preference)
  })
  ipcMainHandle(IPC_CHANNELS.getSettings, async () => settingsSnapshot())
  ipcMainHandle(IPC_CHANNELS.clearHistory, async (value: unknown) => clearHistory(value))
  ipcMainHandle(IPC_CHANNELS.updateSettings, async (value: unknown) => updateSettings(parseSettingsPatch(value)))
  ipcMainHandle(IPC_CHANNELS.setHotkeyRecording, async (value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('INVALID_HOTKEY_RECORDING')
    hotkeyRecording = value
    registerGlobalHotkey()
  })
  ipcMainHandle(IPC_CHANNELS.getBaseCatalog, async () => baseCatalogSnapshot())
  ipcMainHandle(IPC_CHANNELS.setBaseAppEnabled, async (id: unknown, enabled: unknown) => setBaseAppEnabled(id, enabled))
  ipcMainHandle(IPC_CHANNELS.relocateApplication, async (appRef: unknown) => relocateApplication(appRef))
  ipcMainHandle(IPC_CHANNELS.selectFileSearchRoot, async () => selectFileSearchRoot())
  ipcMainHandle(IPC_CHANNELS.selectCommandPackage, async () => selectCommandPackage())
  ipcMainHandle(IPC_CHANNELS.consumePendingCommandPackage, async () => consumePendingCommandPackage())
  ipcMainHandle(IPC_CHANNELS.commitCommandPackage, async (previewId: unknown, decisions: unknown) => commitCommandPackage(previewId, decisions))
  ipcMainHandle(IPC_CHANNELS.getCommands, async () => userCommands.map((command) => ({ ...command })))
  ipcMainHandle(IPC_CHANNELS.createCommand, async (value: unknown) => {
    if (!userCommandStore || typeof value !== 'object' || value === null) throw new Error('INVALID_COMMAND')
    const command = await userCommandStore.create(value as UserCommandDraft)
    userCommands = userCommandStore.get()
    await refreshApplications()
    return command
  })
  ipcMainHandle(IPC_CHANNELS.updateCommand, async (id: unknown, patch: unknown) => {
    if (!userCommandStore || typeof id !== 'string' || typeof patch !== 'object' || patch === null) throw new Error('INVALID_COMMAND')
    const command = await userCommandStore.update(id, patch as UserCommandPatch)
    userCommands = userCommandStore.get()
    await refreshApplications()
    return command
  })
  ipcMainHandle(IPC_CHANNELS.setCommandEnabled, async (id: unknown, enabled: unknown) => {
    if (!userCommandStore || typeof id !== 'string' || typeof enabled !== 'boolean') throw new Error('INVALID_COMMAND')
    const command = await userCommandStore.setEnabled(id, enabled)
    userCommands = userCommandStore.get()
    await refreshApplications()
    return command
  })
  ipcMainHandle(IPC_CHANNELS.deleteCommand, async (id: unknown) => {
    if (!userCommandStore || typeof id !== 'string') throw new Error('INVALID_COMMAND')
    await userCommandStore.remove(id)
    userCommands = userCommandStore.get()
    await refreshApplications()
  })
  ipcMainHandleWithEvent(IPC_CHANNELS.execute, async (event, value: unknown) => executeItem(value, event.sender.id))
  ipcMainHandleWithEvent(IPC_CHANNELS.copyGeneratedUrl, async (event, token: unknown) => copyGeneratedUrl(token, event.sender.id))
  ipcMainHandle(IPC_CHANNELS.refreshApplications, async () => refreshApplications())
  ipcMainHandle(IPC_CHANNELS.getHotkeyStatus, async () => ({ requested: requestedHotkey, active: activeHotkey, conflict: hotkeyConflict }))
  ipcMainHandle(IPC_CHANNELS.getCatalog, async () => indexedCatalog.payload)
}

function ipcMainHandle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void {
  // Electron throws when a handler is registered twice during a hot reload.
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => handler(...args))
}

function ipcMainHandleWithEvent(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args: unknown[]) => handler(event, ...args))
}

function createTray(): void {
  if (tray) return
  try {
    const iconPath = resolveTrayIconPath(
      trayIconCandidates(typeof process.resourcesPath === 'string' ? process.resourcesPath : '', typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()),
      existsSync,
    )
    let icon = nativeImage.createFromDataURL(EMPTY_TRAY_ICON)
    if (iconPath && typeof nativeImage.createFromPath === 'function') {
      try {
        const loadedIcon = nativeImage.createFromPath(iconPath)
        if (!loadedIcon.isEmpty()) icon = prepareTrayIconForPlatform(process.platform, loadedIcon)
      } catch {
        // Keep the tiny transparent fallback if the optional tray asset cannot be decoded.
      }
    }
    tray = new Tray(icon)
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
    logDiagnostic('tray unavailable', error)
  }
}

function registerGlobalHotkey(): void {
  globalShortcut.unregisterAll()
  if (hotkeyRecording) {
    activeHotkey = null
    hotkeyConflict = false
    return
  }
  const result = registerLauncherHotkey(requestedHotkey, (accelerator) => {
    try {
      return globalShortcut.register(accelerator, showLauncher)
    } catch (error) {
      logDiagnostic(`unable to register global hotkey (${accelerator})`, error)
      return false
    }
  }, () => undefined)
  activeHotkey = result.accelerator
  hotkeyConflict = result.conflict
}

async function bootstrap(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  if (process.platform === 'win32') app.setAppUserModelId('com.quicklauncher.desktop')
  settingsStore = createSettingsStore(join(app.getPath('userData'), 'settings.json'))
  settings = await settingsStore.load()
  userCommandStore = createUserCommandStore(join(app.getPath('userData'), 'user.json'))
  userCommands = await userCommandStore.load()
  await refreshApplicationBindingStatus()
  importedPackages = typeof userCommandStore.getImportedPackages === 'function' ? userCommandStore.getImportedPackages() : {}
  activityHistoryStore = createActivityHistoryStore(join(app.getPath('userData'), 'activity-history.json'))
  await activityHistoryStore.load()
  requestedHotkey = settings.hotkey || DEFAULT_HOTKEY
  nativeTheme.themeSource = settings.theme
  configureAutostart(settings.autostart)
  configureClipboardHistoryMonitoring()
  registerIpc()
  createSearchWindow()
  createTray()
  registerGlobalHotkey()
  nativeTheme.on('updated', () => broadcastTheme())
  baseCatalog = await loadBaseCatalog()
  applicationIndexCache = createApplicationIndexCache(join(app.getPath('userData'), 'app-index.json'))
  const cachedApplications = await applicationIndexCache.load().catch((error: unknown) => {
    logDiagnostic('application index cache load failed', error)
    return undefined
  })
  if (cachedApplications) {
    try {
      await publishApplicationRefresh(
        createShortcutIndex(cachedApplications.entries),
        Math.max(indexedCatalog.payload.snapshotVersion + 1, cachedApplications.indexVersion),
        false,
      )
    } catch (error) {
      logDiagnostic('cached application index unavailable', error)
    }
  }
  void refreshApplications().catch((error) => logDiagnostic('application refresh failed', error))
  applicationIndexWatcher?.close()
  applicationIndexWatcher = createApplicationIndexWatcher(
    defaultApplicationWatchRoots(process.platform, app.getPath('desktop')),
    () => { void refreshApplications().catch((error) => logDiagnostic('application refresh after filesystem change failed', error)) },
  )
  configureFileSearchWatcher()
  if (pendingCommandPackageFile) openSettings(false)
  else if (settings.onboardingCompleted === false) openSettings(true)
}

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    queueCommandPackageFile(filePath)
  })
  app.on('second-instance', (_event, commandLine) => {
    const packagePath = findCommandPackagePath(commandLine)
    if (!packagePath || !queueCommandPackageFile(packagePath)) showLauncher()
  })
  app.whenReady().then(() => bootstrap()).catch((error: unknown) => {
    logDiagnostic('bootstrap failed', error)
    bootstrapped = false
  })
  app.on('activate', () => showLauncher())
  app.on('before-quit', (event) => {
    if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') logDiagnostic(`quit: before-quit (cleanup started: ${quitCleanupStarted})`)
    if (quitCleanupStarted) return
    event.preventDefault()
    quitCleanupStarted = true
    globalShortcut.unregisterAll()
    applicationIndexWatcher?.close()
    applicationIndexWatcher = null
    fileSearchWatcher?.close()
    fileSearchWatcher = null
    if (clipboardHistoryTimer) clearInterval(clipboardHistoryTimer)
    clipboardHistoryTimer = null
    tray?.destroy()
    tray = null
    void waitForApplicationIconHydrations().then(() => app.quit())
  })
  app.on('window-all-closed', () => undefined)
  if (process.env.QUICK_LAUNCHER_DIAGNOSTICS === '1') {
    app.on('will-quit', () => logDiagnostic('quit: will-quit'))
    app.on('quit', () => logDiagnostic('quit: quit event'))
  }
}

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeSearchEngine } from './app-catalog'
import type { LauncherSettings, LauncherSettingsPatch, SearchEngine } from '../shared/launcher-settings'
import { isValidLauncherHotkey } from '../shared/launcher-hotkey'

export type { LauncherSettings, LauncherSettingsPatch, ThemePreference } from '../shared/launcher-settings'

export const DEFAULT_SETTINGS: LauncherSettings = {
  schemaVersion: 1,
  onboardingCompleted: false,
  hotkey: 'Alt+Space',
  autostart: false,
  showRecent: false,
  clipboardHistoryEnabled: false,
  fileHistoryEnabled: true,
  fileSearchRoots: [],
  disabledBaseAppIds: [],
  theme: 'system',
  searchEngine: { kind: 'bing' },
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const MAX_FILE_SEARCH_ROOTS = 12
const MAX_FILE_SEARCH_ROOT_LENGTH = 4096

function isAbsoluteFileSearchRoot(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_FILE_SEARCH_ROOT_LENGTH
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
    })
    && (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value))
}

function fileSearchRootKey(value: string): string {
  if (value === '/' || /^[A-Za-z]:[\\/]$/u.test(value)) return value.toLocaleLowerCase()
  return value.replace(/[\\/]$/u, '').toLocaleLowerCase()
}

export function normalizeFileSearchRoots(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_FILE_SEARCH_ROOTS) return []
  const roots: string[] = []
  const keys = new Set<string>()
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const root = candidate.trim()
    if (!isAbsoluteFileSearchRoot(root)) continue
    const key = fileSearchRootKey(root)
    if (keys.has(key)) continue
    keys.add(key)
    roots.push(root)
  }
  return roots
}

function isSafeHotkey(value: unknown): value is string {
  return isValidLauncherHotkey(value)
}

function parseDisabledBaseAppIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 256) return []
  const ids = value.filter((item): item is string => typeof item === 'string')
  if (ids.length !== value.length || ids.some((id) => !/^[A-Za-z0-9._-]{1,96}$/u.test(id))) return []
  const uniqueIds = new Set(ids)
  return uniqueIds.size === ids.length ? ids : []
}

export function parsePersistedSettings(value: unknown): LauncherSettings {
  if (!isRecord(value) || value.schemaVersion !== 1) return { ...DEFAULT_SETTINGS, searchEngine: { kind: 'bing' } }
  const theme = value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : DEFAULT_SETTINGS.theme
  const hotkey = isSafeHotkey(value.hotkey) ? value.hotkey : DEFAULT_SETTINGS.hotkey
  const onboardingCompleted = typeof value.onboardingCompleted === 'boolean' ? value.onboardingCompleted : DEFAULT_SETTINGS.onboardingCompleted
  const autostart = typeof value.autostart === 'boolean' ? value.autostart : DEFAULT_SETTINGS.autostart
  const showRecent = typeof value.showRecent === 'boolean' ? value.showRecent : DEFAULT_SETTINGS.showRecent
  const clipboardHistoryEnabled = typeof value.clipboardHistoryEnabled === 'boolean' ? value.clipboardHistoryEnabled : DEFAULT_SETTINGS.clipboardHistoryEnabled
  const fileHistoryEnabled = typeof value.fileHistoryEnabled === 'boolean' ? value.fileHistoryEnabled : DEFAULT_SETTINGS.fileHistoryEnabled
  const fileSearchRoots = value.fileSearchRoots === undefined ? DEFAULT_SETTINGS.fileSearchRoots : normalizeFileSearchRoots(value.fileSearchRoots)
  const disabledBaseAppIds = value.disabledBaseAppIds === undefined ? DEFAULT_SETTINGS.disabledBaseAppIds : parseDisabledBaseAppIds(value.disabledBaseAppIds)
  return {
    schemaVersion: 1,
    onboardingCompleted,
    hotkey,
    autostart,
    showRecent,
    clipboardHistoryEnabled,
    fileHistoryEnabled,
    fileSearchRoots,
    disabledBaseAppIds,
    theme,
    searchEngine: normalizeSearchEngine(value.searchEngine),
  }
}

export function createSettingsStore(filePath: string): {
  load: () => Promise<LauncherSettings>
  get: () => LauncherSettings
  update: (patch: LauncherSettingsPatch) => Promise<LauncherSettings>
  save: (settings: LauncherSettings) => Promise<void>
} {
  let current = { ...DEFAULT_SETTINGS, searchEngine: { kind: 'bing' } as SearchEngine }
  let writeQueue = Promise.resolve()

  const save = async (settings: LauncherSettings): Promise<void> => {
    const normalized = parsePersistedSettings(settings)
    await mkdir(dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporaryPath, filePath)
      current = normalized
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }

  const load = async (): Promise<LauncherSettings> => {
    try {
      const raw = await readFile(filePath, 'utf8')
      current = parsePersistedSettings(JSON.parse(raw) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const corruptPath = `${filePath}.corrupt-${Date.now()}`
        await rename(filePath, corruptPath).catch(() => undefined)
      }
      await save(current)
    }
    return { ...current, searchEngine: { ...current.searchEngine } }
  }

  const update = async (patch: LauncherSettingsPatch): Promise<LauncherSettings> => {
    const next = parsePersistedSettings({ ...current, ...patch, schemaVersion: 1 })
    const pendingWrite = writeQueue.catch(() => undefined).then(() => save(next))
    writeQueue = pendingWrite
    await pendingWrite
    return { ...current, searchEngine: { ...current.searchEngine } }
  }

  return { load, get: () => ({ ...current, searchEngine: { ...current.searchEngine } }), update, save }
}

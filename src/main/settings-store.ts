import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizeSearchEngine } from './app-catalog'
import type { LauncherSettings, LauncherSettingsPatch, SearchEngine } from '../shared/launcher-settings'

export type { LauncherSettings, LauncherSettingsPatch, ThemePreference } from '../shared/launcher-settings'

export const DEFAULT_SETTINGS: LauncherSettings = {
  schemaVersion: 1,
  hotkey: 'Alt+Space',
  autostart: false,
  showRecent: false,
  theme: 'system',
  searchEngine: { kind: 'bing' },
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isSafeHotkey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) return false
  return !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })
}

export function parsePersistedSettings(value: unknown): LauncherSettings {
  if (!isRecord(value) || value.schemaVersion !== 1) return { ...DEFAULT_SETTINGS, searchEngine: { kind: 'bing' } }
  const theme = value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : DEFAULT_SETTINGS.theme
  const hotkey = isSafeHotkey(value.hotkey) ? value.hotkey : DEFAULT_SETTINGS.hotkey
  const autostart = typeof value.autostart === 'boolean' ? value.autostart : DEFAULT_SETTINGS.autostart
  const showRecent = typeof value.showRecent === 'boolean' ? value.showRecent : DEFAULT_SETTINGS.showRecent
  return {
    schemaVersion: 1,
    hotkey,
    autostart,
    showRecent,
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

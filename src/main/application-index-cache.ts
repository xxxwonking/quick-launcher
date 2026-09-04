import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ShortcutEntry, ShortcutMetadata } from './shortcut-index'

export type ApplicationIndexCacheSnapshot = {
  schemaVersion: 1
  indexVersion: number
  generatedAt: string
  entries: ShortcutEntry[]
}

const MAX_ENTRIES = 20_000
const MAX_TEXT_LENGTH = 4096
const MAX_BYTES = 10 * 1024 * 1024
const MAX_JSON_DEPTH = 10

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function exceedsJsonDepth(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    if (current.depth > MAX_JSON_DEPTH) return true
    if (!Array.isArray(current.value) && !isRecord(current.value)) continue
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value)
    for (const child of children) pending.push({ value: child, depth: current.depth + 1 })
  }
  return false
}

function validText(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 0x20 || ((character.codePointAt(0) ?? 0) >= 0x7f && (character.codePointAt(0) ?? 0) <= 0x9f))
}

function parseMetadata(value: unknown): ShortcutMetadata | undefined {
  if (!isRecord(value) || Object.keys(value).some((key) => !['platform', 'executableName', 'bundleId', 'publisher', 'appUserModelId'].includes(key))) return undefined
  if (value.platform !== 'windows' && value.platform !== 'macos') return undefined
  const fields = ['executableName', 'bundleId', 'publisher', 'appUserModelId'] as const
  if (fields.some((field) => value[field] !== undefined && !validText(value[field], MAX_TEXT_LENGTH))) return undefined
  return {
    platform: value.platform,
    ...(typeof value.executableName === 'string' ? { executableName: value.executableName } : {}),
    ...(typeof value.bundleId === 'string' ? { bundleId: value.bundleId } : {}),
    ...(typeof value.publisher === 'string' ? { publisher: value.publisher } : {}),
    ...(typeof value.appUserModelId === 'string' ? { appUserModelId: value.appUserModelId } : {}),
  }
}

export function parseApplicationIndexCache(value: unknown): ApplicationIndexCacheSnapshot | undefined {
  if (!isRecord(value) || exceedsJsonDepth(value) || Object.keys(value).some((key) => !['schemaVersion', 'indexVersion', 'generatedAt', 'entries'].includes(key))) return undefined
  if (value.schemaVersion !== 1 || typeof value.indexVersion !== 'number' || !Number.isInteger(value.indexVersion) || value.indexVersion < 0 || !validText(value.generatedAt, 64) || Number.isNaN(Date.parse(value.generatedAt)) || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) return undefined
  const entries: ShortcutEntry[] = []
  for (const candidate of value.entries) {
    if (!isRecord(candidate) || Object.keys(candidate).some((key) => !['displayName', 'path', 'metadata'].includes(key)) || !validText(candidate.displayName, 256) || !validText(candidate.path) || (candidate.metadata !== undefined && !parseMetadata(candidate.metadata))) return undefined
    const metadata = candidate.metadata === undefined ? undefined : parseMetadata(candidate.metadata)
    entries.push({ displayName: candidate.displayName, path: candidate.path, ...(metadata ? { metadata } : {}) })
  }
  return { schemaVersion: 1, indexVersion: value.indexVersion, generatedAt: value.generatedAt, entries }
}

export function createApplicationIndexCache(filePath: string): {
  load: () => Promise<ApplicationIndexCacheSnapshot | undefined>
  save: (entries: readonly ShortcutEntry[], indexVersion: number) => Promise<void>
} {
  const save = async (entries: readonly ShortcutEntry[], indexVersion: number): Promise<void> => {
    if (!Number.isInteger(indexVersion) || indexVersion < 0 || entries.length > MAX_ENTRIES) throw new Error('INVALID_APP_INDEX')
    const snapshot: ApplicationIndexCacheSnapshot = {
      schemaVersion: 1,
      indexVersion,
      generatedAt: new Date().toISOString(),
      entries: entries.map((entry) => ({ ...entry, ...(entry.metadata ? { metadata: { ...entry.metadata } } : {}) })),
    }
    await mkdir(dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporaryPath, filePath)
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }

  const load = async (): Promise<ApplicationIndexCacheSnapshot | undefined> => {
    const isolateCorruptFile = async (): Promise<void> => {
      await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined)
    }
    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      await isolateCorruptFile()
      return undefined
    }
    if (!fileStat.isFile() || fileStat.size > MAX_BYTES) {
      await isolateCorruptFile()
      return undefined
    }
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      await isolateCorruptFile()
      return undefined
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      parsed = undefined
    }
    const snapshot = parseApplicationIndexCache(parsed)
    if (snapshot) return snapshot
    await isolateCorruptFile()
    return undefined
  }

  return {
    load,
    save,
  }
}

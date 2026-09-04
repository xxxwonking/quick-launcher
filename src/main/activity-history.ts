import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ActivityHistoryType = 'clipboard' | 'file'
export type ActivityHistoryEntry = { type: ActivityHistoryType; value: string; updatedAt: number }
type PersistedActivityHistory = { schemaVersion: 1; entries: ActivityHistoryEntry[] }

const EMPTY_HISTORY: PersistedActivityHistory = { schemaVersion: 1, entries: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizedEntry(value: unknown): ActivityHistoryEntry | undefined {
  if (!isRecord(value) || (value.type !== 'clipboard' && value.type !== 'file') || typeof value.value !== 'string' || typeof value.updatedAt !== 'number') return undefined
  if (!value.value || value.value.includes('\0') || !Number.isFinite(value.updatedAt) || value.updatedAt < 0) return undefined
  if (value.type === 'clipboard' && value.value.length > 50_000) return undefined
  if (value.type === 'file' && value.value.length > 4096) return undefined
  return { type: value.type, value: value.value, updatedAt: value.updatedAt }
}

export function parseActivityHistory(value: unknown): PersistedActivityHistory {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) return { ...EMPTY_HISTORY, entries: [] }
  const seen = new Set<string>()
  const entries = value.entries
    .map(normalizedEntry)
    .filter((entry): entry is ActivityHistoryEntry => Boolean(entry))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter((entry) => {
      const key = `${entry.type}\0${entry.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return { schemaVersion: 1, entries }
}

export function createActivityHistoryStore(filePath: string, perTypeLimit = 20): {
  load: () => Promise<ActivityHistoryEntry[]>
  get: () => ActivityHistoryEntry[]
  add: (type: ActivityHistoryType, value: string, updatedAt?: number) => Promise<void>
  clear: (type?: ActivityHistoryType) => Promise<void>
} {
  let current: PersistedActivityHistory = { ...EMPTY_HISTORY, entries: [] }
  let writeQueue = Promise.resolve()

  const save = async (next: PersistedActivityHistory): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporaryPath, filePath)
      current = next
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }

  const load = async (): Promise<ActivityHistoryEntry[]> => {
    try {
      current = parseActivityHistory(JSON.parse(await readFile(filePath, 'utf8')) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined)
      await save(current)
    }
    return current.entries.map((entry) => ({ ...entry }))
  }

  const add = (type: ActivityHistoryType, value: string, updatedAt = Date.now()): Promise<void> => {
    const entry = normalizedEntry({ type, value, updatedAt })
    if (!entry) return Promise.reject(new Error('INVALID_HISTORY_ENTRY'))
    const operation = writeQueue.catch(() => undefined).then(async () => {
      const entries = [entry, ...current.entries.filter((candidate) => candidate.type !== type || candidate.value !== value)]
      const typeCounts: Record<ActivityHistoryType, number> = { clipboard: 0, file: 0 }
      const limited = entries.filter((candidate) => {
        typeCounts[candidate.type] += 1
        return typeCounts[candidate.type] <= perTypeLimit
      })
      await save({ schemaVersion: 1, entries: limited })
    })
    writeQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  const clear = (type?: ActivityHistoryType): Promise<void> => {
    const operation = writeQueue.catch(() => undefined).then(() => {
      const entries = type ? current.entries.filter((entry) => entry.type !== type) : []
      return save({ schemaVersion: 1, entries })
    })
    writeQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  return { load, get: () => current.entries.map((entry) => ({ ...entry })), add, clear }
}

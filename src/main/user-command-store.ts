import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PersistedUserCommands, UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from '../shared/launcher-command'

const EMPTY_COMMANDS: PersistedUserCommands = { schemaVersion: 1, version: 0, commands: [] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function hasUnsafeControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })
}

function isHttpUrl(value: string): boolean {
  if (hasUnsafeControl(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidKeyword(value: unknown): value is string {
  return typeof value === 'string' && Array.from(value).length <= 32 && /^[\p{L}\p{N}\p{Script=Han}_-]+$/u.test(value)
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,96}$/u.test(value)
}

function isValidType(value: unknown): value is UserCommandType {
  return value === 'open-url' || value === 'web-search'
}

function normalizeCommand(value: unknown): UserCommand | undefined {
  if (!isRecord(value) || !isValidId(value.id) || !isValidKeyword(value.keyword) || typeof value.title !== 'string' || value.title.trim().length < 1 || value.title.length > 128 || hasUnsafeControl(value.title) || !isValidType(value.type) || typeof value.target !== 'string' || value.target.length > 2048 || hasUnsafeControl(value.target) || typeof value.enabled !== 'boolean') return undefined
  if (value.type === 'open-url' && !isHttpUrl(value.target)) return undefined
  if (value.type === 'web-search' && value.target.trim().length < 1) return undefined
  return {
    id: value.id,
    keyword: value.keyword.trim(),
    title: value.title.trim(),
    type: value.type,
    target: value.target,
    enabled: value.enabled,
  }
}

function assertCommand(command: UserCommand | undefined): asserts command is UserCommand {
  if (!command) throw new Error('INVALID_COMMAND')
}

function assertUnique(commands: readonly UserCommand[], exceptId?: string): void {
  const seenIds = new Set<string>()
  const seenKeywords = new Set<string>()
  for (const command of commands) {
    if (command.id !== exceptId && seenIds.has(command.id)) throw new Error('COMMAND_CONFLICT')
    const keyword = command.keyword.toLocaleLowerCase()
    if (command.id !== exceptId && seenKeywords.has(keyword)) throw new Error('COMMAND_CONFLICT')
    seenIds.add(command.id)
    seenKeywords.add(keyword)
  }
}

export function parsePersistedUserCommands(value: unknown): PersistedUserCommands {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.commands)) return { ...EMPTY_COMMANDS, commands: [] }
  const commands: UserCommand[] = []
  const seenIds = new Set<string>()
  const seenKeywords = new Set<string>()
  for (const candidate of value.commands) {
    const command = normalizeCommand(candidate)
    if (!command) continue
    const keyword = command.keyword.toLocaleLowerCase()
    if (seenIds.has(command.id) || seenKeywords.has(keyword)) continue
    seenIds.add(command.id)
    seenKeywords.add(keyword)
    commands.push(command)
  }
  const version = typeof value.version === 'number' && Number.isInteger(value.version) && value.version >= 0 ? value.version : 0
  return { schemaVersion: 1, version, commands }
}

export function createUserCommandStore(filePath: string): {
  load: () => Promise<UserCommand[]>
  get: () => UserCommand[]
  create: (draft: UserCommandDraft) => Promise<UserCommand>
  update: (id: string, patch: UserCommandPatch) => Promise<UserCommand>
  setEnabled: (id: string, enabled: boolean) => Promise<UserCommand>
  remove: (id: string) => Promise<void>
} {
  let current: PersistedUserCommands = { ...EMPTY_COMMANDS, commands: [] }
  let writeQueue = Promise.resolve()

  const save = async (next: PersistedUserCommands): Promise<void> => {
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

  const load = async (): Promise<UserCommand[]> => {
    try {
      current = parsePersistedUserCommands(JSON.parse(await readFile(filePath, 'utf8')) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined)
      await save(current)
    }
    return current.commands.map((command) => ({ ...command }))
  }

  const transact = async <T>(operation: () => Promise<T>): Promise<T> => {
    const nextOperation = writeQueue.catch(() => undefined).then(operation)
    writeQueue = nextOperation.then(() => undefined, () => undefined)
    return nextOperation
  }

  const create = (draft: UserCommandDraft): Promise<UserCommand> => transact(async () => {
    const command = normalizeCommand({ ...draft, enabled: draft.enabled ?? true })
    assertCommand(command)
    if (current.commands.some((item) => item.id === command.id || item.keyword.toLocaleLowerCase() === command.keyword.toLocaleLowerCase())) throw new Error('COMMAND_CONFLICT')
    const next = { schemaVersion: 1 as const, version: current.version + 1, commands: [...current.commands, command] }
    await save(next)
    return { ...command }
  })

  const update = (id: string, patch: UserCommandPatch): Promise<UserCommand> => transact(async () => {
    const index = current.commands.findIndex((command) => command.id === id)
    if (index < 0) throw new Error('COMMAND_NOT_FOUND')
    const command = normalizeCommand({ ...current.commands[index], ...patch })
    assertCommand(command)
    if (command.id !== id) throw new Error('INVALID_COMMAND')
    const commands = [...current.commands]
    commands[index] = command
    const duplicate = commands.some((item, itemIndex) => itemIndex !== index && (item.id === command.id || item.keyword.toLocaleLowerCase() === command.keyword.toLocaleLowerCase()))
    if (duplicate) throw new Error('COMMAND_CONFLICT')
    assertUnique(commands)
    await save({ schemaVersion: 1, version: current.version + 1, commands })
    return { ...command }
  })

  const setEnabled = (id: string, enabled: boolean): Promise<UserCommand> => update(id, { enabled })

  const remove = (id: string): Promise<void> => transact(async () => {
    if (!current.commands.some((command) => command.id === id)) throw new Error('COMMAND_NOT_FOUND')
    await save({ schemaVersion: 1, version: current.version + 1, commands: current.commands.filter((command) => command.id !== id) })
  })

  return { load, get: () => current.commands.map((command) => ({ ...command })), create, update, setEnabled, remove }
}

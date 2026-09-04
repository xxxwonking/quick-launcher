import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CommandImportDecision, ImportedPackageSnapshot, PersistedUserCommands, UserApplicationBinding, UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from '../shared/launcher-command'
import { compareSemVer, parseCommandPackage } from '../shared/command-package'
import { isValidSearchTemplate } from './app-catalog'

const EMPTY_COMMANDS: PersistedUserCommands = { schemaVersion: 1, version: 0, commands: [], importedPackages: {} }
const RESERVED_ID_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

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
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,96}$/u.test(value) && !RESERVED_ID_NAMES.has(value.toLocaleLowerCase())
}

function isValidType(value: unknown): value is UserCommandType {
  return value === 'open-url' || value === 'web-search' || value === 'site-search' || value === 'launch-app'
}

function isValidPackageAppRef(value: string): boolean {
  if (isValidId(value)) return true
  const match = /^package:([A-Za-z0-9._-]{1,96})\/([A-Za-z0-9._-]{1,96})$/u.exec(value)
  return Boolean(match && isValidId(match[1]) && isValidId(match[2]))
}

function isValidBindingPath(value: unknown, platform: UserApplicationBinding['platform']): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || hasUnsafeControl(value)) return false
  return platform === 'windows'
    ? /^[A-Za-z]:[\\/]|^\\\\[^\\/]+[\\/][^\\/]+/u.test(value)
    : value.startsWith('/') && value.toLocaleLowerCase().endsWith('.app')
}

function isValidApplicationBinding(value: unknown): value is UserApplicationBinding {
  if (!isRecord(value) || Object.keys(value).some((key) => !['platform', 'kind', 'path'].includes(key))) return false
  if (value.platform === 'windows') {
    return (value.kind === 'windows-executable' || value.kind === 'windows-shortcut') && isValidBindingPath(value.path, 'windows')
  }
  return value.platform === 'macos' && value.kind === 'macos-bundle' && isValidBindingPath(value.path, 'macos')
}

function parseAppBindings(value: unknown): Record<string, UserApplicationBinding> {
  if (value === undefined || !isRecord(value)) return {}
  const parsed: Record<string, UserApplicationBinding> = {}
  for (const [appRef, candidate] of Object.entries(value)) {
    if (!isValidPackageAppRef(appRef) || !isValidApplicationBinding(candidate)) continue
    parsed[appRef] = { ...candidate }
  }
  return parsed
}

function parseSource(value: unknown): UserCommand['source'] | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.keys(value).some((key) => !['kind', 'packageId', 'packageVersion'].includes(key))) return undefined
  if (value.kind !== 'package' || !isValidId(value.packageId) || typeof value.packageVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value.packageVersion)) return undefined
  return { kind: 'package', packageId: value.packageId, packageVersion: value.packageVersion }
}

function parseImportedPackages(value: unknown): Record<string, ImportedPackageSnapshot> {
  if (value === undefined) return {}
  if (!isRecord(value)) return {}
  const parsed: Record<string, ImportedPackageSnapshot> = {}
  for (const [packageId, candidate] of Object.entries(value)) {
    if (!isValidId(packageId) || !isRecord(candidate) || Object.keys(candidate).some((key) => !['schemaVersion', 'packageId', 'name', 'version', 'apps', 'commands', 'digest'].includes(key)) || typeof candidate.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(candidate.digest)) continue
    const commandPackage = parseCommandPackage({
      schemaVersion: candidate.schemaVersion,
      packageId: candidate.packageId,
      name: candidate.name,
      version: candidate.version,
      apps: candidate.apps,
      commands: candidate.commands,
    })
    if (!commandPackage || commandPackage.packageId !== packageId) continue
    parsed[packageId] = { ...commandPackage, digest: candidate.digest }
  }
  return parsed
}

function normalizeCommand(value: unknown): UserCommand | undefined {
  if (!isRecord(value)) return undefined
  const source = parseSource(value.source)
  if (!isValidId(value.id) || !isValidKeyword(value.keyword) || typeof value.title !== 'string' || value.title.trim().length < 1 || value.title.length > 128 || hasUnsafeControl(value.title) || !isValidType(value.type) || typeof value.target !== 'string' || value.target.length > 2048 || hasUnsafeControl(value.target) || typeof value.enabled !== 'boolean' || (value.source !== undefined && !source)) return undefined
  if (value.type === 'open-url' && !isHttpUrl(value.target)) return undefined
  if (value.type === 'web-search' && value.target.trim().length < 1) return undefined
  if (value.type === 'site-search' && !isValidSearchTemplate(value.target)) return undefined
  if (value.type === 'launch-app' && !isValidPackageAppRef(value.target)) return undefined
  return {
    id: value.id,
    keyword: value.keyword.trim(),
    title: value.title.trim(),
    type: value.type,
    target: value.target,
    enabled: value.enabled,
    ...(source ? { source } : {}),
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
  const importedPackages = parseImportedPackages(value.importedPackages)
  const appBindings = parseAppBindings(value.appBindings)
  const hasPackageSnapshots = value.importedPackages !== undefined
  const commands: UserCommand[] = []
  const seenIds = new Set<string>()
  const seenKeywords = new Set<string>()
  for (const candidate of value.commands) {
    const command = normalizeCommand(candidate)
    if (!command) continue
    if (hasPackageSnapshots && command.source && !importedPackages[command.source.packageId]) continue
    const keyword = command.keyword.toLocaleLowerCase()
    if (seenIds.has(command.id) || seenKeywords.has(keyword)) continue
    seenIds.add(command.id)
    seenKeywords.add(keyword)
    commands.push(command)
  }
  const version = typeof value.version === 'number' && Number.isInteger(value.version) && value.version >= 0 ? value.version : 0
  return { schemaVersion: 1, version, commands, importedPackages, ...(value.appBindings !== undefined ? { appBindings } : {}) }
}

export function createUserCommandStore(filePath: string): {
  load: () => Promise<UserCommand[]>
  get: () => UserCommand[]
  getVersion: () => number
  getImportedPackages: () => Record<string, ImportedPackageSnapshot>
  getAppBindings: () => Record<string, UserApplicationBinding>
  setAppBinding: (appRef: string, binding: UserApplicationBinding) => Promise<UserApplicationBinding>
  create: (draft: UserCommandDraft) => Promise<UserCommand>
  update: (id: string, patch: UserCommandPatch) => Promise<UserCommand>
  setEnabled: (id: string, enabled: boolean) => Promise<UserCommand>
  remove: (id: string) => Promise<void>
  importCommands: (commands: readonly UserCommand[], decisions: readonly CommandImportDecision[]) => Promise<UserCommand[]>
  importPackage: (snapshot: ImportedPackageSnapshot, commands: readonly UserCommand[], decisions: readonly CommandImportDecision[]) => Promise<UserCommand[]>
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

  const nextConfig = (commands: UserCommand[], packages = current.importedPackages, bindings = current.appBindings): PersistedUserCommands => ({
    schemaVersion: 1,
    version: current.version + 1,
    commands,
    importedPackages: packages,
    ...(bindings ? { appBindings: bindings } : {}),
  })

  const create = (draft: UserCommandDraft): Promise<UserCommand> => transact(async () => {
    const command = normalizeCommand({ ...draft, enabled: draft.enabled ?? true })
    assertCommand(command)
    if (current.commands.some((item) => item.id === command.id || item.keyword.toLocaleLowerCase() === command.keyword.toLocaleLowerCase())) throw new Error('COMMAND_CONFLICT')
    await save(nextConfig([...current.commands, command]))
    return { ...command }
  })

  const update = (id: string, patch: UserCommandPatch): Promise<UserCommand> => transact(async () => {
    const index = current.commands.findIndex((command) => command.id === id)
    if (index < 0 || !current.commands[index]) throw new Error('COMMAND_NOT_FOUND')
    const previousCommand = current.commands[index]
    const packageCommandWasEdited = Boolean(previousCommand.source && Object.keys(patch).some((key) => key !== 'enabled'))
    const command = normalizeCommand({
      ...previousCommand,
      ...patch,
      ...(packageCommandWasEdited ? { source: undefined } : {}),
    })
    assertCommand(command)
    if (command.id !== id) throw new Error('INVALID_COMMAND')
    const commands = [...current.commands]
    commands[index] = command
    const duplicate = commands.some((item, itemIndex) => itemIndex !== index && (item.id === command.id || item.keyword.toLocaleLowerCase() === command.keyword.toLocaleLowerCase()))
    if (duplicate) throw new Error('COMMAND_CONFLICT')
    assertUnique(commands)
    await save(nextConfig(commands))
    return { ...command }
  })

  const setEnabled = (id: string, enabled: boolean): Promise<UserCommand> => update(id, { enabled })

  const remove = (id: string): Promise<void> => transact(async () => {
    if (!current.commands.some((command) => command.id === id)) throw new Error('COMMAND_NOT_FOUND')
    await save(nextConfig(current.commands.filter((command) => command.id !== id)))
  })

  const importCommands = (incoming: readonly UserCommand[], decisions: readonly CommandImportDecision[]): Promise<UserCommand[]> => transact(async () => {
    const incomingIds = new Set(incoming.map((command) => command.id))
    const decisionMap = new Map<string, CommandImportDecision>()
    for (const decision of decisions) {
      if (!incomingIds.has(decision.incomingId) || decisionMap.has(decision.incomingId)) throw new Error('INVALID_IMPORT')
      decisionMap.set(decision.incomingId, decision)
    }

    const replacements = new Set<string>()
    const imported: UserCommand[] = []
    for (const incomingCommand of incoming) {
      const decision = decisionMap.get(incomingCommand.id)
      if (decision?.action === 'skip') continue
      if (decision?.action === 'replace') {
        if (!current.commands.some((command) => command.id === incomingCommand.id)) throw new Error('INVALID_IMPORT')
        replacements.add(incomingCommand.id)
      }
      const candidate = normalizeCommand({
        ...incomingCommand,
        ...(decision?.action === 'rename' ? { keyword: decision.keyword } : {}),
      })
      assertCommand(candidate)
      imported.push(candidate)
    }

    const nextCommands = [...current.commands.filter((command) => !replacements.has(command.id)), ...imported]
    assertUnique(nextCommands)
    await save(nextConfig(nextCommands))
    return nextCommands.map((command) => ({ ...command }))
  })

  const importPackage = (snapshot: ImportedPackageSnapshot, incoming: readonly UserCommand[], decisions: readonly CommandImportDecision[]): Promise<UserCommand[]> => transact(async () => {
    const previousSnapshot = current.importedPackages[snapshot.packageId]
    if (previousSnapshot?.digest === snapshot.digest) throw new Error('PACKAGE_ALREADY_IMPORTED')
    if (previousSnapshot && compareSemVer(snapshot.version, previousSnapshot.version) < 0) throw new Error('PACKAGE_VERSION_OLD')
    if (previousSnapshot && compareSemVer(snapshot.version, previousSnapshot.version) === 0) throw new Error('PACKAGE_VERSION_CONFLICT')
    const incomingIds = new Set(incoming.map((command) => command.id))
    const decisionMap = new Map<string, CommandImportDecision>()
    for (const decision of decisions) {
      if (!incomingIds.has(decision.incomingId) || decisionMap.has(decision.incomingId)) throw new Error('INVALID_IMPORT')
      decisionMap.set(decision.incomingId, decision)
    }

    const previousPackageCommands = current.commands.filter((command) => command.source?.packageId === snapshot.packageId)
    const previousPackageCommandIds = new Set(previousPackageCommands.map((command) => command.id))
    const retainedCommands = current.commands.filter((command) => command.source?.packageId !== snapshot.packageId)
    const replacements = new Set<string>()
    const imported: UserCommand[] = []
    for (const incomingCommand of incoming) {
      const decision = decisionMap.get(incomingCommand.id)
      if (decision?.action === 'skip') continue
      if (decision?.action === 'replace') {
        if (!current.commands.some((command) => command.id === incomingCommand.id) || previousPackageCommandIds.has(incomingCommand.id)) throw new Error('INVALID_IMPORT')
        replacements.add(incomingCommand.id)
      }
      const candidate = normalizeCommand({
        ...incomingCommand,
        ...(decision?.action === 'rename' ? { keyword: decision.keyword } : {}),
      })
      assertCommand(candidate)
      imported.push(candidate)
    }

    const nextCommands = [...retainedCommands.filter((command) => !replacements.has(command.id)), ...imported]
    assertUnique(nextCommands)
    await save(nextConfig(nextCommands, { ...current.importedPackages, [snapshot.packageId]: snapshot }))
    return nextCommands.map((command) => ({ ...command }))
  })

  const setAppBinding = (appRef: string, binding: UserApplicationBinding): Promise<UserApplicationBinding> => transact(async () => {
    if (!isValidPackageAppRef(appRef)) throw new Error('INVALID_APP_REF')
    if (!isValidApplicationBinding(binding)) throw new Error('INVALID_BINDING')
    const appBindings = { ...(current.appBindings ?? {}), [appRef]: { ...binding } }
    await save(nextConfig(current.commands, current.importedPackages, appBindings))
    return { ...binding }
  })

  return {
    load,
    get: () => current.commands.map((command) => ({ ...command })),
    getVersion: () => current.version,
    getImportedPackages: () => ({ ...current.importedPackages }),
    getAppBindings: () => Object.fromEntries(Object.entries(current.appBindings ?? {}).map(([key, binding]) => [key, { ...binding }])),
    setAppBinding,
    create,
    update,
    setEnabled,
    remove,
    importCommands,
    importPackage,
  }
}

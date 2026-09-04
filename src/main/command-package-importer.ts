import { compareSemVer, type CommandPackage, type PackageCommand } from '../shared/command-package'
import type { CommandPackageChange, CommandPackageConflict, CommandPackagePreview, ImportedPackageSnapshot, UserCommand } from '../shared/launcher-command'

const SEARCH_TEMPLATES: Record<'default' | 'bing' | 'baidu' | 'google', string> = {
  default: 'https://www.bing.com/search?q={query}',
  bing: 'https://www.bing.com/search?q={query}',
  baidu: 'https://www.baidu.com/s?wd={query}',
  google: 'https://www.google.com/search?q={query}',
}

function packageChanges(commandPackage: CommandPackage, previousPackage?: ImportedPackageSnapshot): CommandPackageChange[] {
  if (!previousPackage) return [
    ...commandPackage.apps.map((app) => ({ kind: 'app' as const, action: 'added' as const, id: app.id, label: app.displayName })),
    ...commandPackage.commands.map((command) => ({ kind: 'command' as const, action: 'added' as const, id: command.id, label: command.title ?? command.keyword })),
  ]
  const changes: CommandPackageChange[] = []
  const compare = <T extends { id: string }>(kind: 'app' | 'command', incoming: readonly T[], previous: readonly T[], label: (value: T) => string): void => {
    const previousById = new Map(previous.map((value) => [value.id, value]))
    const incomingIds = new Set(incoming.map((value) => value.id))
    for (const value of incoming) {
      const oldValue = previousById.get(value.id)
      if (!oldValue) changes.push({ kind, action: 'added', id: value.id, label: label(value) })
      else if (JSON.stringify(oldValue) !== JSON.stringify(value)) changes.push({ kind, action: 'updated', id: value.id, label: label(value) })
    }
    for (const value of previous) if (!incomingIds.has(value.id)) changes.push({ kind, action: 'removed', id: value.id, label: label(value) })
  }
  compare('app', commandPackage.apps, previousPackage.apps, (app) => app.displayName)
  compare('command', commandPackage.commands, previousPackage.commands, (command) => command.title ?? command.keyword)
  return changes
}

function packageCommandToUserCommand(command: PackageCommand, packageId: string, packageName: string, packageVersion: string, packageAppIds: ReadonlySet<string>, baseAppIds: ReadonlySet<string>): UserCommand {
  const title = command.title ?? `${packageName} · ${command.keyword}`
  const source = { kind: 'package' as const, packageId, packageVersion }
  if (command.type === 'launch_app') {
    if (!packageAppIds.has(command.appRef) && !baseAppIds.has(command.appRef)) throw new Error('INVALID_PACKAGE_APP_REF')
    return {
      id: command.id,
      keyword: command.keyword,
      title,
      type: 'launch-app',
      target: packageAppIds.has(command.appRef) ? `package:${packageId}/${command.appRef}` : command.appRef,
      enabled: true,
      source,
    }
  }
  if (command.type === 'open_url') return { id: command.id, keyword: command.keyword, title, type: 'open-url', target: command.url, enabled: true, source }
  const target = command.engine === 'custom' ? command.template : SEARCH_TEMPLATES[command.engine]
  return { id: command.id, keyword: command.keyword, title, type: 'site-search', target, enabled: true, source }
}

export function packageCommandsToUserCommands(commandPackage: CommandPackage, baseAppIds: ReadonlySet<string> = new Set()): UserCommand[] {
  const packageAppIds = new Set(commandPackage.apps.map((app) => app.id))
  return commandPackage.commands.map((command) => packageCommandToUserCommand(command, commandPackage.packageId, commandPackage.name, commandPackage.version, packageAppIds, baseAppIds))
}

export function buildCommandPackagePreview(
  commandPackage: CommandPackage,
  packageDigest: string,
  existingCommands: readonly UserCommand[],
  previewId: string,
  expectedConfigVersion: number,
  expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  previousPackage?: ImportedPackageSnapshot,
  baseAppIds: ReadonlySet<string> = new Set(),
  availableAppRefs?: ReadonlySet<string>,
): CommandPackagePreview {
  const commands = packageCommandsToUserCommands(commandPackage, baseAppIds)
  const packageAppIds = new Set(commandPackage.apps.map((app) => app.id))
  const unavailableAppRefs = commandPackage.commands
    .filter((command): command is Extract<PackageCommand, { type: 'launch_app' }> => command.type === 'launch_app')
    .map((command) => packageAppIds.has(command.appRef) ? `package:${commandPackage.packageId}/${command.appRef}` : command.appRef)
    .filter((appRef) => availableAppRefs ? !availableAppRefs.has(appRef) : false)
  const existingById = new Map(existingCommands.filter((command) => command.source?.packageId !== commandPackage.packageId).map((command) => [command.id, command]))
  const existingByKeyword = new Map(existingCommands.filter((command) => command.source?.packageId !== commandPackage.packageId).map((command) => [command.keyword.toLocaleLowerCase(), command]))
  const conflicts: CommandPackageConflict[] = []
  for (const command of commands) {
    const byId = existingById.get(command.id)
    if (byId) {
      conflicts.push({ kind: 'command-id', incomingId: command.id, existingId: byId.id })
      continue
    }
    const byKeyword = existingByKeyword.get(command.keyword.toLocaleLowerCase())
    if (byKeyword) conflicts.push({ kind: 'keyword', incomingId: command.id, existingId: byKeyword.id })
  }
  return {
    previewId,
    packageDigest,
    expectedConfigVersion,
    expiresAt,
    packageId: commandPackage.packageId,
    name: commandPackage.name,
    version: commandPackage.version,
    commands,
    conflicts,
    packageStatus: !previousPackage
      ? 'new'
      : previousPackage.digest === packageDigest
        ? 'already-imported'
        : compareSemVer(commandPackage.version, previousPackage.version) > 0
          ? 'upgrade'
          : compareSemVer(commandPackage.version, previousPackage.version) < 0
            ? 'downgrade'
            : 'version-conflict',
    ...(previousPackage ? { previousVersion: previousPackage.version, previousDigest: previousPackage.digest } : {}),
    changes: packageChanges(commandPackage, previousPackage),
    unavailableAppRefs: [...new Set(unavailableAppRefs)],
  }
}

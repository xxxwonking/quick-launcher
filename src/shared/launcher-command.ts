import type { CommandPackage } from './command-package'

export type UserCommandType = 'open-url' | 'web-search' | 'site-search' | 'launch-app'

export type UserCommandSource = {
  kind: 'package'
  packageId: string
  packageVersion: string
}

export type CommandImportDecision = {
  incomingId: string
  action: 'replace' | 'rename' | 'skip'
  keyword?: string
}

export type UserCommand = {
  id: string
  keyword: string
  title: string
  type: UserCommandType
  target: string
  enabled: boolean
  source?: UserCommandSource
}

export type ImportedPackageSnapshot = Pick<CommandPackage, 'schemaVersion' | 'packageId' | 'name' | 'version' | 'apps' | 'commands'> & {
  digest: string
}

export type UserCommandDraft = Omit<UserCommand, 'enabled'> & { enabled?: boolean }
export type UserCommandPatch = Partial<Pick<UserCommand, 'keyword' | 'title' | 'type' | 'target' | 'enabled'>>

export type UserApplicationBinding = {
  platform: 'windows' | 'macos'
  kind: 'windows-executable' | 'windows-shortcut' | 'macos-bundle'
  path: string
}

export type PersistedUserCommands = {
  schemaVersion: 1
  version: number
  commands: UserCommand[]
  importedPackages: Record<string, ImportedPackageSnapshot>
  appBindings?: Record<string, UserApplicationBinding>
}

export type CommandPackageConflict = {
  kind: 'command-id' | 'keyword'
  incomingId: string
  existingId: string
}

export type CommandPackagePreview = {
  previewId: string
  packageDigest: string
  expectedConfigVersion: number
  expiresAt: string
  packageId: string
  name: string
  version: string
  commands: UserCommand[]
  conflicts: CommandPackageConflict[]
  packageStatus: 'new' | 'already-imported' | 'upgrade' | 'version-conflict' | 'downgrade'
  previousVersion?: string
  previousDigest?: string
  changes: CommandPackageChange[]
  unavailableAppRefs: string[]
}

export type CommandPackageChange = {
  kind: 'app' | 'command'
  action: 'added' | 'updated' | 'removed'
  id: string
  label: string
}

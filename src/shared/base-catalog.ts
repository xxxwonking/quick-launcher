export type BasePlatformWindows = {
  executables?: string[]
  publishers?: string[]
  appUserModelIds?: string[]
}

export type BasePlatformMacos = {
  bundleIds: string[]
}

export type BaseAppTemplate = {
  id: string
  displayName: string
  defaultAliases: string[]
  platforms: {
    windows?: BasePlatformWindows
    macos?: BasePlatformMacos
  }
}

export type BaseCatalog = {
  schemaVersion: 1
  catalogVersion: string
  apps: BaseAppTemplate[]
  commands: []
}

const APP_ID_PATTERN = /^[A-Za-z0-9._-]{1,96}$/u
const KEYWORD_PATTERN = /^[\p{L}\p{N}_-]{1,32}$/u
const MAX_CATALOG_VERSION_LENGTH = 64
const MAX_DISPLAY_NAME_LENGTH = 128
const MAX_PLATFORM_VALUES = 16
const RESERVED_ID_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= maxLength
    && [...value].every((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && APP_ID_PATTERN.test(value) && !RESERVED_ID_NAMES.has(value.toLocaleLowerCase())
}

function validStringList(value: unknown, maxLength: number, itemPattern?: RegExp, maxItems = MAX_PLATFORM_VALUES): value is string[] {
  if (!Array.isArray(value) || value.length > maxItems) return false
  const values = value.map((item) => typeof item === 'string' ? item.trim() : '')
  return values.every((item) => item.length > 0 && item.length <= maxLength && (!itemPattern || itemPattern.test(item)))
}

function parseWindowsPlatform(value: unknown): BasePlatformWindows | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['executables', 'publishers', 'appUserModelIds'])) return undefined
  const executables = value.executables === undefined || validStringList(value.executables, 128) ? value.executables : undefined
  const publishers = value.publishers === undefined || validStringList(value.publishers, 128) ? value.publishers : undefined
  const appUserModelIds = value.appUserModelIds === undefined || validStringList(value.appUserModelIds, 256) ? value.appUserModelIds : undefined
  if (value.executables !== undefined && executables === undefined) return undefined
  if (value.publishers !== undefined && publishers === undefined) return undefined
  if (value.appUserModelIds !== undefined && appUserModelIds === undefined) return undefined
  if (!executables?.length && !publishers?.length && !appUserModelIds?.length) return undefined
  return {
    ...(executables ? { executables: executables.map((item) => item.trim()) } : {}),
    ...(publishers ? { publishers: publishers.map((item) => item.trim()) } : {}),
    ...(appUserModelIds ? { appUserModelIds: appUserModelIds.map((item) => item.trim()) } : {}),
  }
}

function parseMacosPlatform(value: unknown): BasePlatformMacos | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['bundleIds']) || !validStringList(value.bundleIds, 256)) return undefined
  return { bundleIds: value.bundleIds.map((item) => item.trim()) }
}

export function parseAppTemplate(value: unknown): BaseAppTemplate | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'displayName', 'defaultAliases', 'platforms'])) return undefined
  if (!validId(value.id)) return undefined
  if (!validText(value.displayName, MAX_DISPLAY_NAME_LENGTH)) return undefined
  if (!validStringList(value.defaultAliases, 32, KEYWORD_PATTERN, 8)) return undefined
  const aliases = value.defaultAliases.map((item) => item.trim())
  const uniqueAliases = new Set(aliases.map((item) => item.toLocaleLowerCase()))
  if (uniqueAliases.size !== aliases.length) return undefined
  if (!isRecord(value.platforms) || !hasOnlyKeys(value.platforms, ['windows', 'macos'])) return undefined

  const windows = value.platforms.windows === undefined ? undefined : parseWindowsPlatform(value.platforms.windows)
  const macos = value.platforms.macos === undefined ? undefined : parseMacosPlatform(value.platforms.macos)
  if ((value.platforms.windows !== undefined && !windows) || (value.platforms.macos !== undefined && !macos)) return undefined
  if (!windows && !macos) return undefined

  return {
    id: value.id,
    displayName: value.displayName.trim(),
    defaultAliases: aliases,
    platforms: {
      ...(windows ? { windows } : {}),
      ...(macos ? { macos } : {}),
    },
  }
}

export function parseBaseCatalog(value: unknown): BaseCatalog | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'catalogVersion', 'apps', 'commands'])) return undefined
  if (value.schemaVersion !== 1 || !validText(value.catalogVersion, MAX_CATALOG_VERSION_LENGTH)) return undefined
  if (!Array.isArray(value.apps) || !Array.isArray(value.commands) || value.commands.length !== 0) return undefined

  const apps = value.apps.map(parseAppTemplate)
  if (apps.some((app): app is undefined => !app)) return undefined
  const ids = new Set<string>()
  for (const app of apps as BaseAppTemplate[]) {
    if (ids.has(app.id)) return undefined
    ids.add(app.id)
  }
  return {
    schemaVersion: 1,
    catalogVersion: value.catalogVersion.trim(),
    apps: apps as BaseAppTemplate[],
    commands: [],
  }
}

export const emptyBaseCatalog: BaseCatalog = {
  schemaVersion: 1,
  catalogVersion: 'empty',
  apps: [],
  commands: [],
}

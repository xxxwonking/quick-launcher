import { parseAppTemplate, type BaseAppTemplate } from './base-catalog'

export type PackageCommand =
  | { id: string; keyword: string; type: 'launch_app'; appRef: string; title?: string }
  | { id: string; keyword: string; type: 'open_url'; url: string; title?: string }
  | { id: string; keyword: string; type: 'web_search'; engine: 'default' | 'bing' | 'baidu' | 'google'; title?: string }
  | { id: string; keyword: string; type: 'web_search'; engine: 'custom'; template: string; title?: string }

export type CommandPackage = {
  schemaVersion: 1
  packageId: string
  name: string
  version: string
  apps: BaseAppTemplate[]
  commands: PackageCommand[]
}

const ID_PATTERN = /^[A-Za-z0-9._-]{1,96}$/u
const KEYWORD_PATTERN = /^[\p{L}\p{N}\p{Script=Han}_-]{1,32}$/u
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const MAX_STRING_LENGTH = 512
const MAX_APPS = 50
const MAX_JSON_DEPTH = 8
const RESERVED_ID_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !RESERVED_ID_NAMES.has(value.toLocaleLowerCase())
}

export function compareSemVer(left: string, right: string): number {
  const parse = (value: string): { core: number[]; pre: string[] } => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/u.exec(value)
    return { core: match ? match.slice(1, 4).map(Number) : [0, 0, 0], pre: match?.[4]?.split('.') ?? [] }
  }
  const leftValue = parse(left)
  const rightValue = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (leftValue.core[index] !== rightValue.core[index]) return (leftValue.core[index] ?? 0) - (rightValue.core[index] ?? 0)
  }
  if (leftValue.pre.length === 0 && rightValue.pre.length === 0) return 0
  if (leftValue.pre.length === 0) return 1
  if (rightValue.pre.length === 0) return -1
  for (let index = 0; index < Math.max(leftValue.pre.length, rightValue.pre.length); index += 1) {
    const leftPart = leftValue.pre[index]
    const rightPart = rightValue.pre[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumeric = /^\d+$/u.test(leftPart)
    const rightNumeric = /^\d+$/u.test(rightPart)
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart)
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function safeText(value: unknown, required = true): value is string {
  return typeof value === 'string'
    && (!required || value.trim().length > 0)
    && value.length <= MAX_STRING_LENGTH
    && [...value].every((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
}

function safeUrl(value: unknown): value is string {
  if (!safeText(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function safeTemplate(value: unknown): value is string {
  if (!safeText(value) || (value.match(/\{query\}/g) ?? []).length !== 1) return false
  return safeUrl(value.replace('{query}', 'query'))
}

function jsonDepth(value: unknown, depth = 1): number {
  if (!isRecord(value) && !Array.isArray(value)) return depth
  const children = Array.isArray(value) ? value : Object.values(value)
  return children.reduce((maximum, child) => Math.max(maximum, jsonDepth(child, depth + 1)), depth)
}

function parseCommand(value: unknown): PackageCommand | undefined {
  if (!isRecord(value) || !isSafeId(value.id) || typeof value.keyword !== 'string' || !KEYWORD_PATTERN.test(value.keyword) || (value.title !== undefined && !safeText(value.title))) return undefined
  const shared = { id: value.id, keyword: value.keyword.trim(), ...(value.title === undefined ? {} : { title: value.title.trim() }) }
  if (value.type === 'launch_app' && hasOnlyKeys(value, ['id', 'keyword', 'type', 'appRef', 'title']) && isSafeId(value.appRef)) {
    return { ...shared, type: 'launch_app', appRef: value.appRef }
  }
  if (value.type === 'open_url' && hasOnlyKeys(value, ['id', 'keyword', 'type', 'url', 'title']) && safeUrl(value.url)) {
    return { ...shared, type: 'open_url', url: value.url }
  }
  if (value.type !== 'web_search' || !hasOnlyKeys(value, ['id', 'keyword', 'type', 'engine', 'template', 'title'])) return undefined
  if (value.engine === 'custom') return safeTemplate(value.template) ? { ...shared, type: 'web_search', engine: 'custom', template: value.template } : undefined
  if ((value.engine === 'default' || value.engine === 'bing' || value.engine === 'baidu' || value.engine === 'google') && value.template === undefined) {
    return { ...shared, type: 'web_search', engine: value.engine }
  }
  return undefined
}

export function parseCommandPackage(value: unknown): CommandPackage | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['schemaVersion', 'packageId', 'name', 'version', 'apps', 'commands'])) return undefined
  if (jsonDepth(value) > MAX_JSON_DEPTH) return undefined
  const apps = value.apps ?? []
  const rawCommands = value.commands ?? []
  if (value.schemaVersion !== 1 || !isSafeId(value.packageId) || !safeText(value.name) || typeof value.version !== 'string' || !SEMVER_PATTERN.test(value.version) || !Array.isArray(apps) || apps.length > MAX_APPS || !Array.isArray(rawCommands) || rawCommands.length > 100) return undefined
  const parsedApps = apps.map(parseAppTemplate)
  if (parsedApps.some((app): app is undefined => !app)) return undefined
  const appIds = new Set<string>()
  for (const app of parsedApps as BaseAppTemplate[]) {
    if (appIds.has(app.id)) return undefined
    appIds.add(app.id)
  }
  const commands = rawCommands.map(parseCommand)
  if (commands.some((command): command is undefined => !command)) return undefined
  const ids = new Set<string>()
  const keywords = new Set<string>()
  for (const command of commands as PackageCommand[]) {
    const keyword = command.keyword.toLocaleLowerCase()
    if (ids.has(command.id) || keywords.has(keyword)) return undefined
    ids.add(command.id)
    keywords.add(keyword)
  }
  return {
    schemaVersion: 1,
    packageId: value.packageId,
    name: value.name.trim(),
    version: value.version,
    apps: parsedApps as BaseAppTemplate[],
    commands: commands as PackageCommand[],
  }
}

import type { SearchEngine } from '../shared/launcher-settings'
import type {
  ApplicationArgumentTarget,
  ClipboardTransformOperation,
  SiteSearchProvider,
  SystemActionOperation,
} from '../shared/launcher-item'
import type { UserCommand } from '../shared/launcher-command'

export type { SearchEngine } from '../shared/launcher-settings'

export type ApplicationDefinition = {
  targetId: string
  displayName: string
  aliases: readonly string[]
}

export type ParsedExecutableAction =
  | { kind: 'application'; targetId: string }
  | { kind: 'indexed-application'; targetId: string }
  | { kind: 'open-url'; url: string }
  | { kind: 'web-search'; query: string }
  | { kind: 'site-search'; provider: SiteSearchProvider; query: string }
  | { kind: 'command-site-search'; commandId: string; query: string }
  | { kind: 'command-launch-app'; commandId: string }
  | { kind: 'open-path'; path: string }
  | { kind: 'indexed-path'; targetId: string }
  | { kind: 'copy-text'; text: string }
  | { kind: 'clipboard-transform'; operation: ClipboardTransformOperation; input?: string }
  | { kind: 'application-argument'; application: ApplicationArgumentTarget; path: string }
  | { kind: 'system-action'; operation: SystemActionOperation }
  | { kind: 'settings' }
  | { kind: 'tutorial' }

const APPLICATION_DEFINITIONS: readonly ApplicationDefinition[] = [
  { targetId: 'vscode', displayName: 'VS Code', aliases: ['vscode', 'code', 'visual studio code', 'vsc', 'vs code'] },
  { targetId: 'wechat', displayName: '微信', aliases: ['wx', 'wechat', 'weixin', '微信'] },
  { targetId: 'cursor', displayName: 'Cursor', aliases: ['cursor'] },
  { targetId: 'system-info', displayName: 'System Info', aliases: ['sysinfo', 'system info', 'systeminfo'] },
  { targetId: 'projects', displayName: 'Projects', aliases: ['projects', 'project'] },
]

const MAX_QUERY_CODE_POINTS = 512
const SITE_SEARCH_BASE_URLS: Record<SiteSearchProvider, string> = {
  douyin: 'https://www.douyin.com/search',
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const hasUnsafeControl = (value: string): boolean => Array.from(value).some((character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return (codePoint >= 0 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f)
})

const isHttpUrl = (value: string): boolean => {
  if (hasUnsafeControl(value)) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const isAbsoluteUserPath = (value: string): boolean => (
  value.length > 0
  && value.length <= 4096
  && !value.includes('\0')
  && (value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/u.test(value))
)

const CLIPBOARD_OPERATIONS = new Set<ClipboardTransformOperation>([
  'format-json', 'url-encode', 'url-decode', 'base64-encode', 'base64-decode', 'uppercase', 'lowercase',
])
const APPLICATION_ARGUMENT_TARGETS = new Set<ApplicationArgumentTarget>(['vscode', 'terminal'])
const SYSTEM_ACTION_OPERATIONS = new Set<SystemActionOperation>(['lock-screen', 'sleep', 'screenshot', 'open-system-settings'])

export function isValidSearchTemplate(template: string): boolean {
  const placeholders = template.match(/\{query\}/g) ?? []
  return placeholders.length === 1 && isHttpUrl(template.replace('{query}', 'query'))
}

export function normalizeSearchEngine(value: unknown): SearchEngine {
  if (!isRecord(value) || typeof value.kind !== 'string') return { kind: 'bing' }
  if (value.kind === 'bing' || value.kind === 'baidu' || value.kind === 'google') return { kind: value.kind }
  if (value.kind !== 'custom' || typeof value.template !== 'string') return { kind: 'bing' }
  const template = value.template
  if (!isValidSearchTemplate(template)) return { kind: 'bing' }
  return { kind: 'custom', template }
}

export function buildSearchUrl(engineValue: unknown, query: string): string {
  const engine = normalizeSearchEngine(engineValue)
  const encodedQuery = encodeURIComponent(query)
  if (engine.kind === 'baidu') return `https://www.baidu.com/s?wd=${encodedQuery}`
  if (engine.kind === 'google') return `https://www.google.com/search?q=${encodedQuery}`
  if (engine.kind === 'custom') return engine.template.replace('{query}', encodedQuery)
  return `https://www.bing.com/search?q=${encodedQuery}`
}

export function buildSiteSearchUrl(provider: SiteSearchProvider, query: string): string {
  const encodedQuery = encodeURIComponent(query)
  return `${SITE_SEARCH_BASE_URLS[provider]}/${encodedQuery}?type=general`
}

export function buildUserCommandSiteSearchUrl(
  commands: readonly UserCommand[],
  commandId: string,
  query: string,
): string | undefined {
  const command = commands.find((candidate) => candidate.id === commandId && candidate.enabled && candidate.type === 'site-search')
  if (!command || !isValidSearchTemplate(command.target)) return undefined
  return command.target.replace('{query}', encodeURIComponent(query))
}

export function findApplicationDefinition(targetId: string): ApplicationDefinition | undefined {
  return APPLICATION_DEFINITIONS.find((definition) => definition.targetId === targetId)
}

export function listApplicationDefinitions(): readonly ApplicationDefinition[] {
  return APPLICATION_DEFINITIONS
}

export function parseExecutableAction(value: unknown): ParsedExecutableAction | undefined {
  if (!isRecord(value) || !isRecord(value.action) || typeof value.id !== 'string' || typeof value.action.type !== 'string') return undefined
  const action = value.action
  if (action.type === 'launch-demo' && typeof action.targetId === 'string' && findApplicationDefinition(action.targetId)) {
    return { kind: 'application', targetId: action.targetId }
  }
  if (action.type === 'launch-indexed' && typeof action.targetId === 'string' && /^shortcut:[a-f0-9]{20}$/u.test(action.targetId)) {
    return { kind: 'indexed-application', targetId: action.targetId }
  }
  if (action.type === 'open-url' && typeof action.url === 'string' && isSafeExternalUrl(action.url)) {
    return { kind: 'open-url', url: action.url }
  }
  if (action.type === 'web-search' && typeof action.query === 'string') {
    const query = action.query.trim()
    if (Array.from(query).length > MAX_QUERY_CODE_POINTS || hasUnsafeControl(query)) return undefined
    return { kind: 'web-search', query }
  }
  if (action.type === 'site-search' && action.provider === 'douyin' && typeof action.query === 'string') {
    const query = action.query.trim()
    if (!query || Array.from(query).length > MAX_QUERY_CODE_POINTS || hasUnsafeControl(query)) return undefined
    return { kind: 'site-search', provider: action.provider, query }
  }
  if (action.type === 'command-site-search' && typeof action.commandId === 'string' && /^[A-Za-z0-9._-]{1,96}$/u.test(action.commandId) && typeof action.query === 'string') {
    const query = action.query.trim()
    if (!query || Array.from(query).length > MAX_QUERY_CODE_POINTS || hasUnsafeControl(query)) return undefined
    return { kind: 'command-site-search', commandId: action.commandId, query }
  }
  if (action.type === 'command-launch-app' && typeof action.commandId === 'string' && /^[A-Za-z0-9._-]{1,96}$/u.test(action.commandId)) {
    return { kind: 'command-launch-app', commandId: action.commandId }
  }
  if (action.type === 'open-path' && typeof action.path === 'string' && isAbsoluteUserPath(action.path)) {
    return { kind: 'open-path', path: action.path }
  }
  if (action.type === 'open-indexed-path' && typeof action.targetId === 'string' && /^path:[a-f0-9]{20}$/u.test(action.targetId)) {
    return { kind: 'indexed-path', targetId: action.targetId }
  }
  if (action.type === 'copy-text' && typeof action.text === 'string' && action.text.length <= 100_000 && !action.text.includes('\0')) {
    return { kind: 'copy-text', text: action.text }
  }
  if (action.type === 'clipboard-transform' && typeof action.operation === 'string' && CLIPBOARD_OPERATIONS.has(action.operation as ClipboardTransformOperation)) {
    if (action.input !== undefined && (typeof action.input !== 'string' || action.input.length > 100_000 || action.input.includes('\0'))) return undefined
    return {
      kind: 'clipboard-transform',
      operation: action.operation as ClipboardTransformOperation,
      ...(typeof action.input === 'string' ? { input: action.input } : {}),
    }
  }
  if (action.type === 'application-argument' && typeof action.application === 'string' && APPLICATION_ARGUMENT_TARGETS.has(action.application as ApplicationArgumentTarget) && typeof action.path === 'string' && isAbsoluteUserPath(action.path)) {
    return { kind: 'application-argument', application: action.application as ApplicationArgumentTarget, path: action.path }
  }
  if (action.type === 'system-action' && typeof action.operation === 'string' && SYSTEM_ACTION_OPERATIONS.has(action.operation as SystemActionOperation)) {
    return { kind: 'system-action', operation: action.operation as SystemActionOperation }
  }
  if (action.type === 'open-settings') return { kind: 'settings' }
  if (action.type === 'open-tutorial') return { kind: 'tutorial' }
  return undefined
}

export function isSafeExternalUrl(value: string): boolean {
  return isHttpUrl(value)
}

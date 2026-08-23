export type SearchEngine =
  | { kind: 'bing' }
  | { kind: 'baidu' }
  | { kind: 'google' }
  | { kind: 'custom'; template: string }

export type ApplicationDefinition = {
  targetId: string
  displayName: string
  aliases: readonly string[]
}

export type ParsedExecutableAction =
  | { kind: 'application'; targetId: string }
  | { kind: 'indexed-application'; targetId: string }
  | { kind: 'web-search'; query: string }
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

export function normalizeSearchEngine(value: unknown): SearchEngine {
  if (!isRecord(value) || typeof value.kind !== 'string') return { kind: 'bing' }
  if (value.kind === 'bing' || value.kind === 'baidu' || value.kind === 'google') return { kind: value.kind }
  if (value.kind !== 'custom' || typeof value.template !== 'string') return { kind: 'bing' }
  const template = value.template
  const placeholders = template.match(/\{query\}/g) ?? []
  if (placeholders.length !== 1 || !isHttpUrl(template.replace('{query}', 'query'))) return { kind: 'bing' }
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
  if (action.type === 'web-search' && typeof action.query === 'string') {
    const query = action.query.trim()
    if (Array.from(query).length > MAX_QUERY_CODE_POINTS || hasUnsafeControl(query)) return undefined
    return { kind: 'web-search', query }
  }
  if (action.type === 'open-settings') return { kind: 'settings' }
  if (action.type === 'open-tutorial') return { kind: 'tutorial' }
  return undefined
}

export function isSafeExternalUrl(value: string): boolean {
  return isHttpUrl(value)
}

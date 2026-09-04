import type { LauncherItem } from '../../../shared/launcher-item'
import { productivityCommand } from './productivity-commands'

export type { LaunchAction, LauncherIcon, LauncherItem } from '../../../shared/launcher-item'

type SearchCandidate = LauncherItem & { score: number; order: number }
const MAX_SEARCH_INPUT_LENGTH = 512

export type SearchDisplayOptions = {
  showRecent?: boolean
  recentItems?: readonly LauncherItem[]
}

const BUILTIN_COMMANDS: LauncherItem[] = [
  {
    id: 'builtin:settings',
    title: '打开设置',
    subtitle: 'Quick Launcher 设置',
    aliases: ['setting', 'settings', '设置'],
    icon: 'settings',
    kind: 'builtin',
    action: { type: 'open-settings' },
  },
  {
    id: 'builtin:tutorial',
    title: '打开使用教程',
    subtitle: '重新体验漫游式引导',
    aliases: ['tutorial', 'help', '教程', '帮助'],
    icon: 'book',
    kind: 'builtin',
    action: { type: 'open-tutorial' },
  },
]

const normalize = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()

function splitFirstToken(value: string): { token: string; rest: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(trimmed)
  if (!match?.[1]) return undefined
  return { token: match[1], rest: match[2]?.trim() ?? '' }
}

function damerauLevenshtein(left: string, right: string, limit: number): number {
  const source = [...left]
  const target = [...right]
  if (Math.abs(source.length - target.length) > limit) return limit + 1

  let previousPrevious: number[] | undefined
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index)
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const current = [sourceIndex]
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitution = (previous[targetIndex - 1] ?? limit + 1) + (source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1)
      const insertion = (current[targetIndex - 1] ?? limit + 1) + 1
      const deletion = (previous[targetIndex] ?? limit + 1) + 1
      let value = Math.min(substitution, insertion, deletion)
      if (
        sourceIndex > 1
        && targetIndex > 1
        && source[sourceIndex - 1] === target[targetIndex - 2]
        && source[sourceIndex - 2] === target[targetIndex - 1]
        && previousPrevious
      ) {
        const transposition = previousPrevious[targetIndex - 2]
        if (transposition !== undefined) value = Math.min(value, transposition + 1)
      }
      current.push(value)
    }
    previousPrevious = previous
    previous = current
  }
  return previous[target.length] ?? limit + 1
}

const scoreCandidate = (query: string, item: LauncherItem): number => {
  const normalized = normalize(query)
  const title = normalize(item.title)
  const aliases = item.aliases.map(normalize)
  if (aliases.includes(normalized)) return 1000
  if (title === normalized) return 950
  const aliasIndex = aliases.findIndex((alias) => alias.startsWith(normalized))
  if (aliasIndex >= 0) return 800 - aliasIndex
  if (title.startsWith(normalized)) return 750
  if (aliases.some((alias) => alias.includes(normalized))) return 600
  if (title.includes(normalized)) return 550
  const fuzzyLimit = normalized.length >= 3 && normalized.length <= 5 ? 1 : normalized.length > 5 ? 2 : 0
  if (fuzzyLimit > 0 && [title, ...aliases].some((candidate) => damerauLevenshtein(normalized, candidate, fuzzyLimit) <= fuzzyLimit)) return 400
  return -1
}

const makeWebFallback = (query: string): LauncherItem => ({
  id: 'web:fallback',
  title: `使用必应搜索“${query}”`,
  subtitle: '在浏览器中打开搜索结果',
  aliases: [],
  icon: 'globe',
  kind: 'web',
  action: { type: 'web-search', query },
  disabled: false,
})

const makeHint = (title: string, subtitle: string): LauncherItem => ({
  id: `hint:${title}`,
  title,
  subtitle,
  aliases: [],
  icon: 'globe',
  kind: 'hint',
  disabled: true,
  action: { type: 'web-search', query: '' },
})

function configuredSiteSearch(query: string, items: readonly LauncherItem[]): LauncherItem | undefined {
  const firstToken = splitFirstToken(query)
  if (!firstToken) return undefined
  for (const item of items) {
    if (item.action.type !== 'command-site-search') continue
    for (const alias of item.aliases) {
      const normalizedAlias = normalize(alias)
      if (!normalizedAlias) continue
      if (normalize(firstToken.token) !== normalizedAlias) continue
      if (!firstToken.rest) {
        return {
          ...item,
          title: `在${item.title}中搜索`,
          subtitle: `输入 ${alias} + 关键词`,
          kind: 'web',
          disabled: true,
          action: { ...item.action, query: '' },
        }
      }
      const siteQuery = firstToken.rest
      return {
        ...item,
        title: `在${item.title}搜索“${siteQuery}”`,
        subtitle: '使用默认浏览器打开站点搜索结果',
        kind: 'web',
        disabled: false,
        action: { ...item.action, query: siteQuery },
      }
    }
  }
  return undefined
}

export function searchLauncher(rawQuery: string, runtimeItems?: readonly LauncherItem[], options: SearchDisplayOptions = {}): LauncherItem[] {
  if ([...rawQuery].length > MAX_SEARCH_INPUT_LENGTH) return [makeHint('输入内容过长', `最多支持 ${MAX_SEARCH_INPUT_LENGTH} 个字符`)]
  const query = rawQuery.trim()
  const applications = runtimeItems ?? []
  if (!normalize(rawQuery)) return options.showRecent ? (options.recentItems ?? []).slice(0, 8) : []

  const configuredSearch = configuredSiteSearch(query, applications)
  if (configuredSearch) return [configuredSearch]

  const productivity = productivityCommand(query)
  if (productivity) return [productivity]

  const firstToken = splitFirstToken(query)
  if (firstToken && normalize(firstToken.token) === '抖音' && firstToken.rest) {
    const siteQuery = firstToken.rest
    if (siteQuery) {
      return [
        {
          id: 'site-search:douyin',
          title: `在抖音搜索“${siteQuery}”`,
          subtitle: '使用默认浏览器打开抖音搜索结果',
          aliases: ['抖音'],
          icon: 'globe',
          kind: 'web',
          action: { type: 'site-search', provider: 'douyin', query: siteQuery },
        },
      ]
    }
  }

  if (firstToken && normalize(firstToken.token) === 'llq') {
    const webQuery = firstToken.rest
    if (!webQuery) {
      return [makeHint('请输入搜索内容', '格式：llq + 关键词')]
    }
    return [
      {
        id: 'web:command',
        title: `使用必应搜索“${webQuery}”`,
        subtitle: '网页搜索',
        aliases: ['llq'],
        icon: 'globe',
        kind: 'web',
        action: { type: 'web-search', query: webQuery },
      },
    ]
  }

  const normalized = normalize(query)
  const candidates: SearchCandidate[] = [...BUILTIN_COMMANDS, ...applications]
    .map((item, order) => ({ ...item, score: scoreCandidate(normalized, item), order }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)

  const local = candidates.slice(0, 8).map(({ score: _score, order: _order, ...item }) => item)
  return [...local, makeWebFallback(query)]
}

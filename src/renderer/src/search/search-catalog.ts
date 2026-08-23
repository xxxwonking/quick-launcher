import type { LauncherItem } from '../../../shared/launcher-item'

export type { LaunchAction, LauncherIcon, LauncherItem } from '../../../shared/launcher-item'

type SearchCandidate = LauncherItem & { score: number; order: number }

const APPLICATIONS: LauncherItem[] = [
  {
    id: 'app:vscode',
    title: 'VS Code',
    subtitle: '应用程序',
    hint: 'vsc',
    aliases: ['vscode', 'code', 'visual studio code', 'vsc', 'vs code'],
    icon: 'code',
    kind: 'application',
    action: { type: 'launch-demo', targetId: 'vscode' },
  },
  {
    id: 'app:wechat',
    title: '微信',
    subtitle: '应用程序',
    hint: 'wx',
    aliases: ['wx', 'wechat', 'weixin', '微信'],
    icon: 'message',
    kind: 'application',
    action: { type: 'launch-demo', targetId: 'wechat' },
  },
  {
    id: 'app:cursor',
    title: 'Cursor',
    subtitle: '应用程序',
    hint: 'cursor',
    aliases: ['cursor'],
    icon: 'code',
    kind: 'application',
    action: { type: 'launch-demo', targetId: 'cursor' },
  },
  {
    id: 'app:system-info',
    title: 'System Info',
    subtitle: '命令',
    hint: 'sysinfo',
    aliases: ['sysinfo', 'system info', 'systeminfo'],
    icon: 'terminal',
    kind: 'command',
    action: { type: 'launch-demo', targetId: 'system-info' },
  },
  {
    id: 'app:projects',
    title: 'Projects',
    subtitle: '目录',
    hint: 'pinyin: projects',
    aliases: ['projects', 'project'],
    icon: 'folder',
    kind: 'application',
    action: { type: 'launch-demo', targetId: 'projects' },
  },
]

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

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

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

export function searchLauncher(rawQuery: string, runtimeItems?: readonly LauncherItem[]): LauncherItem[] {
  const query = rawQuery.trim()
  const applications = runtimeItems ?? APPLICATIONS
  if (!query) return applications.slice(0, 8)

  const commandMatch = query.match(/^llq(?:\s+(.+))?$/iu)
  if (commandMatch) {
    const webQuery = commandMatch[1]?.trim() ?? ''
    if (!webQuery) {
      return [
        {
          id: 'web:command',
          title: '使用必应搜索',
          subtitle: '输入 llq + 关键词进行网页搜索',
          aliases: ['llq'],
          icon: 'globe',
          kind: 'web',
          action: { type: 'web-search', query: '' },
        },
      ]
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

export const demoApplications = APPLICATIONS

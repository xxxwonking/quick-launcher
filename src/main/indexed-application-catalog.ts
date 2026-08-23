import { createHash } from 'node:crypto'
import { pinyin } from 'pinyin-pro'
import type { LauncherCatalogPayload, LauncherIcon, LauncherItem } from '../shared/launcher-item'
import { shortcutDisplayName, type ShortcutEntry } from './shortcut-index'

export type IndexedApplicationCatalog = {
  payload: LauncherCatalogPayload
  targets: ReadonlyMap<string, string>
}

function opaqueTargetId(path: string): string {
  const digest = createHash('sha256').update(path.toLocaleLowerCase()).digest('hex').slice(0, 20)
  return `shortcut:${digest}`
}

function applicationIcon(title: string): LauncherIcon {
  const normalized = title.toLocaleLowerCase()
  if (/微信|wechat|qq|telegram|discord/u.test(normalized)) return 'message'
  if (/code|cursor|trae|studio|开发|idea|webstorm/u.test(normalized)) return 'code'
  if (/terminal|powershell|cmd|shell|命令/u.test(normalized)) return 'terminal'
  if (/网盘|drive|explorer|文件|folder/u.test(normalized)) return 'folder'
  return 'code'
}

export function applicationAliases(title: string): string[] {
  const normalizedTitle = title.trim().toLocaleLowerCase()
  const syllables = pinyin(title, { type: 'array', toneType: 'none', nonZh: 'consecutive' })
  const initials = pinyin(title, { type: 'array', toneType: 'none', pattern: 'first', nonZh: 'consecutive' })
  const knownAliases = normalizedTitle === 'visual studio code'
    ? ['vscode', 'vsc', 'code']
    : normalizedTitle === '微信'
      ? ['wx', 'wechat', 'weixin']
      : []
  const values = [normalizedTitle, syllables.join(''), initials.join(''), ...knownAliases]
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index)
}

export function buildIndexedApplicationCatalog(entries: readonly ShortcutEntry[], snapshotVersion: number): IndexedApplicationCatalog {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path, 'en'))
  const seenNames = new Set<string>()
  const targets = new Map<string, string>()
  const items: LauncherItem[] = []

  for (const entry of sorted) {
    const title = shortcutDisplayName(entry.displayName)
    const normalizedName = title.toLocaleLowerCase()
    if (!title || seenNames.has(normalizedName)) continue
    seenNames.add(normalizedName)
    const targetId = opaqueTargetId(entry.path)
    const aliases = applicationAliases(title)
    const hint = aliases.find((alias) => alias !== normalizedName)
    targets.set(targetId, entry.path)
    items.push({
      id: targetId,
      title,
      subtitle: '应用程序',
      ...(hint ? { hint } : {}),
      aliases,
      icon: applicationIcon(title),
      kind: 'application',
      action: { type: 'launch-indexed', targetId },
    })
  }

  return { payload: { snapshotVersion, items }, targets }
}

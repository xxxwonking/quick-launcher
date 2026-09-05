import { createHash } from 'node:crypto'
import { pinyin } from 'pinyin-pro'
import type { LauncherCatalogPayload, LauncherIcon, LauncherItem } from '../shared/launcher-item'
import type { BaseAppTemplate } from '../shared/base-catalog'
import type { UserApplicationBinding } from '../shared/launcher-command'
import { shortcutDisplayName, type ShortcutEntry, type ShortcutMetadata } from './shortcut-index'

export type IndexedApplicationCatalog = {
  payload: LauncherCatalogPayload
  targets: ReadonlyMap<string, string>
  templateTargets: ReadonlyMap<string, string>
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

export function matchesBaseTemplate(title: string, metadata: ShortcutMetadata | undefined, app: BaseAppTemplate): boolean {
  const normalizedTitle = title.trim().toLocaleLowerCase()
  const titleMatches = app.displayName.toLocaleLowerCase() === normalizedTitle || app.defaultAliases.some((alias) => alias.toLocaleLowerCase() === normalizedTitle)
  if (!metadata) return titleMatches

  if (metadata.platform === 'macos') {
    const macos = app.platforms.macos
    if (!macos) return false
    const bundleIdMatches = Boolean(metadata.bundleId && macos.bundleIds.some((bundleId) => bundleId.toLocaleLowerCase() === metadata.bundleId?.toLocaleLowerCase()))
    if (metadata.bundleId && !bundleIdMatches) return false
    return titleMatches || bundleIdMatches
  }

  const windows = app.platforms.windows
  if (!windows) return false
  const executable = metadata.executableName?.split(/[\\/]/u).at(-1)?.toLocaleLowerCase()
  const executableMatches = Boolean(executable && windows.executables?.some((name) => name.toLocaleLowerCase() === executable))
  const publisherMatches = Boolean(metadata.publisher && windows.publishers?.some((publisher) => publisher.toLocaleLowerCase() === metadata.publisher?.toLocaleLowerCase()))
  const appUserModelIdMatches = Boolean(metadata.appUserModelId && windows.appUserModelIds?.some((id) => id.toLocaleLowerCase() === metadata.appUserModelId?.toLocaleLowerCase()))
  if (windows.appUserModelIds?.length) {
    if (!metadata.appUserModelId || !appUserModelIdMatches) return false
    return true
  }
  if (titleMatches && !windows.executables?.length && !windows.publishers?.length) return true
  if (!executableMatches) return false
  if (windows.publishers?.length) return Boolean(metadata.publisher && publisherMatches)
  return true
}

export function applicationAliases(title: string, baseApps: readonly BaseAppTemplate[] = [], metadata?: ShortcutMetadata): string[] {
  const normalizedTitle = title.trim().toLocaleLowerCase()
  const syllables = pinyin(title, { type: 'array', toneType: 'none', nonZh: 'consecutive' })
  const initials = pinyin(title, { type: 'array', toneType: 'none', pattern: 'first', nonZh: 'consecutive' })
  const baseTemplate = baseApps.find((app) => (
    matchesBaseTemplate(title, metadata, app)
  ))
  const values = [
    normalizedTitle,
    syllables.join(''),
    initials.join(''),
    ...(baseTemplate ? [baseTemplate.displayName.toLocaleLowerCase(), ...baseTemplate.defaultAliases] : []),
  ]
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index)
}

export function buildIndexedApplicationCatalog(
  entries: readonly ShortcutEntry[],
  snapshotVersion: number,
  baseApps: readonly BaseAppTemplate[] = [],
  appBindings: Readonly<Record<string, UserApplicationBinding>> = {},
): IndexedApplicationCatalog {
  const boundTemplateByPath = new Map<string, BaseAppTemplate>()
  const boundEntries = baseApps.flatMap((app): ShortcutEntry[] => {
    const binding = appBindings[app.id]
    if (!binding) return []
    boundTemplateByPath.set(binding.path, app)
    return [{
      displayName: app.displayName,
      path: binding.path,
      metadata: { platform: binding.platform },
    }]
  })
  const sorted = [...boundEntries, ...[...entries].sort((left, right) => left.path.localeCompare(right.path, 'en'))]
  const seenNames = new Set<string>()
  const targets = new Map<string, string>()
  const templateTargets = new Map<string, string>()
  const items: LauncherItem[] = []

  for (const entry of sorted) {
    const title = shortcutDisplayName(entry.displayName)
    const normalizedName = title.toLocaleLowerCase()
    if (!title || seenNames.has(normalizedName)) continue
    seenNames.add(normalizedName)
    const targetId = opaqueTargetId(entry.path)
    const boundTemplate = boundTemplateByPath.get(entry.path)
    const aliases = [...new Set([
      ...applicationAliases(title, baseApps, entry.metadata),
      ...(boundTemplate?.defaultAliases ?? []),
    ])]
    const hint = aliases.find((alias) => alias !== normalizedName)
    targets.set(targetId, entry.path)
    for (const app of baseApps) {
      if (matchesBaseTemplate(title, entry.metadata, app) && !templateTargets.has(app.id)) templateTargets.set(app.id, targetId)
    }
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

  for (const app of baseApps) {
    const binding = appBindings[app.id]
    if (!binding) continue
    const targetId = opaqueTargetId(binding.path)
    if (targets.has(targetId)) templateTargets.set(app.id, targetId)
  }

  return { payload: { snapshotVersion, items }, targets, templateTargets }
}

// Match every template, including disabled aliases, against the same local index.
// Reuse hydrated icons without reading application files again or exposing paths.
export function withBaseTemplateIcons(
  apps: readonly BaseAppTemplate[],
  entries: readonly ShortcutEntry[],
  catalog: LauncherCatalogPayload,
  appBindings: Readonly<Record<string, UserApplicationBinding>> = {},
): Array<BaseAppTemplate & { iconData?: string }> {
  const { templateTargets } = buildIndexedApplicationCatalog(entries, catalog.snapshotVersion, apps, appBindings)
  const icons = new Map(catalog.items.filter((item) => item.kind === 'application' && item.iconData).map((item) => [item.id, item.iconData]))
  return apps.map((app) => {
    const targetId = templateTargets.get(app.id)
    const iconData = targetId ? icons.get(targetId) : undefined
    return { ...app, ...(iconData ? { iconData } : {}) }
  })
}

import { join } from 'node:path'

export function trayIconCandidates(resourcesPath: string, appPath: string): string[] {
  const candidates = resourcesPath.length > 0 ? [join(resourcesPath, 'quick-launcher-icon.png')] : []
  if (appPath.length > 0) candidates.push(join(appPath, 'build', 'icon.png'), join(appPath, 'src', 'renderer', 'public', 'quick-launcher-icon.png'))
  return [...new Set(candidates)]
}

export function resolveTrayIconPath(candidates: readonly string[], exists: (path: string) => boolean): string | undefined {
  return candidates.find((candidate) => {
    try {
      return exists(candidate)
    } catch {
      return false
    }
  })
}

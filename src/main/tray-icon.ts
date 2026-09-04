import { join } from 'node:path'

export const MACOS_TRAY_ICON_SIZE = 18

export type TrayIconImage = {
  isEmpty: () => boolean
  resize: (options: { width: number; height: number }) => unknown
  setTemplateImage?: (isTemplate: boolean) => void
}

export function adaptTrayIconForPlatform<T extends TrayIconImage>(platform: string, icon: T): T {
  if (platform !== 'darwin') return icon
  try {
    const resized = icon.resize({ width: MACOS_TRAY_ICON_SIZE, height: MACOS_TRAY_ICON_SIZE })
    if (!resized || typeof resized !== 'object' || typeof (resized as { isEmpty?: unknown }).isEmpty !== 'function') return icon
    return (resized as { isEmpty: () => boolean }).isEmpty() ? icon : resized as T
  } catch {
    return icon
  }
}

export function prepareTrayIconForPlatform<T extends TrayIconImage>(platform: string, icon: T): T {
  const preparedIcon = adaptTrayIconForPlatform(platform, icon)
  if (platform === 'darwin' && typeof preparedIcon.setTemplateImage === 'function') preparedIcon.setTemplateImage(false)
  return preparedIcon
}

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

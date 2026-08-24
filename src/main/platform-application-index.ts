import { defaultShortcutRoots, scanShortcutDirectories, type ShortcutIndex } from './shortcut-index'
import { scanMacApplicationDirectories } from './mac-application-index'

type PlatformApplicationScanners = {
  scanMac?: () => Promise<ShortcutIndex>
  scanWindows?: (roots: readonly string[]) => Promise<ShortcutIndex>
}

export async function scanPlatformApplications(
  platform: string,
  desktopPath: string,
  scanners: PlatformApplicationScanners = {},
): Promise<ShortcutIndex> {
  if (platform === 'darwin') return (scanners.scanMac ?? scanMacApplicationDirectories)()
  return (scanners.scanWindows ?? scanShortcutDirectories)(defaultShortcutRoots(desktopPath))
}

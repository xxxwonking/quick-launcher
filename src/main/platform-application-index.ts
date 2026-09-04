import { homedir } from 'node:os'
import { defaultShortcutRoots, type ShortcutIndex } from './shortcut-index'
import { scanMacApplicationDirectories } from './mac-application-index'
import { defaultWindowsExecutableRoots, scanWindowsApplications } from './windows-application-index'

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
  return (scanners.scanWindows ?? scanWindowsApplications)(defaultShortcutRoots(desktopPath))
}

export function defaultApplicationWatchRoots(
  platform: string,
  desktopPath: string,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const roots = platform === 'darwin'
    ? ['/Applications', `${environment.HOME ?? homedir()}/Applications`, '/System/Applications']
    : platform === 'win32'
      ? [...defaultShortcutRoots(desktopPath), ...defaultWindowsExecutableRoots(environment)]
      : []
  return roots.filter((root, index) => root.length > 0 && roots.indexOf(root) === index)
}

import type { FileIconLoader, NativeIcon } from './application-icons'

type ShortcutDetails = { target?: string }
type ShortcutTargetLoader = (path: string) => ShortcutDetails

export function createPlatformIconLoader(
  platform: string,
  getFileIcon?: FileIconLoader,
  readShortcutLink?: ShortcutTargetLoader,
): FileIconLoader | undefined {
  if (!getFileIcon) return undefined
  if (platform !== 'win32') return getFileIcon

  return async (path, options): Promise<NativeIcon> => {
    let targetPath: string | undefined
    if (/\.lnk$/iu.test(path) && readShortcutLink) {
      try {
        targetPath = readShortcutLink(path).target
      } catch {
        targetPath = undefined
      }
    }

    if (targetPath) {
      try {
        return await getFileIcon(targetPath, options)
      } catch {
        // Fall back to the shortcut itself when its target is unavailable.
      }
    }
    return getFileIcon(path, options)
  }
}

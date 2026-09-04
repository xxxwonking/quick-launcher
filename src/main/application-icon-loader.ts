import type { FileIconLoader, NativeIcon } from './application-icons'

type ShortcutDetails = { icon?: string; target?: string; args?: string; appUserModelId?: string }
type ShortcutTargetLoader = (path: string) => ShortcutDetails

function shortcutAppUserModelId(details: ShortcutDetails): string | undefined {
  if (details.appUserModelId) return details.appUserModelId.trim() || undefined
  return /shell:AppsFolder[\\/]([A-Za-z0-9._-]+![A-Za-z0-9._-]+)/iu.exec(`${details.target ?? ''} ${details.args ?? ''}`)?.[1]
}

export function createPlatformIconLoader(
  platform: string,
  getFileIcon?: FileIconLoader,
  readShortcutLink?: ShortcutTargetLoader,
): FileIconLoader | undefined {
  if (!getFileIcon) return undefined
  if (platform !== 'win32') return getFileIcon

  return async (path, options): Promise<NativeIcon> => {
    let shortcutDetails: ShortcutDetails = {}
    if (/\.lnk$/iu.test(path) && readShortcutLink) {
      try {
        shortcutDetails = readShortcutLink(path)
      } catch {
        shortcutDetails = {}
      }
    }

    const appUserModelId = shortcutAppUserModelId(shortcutDetails)
    const shellAppPath = appUserModelId ? `shell:AppsFolder\\${appUserModelId}` : undefined
    const seen = new Set<string>()
    const candidates = [shortcutDetails.icon, shellAppPath, shortcutDetails.target, path].filter((candidate): candidate is string => {
      if (!candidate) return false
      const key = candidate.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    let lastError: unknown = new Error('No icon candidates available')
    for (const candidate of candidates) {
      try {
        const icon = await getFileIcon(candidate, options)
        if (icon.toDataURL()) return icon
        lastError = new Error(`Empty icon for ${candidate}`)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}

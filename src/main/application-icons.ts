import type { LauncherCatalogPayload } from '../shared/launcher-item'

export type NativeIcon = {
  toDataURL: () => string
}

export type FileIconLoader = (path: string, options: { size: 'normal' }) => Promise<NativeIcon>
export type IconDataLoader = (path: string) => Promise<string | undefined>

const MAX_ICON_DATA_URL_LENGTH = 256 * 1024

function isPublishableIconData(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_ICON_DATA_URL_LENGTH
    && /^data:image\/[a-z0-9.+-]+;base64,/iu.test(value)
}

export function createCoalescedIconLoader(loadIcon: FileIconLoader): FileIconLoader {
  const pendingLoads = new Map<string, Promise<NativeIcon>>()

  return async (path, options): Promise<NativeIcon> => {
    const key = `${options.size}\0${path}`
    let pending = pendingLoads.get(key)
    if (!pending) {
      try {
        pending = Promise.resolve(loadIcon(path, options))
      } catch (error) {
        pending = Promise.reject(error)
      }
      pendingLoads.set(key, pending)
    }

    try {
      return await pending
    } finally {
      if (pendingLoads.get(key) === pending) pendingLoads.delete(key)
    }
  }
}

export function createSuccessfulIconLoader(loadIconData: IconDataLoader): FileIconLoader {
  const cache = new Map<string, string>()
  const pendingLoads = new Map<string, Promise<string | undefined>>()

  return async (path): Promise<NativeIcon> => {
    const cached = cache.get(path)
    if (cached) return { toDataURL: () => cached }

    let pending = pendingLoads.get(path)
    if (!pending) {
      try {
        pending = Promise.resolve(loadIconData(path))
      } catch (error) {
        pending = Promise.reject(error)
      }
      pendingLoads.set(path, pending)
    }

    try {
      const iconData = await pending
      if (iconData) cache.set(path, iconData)
      return { toDataURL: () => iconData ?? '' }
    } finally {
      if (pendingLoads.get(path) === pending) pendingLoads.delete(path)
    }
  }
}

export async function withApplicationIcons(
  catalog: LauncherCatalogPayload,
  targets: ReadonlyMap<string, string>,
  getFileIcon?: FileIconLoader,
  concurrency = 6,
): Promise<LauncherCatalogPayload> {
  if (!getFileIcon) return catalog

  const items = [...catalog.items]
  let nextIndex = 0
  const hydrateNext = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (!item || item.action.type !== 'launch-indexed') continue
      const targetPath = targets.get(item.action.targetId)
      if (!targetPath) continue

      try {
        const nativeIcon = await getFileIcon(targetPath, { size: 'normal' })
        const iconData = nativeIcon.toDataURL()
        if (isPublishableIconData(iconData)) items[index] = { ...item, iconData }
      } catch {
        // Keep the fallback glyph when the operating system cannot provide an icon.
      }
    }
  }

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)))
  await Promise.all(Array.from({ length: workerCount }, () => hydrateNext()))

  return { ...catalog, items }
}

export function hydrateApplicationIconsInBackground(
  catalog: LauncherCatalogPayload,
  targets: ReadonlyMap<string, string>,
  getFileIcon: FileIconLoader,
  onHydrated: (catalog: LauncherCatalogPayload) => void,
  onError: (error: unknown) => void = () => undefined,
): Promise<void> {
  return withApplicationIcons(catalog, targets, getFileIcon).then(onHydrated, onError)
}

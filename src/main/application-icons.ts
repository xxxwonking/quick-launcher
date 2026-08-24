import type { LauncherCatalogPayload } from '../shared/launcher-item'

export type NativeIcon = {
  toDataURL: () => string
}

export type FileIconLoader = (path: string, options: { size: 'normal' }) => Promise<NativeIcon>

export async function withApplicationIcons(
  catalog: LauncherCatalogPayload,
  targets: ReadonlyMap<string, string>,
  getFileIcon?: FileIconLoader,
): Promise<LauncherCatalogPayload> {
  if (!getFileIcon) return catalog

  const items = await Promise.all(catalog.items.map(async (item) => {
    if (item.action.type !== 'launch-indexed') return item
    const targetPath = targets.get(item.action.targetId)
    if (!targetPath) return item

    try {
      const nativeIcon = await getFileIcon(targetPath, { size: 'normal' })
      const iconData = nativeIcon.toDataURL()
      return iconData ? { ...item, iconData } : item
    } catch {
      return item
    }
  }))

  return { ...catalog, items }
}

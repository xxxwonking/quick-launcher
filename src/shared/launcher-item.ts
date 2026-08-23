export type LaunchAction =
  | { type: 'launch-demo'; targetId: string }
  | { type: 'launch-indexed'; targetId: string }
  | { type: 'open-settings' }
  | { type: 'open-tutorial' }
  | { type: 'web-search'; query: string }

export type LauncherIcon = 'code' | 'message' | 'terminal' | 'folder' | 'settings' | 'book' | 'globe'

export type LauncherItem = {
  id: string
  title: string
  subtitle: string
  hint?: string
  aliases: string[]
  icon: LauncherIcon
  kind: 'application' | 'command' | 'builtin' | 'web'
  action: LaunchAction
  disabled?: boolean
}

export type LauncherCatalogPayload = {
  snapshotVersion: number
  items: LauncherItem[]
}

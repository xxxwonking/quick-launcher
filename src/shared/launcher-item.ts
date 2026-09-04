export type SiteSearchProvider = 'douyin'
export type ClipboardTransformOperation =
  | 'format-json'
  | 'url-encode'
  | 'url-decode'
  | 'base64-encode'
  | 'base64-decode'
  | 'uppercase'
  | 'lowercase'
export type ApplicationArgumentTarget = 'vscode' | 'terminal'
export type SystemActionOperation = 'lock-screen' | 'sleep' | 'screenshot' | 'open-system-settings'

export type LaunchAction =
  | { type: 'launch-demo'; targetId: string }
  | { type: 'launch-indexed'; targetId: string }
  | { type: 'open-settings' }
  | { type: 'open-tutorial' }
  | { type: 'open-url'; url: string }
  | { type: 'web-search'; query: string }
  | { type: 'site-search'; provider: SiteSearchProvider; query: string }
  | { type: 'command-site-search'; commandId: string; query: string }
  | { type: 'command-launch-app'; commandId: string }
  | { type: 'open-path'; path: string }
  | { type: 'open-indexed-path'; targetId: string }
  | { type: 'copy-text'; text: string }
  | { type: 'clipboard-transform'; operation: ClipboardTransformOperation; input?: string }
  | { type: 'application-argument'; application: ApplicationArgumentTarget; path: string }
  | { type: 'system-action'; operation: SystemActionOperation }

export type LauncherIcon = 'code' | 'message' | 'terminal' | 'folder' | 'file' | 'settings' | 'book' | 'globe' | 'clipboard'

export type LauncherItem = {
  id: string
  title: string
  subtitle: string
  hint?: string
  aliases: string[]
  icon: LauncherIcon
  iconData?: string
  kind: 'application' | 'command' | 'builtin' | 'web' | 'history' | 'file' | 'hint'
  action: LaunchAction
  disabled?: boolean
}

export type LauncherCatalogPayload = {
  snapshotVersion: number
  items: LauncherItem[]
}

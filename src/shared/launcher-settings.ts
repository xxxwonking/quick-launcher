export type ThemePreference = 'system' | 'light' | 'dark'

export type SearchEngine =
  | { kind: 'bing' }
  | { kind: 'baidu' }
  | { kind: 'google' }
  | { kind: 'custom'; template: string }

export type LauncherSettings = {
  schemaVersion: 1
  onboardingCompleted: boolean
  hotkey: string
  autostart: boolean
  showRecent: boolean
  clipboardHistoryEnabled: boolean
  fileHistoryEnabled: boolean
  fileSearchRoots: string[]
  disabledBaseAppIds: string[]
  theme: ThemePreference
  searchEngine: SearchEngine
}

export type LauncherSettingsPatch = Partial<Pick<LauncherSettings, 'onboardingCompleted' | 'hotkey' | 'autostart' | 'showRecent' | 'clipboardHistoryEnabled' | 'fileHistoryEnabled' | 'fileSearchRoots' | 'disabledBaseAppIds' | 'theme' | 'searchEngine'>>

export type LauncherSettingsSnapshot = LauncherSettings & {
  activeHotkey: string | null
  hotkeyConflict: boolean
}

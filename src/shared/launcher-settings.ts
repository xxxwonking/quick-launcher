export type ThemePreference = 'system' | 'light' | 'dark'

export type SearchEngine =
  | { kind: 'bing' }
  | { kind: 'baidu' }
  | { kind: 'google' }
  | { kind: 'custom'; template: string }

export type LauncherSettings = {
  schemaVersion: 1
  hotkey: string
  autostart: boolean
  showRecent: boolean
  theme: ThemePreference
  searchEngine: SearchEngine
}

export type LauncherSettingsPatch = Partial<Pick<LauncherSettings, 'hotkey' | 'autostart' | 'showRecent' | 'theme' | 'searchEngine'>>

export type LauncherSettingsSnapshot = LauncherSettings & {
  activeHotkey: string | null
  hotkeyConflict: boolean
}

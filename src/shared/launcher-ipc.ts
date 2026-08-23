export const IPC_CHANNELS = {
  openSettings: 'launcher:open-settings',
  openTutorial: 'launcher:open-tutorial',
  hide: 'launcher:hide',
  getTheme: 'launcher:get-theme',
  setTheme: 'launcher:set-theme',
  themeChanged: 'launcher:theme-changed',
  focusRequested: 'launcher:focus-requested',
  execute: 'launcher:execute',
  refreshApplications: 'launcher:refresh-applications',
  getHotkeyStatus: 'launcher:get-hotkey-status',
  getCatalog: 'launcher:get-catalog',
  catalogChanged: 'launcher:catalog-changed',
} as const

export type ThemePreference = 'system' | 'light' | 'dark'

export function parseThemePreference(value: unknown): ThemePreference | undefined {
  return value === 'system' || value === 'light' || value === 'dark' ? value : undefined
}

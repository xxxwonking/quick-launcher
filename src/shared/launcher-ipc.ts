import type { ThemePreference } from './launcher-settings'

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
  getSettings: 'launcher:get-settings',
  updateSettings: 'launcher:update-settings',
  getCommands: 'launcher:get-commands',
  createCommand: 'launcher:create-command',
  updateCommand: 'launcher:update-command',
  setCommandEnabled: 'launcher:set-command-enabled',
  deleteCommand: 'launcher:delete-command',
} as const

export { type LauncherSettingsPatch, type LauncherSettingsSnapshot, type SearchEngine, type ThemePreference } from './launcher-settings'
export type { UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from './launcher-command'

export function parseThemePreference(value: unknown): ThemePreference | undefined {
  return value === 'system' || value === 'light' || value === 'dark' ? value : undefined
}

import type { ThemePreference } from './launcher-settings'
import type { BaseAppTemplate } from './base-catalog'

export const IPC_CHANNELS = {
  openSettings: 'launcher:open-settings',
  openTutorial: 'launcher:open-tutorial',
  hide: 'launcher:hide',
  getTheme: 'launcher:get-theme',
  setTheme: 'launcher:set-theme',
  themeChanged: 'launcher:theme-changed',
  focusRequested: 'launcher:focus-requested',
  resizeSearchWindow: 'launcher:resize-search-window',
  execute: 'launcher:execute',
  copyGeneratedUrl: 'launcher:copy-generated-url',
  selectFileSearchRoot: 'launcher:select-file-search-root',
  refreshApplications: 'launcher:refresh-applications',
  relocateApplication: 'launcher:relocate-application',
  getHotkeyStatus: 'launcher:get-hotkey-status',
  getCatalog: 'launcher:get-catalog',
  catalogChanged: 'launcher:catalog-changed',
  getSettings: 'launcher:get-settings',
  updateSettings: 'launcher:update-settings',
  setHotkeyRecording: 'launcher:set-hotkey-recording',
  getBaseCatalog: 'launcher:get-base-catalog',
  setBaseAppEnabled: 'launcher:set-base-app-enabled',
  selectCommandPackage: 'launcher:select-command-package',
  consumePendingCommandPackage: 'launcher:consume-pending-command-package',
  commandPackagePending: 'launcher:command-package-pending',
  commitCommandPackage: 'launcher:commit-command-package',
  getCommands: 'launcher:get-commands',
  createCommand: 'launcher:create-command',
  updateCommand: 'launcher:update-command',
  setCommandEnabled: 'launcher:set-command-enabled',
  deleteCommand: 'launcher:delete-command',
  clearHistory: 'launcher:clear-history',
} as const

export { type LauncherSettingsPatch, type LauncherSettingsSnapshot, type SearchEngine, type ThemePreference } from './launcher-settings'
export type { UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from './launcher-command'
export type { CommandImportDecision, CommandPackagePreview } from './launcher-command'

export type ApplicationRelocationResult = {
  status: 'bound' | 'cancelled'
  appRef: string
}

export type BaseCatalogSnapshot = {
  catalogVersion: string
  apps: BaseAppTemplate[]
  disabledAppIds: string[]
}

export type LauncherExecutionResult = string | {
  message: string
  copyToken?: string
}

export function parseThemePreference(value: unknown): ThemePreference | undefined {
  return value === 'system' || value === 'light' || value === 'dark' ? value : undefined
}

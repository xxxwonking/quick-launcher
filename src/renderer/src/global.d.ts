import type { ThemePreference } from './theme/theme'
import type { LauncherCatalogPayload } from '../../shared/launcher-item'
import type { ApplicationRelocationResult, BaseCatalogSnapshot, CommandImportDecision, CommandPackagePreview, LauncherExecutionResult, LauncherSettingsPatch, LauncherSettingsSnapshot, UserCommand, UserCommandDraft, UserCommandPatch } from '../../shared/launcher-ipc'

export type LauncherThemePayload = ThemePreference | { preference: ThemePreference; resolved: 'light' | 'dark' }

export type LauncherRendererApi = {
  openSettings: () => void | Promise<void>
  openTutorial: () => void | Promise<void>
  hideLauncher: () => void | Promise<void>
  getTheme: () => LauncherThemePayload | Promise<LauncherThemePayload>
  setTheme: (mode: ThemePreference) => void | Promise<void>
  onThemeChanged: (listener: (payload: LauncherThemePayload) => void) => (() => void) | void
  onFocusRequested?: (listener: () => void) => (() => void) | void
  resizeSearchWindow?: (height: number) => void | Promise<void>
  refreshApplications?: () => Promise<{ count: number }>
  relocateApplication?: (appRef: string) => Promise<ApplicationRelocationResult>
  getHotkeyStatus?: () => Promise<{ requested: string; active: string | null; conflict: boolean }>
  getCatalog?: () => Promise<LauncherCatalogPayload>
  getSettings?: () => Promise<LauncherSettingsSnapshot>
  updateSettings?: (patch: LauncherSettingsPatch) => Promise<LauncherSettingsSnapshot>
  setHotkeyRecording?: (recording: boolean) => Promise<void>
  getBaseCatalog?: () => Promise<BaseCatalogSnapshot>
  setBaseAppEnabled?: (id: string, enabled: boolean) => Promise<BaseCatalogSnapshot>
  selectCommandPackage?: () => Promise<CommandPackagePreview | undefined>
  consumePendingCommandPackage?: () => Promise<CommandPackagePreview | undefined>
  onCommandPackagePending?: (listener: () => void) => (() => void) | void
  commitCommandPackage?: (previewId: string, decisions: CommandImportDecision[]) => Promise<UserCommand[]>
  getCommands?: () => Promise<UserCommand[]>
  createCommand?: (draft: UserCommandDraft) => Promise<UserCommand>
  updateCommand?: (id: string, patch: UserCommandPatch) => Promise<UserCommand>
  setCommandEnabled?: (id: string, enabled: boolean) => Promise<UserCommand>
  deleteCommand?: (id: string) => Promise<void>
  clearHistory?: (type: 'clipboard' | 'file') => Promise<void>
  onCatalogChanged?: (listener: (catalog: LauncherCatalogPayload) => void) => (() => void) | void
  execute?: (item: unknown) => void | Promise<void | LauncherExecutionResult>
  copyGeneratedUrl?: (token: string) => Promise<string>
  selectFileSearchRoot?: () => Promise<string | undefined>
}

declare global {
  interface Window {
    launcher?: LauncherRendererApi
  }
}

export {}

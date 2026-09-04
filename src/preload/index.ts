import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type LauncherSettingsPatch,
  type LauncherSettingsSnapshot,
  type BaseCatalogSnapshot,
  type CommandImportDecision,
  type CommandPackagePreview,
  type ApplicationRelocationResult,
  type LauncherExecutionResult,
  type ThemePreference,
  type UserCommand,
  type UserCommandDraft,
  type UserCommandPatch,
} from '../shared/launcher-ipc'
import type { LauncherCatalogPayload } from '../shared/launcher-item'

type ThemePayload = { preference: ThemePreference; resolved: 'light' | 'dark' }

const launcherApi = {
  openSettings: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  openTutorial: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.openTutorial),
  hideLauncher: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.hide),
  getTheme: (): Promise<ThemePayload> => ipcRenderer.invoke(IPC_CHANNELS.getTheme) as Promise<ThemePayload>,
  setTheme: (preference: ThemePreference): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setTheme, preference),
  onThemeChanged: (listener: (payload: ThemePayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ThemePayload): void => listener(payload)
    ipcRenderer.on(IPC_CHANNELS.themeChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.themeChanged, handler)
  },
  onFocusRequested: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC_CHANNELS.focusRequested, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.focusRequested, handler)
  },
  resizeSearchWindow: (height: number): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.resizeSearchWindow, height),
  execute: (item: unknown): Promise<LauncherExecutionResult> => ipcRenderer.invoke(IPC_CHANNELS.execute, item) as Promise<LauncherExecutionResult>,
  copyGeneratedUrl: (token: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.copyGeneratedUrl, token) as Promise<string>,
  selectFileSearchRoot: (): Promise<string | undefined> => ipcRenderer.invoke(IPC_CHANNELS.selectFileSearchRoot) as Promise<string | undefined>,
  refreshApplications: (): Promise<{ count: number }> => ipcRenderer.invoke(IPC_CHANNELS.refreshApplications) as Promise<{ count: number }>,
  relocateApplication: (appRef: string): Promise<ApplicationRelocationResult> => ipcRenderer.invoke(IPC_CHANNELS.relocateApplication, appRef) as Promise<ApplicationRelocationResult>,
  getHotkeyStatus: (): Promise<{ requested: string; active: string | null; conflict: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.getHotkeyStatus) as Promise<{ requested: string; active: string | null; conflict: boolean }>,
  getCatalog: (): Promise<LauncherCatalogPayload> => ipcRenderer.invoke(IPC_CHANNELS.getCatalog) as Promise<LauncherCatalogPayload>,
  getSettings: (): Promise<LauncherSettingsSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.getSettings) as Promise<LauncherSettingsSnapshot>,
  updateSettings: (patch: LauncherSettingsPatch): Promise<LauncherSettingsSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch) as Promise<LauncherSettingsSnapshot>,
  setHotkeyRecording: (recording: boolean): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setHotkeyRecording, recording),
  getBaseCatalog: (): Promise<BaseCatalogSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.getBaseCatalog) as Promise<BaseCatalogSnapshot>,
  setBaseAppEnabled: (id: string, enabled: boolean): Promise<BaseCatalogSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.setBaseAppEnabled, id, enabled) as Promise<BaseCatalogSnapshot>,
  selectCommandPackage: (): Promise<CommandPackagePreview | undefined> => ipcRenderer.invoke(IPC_CHANNELS.selectCommandPackage) as Promise<CommandPackagePreview | undefined>,
  consumePendingCommandPackage: (): Promise<CommandPackagePreview | undefined> => ipcRenderer.invoke(IPC_CHANNELS.consumePendingCommandPackage) as Promise<CommandPackagePreview | undefined>,
  onCommandPackagePending: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC_CHANNELS.commandPackagePending, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.commandPackagePending, handler)
  },
  commitCommandPackage: (previewId: string, decisions: CommandImportDecision[]): Promise<UserCommand[]> => ipcRenderer.invoke(IPC_CHANNELS.commitCommandPackage, previewId, decisions) as Promise<UserCommand[]>,
  getCommands: (): Promise<UserCommand[]> => ipcRenderer.invoke(IPC_CHANNELS.getCommands) as Promise<UserCommand[]>,
  createCommand: (draft: UserCommandDraft): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.createCommand, draft) as Promise<UserCommand>,
  updateCommand: (id: string, patch: UserCommandPatch): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.updateCommand, id, patch) as Promise<UserCommand>,
  setCommandEnabled: (id: string, enabled: boolean): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.setCommandEnabled, id, enabled) as Promise<UserCommand>,
  deleteCommand: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteCommand, id) as Promise<void>,
  clearHistory: (type: 'clipboard' | 'file'): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clearHistory, type),
  onCatalogChanged: (listener: (catalog: LauncherCatalogPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, catalog: LauncherCatalogPayload): void => listener(catalog)
    ipcRenderer.on(IPC_CHANNELS.catalogChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.catalogChanged, handler)
  },
}

contextBridge.exposeInMainWorld('launcher', Object.freeze(launcherApi))

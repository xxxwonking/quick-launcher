import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type LauncherSettingsPatch,
  type LauncherSettingsSnapshot,
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
  execute: (item: unknown): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.execute, item) as Promise<string>,
  refreshApplications: (): Promise<{ count: number }> => ipcRenderer.invoke(IPC_CHANNELS.refreshApplications) as Promise<{ count: number }>,
  getHotkeyStatus: (): Promise<{ requested: string; active: string | null; conflict: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.getHotkeyStatus) as Promise<{ requested: string; active: string | null; conflict: boolean }>,
  getCatalog: (): Promise<LauncherCatalogPayload> => ipcRenderer.invoke(IPC_CHANNELS.getCatalog) as Promise<LauncherCatalogPayload>,
  getSettings: (): Promise<LauncherSettingsSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.getSettings) as Promise<LauncherSettingsSnapshot>,
  updateSettings: (patch: LauncherSettingsPatch): Promise<LauncherSettingsSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch) as Promise<LauncherSettingsSnapshot>,
  getCommands: (): Promise<UserCommand[]> => ipcRenderer.invoke(IPC_CHANNELS.getCommands) as Promise<UserCommand[]>,
  createCommand: (draft: UserCommandDraft): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.createCommand, draft) as Promise<UserCommand>,
  updateCommand: (id: string, patch: UserCommandPatch): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.updateCommand, id, patch) as Promise<UserCommand>,
  setCommandEnabled: (id: string, enabled: boolean): Promise<UserCommand> => ipcRenderer.invoke(IPC_CHANNELS.setCommandEnabled, id, enabled) as Promise<UserCommand>,
  deleteCommand: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteCommand, id) as Promise<void>,
  onCatalogChanged: (listener: (catalog: LauncherCatalogPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, catalog: LauncherCatalogPayload): void => listener(catalog)
    ipcRenderer.on(IPC_CHANNELS.catalogChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.catalogChanged, handler)
  },
}

contextBridge.exposeInMainWorld('launcher', Object.freeze(launcherApi))

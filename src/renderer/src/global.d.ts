import type { ThemePreference } from './theme/theme'

export type LauncherThemePayload = ThemePreference | { preference: ThemePreference; resolved: 'light' | 'dark' }

export type LauncherRendererApi = {
  openSettings: () => void | Promise<void>
  openTutorial: () => void | Promise<void>
  hideLauncher: () => void | Promise<void>
  getTheme: () => LauncherThemePayload | Promise<LauncherThemePayload>
  setTheme: (mode: ThemePreference) => void | Promise<void>
  onThemeChanged: (listener: (payload: LauncherThemePayload) => void) => (() => void) | void
  onFocusRequested?: (listener: () => void) => (() => void) | void
  onFocusRequested?: (listener: () => void) => (() => void) | void
  refreshApplications?: () => Promise<{ count: number }>
  getHotkeyStatus?: () => Promise<{ requested: string; active: string | null; conflict: boolean }>
  execute?: (item: unknown) => void | Promise<void | string>
}

declare global {
  interface Window {
    launcher?: LauncherRendererApi
  }
}

export {}

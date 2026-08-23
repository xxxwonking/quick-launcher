import { useCallback, useEffect, useState } from 'react'
import type { LauncherThemePayload } from '../global'
import { resolveTheme, type ResolvedTheme, type ThemePreference } from './theme'

const getSystemDark = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

const preferenceFromPayload = (payload: LauncherThemePayload): ThemePreference => typeof payload === 'string' ? payload : payload.preference

export function useThemeController(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
} {
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [systemDark, setSystemDark] = useState(getSystemDark)
  const resolved = resolveTheme(preference, systemDark)

  useEffect(() => {
    const api = window.launcher
    let disposed = false
    if (api) {
      void Promise.resolve(api.getTheme()).then((payload) => {
        if (!disposed) setPreferenceState(preferenceFromPayload(payload))
      })
    }
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const handleMedia = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media?.addEventListener?.('change', handleMedia)
    const unsubscribe = api?.onThemeChanged((payload) => setPreferenceState(preferenceFromPayload(payload)))
    return () => {
      disposed = true
      media?.removeEventListener?.('change', handleMedia)
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference): void => {
    setPreferenceState(next)
    void window.launcher?.setTheme(next)
  }, [])

  return { preference, resolved, setPreference }
}

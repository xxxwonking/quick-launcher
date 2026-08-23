export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(preference: ThemePreference, systemUsesDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemUsesDark ? 'dark' : 'light'
  return preference
}

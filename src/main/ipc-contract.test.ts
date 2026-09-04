import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, parseThemePreference } from './ipc-contract'

describe('launcher IPC contract', () => {
  it('keeps the exposed channel set explicit', () => {
    expect(Object.values(IPC_CHANNELS)).toEqual([
      'launcher:open-settings',
      'launcher:open-tutorial',
      'launcher:hide',
      'launcher:get-theme',
      'launcher:set-theme',
      'launcher:theme-changed',
      'launcher:focus-requested',
      'launcher:resize-search-window',
      'launcher:execute',
      'launcher:copy-generated-url',
      'launcher:select-file-search-root',
      'launcher:refresh-applications',
      'launcher:relocate-application',
      'launcher:get-hotkey-status',
      'launcher:get-catalog',
      'launcher:catalog-changed',
      'launcher:get-settings',
      'launcher:update-settings',
      'launcher:set-hotkey-recording',
      'launcher:get-base-catalog',
      'launcher:set-base-app-enabled',
      'launcher:select-command-package',
      'launcher:consume-pending-command-package',
      'launcher:command-package-pending',
      'launcher:commit-command-package',
      'launcher:get-commands',
      'launcher:create-command',
      'launcher:update-command',
      'launcher:set-command-enabled',
      'launcher:delete-command',
      'launcher:clear-history',
    ])
  })

  it('rejects arbitrary theme values before they reach nativeTheme', () => {
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('system')).toBe('system')
    expect(parseThemePreference('neon')).toBeUndefined()
    expect(parseThemePreference({})).toBeUndefined()
  })
})

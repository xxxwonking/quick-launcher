import { describe, expect, it } from 'vitest'
import { isValidLauncherHotkey } from './launcher-hotkey'

describe('launcher hotkey validation', () => {
  it('accepts accelerators produced by the recorder', () => {
    expect(isValidLauncherHotkey('Alt+Space')).toBe(true)
    expect(isValidLauncherHotkey('Command+Option+K')).toBe(false)
    expect(isValidLauncherHotkey('Control+Shift+F12')).toBe(true)
    expect(isValidLauncherHotkey('Super+Down')).toBe(true)
  })

  it('rejects bare keys, duplicate modifiers and unsupported key names', () => {
    expect(isValidLauncherHotkey('K')).toBe(false)
    expect(isValidLauncherHotkey('Control+Control+K')).toBe(false)
    expect(isValidLauncherHotkey('Alt+F25')).toBe(false)
    expect(isValidLauncherHotkey('Alt+å')).toBe(false)
  })

  it('accepts punctuation and numpad accelerators', () => {
    expect(isValidLauncherHotkey('Control+,')).toBe(true)
    expect(isValidLauncherHotkey('Control+Shift+=')).toBe(true)
    expect(isValidLauncherHotkey('Alt+Plus')).toBe(true)
    expect(isValidLauncherHotkey('Alt+num1')).toBe(true)
  })
})

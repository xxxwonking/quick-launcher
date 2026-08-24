import { describe, expect, it } from 'vitest'
import { launcherHotkeyForPlatform } from './platform-hotkey'

describe('platform launcher hotkey', () => {
  it('uses Option in the macOS label while keeping Electron accelerator syntax', () => {
    expect(launcherHotkeyForPlatform('darwin')).toEqual({
      accelerator: 'Alt+Space',
      label: 'Option + Space',
    })
  })

  it('uses Alt for non-macOS platforms', () => {
    expect(launcherHotkeyForPlatform('win32')).toEqual({
      accelerator: 'Alt+Space',
      label: 'Alt + Space',
    })
  })
})

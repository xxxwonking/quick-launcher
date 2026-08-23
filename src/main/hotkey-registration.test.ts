import { describe, expect, it, vi } from 'vitest'
import { registerLauncherHotkey } from './hotkey-registration'

describe('hotkey registration', () => {
  it('uses the preferred accelerator when it is available', () => {
    const register = vi.fn(() => true)
    expect(registerLauncherHotkey('Alt+Space', register, () => undefined)).toEqual({ accelerator: 'Alt+Space', conflict: false })
    expect(register).toHaveBeenCalledOnce()
  })

  it('reports a conflict without silently registering a fallback accelerator', () => {
    const register = vi.fn((accelerator: string) => accelerator === 'CommandOrControl+Alt+Space')
    expect(registerLauncherHotkey('Alt+Space', register, () => undefined)).toEqual({ accelerator: null, conflict: true })
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith('Alt+Space')
  })

  it('reports an unavailable shortcut when all candidates conflict', () => {
    expect(registerLauncherHotkey('Alt+Space', () => false, () => undefined)).toEqual({ accelerator: null, conflict: true })
  })
})

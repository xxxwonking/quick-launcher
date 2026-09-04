import { describe, expect, it, vi } from 'vitest'
import { configureAutostart } from './autostart'

describe('autostart adapter', () => {
  it('reports macOS login-item approval instead of claiming success', () => {
    const setLoginItemSettings = vi.fn()
    const result = configureAutostart(true, {
      platform: 'darwin',
      packaged: true,
      setLoginItemSettings,
      getLoginItemSettings: () => ({ status: 'requires-approval', openAtLogin: false }),
    })

    expect(setLoginItemSettings).toHaveBeenCalledWith(true)
    expect(result).toEqual({ ok: false, reason: 'approval-required' })
  })
})

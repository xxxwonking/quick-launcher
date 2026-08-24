import { describe, expect, it, vi } from 'vitest'
import { createShortcutIndex } from './shortcut-index'
import { scanPlatformApplications } from './platform-application-index'

describe('platform application index selection', () => {
  it('uses the macOS scanner on darwin without asking for a Windows desktop path', async () => {
    const macIndex = createShortcutIndex([{ displayName: 'Safari', path: '/Applications/Safari.app' }])
    const scanMac = vi.fn().mockResolvedValue(macIndex)
    const scanWindows = vi.fn()

    const result = await scanPlatformApplications('darwin', 'C:\\Users\\Alice\\Desktop', {
      scanMac,
      scanWindows,
    })

    expect(result).toBe(macIndex)
    expect(scanMac).toHaveBeenCalledOnce()
    expect(scanWindows).not.toHaveBeenCalled()
  })

  it('passes the Electron desktop path to the Windows scanner on other platforms', async () => {
    const windowsIndex = createShortcutIndex([])
    const scanMac = vi.fn()
    const scanWindows = vi.fn().mockResolvedValue(windowsIndex)

    const result = await scanPlatformApplications('win32', 'D:\\Profiles\\Me\\Desktop', {
      scanMac,
      scanWindows,
    })

    expect(result).toBe(windowsIndex)
    expect(scanWindows).toHaveBeenCalledWith(expect.arrayContaining(['D:\\Profiles\\Me\\Desktop']))
    expect(scanMac).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createShortcutIndex } from './shortcut-index'
import { defaultApplicationWatchRoots, scanPlatformApplications } from './platform-application-index'

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

  it('selects platform application roots for automatic watching without duplicates', () => {
    expect(defaultApplicationWatchRoots('darwin', '/Users/alice/Desktop', { HOME: '/Users/alice' })).toEqual([
      '/Applications',
      '/Users/alice/Applications',
      '/System/Applications',
    ])
    expect(defaultApplicationWatchRoots('win32', 'C:\\Users\\Alice\\Desktop', {
      APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming',
      ProgramData: 'C:\\ProgramData',
      ProgramFiles: 'C:\\Program Files',
      ProgramW6432: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
    })).toEqual(expect.arrayContaining([
      'C:\\Users\\Alice\\Desktop',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Users\\Alice\\AppData\\Local\\Programs',
    ]))
  })
})

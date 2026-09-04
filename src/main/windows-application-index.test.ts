import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createShortcutIndex } from './shortcut-index'
import { discoverWindowsAppPaths, discoverWindowsStoreApps, isWindowsShellAppPath, parseWindowsAppPathsOutput, parseWindowsPublisherOutput, parseWindowsStartAppsOutput, readWindowsExecutablePublisher, scanStandaloneExecutables, scanWindowsApplications } from './windows-application-index'

describe('windows application index', () => {
  it('recognizes only validated AppsFolder AUMID targets', () => {
    expect(isWindowsShellAppPath('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App')).toBe(true)
    expect(isWindowsShellAppPath('shell:AppsFolder\\not-valid')).toBe(false)
    expect(isWindowsShellAppPath('C:\\Apps\\calculator.exe')).toBe(false)
  })

  it('parses a safe publisher from Windows executable version information', () => {
    expect(parseWindowsPublisherOutput('Microsoft Corporation\r\n')).toBe('Microsoft Corporation')
    expect(parseWindowsPublisherOutput('(null)\r\n')).toBeUndefined()
    expect(parseWindowsPublisherOutput('')).toBeUndefined()
  })

  it('reads publisher metadata through a fixed PowerShell query without a shell', async () => {
    const runCommand = vi.fn().mockResolvedValue('Acme Software\r\n')

    await expect(readWindowsExecutablePublisher("C:\\Program Files\\Acme\\Acme's.exe", runCommand, 'win32')).resolves.toBe('Acme Software')
    expect(runCommand).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      expect.stringContaining("Get-Item -LiteralPath 'C:\\Program Files\\Acme\\Acme''s.exe'"),
    ]))
  })

  it('queries Store applications with a fixed PowerShell command', async () => {
    const runCommand = vi.fn().mockResolvedValue(JSON.stringify({ Name: 'Calculator', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }))

    await expect(discoverWindowsStoreApps(runCommand, 'win32')).resolves.toEqual([
      expect.objectContaining({
        displayName: 'Calculator',
        path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      }),
    ])
    expect(runCommand).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']))
  })

  it('continues when one App Paths registry hive is unavailable', async () => {
    const runCommand = vi.fn()
      .mockRejectedValueOnce(new Error('missing hive'))
      .mockResolvedValueOnce([
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AcmeTool.exe',
        '    (Default)    REG_SZ    C:\\Apps\\AcmeTool.exe',
      ].join('\n'))
      .mockRejectedValue(new Error('missing hive'))

    await expect(discoverWindowsAppPaths(runCommand, 'win32')).resolves.toEqual([
      {
        displayName: 'AcmeTool',
        path: 'C:\\Apps\\AcmeTool.exe',
        metadata: { platform: 'windows', executableName: 'AcmeTool.exe' },
      },
    ])
    expect(runCommand).toHaveBeenCalledTimes(4)
  })

  it('discovers standalone executables while skipping generated and hidden folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-win-index-'))
    try {
      await mkdir(join(root, 'Acme Tool'), { recursive: true })
      await mkdir(join(root, 'node_modules', 'dependency'), { recursive: true })
      await mkdir(join(root, '.cache'), { recursive: true })
      await writeFile(join(root, 'Acme Tool', 'AcmeTool.exe'), '')
      await writeFile(join(root, 'readme.txt'), '')
      await writeFile(join(root, 'node_modules', 'dependency', 'ignored.exe'), '')
      await writeFile(join(root, '.cache', 'ignored.exe'), '')

      expect(await scanStandaloneExecutables([root])).toEqual([
        expect.objectContaining({
          displayName: 'AcmeTool',
          path: join(root, 'Acme Tool', 'AcmeTool.exe'),
          metadata: { platform: 'windows', executableName: 'AcmeTool.exe' },
        }),
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('turns Get-StartApps JSON into validated shell app entries', () => {
    const output = JSON.stringify([
      { Name: 'Calculator', AppID: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
      { Name: 'Photos', AppID: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App' },
      { Name: 'Not an app', AppID: 'not-a-valid-id' },
      { Name: 'Missing ID' },
    ])

    expect(parseWindowsStartAppsOutput(output)).toEqual([
      {
        displayName: 'Calculator',
        path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
        metadata: { platform: 'windows', appUserModelId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
      },
      {
        displayName: 'Photos',
        path: 'shell:AppsFolder\\Microsoft.Windows.Photos_8wekyb3d8bbwe!App',
        metadata: { platform: 'windows', appUserModelId: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App' },
      },
    ])
  })

  it('turns App Paths registry output into executable entries', () => {
    const output = [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AcmeTool.exe',
      '    (Default)    REG_SZ    "C:\\Apps\\Acme Tool\\AcmeTool.exe"',
      '    Path         REG_SZ    C:\\Apps\\Acme Tool',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ignored.exe',
      '    (Default)    REG_SZ    C:\\Windows\\ignored.exe',
    ].join('\n')

    expect(parseWindowsAppPathsOutput(output)).toEqual([
      {
        displayName: 'AcmeTool',
        path: 'C:\\Apps\\Acme Tool\\AcmeTool.exe',
        metadata: { platform: 'windows', executableName: 'AcmeTool.exe' },
      },
      {
        displayName: 'ignored',
        path: 'C:\\Windows\\ignored.exe',
        metadata: { platform: 'windows', executableName: 'ignored.exe' },
      },
    ])
  })

  it('merges shortcuts with registry, Store and standalone executable discoveries', async () => {
    const shortcuts = createShortcutIndex([
      { displayName: 'Cursor.lnk', path: 'C:\\Users\\Alice\\Desktop\\Cursor.lnk' },
    ])
    const result = await scanWindowsApplications(['C:\\Users\\Alice\\Desktop'], {
      scanShortcuts: vi.fn().mockResolvedValue(shortcuts),
      discoverAppPaths: vi.fn().mockResolvedValue([
        { displayName: 'Notepad', path: 'C:\\Windows\\System32\\notepad.exe', metadata: { platform: 'windows', executableName: 'notepad.exe' } },
      ]),
      discoverStoreApps: vi.fn().mockResolvedValue([
        { displayName: 'Calculator', path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', metadata: { platform: 'windows', appUserModelId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' } },
      ]),
      discoverStandaloneExecutables: vi.fn().mockResolvedValue([
        { displayName: 'Portable Tool', path: 'D:\\Tools\\portable.exe', metadata: { platform: 'windows', executableName: 'portable.exe' } },
      ]),
    })

    expect(result.entries).toEqual(expect.arrayContaining([
      shortcuts.entries[0],
      expect.objectContaining({ displayName: 'Notepad', path: 'C:\\Windows\\System32\\notepad.exe' }),
      expect.objectContaining({ displayName: 'Calculator', path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }),
      expect.objectContaining({ displayName: 'Portable Tool', path: 'D:\\Tools\\portable.exe' }),
    ]))
    expect(result.entries).toHaveLength(4)
  })
})

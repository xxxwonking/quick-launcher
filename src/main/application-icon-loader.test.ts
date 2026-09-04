import { describe, expect, it, vi } from 'vitest'
import { createPlatformIconLoader } from './application-icon-loader'

describe('platform application icon loader', () => {
  it('loads a Windows shortcut icon from its executable target', async () => {
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,exe-icon' })
    const readShortcutLink = vi.fn().mockReturnValue({ target: 'C:\\Program Files\\Cursor\\Cursor.exe' })
    const loader = createPlatformIconLoader('win32', getFileIcon, readShortcutLink)

    await loader?.('C:\\Start\\Cursor.lnk', { size: 'normal' })

    expect(readShortcutLink).toHaveBeenCalledWith('C:\\Start\\Cursor.lnk')
    expect(getFileIcon).toHaveBeenCalledWith('C:\\Program Files\\Cursor\\Cursor.exe', { size: 'normal' })
  })

  it('prefers the explicit icon source recorded in a Windows shortcut', async () => {
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,shortcut-icon' })
    const readShortcutLink = vi.fn().mockReturnValue({
      icon: 'C:\\Program Files\\Example\\resources\\app.ico',
      target: 'C:\\Program Files\\Example\\Example.exe',
    })
    const loader = createPlatformIconLoader('win32', getFileIcon, readShortcutLink)

    await loader?.('C:\\Start\\Example.lnk', { size: 'normal' })

    expect(getFileIcon).toHaveBeenCalledTimes(1)
    expect(getFileIcon).toHaveBeenCalledWith('C:\\Program Files\\Example\\resources\\app.ico', { size: 'normal' })
  })

  it('falls back from an unavailable explicit shortcut icon to its executable target', async () => {
    const getFileIcon = vi.fn()
      .mockRejectedValueOnce(new Error('icon file unavailable'))
      .mockResolvedValueOnce({ toDataURL: () => 'data:image/png;base64,target-icon' })
    const readShortcutLink = vi.fn().mockReturnValue({
      icon: 'C:\\Missing\\app.ico',
      target: 'C:\\Program Files\\Example\\Example.exe',
    })
    const loader = createPlatformIconLoader('win32', getFileIcon, readShortcutLink)

    await loader?.('C:\\Start\\Example.lnk', { size: 'normal' })

    expect(getFileIcon).toHaveBeenNthCalledWith(1, 'C:\\Missing\\app.ico', { size: 'normal' })
    expect(getFileIcon).toHaveBeenNthCalledWith(2, 'C:\\Program Files\\Example\\Example.exe', { size: 'normal' })
  })

  it('resolves a Windows Store shortcut icon through its AppUserModelID', async () => {
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64:store-icon' })
    const readShortcutLink = vi.fn().mockReturnValue({
      target: 'C:\\Windows\\explorer.exe',
      args: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
    })
    const loader = createPlatformIconLoader('win32', getFileIcon, readShortcutLink)

    await loader?.('C:\\Start\\Calculator.lnk', { size: 'normal' })

    expect(getFileIcon).toHaveBeenCalledWith('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', { size: 'normal' })
    expect(getFileIcon).not.toHaveBeenCalledWith('C:\\Windows\\explorer.exe', { size: 'normal' })
  })

  it('keeps non-Windows icon loading unchanged', async () => {
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,icon' })
    const readShortcutLink = vi.fn()
    const loader = createPlatformIconLoader('darwin', getFileIcon, readShortcutLink)

    await loader?.('/Applications/Cursor.app', { size: 'normal' })

    expect(readShortcutLink).not.toHaveBeenCalled()
    expect(getFileIcon).toHaveBeenCalledWith('/Applications/Cursor.app', { size: 'normal' })
  })
})

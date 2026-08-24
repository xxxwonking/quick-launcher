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

  it('keeps non-Windows icon loading unchanged', async () => {
    const getFileIcon = vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,icon' })
    const readShortcutLink = vi.fn()
    const loader = createPlatformIconLoader('darwin', getFileIcon, readShortcutLink)

    await loader?.('/Applications/Cursor.app', { size: 'normal' })

    expect(readShortcutLink).not.toHaveBeenCalled()
    expect(getFileIcon).toHaveBeenCalledWith('/Applications/Cursor.app', { size: 'normal' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { adaptTrayIconForPlatform, MACOS_TRAY_ICON_SIZE, prepareTrayIconForPlatform, resolveTrayIconPath, trayIconCandidates } from './tray-icon'

describe('tray icon resolution', () => {
  it('prefers the packaged extra resource before the development asset', () => {
    const candidates = trayIconCandidates('/app/Contents/Resources', '/workspace')
    expect(candidates[0]).toBe('/app/Contents/Resources/quick-launcher-icon.png')
    expect(resolveTrayIconPath(candidates, (path) => path === '/app/Contents/Resources/quick-launcher-icon.png')).toBe('/app/Contents/Resources/quick-launcher-icon.png')
  })

  it('falls back to the development asset when the packaged resource is unavailable', () => {
    const candidates = trayIconCandidates('/resources', '/workspace')
    expect(resolveTrayIconPath(candidates, (path) => path === '/workspace/build/icon.png')).toBe('/workspace/build/icon.png')
  })

  it('returns no path when none of the candidates exists', () => {
    expect(resolveTrayIconPath(trayIconCandidates('/resources', '/workspace'), () => false)).toBeUndefined()
  })

  it('resizes the application icon to a compact macOS menu bar image', () => {
    const resizedIcon = { isEmpty: () => false }
    const icon = {
      isEmpty: () => false,
      resize: vi.fn().mockReturnValue(resizedIcon),
    }

    expect(adaptTrayIconForPlatform('darwin', icon)).toBe(resizedIcon)
    expect(icon.resize).toHaveBeenCalledWith({ width: MACOS_TRAY_ICON_SIZE, height: MACOS_TRAY_ICON_SIZE })
  })

  it('keeps the original tray image on Windows and when macOS resizing fails', () => {
    const icon = {
      isEmpty: () => false,
      resize: vi.fn().mockImplementation(() => { throw new Error('resize unavailable') }),
    }

    expect(adaptTrayIconForPlatform('win32', icon)).toBe(icon)
    expect(adaptTrayIconForPlatform('darwin', icon)).toBe(icon)
  })

  it('keeps the full-color application icon on macOS instead of using template rendering', () => {
    const resizedIcon = {
      isEmpty: () => false,
      setTemplateImage: vi.fn(),
    }
    const icon = {
      isEmpty: () => false,
      resize: vi.fn().mockReturnValue(resizedIcon),
      setTemplateImage: vi.fn(),
    }

    expect(prepareTrayIconForPlatform('darwin', icon)).toBe(resizedIcon)
    expect(resizedIcon.setTemplateImage).toHaveBeenCalledWith(false)
  })
})

import { describe, expect, it } from 'vitest'
import { resolveTrayIconPath, trayIconCandidates } from './tray-icon'

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
})

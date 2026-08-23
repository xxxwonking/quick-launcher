import { describe, expect, it, vi } from 'vitest'
import * as externalOpener from './external-opener'
import { openExternalSafely, openPathSafely, shouldSimulateOsOpen } from './external-opener'

describe('external opener', () => {
  it('enables OS-open simulation only for unpackaged E2E runs', () => {
    expect(shouldSimulateOsOpen('1', false)).toBe(true)
    expect(shouldSimulateOsOpen('1', true)).toBe(false)
    expect(shouldSimulateOsOpen(undefined, false)).toBe(false)
  })

  it('accepts a development renderer URL only from a local HTTP origin in unpackaged builds', () => {
    const resolveUrl = Reflect.get(externalOpener, 'resolveDevelopmentRendererUrl') as ((value: string | undefined, isPackaged: boolean) => string | undefined) | undefined

    expect(resolveUrl?.('http://localhost:5173/', false)).toBe('http://localhost:5173')
    expect(resolveUrl?.('https://127.0.0.1:5173', false)).toBe('https://127.0.0.1:5173')
    expect(resolveUrl?.('http://[::1]:5173/', false)).toBe('http://[::1]:5173')
    expect(resolveUrl?.('https://attacker.example', false)).toBeUndefined()
    expect(resolveUrl?.('file:///C:/renderer/index.html', false)).toBeUndefined()
    expect(resolveUrl?.('http://localhost:5173', true)).toBeUndefined()
  })

  it('does not touch the operating system in end-to-end test mode', async () => {
    const openExternal = vi.fn()
    expect(await openExternalSafely('https://example.com', openExternal, true)).toBe(true)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('returns false when the operating system rejects the URL', async () => {
    expect(await openExternalSafely('https://example.com', vi.fn().mockRejectedValue(new Error('no browser')), false)).toBe(false)
  })

  it('normalizes Electron openPath errors and supports test simulation', async () => {
    expect(await openPathSafely('C:\\Start\\App.lnk', vi.fn().mockResolvedValue(''), false)).toBe(true)
    expect(await openPathSafely('C:\\Start\\App.lnk', vi.fn().mockResolvedValue('not found'), false)).toBe(false)
    const openPath = vi.fn()
    expect(await openPathSafely('C:\\Start\\App.lnk', openPath, true)).toBe(true)
    expect(openPath).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import { applicationArgumentPlan, systemActionPlan, transformClipboardText } from './productivity-actions'

describe('productivity actions', () => {
  it('transforms clipboard text without executing content', () => {
    expect(transformClipboardText('format-json', '{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(transformClipboardText('url-encode', '海贼王')).toBe('%E6%B5%B7%E8%B4%BC%E7%8E%8B')
    expect(transformClipboardText('url-decode', '%E6%B5%B7%E8%B4%BC%E7%8E%8B')).toBe('海贼王')
    expect(transformClipboardText('base64-encode', 'hello')).toBe('aGVsbG8=')
    expect(transformClipboardText('base64-decode', 'aGVsbG8=')).toBe('hello')
    expect(transformClipboardText('uppercase', 'Quick Launcher')).toBe('QUICK LAUNCHER')
    expect(transformClipboardText('lowercase', 'Quick Launcher')).toBe('quick launcher')
  })

  it('rejects malformed Base64 instead of silently returning corrupted text', () => {
    expect(() => transformClipboardText('base64-decode', 'not base64!')).toThrow()
    expect(transformClipboardText('base64-decode', 'aGVsbG8')).toBe('hello')
  })

  it('returns only fixed platform commands for system actions', () => {
    expect(systemActionPlan('darwin', 'lock-screen')).toEqual({
      kind: 'spawn', file: '/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession', args: ['-suspend'],
    })
    expect(systemActionPlan('win32', 'open-system-settings')).toEqual({ kind: 'external', url: 'ms-settings:' })
    expect(systemActionPlan('linux', 'sleep')).toBeUndefined()
  })

  it('builds application argument plans without a shell', () => {
    expect(applicationArgumentPlan('darwin', 'vscode', '/Users/alice/project')).toEqual({
      kind: 'spawn', file: '/usr/bin/open', args: ['-a', 'Visual Studio Code', '/Users/alice/project'],
    })
    expect(applicationArgumentPlan('win32', 'terminal', 'C:\\Projects\\demo')).toEqual({
      kind: 'spawn', file: 'wt.exe', args: ['-d', 'C:\\Projects\\demo'],
    })
    expect(applicationArgumentPlan('win32', 'vscode', 'C:\\Projects\\海贼 王')).toEqual({
      kind: 'external', url: 'vscode://file/C:/Projects/%E6%B5%B7%E8%B4%BC%20%E7%8E%8B',
    })
  })
})

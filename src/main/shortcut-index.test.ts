import { describe, expect, it } from 'vitest'
import { createShortcutIndex, defaultShortcutRoots, matchShortcutName, shortcutDisplayName, type ShortcutEntry } from './shortcut-index'

describe('shortcut index', () => {
  it('matches aliases case-insensitively and ignores shortcut extensions', () => {
    expect(matchShortcutName('Cursor.lnk', ['cursor', 'code'])).toBe(true)
    expect(matchShortcutName('微信 - 快捷方式.lnk', ['微信', 'wechat'])).toBe(true)
    expect(matchShortcutName('Notes.lnk', ['cursor'])).toBe(false)
  })

  it('returns the first deterministic match for a target', () => {
    const entries: ShortcutEntry[] = [
      { displayName: 'Cursor', path: 'z:\\Cursor.lnk' },
      { displayName: 'Cursor', path: 'a:\\Cursor.lnk' },
    ]
    const index = createShortcutIndex(entries)
    expect(index.find(['cursor'])?.path).toBe('a:\\Cursor.lnk')
  })

  it('removes shortcut decoration without changing product casing', () => {
    expect(shortcutDisplayName('VS Code - 快捷方式.lnk')).toBe('VS Code')
  })

  it('uses the Electron-provided desktop path while preserving Start Menu roots', () => {
    const roots = Reflect.apply(defaultShortcutRoots, undefined, ['D:\\Profiles\\Me\\Desktop'])

    expect(roots[0]).toBe('D:\\Profiles\\Me\\Desktop')
    if (process.env.APPDATA) expect(roots).toContain(`${process.env.APPDATA}\\Microsoft\\Windows\\Start Menu\\Programs`)
    if (process.env.ProgramData) expect(roots).toContain(`${process.env.ProgramData}\\Microsoft\\Windows\\Start Menu\\Programs`)
  })
})

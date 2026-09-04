import { describe, expect, it } from 'vitest'
import { findCommandPackagePath, isCommandPackagePath } from './command-package-path'

describe('command package path detection', () => {
  it('accepts command package paths with a case-insensitive extension', () => {
    expect(isCommandPackagePath('/Users/alice/Downloads/team.quickcmd.json')).toBe(true)
    expect(isCommandPackagePath('C:\\Users\\Alice\\Downloads\\TEAM.QUICKCMD.JSON')).toBe(true)
  })

  it('ignores flags and non-string startup arguments', () => {
    expect(isCommandPackagePath('--user-data-dir=/tmp/team.quickcmd.json')).toBe(false)
    expect(isCommandPackagePath('')).toBe(false)
    expect(isCommandPackagePath(null)).toBe(false)
  })

  it('returns the first package path from startup arguments', () => {
    expect(findCommandPackagePath([
      '--user-data-dir=/tmp/quick-launcher',
      '/Applications/Quick Launcher.app/Contents/MacOS/Quick Launcher',
      '/Users/alice/Downloads/team.quickcmd.json',
      '/Users/alice/Downloads/other.quickcmd.json',
    ])).toBe('/Users/alice/Downloads/team.quickcmd.json')
  })
})

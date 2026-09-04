import { describe, expect, it } from 'vitest'
import { findInvalidApplicationBindings, validateApplicationBinding } from './application-binding'

function fileStat(kind: 'file' | 'directory') {
  return {
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
  }
}

describe('application binding', () => {
  it('accepts a Windows executable or shortcut only when it is a regular file', async () => {
    await expect(validateApplicationBinding('win32', 'C:\\Apps\\Editor.exe', fileStat('file'), async () => undefined)).resolves.toEqual({
      platform: 'windows',
      kind: 'windows-executable',
      path: 'C:\\Apps\\Editor.exe',
    })
    await expect(validateApplicationBinding('win32', 'C:\\Users\\me\\Desktop\\Editor.lnk', fileStat('file'), async () => undefined)).resolves.toMatchObject({ kind: 'windows-shortcut' })
  })

  it('rejects unsafe Windows paths and non-bundles on macOS', async () => {
    await expect(validateApplicationBinding('win32', 'C:\\Apps\\Editor.txt', fileStat('file'), async () => undefined)).rejects.toThrow('BINDING_UNSUPPORTED')
    await expect(validateApplicationBinding('win32', 'C:\\Apps\\Editor.exe', fileStat('directory'), async () => undefined)).rejects.toThrow('BINDING_NOT_FILE')
    await expect(validateApplicationBinding('darwin', '/Applications/Editor.app/Contents/MacOS/Editor', fileStat('file'), async () => undefined)).rejects.toThrow('BINDING_UNSUPPORTED')
    await expect(validateApplicationBinding('darwin', '/Applications/Editor.app', fileStat('directory'), async () => undefined)).resolves.toMatchObject({
      platform: 'macos',
      kind: 'macos-bundle',
    })
  })

  it('requires the selected path to be readable', async () => {
    await expect(validateApplicationBinding('darwin', '/Applications/Editor.app', fileStat('directory'), async () => {
      throw new Error('EACCES')
    })).rejects.toThrow('BINDING_UNREADABLE')
  })

  it('finds persisted bindings whose target no longer exists or is unreadable', async () => {
    const invalid = await findInvalidApplicationBindings({
      editor: { platform: 'windows', kind: 'windows-executable', path: 'C:\\Apps\\Editor.exe' },
      notes: { platform: 'macos', kind: 'macos-bundle', path: '/Applications/Notes.app' },
    }, 'win32', async (path) => {
      if (path.endsWith('Editor.exe')) return fileStat('file')
      throw new Error('ENOENT')
    }, async (path) => {
      if (path.endsWith('Editor.exe')) return
      throw new Error('EACCES')
    })

    expect([...invalid]).toEqual(['notes'])
  })

  it('marks a matching-platform binding invalid when its shape is no longer usable', async () => {
    const invalid = await findInvalidApplicationBindings({
      editor: { platform: 'windows', kind: 'windows-executable', path: 'C:\\Apps\\Editor.exe' },
    }, 'win32', async () => fileStat('directory'), async () => undefined)

    expect([...invalid]).toEqual(['editor'])
  })
})

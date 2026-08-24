import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultMacApplicationRoots, scanMacApplicationDirectories } from './mac-application-index'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('macOS application index', () => {
  it('uses the system, user, and system application roots without duplicates', () => {
    expect(defaultMacApplicationRoots('/Users/alice')).toEqual([
      '/Applications',
      '/Users/alice/Applications',
      '/System/Applications',
    ])
  })

  it('finds app bundles in standard directories without walking inside a bundle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-mac-'))
    temporaryDirectories.push(root)
    const nestedApp = join(root, 'Utilities', 'Notes.app')
    await mkdir(join(nestedApp, 'Contents', 'Resources'), { recursive: true })
    await mkdir(join(root, 'Utilities', 'Nested Folder'), { recursive: true })
    await mkdir(join(root, 'Utilities', 'Nested Folder', 'Calendar.app'), { recursive: true })

    const index = await scanMacApplicationDirectories([root], async () => [])

    expect(index.entries.map((entry) => entry.displayName)).toEqual(['Calendar', 'Notes'])
    expect(index.entries.map((entry) => entry.path)).toEqual([
      join(root, 'Utilities', 'Nested Folder', 'Calendar.app'),
      nestedApp,
    ])
  })

  it('merges mdfind results, removes duplicate paths, and ignores non-app output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-mac-'))
    temporaryDirectories.push(root)
    const localApp = join(root, 'Local.app')
    await mkdir(localApp, { recursive: true })
    const discoveredApp = '/Applications/Discovered.app'

    const index = await scanMacApplicationDirectories([root], async () => [
      localApp,
      discoveredApp,
      '/Applications/not-an-app.txt',
      discoveredApp,
    ])

    expect(index.entries.map((entry) => entry.path)).toEqual([discoveredApp, localApp])
    expect(index.find(['discovered'])?.path).toBe(discoveredApp)
  })
})

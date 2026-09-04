import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultMacApplicationRoots,
  findMacApplicationsByBundleIds,
  isDiscoverableMacApplicationPath,
  parseMacBundleId,
  scanMacApplicationDirectories,
} from './mac-application-index'

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
    const discoveredApp = join(root, 'Discovered.app')

    const index = await scanMacApplicationDirectories([root], async () => [
      localApp,
      discoveredApp,
      '/Applications/not-an-app.txt',
      discoveredApp,
    ])

    expect(index.entries.map((entry) => entry.path)).toEqual([discoveredApp, localApp])
    expect(index.find(['discovered'])?.path).toBe(discoveredApp)
  })

  it('accepts application bundles below configured roots but rejects nested helper bundles', () => {
    expect(isDiscoverableMacApplicationPath('/Applications/Docker.app', ['/Applications'])).toBe(true)
    expect(isDiscoverableMacApplicationPath('/Applications/Utilities/Console.app', ['/Applications'])).toBe(true)
    expect(isDiscoverableMacApplicationPath(
      '/Applications/Docker.app/Contents/Library/LoginItems/DockerHelper.app',
      ['/Applications'],
    )).toBe(false)
  })

  it('ignores Spotlight applications outside configured roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-mac-'))
    temporaryDirectories.push(root)

    const index = await scanMacApplicationDirectories([root], async () => [
      join(root, 'Visible.app'),
      '/System/Library/CoreServices/SubmitDiagInfo.app',
      '/System/Library/PrivateFrameworks/Example.framework/Versions/A/Resources/Agent.app',
    ])

    expect(index.entries.map((entry) => entry.path)).toEqual([join(root, 'Visible.app')])
  })

  it('queries only requested bundle identifiers for precise matching', async () => {
    const queryApplications = async (query: string): Promise<readonly string[]> => (
      query.includes('com.google.Chrome') ? ['/Applications/Google Chrome.app'] : []
    )
    const matches = await findMacApplicationsByBundleIds(['com.google.Chrome', 'com.google.Chrome'], queryApplications)

    expect(matches.get('/Applications/Google Chrome.app')).toBe('com.google.Chrome')
  })

  it('parses a Bundle ID from an Info.plist JSON snapshot', () => {
    expect(parseMacBundleId({ CFBundleIdentifier: 'com.tencent.weread' })).toBe('com.tencent.weread')
    expect(parseMacBundleId({ CFBundleIdentifier: '(null)' })).toBeUndefined()
    expect(parseMacBundleId({ CFBundleIdentifier: 'contains\ncontrol' })).toBeUndefined()
  })
})

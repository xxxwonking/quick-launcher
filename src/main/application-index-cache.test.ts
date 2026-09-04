import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApplicationIndexCache, parseApplicationIndexCache } from './application-index-cache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('application index cache', () => {
  it('accepts only a bounded, strict cache shape', () => {
    const parsed = parseApplicationIndexCache({
      schemaVersion: 1,
      indexVersion: 7,
      generatedAt: '2026-09-03T10:00:00.000Z',
      entries: [{
        displayName: 'Editor',
        path: 'C:\\Apps\\Editor.exe',
        metadata: { platform: 'windows', executableName: 'Editor.exe' },
      }],
    })

    expect(parsed?.entries[0]).toMatchObject({ displayName: 'Editor', path: 'C:\\Apps\\Editor.exe' })
    expect(parseApplicationIndexCache({
      schemaVersion: 1,
      indexVersion: 7,
      generatedAt: '2026-09-03T10:00:00.000Z',
      entries: [],
      extra: true,
    })).toBeUndefined()
    expect(parseApplicationIndexCache({
      schemaVersion: 1,
      indexVersion: 7,
      generatedAt: 'not-a-date',
      entries: [],
    })).toBeUndefined()
    let nested: unknown = []
    for (let index = 0; index < 12; index += 1) nested = [nested]
    expect(parseApplicationIndexCache({ schemaVersion: 1, indexVersion: 1, generatedAt: '2026-09-03T10:00:00.000Z', entries: nested })).toBeUndefined()
  })

  it('writes and reloads an atomic app-index.json snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-app-index-'))
    temporaryDirectories.push(directory)
    const store = createApplicationIndexCache(join(directory, 'app-index.json'))
    const entries = [{ displayName: 'Notes', path: '/Applications/Notes.app', metadata: { platform: 'macos' as const } }]

    await store.save(entries, 3)

    expect(JSON.parse(await readFile(join(directory, 'app-index.json'), 'utf8'))).toMatchObject({ schemaVersion: 1, indexVersion: 3 })
    await expect(store.load()).resolves.toMatchObject({ indexVersion: 3, entries })
  })

  it('returns no snapshot for a corrupt cache and keeps a recoverable copy', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-app-index-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'app-index.json')
    const store = createApplicationIndexCache(filePath)
    await store.save([], 1)
    await writeFile(filePath, '{"schemaVersion":1,"entries":"bad"}', 'utf8')

    await expect(store.load()).resolves.toBeUndefined()
    await expect(readdir(directory)).resolves.toEqual(expect.arrayContaining([expect.stringMatching(/^app-index\.json\.corrupt-/u)]))
  })

  it('isolates an oversized or non-file cache instead of retrying it forever', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-app-index-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'app-index.json')
    const store = createApplicationIndexCache(filePath)

    await writeFile(filePath, Buffer.alloc(10 * 1024 * 1024 + 1, 0x20))
    await expect(store.load()).resolves.toBeUndefined()
    expect(await readdir(directory)).toEqual(expect.arrayContaining([expect.stringMatching(/^app-index\.json\.corrupt-/u)]))

    await mkdir(filePath)
    await expect(store.load()).resolves.toBeUndefined()
    expect(await readdir(directory)).toEqual(expect.arrayContaining([expect.stringMatching(/^app-index\.json\.corrupt-/u)]))
  })
})

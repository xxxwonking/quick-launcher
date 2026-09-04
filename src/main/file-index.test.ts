import { mkdir, writeFile } from 'node:fs/promises'
import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildFileLauncherCatalog, createIncrementalFileIndex, defaultFileSearchRoots, effectiveFileSearchRoots, scanFileIndex } from './file-index'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('file index', () => {
  it('uses the default folders when the configured root list is empty', () => {
    expect(effectiveFileSearchRoots([], '/Users/alice')).toEqual(defaultFileSearchRoots('/Users/alice'))
    expect(effectiveFileSearchRoots(['/Users/alice/Projects'], '/Users/alice')).toEqual(['/Users/alice/Projects'])
  })

  it('indexes bounded user files while skipping hidden and generated directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-file-index-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'Projects', 'demo'), { recursive: true })
    await mkdir(join(root, 'Projects', 'demo', 'node_modules', 'ignored'), { recursive: true })
    await mkdir(join(root, '.hidden'), { recursive: true })
    await writeFile(join(root, 'Projects', 'demo', 'README.md'), '# demo')
    await writeFile(join(root, 'Projects', 'demo', 'node_modules', 'ignored', 'package.json'), '{}')
    await writeFile(join(root, '.hidden', 'secret.txt'), 'secret')

    const entries = await scanFileIndex([root], { maxDepth: 4, maxEntries: 100 })
    const paths = entries.map((entry) => entry.path)

    expect(paths).toContain(join(root, 'Projects'))
    expect(paths).toContain(join(root, 'Projects', 'demo', 'README.md'))
    expect(paths.some((path) => path.includes('node_modules'))).toBe(false)
    expect(paths.some((path) => path.includes('.hidden'))).toBe(false)
  })

  it('enforces the entry limit and keeps paths out of the renderer payload', () => {
    const catalog = buildFileLauncherCatalog([
      { path: '/Users/alice/Documents/notes.md', displayName: 'notes.md', parentName: 'Documents', isDirectory: false },
    ], 7)

    expect(catalog.payload).toMatchObject({
      snapshotVersion: 7,
      items: [expect.objectContaining({
        title: 'notes.md',
        subtitle: '文件 · Documents',
        kind: 'file',
        action: { type: 'open-indexed-path', targetId: expect.stringMatching(/^path:[a-f0-9]{20}$/u) },
      })],
    })
    expect(catalog.targets.size).toBe(1)
    expect(JSON.stringify(catalog.payload)).not.toContain('/Users/alice')
  })

  it('adds a newly created file without rebuilding the whole root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-file-index-incremental-'))
    temporaryDirectories.push(root)
    const index = createIncrementalFileIndex([root], { maxDepth: 4, maxEntries: 100 })
    index.setEntries(await scanFileIndex([root], { maxDepth: 4, maxEntries: 100 }))

    await writeFile(join(root, 'new-note.txt'), 'new')
    const result = await index.applyChange({ root, event: 'rename', fileName: 'new-note.txt' })

    expect(result).toBe('changed')
    expect(index.entries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(root, 'new-note.txt'), displayName: 'new-note.txt', isDirectory: false }),
    ]))
  })

  it('removes a deleted file and its indexed descendants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-file-index-delete-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'Project'), { recursive: true })
    await writeFile(join(root, 'Project', 'notes.md'), 'notes')
    const index = createIncrementalFileIndex([root], { maxDepth: 4, maxEntries: 100 })
    index.setEntries(await scanFileIndex([root], { maxDepth: 4, maxEntries: 100 }))

    await unlink(join(root, 'Project', 'notes.md'))
    const result = await index.applyChange({ root, event: 'rename', fileName: join('Project', 'notes.md') })

    expect(result).toBe('changed')
    expect(index.entries().some((entry) => entry.path.endsWith('notes.md'))).toBe(false)
    expect(index.entries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(root, 'Project'), isDirectory: true }),
    ]))
  })

  it('indexes a newly created directory together with its allowed descendants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-file-index-directory-'))
    temporaryDirectories.push(root)
    const index = createIncrementalFileIndex([root], { maxDepth: 3, maxEntries: 100 })
    index.setEntries([])

    await mkdir(join(root, 'Notes', 'Daily'), { recursive: true })
    await writeFile(join(root, 'Notes', 'Daily', 'today.md'), 'today')
    const result = await index.applyChange({ root, event: 'rename', fileName: 'Notes' })

    expect(result).toBe('changed')
    expect(index.entries().map((entry) => entry.path)).toEqual(expect.arrayContaining([
      join(root, 'Notes'),
      join(root, 'Notes', 'Daily'),
      join(root, 'Notes', 'Daily', 'today.md'),
    ]))
  })

  it('preserves limits, skips generated directories, and falls back when the watcher omits a path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'quick-launcher-file-index-limits-'))
    temporaryDirectories.push(root)
    const index = createIncrementalFileIndex([root], { maxDepth: 4, maxEntries: 1 })
    index.setEntries([])

    await mkdir(join(root, 'node_modules', 'ignored'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'ignored', 'package.json'), '{}')
    expect(await index.applyChange({ root, event: 'rename', fileName: 'node_modules' })).toBe('unchanged')
    expect(index.entries()).toEqual([])
    expect(await index.applyChange({ root, event: 'rename', fileName: null })).toBe('fallback')
    expect(await index.applyChange({ root: join(root, 'other'), event: 'rename', fileName: 'note.txt' })).toBe('fallback')
  })
})

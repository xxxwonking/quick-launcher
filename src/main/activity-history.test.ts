import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createActivityHistoryStore, parseActivityHistory } from './activity-history'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('activity history', () => {
  it('drops malformed entries and keeps safe clipboard and file values', () => {
    expect(parseActivityHistory({
      schemaVersion: 1,
      entries: [
        { type: 'clipboard', value: 'hello', updatedAt: 10 },
        { type: 'file', value: '/Users/alice/demo.txt', updatedAt: 20 },
        { type: 'clipboard', value: 'bad\0value', updatedAt: 30 },
      ],
    }).entries).toEqual([
      { type: 'file', value: '/Users/alice/demo.txt', updatedAt: 20 },
      { type: 'clipboard', value: 'hello', updatedAt: 10 },
    ])
  })

  it('deduplicates recent values and enforces a per-category limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-history-'))
    temporaryDirectories.push(directory)
    const store = createActivityHistoryStore(join(directory, 'history.json'), 2)
    await store.load()

    await store.add('clipboard', 'first', 1)
    await store.add('clipboard', 'second', 2)
    await store.add('clipboard', 'first', 3)
    await store.add('clipboard', 'third', 4)
    await store.add('file', '/tmp/demo.txt', 5)

    expect(store.get()).toEqual([
      { type: 'file', value: '/tmp/demo.txt', updatedAt: 5 },
      { type: 'clipboard', value: 'third', updatedAt: 4 },
      { type: 'clipboard', value: 'first', updatedAt: 3 },
    ])
  })

  it('clears one history category or all history atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-history-'))
    temporaryDirectories.push(directory)
    const store = createActivityHistoryStore(join(directory, 'history.json'))
    await store.load()
    await store.add('clipboard', 'copy me', 1)
    await store.add('file', '/tmp/demo.txt', 2)

    await store.clear('clipboard')
    expect(store.get()).toEqual([{ type: 'file', value: '/tmp/demo.txt', updatedAt: 2 }])
    await store.clear()
    expect(store.get()).toEqual([])
    expect(JSON.parse(await readFile(join(directory, 'history.json'), 'utf8'))).toEqual({ schemaVersion: 1, entries: [] })
  })
})

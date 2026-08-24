import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUserCommandStore, parsePersistedUserCommands } from './user-command-store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('user command store', () => {
  it('drops malformed commands and preserves only safe command shapes', () => {
    const parsed = parsePersistedUserCommands({
      schemaVersion: 1,
      version: 4,
      commands: [
        { id: 'open-docs', keyword: 'docs', title: '文档', type: 'open-url', target: 'https://example.com', enabled: true },
        { id: 'bad keyword', keyword: 'bad keyword', title: '坏命令', type: 'open-url', target: 'file:///tmp/a', enabled: true },
      ],
    })

    expect(parsed).toEqual({
      schemaVersion: 1,
      version: 4,
      commands: [{ id: 'open-docs', keyword: 'docs', title: '文档', type: 'open-url', target: 'https://example.com', enabled: true }],
    })
  })

  it('persists commands atomically and rejects duplicate IDs or keywords', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-commands-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'user.json')
    const store = createUserCommandStore(filePath)

    await store.load()
    await store.create({ id: 'open-docs', keyword: 'docs', title: '文档', type: 'open-url', target: 'https://example.com' })

    await expect(store.create({ id: 'open-docs-2', keyword: 'docs', title: '重复', type: 'open-url', target: 'https://example.com/2' })).rejects.toThrow('COMMAND_CONFLICT')
    await expect(store.create({ id: 'open-docs', keyword: 'other', title: '重复', type: 'open-url', target: 'https://example.com/2' })).rejects.toThrow('COMMAND_CONFLICT')

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as { version: number; commands: unknown[] }
    expect(persisted.version).toBe(1)
    expect(persisted.commands).toHaveLength(1)
    expect((await createUserCommandStore(filePath).load())[0]).toMatchObject({ id: 'open-docs', keyword: 'docs' })
  })
})

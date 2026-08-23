import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSettingsStore, parsePersistedSettings } from './settings-store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('settings store', () => {
  it('falls back to safe defaults for malformed settings', () => {
    expect(parsePersistedSettings({ theme: 'neon', searchEngine: { kind: 'custom', template: 'file:///tmp/{query}' } })).toEqual({
      schemaVersion: 1,
      theme: 'system',
      searchEngine: { kind: 'bing' },
      hotkey: 'Alt+Space',
      autostart: false,
    })
  })

  it('writes settings atomically and reloads them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-settings-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'settings.json')
    const store = createSettingsStore(filePath)

    await store.load()
    await store.update({ theme: 'dark', searchEngine: { kind: 'google' }, autostart: true })

    expect(await createSettingsStore(filePath).load()).toMatchObject({ theme: 'dark', searchEngine: { kind: 'google' }, autostart: true })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ schemaVersion: 1, theme: 'dark' })
  })
})

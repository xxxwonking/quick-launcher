import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
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
      onboardingCompleted: false,
      theme: 'system',
      searchEngine: { kind: 'bing' },
      hotkey: 'Alt+Space',
      autostart: false,
      showRecent: false,
      clipboardHistoryEnabled: false,
      fileHistoryEnabled: true,
      fileSearchRoots: [],
      disabledBaseAppIds: [],
    })
  })

  it('persists a safe list of disabled base application templates', () => {
    expect(parsePersistedSettings({
      schemaVersion: 1,
      disabledBaseAppIds: ['chrome', 'vscode'],
    }).disabledBaseAppIds).toEqual(['chrome', 'vscode'])
    expect(parsePersistedSettings({
      schemaVersion: 1,
      disabledBaseAppIds: ['chrome', 'chrome'],
    }).disabledBaseAppIds).toEqual([])
  })

  it('keeps only bounded absolute file-search roots and removes duplicates', () => {
    expect(parsePersistedSettings({
      schemaVersion: 1,
      fileSearchRoots: ['/Users/alice/Projects', '/Users/alice/Projects', 'relative/path', '', '/Users/bob/Docs'],
    }).fileSearchRoots).toEqual(['/Users/alice/Projects', '/Users/bob/Docs'])

    expect(parsePersistedSettings({
      schemaVersion: 1,
      fileSearchRoots: Array.from({ length: 13 }, (_, index) => `/Users/alice/${index}`),
    }).fileSearchRoots).toEqual([])
  })

  it('defaults onboarding to incomplete and persists the completed state', async () => {
    expect(parsePersistedSettings({ schemaVersion: 1 }).onboardingCompleted).toBe(false)

    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-settings-'))
    temporaryDirectories.push(directory)
    const store = createSettingsStore(join(directory, 'settings.json'))
    await store.load()
    await store.update({ onboardingCompleted: true })

    expect((await createSettingsStore(join(directory, 'settings.json')).load()).onboardingCompleted).toBe(true)
  })

  it('writes settings atomically and reloads them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-settings-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'settings.json')
    const store = createSettingsStore(filePath)

    await store.load()
    await store.update({ theme: 'dark', searchEngine: { kind: 'google' }, autostart: true, showRecent: true, clipboardHistoryEnabled: true, fileHistoryEnabled: false, fileSearchRoots: ['/Users/alice/Projects'] })

    expect(await createSettingsStore(filePath).load()).toMatchObject({ theme: 'dark', searchEngine: { kind: 'google' }, autostart: true, showRecent: true, clipboardHistoryEnabled: true, fileHistoryEnabled: false, fileSearchRoots: ['/Users/alice/Projects'] })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ schemaVersion: 1, theme: 'dark' })
  })

  it('recovers the write queue after a failed save', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-settings-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'settings.json')
    await mkdir(filePath)
    const store = createSettingsStore(filePath)

    await expect(store.update({ theme: 'dark' })).rejects.toThrow()
    await rm(filePath, { recursive: true, force: true })

    await expect(store.update({ showRecent: true })).resolves.toMatchObject({ showRecent: true })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ showRecent: true })
  })
})

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseBaseCatalog } from './base-catalog'

const validCatalog = {
  schemaVersion: 1,
  catalogVersion: '2026.09',
  apps: [{
    id: 'chrome',
    displayName: 'Google Chrome',
    defaultAliases: ['chrome', 'googlechrome'],
    platforms: {
      windows: { executables: ['chrome.exe'] },
      macos: { bundleIds: ['com.google.Chrome'] },
    },
  }],
  commands: [],
}

describe('base catalog parser', () => {
  it('parses a valid cross-platform application template', () => {
    expect(parseBaseCatalog(validCatalog)).toMatchObject({
      schemaVersion: 1,
      catalogVersion: '2026.09',
      apps: [{ id: 'chrome', displayName: 'Google Chrome' }],
      commands: [],
    })
  })

  it.each([
    ['unknown top-level fields', { ...validCatalog, extra: true }],
    ['unknown app fields', { ...validCatalog, apps: [{ ...validCatalog.apps[0], extra: true }] }],
    ['missing platform signals', { ...validCatalog, apps: [{ ...validCatalog.apps[0], platforms: {} }] }],
    ['unsafe aliases', { ...validCatalog, apps: [{ ...validCatalog.apps[0], defaultAliases: ['google chrome'] }] }],
    ['unsupported base commands', { ...validCatalog, commands: [{ id: 'docs' }] }],
  ])('rejects %s', (_label, catalog) => {
    expect(parseBaseCatalog(catalog)).toBeUndefined()
  })

  it('rejects duplicate app ids and duplicate aliases', () => {
    expect(parseBaseCatalog({
      ...validCatalog,
      apps: [validCatalog.apps[0], { ...validCatalog.apps[0], displayName: 'Chrome' }],
    })).toBeUndefined()
    expect(parseBaseCatalog({
      ...validCatalog,
      apps: [{ ...validCatalog.apps[0], defaultAliases: ['chrome', 'Chrome'] }],
    })).toBeUndefined()
  })

  it('keeps the bundled catalog valid and includes the common desktop apps', async () => {
    const raw = await readFile(new URL('../../resources/catalog/base.json', import.meta.url), 'utf8')
    const catalog = parseBaseCatalog(JSON.parse(raw) as unknown)

    expect(catalog?.catalogVersion).toBe('2026.09.3')
    expect(catalog?.apps.map((app) => app.id)).toEqual(expect.arrayContaining([
      'slack', 'discord', 'obsidian', 'notion', 'spotify', 'figma', 'iterm2', 'terminal',
      'safari', 'firefox', 'brave', 'raycast', 'alfred', 'iina', 'proxyman', 'tailscale',
      'jetbrains-toolbox', 'xcode', 'cherry-studio', 'activity-monitor', 'docker', 'qq',
    ]))
  })
})

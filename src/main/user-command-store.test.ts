import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUserCommandStore, parsePersistedUserCommands } from './user-command-store'
import type { UserCommand } from '../shared/launcher-command'

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
      importedPackages: {},
    })
  })

  it('drops reserved object-prototype keys from persisted command IDs', () => {
    const parsed = parsePersistedUserCommands({
      schemaVersion: 1,
      version: 1,
      commands: [{ id: '__proto__', keyword: 'proto', title: '原型键', type: 'open-url', target: 'https://example.com', enabled: true }],
    })

    expect(parsed.commands).toEqual([])
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

  it('accepts safe site-search templates with exactly one query placeholder', () => {
    const parsed = parsePersistedUserCommands({
      schemaVersion: 1,
      version: 1,
      commands: [
        { id: 'douyin', keyword: '抖音', title: '抖音', type: 'site-search', target: 'https://www.douyin.com/search/{query}?type=general', enabled: true },
        { id: 'missing', keyword: 'missing', title: '缺少占位符', type: 'site-search', target: 'https://example.com/search', enabled: true },
        { id: 'duplicate', keyword: 'duplicate', title: '重复占位符', type: 'site-search', target: 'https://example.com/{query}/{query}', enabled: true },
        { id: 'unsafe', keyword: 'unsafe', title: '危险协议', type: 'site-search', target: 'javascript:alert({query})', enabled: true },
      ],
    })

    expect(parsed.commands).toEqual([
      { id: 'douyin', keyword: '抖音', title: '抖音', type: 'site-search', target: 'https://www.douyin.com/search/{query}?type=general', enabled: true },
    ])
  })

  it('accepts a namespaced package application command but rejects arbitrary paths', () => {
    const parsed = parsePersistedUserCommands({
      schemaVersion: 1,
      version: 1,
      commands: [
        { id: 'open-wechat', keyword: 'wx', title: '打开微信', type: 'launch-app', target: 'package:team.shortcuts/wechat', enabled: true },
        { id: 'unsafe', keyword: 'unsafe', title: '危险', type: 'launch-app', target: '/Applications/Bad.app', enabled: true },
      ],
    })

    expect(parsed.commands).toEqual([
      expect.objectContaining({ id: 'open-wechat', type: 'launch-app', target: 'package:team.shortcuts/wechat' }),
    ])
  })

  it('persists application bindings without exposing them through command records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-commands-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'user.json')
    const store = createUserCommandStore(filePath)
    await store.load()

    await store.setAppBinding('package:team.shortcuts/editor', {
      platform: 'windows',
      kind: 'windows-executable',
      path: 'C:\\Apps\\Editor.exe',
    })

    expect(store.getAppBindings()).toEqual({
      'package:team.shortcuts/editor': {
        platform: 'windows',
        kind: 'windows-executable',
        path: 'C:\\Apps\\Editor.exe',
      },
    })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      appBindings: { 'package:team.shortcuts/editor': { kind: 'windows-executable' } },
    })
    await store.create({ id: 'docs', keyword: 'docs', title: '文档', type: 'open-url', target: 'https://example.com' })
    expect((await createUserCommandStore(filePath).load()).length).toBe(1)
    expect(createUserCommandStore(filePath).getAppBindings()).toEqual({})
    const reloaded = createUserCommandStore(filePath)
    await reloaded.load()
    expect(reloaded.getAppBindings()['package:team.shortcuts/editor']?.path).toBe('C:\\Apps\\Editor.exe')
  })

  it('drops package commands whose persisted package snapshot is missing', () => {
    const parsed = parsePersistedUserCommands({
      schemaVersion: 1,
      version: 2,
      importedPackages: {},
      commands: [{
        id: 'orphan',
        keyword: 'orphan',
        title: '孤立命令',
        type: 'launch-app',
        target: 'package:missing/app',
        enabled: true,
        source: { kind: 'package', packageId: 'missing', packageVersion: '1.0.0' },
      }],
    })

    expect(parsed.commands).toEqual([])
  })

  it('imports commands atomically with replace, rename, and skip decisions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-commands-'))
    temporaryDirectories.push(directory)
    const store = createUserCommandStore(join(directory, 'user.json'))
    await store.load()
    await store.create({ id: 'existing', keyword: 'docs', title: '旧文档', type: 'open-url', target: 'https://old.example.com' })

    const commands = await store.importCommands([
      { id: 'existing', keyword: 'docs', title: '新文档', type: 'open-url', target: 'https://new.example.com', enabled: true },
      { id: 'other', keyword: 'docs', title: '另一个文档', type: 'open-url', target: 'https://other.example.com', enabled: true },
      { id: 'skip-me', keyword: 'skip', title: '跳过', type: 'open-url', target: 'https://skip.example.com', enabled: true },
    ], [
      { incomingId: 'existing', action: 'replace' },
      { incomingId: 'other', action: 'rename', keyword: 'other-docs' },
      { incomingId: 'skip-me', action: 'skip' },
    ])

    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'existing', title: '新文档' }),
      expect.objectContaining({ id: 'other', keyword: 'other-docs' }),
    ]))
    expect(commands).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'skip-me' })]))
  })

  it('persists package snapshots and replaces package-owned commands on upgrade', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-commands-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'user.json')
    const store = createUserCommandStore(filePath)
    await store.load()

    const firstSnapshot = {
      schemaVersion: 1 as const,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      digest: 'a'.repeat(64),
      apps: [],
      commands: [{ id: 'docs', keyword: 'docs', type: 'open_url' as const, url: 'https://example.com/docs' }],
    }
    const firstCommand: UserCommand = {
      id: 'docs',
      keyword: 'docs',
      title: '团队命令 · docs',
      type: 'open-url',
      target: 'https://example.com/docs',
      enabled: true,
      source: { kind: 'package', packageId: 'team.shortcuts', packageVersion: '1.0.0' },
    }

    await store.importPackage(firstSnapshot, [firstCommand], [])
    expect(store.getImportedPackages()['team.shortcuts']).toMatchObject({ version: '1.0.0', digest: 'a'.repeat(64) })
    await expect(store.importPackage(firstSnapshot, [firstCommand], [])).rejects.toThrow('PACKAGE_ALREADY_IMPORTED')

    const upgradedSnapshot = { ...firstSnapshot, version: '1.1.0', digest: 'b'.repeat(64) }
    const upgradedCommand = { ...firstCommand, title: '团队命令 · 文档', source: { kind: 'package' as const, packageId: 'team.shortcuts', packageVersion: '1.1.0' } }
    const commands = await store.importPackage(upgradedSnapshot, [upgradedCommand], [])
    expect(commands).toEqual([expect.objectContaining({ id: 'docs', title: '团队命令 · 文档', source: expect.objectContaining({ packageVersion: '1.1.0' }) })])
    expect((await createUserCommandStore(filePath).load())[0]).toEqual(expect.objectContaining({ id: 'docs', title: '团队命令 · 文档' }))
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ importedPackages: { 'team.shortcuts': { version: '1.1.0', digest: 'b'.repeat(64) } } })
  })

  it('promotes an edited package command to a user command before a later upgrade', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quick-launcher-commands-'))
    temporaryDirectories.push(directory)
    const store = createUserCommandStore(join(directory, 'user.json'))
    await store.load()

    const snapshot = {
      schemaVersion: 1 as const,
      packageId: 'editable.shortcuts',
      name: '可编辑命令',
      version: '1.0.0',
      digest: 'c'.repeat(64),
      apps: [],
      commands: [{ id: 'docs', keyword: 'docs', type: 'open_url' as const, url: 'https://example.com/docs' }],
    }
    const command: UserCommand = {
      id: 'docs',
      keyword: 'docs',
      title: '可编辑命令 · docs',
      type: 'open-url',
      target: 'https://example.com/docs',
      enabled: true,
      source: { kind: 'package', packageId: 'editable.shortcuts', packageVersion: '1.0.0' },
    }

    await store.importPackage(snapshot, [command], [])
    const edited = await store.update('docs', { title: '我的文档' })
    expect(edited.source).toBeUndefined()

    const upgraded = await store.importPackage({ ...snapshot, version: '2.0.0', digest: 'd'.repeat(64) }, [{ ...command, title: '包的新文档', source: { kind: 'package', packageId: 'editable.shortcuts', packageVersion: '2.0.0' } }], [{ incomingId: 'docs', action: 'skip' }])
    expect(upgraded).toEqual([expect.objectContaining({ id: 'docs', title: '我的文档' })])
  })
})

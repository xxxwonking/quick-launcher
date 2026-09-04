import { describe, expect, it } from 'vitest'
import { buildCommandPackagePreview, packageCommandsToUserCommands } from './command-package-importer'

describe('command package importer', () => {
  it('converts safe package commands into local command records', () => {
    const commands = packageCommandsToUserCommands({
      schemaVersion: 1,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [],
      commands: [
        { id: 'docs', keyword: 'docs', type: 'open_url', url: 'https://example.com/docs' },
        { id: 'bilibili', keyword: 'b站', type: 'web_search', engine: 'custom', template: 'https://search.bilibili.com/all?keyword={query}' },
      ],
    })

    expect(commands).toEqual([
      expect.objectContaining({ id: 'docs', keyword: 'docs', title: '团队命令 · docs', type: 'open-url', target: 'https://example.com/docs', enabled: true, source: { kind: 'package', packageId: 'team.shortcuts', packageVersion: '1.0.0' } }),
      expect.objectContaining({ id: 'bilibili', keyword: 'b站', title: '团队命令 · b站', type: 'site-search', target: 'https://search.bilibili.com/all?keyword={query}', enabled: true, source: { kind: 'package', packageId: 'team.shortcuts', packageVersion: '1.0.0' } }),
    ])
  })

  it('namespaces package-local app references for launch commands', () => {
    const commands = packageCommandsToUserCommands({
      schemaVersion: 1,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [{
        id: 'wechat',
        displayName: '微信',
        defaultAliases: ['wx'],
        platforms: { macos: { bundleIds: ['com.tencent.xinWeChat'] } },
      }],
      commands: [{ id: 'open-wechat', keyword: 'wx', type: 'launch_app', appRef: 'wechat' }],
    })

    expect(commands).toEqual([expect.objectContaining({
      id: 'open-wechat',
      type: 'launch-app',
      target: 'package:team.shortcuts/wechat',
      source: { kind: 'package', packageId: 'team.shortcuts', packageVersion: '1.0.0' },
    })])
  })

  it('accepts built-in app references and rejects unknown application references', () => {
    const commandPackage = {
      schemaVersion: 1 as const,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [],
      commands: [{ id: 'open-cursor', keyword: 'cursor', type: 'launch_app' as const, appRef: 'cursor' }],
    }
    expect(packageCommandsToUserCommands(commandPackage, new Set(['cursor']))[0]).toMatchObject({ target: 'cursor', type: 'launch-app' })
    expect(() => packageCommandsToUserCommands(commandPackage)).toThrow('INVALID_PACKAGE_APP_REF')
  })

  it('marks launch commands whose application is not currently installed', () => {
    const preview = buildCommandPackagePreview({
      schemaVersion: 1,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [{
        id: 'wechat',
        displayName: '微信',
        defaultAliases: ['wx'],
        platforms: { macos: { bundleIds: ['com.tencent.xinWeChat'] } },
      }],
      commands: [{ id: 'open-wechat', keyword: 'wx', type: 'launch_app', appRef: 'wechat' }],
    }, 'a'.repeat(64), [], 'preview-app', 1, undefined, undefined, undefined, new Set())

    expect(preview.unavailableAppRefs).toEqual(['package:team.shortcuts/wechat'])
  })

  it('previews keyword and id conflicts without mutating existing commands', () => {
    const preview = buildCommandPackagePreview({
      schemaVersion: 1,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [],
      commands: [{ id: 'docs', keyword: 'manual', type: 'open_url', url: 'https://example.com/docs' }],
    }, 'digest', [{ id: 'docs', keyword: 'old', title: '旧文档', type: 'open-url', target: 'https://old.example.com', enabled: true }], 'preview-1', 4)

    expect(preview).toMatchObject({
      previewId: 'preview-1',
      expectedConfigVersion: 4,
      packageDigest: 'digest',
      conflicts: [{ kind: 'command-id', incomingId: 'docs', existingId: 'docs' }],
      packageStatus: 'new',
    })
  })

  it('marks a package as already imported or upgraded using its digest', () => {
    const basePackage = {
      schemaVersion: 1 as const,
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      apps: [],
      commands: [{ id: 'docs', keyword: 'docs', type: 'open_url' as const, url: 'https://example.com/docs' }],
    }
    const existing = {
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      digest: 'a'.repeat(64),
      schemaVersion: 1 as const,
      apps: [],
      commands: basePackage.commands,
    }

    expect(buildCommandPackagePreview(basePackage, 'a'.repeat(64), [], 'preview-1', 1, undefined, existing)).toMatchObject({
      packageStatus: 'already-imported',
      changes: [],
    })
    expect(buildCommandPackagePreview({ ...basePackage, version: '1.1.0' }, 'b'.repeat(64), [], 'preview-2', 1, undefined, existing)).toMatchObject({
      packageStatus: 'upgrade',
      previousVersion: '1.0.0',
      previousDigest: 'a'.repeat(64),
    })
    expect(buildCommandPackagePreview({ ...basePackage, version: '0.9.0' }, 'c'.repeat(64), [], 'preview-3', 1, undefined, existing).packageStatus).toBe('downgrade')
    expect(buildCommandPackagePreview({ ...basePackage, version: '1.0.0', commands: [{ ...basePackage.commands[0]!, url: 'https://example.com/other' }] }, 'd'.repeat(64), [], 'preview-4', 1, undefined, existing).packageStatus).toBe('version-conflict')
  })
})

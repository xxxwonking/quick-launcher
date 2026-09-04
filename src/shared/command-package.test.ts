import { describe, expect, it } from 'vitest'
import { parseCommandPackage } from './command-package'

const validPackage = {
  schemaVersion: 1,
  packageId: 'team.shortcuts',
  name: '团队快捷命令',
  version: '1.0.0',
  apps: [],
  commands: [{
    id: 'docs',
    keyword: 'docs',
    type: 'open_url',
    url: 'https://example.com/docs',
    title: '项目文档',
  }],
}

const validApp = {
  id: 'wechat',
  displayName: '微信',
  defaultAliases: ['wx', 'wechat'],
  platforms: {
    windows: { executables: ['WeChat.exe'] },
    macos: { bundleIds: ['com.tencent.xinWeChat'] },
  },
}

describe('command package parser', () => {
  it('normalizes a safe URL command package', () => {
    expect(parseCommandPackage(validPackage)).toEqual(validPackage)
  })

  it('accepts a parameterized web-search command', () => {
    expect(parseCommandPackage({
      ...validPackage,
      commands: [{
        id: 'bilibili',
        keyword: 'b站',
        type: 'web_search',
        engine: 'custom',
        template: 'https://search.bilibili.com/all?keyword={query}',
      }],
    })).toMatchObject({ commands: [{ type: 'web_search', engine: 'custom' }] })
  })

  it('accepts package-local app templates and launch_app commands', () => {
    expect(parseCommandPackage({
      ...validPackage,
      apps: [validApp],
      commands: [{ id: 'open-wechat', keyword: 'wx', type: 'launch_app', appRef: 'wechat', title: '打开微信' }],
    })).toMatchObject({
      apps: [validApp],
      commands: [{ type: 'launch_app', appRef: 'wechat', title: '打开微信' }],
    })
  })

  it('treats omitted optional app and command arrays as empty', () => {
    const withoutArrays = Object.fromEntries(Object.entries(validPackage).filter(([key]) => key !== 'apps' && key !== 'commands'))
    expect(parseCommandPackage(withoutArrays)).toMatchObject({ apps: [], commands: [] })
  })

  it.each([
    ['unknown package field', { ...validPackage, extra: true }],
    ['unknown command field', { ...validPackage, commands: [{ ...validPackage.commands[0], extra: true }] }],
    ['reserved package id', { ...validPackage, packageId: '__proto__' }],
    ['reserved command id', { ...validPackage, commands: [{ ...validPackage.commands[0], id: 'constructor' }] }],
    ['unsafe URL', { ...validPackage, commands: [{ ...validPackage.commands[0], url: 'javascript:alert(1)' }] }],
    ['duplicate command ids', { ...validPackage, commands: [validPackage.commands[0], { ...validPackage.commands[0], keyword: 'other' }] }],
    ['unknown app fields', { ...validPackage, apps: [{ ...validApp, extra: true }] }],
    ['reserved app id', { ...validPackage, apps: [{ ...validApp, id: 'prototype' }] }],
    ['missing app platform signals', { ...validPackage, apps: [{ ...validApp, platforms: {} }] }],
    ['invalid launch app reference', { ...validPackage, commands: [{ id: 'wechat', keyword: 'wx', type: 'launch_app', appRef: '../wechat' }] }],
    ['duplicate app ids', { ...validPackage, apps: [validApp, validApp] }],
    ['too-deep JSON', { ...validPackage, apps: [[[[[[[[1]]]]]]]] }],
  ])('rejects %s', (_label, packageValue) => {
    expect(parseCommandPackage(packageValue)).toBeUndefined()
  })
})

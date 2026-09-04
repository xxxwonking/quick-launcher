import { describe, expect, it } from 'vitest'
import { searchLauncher } from './search-catalog'

const runtimeWechat = {
  id: 'shortcut:wechat',
  title: '微信',
  subtitle: '应用程序',
  hint: 'wx',
  aliases: ['wx', 'wechat', 'weixin', '微信'],
  icon: 'message' as const,
  kind: 'application' as const,
  action: { type: 'launch-indexed' as const, targetId: 'shortcut:wechat' },
}

describe('searchLauncher', () => {
  it('keeps the default search list empty', () => {
    expect(searchLauncher('')).toEqual([])
  })

  it('does not fall back to demo applications when no runtime catalog is provided', () => {
    expect(searchLauncher('wx')).toEqual([
      expect.objectContaining({ id: 'web:fallback', action: { type: 'web-search', query: 'wx' } }),
    ])
  })

  it('shows only configured recent items when recent usage is enabled', () => {
    const recentItems = [{
      id: 'app:cursor',
      title: 'Cursor',
      subtitle: '应用程序',
      aliases: ['cursor'],
      icon: 'code' as const,
      kind: 'application' as const,
      action: { type: 'launch-demo' as const, targetId: 'cursor' },
    }]

    expect(searchLauncher('', undefined, { showRecent: true, recentItems })).toEqual(recentItems)
    expect(searchLauncher('', undefined, { showRecent: false, recentItems })).toEqual([])
  })

  it('ranks an exact alias ahead of the web fallback', () => {
    const results = searchLauncher('wx', [runtimeWechat])

    expect(results[0]).toMatchObject({
      id: 'shortcut:wechat',
      action: { type: 'launch-indexed', targetId: 'shortcut:wechat' },
    })
    expect(results.at(-1)).toMatchObject({
      id: 'web:fallback',
      action: { type: 'web-search', query: 'wx' },
    })
  })

  it.each(['setting', 'settings', '设置'])('exposes the settings command for %s', (query) => {
    expect(searchLauncher(query)[0]).toMatchObject({
      id: 'builtin:settings',
      action: { type: 'open-settings' },
    })
  })

  it('tolerates a single-character typo without outranking an exact match', () => {
    expect(searchLauncher('seting')[0]).toMatchObject({
      id: 'builtin:settings',
      action: { type: 'open-settings' },
    })
    expect(searchLauncher('seting').at(-1)).toMatchObject({ id: 'web:fallback' })
  })

  it('tolerates an adjacent transposition in an application alias', () => {
    expect(searchLauncher('weixni', [runtimeWechat])[0]).toMatchObject({
      id: 'shortcut:wechat',
      action: { type: 'launch-indexed', targetId: 'shortcut:wechat' },
    })
  })

  it('does not fuzzy-match very short queries', () => {
    expect(searchLauncher('zz', [runtimeWechat])[0]).toMatchObject({ id: 'web:fallback' })
  })

  it('matches a Chinese application by its full pinyin alias', () => {
    expect(searchLauncher('weixin', [runtimeWechat])[0]).toMatchObject({ id: 'shortcut:wechat' })
  })

  it.each(['tutorial', 'help', '教程', '帮助'])('exposes the tutorial command for %s', (query) => {
    expect(searchLauncher(query)[0]).toMatchObject({
      id: 'builtin:tutorial',
      action: { type: 'open-tutorial' },
    })
  })

  it('parses llq arguments without changing the original query text', () => {
    expect(searchLauncher('llq   抖音')).toEqual([
      expect.objectContaining({
        id: 'web:command',
        title: '使用必应搜索“抖音”',
        action: { type: 'web-search', query: '抖音' },
      }),
    ])
  })

  it('returns a non-executable hint when the web command has no argument', () => {
    expect(searchLauncher('llq')).toEqual([
      expect.objectContaining({
        kind: 'hint',
        title: '请输入搜索内容',
        disabled: true,
      }),
    ])
  })

  it('rejects input longer than 512 Unicode characters before searching', () => {
    const result = searchLauncher('a'.repeat(513))
    expect(result).toEqual([
      expect.objectContaining({
        kind: 'hint',
        title: '输入内容过长',
        disabled: true,
      }),
    ])
  })

  it('normalizes full-width command tokens and spaces while preserving the argument', () => {
    expect(searchLauncher('ｌｌｑ　抖音')).toEqual([
      expect.objectContaining({
        id: 'web:command',
        title: '使用必应搜索“抖音”',
        action: { type: 'web-search', query: '抖音' },
      }),
    ])
  })

  it('turns a Douyin-prefixed query into a direct site search', () => {
    expect(searchLauncher('抖音   海贼王')).toEqual([
      expect.objectContaining({
        id: 'site-search:douyin',
        title: '在抖音搜索“海贼王”',
        action: { type: 'site-search', provider: 'douyin', query: '海贼王' },
      }),
    ])
  })

  it('still allows the installed Douyin application to match without a search term', () => {
    const douyin = {
      id: 'shortcut:douyin',
      title: '抖音',
      subtitle: '应用程序',
      aliases: ['抖音', 'douyin'],
      icon: 'file' as const,
      kind: 'application' as const,
      action: { type: 'launch-indexed' as const, targetId: 'shortcut:douyin' },
    }

    expect(searchLauncher('抖音', [douyin])[0]).toMatchObject({ id: 'shortcut:douyin' })
  })

  it('parses a configured site-search command and preserves its query text', () => {
    const bilibili = {
      id: 'command:bilibili',
      title: '哔哩哔哩',
      subtitle: '站点搜索',
      aliases: ['b站'],
      icon: 'globe' as const,
      kind: 'command' as const,
      action: { type: 'command-site-search' as const, commandId: 'bilibili', query: '' },
    }

    expect(searchLauncher('b站   海贼王 剧场版', [bilibili])).toEqual([
      expect.objectContaining({
        id: 'command:bilibili',
        title: '在哔哩哔哩搜索“海贼王 剧场版”',
        action: { type: 'command-site-search', commandId: 'bilibili', query: '海贼王 剧场版' },
      }),
    ])
  })

  it('normalizes full-width spaces for configured site-search commands', () => {
    const bilibili = {
      id: 'command:bilibili',
      title: '哔哩哔哩',
      subtitle: '站点搜索',
      aliases: ['b站'],
      icon: 'globe' as const,
      kind: 'command' as const,
      action: { type: 'command-site-search' as const, commandId: 'bilibili', query: '' },
    }

    expect(searchLauncher('b站　海贼王', [bilibili])).toEqual([
      expect.objectContaining({
        id: 'command:bilibili',
        title: '在哔哩哔哩搜索“海贼王”',
        action: { type: 'command-site-search', commandId: 'bilibili', query: '海贼王' },
      }),
    ])
  })

  it('shows a non-executable hint when a site-search keyword has no query', () => {
    const bilibili = {
      id: 'command:bilibili',
      title: '哔哩哔哩',
      subtitle: '站点搜索',
      aliases: ['b站'],
      icon: 'globe' as const,
      kind: 'command' as const,
      action: { type: 'command-site-search' as const, commandId: 'bilibili', query: '' },
    }

    expect(searchLauncher('b站', [bilibili])).toEqual([
      expect.objectContaining({
        title: '在哔哩哔哩中搜索',
        subtitle: '输入 b站 + 关键词',
        disabled: true,
      }),
    ])
  })

  it('returns an automatically selectable web fallback for an unknown query', () => {
    expect(searchLauncher('陌生关键词')).toEqual([
      expect.objectContaining({
        id: 'web:fallback',
        disabled: false,
        action: { type: 'web-search', query: '陌生关键词' },
      }),
    ])
  })

  it('searches a runtime application catalog instead of the demo applications', () => {
    const runtimeItems = [{
      id: 'shortcut:quark',
      title: '夸克网盘',
      subtitle: '应用程序',
      hint: 'kkwp',
      aliases: ['夸克网盘', 'kuakewangpan', 'kkwp'],
      icon: 'folder' as const,
      kind: 'application' as const,
      action: { type: 'launch-indexed' as const, targetId: 'shortcut:quark' },
    }]

    expect(searchLauncher('kkwp', runtimeItems)[0]).toMatchObject({ id: 'shortcut:quark' })
    expect(searchLauncher('cursor', runtimeItems)[0]).toMatchObject({ id: 'web:fallback' })
  })

  it('searches an indexed file by its display name without needing its real path', () => {
    const file = {
      id: 'path:0123456789abcdef0123',
      title: 'README.md',
      subtitle: '文件 · demo',
      aliases: ['readme.md', 'readme', 'demo'],
      icon: 'folder' as const,
      kind: 'file' as const,
      action: { type: 'open-indexed-path' as const, targetId: 'path:0123456789abcdef0123' },
    }

    expect(searchLauncher('readme', [file])[0]).toMatchObject({
      id: file.id,
      action: { type: 'open-indexed-path', targetId: file.id },
    })
  })

  it('lists matching local clipboard history before the web fallback', () => {
    const historyItems = [{
      id: 'history:clipboard:one',
      title: '刚复制的文本',
      subtitle: '剪贴板历史 · Enter 复制',
      aliases: ['剪贴板历史', 'clipboard history'],
      icon: 'clipboard' as const,
      kind: 'history' as const,
      action: { type: 'copy-text' as const, text: '刚复制的文本' },
    }]

    expect(searchLauncher('剪贴板历史', historyItems)[0]).toMatchObject({
      id: 'history:clipboard:one',
      action: { type: 'copy-text', text: '刚复制的文本' },
    })
  })
})

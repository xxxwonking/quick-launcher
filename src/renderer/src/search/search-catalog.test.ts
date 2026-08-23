import { describe, expect, it } from 'vitest'
import { searchLauncher } from './search-catalog'

describe('searchLauncher', () => {
  it('keeps the curated applications in a stable default order', () => {
    expect(searchLauncher('').map((item) => item.id)).toEqual([
      'app:vscode',
      'app:wechat',
      'app:cursor',
      'app:system-info',
      'app:projects',
    ])
  })

  it('ranks an exact alias ahead of the web fallback', () => {
    const results = searchLauncher('wx')

    expect(results[0]).toMatchObject({
      id: 'app:wechat',
      action: { type: 'launch-demo', targetId: 'wechat' },
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

  it('matches a Chinese application by its full pinyin alias', () => {
    expect(searchLauncher('weixin')[0]).toMatchObject({ id: 'app:wechat' })
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

  it('returns an automatically selectable web fallback for an unknown query', () => {
    expect(searchLauncher('陌生关键词')).toEqual([
      expect.objectContaining({
        id: 'web:fallback',
        disabled: false,
        action: { type: 'web-search', query: '陌生关键词' },
      }),
    ])
  })
})

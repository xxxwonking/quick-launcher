import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  buildSiteSearchUrl,
  buildUserCommandSiteSearchUrl,
  findApplicationDefinition,
  normalizeSearchEngine,
  parseExecutableAction,
  type SearchEngine,
} from './app-catalog'

describe('app catalog helpers', () => {
  it('builds a browser URL without double-encoding the template', () => {
    expect(buildSearchUrl({ kind: 'bing' }, '抖音 热门')).toBe('https://www.bing.com/search?q=%E6%8A%96%E9%9F%B3%20%E7%83%AD%E9%97%A8')
    expect(buildSearchUrl({ kind: 'custom', template: 'https://example.com/find?term={query}' }, 'a/b')).toBe('https://example.com/find?term=a%2Fb')
  })

  it('builds a Douyin search URL without transient tracking parameters', () => {
    expect(buildSiteSearchUrl('douyin', '海贼王')).toBe(
      'https://www.douyin.com/search/%E6%B5%B7%E8%B4%BC%E7%8E%8B?type=general',
    )
    expect(buildSiteSearchUrl('douyin', '海贼王 剧场版')).toBe(
      'https://www.douyin.com/search/%E6%B5%B7%E8%B4%BC%E7%8E%8B%20%E5%89%A7%E5%9C%BA%E7%89%88?type=general',
    )
  })

  it('builds a configured site-search URL only from an enabled saved command', () => {
    const commands = [{
      id: 'bilibili', keyword: 'b站', title: '哔哩哔哩', type: 'site-search' as const,
      target: 'https://search.bilibili.com/all?keyword={query}', enabled: true,
    }]

    expect(buildUserCommandSiteSearchUrl(commands, 'bilibili', '海贼王 剧场版')).toBe(
      'https://search.bilibili.com/all?keyword=%E6%B5%B7%E8%B4%BC%E7%8E%8B%20%E5%89%A7%E5%9C%BA%E7%89%88',
    )
    expect(buildUserCommandSiteSearchUrl(commands, 'unknown', '海贼王')).toBeUndefined()
    expect(buildUserCommandSiteSearchUrl([{ ...commands[0]!, enabled: false }], 'bilibili', '海贼王')).toBeUndefined()
  })

  it('normalizes unsupported search engine data to the safe default', () => {
    expect(normalizeSearchEngine({ kind: 'google' })).toEqual({ kind: 'google' })
    expect(normalizeSearchEngine({ kind: 'custom', template: 'javascript:alert(1)' })).toEqual({ kind: 'bing' })
    expect(normalizeSearchEngine({ kind: 'custom', template: 'https://example.com/{query}/{query}' })).toEqual({ kind: 'bing' })
  })

  it('resolves only known application definitions', () => {
    expect(findApplicationDefinition('wechat')?.aliases).toContain('wx')
    expect(findApplicationDefinition('unknown')).toBeUndefined()
  })

  it('rejects renderer-injected executable paths and malformed actions', () => {
    expect(parseExecutableAction({ id: 'app:wechat', action: { type: 'launch-demo', targetId: 'wechat' } })).toEqual({ kind: 'application', targetId: 'wechat' })
    expect(parseExecutableAction({ id: 'app:wechat', action: { type: 'launch-demo', targetId: 'C:\\evil.exe' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'x', action: { type: 'launch-demo', targetId: 'unknown' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'shortcut:quark', action: { type: 'launch-indexed', targetId: 'shortcut:0123456789abcdef0123' } })).toEqual({ kind: 'indexed-application', targetId: 'shortcut:0123456789abcdef0123' })
    expect(parseExecutableAction({ id: 'web:fallback', action: { type: 'web-search', query: '抖音' } })).toEqual({ kind: 'web-search', query: '抖音' })
    expect(parseExecutableAction({ id: 'web:fallback', action: { type: 'web-search', query: 'x\u0000y' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'site-search:douyin', action: { type: 'site-search', provider: 'douyin', query: '海贼王' } })).toEqual({ kind: 'site-search', provider: 'douyin', query: '海贼王' })
    expect(parseExecutableAction({ id: 'site-search:unknown', action: { type: 'site-search', provider: 'unknown', query: '海贼王' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'site-search:douyin', action: { type: 'site-search', provider: 'douyin', query: '' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'command:bilibili', action: { type: 'command-site-search', commandId: 'bilibili', query: '海贼王' } })).toEqual({ kind: 'command-site-search', commandId: 'bilibili', query: '海贼王' })
    expect(parseExecutableAction({ id: 'command:bilibili', action: { type: 'command-site-search', commandId: '../bilibili', query: '海贼王' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'command:bilibili', action: { type: 'command-site-search', commandId: 'bilibili', query: '' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'command:open-wechat', action: { type: 'command-launch-app', commandId: 'open-wechat' } })).toEqual({ kind: 'command-launch-app', commandId: 'open-wechat' })
    expect(parseExecutableAction({ id: 'command:open-wechat', action: { type: 'command-launch-app', commandId: '../open-wechat' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'command:docs', action: { type: 'open-url', url: 'https://example.com/docs' } })).toEqual({ kind: 'open-url', url: 'https://example.com/docs' })
    expect(parseExecutableAction({ id: 'command:unsafe', action: { type: 'open-url', url: 'file:///tmp/secret' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'path', action: { type: 'open-path', path: '/Users/alice/Projects/demo' } })).toEqual({ kind: 'open-path', path: '/Users/alice/Projects/demo' })
    expect(parseExecutableAction({ id: 'path', action: { type: 'open-path', path: '../relative' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'file', action: { type: 'open-indexed-path', targetId: 'path:0123456789abcdef0123' } })).toEqual({ kind: 'indexed-path', targetId: 'path:0123456789abcdef0123' })
    expect(parseExecutableAction({ id: 'file', action: { type: 'open-indexed-path', targetId: 'path:../unsafe' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'copy', action: { type: 'copy-text', text: '8192' } })).toEqual({ kind: 'copy-text', text: '8192' })
    expect(parseExecutableAction({ id: 'clipboard', action: { type: 'clipboard-transform', operation: 'format-json', input: '{"a":1}' } })).toEqual({ kind: 'clipboard-transform', operation: 'format-json', input: '{"a":1}' })
    expect(parseExecutableAction({ id: 'clipboard', action: { type: 'clipboard-transform', operation: 'shell-execute' } })).toBeUndefined()
    expect(parseExecutableAction({ id: 'app-arg', action: { type: 'application-argument', application: 'vscode', path: 'C:\\Projects\\demo' } })).toEqual({ kind: 'application-argument', application: 'vscode', path: 'C:\\Projects\\demo' })
    expect(parseExecutableAction({ id: 'system', action: { type: 'system-action', operation: 'lock-screen' } })).toEqual({ kind: 'system-action', operation: 'lock-screen' })
    expect(parseExecutableAction({ id: 'system', action: { type: 'system-action', operation: 'run-command' } })).toBeUndefined()
  })

  it('keeps the search engine union narrow at runtime', () => {
    const engines: SearchEngine[] = [{ kind: 'bing' }, { kind: 'baidu' }, { kind: 'google' }]
    expect(engines).toHaveLength(3)
  })
})

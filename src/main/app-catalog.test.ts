import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
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
  })

  it('keeps the search engine union narrow at runtime', () => {
    const engines: SearchEngine[] = [{ kind: 'bing' }, { kind: 'baidu' }, { kind: 'google' }]
    expect(engines).toHaveLength(3)
  })
})

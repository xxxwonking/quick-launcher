import { describe, expect, it } from 'vitest'
import { createGeneratedUrlRegistry } from './generated-url-registry'

describe('generated URL registry', () => {
  it('binds a generated URL to one window and allows one copy before expiry', () => {
    let now = 1_000
    const registry = createGeneratedUrlRegistry({ now: () => now, createToken: () => 'a'.repeat(32) })

    const token = registry.issue('https://www.bing.com/search?q=electron', 42)

    expect(token).toMatch(/^[a-f0-9]{32}$/u)
    expect(registry.consume(token, 42)).toEqual({ ok: true, url: 'https://www.bing.com/search?q=electron' })
    expect(registry.consume(token, 42)).toEqual({ ok: false, reason: 'invalid' })

    now += 1
    expect(registry.issue('https://example.com', 42)).toHaveLength(32)
  })

  it('rejects a token from another window and distinguishes expired tokens', () => {
    let now = 5_000
    const registry = createGeneratedUrlRegistry({ now: () => now, createToken: () => 'b'.repeat(32) })
    const token = registry.issue('https://example.com/search?q=secret', 7)

    expect(registry.consume(token, 8)).toEqual({ ok: false, reason: 'invalid' })
    now += 5 * 60 * 1000 + 1
    expect(registry.consume(token, 7)).toEqual({ ok: false, reason: 'expired' })
    expect(registry.consume(token, 7)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('removes all tokens owned by a destroyed window', () => {
    const registry = createGeneratedUrlRegistry({ createToken: (() => {
      let index = 0
      return () => `${String.fromCharCode(97 + index++)}`.repeat(32)
    })() })

    const token = registry.issue('https://example.com', 19)
    registry.issue('https://example.org', 20)
    registry.removeWindow(19)

    expect(registry.consume(token, 19)).toEqual({ ok: false, reason: 'invalid' })
    expect(registry.size()).toBe(1)
  })
})

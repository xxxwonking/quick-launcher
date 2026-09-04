import { describe, expect, it } from 'vitest'
import { normalizeSearchWindowHeight } from './search-window-size'

describe('search window sizing', () => {
  it('rounds and clamps renderer measurements to safe native bounds', () => {
    expect(normalizeSearchWindowHeight(138.2)).toBe(139)
    expect(normalizeSearchWindowHeight(40)).toBe(120)
    expect(normalizeSearchWindowHeight(900)).toBe(560)
  })

  it('rejects invalid renderer measurements', () => {
    expect(normalizeSearchWindowHeight(Number.NaN)).toBeUndefined()
    expect(normalizeSearchWindowHeight(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(normalizeSearchWindowHeight('240')).toBeUndefined()
  })
})

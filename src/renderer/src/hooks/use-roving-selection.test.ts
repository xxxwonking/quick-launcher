import { describe, expect, it } from 'vitest'
import { moveSelection } from './use-roving-selection'

describe('moveSelection', () => {
  it('wraps from the final item to the first item', () => {
    expect(moveSelection(2, 3, 'next')).toBe(0)
  })

  it('wraps from the first item to the final item', () => {
    expect(moveSelection(0, 3, 'previous')).toBe(2)
  })

  it('returns no selection for an empty list', () => {
    expect(moveSelection(0, 0, 'next')).toBe(-1)
  })
})

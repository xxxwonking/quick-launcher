import { describe, expect, it } from 'vitest'
import { buildInfo } from './build-info'

describe('buildInfo', () => {
  it('exposes the product name and package version', () => {
    expect(buildInfo).toEqual({
      productName: 'Quick Launcher',
      version: '0.1.0',
    })
  })
})

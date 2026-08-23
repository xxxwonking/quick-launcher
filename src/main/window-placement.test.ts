import { describe, expect, it } from 'vitest'
import { centerLauncherInWorkArea } from './window-placement'

describe('launcher window placement', () => {
  it('centers near the upper third of the active display and stays inside work area', () => {
    expect(centerLauncherInWorkArea({ x: 1920, y: 0, width: 1280, height: 720 }, { width: 760, height: 560 })).toEqual({ x: 2180, y: 48 })
    expect(centerLauncherInWorkArea({ x: -1280, y: -100, width: 900, height: 500 }, { width: 760, height: 560 })).toEqual({ x: -1210, y: -100 })
  })
})

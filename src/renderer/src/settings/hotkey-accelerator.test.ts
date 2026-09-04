import { describe, expect, it } from 'vitest'
import { eventToAccelerator } from './hotkey-accelerator'

const event = (value: Partial<KeyboardEvent>): Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'> => ({
  key: '',
  code: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...value,
})

describe('hotkey accelerator recorder', () => {
  it('uses Electron accelerator syntax for a macOS Option shortcut', () => {
    expect(eventToAccelerator(event({ key: ' ', code: 'Space', altKey: true }), 'MacIntel')).toBe('Alt+Space')
  })

  it('uses the physical key code when macOS Option changes the key value', () => {
    expect(eventToAccelerator(event({ key: 'å', code: 'KeyA', altKey: true }), 'MacIntel')).toBe('Alt+A')
  })

  it('maps the Windows logo key and navigation keys consistently', () => {
    expect(eventToAccelerator(event({ key: 'k', code: 'KeyK', metaKey: true }), 'Win32')).toBe('Super+K')
    expect(eventToAccelerator(event({ key: 'ArrowDown', code: 'ArrowDown', ctrlKey: true }), 'Win32')).toBe('Control+Down')
  })

  it('records punctuation and numpad keys using Electron accelerator names', () => {
    expect(eventToAccelerator(event({ key: ',', code: 'Comma', ctrlKey: true }), 'Win32')).toBe('Control+,')
    expect(eventToAccelerator(event({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }), 'Win32')).toBe('Control+Shift+=')
    expect(eventToAccelerator(event({ key: '+', code: 'NumpadAdd', altKey: true }), 'Win32')).toBe('Alt+Plus')
    expect(eventToAccelerator(event({ key: '1', code: 'Numpad1', altKey: true }), 'Win32')).toBe('Alt+num1')
  })

  it('supports function keys and ignores modifier-only or repeated events', () => {
    expect(eventToAccelerator(event({ key: 'F12', code: 'F12', shiftKey: true }), 'Win32')).toBe('Shift+F12')
    expect(eventToAccelerator(event({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), 'Win32')).toBeUndefined()
    expect(eventToAccelerator(event({ key: 'k', code: 'KeyK', ctrlKey: true, repeat: true }), 'Win32')).toBeUndefined()
  })

  it('does not record a bare key without a modifier', () => {
    expect(eventToAccelerator(event({ key: 'k', code: 'KeyK' }), 'Win32')).toBeUndefined()
  })
})

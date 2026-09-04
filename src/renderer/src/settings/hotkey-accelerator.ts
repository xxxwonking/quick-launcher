type HotkeyKeyboardEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'>

const KEY_CODE_ALIASES: Record<string, string> = {
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'Capslock',
  Comma: ',',
  Delete: 'Delete',
  End: 'End',
  Equal: '=',
  Escape: 'Escape',
  Home: 'Home',
  Insert: 'Insert',
  Minus: '-',
  NumLock: 'Numlock',
  NumpadAdd: 'Plus',
  NumpadDecimal: 'numdec',
  NumpadDivide: 'numdiv',
  NumpadEnter: 'Enter',
  NumpadMultiply: 'nummult',
  NumpadSubtract: 'numsub',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Period: '.',
  PrintScreen: 'PrintScreen',
  Return: 'Enter',
  ScrollLock: 'Scrolllock',
  Semicolon: ';',
  Space: 'Space',
  Slash: '/',
  Tab: 'Tab',
  Quote: "'",
}

for (let index = 0; index <= 9; index += 1) KEY_CODE_ALIASES[`Numpad${index}`] = `num${index}`

function normalizedKey(event: HotkeyKeyboardEvent): string | undefined {
  const letter = /^Key([A-Z])$/u.exec(event.code)?.[1]
  if (letter) return letter
  const digit = /^Digit([0-9])$/u.exec(event.code)?.[1]
  if (digit) return digit
  if (/^F([1-9]|1[0-9]|2[0-4])$/u.test(event.code)) return event.code
  if (KEY_CODE_ALIASES[event.code]) return KEY_CODE_ALIASES[event.code]
  if (event.key === ' ' || event.key === 'Spacebar') return 'Space'
  if (event.key.length === 1 && /^[A-Za-z0-9]$/u.test(event.key)) return event.key.toUpperCase()
  return undefined
}

export function eventToAccelerator(event: HotkeyKeyboardEvent, platform: string): string | undefined {
  if (event.repeat) return undefined
  if (/^(Alt|Control|Meta|Shift|OS|Win|Super)(Left|Right)?$/u.test(event.key) || /^(Alt|Control|Meta|Shift)(Left|Right)$/u.test(event.code)) return undefined

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push(/mac/i.test(platform) ? 'Command' : 'Super')
  if (parts.length === 0) return undefined

  const key = normalizedKey(event)
  return key ? [...parts, key].join('+') : undefined
}

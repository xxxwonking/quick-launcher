const MODIFIERS = new Set(['Alt', 'Command', 'CommandOrControl', 'Control', 'Shift', 'Super'])
const NAMED_KEYS = new Set([
  'Backspace', 'Delete', 'Down', 'End', 'Enter', 'Escape', 'Home', 'Insert',
  'Left', 'PageDown', 'PageUp', 'Return', 'Right', 'Space', 'Tab', 'Up',
  'Capslock', 'Numlock', 'Scrolllock', 'PrintScreen', 'Plus',
])
const PUNCTUATION_KEYS = new Set(['!', '"', '#', '$', '%', '&', "'", '(', ')', '*', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '[', '\\', ']', '^', '`', '_', '{', '|', '}', '~'])
const NUMPAD_KEYS = new Set(['num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9', 'numdec', 'numadd', 'numsub', 'nummult', 'numdiv'])

export function isValidLauncherHotkey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 64) return false
  const parts = value.split('+')
  if (parts.length < 2) return false
  const modifiers = parts.slice(0, -1)
  const key = parts.at(-1)
  if (!key || modifiers.some((modifier) => !MODIFIERS.has(modifier)) || new Set(modifiers).size !== modifiers.length) return false
  return /^[A-Z0-9]$/u.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/u.test(key) || NAMED_KEYS.has(key) || PUNCTUATION_KEYS.has(key) || NUMPAD_KEYS.has(key)
}

export type HotkeyRegistration = {
  accelerator: string | null
  conflict: boolean
}

type Register = (accelerator: string) => boolean

export function registerLauncherHotkey(preferred: string, register: Register, onRegistered: (accelerator: string) => void): HotkeyRegistration {
  if (preferred.length === 0 || !register(preferred)) return { accelerator: null, conflict: true }
  onRegistered(preferred)
  return { accelerator: preferred, conflict: false }
}

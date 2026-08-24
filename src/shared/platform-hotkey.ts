export type PlatformHotkey = {
  accelerator: 'Alt+Space'
  label: 'Alt + Space' | 'Option + Space'
}

export function launcherHotkeyForPlatform(platform: string): PlatformHotkey {
  return platform === 'darwin'
    ? { accelerator: 'Alt+Space', label: 'Option + Space' }
    : { accelerator: 'Alt+Space', label: 'Alt + Space' }
}

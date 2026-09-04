import type {
  ApplicationArgumentTarget,
  ClipboardTransformOperation,
  SystemActionOperation,
} from '../shared/launcher-item'

export type ProductivityExecutionPlan =
  | { kind: 'spawn'; file: string; args: string[] }
  | { kind: 'external'; url: string }

export function transformClipboardText(operation: ClipboardTransformOperation, input: string): string {
  if (operation === 'format-json') return JSON.stringify(JSON.parse(input) as unknown, null, 2)
  if (operation === 'url-encode') return encodeURIComponent(input)
  if (operation === 'url-decode') return decodeURIComponent(input)
  if (operation === 'base64-encode') return Buffer.from(input, 'utf8').toString('base64')
  if (operation === 'base64-decode') {
    const normalized = input.replace(/\s+/gu, '')
    if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized) || normalized.length % 4 === 1) throw new Error('INVALID_BASE64')
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
    const decoded = Buffer.from(padded, 'base64')
    const canonical = decoded.toString('base64').replace(/=+$/u, '')
    if (canonical !== normalized.replace(/=+$/u, '')) throw new Error('INVALID_BASE64')
    return decoded.toString('utf8')
  }
  if (operation === 'uppercase') return input.toLocaleUpperCase()
  return input.toLocaleLowerCase()
}

export function systemActionPlan(platform: string, operation: SystemActionOperation): ProductivityExecutionPlan | undefined {
  if (platform === 'darwin') {
    if (operation === 'lock-screen') return { kind: 'spawn', file: '/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession', args: ['-suspend'] }
    if (operation === 'sleep') return { kind: 'spawn', file: '/usr/bin/osascript', args: ['-e', 'tell application "System Events" to sleep'] }
    if (operation === 'screenshot') return { kind: 'spawn', file: '/usr/sbin/screencapture', args: ['-i'] }
    return { kind: 'external', url: 'x-apple.systempreferences:' }
  }
  if (platform === 'win32') {
    if (operation === 'lock-screen') return { kind: 'spawn', file: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] }
    if (operation === 'sleep') return { kind: 'spawn', file: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] }
    if (operation === 'screenshot') return { kind: 'external', url: 'ms-screenclip:' }
    return { kind: 'external', url: 'ms-settings:' }
  }
  return undefined
}

export function applicationArgumentPlan(
  platform: string,
  application: ApplicationArgumentTarget,
  path: string,
): ProductivityExecutionPlan | undefined {
  if (platform === 'darwin') {
    return {
      kind: 'spawn',
      file: '/usr/bin/open',
      args: ['-a', application === 'vscode' ? 'Visual Studio Code' : 'Terminal', path],
    }
  }
  if (platform === 'win32') {
    if (application === 'vscode') {
      const normalizedPath = path.replace(/\\/gu, '/')
      const encodedPath = normalizedPath.split('/').map((segment, index) => (
        index === 0 && /^[A-Za-z]:$/u.test(segment) ? segment : encodeURIComponent(segment)
      )).join('/')
      return { kind: 'external', url: `vscode://file/${encodedPath}` }
    }
    return { kind: 'spawn', file: 'wt.exe', args: ['-d', path] }
  }
  return undefined
}

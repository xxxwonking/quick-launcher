import { basename, extname } from 'node:path'
import type { UserApplicationBinding } from '../shared/launcher-command'

export type ApplicationBinding = UserApplicationBinding

export type BindingStat = {
  isFile: () => boolean
  isDirectory: () => boolean
}

export type BindingStatReader = (path: string) => Promise<BindingStat>
export type BindingAccessReader = (path: string) => Promise<void>

export async function findInvalidApplicationBindings(
  bindings: Readonly<Record<string, ApplicationBinding>>,
  platform: string,
  readStat: BindingStatReader,
  accessPath: BindingAccessReader,
): Promise<ReadonlySet<string>> {
  const expectedPlatform = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : undefined
  const invalid = await Promise.all(Object.entries(bindings).map(async ([appRef, binding]) => {
    if (!expectedPlatform || binding.platform !== expectedPlatform) return appRef
    try {
      const target = await readStat(binding.path)
      const validShape = binding.platform === 'windows' ? target.isFile() : target.isDirectory()
      if (!validShape) return appRef
      await accessPath(binding.path)
      return undefined
    } catch {
      return appRef
    }
  }))
  return new Set(invalid.filter((appRef): appRef is string => appRef !== undefined))
}

function hasUnsafePathCharacters(value: string): boolean {
  return value.includes('\0') || Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/u.test(value)
}

function isMacApplicationBundlePath(value: string): boolean {
  return value.startsWith('/') && extname(value).toLocaleLowerCase() === '.app'
}

export async function validateApplicationBinding(
  platform: string,
  selectedPath: string,
  readStat: BindingStat,
  accessPath: BindingAccessReader,
): Promise<ApplicationBinding> {
  const path = selectedPath.trim()
  if (path.length === 0 || path.length > 4096 || hasUnsafePathCharacters(path)) throw new Error('BINDING_INVALID')

  if (platform === 'win32') {
    if (!isWindowsAbsolutePath(path)) throw new Error('BINDING_INVALID')
    const extension = extname(path).toLocaleLowerCase()
    if (extension !== '.exe' && extension !== '.lnk') throw new Error('BINDING_UNSUPPORTED')
    if (!readStat.isFile()) throw new Error('BINDING_NOT_FILE')
    try {
      await accessPath(path)
    } catch {
      throw new Error('BINDING_UNREADABLE')
    }
    return {
      platform: 'windows',
      kind: extension === '.lnk' ? 'windows-shortcut' : 'windows-executable',
      path,
    }
  }

  if (platform === 'darwin') {
    if (!isMacApplicationBundlePath(path)) throw new Error('BINDING_UNSUPPORTED')
    if (!readStat.isDirectory()) throw new Error('BINDING_NOT_BUNDLE')
    try {
      await accessPath(path)
    } catch {
      throw new Error('BINDING_UNREADABLE')
    }
    return { platform: 'macos', kind: 'macos-bundle', path }
  }

  throw new Error('BINDING_UNSUPPORTED')
}

export function bindingDisplayName(binding: ApplicationBinding): string {
  const name = basename(binding.path)
  return binding.kind === 'windows-executable' ? name.replace(/\.exe$/iu, '') : name.replace(/\.app$/iu, '')
}

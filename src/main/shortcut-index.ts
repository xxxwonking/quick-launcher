import { homedir } from 'node:os'
import { join, parse } from 'node:path'
import { readdir } from 'node:fs/promises'

export type ShortcutEntry = {
  displayName: string
  path: string
  metadata?: ShortcutMetadata
}

export type ShortcutMetadata = {
  platform: 'windows' | 'macos'
  executableName?: string
  bundleId?: string
  publisher?: string
  appUserModelId?: string
}

export type ShortcutIndex = {
  find: (aliases: readonly string[]) => ShortcutEntry | undefined
  entries: readonly ShortcutEntry[]
}

const MAX_ENTRIES = 2_000
const MAX_DEPTH = 5

export function normalizeShortcutName(value: string): string {
  return shortcutDisplayName(value).toLocaleLowerCase()
}

export function shortcutDisplayName(value: string): string {
  return value
    .replace(/\.(lnk|url)$/iu, '')
    .replace(/\s+-\s+快捷方式$/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function shortcutExecutableName(value: string): string | undefined {
  const name = value.trim().split(/[\\/]/u).at(-1)?.trim()
  return name || undefined
}

export function matchShortcutName(fileName: string, aliases: readonly string[]): boolean {
  const normalized = normalizeShortcutName(fileName)
  return aliases.some((alias) => {
    const candidate = normalizeShortcutName(alias)
    return candidate.length > 0 && (normalized === candidate || normalized.startsWith(`${candidate} `))
  })
}

export function createShortcutIndex(entries: readonly ShortcutEntry[]): ShortcutIndex {
  const sorted = [...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  return {
    entries: sorted,
    find: (aliases) => sorted.find((entry) => matchShortcutName(entry.displayName, aliases)),
  }
}

async function walkDirectory(root: string, depth: number, output: ShortcutEntry[], recursive: boolean): Promise<void> {
  if (depth > MAX_DEPTH || output.length >= MAX_ENTRIES) return
  let children
  try {
    children = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const child of children) {
    if (output.length >= MAX_ENTRIES) return
    const childPath = join(root, child.name)
    if (child.isDirectory() && recursive) {
      await walkDirectory(childPath, depth + 1, output, true)
      continue
    }
    if (!child.isFile() || !/\.(lnk|url)$/iu.test(parse(child.name).ext)) continue
    output.push({ displayName: child.name, path: childPath })
  }
}

export async function scanShortcutDirectories(roots: readonly string[] = defaultShortcutRoots()): Promise<ShortcutIndex> {
  const entries: ShortcutEntry[] = []
  for (const [index, root] of roots.entries()) await walkDirectory(root, 0, entries, index !== 0)
  return createShortcutIndex(entries)
}

export function defaultShortcutRoots(desktopPath = join(homedir(), 'Desktop')): string[] {
  const roots = [
    desktopPath,
    process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    process.env.ProgramData ? join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
  ]
  return roots.filter((root, index) => root.length > 0 && roots.indexOf(root) === index)
}

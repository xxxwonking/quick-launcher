import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { LauncherCatalogPayload, LauncherItem } from '../shared/launcher-item'

export type FileIndexEntry = {
  path: string
  displayName: string
  parentName: string
  isDirectory: boolean
}

export type FileIndexOptions = {
  maxDepth?: number
  maxEntries?: number
}

export type FileLauncherCatalog = {
  payload: LauncherCatalogPayload
  targets: ReadonlyMap<string, string>
}

export type FileIndexChange = {
  root: string
  event: 'rename' | 'change'
  fileName: string | Buffer | null
}

export type IncrementalFileIndex = {
  setEntries: (entries: readonly FileIndexEntry[]) => void
  entries: () => FileIndexEntry[]
  applyChange: (change: FileIndexChange) => Promise<'changed' | 'unchanged' | 'fallback'>
}

const DEFAULT_MAX_DEPTH = 4
const DEFAULT_MAX_ENTRIES = 3_000
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'build',
  'dist',
  'target',
  'library',
  'appdata',
])

export function defaultFileSearchRoots(home = homedir()): string[] {
  return ['Desktop', 'Documents', 'Downloads'].map((directory) => join(home, directory))
}

export function effectiveFileSearchRoots(roots?: readonly string[], home = homedir()): string[] {
  return roots && roots.length > 0 ? [...roots] : defaultFileSearchRoots(home)
}

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(name.toLocaleLowerCase())
}

export async function scanFileIndex(
  roots: readonly string[] = defaultFileSearchRoots(),
  options: FileIndexOptions = {},
): Promise<FileIndexEntry[]> {
  const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? DEFAULT_MAX_DEPTH))
  const maxEntries = Math.max(0, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES))
  if (maxEntries === 0) return []

  const entries: FileIndexEntry[] = []
  const seenPaths = new Set<string>()

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > maxDepth || entries.length >= maxEntries) return
    let children
    try {
      children = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    children.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const child of children) {
      if (entries.length >= maxEntries || child.name.startsWith('.')) continue
      const childPath = join(directory, child.name)
      const normalizedPath = childPath.toLocaleLowerCase()
      if (seenPaths.has(normalizedPath)) continue
      if (!child.isFile() && !child.isDirectory()) continue
      if (child.isDirectory() && shouldSkipDirectory(child.name)) continue

      seenPaths.add(normalizedPath)
      entries.push({
        path: childPath,
        displayName: child.name,
        parentName: basename(directory) || directory,
        isDirectory: child.isDirectory(),
      })
      if (child.isDirectory()) await visit(childPath, depth + 1)
    }
  }

  for (const root of roots) {
    if (entries.length >= maxEntries) break
    await visit(root, 1)
  }

  return entries
}

function pathKey(path: string): string {
  return path.toLocaleLowerCase()
}

function isWithinRoot(root: string, path: string): boolean {
  const relativePath = relative(resolve(root), resolve(path))
  return Boolean(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
}

function entryForPath(path: string, isDirectory: boolean): FileIndexEntry {
  return {
    path,
    displayName: basename(path),
    parentName: basename(dirname(path)) || dirname(path),
    isDirectory,
  }
}

function relativeDepth(root: string, path: string): number | undefined {
  if (!isWithinRoot(root, path)) return undefined
  return relative(resolve(root), resolve(path)).split(sep).filter(Boolean).length
}

function canIndexPath(root: string, path: string, isDirectory: boolean): boolean {
  const relativePath = relative(resolve(root), resolve(path))
  const segments = relativePath.split(sep).filter(Boolean)
  if (segments.length === 0 || segments.some((segment) => segment.startsWith('.'))) return false
  if (segments.slice(0, -1).some((segment) => shouldSkipDirectory(segment))) return false
  return !isDirectory || !shouldSkipDirectory(segments.at(-1) ?? '')
}

function removeAffectedEntries(entries: Map<string, FileIndexEntry>, path: string): boolean {
  const affectedKey = pathKey(path)
  let removed = false
  for (const [key, entry] of entries) {
    const entryKey = pathKey(entry.path)
    if (entryKey === affectedKey || entryKey.startsWith(`${affectedKey}${sep}`)) {
      entries.delete(key)
      removed = true
    }
  }
  return removed
}

export function createIncrementalFileIndex(
  roots: readonly string[],
  options: FileIndexOptions = {},
): IncrementalFileIndex {
  const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? DEFAULT_MAX_DEPTH))
  const maxEntries = Math.max(0, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES))
  const rootKeys = new Set(roots.map((root) => pathKey(resolve(root))))
  const indexedEntries = new Map<string, FileIndexEntry>()

  const setEntries = (entries: readonly FileIndexEntry[]): void => {
    indexedEntries.clear()
    for (const entry of entries) {
      if (indexedEntries.size >= maxEntries) break
      indexedEntries.set(pathKey(entry.path), entry)
    }
  }

  const entries = (): FileIndexEntry[] => (
    [...indexedEntries.values()].sort((left, right) => left.path.localeCompare(right.path, 'en'))
  )

  const applyChange = async (change: FileIndexChange): Promise<'changed' | 'unchanged' | 'fallback'> => {
    const root = resolve(change.root)
    if (!rootKeys.has(pathKey(root))) return 'fallback'
    const rawFileName = Buffer.isBuffer(change.fileName) ? change.fileName.toString('utf8') : change.fileName
    if (!rawFileName) return 'fallback'
    const changedPath = resolve(isAbsolute(rawFileName) ? rawFileName : join(root, rawFileName))
    if (!isWithinRoot(root, changedPath)) return 'fallback'

    let fileStat
    try {
      fileStat = await stat(changedPath)
    } catch {
      return removeAffectedEntries(indexedEntries, changedPath) ? 'changed' : 'unchanged'
    }

    const isDirectory = fileStat.isDirectory()
    if (!fileStat.isFile() && !isDirectory) {
      return removeAffectedEntries(indexedEntries, changedPath) ? 'changed' : 'unchanged'
    }

    const depth = relativeDepth(root, changedPath)
    if (depth === undefined || depth > maxDepth || !canIndexPath(root, changedPath, isDirectory)) {
      return removeAffectedEntries(indexedEntries, changedPath) ? 'changed' : 'unchanged'
    }

    const existing = indexedEntries.get(pathKey(changedPath))
    if (change.event === 'change' && existing && existing.isDirectory === isDirectory) return 'unchanged'

    removeAffectedEntries(indexedEntries, changedPath)
    if (indexedEntries.size >= maxEntries) return 'changed'
    indexedEntries.set(pathKey(changedPath), entryForPath(changedPath, isDirectory))

    if (isDirectory) {
      const remainingDepth = maxDepth - depth
      const remainingEntries = maxEntries - indexedEntries.size
      if (remainingDepth > 0 && remainingEntries > 0) {
        const descendants = await scanFileIndex([changedPath], {
          maxDepth: remainingDepth,
          maxEntries: remainingEntries,
        })
        for (const descendant of descendants) {
          if (indexedEntries.size >= maxEntries) break
          indexedEntries.set(pathKey(descendant.path), descendant)
        }
      }
    }
    return 'changed'
  }

  return { setEntries, entries, applyChange }
}

function opaqueFileTargetId(path: string): string {
  const digest = createHash('sha256').update(path.toLocaleLowerCase()).digest('hex').slice(0, 20)
  return `path:${digest}`
}

function fileAliases(displayName: string, parentName: string): string[] {
  const normalizedName = displayName.toLocaleLowerCase()
  const extension = extname(displayName)
  const stem = extension ? displayName.slice(0, -extension.length).toLocaleLowerCase() : normalizedName
  return [normalizedName, stem, parentName.toLocaleLowerCase()]
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
}

export function buildFileLauncherCatalog(entries: readonly FileIndexEntry[], snapshotVersion: number): FileLauncherCatalog {
  const targets = new Map<string, string>()
  const items: LauncherItem[] = []

  for (const entry of entries) {
    const targetId = opaqueFileTargetId(entry.path)
    if (targets.has(targetId)) continue
    targets.set(targetId, entry.path)
    items.push({
      id: targetId,
      title: entry.displayName,
      subtitle: `文件 · ${entry.parentName}`,
      aliases: fileAliases(entry.displayName, entry.parentName),
      icon: entry.isDirectory ? 'folder' : 'file',
      kind: 'file',
      action: { type: 'open-indexed-path', targetId },
    })
  }

  return { payload: { snapshotVersion, items }, targets }
}

export const isFileLauncherItem = (item: LauncherItem): boolean => item.action.type === 'open-indexed-path'

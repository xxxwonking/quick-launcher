import * as childProcess from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { createShortcutIndex, type ShortcutEntry, type ShortcutIndex } from './shortcut-index'

const MAX_ENTRIES = 2_000
const MAX_DEPTH = 5

type MacApplicationFinder = () => Promise<readonly string[]>
export type MacBundleIdReader = (path: string) => Promise<string | undefined>

function isApplicationBundlePath(value: string): boolean {
  return isAbsolute(value) && value.toLocaleLowerCase().endsWith('.app')
}

export function isDiscoverableMacApplicationPath(path: string, roots: readonly string[]): boolean {
  if (!isApplicationBundlePath(path)) return false

  const resolvedPath = resolve(path)
  return roots.some((root) => {
    const relativePath = relative(resolve(root), resolvedPath)
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return false
    }

    const segments = relativePath.split(sep)
    return segments.slice(0, -1).every((segment) => !segment.toLocaleLowerCase().endsWith('.app'))
  })
}

export function parseMacBundleId(value: unknown): string | undefined {
  const candidate = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).CFBundleIdentifier
      : undefined
  if (typeof candidate !== 'string') return undefined
  const bundleId = candidate.trim()
  if (!bundleId || bundleId === '(null)' || bundleId.length > 256) return undefined
  if (Array.from(bundleId).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })) return undefined
  return bundleId
}

async function readMacBundleIdFromInfoPlist(path: string): Promise<string | undefined> {
  try {
    const result = await promisify(childProcess.execFile)('/usr/bin/plutil', [
      '-convert', 'json', '-o', '-', join(path, 'Info.plist'),
    ], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 1_000,
    })
    const parsed = JSON.parse(String(result.stdout)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parseMacBundleId((parsed as Record<string, unknown>).CFBundleIdentifier)
  } catch {
    return undefined
  }
}

export async function readMacBundleId(path: string): Promise<string | undefined> {
  if (process.platform !== 'darwin' || typeof childProcess.execFile !== 'function') return undefined
  try {
    const result = await promisify(childProcess.execFile)('mdls', ['-raw', '-name', 'kMDItemCFBundleIdentifier', path], {
      encoding: 'utf8',
      timeout: 1_000,
    })
    const bundleId = parseMacBundleId(String(result.stdout))
    if (bundleId) return bundleId
  } catch {
    // Wrapper apps are often not indexed by Spotlight, so mdls may fail.
  }
  return readMacBundleIdFromInfoPlist(path)
}

async function applicationEntry(path: string, readBundleId: MacBundleIdReader): Promise<ShortcutEntry> {
  const bundleId = await readBundleId(path)
  return {
    displayName: parse(path).name,
    path,
    metadata: { platform: 'macos', ...(bundleId ? { bundleId } : {}) },
  }
}

async function findApplicationsWithMdfindQuery(query: string): Promise<readonly string[]> {
  if (typeof childProcess.execFile !== 'function') return []

  try {
    const result = await promisify(childProcess.execFile)('mdfind', [query], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 2_000,
    })
    return String(result.stdout).split(/\r?\n/u).map((value) => value.trim()).filter(isApplicationBundlePath)
  } catch {
    return []
  }
}

async function findApplicationsWithMdfind(): Promise<readonly string[]> {
  return findApplicationsWithMdfindQuery('kMDItemContentType == "com.apple.application-bundle"')
}

export type MacBundleQuery = (query: string) => Promise<readonly string[]>

export async function findMacApplicationsByBundleIds(
  bundleIds: readonly string[],
  queryApplications: MacBundleQuery = findApplicationsWithMdfindQuery,
): Promise<ReadonlyMap<string, string>> {
  const matches = new Map<string, string>()
  await Promise.all([...new Set(bundleIds)].map(async (bundleId) => {
    const escapedBundleId = bundleId.replace(/[\\"]/gu, '\\$&')
    const paths = await queryApplications(`kMDItemCFBundleIdentifier == "${escapedBundleId}"`)
    for (const path of paths) if (isApplicationBundlePath(path)) matches.set(path, bundleId)
  }))
  return matches
}

async function walkApplicationDirectory(root: string, depth: number, entries: Map<string, string>): Promise<void> {
  if (depth > MAX_DEPTH || entries.size >= MAX_ENTRIES) return

  let children
  try {
    children = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const child of [...children].sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entries.size >= MAX_ENTRIES) return
    const childPath = join(root, child.name)
    if (!child.isDirectory()) continue
    if (child.name.endsWith('.app')) {
      entries.set(childPath, childPath)
      continue
    }
    await walkApplicationDirectory(childPath, depth + 1, entries)
  }
}

export function defaultMacApplicationRoots(homePath = homedir()): string[] {
  const roots = ['/Applications', join(homePath, 'Applications'), '/System/Applications']
  return roots.filter((root, index) => roots.indexOf(root) === index)
}

export async function scanMacApplicationDirectories(
  roots: readonly string[] = defaultMacApplicationRoots(),
  findApplications: MacApplicationFinder = findApplicationsWithMdfind,
  readBundleId: MacBundleIdReader = async () => undefined,
): Promise<ShortcutIndex> {
  const paths = new Map<string, string>()
  for (const root of roots) await walkApplicationDirectory(root, 0, paths)
  for (const path of await findApplications()) {
    if (isDiscoverableMacApplicationPath(path, roots)) paths.set(path, path)
  }

  const entries: ShortcutEntry[] = []
  const pathList = [...paths.values()]
  let nextIndex = 0
  const resolveNext = async (): Promise<void> => {
    while (nextIndex < pathList.length) {
      const index = nextIndex
      nextIndex += 1
      const path = pathList[index]
      if (path) entries[index] = await applicationEntry(path, readBundleId)
    }
  }
  const workerCount = Math.min(pathList.length, 8)
  await Promise.all(Array.from({ length: workerCount }, () => resolveNext()))
  return createShortcutIndex(entries)
}

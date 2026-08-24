import * as childProcess from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse } from 'node:path'
import { promisify } from 'node:util'
import { createShortcutIndex, type ShortcutIndex } from './shortcut-index'

const MAX_ENTRIES = 2_000
const MAX_DEPTH = 5

type MacApplicationFinder = () => Promise<readonly string[]>

function isApplicationBundlePath(value: string): boolean {
  return value.startsWith('/') && value.endsWith('.app')
}

function applicationEntry(path: string): { displayName: string; path: string } {
  return { displayName: parse(path).name, path }
}

async function findApplicationsWithMdfind(): Promise<readonly string[]> {
  if (typeof childProcess.execFile !== 'function') return []

  try {
    const result = await promisify(childProcess.execFile)('mdfind', ['kMDItemContentType == "com.apple.application-bundle"'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 2_000,
    })
    return String(result.stdout).split(/\r?\n/u).map((value) => value.trim()).filter(isApplicationBundlePath)
  } catch {
    return []
  }
}

async function walkApplicationDirectory(root: string, depth: number, entries: Map<string, { displayName: string; path: string }>): Promise<void> {
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
      entries.set(childPath, applicationEntry(childPath))
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
): Promise<ShortcutIndex> {
  const entries = new Map<string, { displayName: string; path: string }>()
  for (const root of roots) await walkApplicationDirectory(root, 0, entries)
  for (const path of await findApplications()) {
    if (isApplicationBundlePath(path)) entries.set(path, applicationEntry(path))
  }
  return createShortcutIndex([...entries.values()])
}

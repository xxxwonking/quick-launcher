import * as childProcess from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

type DirectoryEntry = {
  name: string
  isDirectory: () => boolean
}

const MAX_ICON_CANDIDATES = 32
const MAX_INFO_PLIST_BYTES = 2 * 1024 * 1024
const IMAGE_FILE_PATTERN = /\.(?:icns|png|jpe?g|tiff?)$/iu
const ICON_PLIST_KEYS = new Set(['CFBundleIconFile', 'CFBundleIconFiles', 'CFBundleIconName', 'CFBundleTypeIconFiles'])

export type MacIconNameReader = (applicationPath: string) => Promise<readonly string[]>

function iconPriority(name: string): number {
  if (/^AppIcon\.icns$/iu.test(name)) return 0
  if (/^AppIcon.*\.icns$/iu.test(name)) return 1
  if (/^AppIcon.*\.png$/iu.test(name)) return 2
  if (/^icon.*\.icns$/iu.test(name)) return 3
  if (/\.icns$/iu.test(name)) return 4
  return 5
}

async function readDirectory(directory: string): Promise<DirectoryEntry[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

async function iconsInDirectory(directory: string): Promise<string[]> {
  const entries = await readDirectory(directory)
  return entries
    .filter((entry) => !entry.isDirectory() && (/\.icns$/iu.test(entry.name) || /^(?:AppIcon|icon).*\.png$/iu.test(entry.name)))
    .sort((left, right) => iconPriority(left.name) - iconPriority(right.name) || left.name.localeCompare(right.name, 'en'))
    .map((entry) => join(directory, entry.name))
}

function decodeXmlText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/gu, (_match, entity: string) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  })[entity] ?? value)
}

export function parseMacIconNamesFromXml(xml: string): string[] {
  const names: string[] = []
  const keyPattern = /<key>(CFBundleIconFile|CFBundleIconFiles|CFBundleIconName|CFBundleTypeIconFiles)<\/key>\s*(?:<string>([\s\S]*?)<\/string>|<array>([\s\S]*?)<\/array>)/giu
  for (const match of xml.matchAll(keyPattern)) {
    if (match[2]) names.push(decodeXmlText(match[2]).trim())
    if (match[3]) {
      for (const stringMatch of match[3].matchAll(/<string>([\s\S]*?)<\/string>/giu)) {
        if (stringMatch[1]) names.push(decodeXmlText(stringMatch[1]).trim())
      }
    }
  }
  return [...new Set(names.filter(Boolean))]
}

function iconNamesFromPlist(value: unknown, names: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) iconNamesFromPlist(entry, names)
    return names
  }
  if (!value || typeof value !== 'object') return names
  for (const [key, entry] of Object.entries(value)) {
    if (ICON_PLIST_KEYS.has(key)) {
      if (typeof entry === 'string' && entry.trim()) names.push(entry.trim())
      if (Array.isArray(entry)) {
        for (const item of entry) if (typeof item === 'string' && item.trim()) names.push(item.trim())
      }
    }
    if (entry && typeof entry === 'object') iconNamesFromPlist(entry, names)
  }
  return [...new Set(names)]
}

async function readDeclaredMacIconNames(applicationPath: string): Promise<readonly string[]> {
  const infoPlistPath = join(applicationPath, 'Contents', 'Info.plist')
  let contents: Buffer
  try {
    contents = await readFile(infoPlistPath)
  } catch {
    return []
  }
  if (contents.length === 0 || contents.length > MAX_INFO_PLIST_BYTES) return []

  const xml = contents.toString('utf8')
  if (xml.includes('<plist')) return parseMacIconNamesFromXml(xml)
  if (process.platform !== 'darwin' || typeof childProcess.execFile !== 'function') return []
  try {
    const result = await promisify(childProcess.execFile)('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPlistPath], {
      encoding: 'utf8',
      maxBuffer: MAX_INFO_PLIST_BYTES,
      timeout: 1_000,
    })
    return iconNamesFromPlist(JSON.parse(String(result.stdout)) as unknown)
  } catch {
    return []
  }
}

function declaredIconMatchRank(fileName: string, declaredName: string): number | undefined {
  const fileStem = basename(fileName).replace(IMAGE_FILE_PATTERN, '').toLocaleLowerCase()
  const declaredStem = basename(declaredName).replace(IMAGE_FILE_PATTERN, '').trim().toLocaleLowerCase()
  if (!fileStem || !declaredStem) return undefined
  if (fileStem === declaredStem) return 0
  const suffix = fileStem.slice(declaredStem.length)
  return suffix && /^(?:@|~|\d)/u.test(suffix) ? 1 : undefined
}

async function declaredIconsInDirectory(directory: string, names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return []
  const entries = await readDirectory(directory)
  return entries
    .filter((entry) => !entry.isDirectory() && IMAGE_FILE_PATTERN.test(entry.name))
    .map((entry) => ({
      entry,
      rank: Math.min(...names.map((name) => declaredIconMatchRank(entry.name, name)).filter((value): value is number => value !== undefined)),
    }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || iconPriority(left.entry.name) - iconPriority(right.entry.name) || left.entry.name.localeCompare(right.entry.name, 'en'))
    .map(({ entry }) => join(directory, entry.name))
}

export async function findApplicationIconPaths(
  applicationPath: string,
  depth = 0,
  readIconNames: MacIconNameReader = readDeclaredMacIconNames,
): Promise<string[]> {
  if (depth > 2) return []

  const candidates: string[] = []
  const seen = new Set<string>()
  const addCandidates = (paths: readonly string[]): void => {
    for (const path of paths) {
      if (candidates.length >= MAX_ICON_CANDIDATES || seen.has(path)) continue
      seen.add(path)
      candidates.push(path)
    }
  }

  const declaredNames = await readIconNames(applicationPath)
  // Resources is the usual location for macOS and Mac Catalyst bundle icons.
  for (const directory of [join(applicationPath, 'Contents', 'Resources'), join(applicationPath, 'Contents'), applicationPath]) {
    addCandidates(await declaredIconsInDirectory(directory, declaredNames))
    addCandidates(await iconsInDirectory(directory))
    if (candidates.length >= MAX_ICON_CANDIDATES) return candidates
  }

  const entries = await readDirectory(applicationPath)
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (!entry.isDirectory() || (entry.name !== 'Wrapper' && !entry.name.endsWith('.app'))) continue
    addCandidates(await findApplicationIconPaths(join(applicationPath, entry.name), depth + 1, readIconNames))
    if (candidates.length >= MAX_ICON_CANDIDATES) return candidates
  }

  return candidates
}

export async function findApplicationIconPath(
  applicationPath: string,
  depth = 0,
  readIconNames: MacIconNameReader = readDeclaredMacIconNames,
): Promise<string | undefined> {
  return (await findApplicationIconPaths(applicationPath, depth, readIconNames))[0]
}

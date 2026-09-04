import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { defaultShortcutRoots, scanShortcutDirectories, createShortcutIndex, type ShortcutEntry, type ShortcutIndex } from './shortcut-index'
import { join, parse, win32 } from 'node:path'

export type WindowsApplicationDiscovery = {
  scanShortcuts?: (roots: readonly string[]) => Promise<ShortcutIndex>
  discoverAppPaths?: () => Promise<readonly ShortcutEntry[]>
  discoverStoreApps?: () => Promise<readonly ShortcutEntry[]>
  discoverStandaloneExecutables?: () => Promise<readonly ShortcutEntry[]>
}

export type WindowsCommandRunner = (file: string, args: readonly string[]) => Promise<string>

const defaultWindowsCommandRunner: WindowsCommandRunner = (file, args) => new Promise((resolve, reject) => {
  execFile(file, [...args], { encoding: 'utf8', timeout: 2_500, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
    if (error) reject(error)
    else resolve(String(stdout))
  })
})

const APP_PATHS_KEY_PATTERN = /\\App Paths\\([^\\]+\.exe)$/iu
const APP_PATHS_VALUE_PATTERN = /^\s+\((?:Default|默认)\)\s+REG_[A-Z_]+\s+(.+)$/iu
const WINDOWS_EXECUTABLE_PATH_PATTERN = /^(?:[A-Z]:[\\/]|\\\\).+\.exe$/iu
const APP_USER_MODEL_ID_PATTERN = /^[A-Za-z0-9._-]+![A-Za-z0-9._-]+$/u
const MAX_STANDALONE_ENTRIES = 2_000
const MAX_STANDALONE_DEPTH = 5
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'build', 'dist', 'out', 'cache', 'caches', 'temp', 'tmp'])

export function parseWindowsPublisherOutput(output: string): string | undefined {
  const publisher = output.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0)
  if (!publisher || publisher === '(null)' || publisher.length > 128) return undefined
  if (Array.from(publisher).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })) return undefined
  return publisher
}

export async function readWindowsExecutablePublisher(
  path: string,
  runCommand: WindowsCommandRunner = defaultWindowsCommandRunner,
  platform = process.platform,
): Promise<string | undefined> {
  if (platform !== 'win32' || !WINDOWS_EXECUTABLE_PATH_PATTERN.test(path)) return undefined
  if (Array.from(path).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
  })) return undefined
  const powershellPath = path.replace(/'/gu, "''")
  const command = "$ErrorActionPreference = 'Stop'; $item = Get-Item -LiteralPath '" + powershellPath + "'; [string]$item.VersionInfo.CompanyName"
  try {
    return parseWindowsPublisherOutput(await runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      command,
    ]))
  } catch {
    return undefined
  }
}

export function isWindowsShellAppPath(value: string): boolean {
  const match = /^shell:AppsFolder[\\/]([^\\/]+)$/iu.exec(value.trim())
  return Boolean(match?.[1] && APP_USER_MODEL_ID_PATTERN.test(match[1]))
}

function executableName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path
}

export function parseWindowsAppPathsOutput(output: string): ShortcutEntry[] {
  const entries: ShortcutEntry[] = []
  let currentName: string | undefined
  for (const line of output.split(/\r?\n/u)) {
    const keyMatch = APP_PATHS_KEY_PATTERN.exec(line.trim())
    if (keyMatch?.[1]) {
      currentName = keyMatch[1].replace(/\.exe$/iu, '')
      continue
    }
    if (!currentName) continue
    const valueMatch = APP_PATHS_VALUE_PATTERN.exec(line)
    if (!valueMatch?.[1]) continue
    const path = valueMatch[1].trim().replace(/^"|"$/gu, '')
    if (!WINDOWS_EXECUTABLE_PATH_PATTERN.test(path)) continue
    entries.push({
      displayName: currentName,
      path,
      metadata: { platform: 'windows', executableName: executableName(path) },
    })
    currentName = undefined
  }
  return entries
}

export function parseWindowsStartAppsOutput(output: string): ShortcutEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output) as unknown
  } catch {
    return []
  }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  const entries: ShortcutEntry[] = []
  for (const record of records) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue
    const value = record as Record<string, unknown>
    const displayName = typeof value.Name === 'string' ? value.Name.trim() : ''
    const appUserModelId = typeof value.AppID === 'string' ? value.AppID.trim() : ''
    if (!displayName || displayName.length > 128 || !APP_USER_MODEL_ID_PATTERN.test(appUserModelId)) continue
    entries.push({
      displayName,
      path: `shell:AppsFolder\\${appUserModelId}`,
      metadata: { platform: 'windows', appUserModelId },
    })
  }
  return entries
}

export async function discoverWindowsAppPaths(
  runCommand: WindowsCommandRunner = defaultWindowsCommandRunner,
  platform = process.platform,
): Promise<ShortcutEntry[]> {
  if (platform !== 'win32') return []
  const registryRoots = [
    ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/reg:64'],
    ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/reg:32'],
    ['HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/reg:64'],
    ['HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/reg:32'],
  ] as const
  const outputs = await Promise.all(registryRoots.map(async ([root, view]) => {
    try {
      return await runCommand('reg.exe', [root, '/s', view])
    } catch {
      return ''
    }
  }))
  return mergeEntries(outputs.map(parseWindowsAppPathsOutput))
}

const START_APPS_COMMAND = '$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'

export async function discoverWindowsStoreApps(
  runCommand: WindowsCommandRunner = defaultWindowsCommandRunner,
  platform = process.platform,
): Promise<ShortcutEntry[]> {
  if (platform !== 'win32') return []
  try {
    return parseWindowsStartAppsOutput(await runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      START_APPS_COMMAND,
    ]))
  } catch {
    return []
  }
}

export function defaultWindowsExecutableRoots(environment: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    environment.ProgramFiles,
    environment.ProgramW6432,
    environment['ProgramFiles(x86)'],
    environment.LOCALAPPDATA ? win32.join(environment.LOCALAPPDATA, 'Programs') : undefined,
  ]
  return candidates.filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
}

export async function discoverWindowsStandaloneExecutables(
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ShortcutEntry[]> {
  if (platform !== 'win32') return []
  return scanStandaloneExecutables(defaultWindowsExecutableRoots(environment))
}

function shouldSkipWindowsDirectory(name: string): boolean {
  return name.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(name.toLocaleLowerCase())
}

async function walkStandaloneExecutables(root: string, depth: number, entries: ShortcutEntry[]): Promise<void> {
  if (depth > MAX_STANDALONE_DEPTH || entries.length >= MAX_STANDALONE_ENTRIES) return
  let children
  try {
    children = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const child of [...children].sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entries.length >= MAX_STANDALONE_ENTRIES) return
    if (child.isDirectory()) {
      if (!shouldSkipWindowsDirectory(child.name)) await walkStandaloneExecutables(join(root, child.name), depth + 1, entries)
      continue
    }
    if (!child.isFile() || !/\.exe$/iu.test(parse(child.name).ext)) continue
    const executablePath = join(root, child.name)
    entries.push({
      displayName: parse(child.name).name,
      path: executablePath,
      metadata: { platform: 'windows', executableName: child.name },
    })
  }
}

export async function scanStandaloneExecutables(roots: readonly string[]): Promise<ShortcutEntry[]> {
  const entries: ShortcutEntry[] = []
  for (const root of roots) await walkStandaloneExecutables(root, 0, entries)
  return entries
}

function mergeEntries(groups: readonly (readonly ShortcutEntry[])[]): ShortcutEntry[] {
  const entries = new Map<string, ShortcutEntry>()
  for (const group of groups) {
    for (const entry of group) {
      const key = entry.path.toLocaleLowerCase()
      const previous = entries.get(key)
      if (!previous) {
        entries.set(key, entry)
        continue
      }
      const metadata = entry.metadata ?? previous.metadata
      entries.set(key, metadata ? { ...previous, ...entry, metadata } : { ...previous, ...entry })
    }
  }
  return [...entries.values()]
}

export async function scanWindowsApplications(
  roots: readonly string[] = defaultShortcutRoots(),
  discovery: WindowsApplicationDiscovery = {},
): Promise<ShortcutIndex> {
  const shortcuts = await (discovery.scanShortcuts ?? scanShortcutDirectories)(roots)
  const [appPaths, storeApps, standaloneExecutables] = await Promise.all([
    (discovery.discoverAppPaths ?? (() => discoverWindowsAppPaths()))(),
    (discovery.discoverStoreApps ?? (() => discoverWindowsStoreApps()))(),
    (discovery.discoverStandaloneExecutables ?? (() => discoverWindowsStandaloneExecutables()))(),
  ])
  return createShortcutIndex(mergeEntries([shortcuts.entries, appPaths, storeApps, standaloneExecutables]))
}

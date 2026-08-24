import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

type DirectoryEntry = {
  name: string
  isDirectory: () => boolean
}

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

async function iconInDirectory(directory: string): Promise<string | undefined> {
  const entries = await readDirectory(directory)
  const icons = entries
    .filter((entry) => !entry.isDirectory() && (/\.icns$/iu.test(entry.name) || /^(?:AppIcon|icon).*\.png$/iu.test(entry.name)))
    .sort((left, right) => iconPriority(left.name) - iconPriority(right.name) || left.name.localeCompare(right.name, 'en'))
  return icons[0] ? join(directory, icons[0].name) : undefined
}

export async function findApplicationIconPath(applicationPath: string, depth = 0): Promise<string | undefined> {
  if (depth > 2) return undefined

  const directIcon = await iconInDirectory(applicationPath)
  if (directIcon) return directIcon

  for (const directory of [join(applicationPath, 'Contents'), join(applicationPath, 'Contents', 'Resources')]) {
    const icon = await iconInDirectory(directory)
    if (icon) return icon
  }

  const entries = await readDirectory(applicationPath)
  for (const entry of entries) {
    if (!entry.isDirectory() || (entry.name !== 'Wrapper' && !entry.name.endsWith('.app'))) continue
    const icon = await findApplicationIconPath(join(applicationPath, entry.name), depth + 1)
    if (icon) return icon
  }

  return undefined
}

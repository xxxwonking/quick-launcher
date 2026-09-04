import * as childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, stat, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'

type LoadedImage = {
  isEmpty: () => boolean
  resize: (size: { width: number; height: number }) => { toDataURL: () => string }
}

type ImageLoader = (path: string) => LoadedImage
type ImageConverter = (source: string, destination: string) => Promise<void>

async function convertImageWithSips(source: string, destination: string): Promise<void> {
  await promisify(childProcess.execFile)('/usr/bin/sips', ['-s', 'format', 'png', source, '--out', destination], {
    timeout: 5_000,
  })
}

async function cachedPngPath(iconPath: string, cacheDirectory: string): Promise<string> {
  const metadata = await stat(iconPath)
  const key = createHash('sha256')
    .update(`${iconPath}\0${metadata.size}\0${metadata.mtimeMs}`)
    .digest('hex')
    .slice(0, 24)
  return join(cacheDirectory, `${key}.png`)
}

export async function loadMacIconData(
  iconPath: string,
  cacheDirectory: string,
  createFromPath: ImageLoader,
  convertImage: ImageConverter = convertImageWithSips,
): Promise<string | undefined> {
  const loadData = (path: string): string | undefined => {
    try {
      const image = createFromPath(path)
      if (image.isEmpty()) return undefined
      return image.resize({ width: 64, height: 64 }).toDataURL() || undefined
    } catch {
      return undefined
    }
  }

  if (extname(iconPath).toLocaleLowerCase() !== '.icns') {
    const directData = loadData(iconPath)
    if (directData) return directData
  }

  try {
    await mkdir(cacheDirectory, { recursive: true })
    const renderablePath = await cachedPngPath(iconPath, cacheDirectory)
    try {
      await access(renderablePath)
    } catch {
      await convertImage(iconPath, renderablePath)
    }
    const iconData = loadData(renderablePath)
    if (!iconData) await unlink(renderablePath).catch(() => undefined)
    return iconData
  } catch {
    return undefined
  }
}

export async function loadFirstMacIconData(
  iconPaths: readonly string[],
  cacheDirectory: string,
  createFromPath: ImageLoader,
  convertImage: ImageConverter = convertImageWithSips,
): Promise<string | undefined> {
  for (const iconPath of iconPaths) {
    const iconData = await loadMacIconData(iconPath, cacheDirectory, createFromPath, convertImage)
    if (iconData) return iconData
  }
  return undefined
}

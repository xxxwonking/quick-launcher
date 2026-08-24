import * as childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'

type LoadedImage = {
  isEmpty: () => boolean
  resize: (size: { width: number; height: number }) => { toDataURL: () => string }
}

type ImageLoader = (path: string) => LoadedImage
type IcnsConverter = (source: string, destination: string) => Promise<void>

async function convertIcnsWithSips(source: string, destination: string): Promise<void> {
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
  convertIcns: IcnsConverter = convertIcnsWithSips,
): Promise<string | undefined> {
  let renderablePath = iconPath
  if (extname(iconPath).toLocaleLowerCase() === '.icns') {
    await mkdir(cacheDirectory, { recursive: true })
    renderablePath = await cachedPngPath(iconPath, cacheDirectory)
    try {
      await access(renderablePath)
    } catch {
      await convertIcns(iconPath, renderablePath)
    }
  }

  const image = createFromPath(renderablePath)
  if (image.isEmpty()) return undefined
  return image.resize({ width: 64, height: 64 }).toDataURL() || undefined
}

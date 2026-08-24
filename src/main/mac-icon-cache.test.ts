import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMacIconData } from './mac-icon-cache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('macOS icon cache', () => {
  it('converts icns files to cached png data before rendering', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-cache-'))
    temporaryDirectories.push(directory)
    const iconPath = join(directory, 'icon.icns')
    const cacheDirectory = join(directory, 'cache')
    await writeFile(iconPath, 'icns data')
    const convertIcns = vi.fn(async (_source: string, destination: string) => {
      await mkdir(cacheDirectory, { recursive: true })
      await writeFile(destination, 'png data')
    })
    const createFromPath = vi.fn().mockReturnValue({
      isEmpty: () => false,
      resize: () => ({ toDataURL: () => 'data:image/png;base64,qq-icon' }),
    })

    const iconData = await loadMacIconData(iconPath, cacheDirectory, createFromPath, convertIcns)

    expect(convertIcns).toHaveBeenCalledWith(iconPath, expect.stringMatching(/\.png$/u))
    expect(createFromPath).toHaveBeenCalledWith(expect.stringMatching(/\.png$/u))
    expect(iconData).toBe('data:image/png;base64,qq-icon')
  })
})

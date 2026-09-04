import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFirstMacIconData, loadMacIconData } from './mac-icon-cache'

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

  it('normalizes png icons that Electron cannot decode directly', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-cache-'))
    temporaryDirectories.push(directory)
    const iconPath = join(directory, 'ios-app-icon.png')
    const cacheDirectory = join(directory, 'cache')
    await writeFile(iconPath, 'ios png data')
    const convertImage = vi.fn(async (_source: string, destination: string) => {
      await mkdir(cacheDirectory, { recursive: true })
      await writeFile(destination, 'normalized png data')
    })
    const createFromPath = vi.fn((path: string) => ({
      isEmpty: () => path === iconPath,
      resize: () => ({ toDataURL: () => 'data:image/png;base64,normalized-ios-icon' }),
    }))

    const iconData = await loadMacIconData(iconPath, cacheDirectory, createFromPath, convertImage)

    expect(createFromPath).toHaveBeenNthCalledWith(1, iconPath)
    expect(convertImage).toHaveBeenCalledWith(iconPath, expect.stringMatching(/\.png$/u))
    expect(createFromPath).toHaveBeenNthCalledWith(2, expect.stringMatching(/\.png$/u))
    expect(iconData).toBe('data:image/png;base64,normalized-ios-icon')
  })

  it('continues to normalization when direct PNG decoding throws', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-cache-'))
    temporaryDirectories.push(directory)
    const iconPath = join(directory, 'ios-app-icon.png')
    const cacheDirectory = join(directory, 'cache')
    await writeFile(iconPath, 'ios png data')
    const convertImage = vi.fn(async (_source: string, destination: string) => {
      await mkdir(cacheDirectory, { recursive: true })
      await writeFile(destination, 'normalized png data')
    })
    const createFromPath = vi.fn((path: string) => {
      if (path === iconPath) throw new Error('unsupported PNG encoding')
      return {
        isEmpty: () => false,
        resize: () => ({ toDataURL: () => 'data:image/png;base64,recovered-ios-icon' }),
      }
    })

    await expect(loadMacIconData(iconPath, cacheDirectory, createFromPath, convertImage)).resolves.toBe('data:image/png;base64,recovered-ios-icon')
    expect(convertImage).toHaveBeenCalledWith(iconPath, expect.stringMatching(/\.png$/u))
  })

  it('tries the next icon candidate when the first resource cannot be loaded', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-cache-'))
    temporaryDirectories.push(directory)
    const firstIconPath = join(directory, 'broken.icns')
    const secondIconPath = join(directory, 'fallback.png')
    await writeFile(firstIconPath, 'broken icon')
    await writeFile(secondIconPath, 'fallback icon')
    const createFromPath = vi.fn((path: string) => ({
      isEmpty: () => path === firstIconPath || path.includes('/cache/'),
      resize: () => ({ toDataURL: () => 'data:image/png;base64,fallback-icon' }),
    }))

    await expect(loadFirstMacIconData(
      [firstIconPath, secondIconPath],
      join(directory, 'cache'),
      createFromPath,
      vi.fn(),
    )).resolves.toBe('data:image/png;base64,fallback-icon')
    expect(createFromPath).toHaveBeenCalledWith(secondIconPath)
  })
})

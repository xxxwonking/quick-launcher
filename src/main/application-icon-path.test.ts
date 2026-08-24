import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findApplicationIconPath } from './application-icon-path'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('application icon paths', () => {
  it('finds the icon inside a wrapped application bundle', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'Shadowrocket.app')
    const iconPath = join(applicationPath, 'Wrapper', 'Shadowrocket.app', 'AppIcon60x60@2x.png')
    await mkdir(join(applicationPath, 'Wrapper', 'Shadowrocket.app'), { recursive: true })
    await writeFile(iconPath, 'test icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })

  it('prefers the bundle icns icon over a generic png resource', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'Example.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const iconPath = join(resourcesPath, 'AppIcon.icns')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(join(resourcesPath, 'icon.png'), 'generic icon')
    await writeFile(iconPath, 'bundle icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })

  it('uses an app-declared-style icns file even when it has a custom name', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'QQMiniApp.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const iconPath = join(resourcesPath, 'electron.icns')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(iconPath, 'bundle icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })
})
